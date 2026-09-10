<?php
/**
 * cron_recordatorios.php — Job diario, solo por línea de comandos (Cron Jobs
 * de Hostinger). Ver PRODUCCION.md para cómo programarlo.
 *
 * Envía por correo:
 *  0) Pagos recurrentes (productos.tipo='recurrente'): genera el cobro del
 *     periodo (mensual/semestral/anual) para cada alumno activo, avisa 1 día
 *     antes de que cierre la ventana de pago (día 1-5 del mes por defecto,
 *     configurable por concepto), y aplica el recargo por pago tardío
 *     (único, no escalable) una sola vez por cobro.
 *  1) Aviso de vencimiento de la suscripción (plan SaaS) del colegio, 7 y 5
 *     días antes de `escuelas.fecha_vencimiento_plan`.
 *  2) Recordatorios de cobros pendientes NO recurrentes a la familia/cliente.
 *     Si el cobro tiene una fecha de vencimiento real, usa el mismo criterio
 *     de urgencia que views/Recordatorios.js (3 días antes, el día que
 *     vence, 1 día después). Si no (caso actual: crear_cobro no guarda
 *     vencimiento, solo fecha de creación), avisa: día 0 = aviso neutral de
 *     cobro nuevo, día 3 = recordatorio, día 7 = urgente.
 *
 * No requiere autenticación: no se expone a través del navegador/api.php,
 * solo se ejecuta por CLI.
 */
if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    exit("Este script solo puede ejecutarse por línea de comandos (cron).\n");
}

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/mailer.php';
require_once __DIR__ . '/lib/helpers_pagos.php';

// Dias de aviso previo antes de aplicar un cargo automatico. Define
// CAI_DIAS_AVISO en config.php para cambiarlo sin tocar este archivo.
if (!defined('CAI_DIAS_AVISO')) define('CAI_DIAS_AVISO', 3);

// Debe reflejar PLANES_LIMITES en api.php — la única fuente de verdad real
// (límites/permisos) es el backend; aquí solo se usa para el texto del correo.
$PLAN_INFO = [
    'basico'   => ['precio' => 999.00,  'label' => 'Básico'],
    'avanzado' => ['precio' => 1500.00, 'label' => 'Avanzado'],
    'pro'      => ['precio' => 3000.00, 'label' => 'Pro'],
];

$hoyStr = date('Y-m-d');
$hoyTs  = strtotime($hoyStr);
$resumen = [];

