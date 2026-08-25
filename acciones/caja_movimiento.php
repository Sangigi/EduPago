<?php
        // Ingreso/egreso manual (ej. "retiro de efectivo", "préstamo a caja chica")
        $caja_id  = intval($input['caja_id'] ?? 0);
        $tipo     = trim($input['tipo']      ?? '');
        $concepto = trim($input['concepto']  ?? '');
        $total    = floatval($input['total'] ?? 0);
        if (!$caja_id || !in_array($tipo, ['ingreso', 'egreso']) || $total <= 0) {
            respond(['success' => false, 'error' => 'Datos de movimiento inválidos']);
        }
        $chk = $pdo->prepare("SELECT id FROM caja WHERE id = ? AND estado = 'abierta'");
        $chk->execute([$caja_id]);
        if (!$chk->fetch()) respond(['success' => false, 'error' => 'La caja no está abierta']);
        $stmt = $pdo->prepare(
            "INSERT INTO movimientos_caja (caja_id, tipo, concepto, total, fecha) VALUES (?, ?, ?, ?, NOW())"
        );
        $stmt->execute([$caja_id, $tipo, $concepto, $total]);
        respond(['success' => true, 'movimiento_id' => intval($pdo->lastInsertId())]);
