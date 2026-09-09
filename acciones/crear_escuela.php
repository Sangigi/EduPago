<?php
        requerir_rol($usuario_actual['rol'] ?? '', ['superadmin'], 'Solo el super admin puede crear colegios.');
        $nombre     = trim($input['nombre']     ?? '');
        $clave      = trim($input['clave']      ?? '');
        $rfc        = trim($input['rfc']        ?? '') ?: null;
        $telefono   = trim($input['telefono']   ?? '') ?: null;
        $email      = trim($input['email']      ?? '') ?: null;
        $direccion  = trim($input['direccion']  ?? '') ?: null;
        $logo_emoji = trim($input['logo_emoji'] ?? '') ?: '🏫';
        $rvoe       = trim($input['rvoe']       ?? '') ?: null;
        $plan       = trim($input['plan']       ?? 'basico');
        if (!in_array($plan, array_keys(PLANES_LIMITES), true)) $plan = PLAN_FALLBACK;
        if (!$nombre || !$clave) respond(['success' => false, 'error' => 'Nombre y clave son obligatorios']);
        // El email es obligatorio: es con lo que se crea la cuenta admin de
        // este colegio — sin esto, nadie podría iniciar sesión en él nunca
        // (antes crear_escuela solo insertaba en `escuelas`, sin usuario).
        if (!$email) respond(['success' => false, 'error' => 'El correo es obligatorio: con él se crea la cuenta admin del colegio']);
        $chk = $pdo->prepare("SELECT id FROM escuelas WHERE clave = ?");
        $chk->execute([$clave]);
        if ($chk->fetch()) respond(['success' => false, 'error' => 'Ya existe un colegio con esa clave']);
        // Primer periodo de la suscripción: prorrateado, vence a fin del mes en
        // curso (a partir de ahí, cada renovación cubre un mes calendario completo).
        $fecha_vencimiento_plan = fin_de_mes_actual();
        $stmt = $pdo->prepare(
            "INSERT INTO escuelas (nombre, clave, rfc, rvoe, telefono, email, direccion, logo_emoji, activa, es_plantel, plan, fecha_alta, fecha_vencimiento_plan)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, CURDATE(), ?)"
        );
        $stmt->execute([$nombre, $clave, $rfc, $rvoe, $telefono, $email, $direccion, $logo_emoji, $plan, $fecha_vencimiento_plan]);
        $nuevo_id = intval($pdo->lastInsertId());
        registrar_log($pdo, $usuario_actual, 'escuela_creada', "Colegio '$nombre' ($clave)", $nuevo_id);
        respond(['success' => true, 'escuela' => [
            'id' => $nuevo_id, 'nombre' => $nombre, 'clave' => $clave, 'rfc' => $rfc, 'rvoe' => $rvoe,
            'telefono' => $telefono, 'email' => $email, 'direccion' => $direccion,
            'logo_emoji' => $logo_emoji, 'activa' => true, 'es_plantel' => false,
            'escuela_padre_id' => null, 'plan' => $plan, 'fecha_alta' => date('Y-m-d'),
            'fecha_vencimiento_plan' => $fecha_vencimiento_plan,
            'secciones_deshabilitadas' => [],
        ]]);
