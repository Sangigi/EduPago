<?php
        // Guarda el pase de lista de un grupo en una fecha (upsert por alumno).
        // Puede hacerlo la administración o cualquier docente del grupo.
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, ['superadmin', 'admin', 'docente'], ['escolar_asistencias']);
        $eid = $ctx['escuela_id'];
        $g = escolar_grupo($pdo, $ctx, $input['grupo_id'] ?? 0);
        $gid = intval($g['id']);
        $fecha = escolar_fecha($input['fecha'] ?? '');
        if ($fecha > date('Y-m-d')) respond(['success' => false, 'error' => 'No se puede pasar lista de una fecha futura.']);
        // El docente solo corrige la última semana; lo anterior, la administración.
        if ($ctx['rol'] === 'docente' && $fecha < date('Y-m-d', strtotime('-7 days'))) {
            respond(['success' => false, 'error' => 'Solo puedes capturar o corregir asistencias de los últimos 7 días. Para fechas anteriores, pide el cambio a la administración.']);
        }

        $registros = is_array($input['registros'] ?? null) ? $input['registros'] : [];
        if (!$registros) respond(['success' => false, 'error' => 'No hay asistencias que guardar.']);

        $inscritos = array_column(escolar_alumnos_grupo($pdo, $gid), 'id');
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
        respond(['success' => true, 'guardados' => $n]);
