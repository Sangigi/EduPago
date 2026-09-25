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



        "SELECT id, total, estado, cliente_id, escuela_id, auth_code FROM cobros



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
        // FOR UPDATE (11-sep-2026, hallado en revisión adversarial): mismo
        // motivo exacto que ya tiene la rama de `cobros` de arriba -- sin
        // esto, dos confirmaciones simultáneas de la misma referencia
        // (reintento de red de CCT) pueden leer "no pagado aún" antes de que
        // cualquiera haga commit, y la segunda sobreescribe en silencio el
        // auth_code de la primera.
        $stmtGrp = $pdo->prepare(
            // escuela_id va en el SELECT (22-sep-2026): más abajo se lee
            // $grp['escuela_id'] al registrar un pago no aplicado, y sin él esa
            // fila quedaba siempre con escuela NULL — invisible en el panel del
            // admin del colegio, que solo ve lo de su propia escuela.
            "SELECT id, cliente_id, escuela_id, total, estado, auth_code
               FROM cobros_agrupados WHERE referencia = ? LIMIT 1 FOR UPDATE"
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
                registrar_pago_no_aplicado($pdo, [
                    'canal'          => 'efectivo',
                    'motivo'         => 'monto_no_coincide',
                    'referencia'     => $referencia,
                    'transaccion'    => $transaccion,
                    'monto_recibido' => $monto_cent / 100,
                    'monto_esperado' => $monto_esperado_grp / 100,
                    'cliente_id'     => $grp['cliente_id'] ?? null,
                    'escuela_id'     => $grp['escuela_id'] ?? null,
                    'payload_raw'    => $raw,
                ]);
                responder_pago(30, 'Monto inválido', '', $transaccion);
            }
            $autorizacionGrp = str_pad(strval(rand(0, 99999999)), 8, '0', STR_PAD_LEFT);

            $pdo->prepare("UPDATE cobros_agrupados SET estado = 'pagado', auth_code = ?, pagado_en = NOW() WHERE id = ?")
                ->execute([$autorizacionGrp, $grp['id']]);
            $stmtDetalle = $pdo->prepare("SELECT cobro_id FROM cobros_agrupados_detalle WHERE cobro_agrupado_id = ?");
            $stmtDetalle->execute([$grp['id']]);
            $idsDetalle = array_column($stmtDetalle->fetchAll(), 'cobro_id');
            // El importe recibido se REPARTE como abonos, cobro por cobro
            // (22-sep-2026). Antes se liquidaba de golpe con
            //   UPDATE cobros SET estado='pagado', monto_pagado = total ...
            // contra el total CONGELADO en cobros_agrupados al generar la
            // referencia. Esa referencia vive días, y cualquier abono que
            // entrara mientras tanto se cobraba dos veces: la familia pagaba
            // $600 por SPEI el día 2 y los $1,000 congelados el día 4, y el
            // monto_pagado = total borraba la evidencia — sin renglón en el
            // libro mayor y sin una sola fila en pagos_no_aplicados. Antes de
            // los abonos no podía pasar, porque un depósito parcial se
            // rechazaba con código 30 y el proveedor lo devolvía.
            //
            // Repartiendo con aplicar_abono_a_cobro() se respeta lo que cada
            // cobro DEBE hoy, el sobrante queda registrado, y los cobros que no
            // alcanzan a cubrirse se quedan pendientes con su abono, que es lo
            // correcto.
            $sobranteGrp = 0.0;
            if ($idsDetalle) {
                $inPlaceholders = implode(',', array_fill(0, count($idsDetalle), '?'));
                // Bloqueo explícito: aplicar_abono_a_cobro() exige que el
                // llamador tenga los cobros tomados con FOR UPDATE.
                $pdo->prepare("SELECT id FROM cobros WHERE id IN ($inPlaceholders) FOR UPDATE")
                    ->execute($idsDetalle);

                $restanteGrp = $monto_cent / 100;
                $llaveGrp    = false;
                foreach ($idsDetalle as $cidGrp) {
                    if ($restanteGrp <= 0.004) break;
                    $datosGrp = [
                        'metodo'      => 'EfectivoRef',
                        'referencia'  => $referencia,
                        'transaccion' => $transaccion,
                        'auth_code'   => $autorizacionGrp,
                        'origen'      => 'webhook_referencia',
                    ];
                    // La llave de idempotencia solo en el primer renglón que de
                    // verdad se inserte — mismo criterio que aplicar_abono_a_cliente.
                    if ($llaveGrp) $datosGrp['sin_idem'] = true;
                    $rGrp = aplicar_abono_a_cobro($pdo, intval($cidGrp), $restanteGrp, $datosGrp);
                    if ($rGrp['aplicado'] > 0) {
                        $llaveGrp    = true;
                        $restanteGrp = round($restanteGrp - $rGrp['aplicado'], 2);
                    }
                }
                $sobranteGrp = round($restanteGrp, 2);

                // metodo = 'EfectivoRef' (10-sep-2026, mismo arreglo que en
                // webhook_liga.php): sin esto cobros.metodo se quedaba vacío
                // para todo pago agrupado en efectivo y la gráfica de "por
                // método" lo perdía en "Otro / sin método". El estado y el
                // monto_pagado ya los movió el reparto de arriba.
                $pdo->prepare(
                    "UPDATE cobros SET metodo = 'EfectivoRef',
                                       auth_code = COALESCE(NULLIF(auth_code, ''), ?),
                                       referencia = ?
                      WHERE id IN ($inPlaceholders)"
                )->execute(array_merge([$autorizacionGrp, $referencia], $idsDetalle));
            }
            if (!empty($grp['cliente_id'])) recalcular_saldo_pendiente($pdo, intval($grp['cliente_id']));

            $pdo->commit();
            log_ref_pago("OK agrupado: {$referencia} agrupado_id:{$grp['id']} auth:{$autorizacionGrp} cobros:" . implode(',', $idsDetalle) . ($sobranteGrp > 0.004 ? " SOBRANTE:{$sobranteGrp}" : ''));

            // Sobrante: llegó más de lo que los cobros del grupo debían hoy
            // (típicamente porque alguien abonó entre la generación de la
            // referencia y su pago). Queda registrado para que el colegio lo
            // resuelva. DESPUÉS del commit, regla 1 de registrar_pago_no_aplicado.
            if ($sobranteGrp > 0.004) {
                registrar_pago_no_aplicado($pdo, [
                    'canal'          => 'efectivo',
                    'motivo'         => 'sobrepago',
                    'referencia'     => $referencia,
                    'transaccion'    => $transaccion !== '' ? $transaccion . '-sobrante' : '',
                    'auth_code'      => $autorizacionGrp,
                    'monto_recibido' => $sobranteGrp,
                    'monto_esperado' => 0,
                    'cliente_id'     => $grp['cliente_id'] ?? null,
                    'escuela_id'     => $grp['escuela_id'] ?? null,
                    'payload_raw'    => $raw,
                ]);
            }
            responder_pago(0, 'Operación exitosa', $autorizacionGrp, $transaccion);
        }
    }

    if (!$cobro) {
        // FOR UPDATE: mismo motivo que la rama de cobros_agrupados de arriba.
        $stmtEsc = $pdo->prepare(
            "SELECT id, nombre, plan, fecha_vencimiento_plan, pago_renovacion_monto,
                    pago_renovacion_folio, pago_renovacion_plan, modo, fecha_fin_prueba
               FROM escuelas WHERE pago_renovacion_referencia = ? LIMIT 1 FOR UPDATE"
        );
        $stmtEsc->execute([$referencia]);
        $escRenov = $stmtEsc->fetch();

        if ($escRenov) {
            $monto_esperado_esc = intval(round(floatval($escRenov['pago_renovacion_monto']) * 100));
            if ($monto_cent !== $monto_esperado_esc) {
                $pdo->rollBack();
                log_ref_pago("renovación monto no coincide: {$referencia} esperado:{$monto_esperado_esc} recibido:{$monto_cent}");
                registrar_pago_no_aplicado($pdo, [
                    'canal'          => 'efectivo',
                    'motivo'         => 'monto_no_coincide',
                    'referencia'     => $referencia,
                    'transaccion'    => $transaccion,
                    'monto_recibido' => $monto_cent / 100,
                    'monto_esperado' => $monto_esperado_esc / 100,
                    'escuela_id'     => $escRenov['id'],
                    'payload_raw'    => $raw,
                ]);
                responder_pago(30, 'Monto inválido', '', $transaccion);
            }
            // Modo demo: mismo criterio que webhook_liga.php -- la fecha de
            // inicio de la suscripción es SIEMPRE la fecha en que se
            // confirma el pago, los días de prueba restantes no se
            // acumulan/extienden/suman al periodo contratado.
            $enDemoRef = ($escRenov['modo'] ?? 'activa') === 'demo';
            if ($enDemoRef) {
                $baseRenov = date('Y-m-d');
            } else {
                $baseRenov = $escRenov['fecha_vencimiento_plan'];
                if (!$baseRenov || strtotime($baseRenov) < strtotime(date('Y-m-d'))) $baseRenov = date('Y-m-d');
            }
            $nuevoVencimiento = siguiente_vencimiento_mensual($baseRenov);
            $autorizacionEsc = str_pad(strval(rand(0, 99999999)), 8, '0', STR_PAD_LEFT);

            // Igual que en webhook_liga.php: el historial se escribe ANTES del
            // UPDATE, que es el que pone monto/referencia/folio en NULL.
            registrar_pago_suscripcion($pdo, [
                'escuela_id'  => $escRenov['id'],
                'origen'      => 'renovacion',
                'metodo'      => 'Efectivo',
                'plan'        => ($escRenov['pago_renovacion_plan'] ?: $escRenov['plan']),
                'monto'       => $escRenov['pago_renovacion_monto'],
                'referencia'  => $referencia,
                'folio'       => $escRenov['pago_renovacion_folio'],
                'auth_code'   => $autorizacionEsc,
                'cubre_desde' => $baseRenov,
                'cubre_hasta' => $nuevoVencimiento,
            ]);

            $pdo->prepare(
                // El plan elegido al pagar se aplica AQUÍ, al confirmarse —
                // nunca al generar el cobro (22-sep-2026, misma regla que en
                // webhook_liga.php; ver la nota en
                // acciones/escuela_generar_pago_renovacion.php). COALESCE: sin
                // plan elegido, renueva con el que ya tenía. Y se limpia junto
                // con el resto del cobro, para que el siguiente no herede una
                // intención vieja.
                "UPDATE escuelas
                    SET fecha_vencimiento_plan = ?, ultimo_recordatorio_plan = NULL,
                        plan = COALESCE(NULLIF(pago_renovacion_plan, ''), plan),
                        pago_renovacion_referencia = NULL, pago_renovacion_folio = NULL, pago_renovacion_monto = NULL,
                        pago_renovacion_plan = NULL,
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
        // FOR UPDATE: mismo motivo que la rama de cobros_agrupados de arriba.
        $stmtInv = $pdo->prepare(
            "SELECT id, monto_suscripcion, estado, pago_auth_code
               FROM invitaciones_colegio WHERE pago_referencia = ? LIMIT 1 FOR UPDATE"
        );
        $stmtInv->execute([$referencia]);
        $inv = $stmtInv->fetch();

        if ($inv) {
            if ($inv['estado'] === 'pagado' || $inv['estado'] === 'aprobada') {
                $pdo->rollBack();
                log_ref_pago("suscripción ya pagada (idempotente): {$referencia} invitacion_id:{$inv['id']}");
                responder_pago(0, 'Operación exitosa', $inv['pago_auth_code'] ?: '00000000', $transaccion);
            }
            // Blindaje (11-sep-2026, hallado en revisión adversarial): antes
            // solo se excluían 'pagado'/'aprobada' aquí -- una invitación
            // rechazada por el superadmin, cancelada o expirada caía de
            // largo hasta el UPDATE de abajo, que la revertía a 'pagado' y
            // permitía luego aprobarla en invitacion_resolver.php pese al
            // rechazo. Un pago real que llegue para una de estas queda sin
            // conciliar (se loguea como huérfano, igual que cualquier otra
            // referencia que no calce en ninguna tabla) -- requiere
            // intervención manual, pero nunca revive una solicitud cerrada.
            if (in_array($inv['estado'], ['rechazada', 'cancelada', 'expirada'], true)) {
                $pdo->rollBack();
                log_ref_pago("suscripción {$inv['estado']}, pago rechazado: {$referencia} invitacion_id:{$inv['id']}");
                // Pago real contra una solicitud ya cerrada: no revive la
                // invitación (eso es intencional), pero el dinero sí existió.
                registrar_pago_no_aplicado($pdo, [
                    'canal'          => 'efectivo',
                    'motivo'         => 'solicitud_cerrada',
                    'referencia'     => $referencia,
                    'transaccion'    => $transaccion,
                    'monto_recibido' => $monto_cent / 100,
                    'payload_raw'    => $raw,
                ]);
                responder_pago(40, 'Adquiriente inválido', '', $transaccion);
            }
            $monto_esperado_inv = intval(round(floatval($inv['monto_suscripcion']) * 100));
            if ($monto_cent !== $monto_esperado_inv) {
                $pdo->rollBack();
                log_ref_pago("suscripción monto no coincide: {$referencia} esperado:{$monto_esperado_inv} recibido:{$monto_cent}");
                registrar_pago_no_aplicado($pdo, [
                    'canal'          => 'efectivo',
                    'motivo'         => 'monto_no_coincide',
                    'referencia'     => $referencia,
                    'transaccion'    => $transaccion,
                    'monto_recibido' => $monto_cent / 100,
                    'monto_esperado' => $monto_esperado_inv / 100,
                    'payload_raw'    => $raw,
                ]);
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
        // La referencia no calzó en NINGUNA de las cuatro tablas. Si la tienda
        // ya cobró el efectivo, este es el único rastro que va a existir.
        registrar_pago_no_aplicado($pdo, [
            'canal'          => 'efectivo',
            'motivo'         => 'referencia_desconocida',
            'referencia'     => $referencia,
            'transaccion'    => $transaccion,
            'monto_recibido' => $monto_cent / 100,
            'payload_raw'    => $raw,
        ]);
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

    $autorizacion = str_pad(strval(rand(0, 99999999)), 8, '0', STR_PAD_LEFT);

    // ABONOS (21-sep-2026): antes, un pago en tienda por un importe distinto
    // al del cobro se rechazaba con código 30. Ahora se aplica como abono y el
    // cobro pasa a 'pagado' solo si queda cubierto. Ver la nota larga de
    // webhooks/pago_clabe.php sobre por qué esto cambia quién se queda con el
    // dinero: al responder código 0 el proveedor ya no lo devuelve.
    $resAbono = aplicar_abono_a_cobro($pdo, intval($cobro['id']), $monto_cent / 100, [
        'metodo'      => 'EfectivoRef',
        'referencia'  => $referencia,
        'transaccion' => $transaccion,
        'auth_code'   => $autorizacion,
        'origen'      => 'webhook_referencia',
    ]);

    if ($resAbono['duplicado']) {
        $pdo->rollBack();
        log_ref_pago("abono duplicado (idempotente): {$referencia} transaccion:{$transaccion}");
        // Igual que en pago_clabe.php: se responde 0 para no provocar una
        // devolución de un pago que sí tenemos, pero queda la fila por si el
        // "duplicado" era en realidad un segundo pago real. El UNIQUE
        // (canal, transaccion) colapsa los reintentos legítimos en un renglón
        // con `intentos` subiendo. Después del rollBack, regla 1.
        registrar_pago_no_aplicado($pdo, [
            'canal'          => 'efectivo',
            'motivo'         => 'duplicado_idempotente',
            'referencia'     => $referencia,
            // '-dup': ver la nota en pago_clabe.php. Sin el sufijo, el UNIQUE
            // (canal, transaccion) haría que este aviso se fundiera con el de
            // otra rama que ya hubiera escrito la misma transacción.
            'transaccion'    => $transaccion !== '' ? $transaccion . '-dup' : '',
            'auth_code'      => $cobro['auth_code'] ?: $autorizacion,
            'monto_recibido' => $monto_cent / 100,
            'monto_esperado' => $monto_esperado_cent / 100,
            'cliente_id'     => $cobro['cliente_id'] ?? null,
            'cobro_id'       => $cobro['id'],
            'escuela_id'     => $cobro['escuela_id'] ?? null,
            'payload_raw'    => $raw,
        ]);
        responder_pago(0, 'Operación exitosa', $cobro['auth_code'] ?: $autorizacion, $transaccion);
    }

    // Sobrepago: se abona hasta cubrir el cobro y el excedente queda
    // registrado para que el colegio lo resuelva (no se crea saldo a favor).
    if ($resAbono['sobrante'] > 0.004) {
        registrar_pago_no_aplicado($pdo, [
            'canal'          => 'efectivo',
            'motivo'         => 'sobrepago',
            'referencia'     => $referencia,
            'transaccion'    => $transaccion !== '' ? $transaccion . '-sobrante' : '',
            'auth_code'      => $autorizacion,
            'monto_recibido' => $resAbono['sobrante'],
            'monto_esperado' => 0,
            'cliente_id'     => $cobro['cliente_id'] ?? null,
            'cobro_id'       => $cobro['id'],
            'escuela_id'     => $cobro['escuela_id'] ?? null,
            'payload_raw'    => $raw,
        ]);
    }



    if ($monto_cent !== $monto_esperado_cent) {



        log_ref_pago("abono parcial: {$referencia} esperado:{$monto_esperado_cent} recibido:{$monto_cent} cubierto:" . ($resAbono['cubierto'] ? 'si' : 'no'));



    }







    // (El $autorizacion que se usa aquí es el mismo que ya se registró en el
    // abono más arriba; antes se regeneraba en esta línea, lo que dejaba el
    // auth_code del cobro distinto al del renglón de cobro_abonos.)

    // El estado ya lo decidió aplicar_abono_a_cobro() más arriba (solo pasa a
    // 'pagado' si el abono cubrió el total), así que aquí NO se fuerza. Lo que
    // sí se conserva es auth_code/ref_transaccion/fecha, que los leen el
    // Historial y los comprobantes.
    $pdo->prepare("UPDATE cobros SET auth_code = ?, ref_transaccion = ?, fecha = CURRENT_DATE WHERE id = ?")



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
