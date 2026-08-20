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
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/helpers_pagos.php';
require_once __DIR__ . '/lib/webhook_helpers.php';

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
        webhook_log(REFERENCIA_LOG_FILE, 'SPEI-PAGO | ' . $msg);
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

    // Se cobran TODOS los pendientes del alumno en un solo pago — antes solo
    // se buscaba UN cobro (por 'transaccion' o el más viejo), así que si el
    // alumno tenía dos o más conceptos pendientes por separado (ej.
    // colegiatura + inscripción), pagar la suma de ambos en un solo depósito
    // SPEI siempre fallaba con "Monto inválido", y un pendiente viejo
    // olvidado bloqueaba para siempre cualquier pago nuevo.
    $stmtPend = $pdo->prepare(
        "SELECT id, total, auth_code FROM cobros WHERE cliente_id = ? AND estado = 'pendiente' ORDER BY id ASC FOR UPDATE"
    );
    $stmtPend->execute([$cliente['id']]);
    $pendientes = $stmtPend->fetchAll();

    if (empty($pendientes)) {
        // Nada pendiente: puede ser un reintento del banco sobre un pago que
        // ya se procesó por completo — idempotente, no un error, si ya hay
        // algo pagado con auth_code (evita que un reintento legítimo del
        // proveedor se tope con un falso "Adquiriente inválido").
        $stmtUltimo = $pdo->prepare(
            "SELECT auth_code FROM cobros WHERE cliente_id = ? AND estado = 'pagado' AND auth_code IS NOT NULL ORDER BY id DESC LIMIT 1"
        );
        $stmtUltimo->execute([$cliente['id']]);
        $ultimo = $stmtUltimo->fetch();
        $pdo->rollBack();
        if ($ultimo) {
            log_pago_clabe("ya pagado (idempotente, sin pendientes): cliente:{$cliente['id']}");
            responder_pago_clabe(0, 'Operación exitosa', $ultimo['auth_code'], $transaccion);
        }
        log_pago_clabe("sin pendientes para clabe:{$clabe} cliente:{$cliente['id']}");
        responder_pago_clabe(40, 'Adquiriente inválido', '', $transaccion);
    }

    $total_pendiente = 0.0;
    foreach ($pendientes as $p) { $total_pendiente += floatval($p['total']); }
    $monto_esperado_cent = intval(round($total_pendiente * 100));

    if ($monto_cent !== $monto_esperado_cent) {
        $pdo->rollBack();
        log_pago_clabe("monto no coincide: cliente:{$cliente['id']} esperado:{$monto_esperado_cent} recibido:{$monto_cent} pendientes:" . count($pendientes));
        responder_pago_clabe(30, 'Monto inválido', '', $transaccion);
    }

    $autorizacion = str_pad(strval(rand(0, 99999999)), 8, '0', STR_PAD_LEFT);

    $idsPendientes = array_map(function ($p) { return intval($p['id']); }, $pendientes);
    $placeholders  = implode(',', array_fill(0, count($idsPendientes), '?'));
    $pdo->prepare("UPDATE cobros SET estado = 'pagado', auth_code = ? WHERE id IN ($placeholders)")
        ->execute(array_merge([$autorizacion], $idsPendientes));

    recalcular_saldo_pendiente($pdo, intval($cliente['id']));

    $pdo->commit();

    log_pago_clabe("OK: clabe:{$clabe} cliente:{$cliente['id']} cobros_pagados:" . implode(',', $idsPendientes) . " auth:{$autorizacion}");
    responder_pago_clabe(0, 'Operación exitosa', $autorizacion, $transaccion ?: $cliente['id']);

} catch (\Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    log_pago_clabe("ERROR: " . $e->getMessage());
    responder_pago_clabe(50, 'Error de sistema', '', $transaccion ?? '');
}
