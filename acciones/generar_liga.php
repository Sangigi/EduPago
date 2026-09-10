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
        // Tarjeta puede estar apagada globalmente (todas las escuelas) o solo
        // para esta escuela en particular — cualquiera de los dos bloquea.
        requerir_metodo_pago_habilitado($pdo, $cobroRow['escuela_id'], 'TC', 'Tarjeta');
        // Verificar pertenencia: admin/cajero solo de su propia escuela, familia
        // solo de sus propios hijos (antes no se validaba nada de esto — cualquier
        // usuario autenticado podía generar la liga de pago de cualquier cobro).
        $rolLiga = $usuario_actual['rol'] ?? '';
        requerir_escuela_propia($rolLiga, $cobroRow['escuela_id'], $usuario_actual, 'No tienes permiso sobre este cobro.');
        requerir_seccion_habilitada($pdo, $rolLiga, $cobroRow['escuela_id'], ['caja']);
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
        // Reservar la referencia YA, antes de mandarla al proveedor — no
        // hasta que la llamada tenga éxito. Bug real encontrado en producción
        // (2026-08-28, log "La referencia es única e irrepetible" repetido):
        // construir_referencia_pago() solo evita repetir una referencia que
        // YA está guardada en cobros — pero antes esta línea solo corría
        // DESPUÉS de un "code":"success". Si el intento fallaba (como pasó
        // varias veces seguidas ese día), la referencia nunca se guardaba, así
        // que el siguiente reintento del MISMO cobro (o incluso de otro folio
        // distinto) volvía a calcular la MISMA referencia — el proveedor sí la
        // recuerda desde el primer intento, aunque nosotros la "olvidemos", y
        // la rechaza como duplicada. Guardarla de inmediato hace que el
        // siguiente cálculo de construir_referencia_pago() ya la vea usada y
        // salte a la siguiente, sin importar si este intento en particular
        // tiene éxito o no.
        $pdo->prepare("UPDATE cobros SET referencia = ? WHERE id = ?")->execute([$ref, $cobroRow['id']]);
        $payload = [
            'User'           => PLE_USER,
            'Password'       => PLE_PASS,
            'IntegrationID'  => intval(PLE_INT_ID_ACTIVO),
            'SchoolID'       => PLE_SCHOOL_ID_ACTIVO,
            // BusinessID: se manda con el mismo valor que SchoolID para
            // cubrir ambos vocabularios del validador del proveedor (viene
            // del workaround temporal en pagadetodo.mx, ago-2026 — ya no
            // corre ahí, pero se deja porque no rompe nada en producción).
            'BusinessID'     => PLE_SCHOOL_ID_ACTIVO,
            'PaymentTypes'   => PLE_PAYMENT_TYPES, // Contado — '41' en producción, '401' solo en Sandbox
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
        // La Reference ya se guardó arriba (antes de llamar al proveedor) —
        // aquí solo queda registrar el log de éxito.
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
