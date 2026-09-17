<?php
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin'], 'Solo el super admin puede activar/desactivar escuelas.');
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        $stmt = $pdo->prepare("UPDATE escuelas SET activa = NOT activa WHERE id = ?");
        $stmt->execute([$id]);
        registrar_log($pdo, $usuario_actual, 'escuela_activa_toggle', "Escuela #$id", $id);
        $stmt = $pdo->prepare("SELECT activa FROM escuelas WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) respond(['success' => false, 'error' => 'Escuela no encontrada']);
        respond(['success' => true, 'activa' => (bool) $row['activa']]);
