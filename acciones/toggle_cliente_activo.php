<?php
        $rolToggleCli = $usuario_actual['rol'] ?? '';
        requerir_rol($rolToggleCli, ['superadmin', 'admin'], 'El cajero no puede activar/desactivar alumnos.');
        $id     = intval($input['id']     ?? 0);
        $activo = $input['activar'] ? 1 : 0;
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        // Antes no se validaba pertenencia: un admin podía activar/desactivar
        // el alumno de cualquier otra escuela con solo mandar su id.
        if ($rolToggleCli === 'admin') {
            $chkEscToggle = $pdo->prepare("SELECT escuela_id FROM clientes WHERE id = ?");
            $chkEscToggle->execute([$id]);
            $objetivoToggle = $chkEscToggle->fetch();
            requerir_escuela_propia($rolToggleCli, $objetivoToggle ? $objetivoToggle['escuela_id'] : null, $usuario_actual, 'No tienes permiso sobre este alumno.');
            requerir_seccion_habilitada($pdo, $rolToggleCli, $objetivoToggle ? $objetivoToggle['escuela_id'] : null, ['alumnos', 'familias']);
        }
        $stmt = $pdo->prepare("UPDATE clientes SET activo = ? WHERE id = ?");
        $stmt->execute([$activo, $id]);
        respond(['success' => true, 'cliente' => ['id' => $id, 'activo' => (bool)$activo]]);
