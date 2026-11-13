<?php
        // Reporte de asistencia de un grupo en un rango: totales por alumno y,
        // si el rango es de hasta 62 días, la matriz día por día (para la
        // lista mensual que se imprime o se exporta).
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, ['superadmin', 'admin', 'docente'], ['escolar_asistencias']);
        $g = escolar_grupo($pdo, $ctx, $input['grupo_id'] ?? 0);
        $gid = intval($g['id']);
        $desde = escolar_fecha($input['desde'] ?? date('Y-m-01'), 'fecha inicial');
        $hasta = escolar_fecha($input['hasta'] ?? date('Y-m-d'), 'fecha final');
        if ($hasta < $desde) respond(['success' => false, 'error' => 'El rango de fechas está invertido.']);

        $alumnos = escolar_alumnos_grupo($pdo, $gid);
        $st = $pdo->prepare("SELECT cliente_id, fecha, estado FROM asistencias WHERE grupo_id = ? AND fecha BETWEEN ? AND ? ORDER BY fecha");
        $st->execute([$gid, $desde, $hasta]);
        $filas = $st->fetchAll();

        $dias = [];
        $porAlumno = [];
        foreach ($filas as $f) {
            $dias[$f['fecha']] = true;
            $porAlumno[intval($f['cliente_id'])][$f['fecha']] = $f['estado'];
        }
        $dias = array_keys($dias);
        sort($dias);
        $conMatriz = (strtotime($hasta) - strtotime($desde)) / 86400 <= 62;

        foreach ($alumnos as &$a) {
            $r = ['presente' => 0, 'falta' => 0, 'retardo' => 0, 'justificada' => 0];
            foreach ($porAlumno[$a['id']] ?? [] as $estado) $r[$estado]++;
            $tot = array_sum($r);
            $a['resumen'] = $r;
            $a['porcentaje'] = $tot ? round(($r['presente'] + $r['retardo'] + $r['justificada']) * 100 / $tot, 1) : null;
            $a['dias'] = $conMatriz ? (object) ($porAlumno[$a['id']] ?? []) : null;
        }
        unset($a);

        $porc = array_values(array_filter(array_column($alumnos, 'porcentaje'), function ($p) { return $p !== null; }));
        respond([
            'success'   => true,
            'grupo'     => ['id' => $gid, 'nombre' => $g['nombre']],
            'desde'     => $desde,
            'hasta'     => $hasta,
            'dias'      => $conMatriz ? $dias : [],
            'dias_capturados' => count($dias),
            'promedio_asistencia' => $porc ? round(array_sum($porc) / count($porc), 1) : null,
            'alumnos'   => $alumnos,
        ]);
