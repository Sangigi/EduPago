<?php
    $token = trim($input['token'] ?? '');
    $generico = ['success' => false, 'error' => 'Esta liga no es válida o ya venció.'];

    if (strlen($token) !== 64 || !ctype_xdigit($token)) respond($generico);

    $stmt = $pdo->prepare(
        "SELECT id, estado, expira, intentos, distribuidor_id, contacto_nombre
           FROM invitaciones_colegio WHERE token_hash = ? LIMIT 1"
    );
    $stmt->execute([hash('sha256', $token)]);
    $inv = $stmt->fetch();
    // Igual que invitacion_ver.php: se permite reenviar mientras siga en
    // 'pendiente' o 'enviado' -- antes, cambiar de plan y reintentar despues
    // del primer envio actualizaba CERO filas (WHERE exigia 'pendiente'), y
    // el codigo igual respondia success sin haber guardado nada nuevo.
    if (!$inv || !in_array($inv['estado'], ['pendiente', 'enviado'], true) || strtotime($inv['expira']) < time()) {
        if ($inv) {
            $pdo->prepare("UPDATE invitaciones_colegio SET intentos = intentos + 1 WHERE id = ?")
                ->execute([$inv['id']]);
        }
        respond($generico);
    }

    $nombre       = trim($input['nombre']     ?? '');
    $rfc          = strtoupper(trim($input['rfc'] ?? ''));
    $rvoe         = trim($input['rvoe']       ?? '');
    $telefono     = trim($input['telefono']   ?? '');
    $email        = trim($input['email']      ?? '');
    $direccion    = trim($input['direccion']  ?? '');
    $num_alumnos  = intval($input['num_alumnos'] ?? 0) ?: null;
    $plan         = trim($input['plan'] ?? '');
    // Persona física/moral (11-sep-2026, requisito de la junta): determina
    // qué documentos se le van a pedir después en "Mi cuenta" para poder
    // facturar de verdad. Opcional aquí (se puede completar después) para no
    // bloquear el alta si el colegio todavía no lo tiene claro.
    $tipo_persona = trim($input['tipo_persona'] ?? '');
    if ($tipo_persona !== '' && !in_array($tipo_persona, ['fisica', 'moral'], true)) {
        respond(['success' => false, 'error' => 'tipo_persona debe ser fisica o moral']);
    }

    if ($nombre === '' || $email === '') {
        respond(['success' => false, 'error' => 'Nombre del colegio y correo son obligatorios']);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        respond(['success' => false, 'error' => 'El correo no es válido']);
    }
    // El plan es obligatorio: sin plan no hay nada que facturar cuando el
    // colegio decida activarse. PLANES_LIMITES (api.php) es la única fuente
    // de verdad de precios — nunca se confía en un monto que mande el navegador.
    if (!array_key_exists($plan, PLANES_LIMITES)) {
        respond(['success' => false, 'error' => 'Elige un plan válido antes de continuar.']);
    }
    $monto_plan = PLANES_LIMITES[$plan]['precio'];
    // RFC de persona moral (12) o física (13). Se valida forma, no existencia.
    if ($rfc !== '' && !preg_match('/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/u', $rfc)) {
        respond(['success' => false, 'error' => 'El RFC no tiene un formato válido']);
    }

    $datos = json_encode([
        'nombre'       => mb_substr($nombre, 0, 160),
        'rfc'          => mb_substr($rfc, 0, 13),
        'rvoe'         => mb_substr($rvoe, 0, 60),
        'telefono'     => mb_substr($telefono, 0, 40),
        'email'        => mb_substr($email, 0, 160),
        'direccion'    => mb_substr($direccion, 0, 300),
        'num_alumnos'  => $num_alumnos,
        'tipo_persona' => $tipo_persona ?: null,
    ], JSON_UNESCAPED_UNICODE);

    $pdo->prepare(
        "UPDATE invitaciones_colegio
            SET estado='enviado', datos_enviados=?, usada_en=NOW(), usada_ip=?,
                plan_elegido=?, monto_suscripcion=?
          WHERE id=? AND estado IN ('pendiente','enviado')"
    )->execute([$datos, ($_SERVER['REMOTE_ADDR'] ?? null), $plan, $monto_plan, $inv['id']]);

    // Antes de esto, "enviado" era el final del formulario: había que pagar
    // ANTES de que existiera la escuela, y un superadmin tenía que aprobar
    // el pago para recién ahí crearla. Ahora (11-sep-2026, requisito de la
    // junta) la escuela se crea de inmediato en modo DEMO, sin pagar: el
    // colegio puede usar todo el sistema al momento. Pagar (desde adentro,
    // ya con sesión iniciada, en "Mi suscripción") es lo que lo saca del
    // demo — ese flujo y el cómputo de "días de prueba + el mes pagado" ya
    // existen (escuela_generar_pago_renovacion.php + los webhooks).
    $email_login = mb_substr($email, 0, 160);
    $usuario_ya_existe = false;
    $chkUsr = $pdo->prepare("SELECT id FROM usuarios WHERE email = ?");
    $chkUsr->execute([$email_login]);
    $usuario_ya_existe = (bool) $chkUsr->fetch();
    if ($usuario_ya_existe) {
        // Mismo caso que ya manejaba invitacion_resolver.php: el correo ya
        // tiene una cuenta en el sistema. No se puede crear un admin nuevo
        // con el mismo correo (usuarios.email es UNIQUE), así que se avisa
        // en vez de fallar en silencio o tronar por el índice único.
        respond([
            'success' => false,
            'error'   => 'Ya existe una cuenta con este correo en el sistema. Contacta a soporte para continuar.',
        ]);
    }

    $dias_demo = dias_demo_default($pdo);
    $fecha_fin_prueba = date('Y-m-d', strtotime("+{$dias_demo} days"));
    $activacion_token = bin2hex(random_bytes(32));
    $activacion_hash  = hash('sha256', $activacion_token);

    $clave_base  = strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $nombre), 0, 6));
    if ($clave_base === '') $clave_base = 'ESC';
    $clave_nueva = $clave_base . '-' . $inv['id'];

    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            "INSERT INTO escuelas (nombre, clave, rfc, rvoe, telefono, email, direccion, tipo_persona,
                                   activa, plan, fecha_alta, fecha_vencimiento_plan, modo, fecha_fin_prueba,
                                   origen_invitacion_id)
             VALUES (?,?,?,?,?,?,?,?, 1, ?, NOW(), ?, 'demo', ?, ?)"
        )->execute([
            $nombre, $clave_nueva, $rfc, $rvoe, $telefono, $email, $direccion, $tipo_persona ?: null,
            $plan, fin_de_mes_actual(), $fecha_fin_prueba, $inv['id'],
        ]);
        $escuela_nueva = intval($pdo->lastInsertId());

        $pdo->prepare(
            "UPDATE invitaciones_colegio
                SET estado='aprobada', escuela_id=?, aprobada_en=NOW()
              WHERE id=?"
        )->execute([$escuela_nueva, $inv['id']]);

        // Igual que invitacion_resolver.php: si la invitación la generó un
        // distribuidor, esta es la única forma en que puede llegar a cobrar
        // comisión por este colegio.
        if (!empty($inv['distribuidor_id'])) {
            $pdo->prepare(
                "INSERT INTO distribuidor_referidos
                    (distribuidor_id, escuela_id, nombre_colegio, num_alumnos, estado, comision_pct, fecha_alta)
                 VALUES (?, ?, ?, ?, 'activo', 5.00, CURDATE())"
            )->execute([intval($inv['distribuidor_id']), $escuela_nueva, $nombre, $num_alumnos]);
        }

        $pdo->prepare(
            "INSERT INTO usuarios (escuela_id, nombre, email, password_hash, rol, activo, fecha_alta, activacion_token_hash, activacion_expira)
             VALUES (?, ?, ?, ?, 'admin', 1, CURDATE(), ?, DATE_ADD(NOW(), INTERVAL 72 HOUR))"
        )->execute([
            $escuela_nueva,
            $inv['contacto_nombre'] ?: 'Administrador',
            $email_login,
            // Nadie conoce esta contraseña — se reemplaza en cuanto activan
            // su cuenta con el enlace. Existe solo porque password_hash es NOT NULL.
            password_hash(bin2hex(random_bytes(32)), PASSWORD_BCRYPT),
            $activacion_hash,
        ]);

        $pdo->commit();
    } catch (\Throwable $e) {
        $pdo->rollBack();
        respond(['success' => false, 'error' => 'No se pudo crear tu cuenta de prueba: ' . $e->getMessage()]);
    }

    registrar_log($pdo, ['user_id' => null, 'rol' => 'sistema'], 'escuela_demo_creada_desde_registro',
        "Invitación #{$inv['id']} -> escuela #$escuela_nueva ({$nombre}), demo {$dias_demo} días", $escuela_nueva);

    $activacion_liga = (defined('APP_URL') && APP_URL
                            ? rtrim(APP_URL, '/')
                            : ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http')
                               . '://' . ($_SERVER['HTTP_HOST'] ?? '')
                               . rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? ''), '/')))
                         . '/activar_cuenta.html?t=' . $activacion_token;
    $htmlBienvenida = "
        <p>Hola,</p>
        <p><strong>" . htmlspecialchars($nombre) . "</strong> ya está listo en Paga la Escuela — puedes usar todo el sistema durante $dias_demo días, sin ningún costo.</p>
        <p>Entra a este enlace para crear tu contraseña y empezar ({$email_login}):</p>
        <p><a href=\"" . htmlspecialchars($activacion_liga) . "\">" . htmlspecialchars($activacion_liga) . "</a></p>
        <p>El enlace expira en 72 horas. Cuando quieras activar tu cuenta de forma definitiva, hazlo desde \"Mi suscripción\" dentro del sistema — tu suscripción empieza a correr desde el día en que se confirme tu pago.</p>
        <p>— Equipo Pagalaescuela</p>
    ";
    $resCorreo = enviar_correo($email_login, 'Tu prueba de Paga la Escuela ya está lista', $htmlBienvenida);
    $correo_enviado = (bool) ($resCorreo['success'] ?? false);
    if (!$correo_enviado) {
        log_api("invitacion_enviar #{$inv['id']} -> escuela $escuela_nueva creada pero falló el correo de bienvenida: " . ($resCorreo['error'] ?? 'desconocido'));
    }

    respond([
        'success'          => true,
        'modo'             => 'demo',
        'dias_demo'        => $dias_demo,
        'correo_enviado'   => $correo_enviado,
        // Solo va en la respuesta si de verdad hace falta que el colegio la
        // use a mano (el correo falló) — mismo criterio que invitacion_resolver.php.
        'activacion_liga'  => $correo_enviado ? null : $activacion_liga,
        'mensaje'          => 'Tu colegio ya está listo. Revisa tu correo para crear tu contraseña y empezar.',
    ]);
