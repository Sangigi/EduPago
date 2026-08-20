<?php
/**
 * EduPago — Webhook SPEI v3 (DB MySQL + validación de origen)
 *
 * Cambios vs v2:
 *  - Requiere un token compartido (WEBHOOK_SPEI_TOKEN) que solo tú y Pagadetodo
 *    conocen, enviado como query string (?token=...) o header X-Webhook-Token.
 *    Sin él, cualquiera podía forjar un pago con solo adivinar el folio.
 *  - Valida que el monto recibido coincida EXACTO con el total del cobro
 *    pendiente (antes solo se checaba que el cobro existiera y estuviera
 *    pendiente, sin importar cuánto dinero llegó).
 *  - Es idempotente: si Pagadetodo reintenta el mismo webhook (misma
 *    clave_rastreo) sobre un cobro ya pagado, responde éxito sin duplicar
 *    nada ni marcar error.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/helpers_pagos.php';

header('Content-Type: application/json; charset=UTF-8');

$ts  = date('Y-m-d H:i:s');
$raw = file_get_contents('php://input');

if (API_LOG_ENABLED) {
    file_put_contents(
        __DIR__ . '/webhook_log.txt',
        "\n[{$ts}] ══ WEBHOOK SPEI ══\nRAW:\n{$raw}\n" . str_repeat('─', 60) . "\n",
        FILE_APPEND
    );
}

function responder($codigo, $msg, $transaccion = '0') {
    echo json_encode([
        'codigo'       => $codigo,
        'autorizacion' => $codigo === 0 ? rand(10000000, 99999999) : '',
        'mensaje'      => $msg,
        'transaccion'  => $transaccion,
        'fecha'        => date('Y-m-d'),
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ── 1. Validar token compartido ──────────────────────────────────────────
// Configúralo en config.php como WEBHOOK_SPEI_TOKEN y dale esa misma URL con
// ?token=TU_TOKEN a Pagadetodo (o el header X-Webhook-Token si lo soportan).
$token_recibido = $_GET['token'] ?? ($_SERVER['HTTP_X_WEBHOOK_TOKEN'] ?? '');
if (!defined('WEBHOOK_SPEI_TOKEN') || !WEBHOOK_SPEI_TOKEN) {
    if (API_LOG_ENABLED) file_put_contents(API_LOG_FILE, "{$ts} | ❌ WEBHOOK_SPEI_TOKEN no configurado en config.php\n", FILE_APPEND);
    responder(99, 'Webhook no configurado');
}
if (!hash_equals(WEBHOOK_SPEI_TOKEN, (string) $token_recibido)) {
    if (API_LOG_ENABLED) file_put_contents(API_LOG_FILE, "{$ts} | ❌ WEBHOOK SPEI: token inválido o ausente\n", FILE_APPEND);
    responder(40, 'No autorizado');
}

$data = json_decode($raw, true);
if (!$data || !is_array($data)) {
    responder(50, 'JSON inválido o body vacío');
}

$concepto        = $data['concepto_pago']   ?? $data['concepto']    ?? $data['referencia'] ?? '';
$clave_rastreo   = $data['clave_rastreo']   ?? $data['transaccion'] ?? uniqid('spei_');
$monto_centavos  = $data['monto']           ?? $data['importe']     ?? '0';

$concepto_limpio = strtoupper(trim(preg_replace('/\s+/', '-', $concepto)));
$monto_pesos     = round(intval($monto_centavos) / 100, 2);

if (!$monto_centavos || $monto_centavos === '0' || intval($monto_centavos) <= 0) {
    responder(15, 'Monto inválido o cero');
}

if (!$concepto_limpio) {
    $concepto_limpio = 'SIN-CONCEPTO-' . date('YmdHis');
}

// ── 2. Buscar el cobro y validar monto + idempotencia ────────────────────
try {
    $stmt = $pdo->prepare(
        "SELECT id, total, cliente_id, estado, auth_code FROM cobros WHERE referencia = ? ORDER BY id DESC LIMIT 1"
    );
    $stmt->execute([$concepto_limpio]);
    $cobro = $stmt->fetch();

    if (!$cobro) {
        $log_msg = "⚠ SPEI HUÉRFANO | ref:{$concepto_limpio} rastreo:{$clave_rastreo} monto:{$monto_pesos}";
        if (API_LOG_ENABLED) file_put_contents(API_LOG_FILE, "{$ts} | {$log_msg}\n", FILE_APPEND);
        // No se marca error 99 (eso reintenta el webhook indefinidamente); se
        // confirma recepción pero sin tocar nada, para revisión manual.
        responder(0, 'Recibido, sin cobro pendiente para esa referencia', $clave_rastreo);
    }

    // Idempotencia: si ya está pagado con esta misma clave_rastreo, no es un error.
    if ($cobro['estado'] === 'pagado') {
        if ($cobro['auth_code'] === $clave_rastreo) {
            responder(0, 'Ya estaba confirmado (reintento idempotente)', $clave_rastreo);
        }
        $log_msg = "⚠ SPEI reintento con distinta clave_rastreo | cobro_id:{$cobro['id']} previa:{$cobro['auth_code']} nueva:{$clave_rastreo}";
        if (API_LOG_ENABLED) file_put_contents(API_LOG_FILE, "{$ts} | {$log_msg}\n", FILE_APPEND);
        responder(0, 'Cobro ya confirmado previamente', $clave_rastreo);
    }

    if ($cobro['estado'] !== 'pendiente') {
        responder(20, 'El cobro no está en estado pendiente (' . $cobro['estado'] . ')');
    }

    // Validar que el monto recibido coincida EXACTO con el total del cobro.
    // Antes de este fix, cualquier monto era aceptado con tal de que el
    // folio existiera y estuviera pendiente.
    if (abs(floatval($cobro['total']) - $monto_pesos) > 0.01) {
        $log_msg = "❌ SPEI MONTO NO COINCIDE | cobro_id:{$cobro['id']} esperado:{$cobro['total']} recibido:{$monto_pesos}";
        if (API_LOG_ENABLED) file_put_contents(API_LOG_FILE, "{$ts} | {$log_msg}\n", FILE_APPEND);
        responder(30, 'Monto no coincide con el cobro pendiente');
    }

    $update = $pdo->prepare("UPDATE cobros SET estado = 'pagado', auth_code = ?, fecha = CURRENT_DATE WHERE id = ?");
    $update->execute([$clave_rastreo, $cobro['id']]);

    if ($cobro['cliente_id']) {
        // Antes: decrementaba saldo_pendiente en vez de recalcularlo desde
        // `cobros` — si el saldo cacheado alguna vez se desincronizaba por
        // cualquier otra razón, este webhook era el único flujo que nunca
        // se autocorregía.
        recalcular_saldo_pendiente($pdo, intval($cobro['cliente_id']));
    }

    $log_msg = "✓ SPEI CONFIRMADO en DB | cobro_id:{$cobro['id']} rastreo:{$clave_rastreo} monto:{$monto_pesos}";
    if (API_LOG_ENABLED) file_put_contents(API_LOG_FILE, "{$ts} | {$log_msg}\n", FILE_APPEND);
    responder(0, 'Pago procesado correctamente', $clave_rastreo);

} catch (\PDOException $e) {
    if (API_LOG_ENABLED) file_put_contents(API_LOG_FILE, "{$ts} | ❌ ERROR DB WEBHOOK: " . $e->getMessage() . "\n", FILE_APPEND);
    responder(99, 'Error de base de datos interno');
}
