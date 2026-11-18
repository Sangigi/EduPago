<?php
        // Boleta de calificaciones de un alumno en un ciclo (por defecto el
        // actual). La pueden pedir:
        //   · admin/superadmin/control_escolar: cualquier alumno de la escuela;
        //   · direccion: cualquier alumno de la escuela, solo lectura;
        //   · docente: alumnos de sus grupos;
        //   · familia: solo sus hijos;
        //   · [F3] alumno: solo la suya.
        // Familia y alumno solo ven periodos PUBLICADOS por el colegio.
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, array_merge(ESCOLAR_ROLES_LECTURA, ['docente', 'familia', 'alumno']),
            ['escolar_grupos', 'escolar_asistencias', 'escolar_calificaciones']);
        $eid = $ctx['escuela_id'];
        // [F3] El alumno no manda cliente_id: es el suyo (si lo mandara, abajo se compara).
        $cid = intval($input['cliente_id'] ?? 0);
        if ($ctx['rol'] === 'alumno' && !$cid) $cid = intval($ctx['cliente_id'] ?? 0);

        $st = $pdo->prepare("SELECT id, nombre, matricula, curp, grado, foto_url, familia_id FROM clientes WHERE id = ? AND escuela_id = ?");
        $st->execute([$cid, $eid]);
        $alumno = $st->fetch();
        if (!$alumno) respond(['success' => false, 'error' => 'Alumno no encontrado.']);
        // [F3] familia → sus hijos; alumno → él mismo (ver escolar_requerir_alumno_visible).
        escolar_requerir_alumno_visible($pdo, $ctx, $usuario_actual, $alumno, 'Solo puedes ver tu propia boleta o la de tus hijos.');

        $ciclo_id = intval($input['ciclo_id'] ?? 0);
        $ciclo = $ciclo_id ? escolar_ciclo($pdo, $eid, $ciclo_id) : escolar_ciclo_actual($pdo, $eid);
        if (!$ciclo) respond(['success' => false, 'error' => 'El colegio todavía no tiene ciclos escolares configurados.']);

        if ($ctx['rol'] === 'docente') {
            // [F3] ga.activo = 1: un docente que perdió al alumno (baja del
            // grupo) ya no debe poder abrir su boleta.
            $chk = $pdo->prepare(
                "SELECT 1 FROM grupo_alumnos ga JOIN grupos g ON g.id = ga.grupo_id
                 WHERE ga.cliente_id = ? AND ga.activo = 1 AND g.ciclo_id = ?
                   AND (g.tutor_id = ? OR EXISTS (SELECT 1 FROM grupo_materias gm WHERE gm.grupo_id = g.id AND gm.docente_id = ?))
                 LIMIT 1"
            );
            $chk->execute([$cid, $ciclo['id'], $ctx['user_id'], $ctx['user_id']]);
            if (!$chk->fetchColumn()) escolar_403('Ese alumno no está en ninguno de tus grupos.');
        }

        $esc = $pdo->prepare("SELECT nombre, logo_url FROM escuelas WHERE id = ?");
        $esc->execute([$eid]);

        unset($alumno['familia_id']);
        $alumno['id'] = intval($alumno['id']);
        respond([
            'success' => true,
            'escuela' => $esc->fetch() ?: null,
            'alumno'  => $alumno,
            'ciclo'   => [
                'id' => intval($ciclo['id']), 'nombre' => $ciclo['nombre'],
                'fecha_inicio' => $ciclo['fecha_inicio'], 'fecha_fin' => $ciclo['fecha_fin'],
                'escala_min' => floatval($ciclo['escala_min']), 'escala_max' => floatval($ciclo['escala_max']),
                'calif_aprobatoria' => floatval($ciclo['calif_aprobatoria']),
                'cerrado' => escolar_ciclo_cerrado($ciclo), // [F3]
            ],
            'boleta'  => escolar_armar_boleta($pdo, $eid, $cid, $ciclo, ['solo_publicados' => escolar_es_portal($ctx)]),
        ]);
