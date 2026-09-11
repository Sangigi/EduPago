<?php



/**



 * EduPago — Servicio de Autorización de Pago (efectivo OXXO/terceros)



 * Doc: IntegracionesReferencias_V1_4, sección "Servicio de Autorización de Pago"



 *



 * Cobroscontarjeta.com llama: POST https://TU_DOMINIO/webhooks/pago_referencia.php



 * Body: { referencia, fecha, monto, transaccion }



 * Respuesta esperada: HTTP 200 + JSON { codigo, autorizacion, mensaje, transaccion, fecha, ... }



 *



 * Configurar esta URL en el Sandbox → EndPoint → Comercios → "Pagar referencia".



 */







require_once __DIR__ . '/../config.php';



require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/helpers_pagos.php';
require_once __DIR__ . '/../lib/webhook_helpers.php';






header('Content-Type: application/json; charset=UTF-8');







function responder_pago($codigo, $mensaje, $autorizacion = '', $transaccion = '') {
    webhook_responder([
        'codigo' => $codigo,
        'autorizacion' => $autorizacion,
        'mensaje' => $mensaje,
        'transaccion' => strval($transaccion),
        'fecha' => date('Y-m-d'),
        'notificacion_sms' => '',
        'mensaje_sms' => '',
        'mensaje_ticket' => '',
    ]);
}







