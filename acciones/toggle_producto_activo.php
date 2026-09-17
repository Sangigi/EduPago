<?php
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin', 'admin'], 'No tienes permiso para modificar conceptos de pago.');
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        $stmtEscuela = $pdo->prepare("SELECT escuela_id FROM productos WHERE id = ?");
        $stmtEscuela->execute([$id]);
        $filaEscuela = $stmtEscuela->fetch();
        if (!$filaEscuela) respond(['success' => false, 'error' => 'Producto no encontrado']);
        $escuela_id = intval($filaEscuela['escuela_id']);
        requerir_escuela_propia($rol_actual, $escuela_id, $usuario_actual, 'No tienes permiso para modificar este concepto de pago.');
        requerir_seccion_habilitada($pdo, $rol_actual, $escuela_id, ['productos']);
        $pdo->prepare("UPDATE productos SET activo = NOT activo WHERE id = ?")->execute([$id]);
        $stmt2 = $pdo->prepare("SELECT activo FROM productos WHERE id = ?");
        $stmt2->execute([$id]);
        $row = $stmt2->fetch();
        if (!$row) respond(['success' => false, 'error' => 'Producto no encontrado']);
        respond(['success' => true, 'id' => $id, 'activo' => (bool)$row['activo']]);
