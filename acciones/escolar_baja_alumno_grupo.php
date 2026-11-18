<?php
        // Baja lógica de un alumno de un grupo (se conserva su historial).
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, ESCOLAR_ROLES_GESTOR, ['escolar_grupos']);
        $g = escolar_grupo($pdo, $ctx, $input['grupo_id'] ?? 0);
        $cid = intval($input['cliente_id'] ?? 0);
        $st = $pdo->prepare("UPDATE grupo_alumnos SET activo = 0, fecha_baja = CURDATE() WHERE grupo_id = ? AND cliente_id = ? AND activo = 1");
        $st->execute([intval($g['id']), $cid]);
        if (!$st->rowCount()) respond(['success' => false, 'error' => 'El alumno no está inscrito en este grupo.']);
        registrar_log($pdo, $usuario_actual, 'escolar_baja_grupo', "Alumno #{$cid} sale del grupo #{$g['id']} ({$g['nombre']})", $ctx['escuela_id']);
        respond(['success' => true]);
