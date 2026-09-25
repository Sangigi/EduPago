<?php
// lib/helpers_comisiones.php
//
// Motor del libro mayor de comisiones de distribuidor.
//
// Va en archivo aparte y no en lib/helpers_pagos.php porque ese ya pasa de 900
// lineas y se carga en los 4 webhooks de dinero; nada de esto hace falta ahi.
//
// LA REGLA QUE GOBIERNA TODO ESTE ARCHIVO:
//   Un mes cerrado NUNCA se reescribe.
// Si algo cambia despues del cierre (dinero que llego tarde, un cobro que se
// cancela), NO se toca el renglon congelado: se inserta un renglon de ajuste
// por la diferencia, usando la comision_pct CONGELADA de ese mes y nunca la
// tasa de hoy. Ese detalle es lo que hace imposible que editar el porcentaje
// mueva el pasado, ni siquiera por la puerta de atras.
//
// Ver migracion_2026_09_24_comisiones_devengo.sql.

// Desde que mes el devengo usa la base honesta ('ledger_mixto') en vez de la
// formula vieja. Antes de esta fecha se respeta 'legacy_total_cobro' para que
// la migracion no mueva ni un peso de lo que el sistema ya venia mostrando.
if (!defined('COMISION_LEDGER_DESDE')) define('COMISION_LEDGER_DESDE', '2026-10-01');

// A partir de que dia del mes siguiente se congela el mes anterior. Los dias
// de gracia son a proposito: confirmar_pago.php no toca cobros.fecha, asi que
// un cobro creado el 28-sep y confirmado a mano el 2-oct sigue imputandose a
// septiembre. Cerrando el dia 1 se habria quedado fuera.
if (!defined('COMISION_DIA_CIERRE')) define('COMISION_DIA_CIERRE', 3);


// Que regla de base le toca a un periodo. Se decide por FECHA y no por si el
// codigo nuevo ya esta desplegado: si se cambiara la base a media marcha, un
// mes saltaria de valor sin explicacion. El corte es por mes completo.
function comision_regla_de_periodo($periodo) {
    return ($periodo . '-01') >= COMISION_LEDGER_DESDE ? 'ledger_mixto' : 'legacy_total_cobro';
}

// Primer y ultimo dia de un periodo 'YYYY-MM'.
function comision_rango_periodo($periodo) {
    $ini = $periodo . '-01';
    return [$ini, date('Y-m-t', strtotime($ini))];
}


