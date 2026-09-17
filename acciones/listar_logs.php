<?php
        requerir_rol($usuario_actual['rol'] ?? '', ['superadmin'], 'Solo el superadmin puede ver los logs del sistema.');
        $pagina_lg    = max(1, intval($input['pagina'] ?? $_GET['pagina'] ?? 1));
        $por_pagina_lg = max(1, min(intval($input['por_pagina'] ?? $_GET['por_pagina'] ?? 25), 200));
        $offset_lg    = ($pagina_lg - 1) * $por_pagina_lg;
        $accion_lg    = trim($input['accion'] ?? $_GET['accion'] ?? '');
        $escuela_lg   = intval($input['escuela_id'] ?? $_GET['escuela_id'] ?? 0);
        $where = '1=1'; $params = [];
        if ($accion_lg !== '') { $where .= ' AND accion = ?'; $params[] = $accion_lg; }
        if ($escuela_lg) { $where .= ' AND escuela_id = ?'; $params[] = $escuela_lg; }
        try {
            $cnt = $pdo->prepare("SELECT COUNT(*) AS n FROM logs_sistema WHERE $where");
            $cnt->execute($params);
            $total_lg = intval($cnt->fetch()['n'] ?? 0);
            // A offset alto (páginas muy avanzadas) MySQL tiene que leer y
            // descartar el ancho completo de cada fila (incluye `detalle`,
            // que es TEXT) solo para saltarla. Separar "qué ids caen en esta
            // página" (solo toca la columna indexada) de "traer esas filas
            // completas" evita ese desperdicio sin cambiar el contrato de la API.
            $stmtIds = $pdo->prepare("SELECT id FROM logs_sistema WHERE $where ORDER BY id DESC LIMIT $por_pagina_lg OFFSET $offset_lg");
            $stmtIds->execute($params);
            $ids_lg = array_column($stmtIds->fetchAll(), 'id');
            if (empty($ids_lg)) {
                $logs = [];
            } else {
                $inIds_lg = implode(',', array_fill(0, count($ids_lg), '?'));
                $stmt = $pdo->prepare("SELECT * FROM logs_sistema WHERE id IN ($inIds_lg) ORDER BY id DESC");
                $stmt->execute($ids_lg);
                $logs = $stmt->fetchAll();
            }
        } catch (\PDOException $e) {
            respond(['success' => false, 'error' => 'La tabla logs_sistema aún no existe. Corre la migración (optimizacion_bd.sql, Bloque 0b).']);
        }
        respond(['success' => true, 'logs' => $logs, 'total' => $total_lg, 'pagina' => $pagina_lg, 'por_pagina' => $por_pagina_lg]);
