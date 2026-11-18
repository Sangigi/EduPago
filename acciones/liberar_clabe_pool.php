<?php
        // Libera la CLABE de un alumno y la devuelve al pool como 'liberada'
        // Recibe: { cliente_id }
        // [F0] FIX DE SEGURIDAD (18-nov-2026): antes no había requerir_rol ni
        // chequeo de pertenencia — cualquier usuario con sesión (incluida una
        // familia o un cajero) podía devolver al pool la CLABE de un alumno de
        // CUALQUIER colegio, y los SPEI siguientes a esa CLABE ya no se
        // identificaban. La llaman Alumnos.js y Familias.js justo después de
        // toggle_cliente_activo (dar de baja), que es solo superadmin/admin:
        // mismos roles aquí. Con esto, si un cajero llegara a disparar la baja,
        // la CLABE ya no se suelta sola aunque el toggle le haya fallado.
        $rol_liberar_pool = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_liberar_pool, ['superadmin', 'admin'], 'No tienes permiso para liberar CLABEs.');
        $cliente_id = intval($input['cliente_id'] ?? 0);
        if (!$cliente_id) respond(['success' => false, 'error' => 'cliente_id requerido']);
        $chkEscLiberar = $pdo->prepare("SELECT escuela_id FROM clientes WHERE id = ?");
        $chkEscLiberar->execute([$cliente_id]);
        $clienteLiberar = $chkEscLiberar->fetch();
        // [F0] El alumno debe existir y ser de la escuela del usuario.
        if (!$clienteLiberar) respond(['success' => false, 'error' => 'Alumno no encontrado']);
        requerir_escuela_propia($rol_liberar_pool, $clienteLiberar['escuela_id'], $usuario_actual, 'No tienes permiso sobre este alumno.');
        requerir_seccion_habilitada($pdo, $usuario_actual['rol'] ?? '', $clienteLiberar ? $clienteLiberar['escuela_id'] : null, ['alumnos', 'familias']);
        $pdo->beginTransaction();
        try {
            $upd = $pdo->prepare(
                "UPDATE clabe_pool SET estado='liberada', cliente_id=NULL, fecha_asign=NULL
                 WHERE cliente_id=? AND estado='asignada'"
            );
            $upd->execute([$cliente_id]);
            $upd2 = $pdo->prepare(
                "UPDATE clientes SET clabe_individual=NULL, clabe_individual_estado='liberada'
                 WHERE id=?"
            );
            $upd2->execute([$cliente_id]);
            $pdo->commit();
            respond(['success' => true]);
        } catch (Exception $e) {
            $pdo->rollBack();
            respond(['success' => false, 'error' => $e->getMessage()]);
        }
