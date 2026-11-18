<?php
        $rol_actual = $usuario_actual['rol'] ?? '';
        $es_familia = $rol_actual === 'familia';
        // [F0] 'control_escolar' (coordinación académica) edita alumnos igual que admin.
        if (!in_array($rol_actual, ['superadmin', 'admin', 'control_escolar']) && !$es_familia) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'El cajero no puede editar alumnos, solo consultarlos.']);
        }
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        // Familia: solo puede editar a SUS propios hijos, y solo datos de
        // contacto básicos — nunca CLABE, saldo, matrícula, CURP, grado,
        // familia_id, ni activar/desactivar (eso sigue siendo admin/superadmin).
        if ($es_familia) {
            // [F0] Se trae también escuela_id para que requerir_familia_propia
            // exija que el alumno sea del colegio de la familia.
            $chk = $pdo->prepare("SELECT familia_id, escuela_id FROM clientes WHERE id = ?");
            $chk->execute([$id]);
            $objetivo = $chk->fetch();
            requerir_familia_propia($objetivo ? $objetivo['familia_id'] : null, $usuario_actual, 'No puedes editar la información de este alumno.', $objetivo ? $objetivo['escuela_id'] : null);
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
            // [F0] Antes solo 'admin'; ahora cualquier rol de colegio (admin y
            // control_escolar). superadmin sigue exento.
            if ($rol_actual !== 'superadmin') {
                $chkEsc = $pdo->prepare("SELECT escuela_id FROM clientes WHERE id = ?");
                $chkEsc->execute([$id]);
                $objetivoEsc = $chkEsc->fetch();
                requerir_escuela_propia($rol_actual, $objetivoEsc ? $objetivoEsc['escuela_id'] : null, $usuario_actual, 'No tienes permiso para editar este alumno.');
                requerir_seccion_habilitada($pdo, $rol_actual, $objetivoEsc ? $objetivoEsc['escuela_id'] : null, ['alumnos', 'familias']);
            }
            $campos = ['nombre','grado','matricula','curp','email','telefono','familia_id',
                       'direccion','contacto_emergencia','tel_emergencia',
                       'doc_curp_url','doc_acta_url','doc_ine_tutor_url','nivel_educativo_sat',
                       'parentesco','foto_url','etiquetas','fecha_nac','tipo_sangre','alergias'];
            // [F0] Si se asigna/cambia la familia, debe ser del mismo colegio
            // que el alumno: si no, esa familia (de otro colegio) lo vería en su
            // portal con sus cobros. Solo se valida cuando CAMBIA, para no
            // trabar la edición de un alumno viejo que ya tuviera el dato cruzado
            // (Alumnos.js reenvía familia_id en cada guardado).
            $nueva_familia_id = array_key_exists('familia_id', $input) ? intval($input['familia_id'] ?? 0) : 0;
            if ($nueva_familia_id > 0) {
                $chkFamEdit = $pdo->prepare(
                    "SELECT c.escuela_id, c.familia_id, f.escuela_id AS familia_escuela_id
                     FROM clientes c LEFT JOIN familias f ON f.id = ?
                     WHERE c.id = ?"
                );
                $chkFamEdit->execute([$nueva_familia_id, $id]);
                $famEdit = $chkFamEdit->fetch();
                if ($famEdit && intval($famEdit['familia_id'] ?? 0) !== $nueva_familia_id
                    && intval($famEdit['familia_escuela_id'] ?? -1) !== intval($famEdit['escuela_id'])) {
                    respond(['success' => false, 'error' => 'La familia seleccionada no pertenece al colegio de este alumno.']);
                }
            }
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
