<?php
        // [F3] Cierra (o reabre) un ciclo escolar.
        //
        // CERRAR (cerrado = true, el default):
        //   · exige que TODOS los periodos del ciclo estén cerrados;
        //   · por cada alumno que estuvo inscrito en algún grupo del ciclo calcula
        //     la calificación final por materia (promedio de los periodos que tienen
        //     calificación), el promedio general y el resultado (aprobado / reprobado
        //     / sin_calificar contra la calificación aprobatoria del ciclo);
        //   · lo guarda en historial_academico (upsert por alumno+ciclo: volver a
        //     cerrar actualiza, no duplica, y NO borra las marcas de promoción);
        //   · marca el ciclo como cerrado: ya no se capturan calificaciones ni
        //     asistencias, ni se inscribe ni se editan sus grupos o periodos.
        // Todo en UNA transacción: o queda el ciclo completo cerrado o no cambia nada.
        //
        // REABRIR (cerrado = false): quita la marca para poder corregir; el
        // historial guardado se conserva hasta que se vuelva a cerrar.
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, ESCOLAR_ROLES_GESTOR, ['escolar_config', 'escolar_calificaciones']);
        $eid = $ctx['escuela_id'];
        $ciclo = escolar_ciclo($pdo, $eid, $input['ciclo_id'] ?? 0);
        $cid_ciclo = intval($ciclo['id']);
        $cerrar = !array_key_exists('cerrado', $input) || !empty($input['cerrado']);

        if (!$cerrar) {
            if (!escolar_ciclo_cerrado($ciclo)) respond(['success' => false, 'error' => "El ciclo {$ciclo['nombre']} no está cerrado."]);
            $pdo->prepare("UPDATE ciclos_escolares SET cerrado = 0, cerrado_en = NULL WHERE id = ? AND escuela_id = ?")->execute([$cid_ciclo, $eid]);
            $pr = $pdo->prepare("SELECT COUNT(*) FROM historial_academico WHERE ciclo_id = ? AND escuela_id = ? AND promovido_a_ciclo_id IS NOT NULL");
            $pr->execute([$cid_ciclo, $eid]);
            $promovidos = intval($pr->fetchColumn());
            registrar_log($pdo, $usuario_actual, 'escolar_ciclo_reabierto', "Ciclo #{$cid_ciclo}: {$ciclo['nombre']}", $eid);
            respond([
                'success' => true, 'cerrado' => false,
                'aviso'   => $promovidos
                    ? "{$promovidos} alumno(s) ya fueron promovidos con este ciclo. Si cambias calificaciones y vuelves a cerrar, su historial se actualiza pero su promoción NO se rehace."
                    : null,
            ]);
        }

        if (escolar_ciclo_cerrado($ciclo)) respond(['success' => false, 'error' => "El ciclo {$ciclo['nombre']} ya está cerrado."]);

        $st = $pdo->prepare("SELECT id, nombre, cerrado FROM periodos_evaluacion WHERE ciclo_id = ? AND escuela_id = ? ORDER BY orden, id");
        $st->execute([$cid_ciclo, $eid]);
        $periodos = $st->fetchAll();
        if (!$periodos) respond(['success' => false, 'error' => 'El ciclo no tiene periodos de evaluación: no hay calificaciones que cerrar.']);
        $abiertos = array_column(array_filter($periodos, function ($p) { return !intval($p['cerrado']); }), 'nombre');
        if ($abiertos) {
            respond(['success' => false, 'error' => 'Antes de cerrar el ciclo hay que cerrar todos sus periodos. Siguen abiertos: ' . implode(', ', $abiertos) . '.']);
        }

        // Todos los alumnos que estuvieron inscritos en el ciclo (aunque ya se hayan
        // dado de baja del grupo: sus calificaciones también cuentan).
        $st = $pdo->prepare(
            "SELECT DISTINCT ga.cliente_id FROM grupo_alumnos ga
             JOIN grupos g   ON g.id = ga.grupo_id
             JOIN clientes c ON c.id = ga.cliente_id
             WHERE g.escuela_id = ? AND g.ciclo_id = ? AND c.escuela_id = ?"
        );
        $st->execute([$eid, $cid_ciclo, $eid]);
        $alumnos = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));

        $grados = [];
        foreach (escolar_grados($pdo, $eid) as $g) $grados[$g['id']] = $g;
        $stc = $pdo->prepare("SELECT grado, grado_id FROM clientes WHERE id = ? AND escuela_id = ?");

        $up = $pdo->prepare(
            "INSERT INTO historial_academico
                (escuela_id, cliente_id, ciclo_id, grado_id, grado_nombre, grupo_id, grupo_nombre,
                 promedio_final, resultado, materias_reprobadas, materias, usuario_id)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE
                grado_id = VALUES(grado_id), grado_nombre = VALUES(grado_nombre),
                grupo_id = VALUES(grupo_id), grupo_nombre = VALUES(grupo_nombre),
                promedio_final = VALUES(promedio_final), resultado = VALUES(resultado),
                materias_reprobadas = VALUES(materias_reprobadas), materias = VALUES(materias),
                usuario_id = VALUES(usuario_id)"
        );
        $resumen = ['aprobado' => 0, 'reprobado' => 0, 'sin_calificar' => 0];
        $sumProm = 0; $nProm = 0;
        $pdo->beginTransaction();
        try {
            foreach ($alumnos as $alumno_id) {
                // La misma boleta que ven docentes y familias (todos los periodos,
                // sin filtrar por publicación): una sola cuenta para los promedios.
                $b = escolar_armar_boleta($pdo, $eid, $alumno_id, $ciclo, ['sin_asistencia' => true]);
                $r = escolar_resultado_final($b, $ciclo['calif_aprobatoria']);
                $resumen[$r['resultado']]++;
                if ($r['promedio_final'] !== null) { $sumProm += $r['promedio_final']; $nProm++; }

                // Grado cursado: el del grupo; si el grupo no lo tiene, el de la ficha del alumno.
                $grupo = $b['grupo'];
                $gradoId = $grupo['grado_id'] ?? null;
                $stc->execute([$alumno_id, $eid]);
                $ficha = $stc->fetch() ?: ['grado' => null, 'grado_id' => null];
                if (!$gradoId && $ficha['grado_id'] !== null) $gradoId = intval($ficha['grado_id']);
                if ($gradoId && isset($grados[$gradoId])) {
                    $gradoNombre = $grados[$gradoId]['nombre_corto'];
                } else {
                    $gradoId = null;
                    $gradoNombre = trim(($grupo['grado'] ?? '') . ' ' . ($grupo['nivel'] ?? '')) ?: (trim((string) $ficha['grado']) ?: null);
                }
                $up->execute([
                    $eid, $alumno_id, $cid_ciclo, $gradoId, $gradoNombre !== null ? mb_substr($gradoNombre, 0, 40) : null,
                    $grupo ? intval($grupo['id']) : null, $grupo ? mb_substr($grupo['nombre'], 0, 60) : null,
                    $r['promedio_final'], $r['resultado'], min(255, $r['materias_reprobadas']),
                    json_encode($r['materias'], JSON_UNESCAPED_UNICODE), $ctx['user_id'] ?: null,
                ]);
            }
            $pdo->prepare("UPDATE ciclos_escolares SET cerrado = 1, cerrado_en = NOW() WHERE id = ? AND escuela_id = ?")->execute([$cid_ciclo, $eid]);
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
        registrar_log($pdo, $usuario_actual, 'escolar_ciclo_cerrado',
            "Ciclo #{$cid_ciclo}: {$ciclo['nombre']} · " . count($alumnos) . " alumno(s): {$resumen['aprobado']} aprobados, {$resumen['reprobado']} reprobados, {$resumen['sin_calificar']} sin calificar", $eid);
        respond([
            'success'          => true,
            'cerrado'          => true,
            'alumnos'          => count($alumnos),
            'resumen'          => $resumen,
            'promedio_general' => $nProm ? escolar_redondear($sumProm / $nProm) : null,
            'aviso'            => $resumen['sin_calificar'] ? "{$resumen['sin_calificar']} alumno(s) no tienen ninguna calificación: quedan como 'sin calificar' y la promoción te pedirá decidir su caso." : null,
        ]);
