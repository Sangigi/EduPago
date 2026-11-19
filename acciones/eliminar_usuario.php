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
        // [F3] Sin FOREIGN KEY no hay SET NULL automático: un grupo o una materia
        // seguiría apuntando a un docente que ya no existe (y el id podría
        // reutilizarse). Se deja sin tutor/docente; la coordinación reasigna.
        // Try/catch: si el módulo escolar no está instalado, borrar al usuario
        // no debe fallar por esto.
        try {
            $pdo->prepare("UPDATE grupos SET tutor_id = NULL WHERE tutor_id = ?")->execute([$id]);
            $pdo->prepare("UPDATE grupo_materias SET docente_id = NULL WHERE docente_id = ?")->execute([$id]);
        } catch (\PDOException $e) {
            log_api("eliminar_usuario: no se pudo limpiar tutor/docente escolar del usuario #$id -> " . $e->getMessage());
        }
        registrar_log($pdo, $usuario_actual, 'usuario_eliminado', "Usuario #$id eliminado: " . ($objetivoInfo['nombre'] ?? '') . ' (' . ($objetivoInfo['email'] ?? '') . ')');
        respond(['success' => true]);
