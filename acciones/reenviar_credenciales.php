<?php
    // No se manda contraseña por correo — se probó y Outlook la marcaba como
    // phishing (un correo corto con "usuario y contraseña" desde un dominio
    // con poco historial es justo ese patrón, ver PRODUCCION.md). En vez de
    // eso se genera un enlace de activación de un solo uso, igual que al
    // aprobar una escuela — la contraseña actual del usuario NO se toca hasta
    // que de verdad entre a ese enlace y ponga una nueva.
    $rol_actual = $usuario_actual['rol'] ?? '';
    requerir_rol($rol_actual, ['superadmin', 'admin'], 'No tienes permiso para reenviar credenciales.');

    $id = intval($input['id'] ?? 0);
    if (!$id) respond(['success' => false, 'error' => 'id requerido']);

    $stmt = $pdo->prepare("SELECT * FROM usuarios WHERE id = ?");
    $stmt->execute([$id]);
    $u = $stmt->fetch();
    if (!$u) respond(['success' => false, 'error' => 'Usuario no encontrado']);

    // Mismo criterio que puedeEditar() en Usuarios.js: superadmin puede con
    // cualquiera; un admin solo con cajero/familia de su propia escuela.
    $autorizado = $rol_actual === 'superadmin'
        || ($rol_actual === 'admin'
            && in_array($u['rol'], ['cajero', 'familia'], true)
            && intval($u['escuela_id']) === intval($usuario_actual['escuela_id'] ?? -1));
    if (!$autorizado) {
        http_response_code(403);
        respond(['success' => false, 'error' => 'No tienes permiso para reenviar credenciales a este usuario.']);
    }

    $activacion_token = bin2hex(random_bytes(32));
    $activacion_hash  = hash('sha256', $activacion_token);
    $pdo->prepare("UPDATE usuarios SET activacion_token_hash = ?, activacion_expira = DATE_ADD(NOW(), INTERVAL 72 HOUR) WHERE id = ?")
        ->execute([$activacion_hash, $id]);

    registrar_log($pdo, $usuario_actual, 'credenciales_reenviadas',
        "Se generó un enlace de activación nuevo y se reenvió a '{$u['nombre']}' ({$u['email']})", $u['escuela_id']);

    $activacion_liga = (defined('APP_URL') && APP_URL
                            ? rtrim(APP_URL, '/')
                            : ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http')
                               . '://' . ($_SERVER['HTTP_HOST'] ?? '')
                               . rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? ''), '/')))
                         . '/activar_cuenta.html?t=' . $activacion_token;

    $html = "
        <p>Hola,</p>
        <p>Entra a este enlace para poner una contraseña nueva en tu cuenta de Paga la Escuela ({$u['email']}):</p>
        <p><a href=\"" . htmlspecialchars($activacion_liga) . "\">" . htmlspecialchars($activacion_liga) . "</a></p>
        <p>El enlace expira en 72 horas.</p>
        <p>— Pagalaescuela</p>
    ";
    $resCorreo = enviar_correo($u['email'], 'Tu enlace para entrar a Paga la Escuela', $html);
    $correo_enviado = (bool) ($resCorreo['success'] ?? false);
    if (!$correo_enviado) {
        log_api("reenviar_credenciales #$id ({$u['email']}) -> falló el correo: " . ($resCorreo['error'] ?? 'desconocido'));
    }

    respond([
        'success'          => true,
        'email'            => $u['email'],
        'correo_enviado'   => $correo_enviado,
        // Solo va en la respuesta si de verdad hace falta transmitirlo a mano.
        'activacion_liga'  => $correo_enviado ? null : $activacion_liga,
    ]);
