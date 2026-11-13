<?php
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, ['superadmin', 'admin'], ['escolar_config', 'escolar_grupos']);
        $eid = $ctx['escuela_id'];
        $id     = intval($input['id'] ?? 0);
        $nombre = trim($input['nombre'] ?? '');
        $clave  = mb_substr(trim($input['clave'] ?? ''), 0, 30) ?: null;
        $nivel  = mb_substr(trim($input['nivel'] ?? ''), 0, 30) ?: null;
        $horas  = intval($input['horas_semana'] ?? 0) ?: null;
        $activo = array_key_exists('activo', $input) ? (!empty($input['activo']) ? 1 : 0) : 1;
        if ($nombre === '') respond(['success' => false, 'error' => 'El nombre de la materia es obligatorio.']);
        $nombre = mb_substr($nombre, 0, 120);
        if ($horas !== null && ($horas < 1 || $horas > 60)) respond(['success' => false, 'error' => 'Las horas por semana no son válidas.']);

        $dup = $pdo->prepare("SELECT id FROM materias WHERE escuela_id = ? AND nombre = ? AND COALESCE(nivel,'') = COALESCE(?,'') AND id <> ?");
        $dup->execute([$eid, $nombre, $nivel, $id]);
        if ($dup->fetchColumn()) respond(['success' => false, 'error' => 'Ya existe una materia con ese nombre para ese nivel.']);

        if ($id) {
            $st = $pdo->prepare("UPDATE materias SET nombre=?, clave=?, nivel=?, horas_semana=?, activo=? WHERE id=? AND escuela_id=?");
            $st->execute([$nombre, $clave, $nivel, $horas, $activo, $id, $eid]);
        } else {
            $st = $pdo->prepare("INSERT INTO materias (escuela_id, nombre, clave, nivel, horas_semana, activo) VALUES (?,?,?,?,?,?)");
            $st->execute([$eid, $nombre, $clave, $nivel, $horas, $activo]);
            $id = intval($pdo->lastInsertId());
        }
        registrar_log($pdo, $usuario_actual, 'escolar_materia_guardada', "Materia #{$id}: {$nombre}", $eid);
        respond(['success' => true, 'id' => $id]);
