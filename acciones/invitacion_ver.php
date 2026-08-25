<?php
    $token = trim($_GET['t'] ?? $input['token'] ?? '');
    // Respuesta idéntica en todos los casos malos: no se filtra si existe
    $generico = ['success' => false, 'error' => 'Esta liga no es válida o ya venció.'];

    if (strlen($token) !== 64 || !ctype_xdigit($token)) respond($generico);

    $stmt = $pdo->prepare(
        "SELECT id, contacto_nombre, contacto_email, estado, expira, intentos
           FROM invitaciones_colegio WHERE token_hash = ? LIMIT 1"
    );
    $stmt->execute([hash('sha256', $token)]);
    $inv = $stmt->fetch();

    if (!$inv)                                    respond($generico);
    if ($inv['estado'] !== 'pendiente')           respond($generico);
    if (strtotime($inv['expira']) < time()) {
        $pdo->prepare("UPDATE invitaciones_colegio SET estado='expirada' WHERE id=?")
            ->execute([$inv['id']]);
        respond($generico);
    }
    if (intval($inv['intentos']) >= 10) {
        $pdo->prepare("UPDATE invitaciones_colegio SET estado='cancelada' WHERE id=?")
            ->execute([$inv['id']]);
        respond($generico);
    }

    respond([
        'success'         => true,
        'contacto_nombre' => $inv['contacto_nombre'],
        'contacto_email'  => $inv['contacto_email']
    ]);
