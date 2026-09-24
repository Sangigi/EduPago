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

        // ── Historial de 12 meses ───────────────────────────────────────
        //
        // REESCRITO el 24-sep-2026. Antes esto multiplicaba lo cobrado de cada
        // mes por el porcentaje ACTUAL, así que editar la comisión reescribía
        // los 12 meses de golpe: un mes que valió 25 pesos al 5% pasaba a
        // mostrar 15 al bajarlo a 3%, aunque ya estuviera pagado.
        //
        // Ahora los meses CERRADOS se leen de comision_devengos, con el
        // porcentaje que quedó congelado en cada renglón. El mes en curso se
        // calcula en vivo con comision_calcular_periodo(), la MISMA función
        // que usa el cierre — para que no haya dos fórmulas que puedan
        // desacordar.
        //
        // El ancla es 'first day of this month' y no strtotime("-$i months"):
        // corriendo un día 31, restar meses salta los meses de 30 días y el
        // historial se salta febrero, abril, junio...
        $meses_es = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        $anclaMes = strtotime(date('Y-m-01'));
        $periodos = [];
        for ($i = 11; $i >= 0; $i--) {
            $ts = strtotime("-$i months", $anclaMes);
            $periodos[] = date('Y-m', $ts);
        }
        $periodoActual = date('Y-m');

        // Lo congelado, de un solo golpe. Se incluyen los ajustes (tipo
        // 'ajuste'): son correcciones posteriores que SUMAN o RESTAN al mes que
        // corrigen, así que el total del mes es la suma de todos sus renglones.
        $congelado = [];
        $pctPorPeriodo = [];
        try {
            $in = implode(',', array_fill(0, count($periodos), '?'));
            $dstmt = $pdo->prepare(
                "SELECT COALESCE(periodo_ajustado, periodo) AS p,
                        SUM(comision) AS comision,
                        SUM(monto_liquidado) AS liquidado,
                        MAX(comision_pct) AS pct
                   FROM comision_devengos
                  WHERE distribuidor_id = ?
                    AND COALESCE(periodo_ajustado, periodo) IN ($in)
                  GROUP BY COALESCE(periodo_ajustado, periodo)"
            );
            $dstmt->execute(array_merge([$dist_id], $periodos));
            foreach ($dstmt->fetchAll() as $f) {
                $congelado[$f['p']] = ['comision' => floatval($f['comision']), 'liquidado' => floatval($f['liquidado'])];
                $pctPorPeriodo[$f['p']] = floatval($f['pct']);
            }
        } catch (\PDOException $e) {
            // La migración del 24-sep todavía no corrió. No se rompe la
            // pantalla: sin renglones congelados, todos los meses caen al
            // cálculo en vivo, que es exactamente el comportamiento anterior.
            log_api('distribuidor_comisiones: sin libro de devengos (¿falta migracion_2026_09_24_comisiones_devengo.sql?) -> ' . $e->getMessage());
        }

        $historial = [];
        foreach ($periodos as $p) {
            $etiqueta = $meses_es[intval(substr($p, 5, 2)) - 1];
            if (isset($congelado[$p])) {
                $historial[] = [
                    'mes' => $p, 'label' => $etiqueta,
                    'comision' => round($congelado[$p]['comision'], 2),
                    'liquidado' => round($congelado[$p]['liquidado'], 2),
                    'comision_pct' => $pctPorPeriodo[$p] ?? null,
                    'cerrado' => true,
                ];
            } else {
                // Mes abierto, o mes viejo que nunca se cerró: se calcula.
                $viv = comision_calcular_periodo($pdo, $p, $dist_id);
                $suma = 0.0;
                foreach ($viv as $r) $suma += $r['comision'];
                $historial[] = [
                    'mes' => $p, 'label' => $etiqueta,
                    'comision' => round($suma, 2),
                    'liquidado' => 0.0,
                    'comision_pct' => null,
                    'cerrado' => false,
                    'preliminar' => ($p === $periodoActual),
                ];
            }
        }
        // ── Detalle por colegio: mes en curso y acumulado del año ───────
        //
        // También reescrito: usaba $pct_por_escuela, el porcentaje de HOY, para
        // el acumulado del año entero. Ahora el mes en curso se calcula en vivo
        // y el acumulado suma los meses congelados (cada uno con SU tasa) más
        // el mes abierto.
        $anioActual = date('Y');
        $vivoMes = comision_calcular_periodo($pdo, $periodoActual, $dist_id);
        $porReferidoMes = [];
        foreach ($vivoMes as $r) {
            $rid = $r['referido_id'];
            if (!isset($porReferidoMes[$rid])) $porReferidoMes[$rid] = ['base' => 0.0, 'comision' => 0.0];
            $porReferidoMes[$rid]['base']     += $r['base_cobrada'];
            $porReferidoMes[$rid]['comision'] += $r['comision'];
        }

        // Lo congelado del año en curso, por referido.
        $congeladoAnio = [];
        try {
            $cstmt = $pdo->prepare(
                "SELECT referido_id, SUM(comision) AS comision
                   FROM comision_devengos
                  WHERE distribuidor_id = ?
                    AND COALESCE(periodo_ajustado, periodo) LIKE ?
                  GROUP BY referido_id"
            );
            $cstmt->execute([$dist_id, $anioActual . '-%']);
            foreach ($cstmt->fetchAll() as $f) $congeladoAnio[intval($f['referido_id'])] = floatval($f['comision']);
        } catch (\PDOException $e) {
            // Sin libro de devengos el acumulado queda solo con el mes en
            // curso. Es menos, pero nunca inventado.
        }

        $colegios = [];
        foreach ($activos as $r) {
            $rid = intval($r['id']);
            $mes = $porReferidoMes[$rid] ?? ['base' => 0.0, 'comision' => 0.0];
            $colegios[] = [
                'id'             => $rid,
                'nombre'         => $r['escuela_nombre'] ?: $r['nombre_colegio'],
                // El % que rige HOY. Los meses cerrados llevan el suyo dentro.
                'comision_pct'   => floatval($r['comision_pct']),
                'cobrado_mes'    => round($mes['base'], 2),
                'comision_mes'   => round($mes['comision'], 2),
                'comision_anio'  => round(($congeladoAnio[$rid] ?? 0.0) + $mes['comision'], 2),
            ];
        }
        respond(['success' => true, 'historial' => $historial, 'colegios' => $colegios]);
        respond(['success' => true, 'historial' => $historial, 'colegios' => $colegios]);