// ══════════════════════════════════════════════════════════════════════════
// 0) PAGOS RECURRENTES: genera el cobro del periodo (colegiatura mensual/
//    semestral/anual), avisa 1 día antes de que cierre la ventana sin
//    recargo, y aplica el recargo por pago tardío (una sola vez por cobro).
// ══════════════════════════════════════════════════════════════════════════
try {
    $hoyDiaMes = (int) date('j');
    $mesActual = date('Y-m-01');

    $stmtProd = $pdo->query("SELECT * FROM productos WHERE tipo = 'recurrente' AND activo = 1");
    foreach ($stmtProd->fetchAll() as $prod) {
        if (empty($prod['fecha_inicio']) || empty($prod['periodicidad_meses'])) continue;
        if (strtotime($prod['fecha_inicio']) > strtotime($hoyStr)) continue; // todavía no empieza
        if ($prod['ultima_generacion'] === $mesActual) continue; // ya se revisó/generó este mes

        $mesInicio = date('Y-m-01', strtotime($prod['fecha_inicio']));
        $mesesTranscurridos =
            (intval(date('Y', strtotime($mesActual))) - intval(date('Y', strtotime($mesInicio)))) * 12
            + (intval(date('n', strtotime($mesActual))) - intval(date('n', strtotime($mesInicio))));
        if ($mesesTranscurridos < 0 || $mesesTranscurridos % intval($prod['periodicidad_meses']) !== 0) {
            continue; // este mes calendario no corresponde a un periodo de cobro
        }
        if ($hoyDiaMes < intval($prod['dia_ventana_inicio'])) {
            continue; // este mes sí toca, pero aún no llega el día en que abre la ventana (no marca ultima_generacion: se reintenta mañana)
        }

        $escStmt = $pdo->prepare("SELECT clave FROM escuelas WHERE id = ?");
        $escStmt->execute([$prod['escuela_id']]);
        $clave = $escStmt->fetch()['clave'] ?? 'ESC';

        $stmtAlumnos = $pdo->prepare("SELECT id, nombre, email, familia_id FROM clientes WHERE escuela_id = ? AND tipo = 'alumno' AND activo = 1");
        $stmtAlumnos->execute([$prod['escuela_id']]);
        foreach ($stmtAlumnos->fetchAll() as $al) {
            $chkGen = $pdo->prepare("SELECT 1 FROM pagos_recurrentes_generados WHERE producto_id = ? AND cliente_id = ? AND periodo = ?");
            $chkGen->execute([$prod['id'], $al['id'], $mesActual]);
            if ($chkGen->fetch()) continue; // este alumno ya tiene su cobro de este periodo

            $cntStmt = $pdo->prepare("SELECT COUNT(*) AS n FROM cobros WHERE escuela_id = ?");
            $cntStmt->execute([$prod['escuela_id']]);
            $folio = $clave . '-' . str_pad(intval($cntStmt->fetch()['n'] ?? 0) + 1, 4, '0', STR_PAD_LEFT);

            try {
                $pdo->beginTransaction();
                $pdo->prepare(
                    "INSERT INTO cobros (escuela_id, cliente_id, folio, total, metodo, estado, fecha)
                     VALUES (?, ?, ?, ?, 'Pendiente', 'pendiente', CURDATE())"
                )->execute([$prod['escuela_id'], $al['id'], $folio, $prod['precio']]);
                $cobroId = intval($pdo->lastInsertId());
                $pdo->prepare(
                    "INSERT INTO pagos_recurrentes_generados (producto_id, cliente_id, periodo, cobro_id) VALUES (?, ?, ?, ?)"
                )->execute([$prod['id'], $al['id'], $mesActual, $cobroId]);
                try {
                    $pdo->prepare(
                        "INSERT INTO cobro_items (cobro_id, producto_id, nombre, cantidad, precio_unitario, subtotal)
                         VALUES (?, ?, ?, 1, ?, ?)"
                    )->execute([$cobroId, $prod['id'], $prod['nombre'], $prod['precio'], $prod['precio']]);
                } catch (\PDOException $eItem) { /* cobro_items es opcional (ver crear_cobro), no crítico */ }
                // CRÍTICO: Portal Familia no lee `cobros` en vivo, muestra
                // `clientes.saldo_pendiente` (igual que hace crear_cobro en
                // api.php) — sin esto, el cobro recurrente nunca aparece para pagar.
                recalcular_saldo_pendiente($pdo, intval($al['id']));
                $pdo->commit();

                $emailAl = $al['email'];
                if (!$emailAl && $al['familia_id']) {
                    $famStmt = $pdo->prepare("SELECT email FROM familias WHERE id = ?");
                    $famStmt->execute([$al['familia_id']]);
                    $emailAl = $famStmt->fetch()['email'] ?? null;
                }
                if ($emailAl) {
                    $totalFmt = '$' . number_format((float)$prod['precio'], 2) . ' MXN';
                    $asunto = "Nuevo cobro: " . $prod['nombre'];
                    $html = "
                        <p>Hola,</p>
                        <p>Se generó el cobro de <strong>" . htmlspecialchars($prod['nombre']) . "</strong> por <strong>$totalFmt</strong> para " . htmlspecialchars($al['nombre']) . ".</p>
                        <p>Tienes del día {$prod['dia_ventana_inicio']} al {$prod['dia_ventana_fin']} de este mes para pagarlo sin recargo.</p>
                        <p>— Pagalaescuela</p>
                    ";
                    $r = enviar_correo($emailAl, $asunto, $html);
                    if ($r['success']) {
                        $pdo->prepare(
                            "INSERT INTO recordatorios (escuela_id, cobro_id, cliente, fecha, canal) VALUES (?, ?, ?, ?, 'email_automatico') ON DUPLICATE KEY UPDATE canal = canal"
                        )->execute([$prod['escuela_id'], $cobroId, $al['nombre'], $hoyStr]);
                        $resumen[] = "OK cobro recurrente generado #$cobroId ({$prod['nombre']}) -> $emailAl";
                    } else {
                        $resumen[] = "ERROR correo de cobro recurrente #$cobroId: " . $r['error'];
                    }
                } else {
                    $resumen[] = "AVISO: cobro recurrente #$cobroId generado sin correo de destino (alumno #{$al['id']} sin email propio ni familiar).";
                }
            } catch (\PDOException $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                // Probable carrera con otra corrida del cron en paralelo; el UNIQUE
                // KEY de pagos_recurrentes_generados evita duplicar el cobro.
            }
        }
        $pdo->prepare("UPDATE productos SET ultima_generacion = ? WHERE id = ?")->execute([$mesActual, $prod['id']]);
    }

    // --- Aviso 1 día antes de que cierre la ventana de pago sin recargo ---
    $stmtPreVenc = $pdo->query(
        "SELECT co.id, co.total, co.escuela_id, cl.email AS cliente_email, cl.nombre AS cliente_nombre, fa.email AS familia_email,
                p.nombre AS producto_nombre, p.dia_ventana_fin
         FROM cobros co
         JOIN pagos_recurrentes_generados prg ON prg.cobro_id = co.id
         JOIN productos p ON p.id = prg.producto_id
         LEFT JOIN clientes cl ON cl.id = co.cliente_id
         LEFT JOIN familias fa ON fa.id = cl.familia_id
         WHERE co.estado = 'pendiente' AND co.recargo_aplicado = 0"
    );
    foreach ($stmtPreVenc->fetchAll() as $c) {
        if ($hoyDiaMes !== intval($c['dia_ventana_fin']) - 1) continue; // solo el día antes de que cierre
        $emailDestino = $c['cliente_email'] ?: $c['familia_email'];
        if (!$emailDestino) continue;
        $chk = $pdo->prepare("SELECT 1 FROM recordatorios WHERE cobro_id = ? AND fecha = ?");
        $chk->execute([$c['id'], $hoyStr]);
        if ($chk->fetch()) continue;
        $totalFmt = '$' . number_format((float)$c['total'], 2) . ' MXN';
        $asunto = "Mañana vence tu plazo para pagar sin recargo";
        $html = "
            <p>Hola,</p>
            <p>Mañana (día {$c['dia_ventana_fin']}) es el último día para pagar <strong>" . htmlspecialchars($c['producto_nombre']) . "</strong> (<strong>$totalFmt</strong>) sin recargo.</p>
            <p>— Pagalaescuela</p>
        ";
        $r = enviar_correo($emailDestino, $asunto, $html);
        if ($r['success']) {
            $pdo->prepare("INSERT INTO recordatorios (escuela_id, cobro_id, cliente, fecha, canal) VALUES (?, ?, ?, ?, 'email_automatico') ON DUPLICATE KEY UPDATE canal = canal")
                ->execute([$c['escuela_id'], $c['id'], $c['cliente_nombre'], $hoyStr]);
            $resumen[] = "OK aviso pre-vencimiento cobro #{$c['id']} -> $emailDestino";
        } else {
            $resumen[] = "ERROR aviso pre-vencimiento cobro #{$c['id']}: " . $r['error'];
        }
    }

    // --- Recargo por pago tardío (único, no escalable — se aplica una sola vez) ---
    $stmtPend = $pdo->query(
        "SELECT co.id, co.total, co.escuela_id, co.cliente_id, cl.email AS cliente_email, cl.nombre AS cliente_nombre, fa.email AS familia_email,
                p.nombre AS producto_nombre, p.dia_ventana_fin, p.penalizacion_tipo, p.penalizacion_valor
         FROM cobros co
         JOIN pagos_recurrentes_generados prg ON prg.cobro_id = co.id
         JOIN productos p ON p.id = prg.producto_id
         LEFT JOIN clientes cl ON cl.id = co.cliente_id
         LEFT JOIN familias fa ON fa.id = cl.familia_id
         WHERE co.estado = 'pendiente' AND co.recargo_aplicado = 0 AND p.penalizacion_tipo IS NOT NULL"
    );
    foreach ($stmtPend->fetchAll() as $row) {
        if ($hoyDiaMes <= intval($row['dia_ventana_fin'])) continue; // todavía dentro de la ventana sin recargo
        $recargo = $row['penalizacion_tipo'] === 'porcentaje'
            ? round(floatval($row['total']) * floatval($row['penalizacion_valor']) / 100, 2)
            : floatval($row['penalizacion_valor']);
        if ($recargo <= 0) continue;
        // Repite las mismas condiciones del SELECT en el propio UPDATE (compare-
        // and-swap): sin esto, dos corridas del cron traslapadas —o un pago que
        // llega justo entre el SELECT y este UPDATE— podían duplicar el recargo
        // o inflar el total de un cobro que ya quedó "pagado".
        $stmtRecargo = $pdo->prepare(
            "UPDATE cobros SET total = total + ?, recargo_aplicado = 1, recargo_monto = ?
             WHERE id = ? AND recargo_aplicado = 0 AND estado = 'pendiente'"
        );
        $stmtRecargo->execute([$recargo, $recargo, $row['id']]);
        if ($stmtRecargo->rowCount() === 0) {
            $resumen[] = "AVISO: cobro #{$row['id']} ya no era pendiente/sin recargo al momento de aplicarlo (otro proceso lo adelantó) — se omite.";
            continue;
        }
        if ($row['cliente_id']) {
            // El recargo sube `cobros.total` — hay que refrescar el saldo
            // cacheado en `clientes.saldo_pendiente` (lo que muestra/cobra
            // Portal Familia), si no, la familia paga el monto viejo sin recargo.
            recalcular_saldo_pendiente($pdo, intval($row['cliente_id']));
        }
        $nuevoTotal = floatval($row['total']) + $recargo;
        $emailDestino = $row['cliente_email'] ?: $row['familia_email'];
        if ($emailDestino) {
            $asunto = "Se aplicó un recargo a tu pago pendiente";
            $html = "
                <p>Hola,</p>
                <p>El pago de <strong>" . htmlspecialchars($row['producto_nombre']) . "</strong> venció el día {$row['dia_ventana_fin']} sin recibirse, así que se aplicó un recargo de <strong>$" . number_format($recargo, 2) . " MXN</strong>.</p>
                <p>Tu nuevo total a pagar es <strong>$" . number_format($nuevoTotal, 2) . " MXN</strong>.</p>
                <p>— Pagalaescuela</p>
            ";
            $r = enviar_correo($emailDestino, $asunto, $html);
            if ($r['success']) {
                $pdo->prepare("INSERT INTO recordatorios (escuela_id, cobro_id, cliente, fecha, canal) VALUES (?, ?, ?, ?, 'email_automatico') ON DUPLICATE KEY UPDATE canal = canal")
                    ->execute([$row['escuela_id'], $row['id'], $row['cliente_nombre'], $hoyStr]);
            }
        }
        $resumen[] = "Recargo aplicado a cobro #{$row['id']}: +\$" . number_format($recargo, 2);
    }
} catch (\PDOException $e) {
    $resumen[] = "ERROR generando/penalizando pagos recurrentes (¿falta correr migracion_2026_08_20_pagos_recurrentes.sql?): " . $e->getMessage();
}

