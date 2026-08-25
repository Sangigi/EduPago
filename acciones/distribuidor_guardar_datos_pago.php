<?php
        requerir_rol($usuario_actual['rol'] ?? '', ['distribuidor'], 'Solo distribuidores pueden editar este panel.');
        $dist_id = intval($usuario_actual['user_id'] ?? 0);
        $banco   = trim($input['banco'] ?? '') ?: null;
        $clabe   = trim($input['clabe'] ?? '') ?: null;
        $titular = trim($input['titular'] ?? '') ?: null;
        if ($clabe && !preg_match('/^\d{18}$/', $clabe)) {
            respond(['success' => false, 'error' => 'La CLABE debe tener exactamente 18 dígitos.']);
        }
        $pdo->prepare("UPDATE usuarios SET pago_banco = ?, pago_clabe = ?, pago_titular = ? WHERE id = ?")
            ->execute([$banco, $clabe, $titular, $dist_id]);
        registrar_log($pdo, $usuario_actual, 'distribuidor_datos_pago_actualizados', 'Distribuidor actualizó sus datos de pago');
        respond(['success' => true]);
