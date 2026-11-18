<?php
        // [F3] Kárdex: trayectoria del alumno ciclo por ciclo (historial_academico de
        // los ciclos cerrados + el ciclo actual calculado en vivo).
        //   · superadmin / admin / control_escolar / direccion: cualquier alumno de la
        //     escuela (direccion solo lee; esta acción no escribe nada);
        //   · familia: solo sus hijos (requerir_familia_propia con la escuela);
        //   · alumno: solo el suyo.
        // Familia y alumno solo ven lo PUBLICADO (ver escolar_kardex en
        // lib/helpers_escolar_ciclo.php). El docente no tiene kárdex: es historial
        // de TODOS los ciclos, no de sus grupos.
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, array_merge(ESCOLAR_ROLES_LECTURA, ['familia', 'alumno']));
        $eid = $ctx['escuela_id'];
        $cid = intval($input['cliente_id'] ?? 0);
        // El alumno no manda cliente_id: es el suyo.
        if ($ctx['rol'] === 'alumno' && !$cid) $cid = intval($ctx['cliente_id'] ?? 0);

        // Filtrado por escuela desde la consulta: un id de otro colegio responde "no encontrado".
        $st = $pdo->prepare("SELECT id, nombre, matricula, curp, grado, grado_id, foto_url, familia_id FROM clientes WHERE id = ? AND escuela_id = ?");
        $st->execute([$cid, $eid]);
        $alumno = $st->fetch();
        if (!$alumno) respond(['success' => false, 'error' => 'Alumno no encontrado.']);
        // familia → requerir_familia_propia; alumno → requerir_alumno_propio (F4) o,
        // si esa fase aún no está, usuarios.cliente_id (ver escolar_requerir_alumno_visible).
        escolar_requerir_alumno_visible($pdo, $ctx, $usuario_actual, $alumno, 'Solo puedes ver el kárdex de tus hijos o el tuyo.');

        $gradoActual = null;
        if ($alumno['grado_id'] !== null) {
            $stg = $pdo->prepare("SELECT nombre_corto FROM niveles_grados WHERE id = ? AND escuela_id = ?");
            $stg->execute([intval($alumno['grado_id']), $eid]);
            $gradoActual = $stg->fetchColumn() ?: null;
        }
        $esc = $pdo->prepare("SELECT nombre, logo_url FROM escuelas WHERE id = ?");
        $esc->execute([$eid]);

        $k = escolar_kardex($pdo, $eid, intval($alumno['id']), escolar_es_portal($ctx));
        unset($alumno['familia_id']);
        $alumno['id'] = intval($alumno['id']);
        $alumno['grado_id'] = $alumno['grado_id'] !== null ? intval($alumno['grado_id']) : null;
        $alumno['grado_actual'] = $gradoActual ?: ($alumno['grado'] ?: null);
        respond([
            'success'         => true,
            'escuela'         => $esc->fetch() ?: null,
            'alumno'          => $alumno,
            'ciclos'          => $k['ciclos'],
            'promedio_global' => $k['promedio_global'],
        ]);
