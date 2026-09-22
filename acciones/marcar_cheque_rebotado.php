<?php
        $rol_actual_cheque = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual_cheque, ['superadmin', 'admin', 'cajero'], 'No tienes permiso para esta acción.');
        $cobro_id = intval($input['cobro_id'] ?? 0);
        if (!$cobro_id) respond(['success' => false, 'error' => 'cobro_id requerido']);
        $stmt = $pdo->prepare("SELECT cliente_id, metodo, estatus_cheque, escuela_id FROM cobros WHERE id = ?");
        $stmt->execute([$cobro_id]);
        $cob_row = $stmt->fetch();
        if (!$cob_row) respond(['success' => false, 'error' => 'Cobro no encontrado']);
        requerir_escuela_propia($rol_actual_cheque, $cob_row['escuela_id'], $usuario_actual, 'No tienes permiso para este cobro.');
        requerir_seccion_habilitada($pdo, $rol_actual_cheque, $cob_row['escuela_id'], ['cobros']);
        if ($cob_row['metodo'] !== 'Cheque') respond(['success' => false, 'error' => 'Este cobro no fue pagado con cheque']);
        if ($cob_row['estatus_cheque'] === 'rebotado') respond(['success' => false, 'error' => 'Este cheque ya estaba marcado como rebotado']);
        // monto_pagado se regresa a lo que diga el LIBRO MAYOR (22-sep-2026).
        //
        // Al confirmar el cheque, confirmar_pago.php dejó monto_pagado = total
        // sin insertar renglón en cobro_abonos (ese camino escribe la columna
        // cacheada a pelo). Si al rebotar solo se devolvía el estado a
        // 'pendiente', el cobro quedaba pendiente CON monto_pagado = total, y
        // como todo el sistema calcula lo que falta como (total - monto_pagado),
        // la deuda simplemente desaparecía: el saldo del alumno bajaba a cero,
        // ningún canal dejaba cobrarla ("Este cobro ya está cubierto") y un
        // depósito posterior para cubrir el cheque devuelto se contabilizaba
        // como sobrepago no aplicado — con el dinero ya en nuestras manos.
        //
        // Se usa el SUM del ledger y no 0.00 porque el cobro pudo traer abonos
        // REALES antes del cheque (por ejemplo $200 por SPEI y el resto en
        // cheque): esos no se rebotan, solo el cheque, que nunca dejó renglón.
        $pdo->prepare(
            "UPDATE cobros
                SET estado = 'pendiente',
                    estatus_cheque = 'rebotado',
                    monto_pagado = (SELECT COALESCE(SUM(monto), 0) FROM cobro_abonos WHERE cobro_id = ?)
              WHERE id = ?"
        )->execute([$cobro_id, $cobro_id]);
        $nuevo_saldo = 0; $cliente_id_afectado = null;
        if (!empty($cob_row['cliente_id'])) {
            $cliente_id_afectado = intval($cob_row['cliente_id']);
            recalcular_saldo_pendiente($pdo, $cliente_id_afectado);
            $rs = $pdo->prepare("SELECT saldo_pendiente FROM clientes WHERE id = ?");
            $rs->execute([$cliente_id_afectado]);
            $nuevo_saldo = floatval($rs->fetchColumn());
        }
        registrar_log($pdo, $usuario_actual, 'cheque_rebotado', "Cheque del cobro #{$cobro_id} marcado como rebotado");
        respond(['success' => true, 'cobro_id' => $cobro_id,
                 'cliente_id' => $cliente_id_afectado, 'nuevo_saldo' => $nuevo_saldo]);
