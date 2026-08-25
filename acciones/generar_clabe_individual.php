<?php
        $alumno_id  = trim($input['alumno_id']  ?? '');
        $matricula  = trim($input['matricula']  ?? '');
        $nombre     = trim($input['nombre']     ?? '');
        $email      = trim($input['email']      ?? '');
        if (!$alumno_id || !$nombre) respond(['success' => false, 'error' => 'alumno_id y nombre son requeridos']);
        $account = $matricula !== '' ? $matricula : ('AL-' . str_pad($alumno_id, 9, '0', STR_PAD_LEFT));
        $payload = [
            'User'           => PDT_USER,
            'Password'       => PDT_PASS,
            'IntegrationID'  => PDT_INT_ID,
            'BusinessID'     => PDT_BUS_ID_SPEI,
            'Description'    => substr("EduPago - {$nombre}", 0, 40),
            'Account'        => $account,
            'CustomerEmail'  => $email ?: 'sin-correo@edupago.mx',
            'CustomerName'   => substr($nombre, 0, 60),
            'ExpirationDate' => date('Y-m-d', strtotime('+' . SPEI_CLABE_EXPIRACION_DIAS . ' days')),
        ];
        $res = curl_post(PDT_URL_CLABE, $payload);
        if ($res['error']) respond(['success' => false, 'error' => 'Error de red: ' . $res['error']]);
        $raw = json_decode($res['body'], true) ?? [];
        $clabe = $raw['Clabe'] ?? $raw['clabe'] ?? null;
        if (!$clabe) respond(['success' => false, 'error' => 'Pagadetodo no devolvió una CLABE']);
        // ── Guardar CLABE en Base de Datos ──
        try {
            $stmt = $pdo->prepare("UPDATE clientes SET clabe_individual = ?, clabe_individual_estado = 'activa', clabe_individual_fecha = CURRENT_DATE WHERE id = ?");
            $stmt->execute([$clabe, $alumno_id]);
        } catch (\PDOException $e) {
            log_api("ERROR DB GenerarClabe: " . $e->getMessage());
        }
        respond([
            'success'      => true,
            'clabe'        => $clabe,
            'banco'        => SPEI_BANCO,
            'beneficiario' => SPEI_BENEFICIARIO,
            'account'      => $account,
        ]);
