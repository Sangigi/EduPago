<?php
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, ['superadmin', 'admin'], ['escolar_grupos']);
        $eid = $ctx['escuela_id'];
        $id       = intval($input['id'] ?? 0);
        $ciclo_id = intval($input['ciclo_id'] ?? 0);
        $nombre   = trim($input['nombre'] ?? '');
        $nivel    = mb_substr(trim($input['nivel'] ?? ''), 0, 30) ?: null;
        $grado    = mb_substr(trim($input['grado'] ?? ''), 0, 20) ?: null;
        $turno    = mb_substr(trim($input['turno'] ?? ''), 0, 20) ?: null;
        $cupo     = intval($input['cupo'] ?? 0) ?: null;
        $activo   = array_key_exists('activo', $input) ? (!empty($input['activo']) ? 1 : 0) : 1;
        if ($nombre === '') respond(['success' => false, 'error' => 'El nombre del grupo es obligatorio (ej. 3° A).']);
        $nombre = mb_substr($nombre, 0, 60);
        escolar_ciclo($pdo, $eid, $ciclo_id);

        $aula_id = intval($input['aula_id'] ?? 0) ?: null;
        if ($aula_id) {
            $chk = $pdo->prepare("SELECT 1 FROM aulas WHERE id = ? AND escuela_id = ?");
            $chk->execute([$aula_id, $eid]);
            if (!$chk->fetchColumn()) respond(['success' => false, 'error' => 'El aula elegida no existe.']);
        }
        $tutor_id = escolar_validar_docente($pdo, $eid, $input['tutor_id'] ?? 0, 'tutor');

        $dup = $pdo->prepare("SELECT id FROM grupos WHERE escuela_id = ? AND ciclo_id = ? AND nombre = ? AND COALESCE(nivel,'') = COALESCE(?,'') AND id <> ?");
        $dup->execute([$eid, $ciclo_id, $nombre, $nivel, $id]);
        if ($dup->fetchColumn()) respond(['success' => false, 'error' => 'Ya existe un grupo con ese nombre y nivel en este ciclo.']);

        if ($id) {
            escolar_grupo($pdo, $ctx, $id);
            $st = $pdo->prepare("UPDATE grupos SET ciclo_id=?, nombre=?, nivel=?, grado=?, turno=?, aula_id=?, tutor_id=?, cupo=?, activo=? WHERE id=? AND escuela_id=?");
            $st->execute([$ciclo_id, $nombre, $nivel, $grado, $turno, $aula_id, $tutor_id, $cupo, $activo, $id, $eid]);
        } else {
            $st = $pdo->prepare("INSERT INTO grupos (escuela_id, ciclo_id, nombre, nivel, grado, turno, aula_id, tutor_id, cupo, activo) VALUES (?,?,?,?,?,?,?,?,?,?)");
            $st->execute([$eid, $ciclo_id, $nombre, $nivel, $grado, $turno, $aula_id, $tutor_id, $cupo, $activo]);
            $id = intval($pdo->lastInsertId());

            // Copiar materias de otro grupo (típico: 3°B lleva lo mismo que 3°A).
            $copiar_de = intval($input['copiar_materias_de'] ?? 0);
            if ($copiar_de) {
                $src = $pdo->prepare("SELECT materia_id FROM grupo_materias WHERE grupo_id = ? AND escuela_id = ?");
                $src->execute([$copiar_de, $eid]);
                $ins = $pdo->prepare("INSERT IGNORE INTO grupo_materias (escuela_id, grupo_id, materia_id) VALUES (?,?,?)");
                foreach ($src->fetchAll(PDO::FETCH_COLUMN) as $mid) $ins->execute([$eid, $id, $mid]);
            }
        }
        registrar_log($pdo, $usuario_actual, 'escolar_grupo_guardado', "Grupo #{$id}: {$nombre}", $eid);
        respond(['success' => true, 'id' => $id]);
