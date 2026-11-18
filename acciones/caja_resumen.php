<?php
        // [F0] FIX DE SEGURIDAD (18-nov-2026): sin requerir_rol ni pertenencia,
        // cualquiera con sesión leía el corte de cualquier caja del sistema
        // (ventas con folio y monto, movimientos manuales) con solo su id.
        $rol_actual_res = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual_res, ['superadmin', 'admin', 'cajero'], 'No tienes permiso para ver cortes de caja.');
        $caja_id = intval($input['caja_id'] ?? $_GET['caja_id'] ?? 0);
        if (!$caja_id) respond(['success' => false, 'error' => 'caja_id requerido']);
        $stmt = $pdo->prepare(
            "SELECT c.*, u.nombre AS usuario_nombre, s.nombre AS sucursal_nombre, s.escuela_id
             FROM caja c
             JOIN usuarios u ON c.usuario_id = u.id
             JOIN sucursales s ON c.sucursal_id = s.id
             WHERE c.id = ?"
        );
        $stmt->execute([$caja_id]);
        $caja = $stmt->fetch();
        if (!$caja) respond(['success' => false, 'error' => 'Corte de caja no encontrado']);
        // [F0] Solo cajas de su escuela; el cajero solo las suyas (igual que
        // caja_historial.php, que ya solo le lista sus propios cortes).
        requerir_escuela_propia($rol_actual_res, $caja['escuela_id'], $usuario_actual, 'No tienes permiso para ver este corte de caja.');
        if ($rol_actual_res === 'cajero' && intval($caja['usuario_id']) !== intval($usuario_actual['user_id'] ?? -1)) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'No puedes ver el corte de caja de otro usuario.']);
        }
        requerir_seccion_habilitada($pdo, $usuario_actual['rol'] ?? '', $caja['escuela_id'], ['corte_caja']);
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