// ══════════════════════════════════════════════════════════════════════════
// 0.5) COBRO AUTOMÁTICO (CAI): para cada cobro recurrente que siga pendiente
//      (incluye los que ya llevan recargo aplicado arriba) y cuyo alumno
//      tenga una tarjeta domiciliada activa, intenta cobrarla directo con
//      Cobroscontarjeta.com — mismo mecanismo que el botón "Tarjeta guardada"
//      de Caja.js, compartido vía cobrar_via_token() para no duplicar la
//      llamada al proveedor. Si falla (tarjeta vencida, fondos, etc.) el
//      cobro se queda pendiente y lo recoge la sección 2 (recordatorios) como
//      cualquier otro adeudo — no hay límite de reintentos: se vuelve a
//      intentar cada día que el cron corra, hasta que se pague o se cancele
//      la tarjeta domiciliada.
//
//      generar_liga.php ya tokeniza (PLE_URL_LIGA_TOKEN, confirmado con el
//      proveedor ago-2026) — este bloque cobra solo en cuanto un alumno
//      tenga token_tarjeta_estado='activo' (primer pago con tarjeta donde
//      se marcó "guardar mi tarjeta"), sin más cambios de código.
// ══════════════════════════════════════════════════════════════════════════
try {
    // cliente_nombre/cliente_email/familia_email ya no se seleccionan aquí:
    // el correo de confirmación ahora lo manda cobrar_via_token() por su
    // cuenta (consulta lo que necesita internamente), no hacía falta
    // duplicar esos datos en esta consulta.
    $stmtCaiPend = $pdo->query(
        "SELECT co.id AS cobro_id, co.total, co.escuela_id, co.cliente_id,
                cl.token_tarjeta, cl.token_tarjeta_expmes, cl.token_tarjeta_expanio
         FROM cobros co
         JOIN pagos_recurrentes_generados prg ON prg.cobro_id = co.id
         JOIN clientes cl ON cl.id = co.cliente_id
         WHERE co.estado = 'pendiente' AND cl.token_tarjeta_estado = 'activo'
           AND cl.token_tarjeta IS NOT NULL
           AND co.fecha <= DATE_SUB(CURDATE(), INTERVAL " . CAI_DIAS_AVISO . " DAY)"
    );
    // ── Aviso PREVIO al cargo automatico ──
    // Antes solo se avisaba despues de cobrar ("Se realizo un cargo..."). La
    // certificacion de Cobroscontarjeta.com pide la notificacion con la que se
    // avisa que un cargo SE VA A procesar, y es lo razonable: al titular se le
    // avisa antes de tocarle la tarjeta.
    //
    // Por eso el cobro no se cobra el mismo dia que se genera: espera
    // CAI_DIAS_AVISO dias, y en ese lapso sale este correo.
    try {
        $stmtPorAvisar = $pdo->query(
            "SELECT co.id AS cobro_id, co.total, co.fecha, cl.nombre AS cliente_nombre,
                    cl.email AS cliente_email, fa.email AS familia_email
               FROM cobros co
               JOIN pagos_recurrentes_generados prg ON prg.cobro_id = co.id
               JOIN clientes cl ON cl.id = co.cliente_id
               LEFT JOIN familias fa ON fa.id = cl.familia_id
              WHERE co.estado = 'pendiente' AND cl.token_tarjeta_estado = 'activo'
                AND cl.token_tarjeta IS NOT NULL
                AND co.fecha > DATE_SUB(CURDATE(), INTERVAL " . CAI_DIAS_AVISO . " DAY)"
        );
        foreach ($stmtPorAvisar->fetchAll() as $av) {
            $mailAv = $av['cliente_email'] ?: $av['familia_email'];
            if (!$mailAv) continue;
            $montoAv = '$' . number_format((float) $av['total'], 2) . ' MXN';
            $fechaAv = date('d/m/Y', strtotime($av['fecha'] . ' +' . CAI_DIAS_AVISO . ' days'));
            // enviar_correo() NO lanza excepcion: devuelve
            // ['success' => bool, 'error' => ...]. Sin revisar ese valor, un
            // fallo de SMTP se reportaba como "enviado" y quedaba invisible.
            $rAv = enviar_correo(
                $mailAv,
                'Aviso: se procesara un cargo automatico el ' . $fechaAv,
                "<p>Hola,</p>
                 <p>Te avisamos que el <strong>{$fechaAv}</strong> se procesara un cargo automatico de
                 <strong>{$montoAv}</strong> a la tarjeta que tienes domiciliada para "
                 . htmlspecialchars($av['cliente_nombre']) . ".</p>
                 <p>No necesitas hacer nada: el cobro se aplica solo.</p>
                 <p>Si no reconoces este cargo o quieres cancelar la domiciliacion,
                 contacta al colegio antes de esa fecha.</p>"
            );
            if (!empty($rAv['success'])) {
                $resumen[] = "OK aviso previo de cargo automatico (cobro #{$av['cobro_id']}) -> {$mailAv}";
            } else {
                $resumen[] = "ERROR aviso previo de cargo #{$av['cobro_id']}: " . ($rAv['error'] ?? 'desconocido');
            }
        }
    } catch (\Throwable $e) {
        $resumen[] = "ERROR consultando cobros por avisar: " . $e->getMessage();
    }

    foreach ($stmtCaiPend->fetchAll() as $row) {
        // Antes esto cobraba SIEMPRE, sin importar si el superadmin habia
        // apagado Domiciliacion (globalmente o para esta escuela). El
        // bloqueo en cobrar_cai.php solo cubre el cobro MANUAL que hace un
        // cajero desde Caja -- este es el cargo AUTOMATICO recurrente, que
        // llama a cobrar_via_token() directo y nunca pasaba por ahi.
        if (metodo_pago_deshabilitado($pdo, intval($row['escuela_id']), 'CAI')) {
            $resumen[] = "OMITIDO cargo automático (CAI) cobro #{$row['cobro_id']}: Domiciliación está deshabilitada.";
            continue;
        }
        $resCai = cobrar_via_token(
            $pdo, intval($row['cobro_id']), intval($row['cliente_id']), floatval($row['total']),
            $row['token_tarjeta'], $row['token_tarjeta_expmes'], $row['token_tarjeta_expanio']
        );
        if ($resCai['success']) {
            // El correo de confirmación ya lo manda cobrar_via_token() —
            // centralizado ahí para que el cobro manual (botón "Tarjeta
            // guardada") avise igual, sin duplicar el texto en dos archivos.
            $resumen[] = "OK cargo automático (CAI) cobro #{$row['cobro_id']} (alumno #{$row['cliente_id']}), total \${$row['total']}";
        } else {
            $resumen[] = "AVISO cargo automático (CAI) cobro #{$row['cobro_id']} rechazado: " . $resCai['error'];
        }
    }
} catch (\PDOException $e) {
    $resumen[] = "ERROR cobro automático CAI: " . $e->getMessage();
}

