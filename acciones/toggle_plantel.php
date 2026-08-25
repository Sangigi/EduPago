<?php
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin', 'admin'], 'No tienes permiso para activar/desactivar planteles.');
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        $stmt = $pdo->prepare("SELECT escuela_plantel_id, activo FROM planteles WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) respond(['success' => false, 'error' => 'Plantel no encontrado']);
        $nuevoEstado = $row['activo'] ? 0 : 1;
        $pdo->prepare("UPDATE planteles SET activo = ? WHERE id = ?")->execute([$nuevoEstado, $id]);
        // La escuela-cuenta del plantel también se activa/desactiva junto con él,
        // para que no pueda iniciar sesión si el plantel está dado de baja.
        $pdo->prepare("UPDATE escuelas SET activa = ? WHERE id = ?")->execute([$nuevoEstado, $row['escuela_plantel_id']]);
        respond(['success' => true, 'activo' => (bool) $nuevoEstado]);
