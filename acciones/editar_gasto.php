<?php
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin', 'admin'], 'No tienes permiso para editar gastos.');
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        $stmtChk = $pdo->prepare("SELECT escuela_id FROM gastos WHERE id = ?");
        $stmtChk->execute([$id]);
        $gastoActual = $stmtChk->fetch();
        if (!$gastoActual) respond(['success' => false, 'error' => 'Gasto no encontrado']);
        requerir_escuela_propia($rol_actual, $gastoActual['escuela_id'], $usuario_actual, 'No tienes permiso para editar gastos de esa escuela.');
        requerir_seccion_habilitada($pdo, $rol_actual, $gastoActual['escuela_id'], ['gastos']);
        if (array_key_exists('proveedor_id', $input) && $input['proveedor_id']) {
            $chkProv = $pdo->prepare("SELECT id FROM proveedores WHERE id = ? AND escuela_id = ?");
            $chkProv->execute([intval($input['proveedor_id']), $gastoActual['escuela_id']]);
            if (!$chkProv->fetch()) respond(['success' => false, 'error' => 'proveedor_id no corresponde a un proveedor de esta escuela']);
        }
        if (array_key_exists('fecha', $input) && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $input['fecha'])) {
            respond(['success' => false, 'error' => 'Fecha inválida']);
        }
        if (array_key_exists('forma_pago', $input) && !in_array($input['forma_pago'], ['Efectivo', 'Transferencia', 'Cheque', 'TarjetaEmpresarial', 'Otro'], true)) {
            respond(['success' => false, 'error' => 'Forma de pago inválida']);
        }
        if (array_key_exists('monto', $input) && floatval($input['monto']) <= 0) {
            respond(['success' => false, 'error' => 'El monto debe ser mayor a cero']);
        }
        // comprobante_url NO está en esta whitelist a propósito: solo
        // subir_comprobante_gasto.php la toca, para que nunca se pueda
        // "declarar" un comprobante pegando una URL suelta.
        $campos = ['proveedor_id', 'concepto', 'monto', 'fecha', 'forma_pago'];
        $sets = []; $vals = [];
        foreach ($campos as $c) {
            if (!array_key_exists($c, $input)) continue;
            $sets[] = "`$c` = ?";
            $vals[] = $c === 'proveedor_id' ? (intval($input[$c]) ?: null) : $input[$c];
        }
        if (empty($sets)) respond(['success' => false, 'error' => 'Sin campos a actualizar']);
        $vals[] = $id;
        $pdo->prepare("UPDATE gastos SET " . implode(', ', $sets) . " WHERE id = ?")->execute($vals);
        $stmt2 = $pdo->prepare("SELECT g.*, p.nombre AS proveedor_nombre FROM gastos g LEFT JOIN proveedores p ON p.id = g.proveedor_id WHERE g.id = ?");
        $stmt2->execute([$id]);
        $gastoActualizado = $stmt2->fetch();
        $gastoActualizado['monto'] = floatval($gastoActualizado['monto']);
        registrar_log($pdo, $usuario_actual, 'gasto_editado', "Gasto #{$id} editado", $gastoActual['escuela_id']);
        respond(['success' => true, 'gasto' => $gastoActualizado]);
