<?php
        // Alta/edición/baja de un bloque del horario semanal. Antes de guardar
        // revisa los tres choques que de verdad pasan en un colegio:
        //   1. el GRUPO ya tiene otra clase a esa hora;
        //   2. el DOCENTE ya está dando clase en otro grupo a esa hora;
        //   3. el AULA ya está ocupada por otro grupo a esa hora.
        // Todo dentro del mismo ciclo escolar.
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, ESCOLAR_ROLES_GESTOR, ['escolar_grupos']);
        $eid = $ctx['escuela_id'];
        $id = intval($input['id'] ?? 0);

        if (!empty($input['eliminar'])) {
            $st = $pdo->prepare("DELETE FROM horarios WHERE id = ? AND escuela_id = ?");
            $st->execute([$id, $eid]);
            respond(['success' => (bool) $st->rowCount(), 'error' => $st->rowCount() ? null : 'Bloque no encontrado.']);
        }

        $gm = escolar_gm($pdo, $ctx, $input['grupo_materia_id'] ?? 0);
        $dia = intval($input['dia_semana'] ?? 0);
        if ($dia < 1 || $dia > 6) respond(['success' => false, 'error' => 'Elige un día de lunes a sábado.']);
        $ini = escolar_hora($input['hora_inicio'] ?? '', 'inicio');
        $fin = escolar_hora($input['hora_fin'] ?? '', 'fin');
        if ($fin <= $ini) respond(['success' => false, 'error' => 'La hora de fin debe ser posterior a la de inicio.']);
        $aula_id = intval($input['aula_id'] ?? 0) ?: null;
        if ($aula_id) {
            $chk = $pdo->prepare("SELECT 1 FROM aulas WHERE id = ? AND escuela_id = ?");
            $chk->execute([$aula_id, $eid]);
            if (!$chk->fetchColumn()) respond(['success' => false, 'error' => 'El aula elegida no existe.']);
        }

        $g = escolar_grupo($pdo, $ctx, $gm['grupo_id']);
        $aula_efectiva = $aula_id ?: ($g['aula_id'] ? intval($g['aula_id']) : null);

        // Bloques del mismo ciclo que se traslapan con [ini, fin) ese día.
        $st = $pdo->prepare(
            "SELECT h.id, gm.grupo_id, gm.docente_id, COALESCE(h.aula_id, g.aula_id) AS aula_ef,
                    g.nombre AS grupo, m.nombre AS materia,
                    TIME_FORMAT(h.hora_inicio,'%H:%i') AS hi, TIME_FORMAT(h.hora_fin,'%H:%i') AS hf
             FROM horarios h
             JOIN grupo_materias gm ON gm.id = h.grupo_materia_id
             JOIN grupos g ON g.id = gm.grupo_id
             JOIN materias m ON m.id = gm.materia_id
             WHERE h.escuela_id = ? AND g.ciclo_id = ? AND h.dia_semana = ? AND g.activo = 1
               AND h.hora_inicio < ? AND h.hora_fin > ? AND h.id <> ?"
        );
        $st->execute([$eid, $g['ciclo_id'], $dia, $fin, $ini, $id]);
        foreach ($st->fetchAll() as $o) {
            $cuando = "{$o['hi']}–{$o['hf']}";
            if (intval($o['grupo_id']) === intval($g['id'])) {
                respond(['success' => false, 'error' => "Choque: el grupo ya tiene {$o['materia']} de {$cuando}."]);
            }
            if ($gm['docente_id'] && intval($o['docente_id']) === intval($gm['docente_id'])) {
                respond(['success' => false, 'error' => "Choque: el docente ya da {$o['materia']} al grupo {$o['grupo']} de {$cuando}."]);
            }
            if ($aula_efectiva && intval($o['aula_ef']) === $aula_efectiva) {
                respond(['success' => false, 'error' => "Choque: el aula está ocupada por {$o['grupo']} ({$o['materia']}) de {$cuando}."]);
            }
        }

        if ($id) {
            $st = $pdo->prepare("UPDATE horarios SET grupo_materia_id=?, dia_semana=?, hora_inicio=?, hora_fin=?, aula_id=? WHERE id=? AND escuela_id=?");
            $st->execute([$gm['id'], $dia, $ini, $fin, $aula_id, $id, $eid]);
        } else {
            $st = $pdo->prepare("INSERT INTO horarios (escuela_id, grupo_materia_id, dia_semana, hora_inicio, hora_fin, aula_id) VALUES (?,?,?,?,?,?)");
            $st->execute([$eid, $gm['id'], $dia, $ini, $fin, $aula_id]);
            $id = intval($pdo->lastInsertId());
        }
        respond(['success' => true, 'id' => $id]);