// Tramos de tasa que cubren un periodo, en orden.
//
// Normalmente devuelve UNO (el mes entero con la misma tasa). Si el porcentaje
// cambio a media semana, devuelve dos o mas: el mes se parte por dia, porque
// el devengo se imputa al dia en que entro el dinero.
function comision_tramos_en_periodo(PDO $pdo, $referido_id, $periodo) {
    $r = comision_rango_periodo($periodo);
    $ini = $r[0]; $fin = $r[1];

    // Todas las vigencias que se solapan con el mes. vigente_hasta NULL = la
    // que rige hoy, o sea que se extiende hasta el final del mes.
    $stmt = $pdo->prepare(
        "SELECT id, comision_pct, vigente_desde, vigente_hasta
           FROM distribuidor_comision_tasas
          WHERE referido_id = ?
            AND vigente_desde <= ?
            AND (vigente_hasta IS NULL OR vigente_hasta >= ?)
          ORDER BY vigente_desde"
    );
    $stmt->execute([intval($referido_id), $fin, $ini]);

    $tramos = [];
    foreach ($stmt->fetchAll() as $f) {
        // El tramo se recorta a los limites del mes.
        $desde = max($f['vigente_desde'], $ini);
        $hasta = $f['vigente_hasta'] === null ? $fin : min($f['vigente_hasta'], $fin);
        if ($desde > $hasta) continue;
        $tramos[] = [
            'tasa_id'      => intval($f['id']),
            'comision_pct' => floatval($f['comision_pct']),
            'desde'        => $desde,
            'hasta'        => $hasta,
        ];
    }

    // ── RED DE SEGURIDAD (25-sep-2026, hallada en revisión adversarial) ──
    //
    // Sin tramos, el foreach de comision_calcular_periodo() no itera ni una
    // vez y NO se emite renglón: el referido devenga $0.00 EN SILENCIO. Y en
    // cuanto el cron cierra el mes, ese cero queda congelado — el invariante
    // que protege el pasado es justo lo que impide corregirlo después.
    //
    // Eso le pasaba a TODO referido creado después de la migración: la siembra
    // de vigencias vivía solo en el PASO 6 del .sql, que corre una sola vez, y
    // ninguno de los cuatro caminos que dan de alta un referido la escribía.
    //
    // Ahora se cae a la columna cacheada distribuidor_referidos.comision_pct,
    // que es la que la pantalla ya muestra. El fallo queda A FAVOR del
    // distribuidor y no en su contra, y el panel deja de decir "5.00%" junto a
    // "$0.00" — que era la parte silenciosa del problema.
    //
    // Los cuatro caminos de alta también siembran la vigencia ahora, así que
    // esto no debería dispararse nunca. Es el cinturón además del tirante: un
    // quinto camino que alguien agregue mañana no puede volver a perder
    // dinero sin avisar.
    if (!$tramos) {
        $r = comision_rango_periodo($periodo);
        $cache = $pdo->prepare("SELECT comision_pct FROM distribuidor_referidos WHERE id = ?");
        $cache->execute([intval($referido_id)]);
        $pctCache = $cache->fetchColumn();
        if ($pctCache !== false) {
            log_api("comision: referido #$referido_id sin vigencia en $periodo, se usa el cache ($pctCache%). Revisa distribuidor_comision_tasas.");
            $tramos[] = [
                // tasa_id NULL: no hay vigencia real detrás. En MySQL varios
                // NULL no chocan en el UNIQUE uq_devengo, así que esto NO
                // impide que después se registre la vigencia de verdad.
                'tasa_id'      => null,
                'comision_pct' => floatval($pctCache),
                'desde'        => $r[0],
                'hasta'        => $r[1],
            ];
        }
    }
    return $tramos;
}


// Base sobre la que se calcula la comision de un colegio en un rango de dias.
//
// DOS REGLAS, y la diferencia entre ellas no es cosmetica:
//
//  'legacy_total_cobro' - SUM(cobros.total) de los 'pagado', por cobros.fecha.
//      Es lo que el sistema uso hasta hoy. Se conserva para que los meses
//      anteriores a COMISION_LEDGER_DESDE sigan dando el mismo numero.
//
//  'ledger_mixto' - el dinero que DE VERDAD entro:
//      (a) los abonos de cobro_abonos, por su creado_en; mas
//      (b) los cobros pagados que NO tienen ningun renglon de abono, por su
//          cobros.fecha.
//      La mitad (b) es obligatoria: hay TRES caminos que marcan un cobro como
//      pagado sin escribir en el libro de abonos (confirmar_pago.php,
//      webhook_spei.php y helpers_pagos.php). Sin ella, esos cobros
//      comisionarian cero.
//      Ojo: da numeros DISTINTOS a la regla vieja y pueden ser MAYORES - un
//      cobro pendiente con abonos parciales hoy comisiona cero y con esta
//      regla comisiona lo abonado.
function comision_base_en_rango(PDO $pdo, $escuela_id, $desde, $hasta, $regla) {
    $escuela_id = intval($escuela_id);
    if (!$escuela_id) return 0.0;

    if ($regla === 'legacy_total_cobro') {
        $stmt = $pdo->prepare(
            "SELECT COALESCE(SUM(total), 0) FROM cobros
              WHERE escuela_id = ? AND estado = 'pagado' AND fecha BETWEEN ? AND ?"
        );
        $stmt->execute([$escuela_id, $desde, $hasta]);
        return round(floatval($stmt->fetchColumn()), 2);
    }

    // (a) Abonos. Se une con cobros para sacar la escuela de ahi:
    // cobro_abonos.escuela_id admite NULL y no es confiable como filtro.
    // Se excluyen los cobros cancelados: ese dinero se devolvio.
    $stmtA = $pdo->prepare(
        "SELECT COALESCE(SUM(a.monto), 0)
           FROM cobro_abonos a
           JOIN cobros c ON c.id = a.cobro_id
          WHERE c.escuela_id = ?
            AND c.estado <> 'cancelado'
            AND DATE(a.creado_en) BETWEEN ? AND ?"
    );
    $stmtA->execute([$escuela_id, $desde, $hasta]);
    $abonos = floatval($stmtA->fetchColumn());

    // (b) Cobros pagados SIN ningun abono registrado.
    $stmtB = $pdo->prepare(
        "SELECT COALESCE(SUM(c.total), 0)
           FROM cobros c
          WHERE c.escuela_id = ? AND c.estado = 'pagado'
            AND c.fecha BETWEEN ? AND ?
            AND NOT EXISTS (SELECT 1 FROM cobro_abonos a2 WHERE a2.cobro_id = c.id)"
    );
    $stmtB->execute([$escuela_id, $desde, $hasta]);
    $sinAbono = floatval($stmtB->fetchColumn());

    return round($abonos + $sinAbono, 2);
}


