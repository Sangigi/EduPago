<?php
        // Pública, sin auth — el "olvidé mi contraseña" del login. Reutiliza el
        // mismo mecanismo de token de un solo uso que ya usa la activación de
        // cuenta (activacion_token_hash/activacion_expira, verificado y
        // consumido por activar_cuenta_ver.php/activar_cuenta_confirmar.php):
        // fijar una contraseña nueva es exactamente la misma operación, solo
        // que aquí la ventana es de 10 minutos en vez de 72 horas (el usuario
        // ya tiene una cuenta funcionando, no hace falta darle días para
        // reaccionar como sí con una invitación por correo que puede tardar
        // en revisarse).
        $email = trim($input['email'] ?? '');
        if (!$email) respond(['success' => false, 'error' => 'Correo requerido']);

        // Respuesta genérica siempre — si el mensaje cambiara según si el
        // correo existe o no, este formulario serviría para enumerar cuentas
        // registradas en el sistema.
        $respuestaGenerica = [
            'success' => true,
            'mensaje' => 'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña. Revisa tu bandeja (y spam) — el enlace expira en 10 minutos.',
        ];

        $stmt = $pdo->prepare("SELECT id, nombre, activo FROM usuarios WHERE email = ?");
        $stmt->execute([$email]);
        $u = $stmt->fetch();

        if ($u && $u['activo']) {
            $token = bin2hex(random_bytes(32));
            $hash  = hash('sha256', $token);
            $pdo->prepare(
                "UPDATE usuarios SET activacion_token_hash = ?, activacion_expira = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE id = ?"
            )->execute([$hash, $u['id']]);

            $baseUrl = (defined('APP_URL') && APP_URL
                    ? rtrim(APP_URL, '/')
                    : ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http')
                       . '://' . ($_SERVER['HTTP_HOST'] ?? '')
                       . rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? ''), '/')));
            $liga = $baseUrl . '/activar_cuenta.html?modo=reset&t=' . $token;

            $html = "
                <p>Hola,</p>
                <p>Recibimos una solicitud para restablecer tu contraseña en Paga la Escuela.</p>
                <p>Entra a este enlace para poner una contraseña nueva:</p>
                <p><a href=\"" . htmlspecialchars($liga) . "\">" . htmlspecialchars($liga) . "</a></p>
                <p>El enlace expira en 10 minutos. Si tú no pediste esto, ignora este correo — tu contraseña actual sigue funcionando.</p>
                <p>— Pagalaescuela</p>
            ";
            $resCorreo = enviar_correo($email, 'Restablece tu contraseña — Paga la Escuela', $html);
            if (!($resCorreo['success'] ?? false)) {
                log_api('recuperar_password_solicitar: falló el correo a ' . $email . ': ' . ($resCorreo['error'] ?? 'desconocido'));
            }
            registrar_log($pdo, ['user_id' => $u['id'], 'nombre' => $u['nombre']], 'password_recuperacion_solicitada', null, null);
        }

        respond($respuestaGenerica);
