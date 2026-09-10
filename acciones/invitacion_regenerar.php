<?php
    // El token en claro nunca se guarda (solo su hash — ver invitacion_crear.php),
    // así que si se cierra el modal sin copiarlo, de verdad no hay forma de
    // recuperarlo. Esto no reemplaza esa protección: emite un token NUEVO para
    // la MISMA invitación (mismo contacto, mismo registro), invalidando el
    // viejo, en vez de obligar a crear un contacto duplicado desde cero.
    $rol_actual = $usuario_actual['rol'] ?? '';
    if (!in_array($rol_actual, ['superadmin', 'admin', 'distribuidor'], true)) {
        http_response_code(403);
        respond(['success' => false, 'error' => 'Sin permiso']);
    }

    $id = intval($input['id'] ?? 0);
    if (!$id) respond(['success' => false, 'error' => 'id requerido']);

    $stmt = $pdo->prepare("SELECT id, creado_por, estado, contacto_nombre, contacto_email FROM invitaciones_colegio WHERE id = ? LIMIT 1");
    $stmt->execute([$id]);
    $inv = $stmt->fetch();
    if (!$inv) respond(['success' => false, 'error' => 'Invitación no encontrada']);

    // Igual que invitaciones_listar: superadmin ve/edita todas, el resto solo
    // las que él mismo generó.
    if ($rol_actual !== 'superadmin' && intval($inv['creado_por']) !== intval($usuario_actual['user_id'] ?? 0)) {
        http_response_code(403);
        respond(['success' => false, 'error' => 'No puedes regenerar una invitación que no generaste tú']);
    }
    if ($inv['estado'] !== 'pendiente') {
        respond(['success' => false, 'error' => 'Esta invitación ya no está pendiente de llenarse, no se puede regenerar']);
    }

    $token         = bin2hex(random_bytes(32));
    $token_hash    = hash('sha256', $token);
    $token_prefijo = substr($token, 0, 8);
    $horas         = intval($input['vigencia_horas'] ?? 72);
    if ($horas < 1 || $horas > 720) $horas = 72;

    $pdo->prepare(
        "UPDATE invitaciones_colegio
            SET token_hash = ?, token_prefijo = ?, expira = DATE_ADD(NOW(), INTERVAL ? HOUR), intentos = 0
          WHERE id = ?"
    )->execute([$token_hash, $token_prefijo, $horas, $id]);

    registrar_log($pdo, $usuario_actual, 'invitacion_regenerada', "Invitación #$id: se generó un enlace nuevo (el anterior quedó inválido)");

    $liga = (defined('APP_URL') && APP_URL
                ? rtrim(APP_URL, '/')
                : ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http')
                   . '://' . ($_SERVER['HTTP_HOST'] ?? '')
                   . rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? ''), '/')))
             . '/registro.html?t=' . $token;

    // Envío automático (10-sep-2026), mismo criterio que invitacion_crear.php:
    // el enlace viejo queda inválido en cuanto se regenera, así que si no se
    // reenvía, el contacto se queda sin forma de continuar su registro.
    $htmlInvitacion = "
        <p>Hola " . htmlspecialchars($inv['contacto_nombre'] ?? '') . ",</p>
        <p>Aquí tienes tu enlace actualizado para registrar tu colegio en Paga la Escuela (el anterior ya no funciona):</p>
        <p><a href=\"" . htmlspecialchars($liga) . "\">" . htmlspecialchars($liga) . "</a></p>
        <p>El enlace expira en {$horas} horas.</p>
        <p>— Pagalaescuela</p>
    ";
    $resCorreo = enviar_correo($inv['contacto_email'], 'Tu enlace actualizado para registrar tu colegio en Paga la Escuela', $htmlInvitacion);
    $correo_enviado = (bool) ($resCorreo['success'] ?? false);
    if (!$correo_enviado) {
        log_api("invitacion_regenerar #$id -> falló el correo a {$inv['contacto_email']}: " . ($resCorreo['error'] ?? 'desconocido'));
    }

    respond([
        'success' => true,
        'id'      => $id,
        'token'   => $token,
        'liga'    => $liga,
        'expira_horas'   => $horas,
        'correo_enviado' => $correo_enviado,
    ]);
