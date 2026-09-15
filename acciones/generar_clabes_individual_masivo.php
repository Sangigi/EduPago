<?php
        // Genera una CLABE SPEI real vía Pagadetodo (GenerarClabeIndi) para
        // TODOS los alumnos activos de la escuela que aún no tengan una —
        // reemplaza a asignar_clabe_pool_masivo.php (pool manual) ahora que
        // el alta individual (acciones/generar_clabe_individual.php) ya
        // conecta con el generador real de la pasarela. Mismo blindaje de
        // rol/escuela/demo que ese archivo y que asignar_clabe_pool_masivo.php.
        //
        // A diferencia del pool (una simple UPDATE por alumno), aquí cada
        // alumno implica una llamada HTTP real al proveedor -- no se hace
        // dentro de una transacción de BD larga (no tiene sentido tener un
        // FOR UPDATE con una llamada de red en medio) y si el proveedor
        // tarda o falla a la mitad, lo ya generado queda guardado y solo se
        // reporta cuántos faltaron.
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin', 'admin'], 'No tienes permiso para generar CLABEs.');
        $escuela_id = intval($input['escuela_id'] ?? 0);
        if ($rol_actual === 'admin') $escuela_id = intval($usuario_actual['escuela_id'] ?? 0);
        if (!$escuela_id) respond(['success' => false, 'error' => 'escuela_id requerido']);
        requerir_seccion_habilitada($pdo, $rol_actual, $escuela_id, ['alumnos']);
        // Modo demo: mismo motivo que generar_clabe_individual.php -- una
        // CLABE real queda viva y puede recibir un SPEI real después, no se
        // puede simular de forma segura.
        responder_demo_si_aplica($pdo, $escuela_id, 'Esta cuenta está en modo de prueba: no se generan CLABEs SPEI reales.');

        $stmtAlumnos = $pdo->prepare(
            "SELECT id, nombre, matricula, email FROM clientes
             WHERE escuela_id = ? AND activo = 1
               AND (clabe_individual_estado IS NULL OR clabe_individual_estado <> 'activa')
             ORDER BY id ASC"
        );
        $stmtAlumnos->execute([$escuela_id]);
        $alumnosSinClabe = $stmtAlumnos->fetchAll(PDO::FETCH_ASSOC);
        if (!$alumnosSinClabe) {
            respond(['success' => true, 'generadas' => 0, 'sin_clabe' => 0, 'mensaje' => 'Todos los alumnos activos ya tienen CLABE.']);
        }

        $generadas = 0;
        $errores = [];
        foreach ($alumnosSinClabe as $alumno) {
            $r = generar_clabe_pagadetodo(
                $pdo,
                $alumno['id'],
                trim($alumno['matricula'] ?? ''),
                trim($alumno['nombre'] ?? ''),
                trim($alumno['email'] ?? '')
            );
            if ($r['success']) {
                $generadas++;
            } else {
                $errores[] = ($alumno['nombre'] ?: ('#' . $alumno['id'])) . ': ' . $r['error'];
            }
        }

        $sinClabe = count($alumnosSinClabe) - $generadas;
        registrar_log($pdo, $usuario_actual, 'clabes_generadas_masivo', "$generadas generadas, $sinClabe con error", $escuela_id);
        respond([
            'success'   => true,
            'generadas' => $generadas,
            'sin_clabe' => $sinClabe,
            'errores'   => $errores,
            'mensaje'   => $sinClabe > 0
                ? "Se generaron $generadas CLABEs. $sinClabe alumnos fallaron (revisa el detalle)."
                : "Se generaron $generadas CLABEs a todos los alumnos pendientes.",
        ]);