<?php
        // Cualquier usuario autenticado cambia SU PROPIA contraseña,
        // verificando la actual — no requiere ser admin.
        $actual = trim($input['password_actual'] ?? '');
        $nueva  = trim($input['password_nueva']  ?? '');
        if (!$actual || !$nueva) respond(['success' => false, 'error' => 'Faltan datos']);
        if (strlen($nueva) < 8) respond(['success' => false, 'error' => 'La nueva contraseña debe tener al menos 8 caracteres']);
        $stmtPw = $pdo->prepare("SELECT password_hash FROM usuarios WHERE id = ?");
        $stmtPw->execute([$usuario_actual['user_id'] ?? 0]);
        $rowPw = $stmtPw->fetch();
        if (!$rowPw || !password_verify($actual, $rowPw['password_hash'])) {
            respond(['success' => false, 'error' => 'La contraseña actual no es correcta']);
        }
        // Al cambiar tu contraseña, se invalidan todos los tokens ya emitidos
        // (incluido uno robado que alguien más ya tuviera) — el que hizo este
        // request sigue funcionando porque ya pasó verificar_token_auth() antes.
        $pdo->prepare("UPDATE usuarios SET password_hash = ?, sesion_valida_desde = NOW() WHERE id = ?")
            ->execute([password_hash($nueva, PASSWORD_BCRYPT), $usuario_actual['user_id'] ?? 0]);
        registrar_log($pdo, $usuario_actual, 'usuario_cambio_password_propio', 'El usuario cambió su propia contraseña');
        respond(['success' => true]);
