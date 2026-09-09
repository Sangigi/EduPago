<?php
        requerir_rol($usuario_actual['rol'] ?? '', ['superadmin'], 'Solo el super admin puede activar/desactivar secciones.');
        $id = intval($input['id'] ?? 0);
        $seccion = trim($input['seccion'] ?? '');
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        if (!array_key_exists($seccion, SECCIONES_DISPONIBLES)) {
            respond(['success' => false, 'error' => 'Sección inválida']);
        }
        $stmt = $pdo->prepare("SELECT secciones_deshabilitadas FROM escuelas WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) respond(['success' => false, 'error' => 'Escuela no encontrada']);
        $deshabilitadas = json_decode($row['secciones_deshabilitadas'] ?? '', true);
        if (!is_array($deshabilitadas)) $deshabilitadas = [];
        $yaDeshabilitada = in_array($seccion, $deshabilitadas, true);
        $deshabilitadas = $yaDeshabilitada
            ? array_values(array_diff($deshabilitadas, [$seccion]))
            : array_values(array_merge($deshabilitadas, [$seccion]));
        $pdo->prepare("UPDATE escuelas SET secciones_deshabilitadas = ? WHERE id = ?")
            ->execute([json_encode($deshabilitadas), $id]);
        registrar_log(
            $pdo, $usuario_actual, 'escuela_seccion_toggle',
            "Escuela #$id: sección '$seccion' " . ($yaDeshabilitada ? 'habilitada' : 'deshabilitada'),
            $id
        );
        respond(['success' => true, 'secciones_deshabilitadas' => $deshabilitadas]);
