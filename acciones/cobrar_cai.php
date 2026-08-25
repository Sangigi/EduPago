<?php
        // Cargo automático: acción de staff (cobrar dinero de una tarjeta ya
        // domiciliada), no autoservicio de familia — antes no exigía ningún rol.
        $rolCai = $usuario_actual['rol'] ?? '';
        requerir_rol($rolCai, ['superadmin', 'admin', 'cajero'], 'No tienes permiso para cobrar cargos automáticos.');
        $cliente_id = intval($input['cliente_id'] ?? 0);
        $folio      = trim($input['folio'] ?? '');
        if (!$cliente_id || !$folio) respond(['success' => false, 'error' => 'cliente_id y folio son requeridos']);
        $stmtCli = $pdo->prepare("SELECT escuela_id, token_tarjeta, token_tarjeta_expmes, token_tarjeta_expanio, token_tarjeta_estado FROM clientes WHERE id = ?");
        $stmtCli->execute([$cliente_id]);
        $cli = $stmtCli->fetch();
        if (!$cli) respond(['success' => false, 'error' => 'Alumno no encontrado']);
        // Antes no se validaba que el alumno perteneciera a la escuela del
        // usuario — un admin de otra escuela podía cobrar la tarjeta de
        // cualquier alumno del sistema.
        requerir_escuela_propia($rolCai, $cli['escuela_id'], $usuario_actual, 'No tienes permiso sobre este alumno.');
        if ($cli['token_tarjeta_estado'] !== 'activo' || !$cli['token_tarjeta']) {
            respond(['success' => false, 'error' => 'El alumno no tiene una tarjeta domiciliada activa. Debe pagar una liga primero para tokenizar.']);
        }
        // El cobro debe pertenecer a ESTE mismo alumno — antes solo se
        // validaba folio+pendiente, permitiendo saldar el adeudo de un alumno
        // cobrando la tarjeta domiciliada de otro completamente distinto.
        $stmtCob = $pdo->prepare("SELECT id, total FROM cobros WHERE folio = ? AND estado = 'pendiente' AND cliente_id = ?");
        $stmtCob->execute([$folio, $cliente_id]);
        $cobroRow = $stmtCob->fetch();
        if (!$cobroRow) respond(['success' => false, 'error' => 'No existe un cobro pendiente con ese folio para este alumno']);
        // El monto a cobrar sale del total real del cobro, nunca del request
        // — antes $total venía de $input y se mandaba tal cual a la pasarela,
        // desligado por completo de lo que el cobro realmente debía.
        $total = floatval($cobroRow['total']);
        if ($total < 50 || $total > 15000) respond(['success' => false, 'error' => 'Monto fuera de rango ($50.00 - $15,000.00)']);
        // Reference acotada a rango int32 (ver nota en generar_liga) para evitar
        // "El formato de la referencia es incorrecto" (code 22).
        $ref  = strval(mt_rand(1000000000, 2147483647));
        $payload = [
            'User'          => PLE_USER,
            'Password'      => PLE_PASS,
            'IntegrationID' => intval(PLE_INT_ID_ACTIVO),
            'SchoolID'      => PLE_SCHOOL_ID_ACTIVO,
            'BusinessID'    => PLE_SCHOOL_ID_ACTIVO,
            'Token'         => $cli['token_tarjeta'],
            'Reference'     => intval($ref), // numérico sin comillas — mismo patrón que Id/IntegrationID
            'Amount'        => intval(round($total * 100)),
            'ExpMonth'      => $cli['token_tarjeta_expmes'],
            'ExpYear'       => $cli['token_tarjeta_expanio'],
        ];
        log_api("cobrar_cai -> cliente={$cliente_id} folio={$folio} total={$total} ref={$ref}");
        $res = curl_post(PLE_URL_DOMICILIACION_PAGAR, $payload);
        if ($res['error']) respond(['success' => false, 'error' => 'Error de red: ' . $res['error']]);
        $raw = json_decode($res['body'], true) ?? [];
        $tx  = $raw['txResponse'] ?? [];
        if (($raw['code'] ?? '') !== '00' || ($tx['response'] ?? '') !== 'approved') {
            log_api("cobrar_cai FALLÓ -> " . json_encode($raw, JSON_UNESCAPED_UNICODE));
            respond(['success' => false, 'error' => $raw['message'] ?? ($tx['nb_error'] ?? 'Cargo automático rechazado'), 'raw' => $raw]);
        }
        $pdo->prepare("UPDATE cobros SET estado = 'pagado', metodo = 'TC', referencia = ?, auth_code = ? WHERE id = ?")
            ->execute([$ref, $tx['auth'] ?? null, $cobroRow['id']]);
        registrar_log($pdo, $usuario_actual, 'cargo_automatico_cobrado', "Cobro #{$cobroRow['id']} (alumno #{$cliente_id}), folio {$folio}, total \${$total}", $cli['escuela_id']);
        respond(['success' => true, 'cobro_id' => intval($cobroRow['id']), 'autorizacion' => $tx['auth'] ?? null]);
