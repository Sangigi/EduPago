<?php



/**



 * EduPago — Servicio de Autorización de Pago (efectivo OXXO/terceros)



 * Doc: IntegracionesReferencias_V1_4, sección "Servicio de Autorización de Pago"



 *



 * Cobroscontarjeta.com llama: POST https://TU_DOMINIO/pago_referencia.php



 * Body: { referencia, fecha, monto, transaccion }



 * Respuesta esperada: HTTP 200 + JSON { codigo, autorizacion, mensaje, transaccion, fecha, ... }



 *



 * Configurar esta URL en el Sandbox → EndPoint → Comercios → "Pagar referencia".



 */







require_once __DIR__ . '/config.php';



require_once __DIR__ . '/db.php';
require_once __DIR__ . '/helpers_pagos.php';






header('Content-Type: application/json; charset=UTF-8');







function responder_pago($codigo, $mensaje, $autorizacion = '', $transaccion = '') {



    echo json_encode([



        'codigo'            => $codigo,



        'autorizacion'      => $autorizacion,



        'mensaje'           => $mensaje,



        'transaccion'       => strval($transaccion),



        'fecha'             => date('Y-m-d'),



        'notificacion_sms'  => '',



        'mensaje_sms'       => '',



        'mensaje_ticket'    => '',



    ], JSON_UNESCAPED_UNICODE);



    exit;



}







function log_ref_pago($msg) {



    if (defined('REFERENCIA_LOG_FILE')) {



        file_put_contents(REFERENCIA_LOG_FILE, date('Y-m-d H:i:s') . ' | PAGO | ' . $msg . "\n", FILE_APPEND);



    }



}







if (!ip_permitida_pago_sin_token()) {
    log_ref_pago("RECHAZADO por IP no permitida: " . ($_SERVER['REMOTE_ADDR'] ?? '?'));
    responder_pago(40, 'No autorizado');
}

$raw  = file_get_contents('php://input');



$data = json_decode($raw, true);



log_ref_pago("RAW: {$raw}");







if (!$data || !is_array($data)) {



    responder_pago(50, 'JSON inválido o body vacío');



}







$referencia  = trim($data['referencia'] ?? '');



$fecha       = trim($data['fecha'] ?? '');



$monto_cent  = intval($data['monto'] ?? 0);



$transaccion = trim($data['transaccion'] ?? '');







if (!$referencia || !preg_match('/^\d+$/', $referencia)) {



    log_ref_pago("formato inválido: '{$referencia}'");



    responder_pago(15, 'Referencia con error de formato', '', $transaccion);



}







if ($monto_cent <= 0) {



    responder_pago(30, 'Monto inválido', '', $transaccion);



}







try {



    $pdo->beginTransaction();







    // SELECT ... FOR UPDATE para que dos confirmaciones simultáneas de la



    // misma referencia (reintento de red de CCT) no dupliquen el pago.



    $stmt = $pdo->prepare(



        "SELECT id, total, estado, cliente_id, auth_code FROM cobros



         WHERE referencia = ? AND metodo = 'EfectivoRef' ORDER BY id DESC LIMIT 1 FOR UPDATE"



    );



    $stmt->execute([$referencia]);



    $cobro = $stmt->fetch();







    if (!$cobro) {



        $pdo->rollBack();



        log_ref_pago("no encontrada: {$referencia}");



        responder_pago(40, 'Adquiriente inválido', '', $transaccion);



    }







    // Idempotencia: si ya está pagada, responder 0 sin volver a cobrar



    // (mismo criterio que exige la doc para cancelaciones repetidas).



    if ($cobro['estado'] === 'pagado') {



        $pdo->rollBack();



        log_ref_pago("ya pagada (idempotente): {$referencia} cobro_id:{$cobro['id']}");



        responder_pago(0, 'Operación exitosa', $cobro['auth_code'] ?: '00000000', $transaccion);



    }







    if ($cobro['estado'] === 'cancelado') {



        $pdo->rollBack();



        log_ref_pago("cancelada, no se puede pagar: {$referencia}");



        responder_pago(13, 'Referencia sin adeudo', '', $transaccion);



    }







    $monto_esperado_cent = intval(round(floatval($cobro['total']) * 100));



    if ($monto_cent !== $monto_esperado_cent) {



        $pdo->rollBack();



        log_ref_pago("monto no coincide: {$referencia} esperado:{$monto_esperado_cent} recibido:{$monto_cent}");



        responder_pago(30, 'Monto inválido', '', $transaccion);



    }







    $autorizacion = str_pad(strval(rand(0, 99999999)), 8, '0', STR_PAD_LEFT);







    $pdo->prepare("UPDATE cobros SET estado = 'pagado', auth_code = ?, ref_transaccion = ?, fecha = CURRENT_DATE WHERE id = ?")



        ->execute([$autorizacion, $transaccion, $cobro['id']]);







    if (!empty($cobro['cliente_id'])) {
        recalcular_saldo_pendiente($pdo, intval($cobro['cliente_id']));
    }







    $pdo->commit();







    log_ref_pago("OK: {$referencia} cobro_id:{$cobro['id']} auth:{$autorizacion}");



    responder_pago(0, 'Operación exitosa', $autorizacion, $transaccion);







} catch (\Throwable $e) {



    if ($pdo->inTransaction()) $pdo->rollBack();



    log_ref_pago("ERROR: " . $e->getMessage());



    responder_pago(50, 'Error de sistema', '', $transaccion ?? '');



}