// Calcula el devengo de un periodo. UNA SOLA funcion para el mes abierto (en
// vivo) y para el cierre, a proposito: hoy el sistema tiene TRES calculos
// duplicados e independientes que pueden desacordar entre si
// (distribuidor_comisiones.php, distribuidor_datos.php y
// superadmin_listar_referidos.php).
//
// NO escribe nada. Devuelve renglones listos para congelar o para mostrar.
function comision_calcular_periodo(PDO $pdo, $periodo, $distribuidor_id = null) {
    $regla = comision_regla_de_periodo($periodo);

    // Sin filtro de estado: si un referido pasa a 'implementacion', su
    // historia NO debe desaparecer. Ese filtro solo aplica al mes abierto y lo
    // decide quien consulta, no este calculo.
    $sql = "SELECT r.id, r.distribuidor_id, r.escuela_id, r.nombre_colegio
              FROM distribuidor_referidos r
             WHERE r.escuela_id IS NOT NULL";
    $params = [];
    if ($distribuidor_id) { $sql .= " AND r.distribuidor_id = ?"; $params[] = intval($distribuidor_id); }
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $renglones = [];
    foreach ($stmt->fetchAll() as $r) {
        foreach (comision_tramos_en_periodo($pdo, $r['id'], $periodo) as $t) {
            $base = comision_base_en_rango($pdo, $r['escuela_id'], $t['desde'], $t['hasta'], $regla);
            // Se conserva el renglon aunque la base sea 0: deja constancia de
            // que el mes SE evaluo y dio cero, que no es lo mismo que "no se
            // cerro".
            $renglones[] = [
                'periodo'         => $periodo,
                'distribuidor_id' => intval($r['distribuidor_id']),
                'referido_id'     => intval($r['id']),
                'escuela_id'      => intval($r['escuela_id']),
                'nombre_colegio'  => $r['nombre_colegio'],
                'tasa_id'         => $t['tasa_id'],
                'comision_pct'    => $t['comision_pct'],
                'dias_desde'      => $t['desde'],
                'dias_hasta'      => $t['hasta'],
                'base_cobrada'    => $base,
                'comision'        => round($base * $t['comision_pct'] / 100, 2),
                'base_regla'      => $regla,
            ];
        }
    }
    return $renglones;
}


