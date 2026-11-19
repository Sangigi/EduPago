<?php
        // Guarda el pase de lista de un grupo en una fecha (upsert por alumno).
        // Puede hacerlo la administración o cualquier docente del grupo.
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, array_merge(ESCOLAR_ROLES_GESTOR, ['docente']), ['escolar_asistencias']);
        $eid = $ctx['escuela_id'];
        $g = escolar_grupo($pdo, $ctx, $input['grupo_id'] ?? 0);
        $gid = intval($g['id']);
        // [F3] Con el ciclo cerrado no se pasa lista (ver escolar_cerrar_ciclo.php).
        escolar_requerir_ciclo_abierto(escolar_ciclo($pdo, $eid, $g['ciclo_id']), 'modificar asistencias');
        $fecha = escolar_fecha($input['fecha'] ?? '');
        if ($fecha > date('Y-m-d')) respond(['success' => false, 'error' => 'No se puede pasar lista de una fecha futura.']);
        // El docente solo corrige la última semana; lo anterior, la administración.
        if ($ctx['rol'] === 'docente' && $fecha < date('Y-m-d', strtotime('-7 days'))) {
            respond(['success' => false, 'error' => 'Solo puedes capturar o corregir asistencias de los últimos 7 días. Para fechas anteriores, pide el cambio a la administración.']);
        }

        $registros = is_array($input['registros'] ?? null) ? $input['registros'] : [];
        if (!$registros) respond(['success' => false, 'error' => 'No hay asistencias que guardar.']);

        $inscritos = array_column(escolar_alumnos_grupo($pdo, $gid), 'id');

        // [F3] Un docente que no es tutor del grupo no pisa lo que otra
        // persona ya capturó ese día (típico: el tutor pasó lista en la
        // mañana y el de Inglés, que solo da una clase, la sobrescribe). Si el
        // registro ya existe y lo capturó otro usuario, se salta y se avisa.
        // El tutor y la administración sí corrigen cualquier registro.
        $bloqueados = [];
        if ($ctx['rol'] === 'docente' && intval($g['tutor_id'] ?? 0) !== $ctx['user_id']) {
            $ex = $pdo->prepare("SELECT cliente_id FROM asistencias WHERE grupo_id = ? AND fecha = ? AND usuario_id IS NOT NULL AND usuario_id <> ?");
            $ex->execute([$gid, $fecha, $ctx['user_id']]);
            $bloqueados = array_flip(array_map('intval', $ex->fetchAll(PDO::FETCH_COLUMN)));
        }
        $omitidos = 0;
        $st = $pdo->prepare(
            "INSERT INTO asistencias (escuela_id, grupo_id, cliente_id, fecha, estado, observacion, usuario_id)
             VALUES (?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE estado = VALUES(estado), observacion = VALUES(observacion), usuario_id = VALUES(usuario_id)"
        );
        $n = 0;
        $pdo->beginTransaction();
        try {
            foreach ($registros as $r) {
                $cid = intval($r['cliente_id'] ?? 0);
                $estado = $r['estado'] ?? '';
                if (!in_array($cid, $inscritos, true)) continue;
                if (isset($bloqueados[$cid])) { $omitidos++; continue; } // [F3]
                if (!in_array($estado, ESCOLAR_ESTADOS_ASISTENCIA, true)) {
                    $pdo->rollBack();
                    respond(['success' => false, 'error' => 'Estado de asistencia inválido.']);
                }
                $obs = mb_substr(trim($r['observacion'] ?? ''), 0, 255) ?: null;
                $st->execute([$eid, $gid, $cid, $fecha, $estado, $obs, $ctx['user_id']]);
                $n++;
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
        registrar_log($pdo, $usuario_actual, 'escolar_asistencia', "Grupo {$g['nombre']} · {$fecha} · {$n} alumno(s)", $eid);
        respond([
            'success'   => true,
            'guardados' => $n,
            // [F3] Registros que no se tocaron porque los capturó otro usuario.
            'omitidos'  => $omitidos,
            'aviso'     => $omitidos ? "{$omitidos} registro(s) ya los había capturado otra persona y no se modificaron (solo el tutor del grupo o la administración pueden corregirlos)." : null,
        ]);
