<?php
        // DELETE duro, no soft-delete: a diferencia de un proveedor (que un
        // gasto sí referencia), nada en el esquema referencia gastos.id —
        // es una hoja del grafo, igual que usuarios en eliminar_usuario.php.
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin', 'admin'], 'No tienes permiso para eliminar gastos.');
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        $stmt = $pdo->prepare("SELECT * FROM gastos WHERE id = ?");
        $stmt->execute([$id]);
        $gastoDel = $stmt->fetch();
        if (!$gastoDel) respond(['success' => false, 'error' => 'Gasto no encontrado']);
        requerir_escuela_propia($rol_actual, $gastoDel['escuela_id'], $usuario_actual, 'No tienes permiso para eliminar gastos de esa escuela.');
        requerir_seccion_habilitada($pdo, $rol_actual, $gastoDel['escuela_id'], ['gastos']);
        $pdo->prepare("DELETE FROM gastos WHERE id = ?")->execute([$id]);
        registrar_log($pdo, $usuario_actual, 'gasto_eliminado', "Gasto #{$id} eliminado: {$gastoDel['concepto']}, \${$gastoDel['monto']}", $gastoDel['escuela_id']);
        // El archivo en uploads/ referenciado por comprobante_url (si existía)
        // no se borra del disco aquí — el resto del sistema tampoco limpia
        // archivos huérfanos al borrar filas.
        respond(['success' => true]);
