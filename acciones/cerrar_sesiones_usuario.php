<?php
        // Fuerza a que el usuario tenga que iniciar sesión de nuevo en TODOS
        // sus dispositivos, sin cambiarle la contraseña — útil si se perdió un
        // dispositivo o se sospecha que su token se filtró. Antes no existía
        // ninguna forma de revocar un token específico antes de que expirara solo.
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin', 'admin'], 'No tienes permiso para esta acción.');
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        validar_admin_sobre_usuario($pdo, $rol_actual, $usuario_actual, $id);
        $pdo->prepare("UPDATE usuarios SET sesion_valida_desde = NOW() WHERE id = ?")->execute([$id]);
        registrar_log($pdo, $usuario_actual, 'usuario_sesiones_cerradas', "Usuario #$id: sesiones forzadas a cerrar");
        respond(['success' => true]);
