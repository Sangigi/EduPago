<?php
    $token = trim($input['token'] ?? '');
    $generico = ['success' => false, 'error' => 'Esta liga no es válida o ya venció.'];

    if (strlen($token) !== 64 || !ctype_xdigit($token)) respond($generico);

    $stmt = $pdo->prepare(
        "SELECT id, estado, expira, intentos FROM invitaciones_colegio
          WHERE token_hash = ? LIMIT 1"
    );
    $stmt->execute([hash('sha256', $token)]);
    $inv = $stmt->fetch();
    if (!$inv || $inv['estado'] !== 'pendiente' || strtotime($inv['expira']) < time()) {
        if ($inv) {
            $pdo->prepare("UPDATE invitaciones_colegio SET intentos = intentos + 1 WHERE id = ?")
                ->execute([$inv['id']]);
        }
        respond($generico);
    }

    $nombre    = trim($input['nombre']     ?? '');
    $rfc       = strtoupper(trim($input['rfc'] ?? ''));
    $rvoe      = trim($input['rvoe']       ?? '');
    $telefono  = trim($input['telefono']   ?? '');
    $email     = trim($input['email']      ?? '');
    $direccion = trim($input['direccion']  ?? '');

    if ($nombre === '' || $email === '') {
        respond(['success' => false, 'error' => 'Nombre del colegio y correo son obligatorios']);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        respond(['success' => false, 'error' => 'El correo no es válido']);
    }
    // RFC de persona moral (12) o física (13). Se valida forma, no existencia.
    if ($rfc !== '' && !preg_match('/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/u', $rfc)) {
        respond(['success' => false, 'error' => 'El RFC no tiene un formato válido']);
    }

    $datos = json_encode([
        'nombre'    => mb_substr($nombre, 0, 160),
        'rfc'       => mb_substr($rfc, 0, 13),
        'rvoe'      => mb_substr($rvoe, 0, 60),
        'telefono'  => mb_substr($telefono, 0, 40),
        'email'     => mb_substr($email, 0, 160),
        'direccion' => mb_substr($direccion, 0, 300),
    ], JSON_UNESCAPED_UNICODE);

    $pdo->prepare(
        "UPDATE invitaciones_colegio
            SET estado='enviado', datos_enviados=?, usada_en=NOW(), usada_ip=?
          WHERE id=? AND estado='pendiente'"
    )->execute([$datos, ($_SERVER['REMOTE_ADDR'] ?? null), $inv['id']]);

    respond([
        'success' => true,
        'mensaje' => 'Recibimos tus datos. Te avisaremos por correo en cuanto tu colegio quede activo.'
    ]);
