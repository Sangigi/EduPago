<?php
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin', 'admin'], 'No tienes permiso para importar alumnos.');
        $escuela_id = intval($input['escuela_id'] ?? 0);
        if ($rol_actual === 'admin') $escuela_id = intval($usuario_actual['escuela_id'] ?? 0);
        if (!$escuela_id) respond(['success' => false, 'error' => 'escuela_id requerido']);
        $filas = $input['filas'] ?? [];
        if (!is_array($filas) || empty($filas)) respond(['success' => false, 'error' => 'No se recibieron filas para importar']);
        if (count($filas) > 1000) respond(['success' => false, 'error' => 'Máximo 1000 filas por importación']);

        $plan_esc = $pdo->prepare("SELECT plan FROM escuelas WHERE id = ?");
        $plan_esc->execute([$escuela_id]);
        $plan_nombre = $plan_esc->fetch()['plan'] ?? PLAN_FALLBACK;
        $limite = limitesDelPlan($plan_nombre)['max_alumnos'];
        $cntAct = $pdo->prepare("SELECT COUNT(*) AS n FROM clientes WHERE escuela_id = ? AND activo = 1");
        $cntAct->execute([$escuela_id]);
        $alumnosActuales = intval($cntAct->fetch()['n'] ?? 0);

        // Cache en memoria de familias resueltas/creadas DURANTE este lote,
        // por tutor_email — para que dos filas del mismo CSV con el mismo
        // correo de tutor se vinculen entre sí sin volver a consultar la BD.
        $familiasPorEmail = [];
        $creadas = 0; $reutilizadas = 0; $alumnosCreados = 0; $cuentasCreadas = [];
        $errores = []; $clientesDetalle = []; $familiasDetalle = [];

        // Detección de alumnos duplicados: nada impedía subir el mismo CSV dos
        // veces y duplicar 400 alumnos (matricula es la única protección real,
        // y muchos CSV la traen vacía o distinta cada vez). Se compara por
        // nombre+grado (normalizado) contra lo que ya existe en esta escuela
        // Y contra lo que ya se creó dentro de este mismo archivo — cargado una
        // sola vez en memoria en vez de una query por fila.
        $normalizarDup = function ($nombre, $grado) {
            return mb_strtolower(trim($nombre ?? ''), 'UTF-8') . '|' . mb_strtolower(trim($grado ?? ''), 'UTF-8');
        };
        $existentesStmt = $pdo->prepare("SELECT nombre, grado FROM clientes WHERE escuela_id = ? AND activo = 1");
        $existentesStmt->execute([$escuela_id]);
        $vistosEnEscuela = [];
        foreach ($existentesStmt->fetchAll() as $ex) {
            $vistosEnEscuela[$normalizarDup($ex['nombre'], $ex['grado'])] = true;
        }

        foreach ($filas as $idx => $fila) {
            $numFila = $idx + 2; // +2: fila 1 es encabezado, arrays son 0-based
            try {
                if ($limite !== null && $alumnosActuales >= $limite) {
                    $errores[] = ['fila' => $numFila, 'error' => "Límite de $limite alumnos del plan ($plan_nombre) alcanzado — filas restantes no importadas."];
                    continue;
                }
                $alumno_nombre = trim($fila['alumno_nombre'] ?? '');
                if (!$alumno_nombre) { $errores[] = ['fila' => $numFila, 'error' => 'alumno_nombre es obligatorio']; continue; }
                $matricula   = trim($fila['matricula']    ?? '') ?: null;
                $grado       = trim($fila['grado']        ?? '') ?: null;

                $claveDup = $normalizarDup($alumno_nombre, $grado);
                if (isset($vistosEnEscuela[$claveDup])) {
                    $errores[] = ['fila' => $numFila, 'error' => "Ya existe un alumno llamado \"$alumno_nombre\"" . ($grado ? " en \"$grado\"" : '') . " en esta escuela — no se importó (posible duplicado)."];
                    continue;
                }
                $curp        = trim($fila['curp']         ?? '') ?: null;
                $alumno_email = trim($fila['alumno_email'] ?? '') ?: null;
                $alumno_tel  = trim($fila['alumno_telefono'] ?? '') ?: null;
                $nivel_sat   = trim($fila['nivel_educativo_sat'] ?? '') ?: null;
                $tutor_nombre = trim($fila['tutor_nombre'] ?? '') ?: null;
                $tutor_email  = trim($fila['tutor_email']  ?? '') ?: null;
                $tutor_tel    = trim($fila['tutor_telefono'] ?? '') ?: null;

                $familia_id = null;
                if ($tutor_email) {
                    $emailKey = strtolower($tutor_email);
                    if (isset($familiasPorEmail[$emailKey])) {
                        $familia_id = $familiasPorEmail[$emailKey];
                    } else {
                        // 1. ¿Ya existe una familia con este correo en esta escuela?
                        $chkFam = $pdo->prepare("SELECT id FROM familias WHERE escuela_id = ? AND email = ? LIMIT 1");
                        $chkFam->execute([$escuela_id, $tutor_email]);
                        $famExistente = $chkFam->fetch();
                        if ($famExistente) {
                            $familia_id = intval($famExistente['id']);
                            $reutilizadas++;
                        } else {
                            $pdo->prepare("INSERT INTO familias (escuela_id, nombre, contacto, email, telefono, activa) VALUES (?, ?, ?, ?, ?, 1)")
                                ->execute([$escuela_id, $tutor_nombre ?: $alumno_nombre, $tutor_nombre, $tutor_email, $tutor_tel]);
                            $familia_id = intval($pdo->lastInsertId());
                            $creadas++;
                            $familiasDetalle[] = ['id' => $familia_id, 'escuela_id' => $escuela_id, 'nombre' => $tutor_nombre ?: $alumno_nombre, 'contacto' => $tutor_nombre, 'email' => $tutor_email, 'telefono' => $tutor_tel, 'activa' => true];
                            // Cuenta de acceso al portal, solo si ese correo no
                            // tiene ya una cuenta de usuario en el sistema.
                            $chkUsr = $pdo->prepare("SELECT id FROM usuarios WHERE email = ?");
                            $chkUsr->execute([$tutor_email]);
                            if (!$chkUsr->fetch()) {
                                // Antes se generaba una contraseña en texto plano para que el
                                // admin la copiara a mano — mismo patrón de "contraseña dentro
                                // del correo" que hizo que Outlook marcara como phishing los
                                // correos de bienvenida de escuelas (ver invitacion_resolver.php).
                                // Se usa el mismo enlace de activación de un solo uso: nadie
                                // conoce la contraseña real hasta que el tutor la fija.
                                $activacion_token = bin2hex(random_bytes(32));
                                $activacion_hash  = hash('sha256', $activacion_token);
                                $pdo->prepare(
                                    "INSERT INTO usuarios (escuela_id, nombre, email, password_hash, rol, familia_id, activo, fecha_alta, creado_por, activacion_token_hash, activacion_expira)
                                     VALUES (?, ?, ?, ?, 'familia', ?, 1, CURDATE(), ?, ?, DATE_ADD(NOW(), INTERVAL 72 HOUR))"
                                )->execute([
                                    $escuela_id, $tutor_nombre ?: $alumno_nombre, $tutor_email,
                                    password_hash(bin2hex(random_bytes(32)), PASSWORD_BCRYPT),
                                    $familia_id, $usuario_actual['user_id'] ?? null, $activacion_hash
                                ]);
                                $cuentasCreadas[] = ['email' => $tutor_email, 'nombre' => $tutor_nombre ?: $alumno_nombre, 'activacion_token' => $activacion_token];
                            }
                        }
                        $familiasPorEmail[$emailKey] = $familia_id;
                    }
                }

                $stmtIns = $pdo->prepare(
                    "INSERT INTO clientes (escuela_id, familia_id, tipo, nombre, grado, matricula, curp, email, telefono, nivel_educativo_sat, activo)
                     VALUES (?, ?, 'alumno', ?, ?, ?, ?, ?, ?, ?, 1)"
                );
                $stmtIns->execute([$escuela_id, $familia_id, $alumno_nombre, $grado, $matricula, $curp, $alumno_email, $alumno_tel, $nivel_sat]);
                $nuevoClienteId = intval($pdo->lastInsertId());
                $clientesDetalle[] = [
                    'id' => $nuevoClienteId, 'escuela_id' => $escuela_id, 'familia_id' => $familia_id,
                    'tipo' => 'alumno', 'nombre' => $alumno_nombre, 'grado' => $grado, 'matricula' => $matricula,
                    'curp' => $curp, 'email' => $alumno_email, 'telefono' => $alumno_tel, 'tel' => $alumno_tel,
                    'nivel_educativo_sat' => $nivel_sat, 'activo' => true, 'saldo_pendiente' => 0,
                ];
                $vistosEnEscuela[$claveDup] = true;
                $alumnosCreados++;
                $alumnosActuales++;
            } catch (\Throwable $e) {
                $errores[] = ['fila' => $numFila, 'error' => 'Error al importar: ' . $e->getMessage()];
            }
        }

        // Enlace de activación por correo a cada cuenta nueva — con presupuesto
        // de tiempo: un CSV de cientos de tutores no debe arriesgar que el
        // import entero truene por timeout del servidor solo por mandar
        // correos uno por uno. Los que no alcancen a enviarse quedan con su
        // enlace en la respuesta para compartirlos a mano (mismo criterio que
        // invitacion_resolver.php cuando el correo automático falla).
        $inicioImport = $_SERVER['REQUEST_TIME_FLOAT'] ?? microtime(true);
        $presupuestoCorreoSeg = 40;
        $baseUrlActivacion = (defined('APP_URL') && APP_URL
                ? rtrim(APP_URL, '/')
                : ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http')
                   . '://' . ($_SERVER['HTTP_HOST'] ?? '')
                   . rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? ''), '/')));
        $correosEnviados = 0;
        foreach ($cuentasCreadas as &$cuentaNueva) {
            $ligaActivacion = $baseUrlActivacion . '/activar_cuenta.html?t=' . $cuentaNueva['activacion_token'];
            if ((microtime(true) - $inicioImport) > $presupuestoCorreoSeg) {
                $cuentaNueva['correo_enviado']  = false;
                $cuentaNueva['activacion_liga'] = $ligaActivacion;
            } else {
                $htmlActivacion = "
                    <p>Hola,</p>
                    <p>Ya se dio de alta a tu hijo(a) en Paga la Escuela.</p>
                    <p>Entra a este enlace para crear tu contraseña y ver la cuenta ({$cuentaNueva['email']}):</p>
                    <p><a href=\"" . htmlspecialchars($ligaActivacion) . "\">" . htmlspecialchars($ligaActivacion) . "</a></p>
                    <p>El enlace expira en 72 horas.</p>
                    <p>— Pagalaescuela</p>
                ";
                $resCorreoTutor = enviar_correo($cuentaNueva['email'], 'Activa tu cuenta — Paga la Escuela', $htmlActivacion);
                $cuentaNueva['correo_enviado']  = (bool) ($resCorreoTutor['success'] ?? false);
                $cuentaNueva['activacion_liga'] = $cuentaNueva['correo_enviado'] ? null : $ligaActivacion;
                if ($cuentaNueva['correo_enviado']) $correosEnviados++;
            }
            unset($cuentaNueva['activacion_token']);
        }
        unset($cuentaNueva);

        registrar_log($pdo, $usuario_actual, 'alumnos_importados_csv', "$alumnosCreados alumnos, $creadas familias nuevas, $reutilizadas reutilizadas, $correosEnviados/" . count($cuentasCreadas) . " correos de activación enviados, " . count($errores) . " errores", $escuela_id);
        respond([
            'success' => true,
            'alumnos_creados'   => $alumnosCreados,
            'familias_creadas'  => $creadas,
            'familias_reutilizadas' => $reutilizadas,
            'cuentas_creadas'   => $cuentasCreadas,
            'errores'           => $errores,
            'clientes_detalle'  => $clientesDetalle,
            'familias_detalle'  => $familiasDetalle,
        ]);
