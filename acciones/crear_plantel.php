<?php
        // Validación de permisos
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin', 'admin'], 'No tienes permiso para crear planteles.');
        $escuela_padre_id = intval($input['escuela_id'] ?? 0);
        $nombre           = trim($input['nombre']      ?? '');
        $direccion        = trim($input['direccion']   ?? '');
        $responsable      = trim($input['responsable'] ?? '');
        $tel              = trim($input['tel']         ?? '');
        $email            = trim($input['email']       ?? '');
        $nivel_educativo  = trim($input['nivel_educativo'] ?? '') ?: null;
        $zona             = trim($input['zona']        ?? '') ?: null;
        $zona_id          = intval($input['zona_id']   ?? 0) ?: null;
        if ($zona_id) {
            $zNomPlt = $pdo->prepare("SELECT nombre FROM zonas WHERE id = ?");
            $zNomPlt->execute([$zona_id]);
            $zona = $zNomPlt->fetchColumn() ?: $zona;
        }
        $rvoe             = trim($input['rvoe']        ?? '') ?: null;
        $niveles_validos  = ['preescolar', 'primaria', 'secundaria', 'preparatoria', 'universidad', 'mixto'];
        if ($nivel_educativo !== null && !in_array($nivel_educativo, $niveles_validos, true)) {
            respond(['success' => false, 'error' => 'Nivel educativo inválido']);
        }
        if (!$escuela_padre_id || !$nombre || !$email) {
            respond(['success' => false, 'error' => 'Faltan datos: escuela_id, nombre y email son obligatorios']);
        }
        // Límite de planteles según el plan contratado
        $plan_esc = $pdo->prepare("SELECT plan FROM escuelas WHERE id = ?");
        $plan_esc->execute([$escuela_padre_id]);
        $plan_nombre = $plan_esc->fetch()['plan'] ?? PLAN_FALLBACK;
        $limite_plt = limitesDelPlan($plan_nombre)['max_planteles'];
        if ($limite_plt !== null) {
            $cnt = $pdo->prepare("SELECT COUNT(*) AS n FROM planteles WHERE escuela_id = ?");
            $cnt->execute([$escuela_padre_id]);
            $actuales = intval($cnt->fetch()['n'] ?? 0);
            if ($actuales >= $limite_plt) {
                respond(['success' => false, 'error' => "Tu plan ($plan_nombre) permite máximo $limite_plt plantel(es). Actualiza a Pro para multi-plantel."]);
            }
        }
        // Validación de scope para administradores
        requerir_escuela_propia($rol_actual, $escuela_padre_id, $usuario_actual, 'Solo puedes crear planteles de tu propia escuela.');
        $padre = $pdo->prepare("SELECT * FROM escuelas WHERE id = ? AND es_plantel = 0");
        $padre->execute([$escuela_padre_id]);
        $escuelaPadre = $padre->fetch();
        if (!$escuelaPadre) respond(['success' => false, 'error' => 'Escuela principal no encontrada']);
        $chk = $pdo->prepare("SELECT id FROM usuarios WHERE email = ?");
        $chk->execute([$email]);
        if ($chk->fetch()) respond(['success' => false, 'error' => 'El correo ya está registrado']);
        try {
            $pdo->beginTransaction();
            // 1. Insertar en escuelas (para que funcione como entidad de cobro)
            $clave = $escuelaPadre['clave'] . '-' . strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $nombre), 0, 4));
            $stmt = $pdo->prepare(
                "INSERT INTO escuelas (nombre, clave, rfc, telefono, email, direccion, logo_emoji, activa, es_plantel, escuela_padre_id, plan, fecha_alta)
                 VALUES (?, ?, '', ?, ?, ?, '', 1, 1, ?, 'pro', CURDATE())"
            );
            $stmt->execute([$nombre, $clave, $tel, $email, $direccion, $escuela_padre_id]);
            $nueva_escuela_id = intval($pdo->lastInsertId());
            // 2. Insertar en planteles (para la UI de administración)
            $stmt2 = $pdo->prepare(
                "INSERT INTO planteles (escuela_id, escuela_plantel_id, nombre, direccion, nivel_educativo, rvoe, zona, zona_id, responsable, tel, activo)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)"
            );
            $stmt2->execute([$escuela_padre_id, $nueva_escuela_id, $nombre, $direccion, $nivel_educativo, $rvoe, $zona, $zona_id, $responsable, $tel]);
            $plantel_id = intval($pdo->lastInsertId());
            // 3. Crear la cuenta de usuario (Admin del plantel)
            $password_temporal = substr(str_shuffle('abcdefghijklmnopqrstuvwxyz0123456789'), 0, 8);
            $hash = password_hash($password_temporal, PASSWORD_BCRYPT);
            $stmt3 = $pdo->prepare(
                "INSERT INTO usuarios (escuela_id, nombre, email, password_hash, rol, activo, fecha_alta, creado_por)
                 VALUES (?, ?, ?, ?, 'admin', 1, CURDATE(), ?)"
            );
            $nombre_admin = 'Admin ' . $nombre;
            $stmt3->execute([$nueva_escuela_id, $nombre_admin, $email, $hash, $usuario_actual['user_id'] ?? null]);
            $pdo->commit();
            registrar_log($pdo, $usuario_actual, 'plantel_creado', "Plantel '$nombre' creado bajo escuela #$escuela_padre_id (cuenta: $email)", $escuela_padre_id);
            // Retornar los objetos exactos que espera el frontend
            respond([
                'success' => true,
                'escuela_plantel' => [
                    'id'               => $nueva_escuela_id,
                    'nombre'           => $nombre,
                    'clave'            => $clave,
                    'es_plantel'       => 1,
                    'escuela_padre_id' => $escuela_padre_id
                ],
                'plantel' => [
                    'id'                 => $plantel_id,
                    'escuela_id'         => $escuela_padre_id,
                    'escuela_plantel_id' => $nueva_escuela_id,
                    'nombre'             => $nombre,
                    'direccion'          => $direccion,
                    'nivel_educativo'    => $nivel_educativo,
                    'rvoe'               => $rvoe,
                    'zona'               => $zona,
                    'zona_id'            => $zona_id,
                    'responsable'        => $responsable,
                    'tel'                => $tel,
                    'activo'             => true
                ],
                'cuenta' => [
                    'email'             => $email,
                    'password_temporal' => $password_temporal
                ]
            ]);
        } catch (Exception $e) {
            $pdo->rollBack();
            respond(['success' => false, 'error' => 'Error de BD: ' . $e->getMessage()]);
        }
