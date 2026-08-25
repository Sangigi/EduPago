<?php
        $email = trim($input['email'] ?? '');
        $pass  = $input['password'] ?? '';
        if (!$email || !$pass) respond(['success' => false, 'error' => 'Faltan credenciales']);
        // Límite de intentos: antes no había ningún tope, permitiendo fuerza
        // bruta/credential stuffing ilimitado. Reutiliza logs_sistema (ya
        // registra cada 'login_fallido' con ip y correo) — sin tabla nueva.
        // Doble tope: por IP (cualquier correo) y por correo (cualquier IP).
        try {
            $ipLogin = $_SERVER['REMOTE_ADDR'] ?? '';
            $stmtRateIp = $pdo->prepare(
                "SELECT COUNT(*) AS n FROM logs_sistema WHERE accion = 'login_fallido' AND ip = ? AND fecha >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)"
            );
            $stmtRateIp->execute([$ipLogin]);
            $stmtRateEmail = $pdo->prepare(
                "SELECT COUNT(*) AS n FROM logs_sistema WHERE accion = 'login_fallido' AND detalle = ? AND fecha >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)"
            );
            $stmtRateEmail->execute(["Intento con correo: $email"]);
            if (intval($stmtRateIp->fetch()['n'] ?? 0) >= 15 || intval($stmtRateEmail->fetch()['n'] ?? 0) >= 5) {
                respond(['success' => false, 'error' => 'Demasiados intentos fallidos. Espera unos minutos antes de volver a intentar.']);
            }
        } catch (\PDOException $e) {
            // Si logs_sistema no existe aún, no bloquear el login por eso.
        }
        $stmt = $pdo->prepare("SELECT id, nombre, email, password_hash, rol, escuela_id, familia_id FROM usuarios WHERE email = ? AND activo = 1");
        $stmt->execute([$email]);
        $user = $stmt->fetch();
        $credenciales_ok = false;
        if ($user) {
            $hash_guardado = $user['password_hash'];
            $es_hash_real  = strlen($hash_guardado) > 0 && (substr($hash_guardado, 0, 4) === '$2y$' || substr($hash_guardado, 0, 4) === '$2a$');
            if ($es_hash_real) {
                // Caso normal: contraseña ya migrada a hash bcrypt
                $credenciales_ok = password_verify($pass, $hash_guardado);
            } elseif ($pass === $hash_guardado) {
                // Compatibilidad con cuentas viejas en texto plano:
                // si coincide, se acepta UNA vez y de inmediato se migra a hash real.
                $credenciales_ok = true;
                $nuevo_hash = password_hash($pass, PASSWORD_BCRYPT);
                $pdo->prepare("UPDATE usuarios SET password_hash = ? WHERE id = ?")->execute([$nuevo_hash, $user['id']]);
            }
        }
        if ($credenciales_ok) {
            // Si el usuario pertenece a una escuela, verificar que esté activa.
            // (superadmin no tiene escuela_id, así que nunca se bloquea por esto)
            if ($user['escuela_id']) {
                $esc = $pdo->prepare("SELECT activa FROM escuelas WHERE id = ?");
                $esc->execute([$user['escuela_id']]);
                $escuela = $esc->fetch();
                if ($escuela && !$escuela['activa']) {
                    respond(['success' => false, 'error' => 'Esta escuela está inactiva. Contacta al administrador.']);
                }
            }
            $token = generar_token($user['id']);
            registrar_log($pdo, ['user_id' => $user['id'], 'nombre' => $user['nombre']], 'login_exitoso', null, $user['escuela_id']);
            respond([
                'success' => true, 
                'user' => [
                    'id'         => $user['id'],
                    'nombre'     => $user['nombre'],
                    'email'      => $user['email'],
                    'rol'        => $user['rol'],
                    'escuela_id' => $user['escuela_id'],
                    'familia_id' => $user['familia_id'] ? intval($user['familia_id']) : null,
                    'token'      => $token
                ]
            ]);
        }
        registrar_log($pdo, ['user_id' => $user['id'] ?? null, 'nombre' => $email], 'login_fallido', "Intento con correo: $email", $user['escuela_id'] ?? null);
        respond(['success' => false, 'error' => 'Credenciales incorrectas']);
