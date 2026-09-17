<?php
        requerir_rol($usuario_actual['rol'] ?? '', ['superadmin'], 'Solo el super admin puede editar zonas.');
        $idZona = intval($input['id'] ?? 0);
        if (!$idZona) respond(['success' => false, 'error' => 'id requerido']);
        $sets = []; $vals = [];
        if (array_key_exists('nombre', $input)) { $sets[] = 'nombre = ?'; $vals[] = trim($input['nombre']); }
        if (array_key_exists('activa', $input)) { $sets[] = 'activa = ?'; $vals[] = $input['activa'] ? 1 : 0; }
        if (empty($sets)) respond(['success' => false, 'error' => 'Sin campos a actualizar']);
        $vals[] = $idZona;
        try {
            $pdo->prepare("UPDATE zonas SET " . implode(', ', $sets) . " WHERE id = ?")->execute($vals);
        } catch (\PDOException $e) {
            respond(['success' => false, 'error' => 'Ya existe una zona con ese nombre']);
        }
        respond(['success' => true]);
