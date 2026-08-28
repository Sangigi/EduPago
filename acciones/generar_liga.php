<?php
        $folio       = trim($input['folio'] ?? '');
        $descripcion = $input['descripcion'] ?? 'Pago escolar';
        $cliente_id  = intval($input['cliente_id'] ?? 0) ?: null;
        if (!$folio) respond(['success' => false, 'error' => 'folio requerido']);
        // Confirmar que el folio corresponde a un cobro real pendiente antes
        // de gastar una llamada al proveedor — evita generar ligas huérfanas.
        $stmtCob = $pdo->prepare("SELECT id, cliente_id, escuela_id, total FROM cobros WHERE folio = ? AND estado = 'pendiente'");
        $stmtCob->execute([$folio]);
        $cobroRow = $stmtCob->fetch();
        if (!$cobroRow) respond(['success' => false, 'error' => 'No existe un cobro pendiente con ese folio']);
        // Verificar pertenencia: admin/cajero solo de su propia escuela, familia
        // solo de sus propios hijos (antes no se validaba nada de esto — cualquier
        // usuario autenticado podía generar la liga de pago de cualquier cobro).
        $rolLiga = $usuario_actual['rol'] ?? '';
        requerir_escuela_propia($rolLiga, $cobroRow['escuela_id'], $usuario_actual, 'No tienes permiso sobre este cobro.');
        if ($rolLiga === 'familia') {
            $stmtFamChk = $pdo->prepare("SELECT familia_id FROM clientes WHERE id = ?");
            $stmtFamChk->execute([$cobroRow['cliente_id']]);
            $famChk = $stmtFamChk->fetch();
            requerir_familia_propia($famChk ? $famChk['familia_id'] : null, $usuario_actual, 'No tienes permiso sobre este cobro.');
        }
        // El monto a cobrar SIEMPRE sale del total real del cobro en BD, nunca
        // del request — antes se usaba $input['total'] directo, permitiendo
        // pagar cualquier adeudo real cobrando solo el mínimo permitido.
        $total = floatval($cobroRow['total']);
        if ($total < 50) respond(['success' => false, 'error' => 'Monto mínimo $50.00 (mínimo de Cobroscontarjeta.com)']);
        if ($total > 15000) respond(['success' => false, 'error' => 'Monto máximo $15,000.00 (máximo de Cobroscontarjeta.com)']);
        if (!$cliente_id) $cliente_id = $cobroRow['cliente_id'] ? intval($cobroRow['cliente_id']) : null;
        // Id/Reference: formato confirmado contra el ÚNICO caso que alguna vez
        // devolvió "code":"success" en este proyecto (ver api_log.txt / historial
        // git de generar_liga, junio-2026): Id de 9 dígitos y Reference de 15
        // dígitos, ambos con ceros a la izquierda y enviados como STRING (no como
        // número JSON). Los intentos con Reference numérico sin ceros (10 o 13
        // dígitos, con o sin comillas) fallaron todos con code 22 "El formato de
        // la referencia es incorrecto".
        // Reference con el formato de la doc (9 digitos alumno + 4 de pago).
        // construir_referencia_pago() vive en lib/helpers_pagos.php para que
        // este servicio y el de domiciliacion usen exactamente el mismo formato.
        // (Se probó también reforzar solo la entropía de la referencia anterior
        // con microtime()+random_int — esta versión resuelve el mismo problema
        // de raíz, con numeración secuencial real por alumno, así que se
        // prefirió sobre ese parche.)
        $ref     = construir_referencia_pago($pdo, $cobroRow['cliente_id']);
        $id_pago = str_pad(strval(max(0, intval($cobroRow['cliente_id']))), 9, '0', STR_PAD_LEFT);
        $payload = [
            'User'           => PLE_USER,
            'Password'       => PLE_PASS,
            'IntegrationID'  => intval(PLE_INT_ID_ACTIVO),
            'SchoolID'       => PLE_SCHOOL_ID_ACTIVO,
            // BusinessID: mientras el sandbox de Pago en Línea/CAI corre
            // temporalmente en pagadetodo.mx (aviso de Cobroscontarjeta.com
            // 18-ago-2026), su validador puede esperar el campo con el
            // vocabulario de "comercio" (BusinessID) en vez de "escuela"
            // (SchoolID). Se mandan ambos con el mismo valor para cubrir
            // los dos casos sin romper nada cuando regrese a pagalaescuela.mx.
            'BusinessID'     => PLE_SCHOOL_ID_ACTIVO,
            'PaymentTypes'   => '401', // Contado (único código válido en Sandbox)
            'Id'             => $id_pago,
            'Description'    => substr($descripcion, 0, 50),
            'Amount'         => intval(round($total * 100)),
            'Reference'      => $ref,
            'ExpirationDate' => date('Y-m-d', strtotime('+1 day')),
        ];
        log_api("generar_liga -> folio={$folio} total={$total} ref={$ref}");
        // MIGRADO a PLE_URL_LIGA_TOKEN (GenerarLigaDomiciliacionIndi): el
        // proveedor confirmó (ago-2026) que el endpoint de domiciliación ya
        // responde "code":"success" con el mismo formato de Id/Reference
        // (9/15 dígitos, ceros a la izquierda, como STRING) — verificado con
        // una prueba real antes de este cambio. webhook_liga.php ya sabe
        // reconstruir la referencia envuelta que regresa este endpoint.
        $res = curl_post(PLE_URL_LIGA_TOKEN, $payload);
        if ($res['error']) respond(['success' => false, 'error' => 'Error de red: ' . $res['error']]);
        $raw = json_decode($res['body'], true) ?? [];
        $data_resp = [];
        foreach ($raw as $k => $v) { $data_resp[trim($k)] = $v; }
        $codigo_resp = $data_resp['code'] ?? null;
        $url_pago    = $data_resp['url'] ?? $data_resp['Url'] ?? $data_resp['URL'] ?? null;
        if ($codigo_resp !== 'success' || !$url_pago) {
            $payload_log = $payload; $payload_log['Password'] = '***';
            log_api("generar_liga FALLÓ -> respuesta: " . json_encode($data_resp, JSON_UNESCAPED_UNICODE) . " | http_code: " . ($res['http_code'] ?? '?') . " | payload_enviado: " . json_encode($payload_log, JSON_UNESCAPED_UNICODE));
            respond(['success' => false, 'error' => $data_resp['message'] ?? ($data_resp['Message'] ?? 'Sin URL de pago'), 'raw' => $data_resp]);
        }
        // Guardar la Reference en el cobro para poder casarla con el webhook.
        $pdo->prepare("UPDATE cobros SET referencia = ? WHERE id = ?")->execute([$ref, $cobroRow['id']]);
        registrar_log($pdo, $usuario_actual, 'liga_pago_generada', "Cobro #{$cobroRow['id']} folio {$folio}, total \${$total}, ref {$ref}", $cobroRow['escuela_id']);
        respond([
            'success'    => true,
            'url'        => $url_pago,
            'referencia' => $ref,
            'cobro_id'   => intval($cobroRow['id']),
            'qr_url'     => 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=' . urlencode($url_pago),
            // true: PLE_URL_LIGA_TOKEN sí tokeniza la tarjeta — el webhook
            // (webhook_liga.php) guardará number_tkn/exp si el proveedor lo
            // manda al confirmar el pago. El frontend ya no necesita avisar
            // que la domiciliación no está disponible.
            'con_cai'    => true,
        ]);
