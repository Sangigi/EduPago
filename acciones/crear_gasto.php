<?php
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin', 'admin'], 'No tienes permiso para registrar gastos.');
        $escuela_id   = intval($input['escuela_id']   ?? 0);
        $proveedor_id = intval($input['proveedor_id'] ?? 0) ?: null;
        $concepto     = trim($input['concepto']  ?? '');
        $monto        = floatval($input['monto'] ?? 0);
        $fecha        = trim($input['fecha']     ?? '') ?: date('Y-m-d');
        $forma_pago   = trim($input['forma_pago'] ?? '');
        if (!$escuela_id || !$concepto || $monto <= 0) {
            respond(['success' => false, 'error' => 'escuela_id, concepto y un monto mayor a cero son requeridos']);
        }
        requerir_escuela_propia($rol_actual, $escuela_id, $usuario_actual, 'No tienes permiso para registrar gastos de esa escuela.');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) respond(['success' => false, 'error' => 'Fecha inválida']);
        $formas_validas = ['Efectivo', 'Transferencia', 'Cheque', 'TarjetaEmpresarial', 'Otro'];
        if (!in_array($forma_pago, $formas_validas, true)) respond(['success' => false, 'error' => 'Forma de pago inválida']);
        // proveedor_id es opcional (gasto sin proveedor formal, ej. caja
        // chica), pero si viene debe ser un proveedor real de ESTA escuela.
        if ($proveedor_id) {
            $chkProv = $pdo->prepare("SELECT id FROM proveedores WHERE id = ? AND escuela_id = ?");
            $chkProv->execute([$proveedor_id, $escuela_id]);
            if (!$chkProv->fetch()) respond(['success' => false, 'error' => 'proveedor_id no corresponde a un proveedor de esta escuela']);
        }
        $stmt = $pdo->prepare(
            "INSERT INTO gastos (escuela_id, proveedor_id, concepto, monto, fecha, forma_pago, usuario_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)"
        );
        $stmt->execute([$escuela_id, $proveedor_id, $concepto, $monto, $fecha, $forma_pago, intval($usuario_actual['user_id'] ?? 0) ?: null]);
        $id = intval($pdo->lastInsertId());
        registrar_log($pdo, $usuario_actual, 'gasto_creado', "Gasto #{$id}: {$concepto}, \${$monto}, {$forma_pago}", $escuela_id);
        respond(['success' => true, 'gasto' => [
            'id' => $id, 'escuela_id' => $escuela_id, 'proveedor_id' => $proveedor_id,
            'concepto' => $concepto, 'monto' => $monto, 'fecha' => $fecha,
            'forma_pago' => $forma_pago, 'comprobante_url' => null,
            'usuario_id' => intval($usuario_actual['user_id'] ?? 0) ?: null,
        ]]);
