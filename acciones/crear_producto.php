<?php
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin', 'admin'], 'No tienes permiso para crear conceptos de pago.');
        $escuela_id = intval($input['escuela_id'] ?? 0);
        $nombre     = trim($input['nombre']       ?? '');
        $categoria  = trim($input['categoria']    ?? '') ?: 'otro';
        $precio     = floatval($input['precio']   ?? 0);
        $emoji      = trim($input['emoji']        ?? '');
        $activo     = array_key_exists('activo', $input) ? (bool)$input['activo'] : true;
        if (!$escuela_id || !$nombre) respond(['success' => false, 'error' => 'escuela_id y nombre son requeridos']);
        requerir_seccion_habilitada($pdo, $rol_actual, $escuela_id, ['productos']);
        $rec = validar_datos_recurrente($input);
        $stmt = $pdo->prepare(
            "INSERT INTO productos (escuela_id, nombre, categoria, precio, emoji, activo, tipo, periodicidad_meses, fecha_inicio, dia_ventana_inicio, dia_ventana_fin, penalizacion_tipo, penalizacion_valor)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );
        $stmt->execute([
            $escuela_id, $nombre, $categoria, $precio, $emoji, $activo ? 1 : 0,
            $rec['tipo'], $rec['periodicidad_meses'], $rec['fecha_inicio'],
            $rec['dia_ventana_inicio'], $rec['dia_ventana_fin'], $rec['penalizacion_tipo'], $rec['penalizacion_valor'],
        ]);
        $id = intval($pdo->lastInsertId());
        respond(['success' => true, 'producto' => array_merge([
            'id' => $id, 'escuela_id' => $escuela_id, 'nombre' => $nombre,
            'categoria' => $categoria, 'precio' => $precio, 'emoji' => $emoji, 'activo' => $activo,
        ], $rec)]);
