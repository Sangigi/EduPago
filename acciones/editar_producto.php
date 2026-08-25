<?php
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin', 'admin'], 'No tienes permiso para editar conceptos de pago.');
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        $campos = ['nombre', 'categoria', 'precio', 'emoji', 'activo'];
        $sets = []; $vals = [];
        foreach ($campos as $c) {
            if (array_key_exists($c, $input)) {
                $sets[] = "`$c` = ?";
                $vals[] = $c === 'activo' ? ((bool)$input[$c] ? 1 : 0) : $input[$c];
            }
        }
        // El formulario de Productos.js siempre manda 'tipo' junto con el resto
        // de campos de recurrencia — si viene, se revalida y actualiza el set completo.
        if (array_key_exists('tipo', $input)) {
            $rec = validar_datos_recurrente($input);
            foreach ($rec as $campoRec => $valorRec) {
                $sets[] = "`$campoRec` = ?";
                $vals[] = $valorRec;
            }
        }
        if (empty($sets)) respond(['success' => false, 'error' => 'Sin campos a actualizar']);
        $vals[] = $id;
        $stmt = $pdo->prepare("UPDATE productos SET " . implode(', ', $sets) . " WHERE id = ?");
        $stmt->execute($vals);
        $stmt2 = $pdo->prepare("SELECT * FROM productos WHERE id = ?");
        $stmt2->execute([$id]);
        $productoActualizado = $stmt2->fetch(PDO::FETCH_ASSOC);
        if (!$productoActualizado) respond(['success' => false, 'error' => 'Producto no encontrado']);
        $productoActualizado['activo'] = (bool)$productoActualizado['activo'];
        $productoActualizado['precio'] = floatval($productoActualizado['precio']);
        respond(['success' => true, 'producto' => $productoActualizado]);