// ══════════════════════════════════════════════════════════════════════════
// 1) VENCIMIENTO DE SUSCRIPCIÓN (plan SaaS)
// ══════════════════════════════════════════════════════════════════════════
try {
    $stmt = $pdo->query(
        "SELECT id, nombre, email, plan, fecha_vencimiento_plan, ultimo_recordatorio_plan
         FROM escuelas WHERE es_plantel = 0 AND activa = 1 AND fecha_vencimiento_plan IS NOT NULL"
    );
    foreach ($stmt->fetchAll() as $esc) {
        $dias = (int) round((strtotime($esc['fecha_vencimiento_plan']) - $hoyTs) / 86400);
        if (!in_array($dias, [7, 5], true)) continue;
        if ($esc['ultimo_recordatorio_plan'] === $hoyStr) continue; // ya se avisó hoy (evita duplicar si el cron corre 2 veces)

        $destinatarios = [];
        if (!empty($esc['email'])) $destinatarios[] = $esc['email'];
        $stmtAdmins = $pdo->prepare("SELECT email FROM usuarios WHERE escuela_id = ? AND rol = 'admin' AND activo = 1");
        $stmtAdmins->execute([$esc['id']]);
        foreach ($stmtAdmins->fetchAll() as $a) $destinatarios[] = $a['email'];
        $destinatarios = array_values(array_unique(array_filter($destinatarios)));
        if (!$destinatarios) {
            $resumen[] = "AVISO: escuela #{$esc['id']} ({$esc['nombre']}) sin correo de contacto ni admin activo, se omite recordatorio de vencimiento.";
            continue;
        }

        $planInfo  = $PLAN_INFO[$esc['plan']] ?? $PLAN_INFO['basico'];
        $fmtPrecio = '$' . number_format($planInfo['precio'], 2) . ' MXN + IVA';
        $fechaFmt  = date('d/m/Y', strtotime($esc['fecha_vencimiento_plan']));
        $asunto    = "Tu suscripción de Pagalaescuela vence en $dias día" . ($dias === 1 ? '' : 's');
        $html = "
            <p>Hola,</p>
            <p>La suscripción de <strong>" . htmlspecialchars($esc['nombre']) . "</strong> (plan {$planInfo['label']}) vence el <strong>$fechaFmt</strong> (en $dias días).</p>
            <p>Monto de renovación: <strong>$fmtPrecio</strong>.</p>
            <p>Para evitar una interrupción del servicio, por favor gestiona tu pago antes de esa fecha.</p>
            <p>— Equipo Pagalaescuela</p>
        ";
        $r = enviar_correo($destinatarios, $asunto, $html);
        if ($r['success']) {
            $pdo->prepare("UPDATE escuelas SET ultimo_recordatorio_plan = ? WHERE id = ?")->execute([$hoyStr, $esc['id']]);
            $resumen[] = "OK suscripción escuela #{$esc['id']} ({$dias}d) -> " . implode(',', $destinatarios);
        } else {
            $resumen[] = "ERROR suscripción escuela #{$esc['id']}: " . $r['error'];
        }
    }
} catch (\PDOException $e) {
    $resumen[] = "ERROR consultando escuelas (¿falta correr migracion_2026_08_20_suscripciones.sql?): " . $e->getMessage();
}

