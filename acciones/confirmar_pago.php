<?php
        // Esta acción marca un cobro como pagado A MANO, sin pasar por ningún
        // proveedor de pago ni webhook — es, literalmente, "confía en quien
        // llame a este endpoint". Antes no tenía NINGÚN control de rol ni de
        // pertenencia: cualquier usuario autenticado (incluida una cuenta
        // 'familia') podía marcar CUALQUIER cobro de CUALQUIER escuela como
        // pagado sin pagar un centavo.
        $rol_actual_confirmar = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual_confirmar, ['superadmin', 'admin', 'cajero', 'familia'], 'No tienes permiso para confirmar pagos.');
        $cobro_id  = intval($input['cobro_id']  ?? 0);
        $auth_code = trim($input['auth_code']   ?? '');
        $transaccion = trim($input['transaccion'] ?? '');
        // Datos del cheque (si el cobro se está confirmando como pago con
        // cheque). Antes se recibían del frontend pero se descartaban por
        // completo: no había columnas donde guardarlos.
        $banco_cheque      = trim($input['banco_cheque']      ?? '') ?: null;
        $num_cuenta_cheque = trim($input['num_cuenta_cheque'] ?? '') ?: null;
        $num_cheque        = trim($input['num_cheque']        ?? '') ?: null;
        $fecha_cheque      = trim($input['fecha_cheque']      ?? '') ?: null;
        $titular_cheque    = trim($input['titular_cheque']    ?? '') ?: null;
        if (!$cobro_id) respond(['success' => false, 'error' => 'cobro_id requerido']);
        if (in_array($rol_actual_confirmar, ['admin', 'cajero'], true)) {
            $chkEscCob = $pdo->prepare("SELECT escuela_id FROM cobros WHERE id = ?");
            $chkEscCob->execute([$cobro_id]);
            $escCob = $chkEscCob->fetch();
            requerir_escuela_propia($rol_actual_confirmar, $escCob ? $escCob['escuela_id'] : null, $usuario_actual, 'No tienes permiso para confirmar este cobro.');
        }
        // Familia: solo puede "confirmar" cobros de SUS PROPIOS hijos, y
        // únicamente cuando el pago YA quedó marcado 'pagado' por el webhook
        // real del proveedor (SPEI/TC) — este endpoint jamás debe ser lo que
        // decide que un cobro está pagado cuando lo llama el propio cliente,
        // o cualquier padre podría marcar su colegiatura como pagada gratis.
        // El poller de familia solo llama a esto para refrescar auth_code/
        // saldo después de que el webhook ya confirmó — nunca antes.
        if ($rol_actual_confirmar === 'familia') {
            $chkFamCob = $pdo->prepare(
                "SELECT co.estado, cl.familia_id FROM cobros co LEFT JOIN clientes cl ON cl.id = co.cliente_id WHERE co.id = ?"
            );
            $chkFamCob->execute([$cobro_id]);
            $famCob = $chkFamCob->fetch();
            requerir_familia_propia($famCob ? $famCob['familia_id'] : null, $usuario_actual, 'No puedes confirmar este cobro.');
            if ($famCob['estado'] !== 'pagado') {
                http_response_code(403);
                respond(['success' => false, 'error' => 'Este pago todavía no ha sido confirmado por el banco/proveedor.']);
            }
        }
        $extra_auth = $auth_code ?: $transaccion ?: null;
        if ($banco_cheque !== null) {
            $stmt = $pdo->prepare(
                "UPDATE cobros SET estado = 'pagado', auth_code = COALESCE(?, auth_code),
                                    banco_cheque = ?, num_cuenta_cheque = ?, num_cheque = ?,
                                    fecha_cheque = ?, titular_cheque = ?, estatus_cheque = 'recibido'
                 WHERE id = ?"
            );
            $stmt->execute([$extra_auth, $banco_cheque, $num_cuenta_cheque, $num_cheque, $fecha_cheque, $titular_cheque, $cobro_id]);
        } else {
            $stmt = $pdo->prepare(
                "UPDATE cobros SET estado = 'pagado', auth_code = COALESCE(?, auth_code) WHERE id = ?"
            );
            $stmt->execute([$extra_auth, $cobro_id]);
        }
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
        registrar_log($pdo, $usuario_actual, 'pago_confirmado_manual', "Cobro #{$cobro_id} confirmado como pagado a mano" . ($extra_auth ? " (auth/transacción: {$extra_auth})" : ''));
        respond(['success' => true, 'cobro_id' => $cobro_id, 'estado' => 'pagado',
                 'cliente_id' => $cliente_id_afectado, 'nuevo_saldo' => $nuevo_saldo]);
