<?php
        // Sábana de calificaciones de una materia en un grupo: alumnos ×
        // periodos del ciclo, con su escala y qué periodos puede editar quien
        // pregunta.
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, array_merge(ESCOLAR_ROLES_LECTURA, ['docente']), ['escolar_calificaciones']);
        $gm = escolar_gm($pdo, $ctx, $input['grupo_materia_id'] ?? 0);
        $ciclo = escolar_ciclo($pdo, $ctx['escuela_id'], $gm['ciclo_id']);
        // [F3] 'direccion' solo lee: antes $esSuya era true para cualquier rol
        // que no fuera docente. Escribe quien gestiona, o el docente de la materia.
        $esSuya = escolar_es_gestor($ctx) || ($ctx['rol'] === 'docente' && intval($gm['docente_id']) === $ctx['user_id']);
        // [F3] Ciclo cerrado: nadie captura (ni la administración) hasta reabrirlo.
        $cicloCerrado = escolar_ciclo_cerrado($ciclo);

        $st = $pdo->prepare("SELECT id, nombre, orden, cerrado, publicado, fecha_inicio, fecha_fin FROM periodos_evaluacion WHERE ciclo_id = ? AND escuela_id = ? ORDER BY orden, id");
        $st->execute([$ciclo['id'], $ctx['escuela_id']]);
        $periodos = array_map(function ($p) use ($ctx, $esSuya, $cicloCerrado) {
            $p['id'] = intval($p['id']);
            $p['cerrado'] = (bool) $p['cerrado'];
            $p['publicado'] = (bool) $p['publicado']; // [F3]
            $p['editable'] = !$cicloCerrado && $esSuya && (escolar_es_gestor($ctx) || !$p['cerrado']);
            return $p;
        }, $st->fetchAll());

        $alumnos = escolar_alumnos_grupo($pdo, $gm['grupo_id']);
        $st = $pdo->prepare("SELECT cliente_id, periodo_id, calificacion, observacion FROM calificaciones WHERE grupo_materia_id = ?");
        $st->execute([$gm['id']]);
        $mapa = [];
        foreach ($st->fetchAll() as $c) {
            $mapa[intval($c['cliente_id'])][intval($c['periodo_id'])] = [
                'calificacion' => $c['calificacion'] !== null ? floatval($c['calificacion']) : null,
                'observacion'  => $c['observacion'] ?? '',
            ];
        }
        foreach ($alumnos as &$a) {
            $a['calificaciones'] = (object) ($mapa[$a['id']] ?? []);
            $vals = array_filter(array_column($mapa[$a['id']] ?? [], 'calificacion'), function ($v) { return $v !== null; });
            $a['promedio'] = $vals ? escolar_redondear(array_sum($vals) / count($vals)) : null;
        }
        unset($a);

        respond([
            'success'  => true,
            'asignacion' => [
                'id' => intval($gm['id']), 'grupo_id' => intval($gm['grupo_id']), 'grupo' => $gm['grupo'],
                'materia' => $gm['materia'], 'docente_id' => $gm['docente_id'] !== null ? intval($gm['docente_id']) : null,
            ],
            'ciclo'    => [
                'id' => intval($ciclo['id']), 'nombre' => $ciclo['nombre'],
                'escala_min' => floatval($ciclo['escala_min']), 'escala_max' => floatval($ciclo['escala_max']),
                'calif_aprobatoria' => floatval($ciclo['calif_aprobatoria']),
                'cerrado' => $cicloCerrado, // [F3]
            ],
            'periodos' => $periodos,
            'alumnos'  => $alumnos,
        ]);
