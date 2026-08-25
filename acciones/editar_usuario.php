<?php
        $rol_actual = $usuario_actual['rol'] ?? '';
        $id       = intval($input['id']    ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        // Solo admin/superadmin editan usuarios ajenos; cualquier usuario puede editar su propio perfil
        // (pero sin poder tocar su propio rol/escuela, eso se filtra abajo).
        // OJO: verificar_token_auth() sólo pone 'user_id' en $usuario_actual (nunca 'id') —
        // comparar contra 'id' aquí hacía que $es_propio_perfil fuera SIEMPRE false.
        $es_propio_perfil = ($id === intval($usuario_actual['user_id'] ?? 0));
        if (!in_array($rol_actual, ['superadmin', 'admin']) && !$es_propio_perfil) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'No tienes permiso para editar este usuario.']);
        }
        // Un admin solo puede tocar usuarios de su propia escuela (y nunca a un superadmin)
        validar_admin_sobre_usuario($pdo, $rol_actual, $usuario_actual, $id, 'No tienes permiso para editar este usuario.');
        $nombre   = trim($input['nombre']  ?? '');
        $email    = trim($input['email']   ?? '');
        $password = trim($input['password'] ?? '');
        $rol      = trim($input['rol']     ?? '');
        $esc_id   = intval($input['escuela_id'] ?? 0) ?: null;
        // familia_id puede enviarse como null explícitamente (limpiar vínculo) o como entero
        $fam_id_raw = $input['familia_id'] ?? '__NO_ENVIADO__';
        $fam_id   = ($fam_id_raw === '__NO_ENVIADO__') ? '__NO_ENVIADO__' : (intval($fam_id_raw) ?: null);
        // zona puede enviarse como null/vacío explícito (limpiar) o como texto
        $zona_raw = $input['zona'] ?? '__NO_ENVIADO__';
        $zona     = ($zona_raw === '__NO_ENVIADO__') ? '__NO_ENVIADO__' : (trim($zona_raw) ?: null);
        // zona_id referencia el catálogo compartido `zonas`; si se manda, se
        // resuelve también el texto legado 'zona' desde el catálogo.
        $zona_id_raw = $input['zona_id'] ?? '__NO_ENVIADO__';
        $zona_id = ($zona_id_raw === '__NO_ENVIADO__') ? '__NO_ENVIADO__' : (intval($zona_id_raw) ?: null);
        if ($zona_id !== '__NO_ENVIADO__' && $zona_id) {
            $zNomEdit = $pdo->prepare("SELECT nombre FROM zonas WHERE id = ?");
            $zNomEdit->execute([$zona_id]);
            $zona = $zNomEdit->fetchColumn() ?: $zona;
        }
        // Nadie edita su propio rol/escuela/zona (evita auto-ascenso a superadmin), y solo
        // superadmin puede reasignar rol/escuela/zona de terceros.
        if ($es_propio_perfil || $rol_actual !== 'superadmin') {
            $rol    = '';
            $esc_id = null;
            $zona   = '__NO_ENVIADO__';
            $zona_id = '__NO_ENVIADO__';
        }
        // Nadie edita su propio familia_id (evita que un usuario rol 'familia'
        // se reasigne a otra familia y vea/edite alumnos ajenos); solo
        // admin/superadmin lo cambian sobre TERCEROS.
        if ($es_propio_perfil) {
            $fam_id = '__NO_ENVIADO__';
        }
        // Si te editas a ti mismo y cambias tu contraseña o tu correo, debes confirmar
        // tu contraseña actual (el frontend ya lo exige, pero antes no se validaba aquí:
        // con solo el token, cualquiera podía cambiarse el password sin saber el actual).
        if ($es_propio_perfil && ($password !== '' || $email !== '')) {
            $password_actual_in = trim($input['password_actual'] ?? '');
            if ($password_actual_in === '') {
                respond(['success' => false, 'error' => 'Ingresa tu contraseña actual para guardar estos cambios.']);
            }
            $stmtPwChk = $pdo->prepare("SELECT password_hash FROM usuarios WHERE id = ?");
            $stmtPwChk->execute([$usuario_actual['user_id'] ?? 0]);
            $rowPwChk = $stmtPwChk->fetch();
            if (!$rowPwChk || !password_verify($password_actual_in, $rowPwChk['password_hash'])) {
                respond(['success' => false, 'error' => 'La contraseña actual no es correcta.']);
            }
        }
        // usuarios.email es UNIQUE — sin este chequeo, intentar dejarlo igual
        // al de otra cuenta tronaba con un PDOException sin capturar (el
        // catch de más abajo solo sabe recuperarse de la falta de la columna
        // zona_id, así que cualquier otro error de SQL se re-lanzaba tal cual
        // y terminaba en 500 en vez de un mensaje entendible).
        if ($email !== '') {
            $chkEmailEdit = $pdo->prepare("SELECT id FROM usuarios WHERE email = ? AND id != ?");
            $chkEmailEdit->execute([$email, $id]);
            if ($chkEmailEdit->fetch()) {
                respond(['success' => false, 'error' => 'Ese correo ya está registrado por otra cuenta.']);
            }
        }
        $sets = []; $vals = [];
        if ($nombre)   { $sets[] = 'nombre = ?';         $vals[] = $nombre; }
        if ($email)    { $sets[] = 'email = ?';          $vals[] = $email; }
        if ($password) {
            $sets[] = 'password_hash = ?';        $vals[] = password_hash($password, PASSWORD_BCRYPT);
            // Invalida cualquier token ya emitido para este usuario (propio o
            // reseteado por un admin/superadmin) — sin esto, un token robado
            // seguía funcionando aunque la contraseña ya hubiera cambiado.
            $sets[] = 'sesion_valida_desde = NOW()';
        }
        if ($rol)      { $sets[] = 'rol = ?';            $vals[] = $rol; }
        if ($esc_id !== null) { $sets[] = 'escuela_id = ?'; $vals[] = $esc_id; }
        if ($fam_id !== '__NO_ENVIADO__') { $sets[] = 'familia_id = ?'; $vals[] = $fam_id; }
        if ($zona !== '__NO_ENVIADO__') { $sets[] = 'zona = ?'; $vals[] = $zona; }
        if ($zona_id !== '__NO_ENVIADO__') { $sets[] = 'zona_id = ?'; $vals[] = $zona_id; }
        // Foto de perfil por enlace externo (no se sube archivo, solo la URL).
        // Solo se toca si la clave viene en la peticion, para que un guardado
        // parcial no borre una foto ya puesta.
        if (array_key_exists('foto_url', $input)) {
            $foto = trim((string)($input['foto_url'] ?? ''));
            // Solo http(s): este valor termina como src de un <img>, y sin esta
            // validacion se podria guardar javascript: o data: con contenido
            // arbitrario. El frontend tambien valida, pero esta es la que cuenta.
            if ($foto !== '' && !preg_match('#^https?://#i', $foto)) {
                respond(['success' => false, 'error' => 'El enlace de la foto debe empezar con http:// o https://']);
            }
            $sets[] = 'foto_url = ?';
            $vals[] = ($foto === '' ? null : mb_substr($foto, 0, 512));
        }
        if ($sets) {
            $vals[] = $id;
            try {
                $pdo->prepare("UPDATE usuarios SET " . implode(', ', $sets) . " WHERE id = ?")->execute($vals);
            } catch (\PDOException $e) {
                // zona_id es columna nueva (migracion_zonas.sql) — si aún no
                // corrió en esta base, reintenta sin ella en vez de tronar.
                $setsSinZonaId = array_values(array_filter($sets, fn($s) => strpos($s, 'zona_id') === false));
                // Cualquier otro error de SQL (constraint que no anticipamos, etc.)
                // se responde como error normal — antes se relanzaba tal cual y
                // terminaba en un 500 sin mensaje útil para quien lo dispara.
                if (count($setsSinZonaId) === count($sets)) {
                    respond(['success' => false, 'error' => 'No se pudo guardar: ' . $e->getMessage()]);
                }
                $valsSinZonaId = $vals; array_splice($valsSinZonaId, array_search('zona_id = ?', $sets), 1);
                $pdo->prepare("UPDATE usuarios SET " . implode(', ', $setsSinZonaId) . " WHERE id = ?")->execute($valsSinZonaId);
            }
            if ($rol || $esc_id !== null || $password) {
                $cambios = array_filter([
                    $rol ? "rol → '$rol'" : null,
                    $esc_id !== null ? "escuela_id → $esc_id" : null,
                    $password ? 'contraseña restablecida' : null,
                ]);
                registrar_log($pdo, $usuario_actual, 'usuario_editado_sensible', "Usuario #$id: " . implode(', ', $cambios));
            }
        }
        // Re-leer el usuario actualizado para devolverlo completo
        try {
            $stmt = $pdo->prepare("SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.escuela_id, u.fecha_alta, u.familia_id, u.creado_por, u.zona, u.zona_id FROM usuarios u WHERE u.id = ?");
            $stmt->execute([$id]);
        } catch (\PDOException $e) {
            $stmt = $pdo->prepare("SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.escuela_id, u.fecha_alta, u.familia_id, u.creado_por, u.zona FROM usuarios u WHERE u.id = ?");
            $stmt->execute([$id]);
        }
        $usuarioActualizado = $stmt->fetch();
        respond(['success' => true, 'usuario' => $usuarioActualizado]);
