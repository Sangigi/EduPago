<?php
        // Edita un plantel existente: actualiza la fila en `planteles`, la
        // escuela-cuenta asociada (nombre/dirección/teléfono/correo) y, si el
        // correo cambió, también el correo de acceso del usuario admin de esa
        // cuenta (así puede seguir iniciando sesión con el nuevo correo).
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin', 'admin'], 'No tienes permiso para editar planteles.');
        $id          = intval($input['id']          ?? 0);
        $nombre      = trim($input['nombre']         ?? '');
        $direccion   = trim($input['direccion']      ?? '');
        $responsable = trim($input['responsable']    ?? '');
        $tel         = trim($input['tel']            ?? '');
        $email       = trim($input['email']          ?? '');
        $nivel_educativo = trim($input['nivel_educativo'] ?? '') ?: null;
        $zona            = trim($input['zona']        ?? '') ?: null;
        $zona_id         = intval($input['zona_id']   ?? 0) ?: null;
        if ($zona_id) {
            $zNomPltEd = $pdo->prepare("SELECT nombre FROM zonas WHERE id = ?");
            $zNomPltEd->execute([$zona_id]);
            $zona = $zNomPltEd->fetchColumn() ?: $zona;
        }
        $rvoe            = trim($input['rvoe']        ?? '') ?: null;
        $niveles_validos = ['preescolar', 'primaria', 'secundaria', 'preparatoria', 'universidad', 'mixto'];
        if ($nivel_educativo !== null && !in_array($nivel_educativo, $niveles_validos, true)) {
            respond(['success' => false, 'error' => 'Nivel educativo inválido']);
        }
        if (!$id || !$nombre) {
            respond(['success' => false, 'error' => 'Faltan datos: id y nombre son obligatorios']);
        }
        $stmt = $pdo->prepare("SELECT * FROM planteles WHERE id = ?");
        $stmt->execute([$id]);
        $plantel = $stmt->fetch();
        if (!$plantel) respond(['success' => false, 'error' => 'Plantel no encontrado']);
        // Scope: un admin solo puede editar planteles de su propia escuela
        requerir_escuela_propia($rol_actual, $plantel['escuela_id'], $usuario_actual, 'Solo puedes editar planteles de tu propia escuela.');
        $escuela_plantel_id = intval($plantel['escuela_plantel_id']);
        // Si se envía correo, validar que no esté en uso por otra cuenta
        if ($email) {
            $chk = $pdo->prepare("SELECT id FROM usuarios WHERE email = ? AND escuela_id != ?");
            $chk->execute([$email, $escuela_plantel_id]);
            if ($chk->fetch()) respond(['success' => false, 'error' => 'El correo ya está registrado en otra cuenta']);
        }
        try {
            $pdo->beginTransaction();
            // 1. Tabla planteles
            $pdo->prepare(
                "UPDATE planteles SET nombre = ?, direccion = ?, nivel_educativo = ?, rvoe = ?, zona = ?, zona_id = ?, responsable = ?, tel = ? WHERE id = ?"
            )->execute([$nombre, $direccion, $nivel_educativo, $rvoe, $zona, $zona_id, $responsable, $tel, $id]);
            // 2. Escuela-cuenta del plantel
            $sets = ['nombre = ?', 'direccion = ?', 'telefono = ?'];
            $vals = [$nombre, $direccion, $tel];
            if ($email) { $sets[] = 'email = ?'; $vals[] = $email; }
            $vals[] = $escuela_plantel_id;
            $pdo->prepare("UPDATE escuelas SET " . implode(', ', $sets) . " WHERE id = ?")->execute($vals);
            // 3. Correo de acceso del usuario admin de esa escuela-cuenta
            if ($email) {
                $pdo->prepare(
                    "UPDATE usuarios SET email = ? WHERE escuela_id = ? AND rol = 'admin'"
                )->execute([$email, $escuela_plantel_id]);
            }
            $pdo->commit();
            registrar_log($pdo, $usuario_actual, 'plantel_editado', "Plantel #$id '$nombre' editado");
            respond([
                'success'  => true,
                'plantel'  => [
                    'id'                 => $id,
                    'escuela_id'         => intval($plantel['escuela_id']),
                    'escuela_plantel_id' => $escuela_plantel_id,
                    'nombre'             => $nombre,
                    'direccion'          => $direccion,
                    'nivel_educativo'    => $nivel_educativo,
                    'rvoe'               => $rvoe,
                    'zona'               => $zona,
                    'zona_id'            => $zona_id,
                    'responsable'        => $responsable,
                    'tel'                => $tel,
                    'activo'             => (bool)$plantel['activo'],
                ],
                'escuela_plantel' => [
                    'id'        => $escuela_plantel_id,
                    'nombre'    => $nombre,
                    'direccion' => $direccion,
                    'telefono'  => $tel,
                    'email'     => $email ?: null,
                ],
            ]);
        } catch (Exception $e) {
            $pdo->rollBack();
            respond(['success' => false, 'error' => 'Error de BD: ' . $e->getMessage()]);
        }
