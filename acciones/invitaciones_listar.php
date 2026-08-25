<?php
    $rol_actual = $usuario_actual['rol'] ?? '';
    if (!in_array($rol_actual, ['superadmin', 'admin', 'distribuidor'], true)) {
        http_response_code(403);
        respond(['success' => false, 'error' => 'Sin permiso']);
    }
    // Se marcan como expiradas las que ya vencieron, de paso
    $pdo->query("UPDATE invitaciones_colegio
                    SET estado='expirada'
                  WHERE estado='pendiente' AND expira < NOW()");

    if ($rol_actual === 'superadmin') {
        $stmt = $pdo->query(
            "SELECT id, token_prefijo, contacto_nombre, contacto_email, contacto_tel,
                    estado, expira, datos_enviados, escuela_id, fecha_alta
               FROM invitaciones_colegio ORDER BY fecha_alta DESC LIMIT 200"
        );
    } else {
        $stmt = $pdo->prepare(
            "SELECT id, token_prefijo, contacto_nombre, contacto_email, contacto_tel,
                    estado, expira, datos_enviados, escuela_id, fecha_alta
               FROM invitaciones_colegio WHERE creado_por = ?
              ORDER BY fecha_alta DESC LIMIT 200"
        );
        $stmt->execute([intval($usuario_actual['user_id'] ?? 0)]);
    }
    respond(['success' => true, 'invitaciones' => $stmt->fetchAll()]);
