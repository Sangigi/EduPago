<?php
        $caja_id = intval($input['caja_id'] ?? $_GET['caja_id'] ?? 0);
        if (!$caja_id) respond(['success' => false, 'error' => 'caja_id requerido']);
        $stmt = $pdo->prepare(
            "SELECT c.*, u.nombre AS usuario_nombre, s.nombre AS sucursal_nombre
             FROM caja c
             JOIN usuarios u ON c.usuario_id = u.id
             JOIN sucursales s ON c.sucursal_id = s.id
             WHERE c.id = ?"
        );
        $stmt->execute([$caja_id]);
        $caja = $stmt->fetch();
        if (!$caja) respond(['success' => false, 'error' => 'Corte de caja no encontrado']);
        $vstmt = $pdo->prepare(
            "SELECT id, folio, cliente_id, total, metodo, estado, fecha FROM cobros
             WHERE caja_id = ? ORDER BY id DESC"
        );
        $vstmt->execute([$caja_id]);
        $mstmt = $pdo->prepare(
            "SELECT * FROM movimientos_caja WHERE caja_id = ? ORDER BY fecha DESC"
        );
        $mstmt->execute([$caja_id]);
        respond([
            'success'      => true,
            'caja'         => $caja,
            'ventas'       => $vstmt->fetchAll(),
            'movimientos'  => $mstmt->fetchAll(),
        ]);