// Registra un cambio de porcentaje como una VIGENCIA nueva, en vez de pisar la
// columna. Cierra el tramo anterior el dia antes y actualiza el cache
// distribuidor_referidos.comision_pct si la vigencia nueva es la que rige hoy.
//
// RECHAZA una fecha que caiga en un mes ya cerrado: permitirlo seria justo la
// puerta trasera que todo este archivo existe para cerrar.
//
// Devuelve ['ok'=>bool, 'error'=>string|null, 'anterior'=>float|null].
function comision_registrar_vigencia(PDO $pdo, $referido_id, $pct_nuevo, $vigente_desde, $registrado_por = null, $origen = 'edicion_superadmin') {
    $referido_id = intval($referido_id);
    $pct_nuevo   = round(floatval($pct_nuevo), 2);

    if ($pct_nuevo < 0 || $pct_nuevo > 100) {
        return ['ok' => false, 'error' => 'El porcentaje debe estar entre 0 y 100.', 'anterior' => null];
    }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $vigente_desde)) {
        return ['ok' => false, 'error' => 'Fecha de vigencia invalida.', 'anterior' => null];
    }

    // El periodo de la fecha nueva no puede estar cerrado.
    $periodoNuevo = substr($vigente_desde, 0, 7);
    $chk = $pdo->prepare("SELECT periodo FROM comision_cierres WHERE periodo >= ? ORDER BY periodo LIMIT 1");
    $chk->execute([$periodoNuevo]);
    $choca = $chk->fetchColumn();
    if ($choca) {
        return ['ok' => false,
                'error' => "El mes $choca ya esta cerrado y no se puede cambiar. Elige una fecha posterior.",
                'anterior' => null];
    }

    $pdo->beginTransaction();
    try {
        // FOR UPDATE sobre el referido: dos ediciones simultaneas del mismo
        // porcentaje dejarian dos tramos solapados. Mismo blindaje que usa
        // invitacion_enviar.php.
        $lock = $pdo->prepare("SELECT id, distribuidor_id, escuela_id, comision_pct FROM distribuidor_referidos WHERE id = ? FOR UPDATE");
        $lock->execute([$referido_id]);
        $ref = $lock->fetch();
        if (!$ref) { $pdo->rollBack(); return ['ok' => false, 'error' => 'Referido no encontrado.', 'anterior' => null]; }

        $anterior = floatval($ref['comision_pct']);

        // El tramo vigente se cierra el dia ANTES de que arranque el nuevo.
        $diaAntes = date('Y-m-d', strtotime($vigente_desde . ' -1 day'));
        $pdo->prepare(
            "UPDATE distribuidor_comision_tasas
                SET vigente_hasta = ?
              WHERE referido_id = ? AND vigente_hasta IS NULL AND vigente_desde <= ?"
        )->execute([$diaAntes, $referido_id, $diaAntes]);

        // ON DUPLICATE KEY: si ya hubo un cambio ESE MISMO DIA, manda el
        // ultimo en vez de crear un tramo solapado. Los dos quedan en el log.
        $pdo->prepare(
            "INSERT INTO distribuidor_comision_tasas
                (referido_id, distribuidor_id, escuela_id, comision_pct,
                 vigente_desde, vigente_hasta, origen, registrado_por)
             VALUES (?,?,?,?,?,NULL,?,?)
             ON DUPLICATE KEY UPDATE comision_pct = VALUES(comision_pct),
                                     vigente_hasta = NULL,
                                     origen = VALUES(origen),
                                     registrado_por = VALUES(registrado_por)"
        )->execute([
            $referido_id, intval($ref['distribuidor_id']), $ref['escuela_id'] ?: null,
            $pct_nuevo, $vigente_desde, $origen,
            $registrado_por ? intval($registrado_por) : null,
        ]);

        // El cache solo se actualiza si la vigencia YA rige. Con una fecha
        // futura, distribuidor_referidos.comision_pct tiene que seguir
        // mostrando la tasa de hoy hasta que llegue ese dia.
        if ($vigente_desde <= date('Y-m-d')) {
            $pdo->prepare("UPDATE distribuidor_referidos SET comision_pct = ? WHERE id = ?")
                ->execute([$pct_nuevo, $referido_id]);
        }

        $pdo->commit();
        return ['ok' => true, 'error' => null, 'anterior' => $anterior];
    } catch (\PDOException $e) {
        $pdo->rollBack();
        return ['ok' => false, 'error' => 'No se pudo registrar la vigencia: ' . $e->getMessage(), 'anterior' => null];
    }
}


