<?php
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, ['superadmin', 'admin'], ['escolar_config', 'escolar_grupos']);
        $eid = $ctx['escuela_id'];
        $id        = intval($input['id'] ?? 0);
        $nombre    = trim($input['nombre'] ?? '');
        $capacidad = intval($input['capacidad'] ?? 0) ?: null;
        $ubicacion = mb_substr(trim($input['ubicacion'] ?? ''), 0, 150) ?: null;
        $activo    = array_key_exists('activo', $input) ? (!empty($input['activo']) ? 1 : 0) : 1;
        if ($nombre === '') respond(['success' => false, 'error' => 'El nombre del aula es obligatorio.']);
        $nombre = mb_substr($nombre, 0, 80);
        if ($capacidad !== null && ($capacidad < 1 || $capacidad > 2000)) respond(['success' => false, 'error' => 'La capacidad no es válida.']);

        if ($id) {
            $st = $pdo->prepare("UPDATE aulas SET nombre=?, capacidad=?, ubicacion=?, activo=? WHERE id=? AND escuela_id=?");
            $st->execute([$nombre, $capacidad, $ubicacion, $activo, $id, $eid]);
        } else {
            $st = $pdo->prepare("INSERT INTO aulas (escuela_id, nombre, capacidad, ubicacion, activo) VALUES (?,?,?,?,?)");
            $st->execute([$eid, $nombre, $capacidad, $ubicacion, $activo]);
            $id = intval($pdo->lastInsertId());
        }
        registrar_log($pdo, $usuario_actual, 'escolar_aula_guardada', "Aula #{$id}: {$nombre}", $eid);
        respond(['success' => true, 'id' => $id]);
