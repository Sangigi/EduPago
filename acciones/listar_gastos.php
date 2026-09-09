<?php
        $escuela_id_lg = intval($input['escuela_id'] ?? $_GET['escuela_id'] ?? 0);
        if (!$escuela_id_lg) respond(['success' => false, 'error' => 'escuela_id requerido']);
        requerir_escuela_propia($usuario_actual['rol'] ?? '', $escuela_id_lg, $usuario_actual, 'No tienes permiso para ver los gastos de esa escuela.');
        $pagina_lg     = max(1, intval($input['pagina'] ?? $_GET['pagina'] ?? 1));
        $por_pagina_lg = max(1, min(intval($input['por_pagina'] ?? $_GET['por_pagina'] ?? 25), 200));
        $offset_lg     = ($pagina_lg - 1) * $por_pagina_lg;
        $proveedor_lg  = intval($input['proveedor_id'] ?? $_GET['proveedor_id'] ?? 0);
        $forma_lg      = trim($input['forma_pago'] ?? $_GET['forma_pago'] ?? '');
        $desde_lg      = trim($input['desde'] ?? $_GET['desde'] ?? '');
        $hasta_lg      = trim($input['hasta'] ?? $_GET['hasta'] ?? '');

        $where = 'g.escuela_id = ?';
        $params = [$escuela_id_lg];
        if ($proveedor_lg) { $where .= ' AND g.proveedor_id = ?'; $params[] = $proveedor_lg; }
        if (in_array($forma_lg, ['Efectivo', 'Transferencia', 'Cheque', 'TarjetaEmpresarial', 'Otro'], true)) {
            $where .= ' AND g.forma_pago = ?'; $params[] = $forma_lg;
        }
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $desde_lg) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $hasta_lg)) {
            $where .= ' AND g.fecha BETWEEN ? AND ?'; $params[] = $desde_lg; $params[] = $hasta_lg;
        }

        // Total de filas Y suma de TODOS los montos que cumplen el filtro —
        // no solo de la página actual: alimenta el "Total del período".
        $agg = $pdo->prepare("SELECT COUNT(*) AS n, COALESCE(SUM(g.monto),0) AS suma FROM gastos g WHERE $where");
        $agg->execute($params);
        $aggRow = $agg->fetch();
        $total_lg = intval($aggRow['n'] ?? 0);
        $suma_total_lg = floatval($aggRow['suma'] ?? 0);

        $stmtIds = $pdo->prepare(
            "SELECT g.id FROM gastos g WHERE $where ORDER BY g.fecha DESC, g.id DESC LIMIT $por_pagina_lg OFFSET $offset_lg"
        );
        $stmtIds->execute($params);
        $ids_lg = array_column($stmtIds->fetchAll(), 'id');
        if (empty($ids_lg)) {
            $lista_lg = [];
        } else {
            $inIds_lg = implode(',', array_fill(0, count($ids_lg), '?'));
            $stmt = $pdo->prepare(
                "SELECT g.*, p.nombre AS proveedor_nombre
                 FROM gastos g LEFT JOIN proveedores p ON p.id = g.proveedor_id
                 WHERE g.id IN ($inIds_lg) ORDER BY g.fecha DESC, g.id DESC"
            );
            $stmt->execute($ids_lg);
            $lista_lg = array_map(function($g) {
                $g['monto'] = floatval($g['monto']);
                $g['proveedor_nombre'] = $g['proveedor_nombre'] ?? 'Sin proveedor';
                return $g;
            }, $stmt->fetchAll());
        }
        respond([
            'success'    => true,
            'gastos'     => $lista_lg,
            'total'      => $total_lg,
            'suma_total' => $suma_total_lg,
            'pagina'     => $pagina_lg,
            'por_pagina' => $por_pagina_lg,
        ]);
