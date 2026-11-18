<?php
        // Buscador de alumnos para inscribir a un grupo. No se reusa
        // data.clientes del frontend porque cargar_datos lo pagina (25 por
        // página): aquí se busca en toda la escuela y se dice en qué grupo del
        // ciclo está ya cada alumno, para no inscribirlo dos veces sin querer.
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, ESCOLAR_ROLES_GESTOR, ['escolar_grupos']);
        $eid = $ctx['escuela_id'];
        $ciclo_id  = intval($input['ciclo_id'] ?? 0);
        $q         = trim($input['q'] ?? '');
        $sin_grupo = !empty($input['sin_grupo']);
        $grado     = trim($input['grado'] ?? '');

        $where = "c.escuela_id = ? AND c.activo = 1 AND COALESCE(c.tipo,'alumno') = 'alumno'";
        $params = [$eid];
        if ($q !== '') {
            $where .= " AND (c.nombre LIKE ? OR c.matricula LIKE ? OR c.curp LIKE ?)";
            $like = '%' . $q . '%';
            array_push($params, $like, $like, $like);
        }
        if ($grado !== '') { $where .= " AND c.grado LIKE ?"; $params[] = '%' . $grado . '%'; }

        $sql = "SELECT c.id, c.nombre, c.matricula, c.grado, c.foto_url,
                       (SELECT g.nombre FROM grupo_alumnos ga JOIN grupos g ON g.id = ga.grupo_id
                        WHERE ga.cliente_id = c.id AND ga.activo = 1 AND g.ciclo_id = ? LIMIT 1) AS grupo_actual,
                       (SELECT g.id FROM grupo_alumnos ga JOIN grupos g ON g.id = ga.grupo_id
                        WHERE ga.cliente_id = c.id AND ga.activo = 1 AND g.ciclo_id = ? LIMIT 1) AS grupo_actual_id
                FROM clientes c WHERE $where";
        $params = array_merge([$ciclo_id, $ciclo_id], $params);
        if ($sin_grupo) $sql = "SELECT * FROM ($sql) t WHERE t.grupo_actual_id IS NULL";
        $sql .= " ORDER BY nombre LIMIT 200";
        $st = $pdo->prepare($sql);
        $st->execute($params);
        $alumnos = array_map(function ($a) {
            $a['id'] = intval($a['id']);
            $a['grupo_actual_id'] = $a['grupo_actual_id'] !== null ? intval($a['grupo_actual_id']) : null;
            return $a;
        }, $st->fetchAll());
        respond(['success' => true, 'alumnos' => $alumnos]);
