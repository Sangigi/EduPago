<?php
        $cliente_id_saldo = intval($input['cliente_id'] ?? 0);
        if (!$cliente_id_saldo) respond(['success' => false, 'error' => 'cliente_id requerido']);
        $stmtSaldo = $pdo->prepare("SELECT saldo_pendiente, familia_id FROM clientes WHERE id = ?");
        $stmtSaldo->execute([$cliente_id_saldo]);
        $rowSaldo = $stmtSaldo->fetch();
        if (!$rowSaldo) respond(['success' => false, 'error' => 'Alumno no encontrado']);
        if (($usuario_actual['rol'] ?? '') === 'familia') {
            requerir_familia_propia($rowSaldo['familia_id'], $usuario_actual, 'No puedes consultar este alumno.');
        }
        respond(['success' => true, 'saldo_pendiente' => floatval($rowSaldo['saldo_pendiente'])]);
