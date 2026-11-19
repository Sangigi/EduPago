<?php
        // Cierra (o reabre) un periodo de evaluación. Cerrado = los docentes
        // ya no pueden modificar calificaciones de ese periodo; la
        // administración sí, para corregir errores después de la entrega de
        // boletas.
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, ESCOLAR_ROLES_GESTOR, ['escolar_config', 'escolar_calificaciones']);
        $pid = intval($input['periodo_id'] ?? 0);
        $cerrado = !empty($input['cerrado']) ? 1 : 0;
        // [F3] Con el ciclo cerrado el periodo no se mueve (el historial ya se calculó).
        $cic = $pdo->prepare("SELECT c.* FROM periodos_evaluacion p JOIN ciclos_escolares c ON c.id = p.ciclo_id WHERE p.id = ? AND p.escuela_id = ? AND c.escuela_id = ?");
        $cic->execute([$pid, $ctx['escuela_id'], $ctx['escuela_id']]);
        $cicloDelPeriodo = $cic->fetch();
        if ($cicloDelPeriodo) escolar_requerir_ciclo_abierto($cicloDelPeriodo, 'cerrar ni reabrir periodos');
        $st = $pdo->prepare("UPDATE periodos_evaluacion SET cerrado = ? WHERE id = ? AND escuela_id = ?");
        $st->execute([$cerrado, $pid, $ctx['escuela_id']]);
        if (!$st->rowCount()) {
            $chk = $pdo->prepare("SELECT 1 FROM periodos_evaluacion WHERE id = ? AND escuela_id = ?");
            $chk->execute([$pid, $ctx['escuela_id']]);
            if (!$chk->fetchColumn()) respond(['success' => false, 'error' => 'Periodo no encontrado.']);
        }
        registrar_log($pdo, $usuario_actual, $cerrado ? 'escolar_periodo_cerrado' : 'escolar_periodo_reabierto', "Periodo #{$pid}", $ctx['escuela_id']);
        respond(['success' => true, 'cerrado' => (bool) $cerrado]);
