<?php
        // Asigna una materia a un grupo (y su docente), o cambia el docente de
        // una asignación existente. Con 'quitar' => true elimina la asignación,
        // solo si todavía no tiene calificaciones capturadas.
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, ESCOLAR_ROLES_GESTOR, ['escolar_grupos']);
        $eid = $ctx['escuela_id'];

        if (!empty($input['quitar'])) {
            $gm = escolar_gm($pdo, $ctx, $input['id'] ?? 0);
            $c = $pdo->prepare("SELECT COUNT(*) FROM calificaciones WHERE grupo_materia_id = ?");
            $c->execute([$gm['id']]);
            if (intval($c->fetchColumn()) > 0) {
                respond(['success' => false, 'error' => 'Esta materia ya tiene calificaciones en el grupo; no se puede quitar.']);
            }
            $pdo->prepare("DELETE FROM horarios WHERE grupo_materia_id = ?")->execute([$gm['id']]);
            $pdo->prepare("DELETE FROM grupo_materias WHERE id = ?")->execute([$gm['id']]);
            registrar_log($pdo, $usuario_actual, 'escolar_materia_quitada', "{$gm['materia']} del grupo {$gm['grupo']}", $eid);
            respond(['success' => true]);
        }

        $g = escolar_grupo($pdo, $ctx, $input['grupo_id'] ?? 0);
        $materia_id = intval($input['materia_id'] ?? 0);
        $chk = $pdo->prepare("SELECT nombre FROM materias WHERE id = ? AND escuela_id = ?");
        $chk->execute([$materia_id, $eid]);
        $materia = $chk->fetchColumn();
        if (!$materia) respond(['success' => false, 'error' => 'Materia no encontrada.']);
        $docente_id = escolar_validar_docente($pdo, $eid, $input['docente_id'] ?? 0);

        $st = $pdo->prepare(
            "INSERT INTO grupo_materias (escuela_id, grupo_id, materia_id, docente_id) VALUES (?,?,?,?)
             ON DUPLICATE KEY UPDATE docente_id = VALUES(docente_id)"
        );
        $st->execute([$eid, intval($g['id']), $materia_id, $docente_id]);
        registrar_log($pdo, $usuario_actual, 'escolar_materia_asignada', "{$materia} → grupo {$g['nombre']}" . ($docente_id ? " (docente #{$docente_id})" : ''), $eid);
        respond(['success' => true]);
