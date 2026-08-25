<?php
        // Familia elimina la tarjeta guardada de SU hijo; admin/superadmin
        // pueden hacerlo por cualquier alumno de su escuela.
        $id_tarj = intval($input['cliente_id'] ?? 0);
        if (!$id_tarj) respond(['success' => false, 'error' => 'cliente_id requerido']);
        $rolTarj = $usuario_actual['rol'] ?? '';
        $chkT = $pdo->prepare("SELECT familia_id, escuela_id FROM clientes WHERE id = ?");
        $chkT->execute([$id_tarj]);
        $cliTarj = $chkT->fetch();
        if (!$cliTarj) respond(['success' => false, 'error' => 'Alumno no encontrado']);
        $autorizadoTarj = false;
        if ($rolTarj === 'superadmin') {
            $autorizadoTarj = true;
        } elseif (in_array($rolTarj, ['admin'])) {
            $autorizadoTarj = intval($cliTarj['escuela_id']) === intval($usuario_actual['escuela_id'] ?? -1);
        } elseif ($rolTarj === 'familia') {
            $autorizadoTarj = $cliTarj['familia_id'] !== null && intval($cliTarj['familia_id']) === intval($usuario_actual['familia_id'] ?? -1);
        }
        if (!$autorizadoTarj) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'No tienes permiso para eliminar esta tarjeta.']);
        }
        $pdo->prepare(
            "UPDATE clientes SET token_tarjeta = NULL, token_tarjeta_expmes = NULL,
             token_tarjeta_expanio = NULL, token_tarjeta_estado = 'cancelado' WHERE id = ?"
        )->execute([$id_tarj]);
        respond(['success' => true]);
