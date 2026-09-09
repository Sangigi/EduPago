<?php
        // Libera la CLABE de un alumno y la devuelve al pool como 'liberada'
        // Recibe: { cliente_id }
        $cliente_id = intval($input['cliente_id'] ?? 0);
        if (!$cliente_id) respond(['success' => false, 'error' => 'cliente_id requerido']);
        $chkEscLiberar = $pdo->prepare("SELECT escuela_id FROM clientes WHERE id = ?");
        $chkEscLiberar->execute([$cliente_id]);
        $clienteLiberar = $chkEscLiberar->fetch();
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
