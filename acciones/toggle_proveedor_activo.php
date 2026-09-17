<?php
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin', 'admin'], 'No tienes permiso para modificar proveedores.');
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        $stmtChk = $pdo->prepare("SELECT escuela_id FROM proveedores WHERE id = ?");
        $stmtChk->execute([$id]);
        $prov = $stmtChk->fetch();
        if (!$prov) respond(['success' => false, 'error' => 'Proveedor no encontrado']);
        requerir_escuela_propia($rol_actual, $prov['escuela_id'], $usuario_actual, 'No tienes permiso para modificar proveedores de esa escuela.');
        requerir_seccion_habilitada($pdo, $rol_actual, $prov['escuela_id'], ['proveedores']);
        $pdo->prepare("UPDATE proveedores SET activo = NOT activo WHERE id = ?")->execute([$id]);
        $stmt2 = $pdo->prepare("SELECT activo FROM proveedores WHERE id = ?");
        $stmt2->execute([$id]);
        $row = $stmt2->fetch();
        registrar_log($pdo, $usuario_actual, 'proveedor_activo_toggle', "Proveedor #{$id} " . ($row['activo'] ? 'activado' : 'desactivado'), $prov['escuela_id']);
        respond(['success' => true, 'id' => $id, 'activo' => (bool)$row['activo']]);
