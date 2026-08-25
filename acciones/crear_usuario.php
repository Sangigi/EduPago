<?php
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin', 'admin'], 'No tienes permiso para crear usuarios.');
        $nombre    = trim($input['nombre']     ?? '');
        $email     = trim($input['email']      ?? '');
        $password  = trim($input['password']   ?? '');
        $rol       = trim($input['rol']        ?? '');
        $esc_id    = intval($input['escuela_id'] ?? 0) ?: null;
        $fam_id    = intval($input['familia_id'] ?? 0) ?: null;
        $roles_validos = ['admin','cajero','familia'];
        if ($rol_actual === 'superadmin') { $roles_validos[] = 'superadmin'; $roles_validos[] = 'distribuidor'; }
        if (!$nombre || !$email || !$password || !in_array($rol, $roles_validos)) {
            respond(['success' => false, 'error' => 'Datos incompletos o rol no permitido']);
        }
        // Un admin solo puede crear usuarios dentro de su propia escuela
        if ($rol_actual === 'admin') {
            $esc_id = $usuario_actual['escuela_id'] ?? null;
        }
        // Un distribuidor no pertenece a ninguna escuela; su "zona" es informativa.
        // zona_id referencia el catálogo compartido `zonas` (usado también por
        // planteles); zona (texto) se conserva en paralelo solo como respaldo
        // legado, resuelta automáticamente del catálogo si se manda zona_id.
        $zona_id = intval($input['zona_id'] ?? 0) ?: null;
        $zona = trim($input['zona'] ?? '') ?: null;
        if ($zona_id) {
            $zNom = $pdo->prepare("SELECT nombre FROM zonas WHERE id = ?");
            $zNom->execute([$zona_id]);
            $zona = $zNom->fetchColumn() ?: $zona;
        }
        if ($rol === 'distribuidor') { $esc_id = null; $fam_id = null; }
        // Verificar email único
        $chk = $pdo->prepare("SELECT id FROM usuarios WHERE email = ?");
        $chk->execute([$email]);
        if ($chk->fetch()) respond(['success' => false, 'error' => 'El correo ya está registrado']);
        $creado_por = $usuario_actual["user_id"] ?? null;
        $stmt = $pdo->prepare(
            "INSERT INTO usuarios (escuela_id, nombre, email, password_hash, rol, zona, activo, fecha_alta, familia_id, creado_por)"
            . " VALUES (?, ?, ?, ?, ?, ?, 1, CURDATE(), ?, ?)"
        );
        $stmt->execute([$esc_id, $nombre, $email, password_hash($password, PASSWORD_BCRYPT), $rol, $zona, $fam_id, $creado_por]);
        $id = intval($pdo->lastInsertId());
        registrar_log($pdo, $usuario_actual, 'usuario_creado', "Nuevo usuario '$nombre' ($email) con rol '$rol'", $esc_id);
        respond(["success" => true, "usuario" => ["id" => $id, "nombre" => $nombre, "email" => $email, "rol" => $rol, "escuela_id" => $esc_id, "zona" => $zona, "zona_id" => $zona_id, "activo" => true, "familia_id" => $fam_id, "creado_por" => $creado_por]]);
