<?php
        // [F3] Promoción de fin de ciclo: sube de grado a los aprobados, deja
        // repitiendo a los reprobados, da de egreso a quien ya no tiene grado
        // siguiente y (si hay mapeo) los inscribe en sus grupos del ciclo nuevo.
        //
        // DOS PASOS OBLIGATORIOS. Mover a cientos de alumnos de grado no se
        // deshace con un clic, así que:
        //   1. dry_run = true  → NO escribe nada: devuelve el plan por alumno, el
        //      resumen y un 'token' (huella de ese plan).
        //   2. dry_run = false + token → aplica EXACTAMENTE ese plan. Si entre la vista
        //      previa y la aplicación algo cambió (alguien inscribió, se re-cerró el
        //      ciclo, se editó el catálogo…), el token ya no coincide y se pide
        //      volver a revisar. Sin token (o sin dry_run) no se aplica nada.
        //
        // Entradas:
        //   ciclo_origen, ciclo_destino  ids (el origen debe estar CERRADO: de ahí sale
        //                                el resultado de cada alumno).
        //   mapeo   {grupo_origen_id: grupo_destino_id} o [{origen, destino}] (opcional).
        //   excluir [cliente_id…]  no se mueven.   forzar [cliente_id…]  se promueven
        //                          aunque hayan reprobado o no tengan calificaciones.
        //
        // NUNCA crea alumnos: solo cambia clientes.grado_id/grado de los existentes e
        // inscribe en grupos (grupo_alumnos). Es seguro volver a correrla: quien ya
        // se procesó (historial_academico.promovido_a_ciclo_id) se salta.
        $ctx = escolar_ctx($pdo, $usuario_actual, $input, ESCOLAR_ROLES_GESTOR, ['escolar_config', 'escolar_grupos']);
        $eid = $ctx['escuela_id'];

        if (!array_key_exists('dry_run', $input)) {
            respond(['success' => false, 'error' => 'Primero haz una vista previa: manda dry_run = true, revisa el resultado y confirma después con su token.']);
        }
        $dry = !empty($input['dry_run']) && $input['dry_run'] !== 'false' && $input['dry_run'] !== '0';

        $origen  = escolar_ciclo($pdo, $eid, $input['ciclo_origen'] ?? 0);
        $destino = escolar_ciclo($pdo, $eid, $input['ciclo_destino'] ?? 0);
        if (intval($origen['id']) === intval($destino['id'])) respond(['success' => false, 'error' => 'El ciclo de origen y el destino no pueden ser el mismo.']);
        if (!escolar_ciclo_cerrado($origen)) respond(['success' => false, 'error' => "Cierra primero el ciclo {$origen['nombre']}: la promoción usa el resultado final de cada alumno."]);
        if (escolar_ciclo_cerrado($destino)) respond(['success' => false, 'error' => "El ciclo destino {$destino['nombre']} ya está cerrado."]);
        if ($destino['fecha_inicio'] <= $origen['fecha_inicio']) respond(['success' => false, 'error' => 'El ciclo destino debe empezar después del ciclo de origen.']);

        // Mapeo: acepta objeto {origen: destino} o lista de pares {origen, destino}.
        $mapeo = [];
        $rawMapeo = $input['mapeo'] ?? [];
        if (is_array($rawMapeo)) {
            foreach ($rawMapeo as $k => $v) {
                if (is_array($v)) { $go = intval($v['origen'] ?? $v['grupo_origen'] ?? 0); $gd = intval($v['destino'] ?? $v['grupo_destino'] ?? 0); }
                else { $go = intval($k); $gd = intval($v); }
                if ($go && $gd) $mapeo[$go] = $gd;
            }
        }
        $excluir = array_values(array_unique(array_filter(array_map('intval', (array) ($input['excluir'] ?? [])))));
        $forzar  = array_values(array_unique(array_filter(array_map('intval', (array) ($input['forzar'] ?? [])))));
        if (array_intersect($excluir, $forzar)) respond(['success' => false, 'error' => 'Un alumno no puede estar a la vez en "excluir" y en "forzar".']);

        // El plan valida que los grupos del mapeo sean de la escuela y de cada ciclo
        // y que los alumnos sean de la escuela (todo se consulta con escuela_id).
        $plan = escolar_plan_promocion($pdo, $eid, $origen, $destino, $mapeo, $excluir, $forzar);
        $infoCiclos = ['origen' => ['id' => intval($origen['id']), 'nombre' => $origen['nombre']], 'destino' => ['id' => intval($destino['id']), 'nombre' => $destino['nombre']]];

        if ($dry) {
            respond([
                'success' => true, 'dry_run' => true, 'ciclos' => $infoCiclos,
                'resumen' => $plan['resumen'], 'filas' => $plan['filas'], 'token' => $plan['token'],
                'egreso_automatico' => function_exists('alumno_cambiar_estatus'),
            ]);
        }

        $token = (string) ($input['token'] ?? '');
        if ($token === '' || !hash_equals($plan['token'], $token)) {
            respond(['success' => false, 'error' => 'La vista previa ya no coincide con la situación actual (o no se hizo). Vuelve a generar la vista previa, revísala y confirma.', 'requiere_vista_previa' => true]);
        }

        // Grupos destino (para inscribir) — ya validados por el plan.
        $gruposDestino = [];
        foreach ($mapeo as $go => $gd) $gruposDestino[$gd] = ['id' => $gd, 'ciclo_id' => intval($destino['id'])];

        $marca = $pdo->prepare(
            "UPDATE historial_academico SET promovido_a_ciclo_id = ?, promocion_accion = ?, promovido_en = NOW()
             WHERE cliente_id = ? AND ciclo_id = ? AND escuela_id = ? AND promovido_a_ciclo_id IS NULL"
        );
        $aplicados = ['promovido' => 0, 'repite' => 0, 'egresado' => 0];
        $errores = []; $sinExpediente = [];
        $movimientos = [];
        $gradosPorId = [];
        foreach (escolar_grados($pdo, $eid) as $g) $gradosPorId[$g['id']] = $g;

        foreach ($plan['filas'] as $f) {
            $cid = $f['cliente_id'];
            if (!in_array($f['accion'], ['promover', 'repetir', 'egresar'], true)) continue;
            try {
                if ($f['accion'] === 'egresar') {
                    // El egreso lo hace el expediente del alumno (F1): cambia su estatus,
                    // lo saca de los grupos y deja bitácora. Si esa fase aún no está
                    // instalada solo se reporta: el alumno queda SIN marcar para
                    // poder procesarlo cuando exista.
                    if (!function_exists('alumno_cambiar_estatus')) { $sinExpediente[] = $f['nombre']; continue; }
                    $res = alumno_cambiar_estatus($pdo, $cid, 'egresado', 'Egreso al cerrar ciclo', $usuario_actual, ['sacar_de_grupos' => true]);
                    if (empty($res['success'])) { $errores[] = ['cliente_id' => $cid, 'nombre' => $f['nombre'], 'error' => $res['error'] ?? 'No se pudo registrar el egreso.']; continue; }
                    $marca->execute([intval($destino['id']), 'egresado', $cid, intval($origen['id']), $eid]);
                    $aplicados['egresado']++;
                    continue;
                }

                $pdo->beginTransaction();
                try {
                    if ($f['accion'] === 'promover' && $f['grado_nuevo_id'] && isset($gradosPorId[$f['grado_nuevo_id']])) {
                        $mov = escolar_alinear_grado_alumno($pdo, $eid, $cid, $gradosPorId[$f['grado_nuevo_id']],
                            ['motivo' => 'Promoción', 'ciclo_origen_id' => intval($origen['id']), 'ciclo_destino_id' => intval($destino['id'])]);
                        if ($mov) $movimientos[] = $mov;
                    }
                    if ($f['grupo_destino_id'] && isset($gruposDestino[$f['grupo_destino_id']])) {
                        escolar_inscribir_en_grupo($pdo, $eid, $cid, $gruposDestino[$f['grupo_destino_id']]);
                        $movimientos[] = ['cliente_id' => $cid, 'tipo' => 'cambio_grupo', 'motivo' => 'Reinscripción en ' . $f['grupo_destino'],
                            'detalle' => ['grupo_id' => $f['grupo_destino_id'], 'grupo' => $f['grupo_destino'], 'ciclo_destino_id' => intval($destino['id'])]];
                    }
                    $accionHist = $f['accion'] === 'promover' ? 'promovido' : 'repite';
                    $marca->execute([intval($destino['id']), $accionHist, $cid, intval($origen['id']), $eid]);
                    $pdo->commit();
                    $aplicados[$accionHist]++;
                } catch (\Throwable $e) {
                    if ($pdo->inTransaction()) $pdo->rollBack();
                    throw $e;
                }
            } catch (\Throwable $e) {
                // Un alumno con problema no frena a los demás: se reporta y se sigue.
                log_api("escolar_promover: alumno #{$cid} -> " . $e->getMessage());
                $errores[] = ['cliente_id' => $cid, 'nombre' => $f['nombre'], 'error' => 'Error interno al procesar al alumno (quedó en el log).'];
            }
        }
        // Expediente (F1), ya fuera de cualquier transacción.
        escolar_registrar_movimientos($pdo, $eid, $movimientos, $ctx['user_id']);

        registrar_log($pdo, $usuario_actual, 'escolar_promocion',
            "Ciclo {$origen['nombre']} → {$destino['nombre']}: {$aplicados['promovido']} promovidos, {$aplicados['repite']} repiten, {$aplicados['egresado']} egresados, " . count($errores) . " con error", $eid);
        respond([
            'success'  => true, 'dry_run' => false, 'ciclos' => $infoCiclos,
            'resumen'  => $plan['resumen'],
            'aplicados' => $aplicados,
            'errores'  => $errores,
            'sin_expediente' => $sinExpediente,
            'aviso'    => $sinExpediente
                ? count($sinExpediente) . ' alumno(s) deberían egresar pero el expediente de alumnos aún no está instalado: su estatus no se cambió y siguen sin procesar.'
                : null,
        ]);
