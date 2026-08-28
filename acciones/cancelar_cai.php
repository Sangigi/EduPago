<?php
        $cliente_id = intval($input['cliente_id'] ?? 0);
        if (!$cliente_id) respond(['success' => false, 'error' => 'cliente_id requerido']);
        $stmtCli = $pdo->prepare("SELECT escuela_id, familia_id, token_tarjeta FROM clientes WHERE id = ?");
        $stmtCli->execute([$cliente_id]);
        $cli = $stmtCli->fetch();
        if (!$cli) respond(['success' => false, 'error' => 'Alumno no encontrado']);
        // Pertenencia: la familia solo puede desvincular la tarjeta de SU hijo;
        // admin/cajero solo de alumnos de su propia escuela — antes cualquier
        // usuario autenticado podía cancelar/desvincular la tarjeta de cualquiera.
        $rolCancelCai = $usuario_actual['rol'] ?? '';
        $puedeCancelarCai = $rolCancelCai === 'superadmin'
            || ($rolCancelCai === 'familia' && intval($cli['familia_id'] ?? -1) === intval($usuario_actual['familia_id'] ?? -2))
            || (in_array($rolCancelCai, ['admin', 'cajero'], true) && intval($cli['escuela_id']) === intval($usuario_actual['escuela_id'] ?? -1));
        if (!$puedeCancelarCai) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'No tienes permiso sobre este alumno.']);
        }
        if (!$cli['token_tarjeta']) respond(['success' => true, 'mensaje' => 'Sin tarjeta domiciliada']);
        $payload = [
            'User'          => PLE_USER,
            'Password'      => PLE_PASS,
            'IntegrationID' => intval(PLE_INT_ID_ACTIVO),
            'SchoolID'      => PLE_SCHOOL_ID_ACTIVO,
            'BusinessID'    => PLE_SCHOOL_ID_ACTIVO,
            'Token'         => $cli['token_tarjeta'],
            'Tkn_reference' => str_pad(strval($cliente_id), 13, '0', STR_PAD_LEFT),
        ];
        $res = curl_post(PLE_URL_DOMICILIACION_CANCELAR, $payload);
        if ($res['error']) respond(['success' => false, 'error' => 'Error de red: ' . $res['error']]);
        $raw = json_decode($res['body'], true) ?? [];
        // Se limpian tambien los datos de la tarjeta, no solo el estado.
        // El proveedor ya elimino el token de su cofre (ver doc CAI: "procedera
        // a eliminar el token de la tarjeta"), asi que conservarlo aqui deja un
        // dato de tarjeta almacenado que ya no sirve para nada.
        $pdo->prepare(
            "UPDATE clientes SET token_tarjeta = NULL, token_tarjeta_expmes = NULL,
                    token_tarjeta_expanio = NULL, token_tarjeta_estado = 'cancelado'
              WHERE id = ?"
        )->execute([$cliente_id]);
        registrar_log($pdo, $usuario_actual, 'tarjeta_domiciliada_cancelada', "Alumno #{$cliente_id}", $cli['escuela_id']);
        respond(['success' => true, 'mensaje' => $raw['message'] ?? 'Tarjeta desvinculada']);
