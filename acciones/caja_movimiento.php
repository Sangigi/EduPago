<?php
        // Ingreso/egreso manual (ej. "retiro de efectivo", "préstamo a caja chica")
        $caja_id  = intval($input['caja_id'] ?? 0);
        $tipo     = trim($input['tipo']      ?? '');
        $concepto = trim($input['concepto']  ?? '');
        $total    = floatval($input['total'] ?? 0);
        if (!$caja_id || !in_array($tipo, ['ingreso', 'egreso']) || $total <= 0) {
            respond(['success' => false, 'error' => 'Datos de movimiento inválidos']);
        }
        $chk = $pdo->prepare(
            "SELECT ca.*, s.escuela_id
             FROM caja ca JOIN sucursales s ON s.id = ca.sucursal_id
             WHERE ca.id = ? AND ca.estado = 'abierta'"
        );
        $chk->execute([$caja_id]);
        $caja_actual = $chk->fetch();
        if (!$caja_actual) respond(['success' => false, 'error' => 'La caja no está abierta']);
        requerir_seccion_habilitada($pdo, $usuario_actual['rol'] ?? '', $caja_actual['escuela_id'], ['corte_caja']);
        $stmt = $pdo->prepare(
            "INSERT INTO movimientos_caja (caja_id, tipo, concepto, total, fecha) VALUES (?, ?, ?, ?, NOW())"
        );
        $stmt->execute([$caja_id, $tipo, $concepto, $total]);
        respond(['success' => true, 'movimiento_id' => intval($pdo->lastInsertId())]);
