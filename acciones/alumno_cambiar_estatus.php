<?php
        // [F1] Cambiar el estatus de un alumno: baja temporal, baja definitiva,
        // egreso, traslado o reactivación. Reemplaza al toggle de activo/inactivo
        // (que sigue existiendo, pero ahora pasa por la misma función).
        //
        // Body: { cliente_id, estatus, motivo (obligatorio salvo al reactivar),
        //         fecha?, cobros_cancelar?: [ids], clabe?: 'conservar'|'liberar',
        //         sacar_de_grupos?: bool }
        //
        // Qué pasa con los adeudos al dar de baja lo decide el admin caso por
        // caso: por defecto se CONSERVAN todos y la CLABE también. Solo se
        // cancelan los cobros que vengan en cobros_cancelar, y solo si no tienen
        // abonos (ver alumno_cambiar_estatus() en lib/helpers_alumnos.php).
        //
        // Roles: gestión de alumnos. 'control_escolar' puede cambiar el estatus
        // pero NO cancelar adeudos ni liberar la CLABE (eso es cobranza); el
        // helper lo rechaza. El cajero no, igual que en el toggle de siempre.
        $rol_ce = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_ce, ['superadmin', 'admin', 'control_escolar'], 'No tienes permiso para cambiar el estatus de alumnos.');
        $cliente_id_ce = intval($input['cliente_id'] ?? 0);
        if (!$cliente_id_ce) respond(['success' => false, 'error' => 'cliente_id requerido']);

        // Pertenencia: la escuela sale de la FILA, nunca del input.
        $chk_ce = $pdo->prepare("SELECT escuela_id FROM clientes WHERE id = ?");
        $chk_ce->execute([$cliente_id_ce]);
        $fila_ce = $chk_ce->fetch();
        if (!$fila_ce) {
            http_response_code(404);
            respond(['success' => false, 'error' => 'No encontramos a ese alumno.']);
        }
        requerir_escuela_propia($rol_ce, $fila_ce['escuela_id'], $usuario_actual, 'No tienes permiso sobre este alumno.');
        requerir_seccion_habilitada($pdo, $rol_ce, $fila_ce['escuela_id'], ['alumnos', 'familias']);

        $opciones_ce = [];
        if (isset($input['fecha']) && trim(strval($input['fecha'])) !== '') {
            $opciones_ce['fecha'] = trim(strval($input['fecha']));
        }
        if (array_key_exists('sacar_de_grupos', $input)) {
            $opciones_ce['sacar_de_grupos'] = filter_var($input['sacar_de_grupos'], FILTER_VALIDATE_BOOLEAN);
        }
        if (array_key_exists('cobros_cancelar', $input)) {
            $opciones_ce['cobros_cancelar'] = $input['cobros_cancelar'];
        }
        if (isset($input['clabe'])) {
            $opciones_ce['clabe'] = strval($input['clabe']);
        }
        // Cancelar cobros desde aquí es lo mismo que cancelarlos en Cobros: si el
        // super admin apagó esa sección para el colegio, tampoco por esta vía.
        if (!empty($opciones_ce['cobros_cancelar'])) {
            requerir_seccion_habilitada($pdo, $rol_ce, $fila_ce['escuela_id'], ['cobros'],
                'La sección de cobros está deshabilitada para tu colegio: no puedes cancelar adeudos desde aquí.');
        }

        $res_ce = alumno_cambiar_estatus(
            $pdo,
            $cliente_id_ce,
            strval($input['estatus'] ?? ''),
            isset($input['motivo']) ? strval($input['motivo']) : null,
            $usuario_actual,
            $opciones_ce
        );
        if (empty($res_ce['success'])) {
            log_api("alumno_cambiar_estatus RECHAZADO cliente #{$cliente_id_ce} -> " . ($input['estatus'] ?? '?') . ': ' . ($res_ce['error'] ?? ''));
        }
        respond($res_ce);
