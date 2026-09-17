<?php
        // Devuelve la caja abierta del usuario actual en esa sucursal (o null)
        $sucursal_id = intval($input['sucursal_id'] ?? $_GET['sucursal_id'] ?? 0);
        $usuario_id  = intval($usuario_actual['user_id']);
        if (!$sucursal_id) respond(['success' => false, 'error' => 'sucursal_id requerido']);
        $stmtSuc = $pdo->prepare("SELECT escuela_id FROM sucursales WHERE id = ?");
        $stmtSuc->execute([$sucursal_id]);
        $sucCaja = $stmtSuc->fetch();
        requerir_seccion_habilitada($pdo, $usuario_actual['rol'] ?? '', $sucCaja ? $sucCaja['escuela_id'] : null, ['caja', 'corte_caja']);
        $stmt = $pdo->prepare(
            "SELECT * FROM caja WHERE sucursal_id = ? AND usuario_id = ? AND estado = 'abierta'
             ORDER BY id DESC LIMIT 1"
        );
        $stmt->execute([$sucursal_id, $usuario_id]);
        $caja = $stmt->fetch();
        respond(['success' => true, 'caja' => $caja ?: null]);
