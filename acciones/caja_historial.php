<?php
        $sucursal_id = intval($input['sucursal_id'] ?? $_GET['sucursal_id'] ?? 0);
        $escuela_id  = intval($input['escuela_id']  ?? $_GET['escuela_id']  ?? $usuario_actual['escuela_id'] ?? 0);
        requerir_seccion_habilitada($pdo, $usuario_actual['rol'] ?? '', $escuela_id, ['corte_caja']);
        // Un cajero solo debe ver su propio historial de cortes, no el de sus
        // compañeros (admin/superadmin sí ven el de toda la sucursal/escuela).
        $solo_propio = ($usuario_actual['rol'] ?? '') === 'cajero';
        $filtro_usuario = $solo_propio ? " AND c.usuario_id = " . intval($usuario_actual['user_id'] ?? 0) : "";
        if ($sucursal_id) {
            $stmt = $pdo->prepare(
                "SELECT c.*, u.nombre AS usuario_nombre, s.nombre AS sucursal_nombre
                 FROM caja c
                 JOIN usuarios u ON c.usuario_id = u.id
                 JOIN sucursales s ON c.sucursal_id = s.id
                 WHERE c.sucursal_id = ? $filtro_usuario ORDER BY c.id DESC LIMIT 200"
            );
            $stmt->execute([$sucursal_id]);
        } elseif ($escuela_id) {
            $stmt = $pdo->prepare(
                "SELECT c.*, u.nombre AS usuario_nombre, s.nombre AS sucursal_nombre
                 FROM caja c
                 JOIN usuarios u ON c.usuario_id = u.id
                 JOIN sucursales s ON c.sucursal_id = s.id
                 WHERE s.escuela_id = ? $filtro_usuario ORDER BY c.id DESC LIMIT 200"
            );
            $stmt->execute([$escuela_id]);
        } else {
            respond(['success' => false, 'error' => 'sucursal_id o escuela_id requerido']);
        }
        respond(['success' => true, 'historial' => $stmt->fetchAll()]);
