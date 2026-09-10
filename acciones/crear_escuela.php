<?php
        requerir_rol($usuario_actual['rol'] ?? '', ['superadmin'], 'Solo el super admin puede crear colegios.');
        $nombre     = trim($input['nombre']     ?? '');
        $clave      = trim($input['clave']      ?? '');
        $rfc        = trim($input['rfc']        ?? '') ?: null;
        $telefono   = trim($input['telefono']   ?? '') ?: null;
        $email      = trim($input['email']      ?? '') ?: null;
        $direccion  = trim($input['direccion']  ?? '') ?: null;
        $logo_emoji = trim($input['logo_emoji'] ?? '') ?: '🏫';
        $rvoe       = trim($input['rvoe']       ?? '') ?: null;
        $plan       = trim($input['plan']       ?? 'basico');
        if (!in_array($plan, array_keys(PLANES_LIMITES), true)) $plan = PLAN_FALLBACK;
        if (!$nombre || !$clave) respond(['success' => false, 'error' => 'Nombre y clave son obligatorios']);
        // El email es obligatorio: es con lo que se crea la cuenta admin de
        // este colegio — sin esto, nadie podría iniciar sesión en él nunca
        // (antes crear_escuela solo insertaba en `escuelas`, sin usuario).
        if (!$email) respond(['success' => false, 'error' => 'El correo es obligatorio: con él se crea la cuenta admin del colegio']);
        $chk = $pdo->prepare("SELECT id FROM escuelas WHERE clave = ?");
        $chk->execute([$clave]);
        if ($chk->fetch()) respond(['success' => false, 'error' => 'Ya existe un colegio con esa clave']);
        // Primer periodo de la suscripción: prorrateado, vence a fin del mes en
        // curso (a partir de ahí, cada renovación cubre un mes calendario completo).
        $fecha_vencimiento_plan = fin_de_mes_actual();
        $stmt = $pdo->prepare(
            "INSERT INTO escuelas (nombre, clave, rfc, rvoe, telefono, email, direccion, logo_emoji, activa, es_plantel, plan, fecha_alta, fecha_vencimiento_plan)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, CURDATE(), ?)"
        );
        $stmt->execute([$nombre, $clave, $rfc, $rvoe, $telefono, $email, $direccion, $logo_emoji, $plan, $fecha_vencimiento_plan]);
        $nuevo_id = intval($pdo->lastInsertId());
        registrar_log($pdo, $usuario_actual, 'escuela_creada', "Colegio '$nombre' ($clave)", $nuevo_id);

        // Cuenta admin (10-sep-2026): el comentario de arriba ya decía "el
        // email es obligatorio: es con lo que se crea la cuenta admin" pero
        // el INSERT nunca existía -- un colegio creado desde aquí se quedaba
        // sin nadie que pudiera iniciar sesión, sin ningún aviso de que
        // faltaba ese paso manual. Mismo mecanismo que invitacion_resolver.php:
        // no se manda contraseña por correo (Outlook la marcaba como
        // phishing), se manda un enlace de un solo uso para que el propio
        // colegio fije su contraseña.
        $usuario_ya_existe = false;
        $chkUsr = $pdo->prepare("SELECT id FROM usuarios WHERE email = ?");
        $chkUsr->execute([$email]);
        $usuario_ya_existe = (bool) $chkUsr->fetch();

        $usuario_creado  = false;
        $correo_enviado  = false;
        $activacion_liga = null;
        if (!$usuario_ya_existe) {
            $admin_nombre     = trim($input['admin_nombre'] ?? '') ?: 'Administrador';
            $activacion_token = bin2hex(random_bytes(32));
            $activacion_hash  = hash('sha256', $activacion_token);
            $pdo->prepare(
                "INSERT INTO usuarios (escuela_id, nombre, email, password_hash, rol, activo, fecha_alta, activacion_token_hash, activacion_expira)
                 VALUES (?, ?, ?, ?, 'admin', 1, CURDATE(), ?, DATE_ADD(NOW(), INTERVAL 72 HOUR))"
            )->execute([
                $nuevo_id, $admin_nombre, $email,
                // Nadie conoce esta contraseña -- se reemplaza en cuanto activan
                // su cuenta con el enlace. Existe solo porque password_hash es NOT NULL.
                password_hash(bin2hex(random_bytes(32)), PASSWORD_BCRYPT),
                $activacion_hash
            ]);
            $usuario_creado = true;

            $activacion_liga = (defined('APP_URL') && APP_URL
                                    ? rtrim(APP_URL, '/')
                                    : ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http')
                                       . '://' . ($_SERVER['HTTP_HOST'] ?? '')
                                       . rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? ''), '/')))
                                 . '/activar_cuenta.html?t=' . $activacion_token;
            $htmlBienvenida = "
                <p>Hola,</p>
                <p><strong>" . htmlspecialchars($nombre) . "</strong> ya está activo en Paga la Escuela.</p>
                <p>Entra a este enlace para crear tu contraseña y empezar a usar tu cuenta ({$email}):</p>
                <p><a href=\"" . htmlspecialchars($activacion_liga) . "\">" . htmlspecialchars($activacion_liga) . "</a></p>
                <p>El enlace expira en 72 horas.</p>
                <p>— Pagalaescuela</p>
            ";
            $resCorreo = enviar_correo($email, 'Activa tu cuenta — tu colegio ya está en Paga la Escuela', $htmlBienvenida);
            $correo_enviado = (bool) ($resCorreo['success'] ?? false);
            if (!$correo_enviado) {
                log_api("crear_escuela #$nuevo_id -> cuenta admin creada pero falló el correo de bienvenida: " . ($resCorreo['error'] ?? 'desconocido'));
            }
            registrar_log($pdo, $usuario_actual, 'escuela_admin_creado', "Cuenta admin creada para '$nombre' ($email)", $nuevo_id);
        }

        respond(['success' => true, 'escuela' => [
            'id' => $nuevo_id, 'nombre' => $nombre, 'clave' => $clave, 'rfc' => $rfc, 'rvoe' => $rvoe,
            'telefono' => $telefono, 'email' => $email, 'direccion' => $direccion,
            'logo_emoji' => $logo_emoji, 'activa' => true, 'es_plantel' => false,
            'escuela_padre_id' => null, 'plan' => $plan, 'fecha_alta' => date('Y-m-d'),
            'fecha_vencimiento_plan' => $fecha_vencimiento_plan,
            'secciones_deshabilitadas' => [],
        ],
        'usuario_creado'  => $usuario_creado,
        'usuario_ya_existia' => $usuario_ya_existe,
        'correo_enviado'  => $correo_enviado,
        // Solo va en la respuesta si de verdad hace falta que el superadmin
        // lo transmita a mano (no había cuenta que crear, o el correo falló).
        'activacion_liga' => ($usuario_creado && !$correo_enviado) ? $activacion_liga : null,
        ]);
