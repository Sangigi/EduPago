<?php
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin', 'admin'], 'No tienes permiso para esta acción.');
        requerir_seccion_habilitada($pdo, $rol_actual, $usuario_actual['escuela_id'] ?? null, ['miequipo']);
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        if ($id === intval($usuario_actual['user_id'] ?? 0)) {
            respond(['success' => false, 'error' => 'No puedes eliminarte a ti mismo.']);
        }
        validar_admin_sobre_usuario($pdo, $rol_actual, $usuario_actual, $id);
        $chkNombre = $pdo->prepare("SELECT nombre, email FROM usuarios WHERE id = ?");
        $chkNombre->execute([$id]);
        $objetivoInfo = $chkNombre->fetch();
        $pdo->prepare("DELETE FROM usuarios WHERE id = ?")->execute([$id]);
        registrar_log($pdo, $usuario_actual, 'usuario_eliminado', "Usuario #$id eliminado: " . ($objetivoInfo['nombre'] ?? '') . ' (' . ($objetivoInfo['email'] ?? '') . ')');
        respond(['success' => true]);
