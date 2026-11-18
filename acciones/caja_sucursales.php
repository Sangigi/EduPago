<?php
        // Lista sucursales de la escuela del usuario (o todas si es superadmin y manda escuela_id)
        // [F0] FIX DE SEGURIDAD (18-nov-2026): el escuela_id venía del input sin
        // compararlo con el del usuario, y como esta acción ESCRIBE (crea la
        // sucursal "Principal" si no hay ninguna), cualquier usuario con sesión
        // podía listar —y crear— sucursales en cualquier colegio.
        $rol_actual_suc = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual_suc, ['superadmin', 'admin', 'cajero'], 'No tienes permiso para consultar sucursales.');
        $escuela_id = intval($input['escuela_id'] ?? $_GET['escuela_id'] ?? $usuario_actual['escuela_id'] ?? 0);
        if (!$escuela_id) respond(['success' => false, 'error' => 'escuela_id requerido']);
        requerir_escuela_propia($rol_actual_suc, $escuela_id, $usuario_actual, 'No tienes permiso sobre las sucursales de esa escuela.');
        requerir_seccion_habilitada($pdo, $usuario_actual['rol'] ?? '', $escuela_id, ['caja', 'corte_caja']);
        $stmt = $pdo->prepare("SELECT id, nombre, activa FROM sucursales WHERE escuela_id = ? AND activa = 1 ORDER BY nombre");
        $stmt->execute([$escuela_id]);
        $sucursales = $stmt->fetchAll();
        // No hay ninguna UI para crear sucursales — sin esto, ninguna escuela
        // (ni corte de caja ni el candado de caja abierta en el POS) podía
        // funcionar nunca: "caja_estado"/"caja_abrir" exigen un sucursal_id
        // real y la lista siempre venía vacía. Se autoprovisiona una única
        // sucursal "Principal" la primera vez, transparente para escuelas de
        // un solo punto de venta (la inmensa mayoría).
        if (empty($sucursales)) {
            $pdo->prepare("INSERT INTO sucursales (escuela_id, nombre, activa) VALUES (?, 'Principal', 1)")->execute([$escuela_id]);
            $stmt->execute([$escuela_id]);
            $sucursales = $stmt->fetchAll();
        }
        respond(['success' => true, 'sucursales' => $sucursales]);
