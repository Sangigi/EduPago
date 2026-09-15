<?php
        // Blindaje (11-sep-2026): este archivo no tenía requerir_rol ni
        // verificación de pertenencia de escuela -- cualquier usuario
        // autenticado, de cualquier rol y cualquier escuela, podía generar
        // una CLABE STP real para el alumno de otro colegio.
        $rol_clabe_ind = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_clabe_ind, ['superadmin', 'admin', 'cajero'], 'No tienes permiso para generar CLABEs.');

        $alumno_id  = trim($input['alumno_id']  ?? '');
        $matricula  = trim($input['matricula']  ?? '');
        $nombre     = trim($input['nombre']     ?? '');
        $email      = trim($input['email']      ?? '');
        if (!$alumno_id || !$nombre) respond(['success' => false, 'error' => 'alumno_id y nombre son requeridos']);

        $stmtEscClabeInd = $pdo->prepare("SELECT escuela_id FROM clientes WHERE id = ?");
        $stmtEscClabeInd->execute([$alumno_id]);
        $filaEscClabeInd = $stmtEscClabeInd->fetch();
        if (!$filaEscClabeInd) respond(['success' => false, 'error' => 'Alumno no encontrado']);
        requerir_escuela_propia($rol_clabe_ind, $filaEscClabeInd['escuela_id'], $usuario_actual, 'No tienes permiso sobre este alumno.');
        // Modo demo: una CLABE real, a diferencia de una liga/referencia, no
        // se "usa una vez" -- queda viva y puede recibir un SPEI real en
        // cualquier momento futuro. No hay forma segura de "simular" esto,
        // así que se bloquea por completo en vez de fingir una CLABE falsa.
        responder_demo_si_aplica($pdo, $filaEscClabeInd['escuela_id'], 'Esta cuenta está en modo de prueba: no se generan CLABEs SPEI reales.');

        $resClabe = generar_clabe_pagadetodo($pdo, $alumno_id, $matricula, $nombre, $email);
        if (!$resClabe['success']) respond($resClabe);
        respond([
            'success'      => true,
            'clabe'        => $resClabe['clabe'],
            'banco'        => SPEI_BANCO,
            'beneficiario' => SPEI_BENEFICIARIO,
            // El 'account' real mandado a Pagadetodo ya no es la matrícula
            // libre (ver nota en generar_clabe_pagadetodo) -- se refleja el
            // mismo identificador numérico que de verdad se registró, no el
            // que se hubiera calculado antes con la matrícula.
            'account'      => str_pad(strval(max(0, intval($alumno_id))), 15, '0', STR_PAD_LEFT),
        ]);