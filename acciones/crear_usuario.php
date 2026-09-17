<?php
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin', 'admin'], 'No tienes permiso para crear usuarios.');
        $nombre    = trim($input['nombre']     ?? '');
        $email     = trim($input['email']      ?? '');
        $rol       = trim($input['rol']        ?? '');
        $esc_id    = intval($input['escuela_id'] ?? 0) ?: null;
        $fam_id    = intval($input['familia_id'] ?? 0) ?: null;
        $roles_validos = ['admin','cajero','familia'];
        // 'contador' (11-sep-2026): revisa documentos fiscales y datos de
        // pago de CUALQUIER escuela (ver revisar_documento_escuela.php y
        // demás), pero no tiene el resto de los poderes de superadmin
        // (no edita planes, no activa demo, no ve reportes globales). Solo
        // superadmin puede crear esta cuenta, igual que distribuidor.
        if ($rol_actual === 'superadmin') { $roles_validos[] = 'superadmin'; $roles_validos[] = 'distribuidor'; $roles_validos[] = 'contador'; }
        if (!$nombre || !$email || !in_array($rol, $roles_validos)) {
            respond(['success' => false, 'error' => 'Datos incompletos o rol no permitido']);
        }
        // Un admin solo puede crear usuarios dentro de su propia escuela
        if ($rol_actual === 'admin') {
            $esc_id = $usuario_actual['escuela_id'] ?? null;
            requerir_seccion_habilitada($pdo, $rol_actual, $esc_id, ['miequipo', 'familias']);
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
        if ($rol === 'distribuidor' || $rol === 'contador') { $esc_id = null; $fam_id = null; }
        // Verificar email único
        $chk = $pdo->prepare("SELECT id FROM usuarios WHERE email = ?");
        $chk->execute([$email]);
        if ($chk->fetch()) respond(['success' => false, 'error' => 'El correo ya está registrado']);
        $creado_por = $usuario_actual["user_id"] ?? null;

        // Igual que el resto de altas de cuenta del sistema (invitaciones, CSV
        // de alumnos): nadie más que el propio usuario llega a conocer su
        // contraseña real. Se crea con un placeholder inservible y un enlace
        // de activación de un solo uso (72h) que se manda por correo.
        $activacion_token = bin2hex(random_bytes(32));
        $activacion_hash  = hash('sha256', $activacion_token);

        $stmt = $pdo->prepare(
            "INSERT INTO usuarios (escuela_id, nombre, email, password_hash, rol, zona, activo, fecha_alta, familia_id, creado_por, activacion_token_hash, activacion_expira)"
            . " VALUES (?, ?, ?, ?, ?, ?, 1, CURDATE(), ?, ?, ?, DATE_ADD(NOW(), INTERVAL 72 HOUR))"
        );
        $stmt->execute([
            $esc_id, $nombre, $email, password_hash(bin2hex(random_bytes(32)), PASSWORD_BCRYPT),
            $rol, $zona, $fam_id, $creado_por, $activacion_hash
        ]);
        $id = intval($pdo->lastInsertId());
        registrar_log($pdo, $usuario_actual, 'usuario_creado', "Nuevo usuario '$nombre' ($email) con rol '$rol'", $esc_id);

        $baseUrl = (defined('APP_URL') && APP_URL
                ? rtrim(APP_URL, '/')
                : ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http')
                   . '://' . ($_SERVER['HTTP_HOST'] ?? '')
                   . rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? ''), '/')));
        $activacion_liga = $baseUrl . '/activar_cuenta.html?t=' . $activacion_token;
        $html = "
            <p>Hola,</p>
            <p>Se creó tu cuenta en Paga la Escuela.</p>
            <p>Entra a este enlace para crear tu contraseña y empezar a usarla ({$email}):</p>
            <p><a href=\"" . htmlspecialchars($activacion_liga) . "\">" . htmlspecialchars($activacion_liga) . "</a></p>
            <p>El enlace expira en 72 horas.</p>
            <p>— Pagalaescuela</p>
        ";
        $resCorreo = enviar_correo($email, 'Activa tu cuenta — Paga la Escuela', $html);
        $correo_enviado = (bool) ($resCorreo['success'] ?? false);
        if (!$correo_enviado) {
            log_api("crear_usuario #$id -> falló el correo de activación a $email: " . ($resCorreo['error'] ?? 'desconocido'));
        }

        respond([
            "success" => true,
            "usuario" => ["id" => $id, "nombre" => $nombre, "email" => $email, "rol" => $rol, "escuela_id" => $esc_id, "zona" => $zona, "zona_id" => $zona_id, "activo" => true, "familia_id" => $fam_id, "creado_por" => $creado_por],
            "correo_enviado"  => $correo_enviado,
            "activacion_liga" => $correo_enviado ? null : $activacion_liga,
        ]);
