<?php
        // Sin control de rol/pertenencia, cualquier usuario autenticado
        // (incluida una cuenta 'familia') podía cancelar CUALQUIER cobro
        // pendiente de CUALQUIER escuela — y como saldo_pendiente solo suma
        // cobros 'pendiente', cancelar el propio adeudo lo hacía desaparecer
        // sin pagar. Nunca se usa desde el Portal de Familia (solo desde
        // views/Cobros.js, del lado admin/cajero).
        $rol_actual_cancelar = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual_cancelar, ['superadmin', 'admin', 'cajero'], 'No tienes permiso para cancelar cobros.');
        $cobro_id = intval($input['cobro_id'] ?? 0);
        if (!$cobro_id) respond(['success' => false, 'error' => 'cobro_id requerido']);
        if (in_array($rol_actual_cancelar, ['admin', 'cajero'], true)) {
            $chkEscCancel = $pdo->prepare("SELECT escuela_id FROM cobros WHERE id = ?");
            $chkEscCancel->execute([$cobro_id]);
            $escCancel = $chkEscCancel->fetch();
            requerir_escuela_propia($rol_actual_cancelar, $escCancel ? $escCancel['escuela_id'] : null, $usuario_actual, 'No tienes permiso para cancelar este cobro.');
            requerir_seccion_habilitada($pdo, $rol_actual_cancelar, $escCancel ? $escCancel['escuela_id'] : null, ['cobros']);
        }
        $stmt = $pdo->prepare("UPDATE cobros SET estado = 'cancelado' WHERE id = ?");
        $stmt->execute([$cobro_id]);
        // Recalcular saldo_pendiente del cliente vinculado
        $cob = $pdo->prepare("SELECT cliente_id FROM cobros WHERE id = ?");
        $cob->execute([$cobro_id]);
        $cob_row = $cob->fetch();
        $nuevo_saldo = 0; $cliente_id_afectado = null;
        if (!empty($cob_row['cliente_id'])) {
            $cliente_id_afectado = intval($cob_row['cliente_id']);
            recalcular_saldo_pendiente($pdo, $cliente_id_afectado);
            $rs = $pdo->prepare("SELECT saldo_pendiente FROM clientes WHERE id = ?");
            $rs->execute([$cliente_id_afectado]);
            $nuevo_saldo = floatval($rs->fetchColumn());
        }
        registrar_log($pdo, $usuario_actual, 'cobro_cancelado', "Cobro #{$cobro_id} cancelado");
        respond(['success' => true, 'cobro_id' => $cobro_id,
                 'cliente_id' => $cliente_id_afectado, 'nuevo_saldo' => $nuevo_saldo]);
