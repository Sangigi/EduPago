<?php
        requerir_rol($usuario_actual['rol'] ?? '', ['distribuidor'], 'Solo distribuidores pueden ver este panel.');
        $dist_id = intval($usuario_actual['user_id'] ?? 0);
        $du = $pdo->prepare("SELECT nombre, zona FROM usuarios WHERE id = ?");
        $du->execute([$dist_id]);
        $distribuidor_row = $du->fetch() ?: ['nombre' => '', 'zona' => null];
        // La zona real (catálogo) prevalece sobre el texto legado si ya está migrada.
        try {
            $duz = $pdo->prepare("SELECT z.nombre FROM usuarios u JOIN zonas z ON z.id = u.zona_id WHERE u.id = ?");
            $duz->execute([$dist_id]);
            $zonaCatalogo = $duz->fetchColumn();
            if ($zonaCatalogo) $distribuidor_row['zona'] = $zonaCatalogo;
        } catch (\PDOException $e) { /* zona_id aún no migrada en esta base */ }
        $rstmt = $pdo->prepare(
            "SELECT r.id, r.escuela_id, r.nombre_colegio, r.num_alumnos, r.estado, r.comision_pct, r.fecha_alta, r.notas,
                    e.nombre AS escuela_nombre
             FROM distribuidor_referidos r
             LEFT JOIN escuelas e ON e.id = r.escuela_id
             WHERE r.distribuidor_id = ?
             ORDER BY r.fecha_alta DESC, r.id DESC"
        );
        $rstmt->execute([$dist_id]);
        $referidos = $rstmt->fetchAll();
        // Alumnos reales de colegios ya vinculados (si no se guardó num_alumnos manual)
        $escuela_ids = array_values(array_filter(array_map(fn($r) => $r['escuela_id'], $referidos)));
        $alumnos_por_escuela = [];
        if ($escuela_ids) {
            $in = implode(',', array_fill(0, count($escuela_ids), '?'));
            $astmt = $pdo->prepare("SELECT escuela_id, COUNT(*) AS n FROM clientes WHERE escuela_id IN ($in) GROUP BY escuela_id");
            $astmt->execute($escuela_ids);
            foreach ($astmt->fetchAll() as $row) $alumnos_por_escuela[intval($row['escuela_id'])] = intval($row['n']);
        }
        // Comisión: sobre cobros 'pagado' de colegios en estado 'activo' y con escuela ya vinculada
        $activos_escuela_ids = array_values(array_filter(array_map(
            fn($r) => $r['estado'] === 'activo' ? $r['escuela_id'] : null, $referidos
        )));
        $comision_mes = 0.0;
        $comision_acumulada = 0.0;
        $colegios_facturando = 0;
        if ($activos_escuela_ids) {
            $in2 = implode(',', array_fill(0, count($activos_escuela_ids), '?'));
            // Cobrado del mes en curso, por escuela
            $cmstmt = $pdo->prepare(
                "SELECT escuela_id, SUM(total) AS cobrado FROM cobros
                 WHERE estado = 'pagado' AND escuela_id IN ($in2)
                   AND YEAR(fecha) = YEAR(CURDATE()) AND MONTH(fecha) = MONTH(CURDATE())
                 GROUP BY escuela_id"
            );
            $cmstmt->execute($activos_escuela_ids);
            $cobrado_mes_por_escuela = [];
            foreach ($cmstmt->fetchAll() as $row) $cobrado_mes_por_escuela[intval($row['escuela_id'])] = floatval($row['cobrado']);
            // Cobrado acumulado del año, por escuela
            $castmt = $pdo->prepare(
                "SELECT escuela_id, SUM(total) AS cobrado FROM cobros
                 WHERE estado = 'pagado' AND escuela_id IN ($in2) AND YEAR(fecha) = YEAR(CURDATE())
                 GROUP BY escuela_id"
            );
            $castmt->execute($activos_escuela_ids);
            $cobrado_anio_por_escuela = [];
            foreach ($castmt->fetchAll() as $row) $cobrado_anio_por_escuela[intval($row['escuela_id'])] = floatval($row['cobrado']);
            foreach ($referidos as $r) {
                if ($r['estado'] !== 'activo' || !$r['escuela_id']) continue;
                $eid = intval($r['escuela_id']);
                $pct = floatval($r['comision_pct']) / 100;
                $cobradoMes = $cobrado_mes_por_escuela[$eid] ?? 0;
                $cobradoAnio = $cobrado_anio_por_escuela[$eid] ?? 0;
                if ($cobradoMes > 0) $colegios_facturando++;
                $comision_mes += $cobradoMes * $pct;
                $comision_acumulada += $cobradoAnio * $pct;
            }
        }
        $colegios = array_map(function($r) use ($alumnos_por_escuela) {
            $eid = $r['escuela_id'] ? intval($r['escuela_id']) : null;
            return [
                'id'             => intval($r['id']),
                'escuela_id'     => $eid,
                'nombre'         => $r['escuela_nombre'] ?: $r['nombre_colegio'],
                'num_alumnos'    => $eid && isset($alumnos_por_escuela[$eid]) ? $alumnos_por_escuela[$eid] : ($r['num_alumnos'] ? intval($r['num_alumnos']) : null),
                'estado'         => $r['estado'],
                'comision_pct'   => floatval($r['comision_pct']),
                'fecha_alta'     => $r['fecha_alta'],
                'notas'          => $r['notas'],
            ];
        }, $referidos);
        $conteo_estados = ['activo' => 0, 'implementacion' => 0, 'demo_agendada' => 0, 'prospecto' => 0];
        foreach ($referidos as $r) {
            if (isset($conteo_estados[$r['estado']])) $conteo_estados[$r['estado']]++;
        }
        respond([
            'success'  => true,
            'distribuidor' => ['nombre' => $distribuidor_row['nombre'], 'zona' => $distribuidor_row['zona']],
            'colegios' => $colegios,
            'stats' => [
                'comision_mes'         => round($comision_mes, 2),
                'colegios_activos'     => $conteo_estados['activo'],
                'colegios_totales'     => count($referidos),
                'colegios_facturando'  => $colegios_facturando,
                'en_implementacion'    => $conteo_estados['implementacion'],
                'comision_acumulada'   => round($comision_acumulada, 2),
                'anio'                 => intval(date('Y')),
            ],
            'embudo' => $conteo_estados,
        ]);
