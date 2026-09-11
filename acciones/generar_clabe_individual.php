<?php
        // Blindaje (11-sep-2026): este archivo no tenía requerir_rol ni
        // verificación de pertenencia de escuela -- cualquier usuario
        // autenticado, de cualquier rol y cualquier escuela, podía generar
        // una CLABE STP real para el alumno de otro colegio.
        $rol_clabe_ind = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_clabe_ind, ['superadmin', 'admin', 'cajero'], 'No tienes permiso para generar CLABEs.');

        $alumno_id  = trim($input['alumno_id']  ?? '');
        $matricula  = trim($input['matricula']  ?? '');
        $nombre     = trim($input['nombre']     ?? '');
        $email      = trim($input['email']      ?? '');
        if (!$alumno_id || !$nombre) respond(['success' => false, 'error' => 'alumno_id y nombre son requeridos']);

        $stmtEscClabeInd = $pdo->prepare("SELECT escuela_id FROM clientes WHERE id = ?");
        $stmtEscClabeInd->execute([$alumno_id]);
        $filaEscClabeInd = $stmtEscClabeInd->fetch();
        if (!$filaEscClabeInd) respond(['success' => false, 'error' => 'Alumno no encontrado']);
        requerir_escuela_propia($rol_clabe_ind, $filaEscClabeInd['escuela_id'], $usuario_actual, 'No tienes permiso sobre este alumno.');
        // Modo demo: una CLABE real, a diferencia de una liga/referencia, no
        // se "usa una vez" -- queda viva y puede recibir un SPEI real en
        // cualquier momento futuro. No hay forma segura de "simular" esto,
        // así que se bloquea por completo en vez de fingir una CLABE falsa.
        responder_demo_si_aplica($pdo, $filaEscClabeInd['escuela_id'], 'Esta cuenta está en modo de prueba: no se generan CLABEs SPEI reales.');

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
