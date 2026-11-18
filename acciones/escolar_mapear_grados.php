<?php
        // [F3] Asistente para ligar el texto libre clientes.grado ("3er Primaria",
        // "3° prim"…) con el catálogo (clientes.grado_id).
        //
        //   modo = 'vista_previa' (default): NO escribe nada. Devuelve cada alumno
        //          activo con su texto, el grado que se le sugiere y la confianza
        //          ('alta' | 'baja'), más los textos distintos con su sugerencia.
        //   modo = 'aplicar': recibe pares [{cliente_id, grado_id}] (o un objeto
        //          {cliente_id: grado_id}) y los guarda. Valida que cada alumno Y cada
        //          grado sean de la escuela; si uno no lo es, no se guarda NADA.
        //
        // El texto clientes.grado no se reescribe: el alumno no cambia de grado,
        // solo se enlaza con el catálogo.
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, ESCOLAR_ROLES_GESTOR, ['escolar_config', 'escolar_grupos']);
        $eid = $ctx['escuela_id'];
        $modo = (string) ($input['modo'] ?? 'vista_previa');
        if (!in_array($modo, ['vista_previa', 'aplicar'], true)) respond(['success' => false, 'error' => "Modo no válido: usa 'vista_previa' o 'aplicar'."]);

        $grados = escolar_grados($pdo, $eid);
        if (!$grados) respond(['success' => false, 'error' => 'Primero carga el catálogo de grados del colegio.']);

        if ($modo === 'vista_previa') {
            // Por defecto solo los que aún no tienen grado del catálogo.
            $incluirMapeados = !empty($input['incluir_mapeados']);
            $prep = escolar_preparar_catalogo_sugerencias($grados);
            $nombres = [];
            foreach ($grados as $g) $nombres[$g['id']] = $g['nombre_corto'];

            $st = $pdo->prepare(
                "SELECT id, nombre, matricula, grado, grado_id FROM clientes
                 WHERE escuela_id = ? AND activo = 1 AND COALESCE(tipo,'alumno') = 'alumno'" . ($incluirMapeados ? "" : " AND grado_id IS NULL") . "
                 ORDER BY grado, nombre LIMIT 5000"
            );
            $st->execute([$eid]);
            $alumnos = []; $textos = []; $conSugerencia = 0;
            foreach ($st->fetchAll() as $a) {
                $texto = trim((string) $a['grado']);
                $sug = $texto !== '' ? escolar_sugerir_grado($texto, $prep) : null;
                if ($sug) $conSugerencia++;
                $alumnos[] = [
                    'cliente_id'  => intval($a['id']),
                    'nombre'      => $a['nombre'],
                    'matricula'   => $a['matricula'],
                    'grado_texto' => $texto,
                    'grado_id'    => $a['grado_id'] !== null ? intval($a['grado_id']) : null,
                    'sugerido_id' => $sug ? $sug['grado_id'] : null,
                    'sugerido'    => $sug ? $nombres[$sug['grado_id']] : null,
                    'confianza'   => $sug ? $sug['confianza'] : null,
                ];
                $k = mb_strtolower($texto, 'UTF-8');
                if (!isset($textos[$k])) {
                    $textos[$k] = ['texto' => $texto, 'alumnos' => 0, 'sugerido_id' => $sug ? $sug['grado_id'] : null,
                                   'sugerido' => $sug ? $nombres[$sug['grado_id']] : null, 'confianza' => $sug ? $sug['confianza'] : null];
                }
                $textos[$k]['alumnos']++;
            }
            respond([
                'success'        => true,
                'modo'           => 'vista_previa',
                'total'          => count($alumnos),
                'con_sugerencia' => $conSugerencia,
                'sin_sugerencia' => count($alumnos) - $conSugerencia,
                'textos'         => array_values($textos),
                'alumnos'        => $alumnos,
                'grados'         => $grados,
            ]);
        }

        // ── aplicar ──
        $pares = [];
        $raw = $input['pares'] ?? $input['mapeo'] ?? [];
        if (!is_array($raw)) respond(['success' => false, 'error' => 'No hay asignaciones que aplicar.']);
        foreach ($raw as $k => $v) {
            if (is_array($v)) { $cid = intval($v['cliente_id'] ?? 0); $gid = intval($v['grado_id'] ?? 0); }
            else { $cid = intval($k); $gid = intval($v); }
            if (!$cid || !$gid) continue;
            $pares[$cid] = $gid; // si un alumno viene dos veces, gana el último
        }
        if (!$pares) respond(['success' => false, 'error' => 'No hay asignaciones que aplicar.']);
        if (count($pares) > 5000) respond(['success' => false, 'error' => 'Máximo 5000 alumnos por operación.']);

        $porId = [];
        foreach ($grados as $g) $porId[$g['id']] = $g;
        foreach ($pares as $cid => $gid) {
            if (!isset($porId[$gid])) respond(['success' => false, 'error' => 'Uno de los grados elegidos no existe en el catálogo de este colegio. No se guardó nada.']);
        }

        // Alumnos de ESTA escuela (por lotes, para no armar un IN gigantesco).
        $validos = [];
        foreach (array_chunk(array_keys($pares), 500) as $lote) {
            $in = implode(',', array_fill(0, count($lote), '?'));
            $st = $pdo->prepare("SELECT id FROM clientes WHERE escuela_id = ? AND id IN ($in)");
            $st->execute(array_merge([$eid], $lote));
            foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $v) $validos[intval($v)] = true;
        }
        if (count($validos) !== count($pares)) {
            respond(['success' => false, 'error' => 'Uno o más alumnos no pertenecen a este colegio. No se guardó nada.']);
        }

        $aplicados = 0;
        $pdo->beginTransaction();
        try {
            foreach ($pares as $cid => $gid) {
                if (escolar_asignar_grado_alumno($pdo, $eid, $cid, $porId[$gid], false)) $aplicados++;
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
        registrar_log($pdo, $usuario_actual, 'escolar_grados_mapeados', "{$aplicados} alumno(s) ligados al catálogo de grados", $eid);
        respond(['success' => true, 'modo' => 'aplicar', 'aplicados' => $aplicados, 'sin_cambio' => count($pares) - $aplicados]);
