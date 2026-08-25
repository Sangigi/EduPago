<?php
    if (($usuario_actual['rol'] ?? '') !== 'superadmin') {
        http_response_code(403);
        respond(['success' => false, 'error' => 'Sin permiso']);
    }
    $id     = intval($input['id'] ?? 0);
    $accion = trim($input['accion'] ?? '');   // 'aprobar' | 'rechazar'
    if (!$id || !in_array($accion, ['aprobar', 'rechazar'], true)) {
        respond(['success' => false, 'error' => 'Datos incompletos']);
    }

    $stmt = $pdo->prepare("SELECT * FROM invitaciones_colegio WHERE id = ? LIMIT 1");
    $stmt->execute([$id]);
    $inv = $stmt->fetch();
    if (!$inv)                        respond(['success' => false, 'error' => 'Invitación no encontrada']);
    if ($inv['estado'] !== 'enviado') respond(['success' => false, 'error' => 'Esta invitación no está lista para resolverse']);

    if ($accion === 'rechazar') {
        $pdo->prepare(
            "UPDATE invitaciones_colegio
                SET estado='rechazada', motivo_rechazo=?, aprobada_por=?, aprobada_en=NOW()
              WHERE id=?"
        )->execute([
            mb_substr(trim($input['motivo'] ?? ''), 0, 300),
            intval($usuario_actual['user_id'] ?? 0), $id
        ]);
        respond(['success' => true]);
    }

    $d = json_decode($inv['datos_enviados'] ?? '{}', true) ?: [];

    // La cuenta admin se crea aquí mismo, con contraseña generada al azar —
    // antes se dejaba "para después" (crear_usuario aparte), así que un
    // colegio aprobado por este flujo se quedaba activo en la BD pero sin
    // nadie que pudiera iniciar sesión, y sin ningún aviso de que hacía falta
    // ese paso manual.
    $email_login = trim($d['email'] ?? '');
    $usuario_ya_existe = false;
    if ($email_login !== '') {
        $chkUsr = $pdo->prepare("SELECT id FROM usuarios WHERE email = ?");
        $chkUsr->execute([$email_login]);
        $usuario_ya_existe = (bool) $chkUsr->fetch();
    }
    $password_temporal = $usuario_ya_existe || $email_login === '' ? null : bin2hex(random_bytes(8));

    // `clave` es única (crear_escuela.php/editar_escuela.php siempre la piden
    // y la validan) pero el formulario público de registro nunca la pide —
    // no tendría sentido que un colegio inventara su propio código interno.
    // Se genera aquí a partir del nombre + el id de la invitación: el id es
    // único y nunca se repite, así que esto nunca choca con otra escuela,
    // sin necesitar un query extra de verificación ni un loop de reintento.
    $clave_base  = strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $d['nombre'] ?? ''), 0, 6));
    if ($clave_base === '') $clave_base = 'ESC';
    $clave_nueva = $clave_base . '-' . $id;

    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            "INSERT INTO escuelas (nombre, clave, rfc, rvoe, telefono, email, direccion,
                                   activa, plan, fecha_alta, origen_invitacion_id)
             VALUES (?,?,?,?,?,?,?, 1, 'basico', NOW(), ?)"
        )->execute([
            $d['nombre'] ?? '', $clave_nueva, $d['rfc'] ?? '', $d['rvoe'] ?? '',
            $d['telefono'] ?? '', $d['email'] ?? '', $d['direccion'] ?? '', $id
        ]);
        $escuela_nueva = intval($pdo->lastInsertId());

        $pdo->prepare(
            "UPDATE invitaciones_colegio
                SET estado='aprobada', escuela_id=?, aprobada_por=?, aprobada_en=NOW()
              WHERE id=?"
        )->execute([$escuela_nueva, intval($usuario_actual['user_id'] ?? 0), $id]);

        // Si la invitación la generó un distribuidor, esta es la única forma en
        // que puede llegar a cobrar comisión por este colegio: distribuidor_referidos
        // es la tabla que lee distribuidor_comisiones.php, y hasta ahora nada la
        // llenaba para invitaciones aprobadas por este flujo — el distribuidor
        // habría quedado sin comisión sin que nadie lo notara.
        if (!empty($inv['distribuidor_id'])) {
            $pdo->prepare(
                "INSERT INTO distribuidor_referidos
                    (distribuidor_id, escuela_id, nombre_colegio, num_alumnos, estado, comision_pct, fecha_alta)
                 VALUES (?, ?, ?, ?, 'activo', 5.00, CURDATE())"
            )->execute([
                intval($inv['distribuidor_id']), $escuela_nueva,
                $d['nombre'] ?? '', $d['num_alumnos'] ?? null
            ]);
        }

        $usuario_creado = false;
        if ($password_temporal !== null) {
            $pdo->prepare(
                "INSERT INTO usuarios (escuela_id, nombre, email, password_hash, rol, activo, fecha_alta)
                 VALUES (?, ?, ?, ?, 'admin', 1, CURDATE())"
            )->execute([
                $escuela_nueva,
                $inv['contacto_nombre'] ?: 'Administrador',
                $email_login,
                password_hash($password_temporal, PASSWORD_BCRYPT)
            ]);
            $usuario_creado = true;
        }

        $pdo->commit();
    } catch (Exception $e) {
        $pdo->rollBack();
        respond(['success' => false, 'error' => 'No se pudo crear la escuela: ' . $e->getMessage()]);
    }

    registrar_log($pdo, $usuario_actual, 'invitacion_aprobada', "Invitación #$id aprobada, colegio creado", $escuela_nueva);

    $correo_enviado = false;
    if ($usuario_creado) {
        $nombreColegio = $d['nombre'] ?: 'tu colegio';
        $htmlBienvenida = "
            <p>Hola,</p>
            <p><strong>" . htmlspecialchars($nombreColegio) . "</strong> ya está activo en Paga la Escuela.</p>
            <p>Puedes iniciar sesión con:</p>
            <p>Usuario: <strong>" . htmlspecialchars($email_login) . "</strong><br>
               Contraseña temporal: <strong>" . htmlspecialchars($password_temporal) . "</strong></p>
            <p>Puedes cambiarla cuando quieras desde tu perfil, una vez que inicies sesión.</p>
            <p>— Pagalaescuela</p>
        ";
        $resCorreo = enviar_correo($email_login, 'Tu colegio ya está activo en Paga la Escuela', $htmlBienvenida);
        $correo_enviado = (bool) ($resCorreo['success'] ?? false);
        if (!$correo_enviado) {
            log_api("invitacion_resolver #$id -> escuela $escuela_nueva creada pero falló el correo de bienvenida: " . ($resCorreo['error'] ?? 'desconocido'));
        }
    }

    respond([
        'success'            => true,
        'escuela_id'         => $escuela_nueva,
        'usuario_creado'     => $usuario_creado,
        'correo_enviado'     => $correo_enviado,
        'email_login'        => $usuario_creado ? $email_login : null,
        // Solo va en la respuesta si de verdad hace falta que el superadmin
        // la transmita a mano (no había cuenta que crear, o el correo falló).
        'password_temporal'  => ($usuario_creado && !$correo_enviado) ? $password_temporal : null,
    ]);
