<?php
        // Guarda calificaciones de una materia/grupo. Reglas:
        //   · Docente: solo SU materia y solo periodos abiertos.
        //   · Admin: cualquier materia, incluso periodos cerrados (correcciones).
        //   · La nota debe estar dentro de la escala del ciclo.
        //   · Calificación y observación vacías = se borra el registro.
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, ['superadmin', 'admin', 'docente'], ['escolar_calificaciones']);
        $eid = $ctx['escuela_id'];
        $gm = escolar_gm($pdo, $ctx, $input['grupo_materia_id'] ?? 0, true);
        $ciclo = escolar_ciclo($pdo, $eid, $gm['ciclo_id']);
        $emin = floatval($ciclo['escala_min']);
        $emax = floatval($ciclo['escala_max']);

        $st = $pdo->prepare("SELECT id, nombre, cerrado FROM periodos_evaluacion WHERE ciclo_id = ?");
        $st->execute([$ciclo['id']]);
        $periodos = [];
        foreach ($st->fetchAll() as $p) $periodos[intval($p['id'])] = $p;

        $inscritos = array_column(escolar_alumnos_grupo($pdo, $gm['grupo_id']), 'id');
        $registros = is_array($input['registros'] ?? null) ? $input['registros'] : [];
        if (!$registros) respond(['success' => false, 'error' => 'No hay calificaciones que guardar.']);

        $up = $pdo->prepare(
            "INSERT INTO calificaciones (escuela_id, grupo_materia_id, cliente_id, periodo_id, calificacion, observacion, usuario_id)
             VALUES (?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE calificacion = VALUES(calificacion), observacion = VALUES(observacion), usuario_id = VALUES(usuario_id)"
        );
        $del = $pdo->prepare("DELETE FROM calificaciones WHERE grupo_materia_id = ? AND cliente_id = ? AND periodo_id = ?");
        $n = 0;
        $pdo->beginTransaction();
        try {
            foreach ($registros as $r) {
                $cid = intval($r['cliente_id'] ?? 0);
                $pid = intval($r['periodo_id'] ?? 0);
                if (!in_array($cid, $inscritos, true)) continue;
                if (!isset($periodos[$pid])) {
                    $pdo->rollBack();
                    respond(['success' => false, 'error' => 'Periodo inválido para este ciclo.']);
                }
                if ($periodos[$pid]['cerrado'] && !escolar_es_gestor($ctx)) {
                    $pdo->rollBack();
                    respond(['success' => false, 'error' => "El periodo \"{$periodos[$pid]['nombre']}\" ya está cerrado. Pide a la administración que lo reabra."]);
                }
                $raw = $r['calificacion'] ?? null;
                $obs = mb_substr(trim($r['observacion'] ?? ''), 0, 255) ?: null;
                if ($raw === null || $raw === '') {
                    if ($obs === null) { $del->execute([$gm['id'], $cid, $pid]); $n++; continue; }
                    $cal = null;
                } else {
                    if (!is_numeric($raw)) {
                        $pdo->rollBack();
                        respond(['success' => false, 'error' => 'Hay una calificación que no es un número.']);
                    }
                    $cal = round(floatval($raw), 2);
                    if ($cal < $emin || $cal > $emax) {
                        $pdo->rollBack();
                        respond(['success' => false, 'error' => "Las calificaciones deben ir de {$emin} a {$emax}."]);
                    }
                }
                $up->execute([$eid, $gm['id'], $cid, $pid, $cal, $obs, $ctx['user_id']]);
                $n++;
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
        registrar_log($pdo, $usuario_actual, 'escolar_calificaciones', "{$gm['materia']} · {$gm['grupo']} · {$n} registro(s)", $eid);
        respond(['success' => true, 'guardados' => $n]);
