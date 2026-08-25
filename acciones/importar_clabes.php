<?php
        // Recibe: { escuela_id, clabes: ["646180...", "646180...", ...] }
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin', 'admin'], 'No tienes permiso para importar CLABEs.');
        $escuela_id = intval($input['escuela_id'] ?? 0);
        $clabes     = $input['clabes'] ?? [];
        if (!$escuela_id || empty($clabes)) {
            respond(['success' => false, 'error' => 'escuela_id y clabes[] son requeridos']);
        }
        // Verificar que la escuela existe
        $chk = $pdo->prepare("SELECT id FROM escuelas WHERE id = ?");
        $chk->execute([$escuela_id]);
        if (!$chk->fetch()) respond(['success' => false, 'error' => 'Escuela no encontrada']);
        $insertadas = 0;
        $duplicadas = 0;
        $stmt = $pdo->prepare(
            "INSERT IGNORE INTO clabe_pool (escuela_id, clabe, estado, fecha_alta)
             VALUES (?, ?, 'libre', CURDATE())"
        );
        foreach ($clabes as $clabe) {
            $clabe = preg_replace('/\s+/', '', trim($clabe)); // quitar espacios
            if (!preg_match('/^\d{18}$/', $clabe)) continue;  // validar 18 dígitos
            $stmt->execute([$escuela_id, $clabe]);
            if ($stmt->rowCount() > 0) $insertadas++;
            else $duplicadas++;
        }
        registrar_log($pdo, $usuario_actual, 'clabes_importadas', "$insertadas importadas, $duplicadas duplicadas ignoradas", $escuela_id);
        respond(['success' => true, 'insertadas' => $insertadas, 'duplicadas' => $duplicadas]);
