<?php
    // Pública, sin auth — el token en claro es lo único que demuestra que
    // quien manda esta petición de verdad recibió el correo de activación.
    $token = trim($input['token'] ?? '');
    $generico = ['success' => false, 'error' => 'Este enlace no es válido o ya venció.'];

    if (strlen($token) !== 64 || !ctype_xdigit($token)) respond($generico);

    $password = (string) ($input['password'] ?? '');
    if (strlen($password) < 8) {
        respond(['success' => false, 'error' => 'La contraseña debe tener al menos 8 caracteres']);
    }

    $stmt = $pdo->prepare(
        "SELECT id, activacion_expira FROM usuarios WHERE activacion_token_hash = ? LIMIT 1"
    );
    $stmt->execute([hash('sha256', $token)]);
    $u = $stmt->fetch();
    if (!$u) respond($generico);
    if (!$u['activacion_expira'] || strtotime($u['activacion_expira']) < time()) respond($generico);

    // El token es de un solo uso: se limpia al mismo tiempo que se fija la
    // contraseña, para que el mismo enlace no sirva dos veces.
    $pdo->prepare(
        "UPDATE usuarios
            SET password_hash = ?, activacion_token_hash = NULL, activacion_expira = NULL, sesion_valida_desde = NOW()
          WHERE id = ?"
    )->execute([password_hash($password, PASSWORD_BCRYPT), $u['id']]);

    registrar_log($pdo, ['user_id' => $u['id'], 'nombre' => null], 'cuenta_activada', 'El usuario activó su cuenta y fijó su propia contraseña');

    respond(['success' => true]);
