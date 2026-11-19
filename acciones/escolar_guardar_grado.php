<?php
        // [F3] Alta/edición de un grado del catálogo de la escuela (niveles_grados):
        // "3° Primaria", su orden y a qué grado se promueve (siguiente_id).
        // Solo la coordinación/administración. Para el catálogo estándar de la SEP
        // completo usar escolar_cargar_catalogo_grados.
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, ESCOLAR_ROLES_GESTOR, ['escolar_config', 'escolar_grupos']);
        $eid = $ctx['escuela_id'];

        $id    = intval($input['id'] ?? 0);
        $nivel = mb_substr(trim((string) ($input['nivel'] ?? '')), 0, 30);
        $grado = mb_substr(trim((string) ($input['grado'] ?? '')), 0, 20);
        if ($nivel === '') respond(['success' => false, 'error' => 'Escribe el nivel (Preescolar, Primaria, Secundaria…).']);
        if ($grado === '') respond(['success' => false, 'error' => 'Escribe el grado (1, 2, 3…).']);
        $nombre = mb_substr(trim((string) ($input['nombre_corto'] ?? '')), 0, 40);
        if ($nombre === '') $nombre = mb_substr(escolar_nombre_grado($nivel, $grado), 0, 40);

        // Al editar se carga la fila ya filtrada por escuela (si el id es de otro
        // colegio responde "no existe", no "no tienes permiso": no se confirma
        // que ese id exista en otro lado).
        $actual = $id ? escolar_grado($pdo, $eid, $id) : null;

        // Un mismo nivel+grado no se repite en la escuela (lo respalda el UNIQUE
        // de la tabla, pero así el mensaje sale claro y no como error de SQL).
        $dup = $pdo->prepare("SELECT id FROM niveles_grados WHERE escuela_id = ? AND nivel = ? AND grado = ? AND id <> ?");
        $dup->execute([$eid, $nivel, $grado, $id]);
        if ($dup->fetchColumn()) respond(['success' => false, 'error' => "Ya existe el grado {$grado} de {$nivel} en el catálogo."]);

        // Orden: si no lo mandan, un grado nuevo va al final; uno existente conserva el suyo.
        if (array_key_exists('orden', $input) && $input['orden'] !== '' && $input['orden'] !== null) {
            $orden = max(0, min(65000, intval($input['orden'])));
        } elseif ($actual) {
            $orden = intval($actual['orden']);
        } else {
            $mx = $pdo->prepare("SELECT COALESCE(MAX(orden), 0) FROM niveles_grados WHERE escuela_id = ?");
            $mx->execute([$eid]);
            $orden = intval($mx->fetchColumn()) + 1;
        }

        // siguiente_id: otro grado DE ESTA ESCUELA, sin ciclos (A→B→A dejaría a
        // la promoción dando vueltas). Sin la clave en la petición se conserva.
        $trae_sig = array_key_exists('siguiente_id', $input);
        $siguiente = $actual ? $actual['siguiente_id'] : null;
        if ($trae_sig) {
            $siguiente = intval($input['siguiente_id'] ?? 0) ?: null;
            if ($siguiente) {
                escolar_grado($pdo, $eid, $siguiente);
                if ($id && $siguiente === $id) respond(['success' => false, 'error' => 'Un grado no puede ser su propio siguiente.']);
                if ($id) {
                    $cadena = $pdo->prepare("SELECT id, siguiente_id FROM niveles_grados WHERE escuela_id = ?");
                    $cadena->execute([$eid]);
                    $sigDe = [];
                    foreach ($cadena->fetchAll() as $r) $sigDe[intval($r['id'])] = $r['siguiente_id'] !== null ? intval($r['siguiente_id']) : null;
                    $n = $siguiente; $vueltas = 0;
                    while ($n && $vueltas++ < 100) {
                        if ($n === $id) respond(['success' => false, 'error' => 'Ese siguiente grado crea un ciclo (su cadena de grados regresa a este).']);
                        $n = $sigDe[$n] ?? null;
                    }
                }
            }
        }
        $activo = array_key_exists('activo', $input) ? (!empty($input['activo']) ? 1 : 0) : ($actual ? ($actual['activo'] ? 1 : 0) : 1);

        if ($id) {
            $pdo->prepare("UPDATE niveles_grados SET nivel=?, grado=?, nombre_corto=?, orden=?, siguiente_id=?, activo=? WHERE id=? AND escuela_id=?")
                ->execute([$nivel, $grado, $nombre, $orden, $siguiente, $activo, $id, $eid]);
            // El texto clientes.grado NO se reescribe aquí: es lo que capturó el
            // colegio. Si renombra el grado, el nombre nuevo se verá en el catálogo,
            // los grupos y el kárdex; la ficha de Alumnos se actualiza al promover.
        } else {
            $pdo->prepare("INSERT INTO niveles_grados (escuela_id, nivel, grado, nombre_corto, orden, siguiente_id, activo) VALUES (?,?,?,?,?,?,?)")
                ->execute([$eid, $nivel, $grado, $nombre, $orden, $siguiente, $activo]);
            $id = intval($pdo->lastInsertId());
        }
        registrar_log($pdo, $usuario_actual, 'escolar_grado_guardado', "Grado #{$id}: {$nombre}", $eid);
        respond(['success' => true, 'id' => $id, 'grado' => escolar_grado($pdo, $eid, $id)]);
