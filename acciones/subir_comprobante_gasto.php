<?php
        // Multipart: $input llega vacío/irrelevante aquí a propósito. Los
        // datos reales vienen de $_POST (gasto_id) y $_FILES (el archivo) —
        // mismo patrón que acciones/subir_foto_cliente.php.
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin', 'admin'], 'No tienes permiso para subir comprobantes de gastos.');
        $gasto_id = intval($_POST['gasto_id'] ?? 0);
        if (!$gasto_id) respond(['success' => false, 'error' => 'gasto_id requerido']);
        $stmt = $pdo->prepare("SELECT * FROM gastos WHERE id = ?");
        $stmt->execute([$gasto_id]);
        $gasto = $stmt->fetch();
        if (!$gasto) respond(['success' => false, 'error' => 'Gasto no encontrado']);
        requerir_escuela_propia($rol_actual, $gasto['escuela_id'], $usuario_actual, 'No tienes permiso para subir comprobantes de gastos de esa escuela.');
        if (empty($_FILES['archivo'])) respond(['success' => false, 'error' => 'No se recibió ningún archivo.']);

        $resultado = guardar_archivo_subido($_FILES['archivo'], 'comprobantes_gastos', UPLOADS_EXT_COMPROBANTE, UPLOADS_MAX_BYTES_COMPROBANTE);
        if (!$resultado['ok']) respond(['success' => false, 'error' => $resultado['error']]);

        $pdo->prepare("UPDATE gastos SET comprobante_url = ? WHERE id = ?")->execute([$resultado['ruta_relativa'], $gasto_id]);
        registrar_log($pdo, $usuario_actual, 'gasto_comprobante_subido', "Comprobante subido para gasto #{$gasto_id}", $gasto['escuela_id']);
        respond(['success' => true, 'comprobante_url' => $resultado['ruta_relativa']]);
