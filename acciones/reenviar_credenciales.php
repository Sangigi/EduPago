<?php
    // El hash de la contraseña actual no se puede "reenviar" — solo se guarda
    // el bcrypt, nunca el texto plano (mismo principio que el token de
    // invitación o la contraseña temporal al aprobar una escuela). Reenviar
    // credenciales en realidad significa: generar una contraseña NUEVA y
    // mandarla, dejando la vieja inválida.
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

    $password_nueva = bin2hex(random_bytes(8));
    $pdo->prepare("UPDATE usuarios SET password_hash = ?, sesion_valida_desde = NOW() WHERE id = ?")
        ->execute([password_hash($password_nueva, PASSWORD_BCRYPT), $id]);

    registrar_log($pdo, $usuario_actual, 'credenciales_reenviadas',
        "Se generó una contraseña nueva y se reenvió a '{$u['nombre']}' ({$u['email']})", $u['escuela_id']);

    $html = "
        <p>Hola,</p>
        <p>Se generó una nueva contraseña de acceso a tu cuenta en Paga la Escuela.</p>
        <p>Usuario: <strong>" . htmlspecialchars($u['email']) . "</strong><br>
           Contraseña temporal: <strong>" . htmlspecialchars($password_nueva) . "</strong></p>
        <p>Puedes cambiarla cuando quieras desde tu perfil, una vez que inicies sesión.</p>
        <p>— Pagalaescuela</p>
    ";
    $resCorreo = enviar_correo($u['email'], 'Tu nueva contraseña de acceso — Paga la Escuela', $html);
    $correo_enviado = (bool) ($resCorreo['success'] ?? false);
    if (!$correo_enviado) {
        log_api("reenviar_credenciales #$id ({$u['email']}) -> falló el correo: " . ($resCorreo['error'] ?? 'desconocido'));
    }

    respond([
        'success'           => true,
        'email'             => $u['email'],
        'correo_enviado'    => $correo_enviado,
        // Solo va en la respuesta si de verdad hace falta transmitirla a mano.
        'password_temporal' => $correo_enviado ? null : $password_nueva,
    ]);
