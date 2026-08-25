<?php
        $cobro_id = intval($input['cobro_id'] ?? 0);
        if (!$cobro_id) respond(['success' => false, 'error' => 'cobro_id requerido']);
        // El cobro debe pertenecer a la escuela del usuario (o cualquiera si superadmin)
        $chk = $pdo->prepare("SELECT co.escuela_id, COALESCE(cl.nombre,'Cliente general') AS cliente FROM cobros co LEFT JOIN clientes cl ON cl.id = co.cliente_id WHERE co.id = ?");
        $chk->execute([$cobro_id]);
        $cobro = $chk->fetch();
        if (!$cobro) respond(['success' => false, 'error' => 'Cobro no encontrado']);
        requerir_escuela_propia($usuario_actual['rol'], $cobro['escuela_id'], $usuario_actual, 'No tienes permiso sobre este cobro.');
        $hoy = date('Y-m-d');
        // Idempotente: un recordatorio por cobro por día (uq_recordatorio_dia)
        try {
            $stmt = $pdo->prepare(
                "INSERT INTO recordatorios (escuela_id, cobro_id, cliente, fecha, canal, usuario_id)
                 VALUES (?, ?, ?, ?, 'manual', ?)
                 ON DUPLICATE KEY UPDATE canal = canal"
            );
            $stmt->execute([$cobro['escuela_id'], $cobro_id, $cobro['cliente'], $hoy, $usuario_actual['user_id'] ?? null]);
        } catch (\PDOException $e) {
            file_put_contents(__DIR__ . '/api_log.txt', date('Y-m-d H:i:s') . " | marcar_recordatorio error (¿falta migrar tabla?): " . $e->getMessage() . "\n", FILE_APPEND);
            respond(['success' => false, 'error' => 'No se pudo guardar el recordatorio. Contacta al administrador (falta migración de BD).']);
        }
        respond(['success' => true]);
