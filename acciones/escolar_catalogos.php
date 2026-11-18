<?php
        // Catálogos del control escolar en UNA petición: ciclos (con sus
        // periodos), aulas, materias, docentes y los grupos del ciclo pedido.
        // Para docente: solo SUS grupos y SUS materias asignadas.
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, array_merge(ESCOLAR_ROLES_LECTURA, ['docente']));
        $eid = $ctx['escuela_id'];
        $esDocente = $ctx['rol'] === 'docente';

        $st = $pdo->prepare("SELECT * FROM ciclos_escolares WHERE escuela_id = ? ORDER BY fecha_inicio DESC, id DESC");
        $st->execute([$eid]);
        $ciclos = $st->fetchAll();

        $st = $pdo->prepare("SELECT * FROM periodos_evaluacion WHERE escuela_id = ? ORDER BY ciclo_id, orden, id");
        $st->execute([$eid]);
        $periodosPorCiclo = [];
        foreach ($st->fetchAll() as $p) {
            $p['id'] = intval($p['id']);
            $p['orden'] = intval($p['orden']);
            $p['cerrado'] = (bool) $p['cerrado'];
            $p['publicado'] = (bool) $p['publicado']; // [F3]
            $periodosPorCiclo[intval($p['ciclo_id'])][] = $p;
        }
        $ciclo_actual_id = null;
        foreach ($ciclos as &$c) {
            $c['id'] = intval($c['id']);
            $c['actual'] = (bool) $c['actual'];
            $c['cerrado'] = (bool) $c['cerrado']; // [F3]
            foreach (['escala_min', 'escala_max', 'calif_aprobatoria'] as $k) $c[$k] = floatval($c[$k]);
            $c['periodos'] = $periodosPorCiclo[$c['id']] ?? [];
            if ($c['actual'] && !$ciclo_actual_id) $ciclo_actual_id = $c['id'];
        }
        unset($c);
        if (!$ciclo_actual_id && $ciclos) $ciclo_actual_id = $ciclos[0]['id'];

        $ciclo_id = intval($input['ciclo_id'] ?? $_GET['ciclo_id'] ?? 0) ?: $ciclo_actual_id;

        $st = $pdo->prepare("SELECT * FROM aulas WHERE escuela_id = ? ORDER BY activo DESC, nombre");
        $st->execute([$eid]);
        $aulas = array_map(function ($a) {
            $a['id'] = intval($a['id']); $a['activo'] = (bool) $a['activo'];
            $a['capacidad'] = $a['capacidad'] !== null ? intval($a['capacidad']) : null;
            return $a;
        }, $st->fetchAll());

        $st = $pdo->prepare("SELECT * FROM materias WHERE escuela_id = ? ORDER BY activo DESC, nombre");
        $st->execute([$eid]);
        $materias = array_map(function ($m) {
            $m['id'] = intval($m['id']); $m['activo'] = (bool) $m['activo'];
            $m['horas_semana'] = $m['horas_semana'] !== null ? intval($m['horas_semana']) : null;
            return $m;
        }, $st->fetchAll());

        $docentes = [];
        if (!$esDocente) {
            $st = $pdo->prepare("SELECT id, nombre, email, rol, activo FROM usuarios WHERE escuela_id = ? AND rol IN ('docente','admin') ORDER BY rol = 'admin', nombre");
            $st->execute([$eid]);
            $docentes = array_map(function ($d) {
                $d['id'] = intval($d['id']); $d['activo'] = (bool) $d['activo'];
                return $d;
            }, $st->fetchAll());
        }

        $grupos = [];
        if ($ciclo_id) {
            $sql = "SELECT g.*, a.nombre AS aula, u.nombre AS tutor,
                           (SELECT COUNT(*) FROM grupo_alumnos ga WHERE ga.grupo_id = g.id AND ga.activo = 1) AS num_alumnos,
                           (SELECT COUNT(*) FROM grupo_materias gm WHERE gm.grupo_id = g.id) AS num_materias
                    FROM grupos g
                    LEFT JOIN aulas a    ON a.id = g.aula_id
                    LEFT JOIN usuarios u ON u.id = g.tutor_id
                    WHERE g.escuela_id = ? AND g.ciclo_id = ?";
            $params = [$eid, $ciclo_id];
            if ($esDocente) {
                $sql .= " AND (g.tutor_id = ? OR EXISTS (SELECT 1 FROM grupo_materias gm2 WHERE gm2.grupo_id = g.id AND gm2.docente_id = ?))";
                $params[] = $ctx['user_id'];
                $params[] = $ctx['user_id'];
            }
            $sql .= " ORDER BY g.activo DESC, g.nivel, g.grado, g.nombre";
            $st = $pdo->prepare($sql);
            $st->execute($params);
            $grupos = array_map(function ($g) use ($ctx) {
                foreach (['id', 'ciclo_id', 'num_alumnos', 'num_materias'] as $k) $g[$k] = intval($g[$k]);
                foreach (['aula_id', 'tutor_id', 'cupo', 'grado_id'] as $k) $g[$k] = $g[$k] !== null ? intval($g[$k]) : null; // [F3] grado_id
                $g['activo'] = (bool) $g['activo'];
                $g['soy_tutor'] = $g['tutor_id'] === $ctx['user_id'];
                return $g;
            }, $st->fetchAll());
        }

        // Asignaciones grupo-materia del ciclo (para el selector de
        // calificaciones). Docente: solo las que imparte él, más todas las del
        // grupo donde es tutor (lectura).
        $asignaciones = [];
        if ($ciclo_id) {
            $sql = "SELECT gm.id, gm.grupo_id, gm.materia_id, gm.docente_id, m.nombre AS materia, g.nombre AS grupo, u.nombre AS docente
                    FROM grupo_materias gm
                    JOIN grupos g   ON g.id = gm.grupo_id
                    JOIN materias m ON m.id = gm.materia_id
                    LEFT JOIN usuarios u ON u.id = gm.docente_id
                    WHERE gm.escuela_id = ? AND g.ciclo_id = ?";
            $params = [$eid, $ciclo_id];
            if ($esDocente) {
                $sql .= " AND (gm.docente_id = ? OR g.tutor_id = ?)";
                $params[] = $ctx['user_id'];
                $params[] = $ctx['user_id'];
            }
            $sql .= " ORDER BY g.nombre, m.nombre";
            $st = $pdo->prepare($sql);
            $st->execute($params);
            $asignaciones = array_map(function ($a) use ($ctx) {
                foreach (['id', 'grupo_id', 'materia_id'] as $k) $a[$k] = intval($a[$k]);
                $a['docente_id'] = $a['docente_id'] !== null ? intval($a['docente_id']) : null;
                // [F3] 'direccion' solo lee: no puede calificar.
                $a['puedo_calificar'] = escolar_es_gestor($ctx) || ($ctx['rol'] === 'docente' && $a['docente_id'] === $ctx['user_id']);
                return $a;
            }, $st->fetchAll());
        }

        respond([
            'success'         => true,
            'ciclos'          => $ciclos,
            'ciclo_actual_id' => $ciclo_actual_id,
            'ciclo_id'        => $ciclo_id,
            'aulas'           => $aulas,
            'materias'        => $materias,
            'docentes'        => $docentes,
            'grupos'          => $grupos,
            'asignaciones'    => $asignaciones,
            'puede_gestionar' => escolar_es_gestor($ctx),
            // [F3] Catálogo de grados de la escuela (para el selector del grupo,
            // el asistente de mapeo y la promoción).
            'grados'          => escolar_grados($pdo, $eid),
        ]);
