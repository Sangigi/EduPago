<?php
        $caja_id       = intval($input['caja_id']       ?? 0);
        $monto_cierre  = floatval($input['monto_cierre'] ?? -1);
        $observaciones = trim($input['observaciones']    ?? '');
        if (!$caja_id) respond(['success' => false, 'error' => 'caja_id requerido']);
        if ($monto_cierre < 0) respond(['success' => false, 'error' => 'Monto de cierre inválido']);
        $stmt = $pdo->prepare("SELECT * FROM caja WHERE id = ? AND estado = 'abierta'");
        $stmt->execute([$caja_id]);
        $caja_actual = $stmt->fetch();
        if (!$caja_actual) respond(['success' => false, 'error' => 'Caja no encontrada o ya cerrada']);
        // Ventas del POS asociadas a esta caja, agrupadas por método (solo pagadas)
        $vstmt = $pdo->prepare(
            "SELECT metodo, COALESCE(SUM(total),0) as total FROM cobros
             WHERE caja_id = ? AND estado = 'pagado' GROUP BY metodo"
        );
        $vstmt->execute([$caja_id]);
        $ventas_por_metodo = ['Efectivo' => 0, 'TC' => 0, 'SPEI' => 0, 'CoDi' => 0];
        foreach ($vstmt->fetchAll() as $row) {
            if (isset($ventas_por_metodo[$row['metodo']])) $ventas_por_metodo[$row['metodo']] = floatval($row['total']);
        }
        $ventas_efectivo      = $ventas_por_metodo['Efectivo'];
        $ventas_tarjeta       = $ventas_por_metodo['TC'];
        $ventas_transferencia = $ventas_por_metodo['SPEI'] + $ventas_por_metodo['CoDi'];
        $total_ventas         = $ventas_efectivo + $ventas_tarjeta + $ventas_transferencia;
        // Movimientos manuales (ingresos/egresos de efectivo, no ventas del POS)
        $mstmt = $pdo->prepare(
            "SELECT tipo, COALESCE(SUM(total),0) as total FROM movimientos_caja WHERE caja_id = ? GROUP BY tipo"
        );
        $mstmt->execute([$caja_id]);
        $otros_ingresos = 0; $otros_egresos = 0;
        foreach ($mstmt->fetchAll() as $row) {
            if ($row['tipo'] === 'ingreso') $otros_ingresos = floatval($row['total']);
            if ($row['tipo'] === 'egreso')  $otros_egresos  = floatval($row['total']);
        }
        // Monto esperado en efectivo = apertura + ventas en efectivo + otros ingresos - otros egresos
        $monto_esperado = floatval($caja_actual['monto_apertura']) + $ventas_efectivo + $otros_ingresos - $otros_egresos;
        $diferencia     = $monto_cierre - $monto_esperado;
        $upd = $pdo->prepare(
            "UPDATE caja SET
                fecha_cierre = NOW(), monto_cierre = ?, monto_esperado = ?, diferencia = ?,
                ventas_efectivo = ?, ventas_tarjeta = ?, ventas_transferencia = ?, total_ventas = ?,
                otros_ingresos = ?, otros_egresos = ?, observaciones = ?, estado = 'cerrada'
             WHERE id = ?"
        );
        $upd->execute([
            $monto_cierre, $monto_esperado, $diferencia,
            $ventas_efectivo, $ventas_tarjeta, $ventas_transferencia, $total_ventas,
            $otros_ingresos, $otros_egresos, $observaciones, $caja_id
        ]);
        log_api("caja_cerrar -> caja_id={$caja_id} esperado={$monto_esperado} cierre={$monto_cierre} diff={$diferencia}");
        $s2 = $pdo->prepare("SELECT * FROM caja WHERE id = ?");
        $s2->execute([$caja_id]);
        respond(['success' => true, 'caja' => $s2->fetch()]);
