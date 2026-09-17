<?php
        // Antes este case no validaba rol/pertenencia en absoluto: cualquier
        // usuario autenticado (incluida una familia ajena) podía editar
        // nombre/contacto/email/teléfono — y ahora RFC/domicilio fiscal —
        // de CUALQUIER familia de CUALQUIER escuela con solo mandar su id.
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        $rol_actual_fam = $usuario_actual['rol'] ?? '';
        $es_familia_propia = $rol_actual_fam === 'familia' && intval($usuario_actual['familia_id'] ?? -1) === $id;
        if (!in_array($rol_actual_fam, ['superadmin', 'admin']) && !$es_familia_propia) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'No tienes permiso para editar esta familia.']);
        }
        if ($rol_actual_fam === 'admin') {
            $chkFam = $pdo->prepare("SELECT escuela_id FROM familias WHERE id = ?");
            $chkFam->execute([$id]);
            $famObjetivo = $chkFam->fetch();
            requerir_escuela_propia($rol_actual_fam, $famObjetivo ? $famObjetivo['escuela_id'] : null, $usuario_actual, 'No tienes permiso para editar esta familia.');
            requerir_seccion_habilitada($pdo, $rol_actual_fam, $famObjetivo ? $famObjetivo['escuela_id'] : null, ['familias']);
        }
        // Una familia edita sus propios datos de contacto y fiscales, pero
        // nunca su 'nombre' (identidad del expediente) — eso queda para
        // admin/superadmin, igual que en editar_cliente.
        // 'foto_url' y 'etiquetas' se agregan a ambas listas: el tutor puede
        // poner su propia foto desde el portal familiar.
        $campos = $es_familia_propia
            ? ['contacto', 'email', 'telefono', 'rfc_factura', 'razon_social_factura',
               'cp_factura', 'domicilio_factura', 'regimen_factura', 'uso_cfdi_defecto',
               'foto_url']
            : ['nombre', 'contacto', 'email', 'telefono', 'rfc_factura', 'razon_social_factura',
               'cp_factura', 'domicilio_factura', 'regimen_factura', 'uso_cfdi_defecto',
               'foto_url', 'etiquetas'];
        if (array_key_exists('email', $input)) $input['email'] = validar_email_opcional($input['email']);
        if (array_key_exists('foto_url', $input)) $input['foto_url'] = validar_url_imagen($input['foto_url'], 'enlace de la foto');
        $sets = []; $vals = [];
        foreach ($campos as $c) {
            if (array_key_exists($c, $input)) {
                $sets[] = "`$c` = ?";
                $vals[] = $input[$c] ?: null;
            }
        }
        if (empty($sets)) respond(['success' => false, 'error' => 'Sin campos a actualizar']);
        $vals[] = $id;
        try {
            $stmt = $pdo->prepare("UPDATE familias SET " . implode(', ', $sets) . " WHERE id = ?");
            $stmt->execute($vals);
        } catch (\PDOException $e) {
            // Las columnas fiscales (rfc_factura, etc.) son nuevas — si la
            // migración ALTER TABLE aún no corrió en esta base, avisa claro
            // en vez de tronar con un error de MySQL crudo.
            respond(['success' => false, 'error' => 'No se pudo guardar: faltan columnas fiscales en la tabla familias (aplica la migración pendiente).']);
        }
        $stmt2 = $pdo->prepare("SELECT * FROM familias WHERE id = ?");
        $stmt2->execute([$id]);
        $familiaActualizada = $stmt2->fetch(PDO::FETCH_ASSOC);
        $familiaActualizada['activa'] = (bool)($familiaActualizada['activa'] ?? true);
        respond(['success' => true, 'familia' => $familiaActualizada]);
