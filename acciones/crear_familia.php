<?php
        // [F0] FIX DE SEGURIDAD (18-nov-2026): antes no había requerir_rol ni
        // comparación de escuela — cualquier usuario con sesión (una familia,
        // un contador) podía crear familias en CUALQUIER colegio mandando el
        // escuela_id que quisiera. Hoy crean familias Familias.js (admin) y el
        // alta inline de Usuarios.js (admin en "Mi equipo", superadmin en
        // "Usuarios"); 'control_escolar' entra porque gestiona familias.
        $rol_actual_fam = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual_fam, ['superadmin', 'admin', 'control_escolar'], 'No tienes permiso para dar de alta familias.');
        $escuela_id = intval($input['escuela_id'] ?? 0);
        $nombre     = trim($input['nombre']       ?? '');
        $contacto   = trim($input['contacto']     ?? '') ?: null;
        $email      = validar_email_opcional($input['email'] ?? '');
        $tel        = trim($input['telefono']     ?? '') ?: null;
        if (!$escuela_id || !$nombre) respond(['success' => false, 'error' => 'escuela_id y nombre son requeridos']);
        requerir_escuela_propia($rol_actual_fam, $escuela_id, $usuario_actual, 'No puedes dar de alta familias en otro colegio.');
        requerir_seccion_habilitada($pdo, $usuario_actual['rol'] ?? '', $escuela_id, ['familias', 'miequipo']);
        $stmt = $pdo->prepare(
            "INSERT INTO familias (escuela_id, nombre, contacto, email, telefono, activa) VALUES (?,?,?,?,?,1)"
        );
        $stmt->execute([$escuela_id, $nombre, $contacto, $email, $tel]);
        $id = intval($pdo->lastInsertId());
        respond(['success' => true, 'familia' => array_merge($input, ['id' => $id, 'activa' => true])]);
