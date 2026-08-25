<?php
        $rol_actual = $usuario_actual['rol'] ?? '';
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);

        $esSuper = ($rol_actual === 'superadmin');
        $esAdminDeEsta = ($rol_actual === 'admin'
                          && $id === intval($usuario_actual['escuela_id'] ?? 0));
        if (!$esSuper && !$esAdminDeEsta) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'Sin permiso para cambiar el logo de este colegio.']);
        }

        $logo = trim((string)($input['logo_url'] ?? ''));
        // Este valor termina como src de un <img>: solo http(s).
        if ($logo !== '' && !preg_match('#^https?://#i', $logo)) {
            respond(['success' => false, 'error' => 'El enlace del logo debe empezar con http:// o https://']);
        }
        $stmtLogo = $pdo->prepare("UPDATE escuelas SET logo_url = ? WHERE id = ?");
        $stmtLogo->execute([($logo === '' ? null : mb_substr($logo, 0, 512)), $id]);
        respond(['success' => true]);