// ══════════════════════════════════════════════════════════════════════════
// 1.1) DESACTIVAR/REACTIVAR SECCIONES POR FALTA DE PAGO
//
// Antes esto se hacia a mano: el superadmin tenia que acordarse de entrar a
// Escuelas > Editar secciones cada vez que una suscripcion vencia, y volver
// a habilitarlas cuando el colegio pagaba. En la practica eso significaba
// que un colegio podia seguir cobrando indefinidamente despues de vencer,
// sin que nadie lo notara hasta que alguien revisara Suscripciones a mano.
//
// Estas son las secciones que se consideran "de pago": todo lo que implica
// operar y cobrar. Se dejan visibles Dashboard, Alumnos y Familias para que
// la escuela pueda seguir viendo su informacion (no se le "secuestran" los
// datos), pero no puede seguir generando ni cobrando adeudos nuevos.
// ══════════════════════════════════════════════════════════════════════════
$SECCIONES_DE_PAGO = ['caja', 'corte_caja', 'cobros', 'recordatorios'];

try {
    $stmtVenc = $pdo->query(
        "SELECT id, nombre, secciones_deshabilitadas, fecha_vencimiento_plan
           FROM escuelas WHERE es_plantel = 0 AND activa = 1 AND fecha_vencimiento_plan IS NOT NULL"
    );
    foreach ($stmtVenc->fetchAll() as $esc) {
        $vencida = strtotime($esc['fecha_vencimiento_plan']) < $hoyTs;
        $actuales = json_decode($esc['secciones_deshabilitadas'] ?? '', true);
        if (!is_array($actuales)) $actuales = [];

        if ($vencida) {
            // Se agregan las secciones de pago SIN quitar ninguna que el
            // superadmin ya hubiera deshabilitado manualmente por otro motivo
            // -- evita que este proceso automatico reactive algo que alguien
            // apago a proposito por una razon distinta al pago.
            $nuevas = array_values(array_unique(array_merge($actuales, $SECCIONES_DE_PAGO)));
            $yaEstaban = !array_diff($SECCIONES_DE_PAGO, $actuales);
            if (!$yaEstaban) {
                $pdo->prepare("UPDATE escuelas SET secciones_deshabilitadas = ? WHERE id = ?")
                    ->execute([json_encode($nuevas), $esc['id']]);
                registrar_log($pdo, ['user_id' => null, 'rol' => 'sistema'],
                    'secciones_desactivadas_por_pago',
                    "Escuela '{$esc['nombre']}' #{$esc['id']}: suscripción vencida el {$esc['fecha_vencimiento_plan']}, se desactivaron: " . implode(',', $SECCIONES_DE_PAGO),
                    $esc['id']);
                $resumen[] = "OK secciones desactivadas por falta de pago -> escuela #{$esc['id']} ({$esc['nombre']})";
            }
        } else {
            // El plan está vigente (se renovó o se pagó la suscripción):
            // se retiran SOLO las secciones de pago que este mismo proceso
            // habría agregado, dejando intacto cualquier otro bloqueo manual.
            $nuevas = array_values(array_diff($actuales, $SECCIONES_DE_PAGO));
            if ($nuevas !== $actuales) {
                $pdo->prepare("UPDATE escuelas SET secciones_deshabilitadas = ? WHERE id = ?")
                    ->execute([json_encode($nuevas), $esc['id']]);
                registrar_log($pdo, ['user_id' => null, 'rol' => 'sistema'],
                    'secciones_reactivadas_por_pago',
                    "Escuela '{$esc['nombre']}' #{$esc['id']}: suscripción vigente, se reactivaron: " . implode(',', $SECCIONES_DE_PAGO),
                    $esc['id']);
                $resumen[] = "OK secciones reactivadas -> escuela #{$esc['id']} ({$esc['nombre']})";
            }
        }
    }
} catch (\PDOException $e) {
    $resumen[] = "ERROR desactivando/reactivando secciones por pago: " . $e->getMessage();
}

