<?php
        // [F3] Carga el catálogo estándar de la SEP en la escuela: Preescolar 1-3,
        // Primaria 1-6, Secundaria 1-3 y Preparatoria 1-3, encadenados por
        // siguiente_id (Preescolar 3 → Primaria 1, Primaria 6 → Secundaria 1,
        // Secundaria 3 → Preparatoria 1; Preparatoria 3 no tiene siguiente: egresa).
        //
        // IDEMPOTENTE: se puede correr cuantas veces se quiera. No duplica grados
        // (UNIQUE escuela+nivel+grado) y no pisa lo que el colegio ya personalizó:
        // a los grados que ya existían solo se les completa el siguiente_id si lo
        // tenían vacío. Un colegio que solo tiene primaria y quiere el resto, o que
        // renombró "1° Primaria", conserva sus cambios.
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, ESCOLAR_ROLES_GESTOR, ['escolar_config', 'escolar_grupos']);
        $eid = $ctx['escuela_id'];

        $ya = $pdo->prepare("SELECT nivel, grado, id FROM niveles_grados WHERE escuela_id = ?");
        $ya->execute([$eid]);
        $existentes = [];
        foreach ($ya->fetchAll() as $r) $existentes[$r['nivel'] . '|' . $r['grado']] = intval($r['id']);

        $creados = 0; $encadenados = 0;
        $pdo->beginTransaction();
        try {
            $ins = $pdo->prepare("INSERT INTO niveles_grados (escuela_id, nivel, grado, nombre_corto, orden, activo) VALUES (?,?,?,?,?,1)");
            $ids = [];      // posición en la lista estándar => id
            $pos = 0;
            // Si la escuela ya tenía grados propios, los nuevos van DESPUÉS de ellos.
            $mx = $pdo->prepare("SELECT COALESCE(MAX(orden), 0) FROM niveles_grados WHERE escuela_id = ?");
            $mx->execute([$eid]);
            $base = intval($mx->fetchColumn());
            foreach (ESCOLAR_CATALOGO_ESTANDAR as $nivel => $cuantos) {
                for ($g = 1; $g <= $cuantos; $g++) {
                    $pos++;
                    $k = $nivel . '|' . $g;
                    if (isset($existentes[$k])) {
                        $ids[$pos] = $existentes[$k];
                        continue;
                    }
                    $ins->execute([$eid, $nivel, (string) $g, escolar_nombre_grado($nivel, $g), $base + $pos]);
                    $ids[$pos] = intval($pdo->lastInsertId());
                    $creados++;
                }
            }
            // Encadenar cada grado con el siguiente de la lista (el último no tiene).
            $sig = $pdo->prepare("UPDATE niveles_grados SET siguiente_id = ? WHERE id = ? AND escuela_id = ? AND siguiente_id IS NULL");
            for ($i = 1; $i < $pos; $i++) {
                $sig->execute([$ids[$i + 1], $ids[$i], $eid]);
                $encadenados += $sig->rowCount();
            }
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
        registrar_log($pdo, $usuario_actual, 'escolar_catalogo_grados_cargado', "{$creados} grado(s) creados, {$encadenados} enlace(s) de siguiente", $eid);
        respond(['success' => true, 'creados' => $creados, 'encadenados' => $encadenados, 'grados' => escolar_grados($pdo, $eid)]);
