<?php
        $cliente_id_saldo = intval($input['cliente_id'] ?? 0);
        if (!$cliente_id_saldo) respond(['success' => false, 'error' => 'cliente_id requerido']);
        $stmtSaldo = $pdo->prepare("SELECT saldo_pendiente, familia_id FROM clientes WHERE id = ?");
        $stmtSaldo->execute([$cliente_id_saldo]);
        $rowSaldo = $stmtSaldo->fetch();
        if (!$rowSaldo) respond(['success' => false, 'error' => 'Alumno no encontrado']);
        if (($usuario_actual['rol'] ?? '') === 'familia') {
            requerir_familia_propia($rowSaldo['familia_id'], $usuario_actual, 'No puedes consultar este alumno.');
        }
        // Abonos parciales (21-sep-2026): el portal hace polling sobre este
        // endpoint y antes solo sabía si saldo_pendiente había bajado, así que
        // un abono de $5 sobre una deuda de $50 se anunciaba como "¡Pago
        // confirmado!" — mentira, todavía faltan $45. Ahora también se
        // devuelve cuánto se ha abonado sobre cobros que SIGUEN abiertos:
        //   abonado > 0  => hubo un pago parcial, falta lo que falta
        //   abonado == 0 => lo que quede son otros conceptos intactos
        $stmtAbono = $pdo->prepare(
            "SELECT COALESCE(SUM(monto_pagado), 0)          AS abonado,
                    COALESCE(SUM(total - monto_pagado), 0)  AS falta
               FROM cobros
              WHERE cliente_id = ? AND estado = 'pendiente' AND monto_pagado > 0"
        );
        $stmtAbono->execute([$cliente_id_saldo]);
        $rowAbono = $stmtAbono->fetch() ?: ['abonado' => 0, 'falta' => 0];
        respond([
            'success'         => true,
            'saldo_pendiente' => floatval($rowSaldo['saldo_pendiente']),
            'abonado'         => round(floatval($rowAbono['abonado']), 2),
            'falta'           => round(floatval($rowAbono['falta']), 2),
        ]);
