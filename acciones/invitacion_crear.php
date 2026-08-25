<?php
    $rol_actual = $usuario_actual['rol'] ?? '';
    if (!in_array($rol_actual, ['superadmin', 'admin', 'distribuidor'], true)) {
        http_response_code(403);
        respond(['success' => false, 'error' => 'Sin permiso']);
    }

    $c_nombre = trim($input['contacto_nombre'] ?? '');
    $c_email  = trim($input['contacto_email']  ?? '');
    $c_tel    = trim($input['contacto_tel']    ?? '');
    $notas    = trim($input['notas']           ?? '');

    if ($c_nombre === '' || $c_email === '') {
        respond(['success' => false, 'error' => 'Nombre y correo de contacto son obligatorios']);
    }
    if (!filter_var($c_email, FILTER_VALIDATE_EMAIL)) {
        respond(['success' => false, 'error' => 'El correo de contacto no es válido']);
    }

    // 256 bits de un generador criptográfico
    $token        = bin2hex(random_bytes(32));
    $token_hash   = hash('sha256', $token);
    $token_prefijo= substr($token, 0, 8);
    $horas        = intval($input['vigencia_horas'] ?? 72);
    if ($horas < 1 || $horas > 720) $horas = 72;   // entre 1 h y 30 días

    $stmt = $pdo->prepare(
        "INSERT INTO invitaciones_colegio
            (token_hash, token_prefijo, creado_por, distribuidor_id,
             contacto_nombre, contacto_email, contacto_tel, notas, expira)
         VALUES (?,?,?,?,?,?,?,?, DATE_ADD(NOW(), INTERVAL ? HOUR))"
    );
    $stmt->execute([
        $token_hash, $token_prefijo,
        intval($usuario_actual['user_id'] ?? 0),
        ($rol_actual === 'distribuidor' ? intval($usuario_actual['user_id'] ?? 0) : null),
        $c_nombre, $c_email, $c_tel, $notas, $horas
    ]);

    // El token en claro se devuelve UNA sola vez. No vuelve a existir.
    respond([
        'success' => true,
        'id'      => intval($pdo->lastInsertId()),
        'token'   => $token,
        // Si no defines APP_URL en config.php, la liga se arma con el host
        // de la propia peticion, para que funcione sin configuracion extra.
        'liga'    => (defined('APP_URL') && APP_URL
                        ? rtrim(APP_URL, '/')
                        : ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http')
                           . '://' . ($_SERVER['HTTP_HOST'] ?? '')
                           . rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? ''), '/')))
                     . '/registro.html?t=' . $token,
        'expira_horas' => $horas
    ]);
