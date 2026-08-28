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
//      Nota: al momento de escribir esto, NINGÚN alumno llega a tener
//      token_tarjeta poblado (ver el comentario en acciones/generar_liga.php
//      sobre por qué la tokenización sigue apuntando al endpoint simple) —
//      este bloque queda listo y sin costo mientras tanto; empieza a cobrar
//      solo, sin más cambios de código, en cuanto el proveedor tokenice.
// ══════════════════════════════════════════════════════════════════════════
try {
    $stmtCaiPend = $pdo->query(
        "SELECT co.id AS cobro_id, co.total, co.escuela_id, co.cliente_id,
                cl.token_tarjeta, cl.token_tarjeta_expmes, cl.token_tarjeta_expanio,
                cl.email AS cliente_email, cl.nombre AS cliente_nombre, fa.email AS familia_email
         FROM cobros co
         JOIN pagos_recurrentes_generados prg ON prg.cobro_id = co.id
         JOIN clientes cl ON cl.id = co.cliente_id
         LEFT JOIN familias fa ON fa.id = cl.familia_id
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
            try {
                enviar_correo(
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
                $resumen[] = "Aviso previo de cargo automatico enviado (cobro #{$av['cobro_id']})";
            } catch (\Throwable $e) {
                $resumen[] = "ERROR aviso previo de cargo #{$av['cobro_id']}: " . $e->getMessage();
            }
        }
    } catch (\Throwable $e) {
        $resumen[] = "ERROR consultando cobros por avisar: " . $e->getMessage();
    }

    foreach ($stmtCaiPend->fetchAll() as $row) {
        $resCai = cobrar_via_token(
            $pdo, intval($row['cobro_id']), intval($row['cliente_id']), floatval($row['total']),
            $row['token_tarjeta'], $row['token_tarjeta_expmes'], $row['token_tarjeta_expanio']
        );
        if ($resCai['success']) {
            $resumen[] = "OK cargo automático (CAI) cobro #{$row['cobro_id']} (alumno #{$row['cliente_id']}), total \${$row['total']}";
            $emailCai = $row['cliente_email'] ?: $row['familia_email'];
            if ($emailCai) {
                $totalFmt = '$' . number_format((float) $row['total'], 2) . ' MXN';
                $html = "
                    <p>Hola,</p>
                    <p>Se realizó un cargo automático de <strong>$totalFmt</strong> a tu tarjeta guardada para " . htmlspecialchars($row['cliente_nombre']) . ".</p>
                    <p>— Pagalaescuela</p>
                ";
                enviar_correo($emailCai, 'Se cobró tu pago automático', $html);
            }
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
// 3) ARCHIVADO DE logs_sistema — es la tabla que más rápido crece en
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
