<?php
        $rol_actual_cheque = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual_cheque, ['superadmin', 'admin', 'cajero'], 'No tienes permiso para esta acción.');
        $cobro_id = intval($input['cobro_id'] ?? 0);
        if (!$cobro_id) respond(['success' => false, 'error' => 'cobro_id requerido']);
        $stmt = $pdo->prepare("SELECT cliente_id, metodo, estatus_cheque, escuela_id FROM cobros WHERE id = ?");
        $stmt->execute([$cobro_id]);
        $cob_row = $stmt->fetch();
        if (!$cob_row) respond(['success' => false, 'error' => 'Cobro no encontrado']);
        requerir_escuela_propia($rol_actual_cheque, $cob_row['escuela_id'], $usuario_actual, 'No tienes permiso para este cobro.');
        if ($cob_row['metodo'] !== 'Cheque') respond(['success' => false, 'error' => 'Este cobro no fue pagado con cheque']);
        if ($cob_row['estatus_cheque'] === 'rebotado') respond(['success' => false, 'error' => 'Este cheque ya estaba marcado como rebotado']);
        $pdo->prepare("UPDATE cobros SET estado = 'pendiente', estatus_cheque = 'rebotado' WHERE id = ?")
            ->execute([$cobro_id]);
        $nuevo_saldo = 0; $cliente_id_afectado = null;
        if (!empty($cob_row['cliente_id'])) {
            $cliente_id_afectado = intval($cob_row['cliente_id']);
            recalcular_saldo_pendiente($pdo, $cliente_id_afectado);
            $rs = $pdo->prepare("SELECT saldo_pendiente FROM clientes WHERE id = ?");
            $rs->execute([$cliente_id_afectado]);
            $nuevo_saldo = floatval($rs->fetchColumn());
        }
        registrar_log($pdo, $usuario_actual, 'cheque_rebotado', "Cheque del cobro #{$cobro_id} marcado como rebotado");
        respond(['success' => true, 'cobro_id' => $cobro_id,
                 'cliente_id' => $cliente_id_afectado, 'nuevo_saldo' => $nuevo_saldo]);
