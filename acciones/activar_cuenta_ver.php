<?php
    // Pública, sin auth (ver $acciones_publicas en api.php) — mismo patrón que
    // invitacion_ver.php: el token en la URL ES la autenticación de esta
    // pantalla, no hace falta sesión.
    $token = trim($_GET['t'] ?? $input['token'] ?? '');
    // Respuesta idéntica en todos los casos malos: no se filtra si existe.
    $generico = ['success' => false, 'error' => 'Este enlace no es válido o ya venció.'];

    if (strlen($token) !== 64 || !ctype_xdigit($token)) respond($generico);

    $stmt = $pdo->prepare(
        "SELECT nombre, email, activacion_expira FROM usuarios
          WHERE activacion_token_hash = ? LIMIT 1"
    );
    $stmt->execute([hash('sha256', $token)]);
    $u = $stmt->fetch();

    if (!$u) respond($generico);
    if (!$u['activacion_expira'] || strtotime($u['activacion_expira']) < time()) respond($generico);

    respond([
        'success' => true,
        'nombre'  => $u['nombre'],
        'email'   => $u['email'],
    ]);
