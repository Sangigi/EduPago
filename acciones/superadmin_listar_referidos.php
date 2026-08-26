<?php
        requerir_rol($usuario_actual['rol'] ?? '', ['superadmin'], 'Solo el super admin puede ver esto.');
        $stmtRef = $pdo->prepare(
            "SELECT r.id, r.distribuidor_id, r.escuela_id, r.nombre_colegio, r.num_alumnos, r.estado,
                    r.comision_pct, r.fecha_alta, r.notas,
                    u.nombre AS distribuidor_nombre, u.email AS distribuidor_email,
                    e.nombre AS escuela_nombre
             FROM distribuidor_referidos r
             LEFT JOIN usuarios u ON u.id = r.distribuidor_id
             LEFT JOIN escuelas e ON e.id = r.escuela_id
             ORDER BY r.fecha_alta DESC, r.id DESC"
        );
        $stmtRef->execute();
        $referidosTodos = array_map(function($r) {
            return [
                'id'                 => intval($r['id']),
                'distribuidor_id'    => intval($r['distribuidor_id']),
                'distribuidor_nombre'=> $r['distribuidor_nombre'],
                'distribuidor_email' => $r['distribuidor_email'],
                'escuela_id'         => $r['escuela_id'] ? intval($r['escuela_id']) : null,
                'escuela_nombre'     => $r['escuela_nombre'],
                'nombre_colegio'     => $r['nombre_colegio'],
                'num_alumnos'        => $r['num_alumnos'] !== null ? intval($r['num_alumnos']) : null,
                'estado'             => $r['estado'],
                'comision_pct'       => floatval($r['comision_pct']),
                'fecha_alta'         => $r['fecha_alta'],
                'notas'              => $r['notas'],
            ];
        }, $stmtRef->fetchAll());

        // Monto real cobrado/comisionado por referido — antes esta lista solo
        // traía el % de comisión, nunca el peso real (eso solo se calculaba
        // en distribuidor_comisiones.php, y solo para el distribuidor dueño de
        // la sesión). El superadmin necesita el monto real para poder armar un
        // reporte/exportación con totales, no solo porcentajes. Mismo cálculo
        // que distribuidor_comisiones.php (cobrado * %), aplicado aquí a TODOS
        // los referidos activos y vinculados a una escuela real, sin importar
        // de qué distribuidor sean.
        $escuelaIdsActivos = array_values(array_unique(array_filter(array_map(
            fn($r) => $r['estado'] === 'activo' ? $r['escuela_id'] : null, $referidosTodos
        ))));
        $cobradoMesPorEscuela = [];
        $cobradoAnioPorEscuela = [];
        if ($escuelaIdsActivos) {
            $in = implode(',', array_fill(0, count($escuelaIdsActivos), '?'));
            $stmtCob = $pdo->prepare(
                "SELECT escuela_id,
                        SUM(CASE WHEN DATE_FORMAT(fecha, '%Y-%m') = ? THEN total ELSE 0 END) AS cobrado_mes,
                        SUM(CASE WHEN YEAR(fecha) = ? THEN total ELSE 0 END) AS cobrado_anio
                 FROM cobros
                 WHERE estado = 'pagado' AND escuela_id IN ($in)
                 GROUP BY escuela_id"
            );
            $stmtCob->execute(array_merge([date('Y-m'), date('Y')], $escuelaIdsActivos));
            foreach ($stmtCob->fetchAll() as $row) {
                $eid = intval($row['escuela_id']);
                $cobradoMesPorEscuela[$eid]  = floatval($row['cobrado_mes']);
                $cobradoAnioPorEscuela[$eid] = floatval($row['cobrado_anio']);
            }
        }
        $referidosTodos = array_map(function($r) use ($cobradoMesPorEscuela, $cobradoAnioPorEscuela) {
            $activoConEscuela = $r['estado'] === 'activo' && $r['escuela_id'];
            $cobradoMes  = $activoConEscuela ? ($cobradoMesPorEscuela[$r['escuela_id']] ?? 0) : 0;
            $cobradoAnio = $activoConEscuela ? ($cobradoAnioPorEscuela[$r['escuela_id']] ?? 0) : 0;
            $r['cobrado_mes']   = round($cobradoMes, 2);
            $r['comision_mes']  = round($cobradoMes * $r['comision_pct'] / 100, 2);
            $r['comision_anio'] = round($cobradoAnio * $r['comision_pct'] / 100, 2);
            return $r;
        }, $referidosTodos);

        respond(['success' => true, 'referidos' => $referidosTodos]);