// Congela UN periodo. Idempotente: el UNIQUE de comision_cierres hace que el
// segundo intento no escriba nada.
//
// Devuelve ['ok'=>bool,'error'=>?,'renglones'=>int,'total'=>float].
function comision_cerrar_periodo(PDO $pdo, $periodo, $cerrado_por = null, $origen = 'cierre_cron') {
    if (!preg_match('/^\d{4}-\d{2}$/', (string) $periodo)) {
        return ['ok' => false, 'error' => 'Periodo invalido (formato YYYY-MM).', 'renglones' => 0, 'total' => 0.0];
    }
    // Nunca el mes en curso ni uno futuro: todavia puede entrar dinero.
    if ($periodo >= date('Y-m')) {
        return ['ok' => false, 'error' => 'Solo se pueden cerrar meses ya terminados.', 'renglones' => 0, 'total' => 0.0];
    }

    $ya = $pdo->prepare("SELECT id FROM comision_cierres WHERE periodo = ?");
    $ya->execute([$periodo]);
    if ($ya->fetch()) {
        return ['ok' => true, 'error' => null, 'renglones' => 0, 'total' => 0.0, 'ya_estaba' => true];
    }

    $renglones = comision_calcular_periodo($pdo, $periodo);
    $regla = comision_regla_de_periodo($periodo);
    $total = 0.0;

    $pdo->beginTransaction();
    try {
        $ins = $pdo->prepare(
            "INSERT INTO comision_devengos
               (periodo, distribuidor_id, referido_id, escuela_id, nombre_colegio,
                tipo, tasa_id, comision_pct, dias_desde, dias_hasta,
                base_cobrada, comision, base_regla, origen, cerrado_por)
             VALUES (?,?,?,?,?, 'devengo', ?,?,?,?, ?,?,?,?,?)"
        );
        foreach ($renglones as $r) {
            $ins->execute([
                $r['periodo'], $r['distribuidor_id'], $r['referido_id'], $r['escuela_id'], $r['nombre_colegio'],
                $r['tasa_id'], $r['comision_pct'], $r['dias_desde'], $r['dias_hasta'],
                $r['base_cobrada'], $r['comision'], $r['base_regla'], $origen,
                $cerrado_por ? intval($cerrado_por) : null,
            ]);
            $total += $r['comision'];
        }

        // El cierre se escribe AL FINAL: si algo revienta a media lista, la
        // transaccion revierte y el mes sigue sin cerrar, en vez de quedar
        // marcado como cerrado con la mitad de los renglones.
        $pdo->prepare(
            "INSERT INTO comision_cierres
               (periodo, base_regla, referidos_evaluados, renglones, total_devengado, cerrado_por, origen)
             VALUES (?,?,?,?,?,?,?)"
        )->execute([
            $periodo, $regla, count($renglones), count($renglones), round($total, 2),
            $cerrado_por ? intval($cerrado_por) : null, $origen,
        ]);

        $pdo->commit();
        return ['ok' => true, 'error' => null, 'renglones' => count($renglones), 'total' => round($total, 2)];
    } catch (\PDOException $e) {
        $pdo->rollBack();
        return ['ok' => false, 'error' => $e->getMessage(), 'renglones' => 0, 'total' => 0.0];
    }
}


// Cierra TODOS los periodos vencidos que falten, del mas viejo al mas nuevo.
// Si el cron se cae una semana, el siguiente dia se pone al corriente solo.
//
// Se protege con GET_LOCK sin espera: si el cron y el boton manual coinciden,
// el segundo no hace nada en vez de duplicar renglones.
function comision_cerrar_pendientes(PDO $pdo, $cerrado_por = null, $origen = 'cierre_cron') {
    $lock = $pdo->query("SELECT GET_LOCK('comisiones_cierre', 0)")->fetchColumn();
    if (intval($lock) !== 1) return ['cerrados' => [], 'omitido' => 'otro cierre en curso'];

    $cerrados = [];
    try {
        // Antes del dia COMISION_DIA_CIERRE del mes siguiente no se cierra
        // nada: son los dias de gracia para los pagos confirmados a mano.
        if (intval(date('j')) < COMISION_DIA_CIERRE) {
            return ['cerrados' => [], 'omitido' => 'dentro de los dias de gracia'];
        }

        // Desde el primer cobro pagado que exista, no desde una fecha fija.
        $desde = $pdo->query("SELECT MIN(fecha) FROM cobros WHERE estado = 'pagado'")->fetchColumn();
        if (!$desde) return ['cerrados' => [], 'omitido' => 'sin cobros pagados'];

        $p = date('Y-m', strtotime($desde));
        $tope = date('Y-m');
        // Guarda contra un bucle infinito si alguna fecha viniera corrupta.
        $vueltas = 0;
        while ($p < $tope && $vueltas < 240) {
            $vueltas++;
            $ya = $pdo->prepare("SELECT id FROM comision_cierres WHERE periodo = ?");
            $ya->execute([$p]);
            if (!$ya->fetch()) {
                $res = comision_cerrar_periodo($pdo, $p, $cerrado_por, $origen);
                if ($res['ok'] && empty($res['ya_estaba'])) $cerrados[] = ['periodo' => $p, 'total' => $res['total']];
            }
            $p = date('Y-m', strtotime($p . '-01 +1 month'));
        }
    } finally {
        // El lock se suelta SIEMPRE, incluso si algo revienta a media lista.
        $pdo->query("SELECT RELEASE_LOCK('comisiones_cierre')");
    }
    return ['cerrados' => $cerrados, 'omitido' => null];
}


