<?php
        // Inscribe alumnos (clientes.id) a un grupo. Un alumno solo puede estar
        // en UN grupo activo por ciclo: si ya estaba en otro, se le da de baja
        // allá (cambio de grupo) — sus asistencias y calificaciones viejas se
        // conservan, la baja es lógica.
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, ['superadmin', 'admin'], ['escolar_grupos']);
        $eid = $ctx['escuela_id'];
        $g = escolar_grupo($pdo, $ctx, $input['grupo_id'] ?? 0);
        $gid = intval($g['id']);

        $ids = array_values(array_unique(array_filter(array_map('intval', (array) ($input['cliente_ids'] ?? [])))));
        if (!$ids) respond(['success' => false, 'error' => 'Selecciona al menos un alumno.']);
        if (count($ids) > 500) respond(['success' => false, 'error' => 'Máximo 500 alumnos por operación.']);

        $in = implode(',', array_fill(0, count($ids), '?'));
        $st = $pdo->prepare("SELECT id FROM clientes WHERE escuela_id = ? AND id IN ($in)");
        $st->execute(array_merge([$eid], $ids));
        $validos = array_map('intval', $st->fetchAll(PDO::FETCH_COLUMN));
        if (count($validos) !== count($ids)) respond(['success' => false, 'error' => 'Uno o más alumnos no pertenecen a este colegio.']);

        if ($g['cupo']) {
            $st = $pdo->prepare("SELECT COUNT(*) FROM grupo_alumnos WHERE grupo_id = ? AND activo = 1 AND cliente_id NOT IN ($in)");
            $st->execute(array_merge([$gid], $ids));
            $ocupados = intval($st->fetchColumn());
            if ($ocupados + count($ids) > intval($g['cupo'])) {
                respond(['success' => false, 'error' => "El grupo tiene cupo para {$g['cupo']} alumnos y ya hay {$ocupados} inscritos."]);
            }
        }

        $movidos = 0;
        $pdo->beginTransaction();
        try {
            $baja = $pdo->prepare(
                "UPDATE grupo_alumnos ga JOIN grupos g ON g.id = ga.grupo_id
                 SET ga.activo = 0, ga.fecha_baja = CURDATE()
                 WHERE ga.cliente_id = ? AND ga.activo = 1 AND g.ciclo_id = ? AND ga.grupo_id <> ?"
            );
            $alta = $pdo->prepare(
                "INSERT INTO grupo_alumnos (escuela_id, grupo_id, cliente_id, fecha_alta, activo)
                 VALUES (?, ?, ?, CURDATE(), 1)
                 ON DUPLICATE KEY UPDATE activo = 1, fecha_baja = NULL"
            );
            foreach ($validos as $cid) {
                $baja->execute([$cid, $g['ciclo_id'], $gid]);
                $movidos += $baja->rowCount();
                $alta->execute([$eid, $gid, $cid]);
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
        registrar_log($pdo, $usuario_actual, 'escolar_inscripcion', count($validos) . " alumno(s) al grupo #{$gid} ({$g['nombre']}); {$movidos} cambiado(s) de grupo", $eid);
        respond(['success' => true, 'inscritos' => count($validos), 'cambiados_de_grupo' => $movidos]);
