<?php
/**
 * cron_recordatorios.php — Job diario, solo por línea de comandos (Cron Jobs
 * de Hostinger). Ver PRODUCCION.md para cómo programarlo.
 *
 * Envía por correo:
 *  1) Aviso de vencimiento de la suscripción (plan SaaS) del colegio, 7 y 5
 *     días antes de `escuelas.fecha_vencimiento_plan`.
 *  2) Recordatorios de cobros pendientes a la familia/cliente, con el mismo
 *     criterio de urgencia que ya usa views/Recordatorios.js (3 días antes,
 *     el día que vence, y 1 día después de vencido).
 *
 * No requiere autenticación: no se expone a través del navegador/api.php,
 * solo se ejecuta por CLI.
 */
if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    exit("Este script solo puede ejecutarse por línea de comandos (cron).\n");
}

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/mailer.php';

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
         WHERE co.estado = 'pendiente'"
    );
    foreach ($stmt->fetchAll() as $c) {
        // Mismo fallback que views/Recordatorios.js: usa fecha_vencimiento si
        // existe la columna; si no, usa la fecha de creación del cobro.
        $fechaRef = $c['fecha_vencimiento'] ?? $c['fecha'] ?? null;
        if (!$fechaRef) continue;
        $emailDestino = $c['cliente_email'] ?: $c['familia_email'];
        if (!$emailDestino) continue;

        $dias = (int) round(($hoyTs - strtotime($fechaRef)) / 86400); // >0 = vencido, <0 = faltan días
        // Mismos umbrales de urgencia que la UI (Recordatorios.js: "urgente" desde
        // 3 días antes). Solo se avisa en las transiciones clave para no spamear
        // a diario: 3 días antes, el día que vence, y 1 día después de vencido.
        if (!in_array($dias, [-3, 0, 1], true)) continue;

        // Idempotencia: uq_recordatorio_dia (cobro_id + fecha) evita reenviar si
        // el cron corre más de una vez el mismo día, o si ya se marcó manual hoy.
        $chk = $pdo->prepare("SELECT 1 FROM recordatorios WHERE cobro_id = ? AND fecha = ?");
        $chk->execute([$c['id'], $hoyStr]);
        if ($chk->fetch()) continue;

        $nombreCliente = $c['cliente_nombre'] ?: 'Cliente';
        $totalFmt = '$' . number_format((float)($c['total'] ?? 0), 2) . ' MXN';
        if ($dias > 0) {
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
    $resumen[] = "ERROR consultando cobros pendientes: " . $e->getMessage();
}

$lineaLog = date('Y-m-d H:i:s') . " | Cron recordatorios:\n  " . (empty($resumen) ? '(sin novedades)' : implode("\n  ", $resumen)) . "\n\n";
file_put_contents(CORREOS_LOG_FILE, $lineaLog, FILE_APPEND);
echo $lineaLog;
