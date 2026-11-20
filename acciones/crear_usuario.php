<?php
        $rol_actual = $usuario_actual['rol'] ?? '';
        // [F4] 'control_escolar' (coordinación académica) también da de alta
        // cuentas, pero SOLO de docente y de alumno de su escuela (ver más abajo).
        requerir_rol($rol_actual, ['superadmin', 'admin', 'control_escolar'], 'No tienes permiso para crear usuarios.');
        $nombre    = trim($input['nombre']     ?? '');
        $email     = trim($input['email']      ?? '');
        $rol       = trim($input['rol']        ?? '');
        $esc_id    = intval($input['escuela_id'] ?? 0) ?: null;
        $fam_id    = intval($input['familia_id'] ?? 0) ?: null;
        // [F4] Solo para rol 'alumno': el alumno (clientes.id) al que pertenece la cuenta.
        $cli_id    = intval($input['cliente_id'] ?? 0) ?: null;
        // 'docente' (13-nov-2026): personal del colegio, solo control escolar.
        $roles_validos = ['admin','cajero','familia','docente'];
        // 'contador' (11-sep-2026): revisa documentos fiscales y datos de
        // pago de CUALQUIER escuela (ver revisar_documento_escuela.php y
        // demás), pero no tiene el resto de los poderes de superadmin
        // (no edita planes, no activa demo, no ve reportes globales). Solo
        // superadmin puede crear esta cuenta, igual que distribuidor.
        // 'soporte' (22-sep-2026): personal de PagaLaEscuela que atiende a los
        // colegios. Ve CUALQUIER escuela para poder responder "¿qué pasó con
        // este pago?", pero es estrictamente de LECTURA: no aparece en la
        // lista de roles permitidos de ninguna acción que escriba, y como
        // requerir_rol() es default-deny, todo lo demás le queda bloqueado sin
        // tener que enumerarlo. Ver rol_alcance_global() en api.php.
        //
        // usuarios.rol es VARCHAR desde migracion_2026_09_11_rol_contador.sql,
        // así que un rol nuevo NO necesita migración.
        if ($rol_actual === 'superadmin') { $roles_validos[] = 'superadmin'; $roles_validos[] = 'distribuidor'; $roles_validos[] = 'contador'; $roles_validos[] = 'soporte'; $roles_validos[] = 'provision'; $roles_validos[] = 'tesoreria'; $roles_validos[] = 'promotor'; }
        // [F4] Roles nuevos del colegio: 'control_escolar' (coordinación
        // académica), 'direccion' (consulta) y 'alumno' (portal del alumno).
        // Los crea admin (y superadmin). 'tienda' (F6) también lo crean solo admin y superadmin.
        if (in_array($rol_actual, ['superadmin', 'admin'], true)) {
            $roles_validos[] = 'control_escolar'; $roles_validos[] = 'direccion'; $roles_validos[] = 'alumno';
            // [F6] 'tienda': vendedor de la tiendita/cafetería del colegio. Solo
            // vende con el monedero de los alumnos (allowlist en api.php).
            $roles_validos[] = 'tienda';
        }
        // [F4] La coordinación NO puede crear cuentas con más poder que la suya:
        // solo docentes y alumnos (se sobrescribe la lista, no se suma).
        if ($rol_actual === 'control_escolar') $roles_validos = ['docente', 'alumno'];
        if (!$nombre || !$email || !in_array($rol, $roles_validos, true)) {
            respond(['success' => false, 'error' => 'Datos incompletos o rol no permitido']);
        }
        // Un admin solo puede crear usuarios dentro de su propia escuela
        // [F4] Igual para control_escolar: la escuela se fuerza a la propia, nunca
        // la que mande la petición.
        if ($rol_actual === 'admin' || $rol_actual === 'control_escolar') {
            $esc_id = $usuario_actual['escuela_id'] ?? null;
            requerir_seccion_habilitada($pdo, $rol_actual, $esc_id, ['miequipo', 'familias']);
        }
        // Un distribuidor no pertenece a ninguna escuela; su "zona" es informativa.
        // zona_id referencia el catálogo compartido `zonas` (usado también por
        // planteles); zona (texto) se conserva en paralelo solo como respaldo
        // legado, resuelta automáticamente del catálogo si se manda zona_id.
        $zona_id = intval($input['zona_id'] ?? 0) ?: null;
        $zona = trim($input['zona'] ?? '') ?: null;
        if ($zona_id) {
            $zNom = $pdo->prepare("SELECT nombre FROM zonas WHERE id = ?");
            $zNom->execute([$zona_id]);
            $zona = $zNom->fetchColumn() ?: $zona;
        }
        // Roles de PLATAFORMA: no pertenecen a ninguna escuela ni familia, su
        // trabajo es mirar o atender a TODAS. Dejarles un escuela_id los
        // encerraría en ese colegio y les vaciaría su propia pantalla.
        // 'soporte' y 'provision' se sumaron el 22-sep-2026.
        if (rol_sin_escuela($rol)) { $esc_id = null; $fam_id = null; }
        // [F4] Roles de colegio nuevos: sin escuela quedarían sueltos (y un
        // superadmin podría olvidar elegirla). Cuenta de alumno: además exige el
        // alumno, y su cliente_id es lo único que lo ata a SU información.
        if (in_array($rol, ['control_escolar', 'direccion', 'alumno', 'tienda' /* [F6] */], true) && !$esc_id) {
            respond(['success' => false, 'error' => 'Selecciona el colegio de esta cuenta.']);
        }
        if ($rol !== 'alumno') {
            $cli_id = null; // solo las cuentas de alumno llevan cliente_id
        } else {
            // La cuenta de alumno se identifica por cliente_id, nunca por familia_id:
            // dejarle uno la haría pasar por tutor en los chequeos de familia.
            $fam_id = null;
            if (!$cli_id) respond(['success' => false, 'error' => 'Selecciona el alumno al que pertenece esta cuenta.']);
            // La columna llega con migracion_2026_11_18_f4_roles.sql. Sin ella no se
            // puede ligar la cuenta: se dice claro en vez de un error de MySQL.
            try {
                $pdo->query("SELECT cliente_id FROM usuarios LIMIT 0");
            } catch (\PDOException $e) {
                respond(['success' => false, 'error' => 'Falta correr la migración migracion_2026_11_18_f4_roles.sql para crear cuentas de alumno.']);
            }
            // Mismo colegio, alumno de verdad y activo. Filtrar por escuela_id en
            // la consulta (no comparar después) hace que un id de otro colegio
            // responda igual que uno que no existe.
            $chkCli = $pdo->prepare("SELECT id, activo FROM clientes WHERE id = ? AND escuela_id = ? AND tipo = 'alumno'");
            $chkCli->execute([$cli_id, $esc_id]);
            $cliCuenta = $chkCli->fetch();
            if (!$cliCuenta) respond(['success' => false, 'error' => 'El alumno no existe en este colegio.']);
            if (!$cliCuenta['activo']) respond(['success' => false, 'error' => 'El alumno está dado de baja: reactívalo antes de crearle una cuenta.']);
            // Una sola cuenta activa por alumno. Si ya la tuvo y se desactivó, se puede crear otra.
            $chkDup = $pdo->prepare("SELECT id FROM usuarios WHERE cliente_id = ? AND rol = 'alumno' AND activo = 1 LIMIT 1");
            $chkDup->execute([$cli_id]);
            if ($chkDup->fetch()) respond(['success' => false, 'error' => 'Este alumno ya tiene una cuenta activa. Reenvía su activación o desactívala primero.']);
        }
        // [F0] La familia vinculada debe ser del mismo colegio que la cuenta.
        // Antes se aceptaba cualquier familia_id: un admin podía crear una cuenta
        // 'familia' en SU colegio ligada a una familia de OTRO colegio. Usuarios.js
        // ya copia la escuela de la familia al elegirla, así que en uso normal
        // esto nunca se dispara.
        if ($fam_id) {
            $chkFamUsr = $pdo->prepare("SELECT escuela_id FROM familias WHERE id = ?");
            $chkFamUsr->execute([$fam_id]);
            $famUsr = $chkFamUsr->fetch();
            if (!$famUsr || intval($famUsr['escuela_id']) !== intval($esc_id ?? -1)) {
                respond(['success' => false, 'error' => 'La familia seleccionada no pertenece a la escuela de esta cuenta.']);
            }
        }
        // Verificar email único
        $chk = $pdo->prepare("SELECT id FROM usuarios WHERE email = ?");
        $chk->execute([$email]);
        if ($chk->fetch()) respond(['success' => false, 'error' => 'El correo ya está registrado']);
        $creado_por = $usuario_actual["user_id"] ?? null;

        // Igual que el resto de altas de cuenta del sistema (invitaciones, CSV
        // de alumnos): nadie más que el propio usuario llega a conocer su
        // contraseña real. Se crea con un placeholder inservible y un enlace
        // de activación de un solo uso (72h) que se manda por correo.
        $activacion_token = bin2hex(random_bytes(32));
        $activacion_hash  = hash('sha256', $activacion_token);

        // [F4] Solo las cuentas de alumno insertan cliente_id: para el resto el
        // INSERT es el de siempre y no depende de la migración nueva.
        if ($cli_id) {
            $stmt = $pdo->prepare(
                "INSERT INTO usuarios (escuela_id, nombre, email, password_hash, rol, zona, activo, fecha_alta, familia_id, cliente_id, creado_por, activacion_token_hash, activacion_expira)"
                . " VALUES (?, ?, ?, ?, ?, ?, 1, CURDATE(), ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 72 HOUR))"
            );
            $stmt->execute([
                $esc_id, $nombre, $email, password_hash(bin2hex(random_bytes(32)), PASSWORD_BCRYPT),
                $rol, $zona, $fam_id, $cli_id, $creado_por, $activacion_hash
            ]);
        } else {
            $stmt = $pdo->prepare(
                "INSERT INTO usuarios (escuela_id, nombre, email, password_hash, rol, zona, activo, fecha_alta, familia_id, creado_por, activacion_token_hash, activacion_expira)"
                . " VALUES (?, ?, ?, ?, ?, ?, 1, CURDATE(), ?, ?, ?, DATE_ADD(NOW(), INTERVAL 72 HOUR))"
            );
            $stmt->execute([
                $esc_id, $nombre, $email, password_hash(bin2hex(random_bytes(32)), PASSWORD_BCRYPT),
                $rol, $zona, $fam_id, $creado_por, $activacion_hash
            ]);
        }
        $id = intval($pdo->lastInsertId());
        registrar_log($pdo, $usuario_actual, 'usuario_creado', "Nuevo usuario '$nombre' ($email) con rol '$rol'", $esc_id);
        // [OF-7c] Auditoría: alta de usuario (antes vacío). Sin contraseña ni enlace de activación.
        auditar($pdo, $usuario_actual, 'usuario.crear', 'usuario', $id, [],
            ['nombre' => $nombre, 'email' => $email, 'rol' => $rol, 'escuela_id' => $esc_id, 'familia_id' => $fam_id, 'activo' => 1], $esc_id);

        $baseUrl = (defined('APP_URL') && APP_URL
                ? rtrim(APP_URL, '/')
                : ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http')
                   . '://' . ($_SERVER['HTTP_HOST'] ?? '')
                   . rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? ''), '/')));
        $activacion_liga = $baseUrl . '/activar_cuenta.html?t=' . $activacion_token;
        $html = "
            <p>Hola,</p>
            <p>Se creó tu cuenta en Paga la Escuela.</p>
            <p>Entra a este enlace para crear tu contraseña y empezar a usarla ({$email}):</p>
            <p><a href=\"" . htmlspecialchars($activacion_liga) . "\">" . htmlspecialchars($activacion_liga) . "</a></p>
            <p>El enlace expira en 72 horas.</p>
            <p>— Pagalaescuela</p>
        ";
        $resCorreo = enviar_correo($email, 'Activa tu cuenta — Paga la Escuela', $html);
        $correo_enviado = (bool) ($resCorreo['success'] ?? false);
        if (!$correo_enviado) {
            log_api("crear_usuario #$id -> falló el correo de activación a $email: " . ($resCorreo['error'] ?? 'desconocido'));
        }

        respond([
            "success" => true,
            "usuario" => ["id" => $id, "nombre" => $nombre, "email" => $email, "rol" => $rol, "escuela_id" => $esc_id, "zona" => $zona, "zona_id" => $zona_id, "activo" => true, "familia_id" => $fam_id, "cliente_id" => $cli_id, "creado_por" => $creado_por],
            "correo_enviado"  => $correo_enviado,
            "activacion_liga" => $correo_enviado ? null : $activacion_liga,
        ]);
