<?php
        // Endpoint ligero para cambiar SOLO el plan (usado desde el <select>
        // inline en Suscripciones.js) — no exige nombre/clave como editar_escuela.
        requerir_rol($usuario_actual['rol'] ?? '', ['superadmin'], 'Solo el super admin puede cambiar el plan de un colegio.');
        $id   = intval($input['id'] ?? 0);
        $plan = trim($input['plan'] ?? '');
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        if (!in_array($plan, array_keys(PLANES_LIMITES), true)) {
            respond(['success' => false, 'error' => 'Plan inválido']);
        }
        $chk = $pdo->prepare("SELECT nombre, plan FROM escuelas WHERE id = ?");
        $chk->execute([$id]);
        $esc = $chk->fetch();
        if (!$esc) respond(['success' => false, 'error' => 'Colegio no encontrado']);
        $pdo->prepare("UPDATE escuelas SET plan = ? WHERE id = ?")->execute([$plan, $id]);
        registrar_log($pdo, $usuario_actual, 'escuela_plan_cambiado', "Colegio '{$esc['nombre']}' #$id: plan {$esc['plan']} → $plan", $id);
        respond(['success' => true, 'id' => $id, 'plan' => $plan]);
