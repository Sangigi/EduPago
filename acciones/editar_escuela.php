<?php
        requerir_rol($usuario_actual['rol'] ?? '', ['superadmin'], 'Solo el super admin puede editar colegios.');
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        $nombre     = trim($input['nombre']     ?? '');
        $clave      = trim($input['clave']      ?? '');
        $rfc        = trim($input['rfc']        ?? '') ?: null;
        $telefono   = trim($input['telefono']   ?? '') ?: null;
        $email      = trim($input['email']      ?? '') ?: null;
        $direccion  = trim($input['direccion']  ?? '') ?: null;
        $logo_emoji = trim($input['logo_emoji'] ?? '') ?: '🏫';
        $rvoe       = trim($input['rvoe']       ?? '') ?: null;
        $plan       = trim($input['plan']       ?? '');
        if (!$nombre || !$clave) respond(['success' => false, 'error' => 'Nombre y clave son obligatorios']);
        if ($plan !== '' && !in_array($plan, array_keys(PLANES_LIMITES), true)) {
            respond(['success' => false, 'error' => 'Plan inválido']);
        }
        $chk = $pdo->prepare("SELECT id FROM escuelas WHERE clave = ? AND id != ?");
        $chk->execute([$clave, $id]);
        if ($chk->fetch()) respond(['success' => false, 'error' => 'Ya existe otro colegio con esa clave']);
        $sets = ["nombre = ?", "clave = ?", "rfc = ?", "rvoe = ?", "telefono = ?", "email = ?", "direccion = ?", "logo_emoji = ?"];
        $vals = [$nombre, $clave, $rfc, $rvoe, $telefono, $email, $direccion, $logo_emoji];
        if ($plan !== '') { $sets[] = "plan = ?"; $vals[] = $plan; }
        $vals[] = $id;
        $pdo->prepare("UPDATE escuelas SET " . implode(', ', $sets) . " WHERE id = ?")->execute($vals);
        registrar_log($pdo, $usuario_actual, 'escuela_editada', "Colegio #$id: '$nombre'" . ($plan !== '' ? " (plan → $plan)" : ''), $id);
        $stmt = $pdo->prepare("SELECT * FROM escuelas WHERE id = ?");
        $stmt->execute([$id]);
        $esc = $stmt->fetch();
        $esc['activa'] = (bool) $esc['activa'];
        $esc['es_plantel'] = (bool) $esc['es_plantel'];
        respond(['success' => true, 'escuela' => $esc]);
