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
        // ── Tarjetas "Comisión del mes" y "Comisión acumulada" ───────────
        //
        // REESCRITO el 24-sep-2026. Antes este bloque multiplicaba lo cobrado
        // por el porcentaje ACTUAL, igual que hacía distribuidor_comisiones.php
        // — o sea, era el SEGUNDO de tres cálculos duplicados e independientes
        // del mismo número. Podían desacordar entre sí: el dashboard decía una
        // cosa y la pantalla de Comisiones otra.
        //
        // Ahora los tres piden el número a lib/helpers_comisiones.php. El mes
        // en curso se calcula en vivo; el acumulado del año suma lo congelado
        // (cada mes con SU tasa) más el mes abierto.
        $comision_mes = 0.0;
        $comision_acumulada = 0.0;
        $colegios_facturando = 0;
        if ($activos_escuela_ids) {
            $periodoHoy = date('Y-m');
            $vivo = comision_calcular_periodo($pdo, $periodoHoy, $dist_id);
            foreach ($vivo as $r) {
                $comision_mes += $r['comision'];
                if ($r['base_cobrada'] > 0) $colegios_facturando++;
            }

            // Lo ya congelado de este año. Se envuelve en try/catch porque la
            // migración del libro puede no haber corrido todavía: en ese caso
            // el acumulado queda solo con el mes en curso, que es menos, pero
            // nunca un número inventado.
            $congeladoAnio = 0.0;
            try {
                $cs = $pdo->prepare(
                    "SELECT COALESCE(SUM(comision), 0)
                       FROM comision_devengos
                      WHERE distribuidor_id = ?
                        AND COALESCE(periodo_ajustado, periodo) LIKE ?"
                );
                $cs->execute([$dist_id, date('Y') . '-%']);
                $congeladoAnio = floatval($cs->fetchColumn());
            } catch (\PDOException $e) {
                log_api('distribuidor_datos: sin libro de devengos -> ' . $e->getMessage());
            }
            $comision_acumulada = $congeladoAnio + $comision_mes;
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
