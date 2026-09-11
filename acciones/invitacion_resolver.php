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

    if ($accion === 'rechazar') {
        // El rechazo NO exige pago -- a diferencia de aprobar. Antes este
        // check de 'pagado' vivía ANTES de separar aprobar/rechazar, así que
        // una solicitud basura o abandonada en 'enviado' (formulario lleno,
        // nunca pagado) no se podía cerrar jamás: se quedaba viva para
        // siempre en el panel.
        if (in_array($inv['estado'], ['aprobada', 'rechazada', 'expirada', 'cancelada'], true)) {
            respond(['success' => false, 'error' => 'Esta invitación ya no se puede rechazar (estado: ' . $inv['estado'] . ').']);
        }
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

    // Antes se podia aprobar con solo 'enviado' -- un formulario lleno,
    // sin ningun pago de por medio. Ahora la aprobacion exige que el
    // colegio ya haya pagado su primera mensualidad (estado 'pagado',
    // que pone el webhook al confirmar el cobro de suscripcion).
    if ($inv['estado'] !== 'pagado') respond(['success' => false, 'error' => 'Esta invitación aún no tiene el pago de suscripción confirmado.']);

    $d = json_decode($inv['datos_enviados'] ?? '{}', true) ?: [];

    // La cuenta admin se crea aquí mismo — antes se dejaba "para después"
    // (crear_usuario aparte), así que un colegio aprobado por este flujo se
    // quedaba activo en la BD pero sin nadie que pudiera iniciar sesión, y
    // sin ningún aviso de que hacía falta ese paso manual.
    // No se manda una contraseña por correo (se probó y Outlook la filtraba
    // como phishing — un correo corto con "usuario y contraseña" desde un
    // dominio con poco historial es justo ese patrón, ver PRODUCCION.md). En
    // vez de eso se manda un enlace de un solo uso para que el propio colegio
    // fije su contraseña — mismo mecanismo que ya usa la invitación misma
    // (token al azar, solo se guarda su hash, se muestra/usa una sola vez).
    $email_login = trim($d['email'] ?? '');
    $usuario_ya_existe = false;
    if ($email_login !== '') {
        $chkUsr = $pdo->prepare("SELECT id FROM usuarios WHERE email = ?");
        $chkUsr->execute([$email_login]);
        $usuario_ya_existe = (bool) $chkUsr->fetch();
    }
    $crear_cuenta = !$usuario_ya_existe && $email_login !== '';
    $activacion_token = $crear_cuenta ? bin2hex(random_bytes(32)) : null;
    $activacion_hash  = $activacion_token ? hash('sha256', $activacion_token) : null;

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
                                   activa, plan, fecha_alta, fecha_vencimiento_plan, origen_invitacion_id)
             VALUES (?,?,?,?,?,?,?, 1, ?, NOW(), ?, ?)"
        )->execute([
            $d['nombre'] ?? '', $clave_nueva, $d['rfc'] ?? '', $d['rvoe'] ?? '',
            $d['telefono'] ?? '', $d['email'] ?? '', $d['direccion'] ?? '',
            // El plan viene de lo que el colegio eligió y pagó durante el
            // registro (invitaciones_colegio.plan_elegido) -- antes siempre
            // quedaba fijo en 'basico' sin importar cuál se hubiera pagado.
            $inv['plan_elegido'] ?: 'basico',
            // Primer mes ya cubierto por el pago que confirmó el webhook.
            siguiente_vencimiento_mensual(date('Y-m-d')),
            $id
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
        if ($crear_cuenta) {
            $pdo->prepare(
                "INSERT INTO usuarios (escuela_id, nombre, email, password_hash, rol, activo, fecha_alta, activacion_token_hash, activacion_expira)
                 VALUES (?, ?, ?, ?, 'admin', 1, CURDATE(), ?, DATE_ADD(NOW(), INTERVAL 72 HOUR))"
            )->execute([
                $escuela_nueva,
                $inv['contacto_nombre'] ?: 'Administrador',
                $email_login,
                // Nadie conoce esta contraseña — se reemplaza en cuanto activan
                // su cuenta con el enlace. Existe solo porque password_hash es NOT NULL.
                password_hash(bin2hex(random_bytes(32)), PASSWORD_BCRYPT),
                $activacion_hash
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
    $activacion_liga = null;
    if ($usuario_creado) {
        $activacion_liga = (defined('APP_URL') && APP_URL
                                ? rtrim(APP_URL, '/')
                                : ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http')
                                   . '://' . ($_SERVER['HTTP_HOST'] ?? '')
                                   . rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? ''), '/')))
                             . '/activar_cuenta.html?t=' . $activacion_token;
        $nombreColegio = $d['nombre'] ?: 'tu colegio';
        $htmlBienvenida = "
            <p>Hola,</p>
            <p><strong>" . htmlspecialchars($nombreColegio) . "</strong> ya está activo en Paga la Escuela.</p>
            <p>Entra a este enlace para crear tu contraseña y empezar a usar tu cuenta ({$email_login}):</p>
            <p><a href=\"" . htmlspecialchars($activacion_liga) . "\">" . htmlspecialchars($activacion_liga) . "</a></p>
            <p>El enlace expira en 72 horas.</p>
            <p>— Pagalaescuela</p>
        ";
        $resCorreo = enviar_correo($email_login, 'Activa tu cuenta — tu colegio ya está en Paga la Escuela', $htmlBienvenida);
        $correo_enviado = (bool) ($resCorreo['success'] ?? false);
        if (!$correo_enviado) {
            log_api("invitacion_resolver #$id -> escuela $escuela_nueva creada pero falló el correo de bienvenida: " . ($resCorreo['error'] ?? 'desconocido'));
        }
    }

    respond([
        'success'          => true,
        'escuela_id'       => $escuela_nueva,
        'usuario_creado'   => $usuario_creado,
        'correo_enviado'   => $correo_enviado,
        'email_login'      => $usuario_creado ? $email_login : null,
        // Solo va en la respuesta si de verdad hace falta que el superadmin
        // lo transmita a mano (no había cuenta que crear, o el correo falló).
        'activacion_liga'  => ($usuario_creado && !$correo_enviado) ? $activacion_liga : null,
    ]);
