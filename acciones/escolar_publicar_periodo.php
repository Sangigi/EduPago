<?php
        // [F3] Publica o despublica un periodo de evaluación. Mientras no esté
        // publicado, familias y alumnos NO ven sus calificaciones (ni en la boleta,
        // ni en el resumen de familia, ni en el kárdex); docentes y administración
        // sí. Así el colegio revisa y cierra el periodo antes de que las familias
        // lo vean. Se puede publicar aunque el periodo (o el ciclo) ya esté cerrado.
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, ESCOLAR_ROLES_GESTOR, ['escolar_config', 'escolar_calificaciones']);
        $eid = $ctx['escuela_id'];
        $pid = intval($input['periodo_id'] ?? 0);
        $publicado = !empty($input['publicado']) ? 1 : 0;

        $st = $pdo->prepare("SELECT id, nombre, publicado FROM periodos_evaluacion WHERE id = ? AND escuela_id = ?"); // [OF-7b] + publicado
        $st->execute([$pid, $eid]);
        $p = $st->fetch();
        if (!$p) respond(['success' => false, 'error' => 'Periodo no encontrado.']);

        $pdo->prepare("UPDATE periodos_evaluacion SET publicado = ? WHERE id = ? AND escuela_id = ?")->execute([$publicado, $pid, $eid]);
        // [OF-7b] Aviso push a familias y alumnos con calificaciones en ese periodo: solo al PASAR de oculto a
        // publicado (volver a publicar uno ya publicado no avisa otra vez). Solo ENCOLA (try/catch, nunca
        // lanza); el envío va DESPUÉS de responder, con texto genérico: sin calificaciones ni nombres.
        if ($publicado && empty($p['publicado'])) push_aviso_periodo($pdo, intval($eid), $pid);
        registrar_log($pdo, $usuario_actual, $publicado ? 'escolar_periodo_publicado' : 'escolar_periodo_despublicado', "Periodo #{$pid}: {$p['nombre']}", $eid);
        respond(['success' => true, 'periodo_id' => $pid, 'publicado' => (bool) $publicado]);
