<?php
        // Endpoint paginado dedicado para la tabla de Cobros.js — independiente
        // del resumen agregado que trae cargar_datos (para no mezclar "página
        // actual" con "totales para el dashboard").
        $escuela_id_lc = intval($input['escuela_id'] ?? $_GET['escuela_id'] ?? 0);
        if (!$escuela_id_lc) respond(['success' => false, 'error' => 'escuela_id requerido']);
        requerir_escuela_propia($usuario_actual['rol'], $escuela_id_lc, $usuario_actual, 'No tienes permiso para ver los cobros de esa escuela.');
        $pagina_lc    = max(1, intval($input['pagina'] ?? $_GET['pagina'] ?? 1));
        $por_pagina_lc = max(1, min(intval($input['por_pagina'] ?? $_GET['por_pagina'] ?? 25), 200));
        $offset_lc    = ($pagina_lc - 1) * $por_pagina_lc;
        $estado_lc    = trim($input['estado'] ?? $_GET['estado'] ?? '');
        $buscar_lc    = trim($input['buscar'] ?? $_GET['buscar'] ?? '');
        $desde_lc     = trim($input['desde'] ?? $_GET['desde'] ?? '');
        $hasta_lc     = trim($input['hasta'] ?? $_GET['hasta'] ?? '');
        $where = 'co.escuela_id = ?';
        $params = [$escuela_id_lc];
        // Filtro de rango de fechas (antes solo existía del lado del cliente,
        // sobre la página ya traída — con paginación de servidor activa eso
        // filtraba cuando mucho 200 filas, nunca "el último año" de verdad).
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $desde_lc) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $hasta_lc)) {
            $where .= ' AND co.fecha BETWEEN ? AND ?';
            $params[] = $desde_lc;
            $params[] = $hasta_lc;
        }
        // Antes solo se validaba la escuela (arriba): un padre de familia podía
        // paginar/buscar los cobros de TODAS las demás familias de su escuela.
        if (($usuario_actual['rol'] ?? '') === 'familia') {
            $where .= ' AND cl.familia_id = ?';
            $params[] = $usuario_actual['familia_id'] ?? -1;
        }
        if (in_array($estado_lc, ['pagado', 'pendiente', 'cancelado'])) {
            $where .= ' AND co.estado = ?';
            $params[] = $estado_lc;
        }
        if ($buscar_lc !== '') {
            $where .= ' AND (co.folio LIKE ? OR cl.nombre LIKE ? OR co.referencia LIKE ?)';
            $params[] = "%$buscar_lc%"; $params[] = "%$buscar_lc%"; $params[] = "%$buscar_lc%";
        }
        $cnt = $pdo->prepare("SELECT COUNT(*) AS n FROM cobros co LEFT JOIN clientes cl ON cl.id = co.cliente_id WHERE $where");
        $cnt->execute($params);
        $total_lc = intval($cnt->fetch()['n'] ?? 0);
        // Mismo truco que en listar_logs: separar "qué ids caen en esta
        // página" (el JOIN solo sirve aquí para poder filtrar/buscar) de
        // "traer esas filas completas" — a offset alto ya no se lee y
        // descarta el ancho completo de cada cobro solo para saltarlo.
        $stmtIds = $pdo->prepare(
            "SELECT co.id FROM cobros co LEFT JOIN clientes cl ON cl.id = co.cliente_id
             WHERE $where ORDER BY co.id DESC LIMIT $por_pagina_lc OFFSET $offset_lc"
        );
        $stmtIds->execute($params);
        $ids_lc = array_column($stmtIds->fetchAll(), 'id');
        if (empty($ids_lc)) {
            $lista_lc = [];
        } else {
            $inIds_lc = implode(',', array_fill(0, count($ids_lc), '?'));
            $stmt = $pdo->prepare(
                "SELECT co.*, COALESCE(cl.nombre, 'Cliente general') AS cliente
                 FROM cobros co LEFT JOIN clientes cl ON cl.id = co.cliente_id
                 WHERE co.id IN ($inIds_lc) ORDER BY co.id DESC"
            );
            $stmt->execute($ids_lc);
            $lista_lc = array_map(function($c) {
                $c['total']   = floatval($c['total']);
                $c['factura'] = (bool)$c['factura'];
                $c['cliente'] = $c['cliente'] ?? 'Cliente general';
                return $c;
            }, $stmt->fetchAll());
        }
        respond([
            'success'   => true,
            'cobros'    => $lista_lc,
            'total'     => $total_lc,
            'pagina'    => $pagina_lc,
            'por_pagina' => $por_pagina_lc,
        ]);
