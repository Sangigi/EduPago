<?php
        $rol_actual = $usuario_actual['rol'] ?? '';
        $es_familia = $rol_actual === 'familia';
        if (!in_array($rol_actual, ['superadmin', 'admin']) && !$es_familia) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'El cajero no puede editar alumnos, solo consultarlos.']);
        }
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        // Familia: solo puede editar a SUS propios hijos, y solo datos de
        // contacto básicos — nunca CLABE, saldo, matrícula, CURP, grado,
        // familia_id, ni activar/desactivar (eso sigue siendo admin/superadmin).
        if ($es_familia) {
            $chk = $pdo->prepare("SELECT familia_id FROM clientes WHERE id = ?");
            $chk->execute([$id]);
            $objetivo = $chk->fetch();
            requerir_familia_propia($objetivo ? $objetivo['familia_id'] : null, $usuario_actual, 'No puedes editar la información de este alumno.');
            // Los datos fiscales (RFC/razón social/domicilio fiscal) ya NO se
            // editan por alumno — pertenecen al tutor/familia que paga (ver
            // case 'editar_familia'), no a cada hijo individualmente.
            // 'foto_url' se incluye para que el tutor pueda poner la foto de su
            // hijo desde el portal familiar. No se le abren mas campos que estos.
            $campos = ['direccion', 'contacto_emergencia', 'tel_emergencia', 'telefono', 'email', 'foto_url'];
        } else {
            // Admin: solo alumnos de su propia escuela — antes no se validaba
            // esto y un admin podía editar (incluida la reasignación de
            // familia_id) el alumno de CUALQUIER otra escuela con solo su id.
            if ($rol_actual === 'admin') {
                $chkEsc = $pdo->prepare("SELECT escuela_id FROM clientes WHERE id = ?");
                $chkEsc->execute([$id]);
                $objetivoEsc = $chkEsc->fetch();
                requerir_escuela_propia($rol_actual, $objetivoEsc ? $objetivoEsc['escuela_id'] : null, $usuario_actual, 'No tienes permiso para editar este alumno.');
            }
            $campos = ['nombre','grado','matricula','curp','email','telefono','familia_id',
                       'direccion','contacto_emergencia','tel_emergencia',
                       'doc_curp_url','doc_acta_url','doc_ine_tutor_url','nivel_educativo_sat',
                       'parentesco','foto_url','etiquetas','fecha_nac','tipo_sangre','alergias'];
        }
        if (array_key_exists('email', $input)) $input['email'] = validar_email_opcional($input['email']);
        // Saneado de los campos nuevos, antes de armar el UPDATE
        if (array_key_exists('parentesco', $input)) $input['parentesco'] = normalizar_parentesco($input['parentesco']);
        if (array_key_exists('foto_url', $input))   $input['foto_url']   = validar_url_imagen($input['foto_url'], 'enlace de la foto');
        $sets = []; $vals = [];
        foreach ($campos as $c) {
            if (array_key_exists($c, $input)) {
                $sets[] = "`$c` = ?";
                // Usar array_key_exists + isset para respetar null explícito
                // (ej: familia_id: null al desvincular un alumno)
                $vals[] = isset($input[$c]) ? $input[$c] : null;
            }
        }
        if (empty($sets)) respond(['success' => false, 'error' => 'Sin campos a actualizar']);
        $vals[] = $id;
        $stmt = $pdo->prepare("UPDATE clientes SET " . implode(', ', $sets) . " WHERE id = ?");
        $stmt->execute($vals);
        // Regresar el registro actualizado real de la DB (no $input parcial)
        $stmt2 = $pdo->prepare("SELECT * FROM clientes WHERE id = ?");
        $stmt2->execute([$id]);
        $clienteActualizado = $stmt2->fetch(PDO::FETCH_ASSOC);
        $clienteActualizado['familia_id'] = $clienteActualizado['familia_id'] ? intval($clienteActualizado['familia_id']) : null;
        $clienteActualizado['activo']     = (bool)$clienteActualizado['activo'];
        $clienteActualizado['tel']        = $clienteActualizado['telefono'] ?? null;
        respond(['success' => true, 'cliente' => $clienteActualizado]);
