<?php
/**
 * EduPago — Servicio de Autorización de Pago (SPEI)
 * Doc: IntegracionesSpei_V1_4, sección "Servicio de Autorización de Pago"
 *
 * Cobroscontarjeta.com llama: POST https://TU_DOMINIO/pago_clabe.php
 * Body: { clabe, fecha, monto, transaccion }
 * Respuesta esperada: HTTP 200 + JSON { codigo, autorizacion, mensaje, transaccion, fecha }
 *
 * Configurar en Sandbox → EndPoint → Pago por SPEI → "Pagar clabe".
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

header('Content-Type: application/json; charset=UTF-8');

function responder_pago_clabe($codigo, $mensaje, $autorizacion = '', $transaccion = '') {
    echo json_encode([
        'codigo'       => $codigo,
        'autorizacion' => $autorizacion,
        'mensaje'      => $mensaje,
        'transaccion'  => strval($transaccion),
        'fecha'        => date('Y-m-d'),
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function log_pago_clabe($msg) {
    if (defined('REFERENCIA_LOG_FILE')) {
        file_put_contents(REFERENCIA_LOG_FILE, date('Y-m-d H:i:s') . ' | SPEI-PAGO | ' . $msg . "\n", FILE_APPEND);
    }
}

$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);
log_pago_clabe("RAW: {$raw}");

if (!$data || !is_array($data)) {
    responder_pago_clabe(50, 'JSON inválido o body vacío');
}

$clabe       = trim($data['clabe'] ?? '');
$monto_cent  = intval($data['monto'] ?? 0);
$transaccion = trim(strval($data['transaccion'] ?? ''));

if (!$clabe || !preg_match('/^\d{18}$/', $clabe)) {
    log_pago_clabe("formato inválido: '{$clabe}'");
    responder_pago_clabe(15, 'Referencia con error de formato', '', $transaccion);
}

if ($monto_cent <= 0) {
    responder_pago_clabe(30, 'Monto inválido', '', $transaccion);
}

try {
    $pdo->beginTransaction();

    $stmtCli = $pdo->prepare(
        "SELECT id FROM clientes WHERE clabe_individual = ? AND clabe_individual_estado = 'activa' LIMIT 1"
    );
    $stmtCli->execute([$clabe]);
    $cliente = $stmtCli->fetch();

    if (!$cliente) {
        $pdo->rollBack();
        log_pago_clabe("clabe no encontrada: {$clabe}");
        responder_pago_clabe(40, 'Adquiriente inválido', '', $transaccion);
    }

    // transaccion viene de consulta_clabe.php como el id del cobro que se
    // consultó. Si por alguna razón no llega (o CCT manda otra cosa), se
    // hace fallback al cobro pendiente más antiguo del mismo alumno.
    if ($transaccion !== '' && ctype_digit($transaccion)) {
        $stmtCob = $pdo->prepare(
            "SELECT id, total, estado, auth_code FROM cobros WHERE id = ? AND cliente_id = ? FOR UPDATE"
        );
        $stmtCob->execute([$transaccion, $cliente['id']]);
        $cobro = $stmtCob->fetch();
    } else {
        $cobro = null;
    }

    if (!$cobro) {
        $stmtCob = $pdo->prepare(
            "SELECT id, total, estado, auth_code FROM cobros WHERE cliente_id = ? AND estado = 'pendiente' ORDER BY id ASC LIMIT 1 FOR UPDATE"
        );
        $stmtCob->execute([$cliente['id']]);
        $cobro = $stmtCob->fetch();
    }

    if (!$cobro) {
        $pdo->rollBack();
        log_pago_clabe("sin cobro para clabe:{$clabe} transaccion:{$transaccion}");
        responder_pago_clabe(40, 'Adquiriente inválido', '', $transaccion);
    }

    // Idempotencia.
    if ($cobro['estado'] === 'pagado') {
        $pdo->rollBack();
        log_pago_clabe("ya pagado (idempotente): cobro_id:{$cobro['id']}");
        responder_pago_clabe(0, 'Operación exitosa', $cobro['auth_code'] ?: '00000000', $transaccion ?: $cobro['id']);
    }

    if ($cobro['estado'] === 'cancelado') {
        $pdo->rollBack();
        log_pago_clabe("cancelado, no se puede pagar: cobro_id:{$cobro['id']}");
        responder_pago_clabe(13, 'Referencia sin adeudo', '', $transaccion);
    }

    $monto_esperado_cent = intval(round(floatval($cobro['total']) * 100));
    if ($monto_cent !== $monto_esperado_cent) {
        $pdo->rollBack();
        log_pago_clabe("monto no coincide: cobro_id:{$cobro['id']} esperado:{$monto_esperado_cent} recibido:{$monto_cent}");
        responder_pago_clabe(30, 'Monto inválido', '', $transaccion);
    }

    $autorizacion = str_pad(strval(rand(0, 99999999)), 8, '0', STR_PAD_LEFT);

    $pdo->prepare("UPDATE cobros SET estado = 'pagado', auth_code = ? WHERE id = ?")
        ->execute([$autorizacion, $cobro['id']]);

    $pdo->prepare(
        "UPDATE clientes SET saldo_pendiente = (
            SELECT COALESCE(SUM(total), 0) FROM cobros WHERE cliente_id = ? AND estado = 'pendiente'
        ) WHERE id = ?"
    )->execute([$cliente['id'], $cliente['id']]);

    $pdo->commit();

    log_pago_clabe("OK: clabe:{$clabe} cobro_id:{$cobro['id']} auth:{$autorizacion}");
    responder_pago_clabe(0, 'Operación exitosa', $autorizacion, $transaccion ?: $cobro['id']);

} catch (\Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    log_pago_clabe("ERROR: " . $e->getMessage());
    responder_pago_clabe(50, 'Error de sistema', '', $transaccion ?? '');
}