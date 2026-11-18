<?php
        // [F0] FIX DE SEGURIDAD (18-nov-2026): antes no había requerir_rol ni
        // chequeo de pertenencia — cualquier usuario con sesión (incluida una
        // familia) podía marcar como 'liberada' la CLABE de un alumno de
        // CUALQUIER colegio con su id y su CLABE. Hoy ninguna pantalla la llama
        // (CobroController.liberarClabeIndividual quedó sin uso); se alinea con
        // liberar_clabe_pool.php y toggle_cliente_activo.php: dar de baja y
        // soltar la CLABE es de admin/superadmin.
        $rol_liberar_ind = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_liberar_ind, ['superadmin', 'admin'], 'No tienes permiso para liberar CLABEs.');
        $clabe     = trim($input['clabe']     ?? '');
        // [F0] intval: antes viajaba como texto directo al WHERE.
        $alumno_id = intval($input['alumno_id'] ?? 0);
        if (!$clabe) respond(['success' => false, 'error' => 'clabe requerida']);
        if (!$alumno_id) respond(['success' => false, 'error' => 'alumno_id requerido']);
        // [F0] El alumno debe existir y ser de la escuela del usuario.
        $chkEscLibInd = $pdo->prepare("SELECT escuela_id FROM clientes WHERE id = ?");
        $chkEscLibInd->execute([$alumno_id]);
        $clienteLibInd = $chkEscLibInd->fetch();
        if (!$clienteLibInd) respond(['success' => false, 'error' => 'Alumno no encontrado']);
        requerir_escuela_propia($rol_liberar_ind, $clienteLibInd['escuela_id'], $usuario_actual, 'No tienes permiso sobre este alumno.');
        requerir_seccion_habilitada($pdo, $rol_liberar_ind, $clienteLibInd['escuela_id'], ['alumnos', 'familias']);
        // ── Liberar CLABE en Base de Datos ──
        try {
            $stmt = $pdo->prepare("UPDATE clientes SET clabe_individual_estado = 'liberada' WHERE clabe_individual = ? AND id = ?");
            $stmt->execute([$clabe, $alumno_id]);
        } catch (\PDOException $e) {
            respond(['success' => false, 'error' => 'Error de BD al liberar CLABE']);
        }
        respond(['success' => true, 'mensaje' => 'CLABE liberada']);