// Recalcula la columna cacheada monto_liquidado de un devengo DESDE el detalle
// de liquidaciones. Nunca se incrementa sobre el valor anterior: misma regla
// de oro que cobros.monto_pagado en lib/helpers_pagos.php.
function comision_recalcular_liquidado(PDO $pdo, $devengo_id) {
    $pdo->prepare(
        "UPDATE comision_devengos
            SET monto_liquidado = (
                  SELECT COALESCE(SUM(monto_aplicado), 0)
                    FROM comision_liquidacion_detalle WHERE devengo_id = ?)
          WHERE id = ?"
    )->execute([intval($devengo_id), intval($devengo_id)]);
}


// Siembra la vigencia INICIAL de un referido recién creado.
//
// Se extrae como función propia justamente porque hay CUATRO caminos que dan
// de alta (o activan) un referido, y la revisión adversarial encontró que
// ninguno sembraba la vigencia:
//   · acciones/invitacion_enviar.php        (registro público, sin sesión)
//   · acciones/invitacion_resolver.php      (aprobación manual)
//   · acciones/distribuidor_invitar_colegio.php
//   · acciones/superadmin_editar_referido.php  (al asignarle escuela_id a un
//                                               prospecto que no la tenía)
// Con una función compartida, un quinto camino que alguien agregue mañana
// tiene un solo lugar al que llamar.
//
// Es IDEMPOTENTE: si el referido ya tiene vigencia, no hace nada. Así se puede
// llamar sin miedo desde un flujo que quizá ya la sembró.
//
// NUNCA lanza. Un fallo aquí no puede tumbar el alta de un colegio: el motor
// tiene su propia red de seguridad (ver comision_tramos_en_periodo) y esto
// queda anotado en api_log.txt.
function comision_sembrar_vigencia_inicial(PDO $pdo, $referido_id, $registrado_por = null) {
    $referido_id = intval($referido_id);
    if (!$referido_id) return false;
    try {
        $chk = $pdo->prepare("SELECT id FROM distribuidor_comision_tasas WHERE referido_id = ? LIMIT 1");
        $chk->execute([$referido_id]);
        if ($chk->fetch()) return false;   // ya tiene, no se toca

        $ref = $pdo->prepare("SELECT distribuidor_id, escuela_id, comision_pct, fecha_alta FROM distribuidor_referidos WHERE id = ?");
        $ref->execute([$referido_id]);
        $r = $ref->fetch();
        if (!$r) return false;

        // vigente_desde = la fecha de alta del referido, no CURDATE(): si el
        // referido se creó el 3 y esto corre el 20, el dinero de los días 3 al
        // 19 tiene que quedar cubierto igual.
        $desde = $r['fecha_alta'] ?: date('Y-m-d');

        $pdo->prepare(
            "INSERT INTO distribuidor_comision_tasas
               (referido_id, distribuidor_id, escuela_id, comision_pct,
                vigente_desde, vigente_hasta, origen, motivo, registrado_por)
             VALUES (?,?,?,?,?,NULL,'alta_referido',?,?)"
        )->execute([
            $referido_id, intval($r['distribuidor_id']), $r['escuela_id'] ?: null,
            floatval($r['comision_pct']), $desde,
            'Vigencia inicial sembrada al dar de alta el referido',
            $registrado_por ? intval($registrado_por) : null,
        ]);
        return true;
    } catch (\PDOException $e) {
        // La migración del libro puede no haber corrido todavía. Que el alta
        // del colegio siga funcionando es más importante que sembrar esto.
        log_api('comision_sembrar_vigencia_inicial (referido ' . $referido_id . '): ' . $e->getMessage());
        return false;
    }
}
