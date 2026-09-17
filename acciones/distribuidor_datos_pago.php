<?php
        requerir_rol($usuario_actual['rol'] ?? '', ['distribuidor'], 'Solo distribuidores pueden ver este panel.');
        $dist_id = intval($usuario_actual['user_id'] ?? 0);
        $stmt = $pdo->prepare("SELECT pago_banco AS banco, pago_clabe AS clabe, pago_titular AS titular FROM usuarios WHERE id = ?");
        $stmt->execute([$dist_id]);
        $datos = $stmt->fetch() ?: ['banco' => '', 'clabe' => '', 'titular' => ''];
        respond(['success' => true, 'datos_pago' => [
            'banco'   => $datos['banco'] ?? '',
            'clabe'   => $datos['clabe'] ?? '',
            'titular' => $datos['titular'] ?? '',
        ]]);
