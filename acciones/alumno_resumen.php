<?php
        // [F4] Portal del alumno: lo básico de SU ficha en una sola llamada
        // (inicio del portal). Solo para el rol 'alumno', y solo de sí mismo.
        //
        // QUÉ NO TRAE, a propósito: nada de cobranza (adeudos, cobros, CLABE,
        // saldo pendiente de la familia), ni datos médicos/observaciones del
        // expediente, ni teléfonos de tutores. El alumno es menor de edad y esta
        // pantalla la ve él, no su familia. Las calificaciones salen de la misma
        // boleta que ve la familia, así que SOLO periodos publicados.
        //
        // A QUIÉN PERTENECE: el alumno lo decide usuarios.cliente_id (lo lee
        // verificar_token_auth() fresco de la base). Esta acción ignora cualquier
        // cliente_id que mande el navegador.
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, ['alumno'],
            ['escolar_grupos', 'escolar_asistencias', 'escolar_calificaciones']);
        $eid = $ctx['escuela_id'];
        $cid = intval($ctx['cliente_id'] ?? 0);
        // Sin vínculo (migración pendiente o cuenta mal creada) → se niega.
        requerir_alumno_propio($cid, $usuario_actual, 'Tu cuenta todavía no está ligada a un alumno. Avisa a la coordinación del colegio.');

        // Filtrado por escuela desde la consulta: si cliente_id apuntara a otro colegio no regresa nada.
        $st = $pdo->prepare("SELECT id, nombre, matricula, grado, foto_url, activo FROM clientes WHERE id = ? AND escuela_id = ? AND COALESCE(tipo,'alumno') = 'alumno'");
        $st->execute([$cid, $eid]);
        $alumno = $st->fetch();
        if (!$alumno) respond(['success' => false, 'error' => 'No encontramos tu ficha de alumno.']);
        // Un alumno dado de baja conserva su cuenta (la coordinación decide si la
        // desactiva), pero deja de ver su información del ciclo en curso.
        if (!$alumno['activo']) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'Tu ficha de alumno no está activa. Consulta con la coordinación del colegio.']);
        }
        $alumno['id'] = intval($alumno['id']);
        unset($alumno['activo']);

        $esc = $pdo->prepare("SELECT nombre, logo_url FROM escuelas WHERE id = ?");
        $esc->execute([$eid]);
        $escuela = $esc->fetch() ?: null;

        $ciclo = escolar_ciclo_actual($pdo, $eid);
        if (!$ciclo) {
            respond(['success' => true, 'escuela' => $escuela, 'alumno' => $alumno, 'ciclo' => null,
                     'grupo' => null, 'horario' => [], 'asistencia' => null, 'asistencia_reciente' => [],
                     'boleta' => null, 'monedero' => null]);
        }

        // La misma cuenta que usan la familia y el docente: grupo, periodos
        // publicados, promedios y resumen de asistencia del ciclo.
        $boleta = escolar_armar_boleta($pdo, $eid, $cid, $ciclo, ['solo_publicados' => true]);
        $grupo = $boleta['grupo'];

        // Horario semanal del grupo actual.
        $horario = [];
        if ($grupo) {
            $sh = $pdo->prepare(
                "SELECT h.dia_semana, TIME_FORMAT(h.hora_inicio,'%H:%i') AS hora_inicio, TIME_FORMAT(h.hora_fin,'%H:%i') AS hora_fin,
                        a.nombre AS aula, m.nombre AS materia, u.nombre AS docente
                 FROM horarios h
                 JOIN grupo_materias gm ON gm.id = h.grupo_materia_id
                 JOIN materias m ON m.id = gm.materia_id
                 LEFT JOIN usuarios u ON u.id = gm.docente_id
                 LEFT JOIN aulas a ON a.id = h.aula_id
                 WHERE gm.grupo_id = ? AND gm.escuela_id = ? ORDER BY h.dia_semana, h.hora_inicio"
            );
            $sh->execute([intval($grupo['id']), $eid]);
            $horario = array_map(function ($h) {
                $h['dia_semana'] = intval($h['dia_semana']);
                return $h;
            }, $sh->fetchAll());
        }

        // Asistencia reciente: los últimos 20 registros del ciclo (todos los estados).
        $sa = $pdo->prepare(
            "SELECT fecha, estado, observacion FROM asistencias
             WHERE escuela_id = ? AND cliente_id = ? AND fecha BETWEEN ? AND ?
             ORDER BY fecha DESC LIMIT 20"
        );
        $sa->execute([$eid, $cid, $ciclo['fecha_inicio'], $ciclo['fecha_fin']]);
        $reciente = $sa->fetchAll();

        // Monedero (F6): solo si esa fase ya está integrada. Sin la función ni la
        // tabla se omite sin error: el portal oculta su pestaña. try/catch con
        // Throwable porque la firma de monedero_saldo_de() la define F6 y un
        // desajuste no debe tumbar el resto del resumen.
        $monedero = null;
        try {
            if (function_exists('monedero_saldo_de')) {
                $monedero = ['saldo' => floatval(monedero_saldo_de($pdo, $cid))];
            } else {
                $sm = $pdo->prepare("SELECT saldo FROM monederos WHERE escuela_id = ? AND cliente_id = ? LIMIT 1");
                $sm->execute([$eid, $cid]);
                $fm = $sm->fetch();
                if ($fm) $monedero = ['saldo' => floatval($fm['saldo'])];
            }
        } catch (\Throwable $e) {
            $monedero = null; // F6 aún no integrada (sin función o sin tabla)
        }

        respond([
            'success'  => true,
            'escuela'  => $escuela,
            'alumno'   => $alumno,
            'ciclo'    => [
                'id' => intval($ciclo['id']), 'nombre' => $ciclo['nombre'],
                'escala_min' => floatval($ciclo['escala_min']), 'escala_max' => floatval($ciclo['escala_max']),
                'calif_aprobatoria' => floatval($ciclo['calif_aprobatoria']),
                'cerrado' => escolar_ciclo_cerrado($ciclo),
            ],
            'grupo'    => $grupo ? ['id' => intval($grupo['id']), 'nombre' => $grupo['nombre'], 'nivel' => $grupo['nivel'], 'grado' => $grupo['grado'], 'turno' => $grupo['turno'], 'tutor' => $grupo['tutor']] : null,
            'horario'  => $horario,
            'asistencia' => $boleta['asistencia'],
            'asistencia_reciente' => $reciente,
            'boleta'   => ['periodos' => $boleta['periodos'], 'materias' => $boleta['materias'], 'promedio_general' => $boleta['promedio_general'], 'promedio_periodo' => $boleta['promedio_periodo']],
            'monedero' => $monedero,
        ]);