// ══════════════════════════════════════════════════════════════════════════
// 2) RECORDATORIOS DE COBROS PENDIENTES
// ══════════════════════════════════════════════════════════════════════════
try {
    $stmt = $pdo->query(
        "SELECT co.*, cl.email AS cliente_email, cl.nombre AS cliente_nombre, fa.email AS familia_email
         FROM cobros co
         LEFT JOIN clientes cl ON cl.id = co.cliente_id
         LEFT JOIN familias fa ON fa.id = cl.familia_id
         LEFT JOIN pagos_recurrentes_generados prg ON prg.cobro_id = co.id
         WHERE co.estado = 'pendiente' AND prg.id IS NULL"
    );
    foreach ($stmt->fetchAll() as $c) {
        // crear_cobro nunca guarda una fecha de vencimiento real (columna
        // fecha_vencimiento inexistente/NULL hoy) — solo existe `fecha` (creación).
        // Sin fecha límite real no se puede avisar "vence hoy/antes de": se usa
        // en cambio la antigüedad del cobro sin pagar (días desde que se cobró),
        // con umbrales corridos para NO mandar nada el mismo día que se creó.
        $tieneVencimientoReal = !empty($c['fecha_vencimiento']);
        $fechaRef = $tieneVencimientoReal ? $c['fecha_vencimiento'] : ($c['fecha'] ?? null);
        if (!$fechaRef) continue;
        $emailDestino = $c['cliente_email'] ?: $c['familia_email'];
        if (!$emailDestino) continue;

        $dias = (int) round(($hoyTs - strtotime($fechaRef)) / 86400); // >0 = vencido/antiguo, <0 = faltan días
        if ($tieneVencimientoReal) {
            // Hay una fecha límite real: mismos umbrales que la UI (Recordatorios.js
            // considera "urgente" desde 3 días antes). Solo en las transiciones clave.
            if (!in_array($dias, [-3, 0, 1], true)) continue;
        } else {
            // No hay fecha límite real, solo fecha de creación: el día 0 manda un
            // AVISO neutral de que se generó el cobro (no un reclamo de atraso),
            // y luego se escala a recordatorio (3 días) y urgente (7 días).
            if (!in_array($dias, [0, 3, 7], true)) continue;
        }

        // Idempotencia: uq_recordatorio_dia (cobro_id + fecha) evita reenviar si
        // el cron corre más de una vez el mismo día, o si ya se marcó manual hoy.
        $chk = $pdo->prepare("SELECT 1 FROM recordatorios WHERE cobro_id = ? AND fecha = ?");
        $chk->execute([$c['id'], $hoyStr]);
        if ($chk->fetch()) continue;

        $nombreCliente = $c['cliente_nombre'] ?: 'Cliente';
        $totalFmt = '$' . number_format((float)($c['total'] ?? 0), 2) . ' MXN';
        if (!$tieneVencimientoReal && $dias === 0) {
            $asunto = "Tienes un nuevo cobro pendiente";
            $textoFecha = "se generó hoy, " . date('d/m/Y', strtotime($fechaRef));
        } elseif (!$tieneVencimientoReal) {
            $asunto = "Recordatorio: tienes un pago pendiente";
            $textoFecha = "sigue pendiente desde el " . date('d/m/Y', strtotime($fechaRef)) . ($dias >= 7 ? ' — por favor ponte al corriente' : '');
        } elseif ($dias > 0) {
            $asunto = "Pago pendiente: tienes un cobro vencido";
            $textoFecha = "venció el " . date('d/m/Y', strtotime($fechaRef));
        } elseif ($dias === 0) {
            $asunto = "Pago pendiente: tu cobro vence hoy";
            $textoFecha = "vence hoy";
        } else {
            $asunto = "Recordatorio: tienes un pago próximo a vencer";
            $textoFecha = "vence el " . date('d/m/Y', strtotime($fechaRef));
        }
        $html = "
            <p>Hola " . htmlspecialchars($nombreCliente) . ",</p>
            <p>Tienes un pago pendiente por <strong>$totalFmt</strong> que $textoFecha.</p>
            <p>Por favor realiza tu pago para evitar recargos o la suspensión del servicio.</p>
            <p>— Pagalaescuela</p>
        ";
        $r = enviar_correo($emailDestino, $asunto, $html);
        if ($r['success']) {
            try {
                $pdo->prepare(
                    "INSERT INTO recordatorios (escuela_id, cobro_id, cliente, fecha, canal)
                     VALUES (?, ?, ?, ?, 'email_automatico')
                     ON DUPLICATE KEY UPDATE canal = canal"
                )->execute([$c['escuela_id'], $c['id'], $nombreCliente, $hoyStr]);
            } catch (\PDOException $e) {
                $resumen[] = "AVISO: correo de cobro #{$c['id']} enviado pero no se pudo registrar en `recordatorios`: " . $e->getMessage();
            }
            $resumen[] = "OK cobro #{$c['id']} ({$dias}d) -> $emailDestino";
        } else {
            $resumen[] = "ERROR cobro #{$c['id']}: " . $r['error'];
        }
    }
} catch (\PDOException $e) {
    $resumen[] = "ERROR consultando cobros pendientes (¿falta correr migracion_2026_08_20_pagos_recurrentes.sql?): " . $e->getMessage();
}

