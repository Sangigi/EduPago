<?php
        // Portal de familia: situación escolar de cada hijo en el ciclo actual
        // (boleta + asistencia + últimas faltas/retardos). Solo lectura y solo
        // sus propios hijos (el filtro por familia_id es del servidor, no del
        // navegador).
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, ['familia'],
            ['escolar_grupos', 'escolar_asistencias', 'escolar_calificaciones']);
        $eid = $ctx['escuela_id'];
        $ciclo = escolar_ciclo_actual($pdo, $eid);
        if (!$ciclo) respond(['success' => true, 'ciclo' => null, 'hijos' => []]);

        $st = $pdo->prepare("SELECT id, nombre, matricula, foto_url FROM clientes WHERE escuela_id = ? AND familia_id = ? AND activo = 1 AND COALESCE(tipo,'alumno') = 'alumno' ORDER BY nombre");
        $st->execute([$eid, intval($ctx['familia_id'] ?? -1)]);
        $hijos = [];
        $inc = $pdo->prepare(
            "SELECT fecha, estado, observacion FROM asistencias
             WHERE escuela_id = ? AND cliente_id = ? AND estado <> 'presente' AND fecha BETWEEN ? AND ?
             ORDER BY fecha DESC LIMIT 15"
        );
        foreach ($st->fetchAll() as $h) {
            $h['id'] = intval($h['id']);
            $h['boleta'] = escolar_armar_boleta($pdo, $eid, $h['id'], $ciclo, ['solo_publicados' => true]); // [F3] solo periodos publicados
            $inc->execute([$eid, $h['id'], $ciclo['fecha_inicio'], $ciclo['fecha_fin']]);
            $h['incidencias'] = $inc->fetchAll();
            $hijos[] = $h;
        }
        respond([
            'success' => true,
            'ciclo'   => [
                'id' => intval($ciclo['id']), 'nombre' => $ciclo['nombre'],
                'escala_min' => floatval($ciclo['escala_min']), 'escala_max' => floatval($ciclo['escala_max']),
                'calif_aprobatoria' => floatval($ciclo['calif_aprobatoria']),
            ],
            'hijos'   => $hijos,
        ]);
