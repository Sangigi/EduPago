<?php
/**
 * EduPago — Servicio de Cancelación de Pago (efectivo OXXO/terceros)
 * Doc: IntegracionesReferencias_V1_4, sección "Servicio de Cancelación de Pago"
 *
 * Cobroscontarjeta.com llama: POST o DELETE https://TU_DOMINIO/webhooks/cancela_pago_referencia.php
 * Body: { referencia, fecha, monto, transaccion, autorizacion }
 * Solo puede cancelar un pago dado dentro del MISMO día en que se autorizó.
 *
 * Configurar en Sandbox → EndPoint → Comercios → "Cancelar pago" +
 * "Recibir cancelación por" (elige el método HTTP que uses aquí, POST o DELETE).
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/helpers_pagos.php';
require_once __DIR__ . '/../lib/webhook_helpers.php';

date_default_timezone_set('America/Mexico_City');
header('Content-Type: application/json; charset=UTF-8');

function responder_cancela($codigo, $mensaje) {
    webhook_responder(['codigo' => $codigo, 'mensaje' => $mensaje]);
}

function log_ref_cancela($msg) {
    if (defined('REFERENCIA_LOG_FILE')) {
        webhook_log(REFERENCIA_LOG_FILE, 'CANCELA | ' . $msg);
    }
}

if (!ip_permitida_pago_sin_token()) {
    log_ref_cancela("RECHAZADO por IP no permitida: " . ($_SERVER['REMOTE_ADDR'] ?? '?'));
    responder_cancela(50, 'No autorizado');
}

$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);
log_ref_cancela("RAW ({$_SERVER['REQUEST_METHOD']}): {$raw}");

if (!$data || !is_array($data)) {
    responder_cancela(50, 'Error de sistema');
}

$referencia   = trim($data['referencia'] ?? '');
$autorizacion = trim($data['autorizacion'] ?? '');
$transaccion  = trim($data['transaccion'] ?? '');

if (!$referencia) {
    responder_cancela(50, 'Error de sistema');
}

try {
    $pdo->beginTransaction();

    $stmt = $pdo->prepare(
        "SELECT id, estado, cliente_id, fecha, auth_code FROM cobros
         WHERE referencia = ? AND metodo = 'EfectivoRef' ORDER BY id DESC LIMIT 1 FOR UPDATE"
    );
    $stmt->execute([$referencia]);
    $cobro = $stmt->fetch();

    if (!$cobro) {
        $pdo->rollBack();
        log_ref_cancela("no encontrada: {$referencia}");
        // El manual no da un código específico para "no existe" en este
        // servicio; se usa 0 con mensaje aclaratorio para no bloquear al
        // proveedor con un error indefinido (comportamiento idempotente).
        responder_cancela(0, 'Cancelación exitosa (sin registro que cancelar)');
    }

    // Idempotencia: si ya estaba cancelada, el manual exige responder 0 igual.
    if ($cobro['estado'] === 'cancelado') {
        $pdo->rollBack();
        log_ref_cancela("ya estaba cancelada: {$referencia} cobro_id:{$cobro['id']}");
        responder_cancela(0, 'Cancelación exitosa');
    }

    // Regla del manual: solo se puede cancelar el mismo día en que se autorizó.
    if ($cobro['estado'] === 'pagado' && $cobro['fecha'] !== date('Y-m-d')) {
        $pdo->rollBack();
        log_ref_cancela("fuera de periodo: {$referencia} cobro_id:{$cobro['id']} fecha_pago:{$cobro['fecha']}");
        responder_cancela(60, 'Cancelación fuera de periodo');
    }

    // Si el pago ya estaba 'pagado' (dinero real ya recibido), exigir que la
    // autorización recibida coincida con la que se guardó al confirmarlo —
    // antes se revertía a 'cancelado' solo con conocer la referencia (el
    // mismo dato que ya conoce la familia que debía el dinero), sin probar
    // que quien cancela en verdad conoce el auth_code real de ESE pago.
    if ($cobro['estado'] === 'pagado' && (!$autorizacion || $autorizacion !== ($cobro['auth_code'] ?? ''))) {
        $pdo->rollBack();
        log_ref_cancela("autorización no coincide: {$referencia} cobro_id:{$cobro['id']} esperado:{$cobro['auth_code']} recibido:{$autorizacion}");
        responder_cancela(60, 'Autorización no coincide con el pago registrado');
    }

    // Soft-cancel: nunca se borra el registro, se conserva para auditoría.
    $pdo->prepare("UPDATE cobros SET estado = 'cancelado' WHERE id = ?")->execute([$cobro['id']]);

    if (!empty($cobro['cliente_id'])) {
        recalcular_saldo_pendiente($pdo, intval($cobro['cliente_id']));
    }

    $pdo->commit();

    log_ref_cancela("OK: {$referencia} cobro_id:{$cobro['id']}");
    responder_cancela(0, 'Cancelación exitosa');

} catch (\Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    log_ref_cancela("ERROR: " . $e->getMessage());
    responder_cancela(50, 'Error de sistema');
}