// ══════════════════════════════════════════════════════════════════════════
// 3) CAJAS ABIERTAS DEMASIADO TIEMPO: aviso (NO cierre automático) para
//    estado='abierta' con más de 18 horas desde fecha_apertura. No se
//    cierran solas: un "monto contado" inventado por el cron corrompería
//    el registro financiero con una diferencia falsa — solo se avisa al
//    cajero dueño y a los admins de esa escuela para que la cierren a
//    mano. El cron corre una vez al día, así que un turno que sigue
//    abierto al día siguiente recibe un aviso nuevo cada corrida
//    (recordatorio diario hasta que se cierre).
// ══════════════════════════════════════════════════════════════════════════
try {
    $stmtCajasAbiertas = $pdo->query(
        "SELECT ca.id, ca.fecha_apertura, ca.usuario_id,
                u.nombre AS cajero_nombre, u.email AS cajero_email,
                s.nombre AS sucursal_nombre, s.escuela_id, e.nombre AS escuela_nombre
         FROM caja ca
         JOIN usuarios u   ON u.id = ca.usuario_id
         JOIN sucursales s ON s.id = ca.sucursal_id
         JOIN escuelas e   ON e.id = s.escuela_id
         WHERE ca.estado = 'abierta' AND ca.fecha_apertura <= DATE_SUB(NOW(), INTERVAL 18 HOUR)"
    );
    foreach ($stmtCajasAbiertas->fetchAll() as $ca) {
        $horasAbierta = round((time() - strtotime($ca['fecha_apertura'])) / 3600);

        $destinatarios = [];
        if (!empty($ca['cajero_email'])) $destinatarios[] = $ca['cajero_email'];
        $stmtAdminsCaja = $pdo->prepare("SELECT email FROM usuarios WHERE escuela_id = ? AND rol = 'admin' AND activo = 1");
        $stmtAdminsCaja->execute([$ca['escuela_id']]);
        foreach ($stmtAdminsCaja->fetchAll() as $a) $destinatarios[] = $a['email'];
        $destinatarios = array_values(array_unique(array_filter($destinatarios)));
        if (!$destinatarios) {
            $resumen[] = "AVISO: caja #{$ca['id']} lleva {$horasAbierta}h abierta pero no hay correo de cajero ni admin activo para avisar.";
            continue;
        }

        $asunto = "Caja abierta desde hace {$horasAbierta} horas — " . $ca['sucursal_nombre'];
        $html = "
            <p>Hola,</p>
            <p>La caja de <strong>" . htmlspecialchars($ca['sucursal_nombre']) . "</strong> (" . htmlspecialchars($ca['escuela_nombre']) . "), abierta por <strong>" . htmlspecialchars($ca['cajero_nombre']) . "</strong>, sigue abierta desde el " . date('d/m/Y H:i', strtotime($ca['fecha_apertura'])) . " (hace {$horasAbierta} horas).</p>
            <p>Por seguridad y control financiero, cierra el turno y haz el corte de caja correspondiente en cuanto sea posible.</p>
            <p>— Pagalaescuela</p>
        ";
        $r = enviar_correo($destinatarios, $asunto, $html);
        if ($r['success']) {
            $resumen[] = "OK aviso caja abierta #{$ca['id']} ({$horasAbierta}h) -> " . implode(',', $destinatarios);
        } else {
            $resumen[] = "ERROR aviso caja abierta #{$ca['id']}: " . $r['error'];
        }
    }
} catch (\PDOException $e) {
    $resumen[] = "ERROR revisando cajas abiertas prolongadas: " . $e->getMessage();
}

