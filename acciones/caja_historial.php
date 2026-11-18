<?php
        // [F0] FIX DE SEGURIDAD (18-nov-2026): sin requerir_rol y con
        // escuela_id/sucursal_id tomados del input sin compararlos con el
        // usuario, cualquiera con sesión podía leer el historial de cortes
        // (montos, diferencias, nombres de cajeros) de cualquier colegio.
        $rol_actual_hist = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual_hist, ['superadmin', 'admin', 'cajero'], 'No tienes permiso para ver el historial de caja.');
        $sucursal_id = intval($input['sucursal_id'] ?? $_GET['sucursal_id'] ?? 0);
        $escuela_id  = intval($input['escuela_id']  ?? $_GET['escuela_id']  ?? $usuario_actual['escuela_id'] ?? 0);
        if ($sucursal_id) {
            // La escuela que manda es la de la sucursal, no la del input.
            $stmtSucHist = $pdo->prepare("SELECT escuela_id FROM sucursales WHERE id = ?");
            $stmtSucHist->execute([$sucursal_id]);
            $sucHist = $stmtSucHist->fetch();
            if (!$sucHist) respond(['success' => false, 'error' => 'Sucursal no encontrada']);
            $escuela_id = intval($sucHist['escuela_id']);
        }
        if ($escuela_id) {
            requerir_escuela_propia($rol_actual_hist, $escuela_id, $usuario_actual, 'No tienes permiso para ver el historial de esa escuela.');
        }
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
