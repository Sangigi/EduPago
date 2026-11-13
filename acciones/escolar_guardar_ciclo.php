<?php
        // Alta/edición de un ciclo escolar junto con sus periodos de
        // evaluación. Los periodos llegan como lista completa: los que traen id
        // se actualizan, los nuevos se insertan y los que ya no vienen se
        // borran — salvo que tengan calificaciones capturadas.
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, ['superadmin', 'admin'], ['escolar_config']);
        $eid = $ctx['escuela_id'];

        $id     = intval($input['id'] ?? 0);
        $nombre = trim($input['nombre'] ?? '');
        if ($nombre === '' || mb_strlen($nombre) > 60) respond(['success' => false, 'error' => 'Escribe un nombre para el ciclo (ej. 2026-2027).']);
        $ini = escolar_fecha($input['fecha_inicio'] ?? '', 'fecha de inicio');
        $fin = escolar_fecha($input['fecha_fin'] ?? '', 'fecha de fin');
        if ($fin <= $ini) respond(['success' => false, 'error' => 'La fecha de fin debe ser posterior a la de inicio.']);

        $emin = floatval($input['escala_min'] ?? 5);
        $emax = floatval($input['escala_max'] ?? 10);
        $apr  = floatval($input['calif_aprobatoria'] ?? 6);
        if ($emin < 0 || $emax <= $emin || $emax > 100) respond(['success' => false, 'error' => 'La escala de calificación no es válida.']);
        if ($apr < $emin || $apr > $emax) respond(['success' => false, 'error' => 'La calificación aprobatoria debe estar dentro de la escala.']);
        $actual = !empty($input['actual']);

        $periodos = is_array($input['periodos'] ?? null) ? $input['periodos'] : [];
        if (!$periodos) respond(['success' => false, 'error' => 'Agrega al menos un periodo de evaluación (bimestre, trimestre…).']);
        if (count($periodos) > 12) respond(['success' => false, 'error' => 'Máximo 12 periodos por ciclo.']);
        $limpios = [];
        foreach ($periodos as $i => $p) {
            $pn = trim($p['nombre'] ?? '');
            if ($pn === '') respond(['success' => false, 'error' => 'Todos los periodos necesitan nombre.']);
            $pi = escolar_fecha($p['fecha_inicio'] ?? '', 'fecha de inicio del periodo "' . $pn . '"', true);
            $pf = escolar_fecha($p['fecha_fin'] ?? '', 'fecha de fin del periodo "' . $pn . '"', true);
            if ($pi && $pf && $pf < $pi) respond(['success' => false, 'error' => "El periodo \"{$pn}\" termina antes de empezar."]);
            $limpios[] = ['id' => intval($p['id'] ?? 0), 'nombre' => mb_substr($pn, 0, 60), 'orden' => $i + 1, 'ini' => $pi, 'fin' => $pf];
        }

        $pdo->beginTransaction();
        try {
            if ($id) {
                escolar_ciclo($pdo, $eid, $id);
                $pdo->prepare("UPDATE ciclos_escolares SET nombre=?, fecha_inicio=?, fecha_fin=?, escala_min=?, escala_max=?, calif_aprobatoria=? WHERE id=? AND escuela_id=?")
                    ->execute([$nombre, $ini, $fin, $emin, $emax, $apr, $id, $eid]);
            } else {
                $pdo->prepare("INSERT INTO ciclos_escolares (escuela_id, nombre, fecha_inicio, fecha_fin, escala_min, escala_max, calif_aprobatoria) VALUES (?,?,?,?,?,?,?)")
                    ->execute([$eid, $nombre, $ini, $fin, $emin, $emax, $apr]);
                $id = intval($pdo->lastInsertId());
                // El primer ciclo de la escuela nace como actual.
                $cnt = $pdo->prepare("SELECT COUNT(*) FROM ciclos_escolares WHERE escuela_id = ?");
                $cnt->execute([$eid]);
                if (intval($cnt->fetchColumn()) === 1) $actual = true;
            }
            if ($actual) {
                $pdo->prepare("UPDATE ciclos_escolares SET actual = (id = ?) WHERE escuela_id = ?")->execute([$id, $eid]);
            }

            // Periodos existentes del ciclo
            $st = $pdo->prepare("SELECT id FROM periodos_evaluacion WHERE ciclo_id = ? AND escuela_id = ?");
            $st->execute([$id, $eid]);
            $existentes = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
            $enviados = [];
            foreach ($limpios as $p) {
                if ($p['id'] && in_array($p['id'], $existentes, true)) {
                    $pdo->prepare("UPDATE periodos_evaluacion SET nombre=?, orden=?, fecha_inicio=?, fecha_fin=? WHERE id=?")
                        ->execute([$p['nombre'], $p['orden'], $p['ini'], $p['fin'], $p['id']]);
                    $enviados[] = $p['id'];
                } else {
                    $pdo->prepare("INSERT INTO periodos_evaluacion (escuela_id, ciclo_id, nombre, orden, fecha_inicio, fecha_fin) VALUES (?,?,?,?,?,?)")
                        ->execute([$eid, $id, $p['nombre'], $p['orden'], $p['ini'], $p['fin']]);
                }
            }
            $borrar = array_diff($existentes, $enviados);
            foreach ($borrar as $pid) {
                $c = $pdo->prepare("SELECT COUNT(*) FROM calificaciones WHERE periodo_id = ?");
                $c->execute([$pid]);
                if (intval($c->fetchColumn()) > 0) {
                    $pdo->rollBack();
                    respond(['success' => false, 'error' => 'No se puede quitar un periodo que ya tiene calificaciones capturadas.']);
                }
                $pdo->prepare("DELETE FROM periodos_evaluacion WHERE id = ?")->execute([$pid]);
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
        registrar_log($pdo, $usuario_actual, 'escolar_ciclo_guardado', "Ciclo #{$id}: {$nombre}", $eid);
        respond(['success' => true, 'id' => $id]);
