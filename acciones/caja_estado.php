<?php
        // Devuelve la caja abierta del usuario actual en esa sucursal (o null)
        // [F0] Solo lectura y solo de la caja propia, pero se alinea con el resto
        // de caja_*: mismos roles que operan caja.
        requerir_rol($usuario_actual['rol'] ?? '', ['superadmin', 'admin', 'cajero'], 'No tienes permiso para consultar la caja.');
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
