<?php
        requerir_rol($usuario_actual['rol'] ?? '', ['superadmin'], 'Solo el super admin puede crear zonas.');
        $nombreZona = trim($input['nombre'] ?? '');
        if (!$nombreZona) respond(['success' => false, 'error' => 'El nombre de la zona es obligatorio']);
        try {
            $pdo->prepare("INSERT INTO zonas (nombre, activa) VALUES (?, 1)")->execute([$nombreZona]);
        } catch (\PDOException $e) {
            respond(['success' => false, 'error' => 'Ya existe una zona con ese nombre']);
        }
        respond(['success' => true, 'zona' => ['id' => intval($pdo->lastInsertId()), 'nombre' => $nombreZona, 'activa' => true]]);
