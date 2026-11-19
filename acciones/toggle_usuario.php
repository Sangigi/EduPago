<?php
        $rol_actual = $usuario_actual['rol'] ?? '';
        // [F4] 'control_escolar' solo sobre docentes y alumnos de su escuela (ver abajo).
        requerir_rol($rol_actual, ['superadmin', 'admin', 'control_escolar'], 'No tienes permiso para esta acción.');
        requerir_seccion_habilitada($pdo, $rol_actual, $usuario_actual['escuela_id'] ?? null, ['miequipo']);
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        if ($id === intval($usuario_actual['user_id'] ?? 0)) {
            respond(['success' => false, 'error' => 'No puedes desactivarte a ti mismo.']);
        }
        validar_admin_sobre_usuario($pdo, $rol_actual, $usuario_actual, $id);
        validar_control_escolar_sobre_usuario($pdo, $rol_actual, $usuario_actual, $id); // [F4]
        // [F4] Reactivar la cuenta de un alumno no puede dejar DOS cuentas activas
        // para el mismo alumno (crear_usuario ya lo impide al crear). Si la
        // columna cliente_id no existe todavía, no hay cuentas de alumno y se omite.
        try {
            $stmtAl = $pdo->prepare("SELECT rol, activo, cliente_id FROM usuarios WHERE id = ?");
            $stmtAl->execute([$id]);
            $filaAl = $stmtAl->fetch();
            if ($filaAl && $filaAl['rol'] === 'alumno' && !$filaAl['activo'] && !empty($filaAl['cliente_id'])) {
                $stmtDup = $pdo->prepare("SELECT id FROM usuarios WHERE cliente_id = ? AND rol = 'alumno' AND activo = 1 AND id != ? LIMIT 1");
                $stmtDup->execute([$filaAl['cliente_id'], $id]);
                if ($stmtDup->fetch()) respond(['success' => false, 'error' => 'Este alumno ya tiene otra cuenta activa.']);
            }
        } catch (\PDOException $e) {
            // migracion_2026_11_18_f4_roles.sql sin correr: no hay cuentas de alumno que revisar.
        }
        $stmt = $pdo->prepare("UPDATE usuarios SET activo = NOT activo WHERE id = ?");
        $stmt->execute([$id]);
        registrar_log($pdo, $usuario_actual, 'usuario_activo_toggle', "Usuario #$id");
        respond(['success' => true]);
