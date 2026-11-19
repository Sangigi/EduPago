<?php
        // Horario semanal de un docente en el ciclo actual (o el pedido).
        // El docente solo puede ver el suyo; la administración, el de cualquiera.
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, array_merge(ESCOLAR_ROLES_LECTURA, ['docente']), ['escolar_grupos']);
        $eid = $ctx['escuela_id'];
        $docente_id = $ctx['rol'] === 'docente' ? $ctx['user_id'] : intval($input['docente_id'] ?? 0);
        if (!$docente_id) respond(['success' => false, 'error' => 'Elige un docente.']);
        $ciclo_id = intval($input['ciclo_id'] ?? 0);
        $ciclo = $ciclo_id ? escolar_ciclo($pdo, $eid, $ciclo_id) : escolar_ciclo_actual($pdo, $eid);
        if (!$ciclo) respond(['success' => true, 'horario' => []]);

        $st = $pdo->prepare(
            "SELECT h.id, h.dia_semana, TIME_FORMAT(h.hora_inicio,'%H:%i') AS hora_inicio, TIME_FORMAT(h.hora_fin,'%H:%i') AS hora_fin,
                    m.nombre AS materia, g.nombre AS grupo, COALESCE(a.nombre, ag.nombre) AS aula
             FROM horarios h
             JOIN grupo_materias gm ON gm.id = h.grupo_materia_id
             JOIN grupos g   ON g.id = gm.grupo_id
             JOIN materias m ON m.id = gm.materia_id
             LEFT JOIN aulas a  ON a.id = h.aula_id
             LEFT JOIN aulas ag ON ag.id = g.aula_id
             WHERE h.escuela_id = ? AND gm.docente_id = ? AND g.ciclo_id = ? AND g.activo = 1
             ORDER BY h.dia_semana, h.hora_inicio"
        );
        $st->execute([$eid, $docente_id, $ciclo['id']]);
        $horario = array_map(function ($h) {
            $h['id'] = intval($h['id']); $h['dia_semana'] = intval($h['dia_semana']);
            return $h;
        }, $st->fetchAll());
        respond(['success' => true, 'horario' => $horario]);
