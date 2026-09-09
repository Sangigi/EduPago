<?php
        $escuela_id = intval($input['escuela_id'] ?? 0);
        $nombre     = trim($input['nombre']       ?? '');
        $contacto   = trim($input['contacto']     ?? '') ?: null;
        $email      = validar_email_opcional($input['email'] ?? '');
        $tel        = trim($input['telefono']     ?? '') ?: null;
        if (!$escuela_id || !$nombre) respond(['success' => false, 'error' => 'escuela_id y nombre son requeridos']);
        requerir_seccion_habilitada($pdo, $usuario_actual['rol'] ?? '', $escuela_id, ['familias', 'miequipo']);
        $stmt = $pdo->prepare(
            "INSERT INTO familias (escuela_id, nombre, contacto, email, telefono, activa) VALUES (?,?,?,?,?,1)"
        );
        $stmt->execute([$escuela_id, $nombre, $contacto, $email, $tel]);
        $id = intval($pdo->lastInsertId());
        respond(['success' => true, 'familia' => array_merge($input, ['id' => $id, 'activa' => true])]);