// ══════════════════════════════════════════════════════════════════════════
// 4) ARCHIVADO DE logs_sistema — es la tabla que más rápido crece en
//    producción real (registra cada login exitoso, no solo los fallidos).
//    Corre solo el día 1 de cada mes (no hace falta hacerlo a diario): mueve
//    lo de más de 180 días a logs_sistema_archivo (mismo esquema, se crea
//    sola la primera vez) y lo borra de la tabla "caliente". No se pierde
//    nada del histórico, solo se saca del camino de listar_logs y de las
//    consultas de rate-limiting de login (que solo miran los últimos minutos).
// ══════════════════════════════════════════════════════════════════════════
if ((int) date('j') === 1) {
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS logs_sistema_archivo LIKE logs_sistema");
        $corteLogs = date('Y-m-d', strtotime('-180 days'));
        $pdo->prepare("INSERT INTO logs_sistema_archivo SELECT * FROM logs_sistema WHERE fecha < ?")->execute([$corteLogs]);
        $stmtDelLogs = $pdo->prepare("DELETE FROM logs_sistema WHERE fecha < ?");
        $stmtDelLogs->execute([$corteLogs]);
        if ($stmtDelLogs->rowCount() > 0) {
            $resumen[] = "Archivado mensual de logs_sistema: {$stmtDelLogs->rowCount()} filas anteriores a $corteLogs movidas a logs_sistema_archivo.";
        }
    } catch (\PDOException $e) {
        $resumen[] = "ERROR archivando logs_sistema: " . $e->getMessage();
    }
}

$lineaLog = date('Y-m-d H:i:s') . " | Cron recordatorios:\n  " . (empty($resumen) ? '(sin novedades)' : implode("\n  ", $resumen)) . "\n\n";
file_put_contents(CORREOS_LOG_FILE, $lineaLog, FILE_APPEND);
echo $lineaLog;
