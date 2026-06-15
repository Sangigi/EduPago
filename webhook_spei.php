<?php
/**
 * EduPago — Webhook SPEI v2 (DB MySQL)
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php'; // Agregamos la conexión PDO

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

$data = json_decode($raw, true);

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

if (!$data || !is_array($data)) {
    responder(50, 'JSON inválido o body vacío');
}

$concepto        = $data['concepto_pago']   ?? $data['concepto']    ?? $data['referencia'] ?? '';
$clave_rastreo   = $data['clave_rastreo']   ?? $data['transaccion'] ?? uniqid('spei_');
$monto_centavos  = $data['monto']           ?? $data['importe']     ?? '0';

$concepto_limpio = strtoupper(trim(preg_replace('/\s+/', '-', $concepto)));
$monto_pesos     = number_format(intval($monto_centavos) / 100, 2);

if (!$monto_centavos || $monto_centavos === '0' || intval($monto_centavos) <= 0) {
    responder(15, 'Monto inválido o cero');
}

if (!$concepto_limpio) {
    $concepto_limpio = 'SIN-CONCEPTO-' . date('YmdHis');
}

// ── Guardar en Base de Datos MySQL (Tabla: cobros) ──────────────────────────
try {
    $stmt = $pdo->prepare("SELECT id, total, cliente_id FROM cobros WHERE referencia = ? AND estado = 'pendiente'");
    $stmt->execute([$concepto_limpio]);
    $cobro = $stmt->fetch();

    if ($cobro) {
        $update = $pdo->prepare("UPDATE cobros SET estado = 'pagado', auth_code = ?, fecha = CURRENT_DATE WHERE id = ?");
        $update->execute([$clave_rastreo, $cobro['id']]);

        if ($cobro['cliente_id']) {
            $updateSaldo = $pdo->prepare("UPDATE clientes SET saldo_pendiente = GREATEST(0, saldo_pendiente - ?) WHERE id = ?");
            $updateSaldo->execute([$cobro['total'], $cobro['cliente_id']]);
        }
        
        $log_msg = "✓ SPEI CONFIRMADO en DB | cobro_id:{$cobro['id']} rastreo:{$clave_rastreo}";
    } else {
        $log_msg = "⚠ SPEI HUÉRFANO | ref:{$concepto_limpio} rastreo:{$clave_rastreo} monto:{$monto_pesos}";
    }

    if (API_LOG_ENABLED) file_put_contents(API_LOG_FILE, "{$ts} | {$log_msg}\n", FILE_APPEND);
    responder(0, 'Pago procesado correctamente', $clave_rastreo);

} catch (\PDOException $e) {
    if (API_LOG_ENABLED) file_put_contents(API_LOG_FILE, "{$ts} | ❌ ERROR DB WEBHOOK: " . $e->getMessage() . "\n", FILE_APPEND);
    responder(99, 'Error de base de datos interno');
}