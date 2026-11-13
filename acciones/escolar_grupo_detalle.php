<?php
        // Todo lo de un grupo: datos, alumnos inscritos, materias asignadas
        // (con docente) y horario semanal.
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, ['superadmin', 'admin', 'docente']);
        $g = escolar_grupo($pdo, $ctx, $input['grupo_id'] ?? 0);
        $gid = intval($g['id']);

        $st = $pdo->prepare("SELECT a.nombre AS aula, u.nombre AS tutor FROM grupos g LEFT JOIN aulas a ON a.id = g.aula_id LEFT JOIN usuarios u ON u.id = g.tutor_id WHERE g.id = ?");
        $st->execute([$gid]);
        $g = array_merge($g, $st->fetch() ?: []);
        foreach (['id', 'ciclo_id'] as $k) $g[$k] = intval($g[$k]);
        foreach (['aula_id', 'tutor_id', 'cupo'] as $k) $g[$k] = $g[$k] !== null ? intval($g[$k]) : null;
        $g['activo'] = (bool) $g['activo'];

        $alumnos = escolar_alumnos_grupo($pdo, $gid);

        $st = $pdo->prepare(
            "SELECT gm.id, gm.materia_id, gm.docente_id, m.nombre AS materia, m.clave, m.horas_semana, u.nombre AS docente
             FROM grupo_materias gm
             JOIN materias m ON m.id = gm.materia_id
             LEFT JOIN usuarios u ON u.id = gm.docente_id
             WHERE gm.grupo_id = ? ORDER BY m.nombre"
        );
        $st->execute([$gid]);
        $materias = array_map(function ($m) {
            $m['id'] = intval($m['id']); $m['materia_id'] = intval($m['materia_id']);
            $m['docente_id'] = $m['docente_id'] !== null ? intval($m['docente_id']) : null;
            return $m;
        }, $st->fetchAll());

        $st = $pdo->prepare(
            "SELECT h.id, h.grupo_materia_id, h.dia_semana, TIME_FORMAT(h.hora_inicio,'%H:%i') AS hora_inicio,
                    TIME_FORMAT(h.hora_fin,'%H:%i') AS hora_fin, h.aula_id, a.nombre AS aula,
                    m.nombre AS materia, u.nombre AS docente
             FROM horarios h
             JOIN grupo_materias gm ON gm.id = h.grupo_materia_id
             JOIN materias m ON m.id = gm.materia_id
             LEFT JOIN usuarios u ON u.id = gm.docente_id
             LEFT JOIN aulas a ON a.id = h.aula_id
             WHERE gm.grupo_id = ? ORDER BY h.dia_semana, h.hora_inicio"
        );
        $st->execute([$gid]);
        $horario = array_map(function ($h) {
            foreach (['id', 'grupo_materia_id', 'dia_semana'] as $k) $h[$k] = intval($h[$k]);
            $h['aula_id'] = $h['aula_id'] !== null ? intval($h['aula_id']) : null;
            return $h;
        }, $st->fetchAll());

        respond(['success' => true, 'grupo' => $g, 'alumnos' => $alumnos, 'materias' => $materias, 'horario' => $horario]);
