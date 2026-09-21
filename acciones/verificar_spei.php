<?php
        $referencia = strtoupper(trim($input['referencia'] ?? ''));
        $cobro_id   = intval($input['cobro_id'] ?? 0);
        if (!$referencia && !$cobro_id) respond(['success' => false, 'error' => 'Referencia o cobro_id requerido']);
        // ── Fuente de verdad: cobros.estado ─────────────────────────────
        // pago_clabe.php (el servicio real que llama Cobroscontarjeta.com al
        // confirmar un SPEI) marca directamente cobros.estado='pagado'. Antes
        // este endpoint SOLO revisaba pagos_spei.json (usado nada más por el
        // botón de "Simular pago" de pruebas), así que un pago SPEI real
        // nunca se reflejaba en pantalla aunque sí se hubiera cobrado.
        // monto_pagado (21-sep-2026): desde que existen los abonos, un cobro
        // puede estar parcialmente cubierto. Sin este dato, la pantalla de
        // Caja solo sabía "pagado / no pagado" y se quedaba en "Esperando
        // transferencia…" aunque ya hubiera entrado un abono.
        if ($cobro_id) {
            $stmt = $pdo->prepare("SELECT id, estado, total, monto_pagado, auth_code, escuela_id, cliente_id FROM cobros WHERE id = ?");
            $stmt->execute([$cobro_id]);
        } else {
            $stmt = $pdo->prepare("SELECT id, estado, total, monto_pagado, auth_code, escuela_id, cliente_id FROM cobros WHERE referencia = ? ORDER BY id DESC LIMIT 1");
            $stmt->execute([$referencia]);
        }
        $cobro = $stmt->fetch();
        // Pertenencia: antes esta acción era pública (sin token) y no
        // validaba nada, permitiendo enumerar cobro_id de cualquier escuela.
        if ($cobro) {
            $rolSpei = $usuario_actual['rol'] ?? '';
            requerir_escuela_propia($rolSpei, $cobro['escuela_id'], $usuario_actual, 'No tienes permiso sobre este cobro.');
            if ($rolSpei === 'familia') {
                $stmtFamSpei = $pdo->prepare("SELECT familia_id FROM clientes WHERE id = ?");
                $stmtFamSpei->execute([$cobro['cliente_id']]);
                $famSpei = $stmtFamSpei->fetch();
                requerir_familia_propia($famSpei ? $famSpei['familia_id'] : null, $usuario_actual, 'No tienes permiso sobre este cobro.');
            }
        }
        if ($cobro && $cobro['estado'] === 'pagado') {
            respond([
                'success'      => true,
                'pagado'       => true,
                'monto_pesos'  => $cobro['total'],
                'autorizacion' => $cobro['auth_code'],
            ]);
        }
        // Abono parcial: el cobro sigue pendiente pero ya entró dinero. Se
        // reporta para que Caja muestre el avance en vez de quedarse
        // "esperando" sin señal de que algo pasó.
        if ($cobro && floatval($cobro['monto_pagado'] ?? 0) > 0.004) {
            respond([
                'success'     => true,
                'pagado'      => false,
                'abonado'     => floatval($cobro['monto_pagado']),
                'falta'       => round(floatval($cobro['total']) - floatval($cobro['monto_pagado']), 2),
                'monto_pesos' => $cobro['total'],
            ]);
        }
        // ── Fallback: pagos_spei.json (solo para el botón "Simular pago SPEI") ──
        // IMPORTANTE: solo se usa cuando NO se mandó cobro_id. `referencia` es la
        // matrícula del alumno — NO es única por cobro (un alumno puede tener
        // varios cobros con la misma referencia). Si se permite este fallback
        // también en el path por cobro_id, un pago simulado (o cualquier otro
        // cobro ya pagado que comparta la misma matrícula) confirma por error
        // OTRO cobro pendiente distinto del que se está verificando — nunca se
        // pagó, pero el sistema lo marcaba como pagado igual. Por eso este
        // fallback queda restringido exclusivamente al path sin cobro_id.
        if (!$cobro_id && $cobro && $cobro['estado'] === 'pendiente') {
            $archivo = __DIR__ . '/pagos_spei.json';
            $pagos   = file_exists($archivo) ? (json_decode(file_get_contents($archivo), true) ?? []) : [];
            $pago    = $pagos[strtoupper($referencia)] ?? null;
            if ($pago && !empty($pago['pagado'])) {
                respond([
                    'success'       => true,
                    'pagado'        => true,
                    'monto_pesos'   => $pago['monto_pesos'] ?? $cobro['total'],
                    'clave_rastreo' => $pago['clave_rastreo'] ?? null,
                    'autorizacion'  => $pago['autorizacion']  ?? null,
                ]);
            }
        }
        respond(['success' => true, 'pagado' => false]);
