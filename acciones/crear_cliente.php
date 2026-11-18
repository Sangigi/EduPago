<?php
        // El cajero SÍ puede dar de alta alumnos (para poder cobrarles el mismo
        // día que llegan), pero no editarlos ni desactivarlos — eso sigue
        // restringido a admin/superadmin más abajo en editar_cliente y
        // toggle_cliente_activo.
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin', 'admin', 'cajero'], 'No tienes permiso para dar de alta alumnos.');
        $escuela_id = intval($input['escuela_id'] ?? 0);
        $nombre     = trim($input['nombre']       ?? '');
        $matricula  = trim($input['matricula']    ?? '') ?: null;
        $grado      = trim($input['grado']        ?? '') ?: null;
        $curp       = trim($input['curp']         ?? '') ?: null;
        $email      = validar_email_opcional($input['email'] ?? '');
        $tel        = trim($input['tel']          ?? '') ?: null;
        $familia_id = intval($input['familia_id'] ?? 0) ?: null;
        $tipo       = in_array($input['tipo'] ?? '', ['alumno','general']) ? $input['tipo'] : 'alumno';
        $direccion           = trim($input['direccion']           ?? '') ?: null;
        $contacto_emergencia = trim($input['contacto_emergencia'] ?? '') ?: null;
        $tel_emergencia      = trim($input['tel_emergencia']      ?? '') ?: null;
        $doc_curp_url        = trim($input['doc_curp_url']        ?? '') ?: null;
        $doc_acta_url        = trim($input['doc_acta_url']        ?? '') ?: null;
        $doc_ine_tutor_url   = trim($input['doc_ine_tutor_url']   ?? '') ?: null;
        $nivel_educativo_sat = trim($input['nivel_educativo_sat'] ?? '') ?: null;
        $parentesco          = normalizar_parentesco($input['parentesco'] ?? '');
        $foto_url            = validar_url_imagen($input['foto_url'] ?? '', 'enlace de la foto');
        if (!$escuela_id || !$nombre) respond(['success' => false, 'error' => 'escuela_id y nombre son requeridos']);
        requerir_seccion_habilitada($pdo, $rol_actual, $escuela_id, ['alumnos', 'familias']);
        // Límite de alumnos según el plan contratado (ver PLANES_LIMITES arriba)
        // [F1] La regla se extrajo a alumno_validar_limite_plan()
        // (lib/helpers_alumnos.php) para que reactivar a un alumno aplique
        // exactamente la misma y no sea una puerta trasera para pasarse del plan.
        $err_plan_f1 = alumno_validar_limite_plan($pdo, $escuela_id);
        if ($err_plan_f1 !== null) {
            respond(['success' => false, 'error' => $err_plan_f1]);
        }
        $stmt = $pdo->prepare(
            "INSERT INTO clientes (escuela_id, familia_id, tipo, nombre, grado, matricula, curp, email, telefono,
                                    direccion, contacto_emergencia, tel_emergencia, doc_curp_url, doc_acta_url, doc_ine_tutor_url,
                                    nivel_educativo_sat, parentesco, foto_url, activo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)"
        );
        $stmt->execute([$escuela_id, $familia_id, $tipo, $nombre, $grado, $matricula, $curp, $email, $tel,
                         $direccion, $contacto_emergencia, $tel_emergencia, $doc_curp_url, $doc_acta_url, $doc_ine_tutor_url,
                         $nivel_educativo_sat, $parentesco, $foto_url]);
        $id = intval($pdo->lastInsertId());
        // [F1] Bitácora del alumno: alta manual. Nunca lanza.
        if (function_exists('alumno_registrar_movimiento')) {
            alumno_registrar_movimiento($pdo, $escuela_id, $id, 'alta', null, ['origen' => 'alta_manual'],
                intval($usuario_actual['user_id'] ?? 0) ?: null, null, 'activo');
        }
        respond(['success' => true, 'cliente' => array_merge($input, ['id' => $id, 'activo' => true, 'saldo_pendiente' => 0])]);
