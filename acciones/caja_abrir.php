<?php
        $sucursal_id    = intval($input['sucursal_id'] ?? 0);
        $monto_apertura = floatval($input['monto_apertura'] ?? -1);
        $observaciones  = trim($input['observaciones'] ?? '');
        $usuario_id     = intval($usuario_actual['user_id']);
        if (!$sucursal_id) respond(['success' => false, 'error' => 'sucursal_id requerido']);
        if ($monto_apertura < 0) respond(['success' => false, 'error' => 'Monto de apertura inválido']);
        $stmtSuc = $pdo->prepare("SELECT escuela_id FROM sucursales WHERE id = ?");
        $stmtSuc->execute([$sucursal_id]);
        $sucCaja = $stmtSuc->fetch();
        requerir_seccion_habilitada($pdo, $usuario_actual['rol'] ?? '', $sucCaja ? $sucCaja['escuela_id'] : null, ['caja', 'corte_caja']);
        // No permitir dos cajas abiertas simultáneas del mismo usuario en la misma sucursal
        $chk = $pdo->prepare("SELECT id FROM caja WHERE sucursal_id = ? AND usuario_id = ? AND estado = 'abierta'");
        $chk->execute([$sucursal_id, $usuario_id]);
        if ($chk->fetch()) {
            respond(['success' => false, 'error' => 'Ya tienes una caja abierta en esta sucursal. Ciérrala antes de abrir otra.']);
        }
        $stmt = $pdo->prepare(
            "INSERT INTO caja (sucursal_id, usuario_id, monto_apertura, observaciones, estado, fecha_apertura)
             VALUES (?, ?, ?, ?, 'abierta', NOW())"
        );
        $stmt->execute([$sucursal_id, $usuario_id, $monto_apertura, $observaciones]);
        $caja_id = $pdo->lastInsertId();
        log_api("caja_abrir -> caja_id={$caja_id} sucursal={$sucursal_id} usuario={$usuario_id} monto={$monto_apertura}");
        $s2 = $pdo->prepare("SELECT * FROM caja WHERE id = ?");
        $s2->execute([$caja_id]);
        respond(['success' => true, 'caja' => $s2->fetch()]);
