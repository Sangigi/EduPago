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
        // que distribuidor_comisiones.php. Desde el 24-sep-2026 ese cálculo ya
        // no vive aquí: lo hace lib/helpers_comisiones.php, para que el Excel
        // y la pantalla no puedan decir cosas distintas.
        // ── Comisiones por referido (export del superadmin) ──────────────
        //
        // REESCRITO el 24-sep-2026. Era el TERCERO de tres cálculos duplicados
        // del mismo número (los otros: distribuidor_comisiones.php y
        // distribuidor_datos.php). Los tres multiplicaban lo cobrado por el
        // porcentaje de HOY, así que el Excel podía discrepar de la pantalla.
        //
        // Ahora todos piden el número a lib/helpers_comisiones.php.
        $periodoHoySA = date('Y-m');
        $vivoSA = comision_calcular_periodo($pdo, $periodoHoySA);
        $mesPorReferido = [];
        foreach ($vivoSA as $v) {
            $rid = $v['referido_id'];
            if (!isset($mesPorReferido[$rid])) $mesPorReferido[$rid] = ['base' => 0.0, 'comision' => 0.0];
            $mesPorReferido[$rid]['base']     += $v['base_cobrada'];
            $mesPorReferido[$rid]['comision'] += $v['comision'];
        }

        // Congelado del año, por referido. Si la migración no corrió, queda en
        // cero y el acumulado muestra solo el mes en curso — menos, pero nunca
        // inventado.
        $anioSA = [];
        try {
            $csa = $pdo->prepare(
                "SELECT referido_id, SUM(comision) AS c, SUM(monto_liquidado) AS liq
                   FROM comision_devengos
                  WHERE COALESCE(periodo_ajustado, periodo) LIKE ?
                  GROUP BY referido_id"
            );
            $csa->execute([date('Y') . '-%']);
            foreach ($csa->fetchAll() as $f) {
                $anioSA[intval($f['referido_id'])] = ['c' => floatval($f['c']), 'liq' => floatval($f['liq'])];
            }
        } catch (\PDOException $e) {
            log_api('superadmin_listar_referidos: sin libro de devengos -> ' . $e->getMessage());
        }

        $referidosTodos = array_map(function($r) use ($mesPorReferido, $anioSA) {
            $rid = intval($r['id']);
            $mes = $mesPorReferido[$rid] ?? ['base' => 0.0, 'comision' => 0.0];
            $anio = $anioSA[$rid] ?? ['c' => 0.0, 'liq' => 0.0];
            $r['cobrado_mes']       = round($mes['base'], 2);
            $r['comision_mes']      = round($mes['comision'], 2);
            $r['comision_anio']     = round($anio['c'] + $mes['comision'], 2);
            // Devengado vs pagado: la pregunta que antes no se podía contestar.
            $r['comision_pagada']   = round($anio['liq'], 2);
            $r['comision_por_pagar']= round(($anio['c'] - $anio['liq']) + $mes['comision'], 2);
            return $r;
        }, $referidosTodos);

        respond(['success' => true, 'referidos' => $referidosTodos]);
