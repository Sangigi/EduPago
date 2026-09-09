<?php
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin', 'admin'], 'No tienes permiso para crear proveedores.');
        $escuela_id = intval($input['escuela_id'] ?? 0);
        $nombre     = trim($input['nombre'] ?? '');
        if (!$escuela_id || !$nombre) respond(['success' => false, 'error' => 'escuela_id y nombre son requeridos']);
        requerir_escuela_propia($rol_actual, $escuela_id, $usuario_actual, 'No tienes permiso para crear proveedores de esa escuela.');
        $categoria         = trim($input['categoria']        ?? '') ?: 'otro';
        $rfc               = trim($input['rfc']               ?? '') ?: null;
        $contacto_nombre   = trim($input['contacto_nombre']   ?? '') ?: null;
        $contacto_telefono = trim($input['contacto_telefono'] ?? '') ?: null;
        $contacto_email    = validar_email_opcional($input['contacto_email'] ?? '');
        $activo = array_key_exists('activo', $input) ? (bool)$input['activo'] : true;
        $stmt = $pdo->prepare(
            "INSERT INTO proveedores (escuela_id, nombre, categoria, rfc, contacto_nombre, contacto_telefono, contacto_email, activo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        );
        $stmt->execute([$escuela_id, $nombre, $categoria, $rfc, $contacto_nombre, $contacto_telefono, $contacto_email, $activo ? 1 : 0]);
        $id = intval($pdo->lastInsertId());
        registrar_log($pdo, $usuario_actual, 'proveedor_creado', "Proveedor #{$id}: {$nombre}", $escuela_id);
        respond(['success' => true, 'proveedor' => [
            'id' => $id, 'escuela_id' => $escuela_id, 'nombre' => $nombre, 'categoria' => $categoria,
            'rfc' => $rfc, 'contacto_nombre' => $contacto_nombre, 'contacto_telefono' => $contacto_telefono,
            'contacto_email' => $contacto_email, 'activo' => $activo,
        ]]);
