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

    $nombre      = trim($input['nombre']     ?? '');
    $rfc         = strtoupper(trim($input['rfc'] ?? ''));
    $rvoe        = trim($input['rvoe']       ?? '');
    $telefono    = trim($input['telefono']   ?? '');
    $email       = trim($input['email']      ?? '');
    $direccion   = trim($input['direccion']  ?? '');
    $num_alumnos = intval($input['num_alumnos'] ?? 0) ?: null;
    $plan        = trim($input['plan'] ?? '');

    if ($nombre === '' || $email === '') {
        respond(['success' => false, 'error' => 'Nombre del colegio y correo son obligatorios']);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        respond(['success' => false, 'error' => 'El correo no es válido']);
    }
    // El plan es obligatorio desde que el registro incluye pago: sin plan no
    // hay monto que cobrar. PLANES_LIMITES (api.php) es la única fuente de
    // verdad de precios — nunca se confía en un monto que mande el navegador.
    if (!array_key_exists($plan, PLANES_LIMITES)) {
        respond(['success' => false, 'error' => 'Elige un plan válido antes de continuar.']);
    }
    $monto_plan = PLANES_LIMITES[$plan]['precio'];
    // RFC de persona moral (12) o física (13). Se valida forma, no existencia.
    if ($rfc !== '' && !preg_match('/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/u', $rfc)) {
        respond(['success' => false, 'error' => 'El RFC no tiene un formato válido']);
    }

    $datos = json_encode([
        'nombre'      => mb_substr($nombre, 0, 160),
        'rfc'         => mb_substr($rfc, 0, 13),
        'rvoe'        => mb_substr($rvoe, 0, 60),
        'telefono'    => mb_substr($telefono, 0, 40),
        'email'       => mb_substr($email, 0, 160),
        'direccion'   => mb_substr($direccion, 0, 300),
        'num_alumnos' => $num_alumnos,
    ], JSON_UNESCAPED_UNICODE);

    $pdo->prepare(
        "UPDATE invitaciones_colegio
            SET estado='enviado', datos_enviados=?, usada_en=NOW(), usada_ip=?,
                plan_elegido=?, monto_suscripcion=?
          WHERE id=? AND estado IN ('pendiente','enviado')"
    )->execute([$datos, ($_SERVER['REMOTE_ADDR'] ?? null), $plan, $monto_plan, $inv['id']]);

    // El frontend usa esta respuesta para pasar a la pantalla de pago —
    // antes de esto, "enviado" era el estado final del formulario.
    respond([
        'success' => true,
        'plan'    => $plan,
        'monto'   => $monto_plan,
        'mensaje' => 'Datos recibidos. Ahora paga tu primera mensualidad para continuar.'
    ]);
