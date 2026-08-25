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

    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            "INSERT INTO escuelas (nombre, rfc, rvoe, telefono, email, direccion,
                                   activa, plan, fecha_alta, origen_invitacion_id)
             VALUES (?,?,?,?,?,?, 1, 'basico', NOW(), ?)"
        )->execute([
            $d['nombre'] ?? '', $d['rfc'] ?? '', $d['rvoe'] ?? '',
            $d['telefono'] ?? '', $d['email'] ?? '', $d['direccion'] ?? '', $id
        ]);
        $escuela_nueva = intval($pdo->lastInsertId());

        $pdo->prepare(
            "UPDATE invitaciones_colegio
                SET estado='aprobada', escuela_id=?, aprobada_por=?, aprobada_en=NOW()
              WHERE id=?"
        )->execute([$escuela_nueva, intval($usuario_actual['user_id'] ?? 0), $id]);

        $pdo->commit();
    } catch (Exception $e) {
        $pdo->rollBack();
        respond(['success' => false, 'error' => 'No se pudo crear la escuela: ' . $e->getMessage()]);
    }

    // El usuario administrador del colegio se crea aparte, con
    // 'crear_usuario', para no generar contraseñas aquí.
    respond(['success' => true, 'escuela_id' => $escuela_nueva]);
