<?php
        $folio       = trim($input['folio'] ?? '');
        $total       = floatval($input['total'] ?? 0);
        $descripcion = $input['descripcion'] ?? 'Pago escolar';
        if (!$folio) respond(['success' => false, 'error' => 'folio requerido']);
        if ($total < 50 || $total > 15000) respond(['success' => false, 'error' => 'Monto fuera de rango ($50.00 - $15,000.00)']);
        $stmtCob = $pdo->prepare("SELECT id, cliente_id FROM cobros WHERE folio = ? AND estado = 'pendiente'");
        $stmtCob->execute([$folio]);
        $cobroRow = $stmtCob->fetch();
        if (!$cobroRow) respond(['success' => false, 'error' => 'No existe un cobro pendiente con ese folio']);
        // Reference: numérico(15), única e irrepetible.
        $ref = str_pad(strval($cobroRow['id']) . substr(strval(time()), -8), 15, '0', STR_PAD_LEFT);
        // Cobroscontarjeta.com movió este servicio de Pagadetodo (125) a
        // Pagalaescuela (09-sep-2026) — usa las credenciales de Pagalaescuela
        // (PLE_INT_ID/PLE_SCHOOL_ID) Y la URL de Pagalaescuela
        // (PLE_URL_REFERENCIA). Antes solo se habían cambiado las
        // credenciales dejando la URL vieja de Pagadetodo, lo que causaba el
        // error 26 "no está vinculado este comercio a su integración" —
        // Osbel confirmó que el error era justo por eso: hay que llamar a la
        // plataforma de Pagalaescuela, no solo mandarle sus credenciales a
        // Pagadetodo.
        $payload = [
            'User'           => PDT_USER,
            'Password'       => PDT_PASS,
            'IntegrationID'  => PLE_INT_ID,
            // SchoolID: el backend de Pagalaescuela regresó código 8 "El ID
            // de la escuela es obligatorio" cuando solo se mandaba
            // BusinessID (vocabulario de Pagadetodo) — se mandan ambos con
            // el mismo valor para cubrir los dos vocabularios, mismo patrón
            // ya usado en generar_liga.php.
            'SchoolID'       => PLE_SCHOOL_ID,
            'BusinessID'     => PLE_SCHOOL_ID,
            'Description'    => substr($descripcion, 0, 50),
            'Amount'         => intval(round($total * 100)),
            'Reference'      => $ref,
            'CustomerEmail'  => '',
            'CustomerName'   => '',
            'ExpirationDate' => date('Y-m-d', strtotime('+3 days')),
        ];
        log_api("generar_referencia_efectivo -> folio={$folio} total={$total} ref={$ref}");
        $res = curl_post(PLE_URL_REFERENCIA, $payload);
        if ($res['error']) respond(['success' => false, 'error' => 'Error de red: ' . $res['error']]);
        $raw = json_decode($res['body'], true) ?? [];
        $referencia_cct = $raw['Reference'] ?? null;
        if (!$referencia_cct || !empty($raw['Error'])) {
            log_api("generar_referencia_efectivo FALLÓ -> " . json_encode($raw, JSON_UNESCAPED_UNICODE));
            respond(['success' => false, 'error' => $raw['Error'] ?? ($raw['Message'] ?? 'No se pudo generar la referencia')]);
        }
        if (empty($raw['PayFormat'])) {
            log_api("generar_referencia_efectivo OK sin PayFormat -> " . json_encode($raw, JSON_UNESCAPED_UNICODE));
        }
        $pdo->prepare(
            "UPDATE cobros SET metodo = 'EfectivoRef', referencia = ?, ref_barcode_url = ?, ref_payformat_url = ?, ref_vencimiento = ? WHERE id = ?"
        )->execute([
            $referencia_cct,
            $raw['BarCode'] ?? null,
            $raw['PayFormat'] ?? null,
            date('Y-m-d', strtotime('+3 days')),
            $cobroRow['id'],
        ]);
        registrar_log($pdo, $usuario_actual, 'referencia_efectivo_generada', "Cobro #{$cobroRow['id']} folio {$folio}, total \${$total}, ref {$referencia_cct}");
        respond([
            'success'      => true,
            'cobro_id'     => intval($cobroRow['id']),
            'referencia'   => $referencia_cct,
            'barcode_url'  => $raw['BarCode'] ?? null,
            'payformat_url'=> $raw['PayFormat'] ?? null,
            'vencimiento'  => date('Y-m-d', strtotime('+3 days')),
        ]);
