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

    // El superadmin ve las de todos (con quién las creó, para saber qué
    // distribuidor generó cada una); el resto solo ve las suyas — no necesita
    // el nombre del creador porque siempre es él mismo.
    if ($rol_actual === 'superadmin') {
        $stmt = $pdo->query(
            "SELECT i.id, i.token_prefijo, i.contacto_nombre, i.contacto_email, i.contacto_tel,
                    i.estado, i.expira, i.datos_enviados, i.escuela_id, i.fecha_alta,
                    u.nombre AS creado_por_nombre, u.rol AS creado_por_rol
               FROM invitaciones_colegio i
               LEFT JOIN usuarios u ON u.id = i.creado_por
              ORDER BY i.fecha_alta DESC LIMIT 200"
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
