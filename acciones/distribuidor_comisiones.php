<?php
        requerir_rol($usuario_actual['rol'] ?? '', ['distribuidor'], 'Solo distribuidores pueden ver este panel.');
        $dist_id = intval($usuario_actual['user_id'] ?? 0);
        $rstmt = $pdo->prepare(
            "SELECT r.id, r.escuela_id, r.nombre_colegio, r.comision_pct,
                    e.nombre AS escuela_nombre
             FROM distribuidor_referidos r
             LEFT JOIN escuelas e ON e.id = r.escuela_id
             WHERE r.distribuidor_id = ? AND r.estado = 'activo' AND r.escuela_id IS NOT NULL"
        );
        $rstmt->execute([$dist_id]);
        $activos = $rstmt->fetchAll();
        $escuela_ids = array_values(array_unique(array_map(fn($r) => intval($r['escuela_id']), $activos)));

        // Historial de los últimos 12 meses (cobrado * % por escuela, sumado)
        $meses_es = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        $meses = [];
        for ($i = 11; $i >= 0; $i--) {
            $ts = strtotime("-$i months");
            $meses[] = ['anio' => intval(date('Y', $ts)), 'mes' => intval(date('n', $ts)), 'label' => $meses_es[intval(date('n', $ts)) - 1]];
        }
        $cobrado_por_mes_escuela = [];
        if ($escuela_ids) {
            $in = implode(',', array_fill(0, count($escuela_ids), '?'));
            $hstmt = $pdo->prepare(
                "SELECT escuela_id, YEAR(fecha) AS anio, MONTH(fecha) AS mes, SUM(total) AS cobrado
                 FROM cobros
                 WHERE estado = 'pagado' AND escuela_id IN ($in) AND fecha >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
                 GROUP BY escuela_id, YEAR(fecha), MONTH(fecha)"
            );
            $hstmt->execute($escuela_ids);
            foreach ($hstmt->fetchAll() as $row) {
                $cobrado_por_mes_escuela[$row['anio'] . '-' . $row['mes']][intval($row['escuela_id'])] = floatval($row['cobrado']);
            }
        }
        $pct_por_escuela = [];
        foreach ($activos as $r) $pct_por_escuela[intval($r['escuela_id'])] = floatval($r['comision_pct']) / 100;

        $historial = array_map(function($m) use ($cobrado_por_mes_escuela, $pct_por_escuela) {
            $clave = $m['anio'] . '-' . $m['mes'];
            $cobradoMes = $cobrado_por_mes_escuela[$clave] ?? [];
            $comision = 0.0;
            foreach ($cobradoMes as $eid => $cobrado) $comision += $cobrado * ($pct_por_escuela[$eid] ?? 0);
            return ['mes' => $clave, 'label' => $m['label'], 'comision' => round($comision, 2)];
        }, $meses);

        // Detalle por colegio activo: mes en curso y acumulado del año
        $mesClave = date('Y') . '-' . date('n');
        $colegios = [];
        foreach ($activos as $r) {
            $eid = intval($r['escuela_id']);
            $pct = $pct_por_escuela[$eid];
            $cobradoMes = $cobrado_por_mes_escuela[$mesClave][$eid] ?? 0;
            $cobradoAnio = 0.0;
            foreach ($cobrado_por_mes_escuela as $clave => $porEscuela) {
                if (str_starts_with($clave, date('Y') . '-')) $cobradoAnio += $porEscuela[$eid] ?? 0;
            }
            $colegios[] = [
                'id'             => intval($r['id']),
                'nombre'         => $r['escuela_nombre'] ?: $r['nombre_colegio'],
                'comision_pct'   => floatval($r['comision_pct']),
                'cobrado_mes'    => round($cobradoMes, 2),
                'comision_mes'   => round($cobradoMes * $pct, 2),
                'comision_anio'  => round($cobradoAnio * $pct, 2),
            ];
        }
        respond(['success' => true, 'historial' => $historial, 'colegios' => $colegios]);
