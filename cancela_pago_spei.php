<?php
/**
 * EduPago — Servicio de Cancelación de Pago (SPEI)
 * Doc: IntegracionesSpei_V1_4, sección "Servicio de Cancelación de Pago"
 *
 * Cobroscontarjeta.com llama: POST o DELETE https://TU_DOMINIO/cancela_pago_spei.php
 * Body: { clabe, fecha, monto, transaccion, autorizacion }
 * Solo puede cancelar un pago dentro del MISMO día en que se autorizó.
 *
 * Configurar en Sandbox → EndPoint → Pago por SPEI → "Cancelar pago" +
 * "Recibir cancelación por" (POST o DELETE, el que elijas aquí).
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

date_default_timezone_set('America/Mexico_City');
header('Content-Type: application/json; charset=UTF-8');

function responder_cancela_spei($codigo, $mensaje) {
    echo json_encode(['codigo' => $codigo, 'mensaje' => $mensaje], JSON_UNESCAPED_UNICODE);
    exit;
}

function log_cancela_spei($msg) {
    if (defined('REFERENCIA_LOG_FILE')) {
        file_put_contents(REFERENCIA_LOG_FILE, date('Y-m-d H:i:s') . ' | SPEI-CANCELA | ' . $msg . "\n", FILE_APPEND);
    }
}

$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);
log_cancela_spei("RAW ({$_SERVER['REQUEST_METHOD']}): {$raw}");

if (!$data || !is_array($data)) {
    responder_cancela_spei(50, 'Error de sistema');
}

$clabe = trim($data['clabe'] ?? '');

if (!$clabe) {
    responder_cancela_spei(50, 'Error de sistema');
}

try {
    $pdo->beginTransaction();

    $stmtCli = $pdo->prepare("SELECT id FROM clientes WHERE clabe_individual = ? LIMIT 1");
    $stmtCli->execute([$clabe]);
    $cliente = $stmtCli->fetch();

    if (!$cliente) {
        $pdo->rollBack();
        log_cancela_spei("clabe no encontrada: {$clabe}");
        responder_cancela_spei(0, 'Cancelación exitosa (sin registro que cancelar)');
    }

    // Se cancela el pago más reciente de ese alumno (el "último pago
    // realizado", como indica el manual para el caso general de referencias).
    $stmt = $pdo->prepare(
        "SELECT id, estado, fecha FROM cobros WHERE cliente_id = ? AND estado = 'pagado' ORDER BY id DESC LIMIT 1 FOR UPDATE"
    );
    $stmt->execute([$cliente['id']]);
    $cobro = $stmt->fetch();

    if (!$cobro) {
        $pdo->rollBack();
        log_cancela_spei("sin pago que cancelar: clabe:{$clabe}");
        responder_cancela_spei(0, 'Cancelación exitosa (sin registro que cancelar)');
    }

    if ($cobro['fecha'] !== date('Y-m-d')) {
        $pdo->rollBack();
        log_cancela_spei("fuera de periodo: cobro_id:{$cobro['id']} fecha_pago:{$cobro['fecha']}");
        responder_cancela_spei(60, 'Cancelación fuera de periodo');
    }

    $pdo->prepare("UPDATE cobros SET estado = 'cancelado' WHERE id = ?")->execute([$cobro['id']]);
    $pdo->prepare(
        "UPDATE clientes SET saldo_pendiente = (
            SELECT COALESCE(SUM(total), 0) FROM cobros WHERE cliente_id = ? AND estado = 'pendiente'
        ) WHERE id = ?"
    )->execute([$cliente['id'], $cliente['id']]);

    $pdo->commit();

    log_cancela_spei("OK: clabe:{$clabe} cobro_id:{$cobro['id']}");
    responder_cancela_spei(0, 'Cancelación exitosa');

} catch (\Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    log_cancela_spei("ERROR: " . $e->getMessage());
    responder_cancela_spei(50, 'Error de sistema');
}