function log_ref_pago($msg) {
    if (defined('REFERENCIA_LOG_FILE')) {
        webhook_log(REFERENCIA_LOG_FILE, 'PAGO | ' . $msg);
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

    // Igual que en webhook_liga.php: si no es un cobro suelto de alumno,
    // puede ser un pago AGRUPADO (Portal Familia), de RENOVACIÓN (colegio
    // ya activo) o de SUSCRIPCIÓN NUEVA (colegio en registro) pagado en
    // efectivo — antes este webhook solo sabía confirmar cobros sueltos, así
    // que cualquiera de estos tres casos pagados en tienda se quedaba sin
    // conciliar para siempre (código 40 "Adquiriente inválido").
    if (!$cobro) {
        $stmtGrp = $pdo->prepare(
            "SELECT id, cliente_id, total, estado, auth_code
               FROM cobros_agrupados WHERE referencia = ? LIMIT 1"
        );
        $stmtGrp->execute([$referencia]);
        $grp = $stmtGrp->fetch();

        if ($grp) {
            if ($grp['estado'] === 'pagado') {
                $pdo->rollBack();
                log_ref_pago("agrupado ya pagado (idempotente): {$referencia} agrupado_id:{$grp['id']}");
                responder_pago(0, 'Operación exitosa', $grp['auth_code'] ?: '00000000', $transaccion);
            }
            $monto_esperado_grp = intval(round(floatval($grp['total']) * 100));
            if ($monto_cent !== $monto_esperado_grp) {
                $pdo->rollBack();
                log_ref_pago("agrupado monto no coincide: {$referencia} esperado:{$monto_esperado_grp} recibido:{$monto_cent}");
                responder_pago(30, 'Monto inválido', '', $transaccion);
            }
            $autorizacionGrp = str_pad(strval(rand(0, 99999999)), 8, '0', STR_PAD_LEFT);

            $pdo->prepare("UPDATE cobros_agrupados SET estado = 'pagado', auth_code = ?, pagado_en = NOW() WHERE id = ?")
                ->execute([$autorizacionGrp, $grp['id']]);
            $stmtDetalle = $pdo->prepare("SELECT cobro_id FROM cobros_agrupados_detalle WHERE cobro_agrupado_id = ?");
            $stmtDetalle->execute([$grp['id']]);
            $idsDetalle = array_column($stmtDetalle->fetchAll(), 'cobro_id');
            if ($idsDetalle) {
                $inPlaceholders = implode(',', array_fill(0, count($idsDetalle), '?'));
                // metodo = 'EfectivoRef' (10-sep-2026, mismo arreglo que en
                // webhook_liga.php): sin esto cobros.metodo se quedaba vacío
                // para todo pago agrupado en efectivo y la gráfica de "por
                // método" lo perdía en "Otro / sin método".
                $pdo->prepare("UPDATE cobros SET estado = 'pagado', metodo = 'EfectivoRef', auth_code = ?, referencia = ? WHERE id IN ($inPlaceholders)")
                    ->execute(array_merge([$autorizacionGrp, $referencia], $idsDetalle));
            }
            if (!empty($grp['cliente_id'])) recalcular_saldo_pendiente($pdo, intval($grp['cliente_id']));

            $pdo->commit();
            log_ref_pago("OK agrupado: {$referencia} agrupado_id:{$grp['id']} auth:{$autorizacionGrp} cobros:" . implode(',', $idsDetalle));
            responder_pago(0, 'Operación exitosa', $autorizacionGrp, $transaccion);
        }
    }

    if (!$cobro) {
        $stmtEsc = $pdo->prepare(
            "SELECT id, nombre, fecha_vencimiento_plan, pago_renovacion_monto, modo, fecha_fin_prueba
               FROM escuelas WHERE pago_renovacion_referencia = ? LIMIT 1"
        );
        $stmtEsc->execute([$referencia]);
        $escRenov = $stmtEsc->fetch();

        if ($escRenov) {
            $monto_esperado_esc = intval(round(floatval($escRenov['pago_renovacion_monto']) * 100));
            if ($monto_cent !== $monto_esperado_esc) {
                $pdo->rollBack();
                log_ref_pago("renovación monto no coincide: {$referencia} esperado:{$monto_esperado_esc} recibido:{$monto_cent}");
                responder_pago(30, 'Monto inválido', '', $transaccion);
            }
            // Modo demo (11-sep-2026, requisito de la junta): mismo criterio
            // que webhook_liga.php -- si la escuela sigue DENTRO de su
            // periodo de prueba, el mes pagado se SUMA a los días de prueba
            // que quedaban, en vez de empezar a contar desde hoy.
            $enDemoVigenteRef = ($escRenov['modo'] ?? 'activa') === 'demo'
                && !empty($escRenov['fecha_fin_prueba'])
                && strtotime($escRenov['fecha_fin_prueba']) >= strtotime(date('Y-m-d'));
            if ($enDemoVigenteRef) {
                $baseRenov = $escRenov['fecha_fin_prueba'];
            } else {
                $baseRenov = $escRenov['fecha_vencimiento_plan'];
                if (!$baseRenov || strtotime($baseRenov) < strtotime(date('Y-m-d'))) $baseRenov = date('Y-m-d');
            }
            $nuevoVencimiento = siguiente_vencimiento_mensual($baseRenov);
            $autorizacionEsc = str_pad(strval(rand(0, 99999999)), 8, '0', STR_PAD_LEFT);

            $pdo->prepare(
                "UPDATE escuelas
                    SET fecha_vencimiento_plan = ?, ultimo_recordatorio_plan = NULL,
                        pago_renovacion_referencia = NULL, pago_renovacion_folio = NULL, pago_renovacion_monto = NULL,
                        modo = 'activa', fecha_fin_prueba = NULL
                  WHERE id = ?"
            )->execute([$nuevoVencimiento, $escRenov['id']]);
            registrar_log($pdo, ['user_id' => null, 'rol' => 'sistema'], 'suscripcion_renovada_automatico',
                "Escuela '{$escRenov['nombre']}' #{$escRenov['id']}: pago en efectivo detectado, vencimiento -> {$nuevoVencimiento}",
                $escRenov['id']);

            $pdo->commit();
            log_ref_pago("OK renovación: {$referencia} escuela_id:{$escRenov['id']} auth:{$autorizacionEsc} nuevo_vencimiento:{$nuevoVencimiento}");
            responder_pago(0, 'Operación exitosa', $autorizacionEsc, $transaccion);
        }
    }

    if (!$cobro) {
        $stmtInv = $pdo->prepare(
            "SELECT id, monto_suscripcion, estado, pago_auth_code
               FROM invitaciones_colegio WHERE pago_referencia = ? LIMIT 1"
        );
        $stmtInv->execute([$referencia]);
        $inv = $stmtInv->fetch();

        if ($inv) {
            if ($inv['estado'] === 'pagado' || $inv['estado'] === 'aprobada') {
                $pdo->rollBack();
                log_ref_pago("suscripción ya pagada (idempotente): {$referencia} invitacion_id:{$inv['id']}");
                responder_pago(0, 'Operación exitosa', $inv['pago_auth_code'] ?: '00000000', $transaccion);
            }
            $monto_esperado_inv = intval(round(floatval($inv['monto_suscripcion']) * 100));
            if ($monto_cent !== $monto_esperado_inv) {
                $pdo->rollBack();
                log_ref_pago("suscripción monto no coincide: {$referencia} esperado:{$monto_esperado_inv} recibido:{$monto_cent}");
                responder_pago(30, 'Monto inválido', '', $transaccion);
            }
            $autorizacionInv = str_pad(strval(rand(0, 99999999)), 8, '0', STR_PAD_LEFT);

            $pdo->prepare(
                "UPDATE invitaciones_colegio SET estado = 'pagado', pago_auth_code = ?, pagado_en = NOW() WHERE id = ?"
            )->execute([$autorizacionInv, $inv['id']]);

            $pdo->commit();
            log_ref_pago("OK suscripción nueva: {$referencia} invitacion_id:{$inv['id']} auth:{$autorizacionInv}");
            responder_pago(0, 'Operación exitosa', $autorizacionInv, $transaccion);
        }
    }

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
