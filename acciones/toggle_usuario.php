<?php
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin', 'admin'], 'No tienes permiso para esta acción.');
        requerir_seccion_habilitada($pdo, $rol_actual, $usuario_actual['escuela_id'] ?? null, ['miequipo']);
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        if ($id === intval($usuario_actual['user_id'] ?? 0)) {
            respond(['success' => false, 'error' => 'No puedes desactivarte a ti mismo.']);
        }
        validar_admin_sobre_usuario($pdo, $rol_actual, $usuario_actual, $id);
        $stmt = $pdo->prepare("UPDATE usuarios SET activo = NOT activo WHERE id = ?");
        $stmt->execute([$id]);
        registrar_log($pdo, $usuario_actual, 'usuario_activo_toggle', "Usuario #$id");
        respond(['success' => true]);
