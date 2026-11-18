<?php
        // Ingreso/egreso manual (ej. "retiro de efectivo", "préstamo a caja chica")
        // [F0] FIX DE SEGURIDAD (18-nov-2026): antes cualquier usuario con
        // sesión (incluida una familia) podía meter ingresos/egresos en la caja
        // abierta de CUALQUIER colegio con solo adivinar un caja_id — y eso
        // descuadra el corte de esa caja. Mismas reglas que caja_cerrar.php.
        $rol_actual_mov = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual_mov, ['superadmin', 'admin', 'cajero'], 'No tienes permiso para registrar movimientos de caja.');
        $caja_id  = intval($input['caja_id'] ?? 0);
        $tipo     = trim($input['tipo']      ?? '');
        $concepto = trim($input['concepto']  ?? '');
        $total    = floatval($input['total'] ?? 0);
        if (!$caja_id || !in_array($tipo, ['ingreso', 'egreso']) || $total <= 0) {
            respond(['success' => false, 'error' => 'Datos de movimiento inválidos']);
        }
        $chk = $pdo->prepare(
            "SELECT ca.*, s.escuela_id
             FROM caja ca JOIN sucursales s ON s.id = ca.sucursal_id
             WHERE ca.id = ? AND ca.estado = 'abierta'"
        );
        $chk->execute([$caja_id]);
        $caja_actual = $chk->fetch();
        if (!$caja_actual) respond(['success' => false, 'error' => 'La caja no está abierta']);
        // [F0] La caja debe ser de la escuela del usuario; el cajero, además,
        // solo mueve SU propia caja (CorteCaja.js siempre manda la caja abierta
        // del propio usuario, así que esto no le quita nada a la pantalla).
        requerir_escuela_propia($rol_actual_mov, $caja_actual['escuela_id'], $usuario_actual, 'No tienes permiso sobre esta caja.');
        if ($rol_actual_mov === 'cajero' && intval($caja_actual['usuario_id']) !== intval($usuario_actual['user_id'] ?? -1)) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'No puedes registrar movimientos en la caja de otro usuario.']);
        }
        requerir_seccion_habilitada($pdo, $usuario_actual['rol'] ?? '', $caja_actual['escuela_id'], ['corte_caja']);
        $stmt = $pdo->prepare(
            "INSERT INTO movimientos_caja (caja_id, tipo, concepto, total, fecha) VALUES (?, ?, ?, ?, NOW())"
        );
        $stmt->execute([$caja_id, $tipo, $concepto, $total]);
        respond(['success' => true, 'movimiento_id' => intval($pdo->lastInsertId())]);
