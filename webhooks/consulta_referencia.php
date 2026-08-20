<?php
/**
 * EduPago — Servicio de Consulta de Referencia (efectivo OXXO/terceros)
 * Doc: IntegracionesReferencias_V1_4, sección "Servicio de Consulta de Referencia"
 *
 * Cobroscontarjeta.com llama: GET https://TU_DOMINIO/webhooks/consulta_referencia.php?r=REFERENCIA
 * Body de la petición: vacío (según doc).
 * Respuesta esperada: HTTP 200 + JSON { codigo, mensaje, monto, referencia, transaccion, parcial }
 *
 * Configurar esta URL (sin query string, CCT agrega /?r=REFERENCIA solo) en
 * el Sandbox → EndPoint → Comercios → "Consultar referencia".
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/webhook_helpers.php';

header('Content-Type: application/json; charset=UTF-8');

function responder_consulta($codigo, $mensaje, $monto = 0, $referencia = '', $transaccion = 0) {
    webhook_responder([
        'codigo'      => $codigo,
        'mensaje'     => $mensaje,
        'monto'       => strval($monto),
        'referencia'  => $referencia,
        'transaccion' => strval($transaccion),
        'parcial'     => true, // el manual exige que siempre vaya en true
    ]);
}

function log_ref($msg) {
    if (defined('REFERENCIA_LOG_FILE')) {
        webhook_log(REFERENCIA_LOG_FILE, 'CONSULTA | ' . $msg);
    }
}

$referencia = trim($_GET['r'] ?? '');

if (!$referencia || !preg_match('/^\d+$/', $referencia)) {
    log_ref("formato inválido: '{$referencia}'");
    responder_consulta(15, 'Referencia con error de formato');
}

try {
    $stmt = $pdo->prepare(
        "SELECT id, total, estado, ref_vencimiento FROM cobros WHERE referencia = ? AND metodo = 'EfectivoRef' ORDER BY id DESC LIMIT 1"
    );
    $stmt->execute([$referencia]);
    $cobro = $stmt->fetch();

    if (!$cobro) {
        log_ref("no encontrada: {$referencia}");
        responder_consulta(40, 'Adquiriente inválido', 0, $referencia);
    }

    if ($cobro['estado'] === 'pagado') {
        log_ref("ya pagada: {$referencia} cobro_id:{$cobro['id']}");
        responder_consulta(13, 'Referencia sin adeudo', 0, $referencia);
    }

    if ($cobro['estado'] === 'cancelado') {
        log_ref("cancelada: {$referencia} cobro_id:{$cobro['id']}");
        responder_consulta(13, 'Referencia cancelada', 0, $referencia);
    }

    if ($cobro['ref_vencimiento'] && strtotime($cobro['ref_vencimiento']) < strtotime(date('Y-m-d'))) {
        log_ref("vencida: {$referencia} cobro_id:{$cobro['id']}");
        responder_consulta(14, 'Referencia fuera de vigencia', 0, $referencia);
    }

    // Identificador consecutivo de la operación — usamos el id del cobro,
    // suficiente porque es único y estable para toda la vida de esa referencia.
    $transaccion = intval($cobro['id']);
    $monto_centavos = intval(round(floatval($cobro['total']) * 100));

    log_ref("OK: {$referencia} cobro_id:{$cobro['id']} monto:{$monto_centavos}");
    responder_consulta(0, 'Operación exitosa', $monto_centavos, $referencia, $transaccion);

} catch (\Throwable $e) {
    log_ref("ERROR: " . $e->getMessage());
    responder_consulta(50, 'Error de sistema', 0, $referencia);
}