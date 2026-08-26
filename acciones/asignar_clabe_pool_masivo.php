<?php
        // Asigna una CLABE del pool a TODOS los alumnos activos de la escuela que
        // todavía no tengan una — pensado para cuando se sube una escuela nueva
        // completa por CSV y hacerlo alumno por alumno sería impráctico (cientos
        // de clics). Reutiliza exactamente la misma fuente y reglas que
        // asignar_clabe_pool.php (una CLABE por alumno, 'libre'/'liberada' en el
        // pool), solo que en un único request/transacción para no tronar por
        // límite de tiempo con escuelas grandes.
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin', 'admin'], 'No tienes permiso para asignar CLABEs.');
        $escuela_id = intval($input['escuela_id'] ?? 0);
        if ($rol_actual === 'admin') $escuela_id = intval($usuario_actual['escuela_id'] ?? 0);
        if (!$escuela_id) respond(['success' => false, 'error' => 'escuela_id requerido']);

        $stmtAlumnos = $pdo->prepare(
            "SELECT id FROM clientes
             WHERE escuela_id = ? AND activo = 1
               AND (clabe_individual_estado IS NULL OR clabe_individual_estado <> 'activa')
             ORDER BY id ASC"
        );
        $stmtAlumnos->execute([$escuela_id]);
        $alumnosSinClabe = $stmtAlumnos->fetchAll(PDO::FETCH_COLUMN);
        if (!$alumnosSinClabe) {
            respond(['success' => true, 'asignadas' => 0, 'sin_clabe' => 0, 'mensaje' => 'Todos los alumnos activos ya tienen CLABE.']);
        }

        $asignadas = 0;
        $pdo->beginTransaction();
        try {
            foreach ($alumnosSinClabe as $clienteId) {
                $stmt = $pdo->prepare(
                    "SELECT id, clabe FROM clabe_pool
                     WHERE escuela_id = ? AND estado IN ('libre', 'liberada')
                     ORDER BY id ASC LIMIT 1 FOR UPDATE"
                );
                $stmt->execute([$escuela_id]);
                $clabeRow = $stmt->fetch();
                if (!$clabeRow) break; // pool agotado — el resto queda pendiente

                $pdo->prepare(
                    "UPDATE clabe_pool SET estado='asignada', cliente_id=?, fecha_asign=CURDATE()
                     WHERE id = ?"
                )->execute([$clienteId, $clabeRow['id']]);

                $pdo->prepare(
                    "UPDATE clientes SET clabe_individual=?, clabe_individual_estado='activa',
                     clabe_individual_fecha=CURDATE() WHERE id=?"
                )->execute([$clabeRow['clabe'], $clienteId]);

                $asignadas++;
            }
            $pdo->commit();
        } catch (Exception $e) {
            $pdo->rollBack();
            respond(['success' => false, 'error' => 'Error al asignar CLABEs: ' . $e->getMessage()]);
        }

        $sinClabe = count($alumnosSinClabe) - $asignadas;
        registrar_log($pdo, $usuario_actual, 'clabes_asignadas_masivo', "$asignadas asignadas, $sinClabe sin CLABE disponible", $escuela_id);
        respond([
            'success'   => true,
            'asignadas' => $asignadas,
            'sin_clabe' => $sinClabe,
            'mensaje'   => $sinClabe > 0
                ? "Se asignaron $asignadas CLABEs. Faltan $sinClabe alumnos por falta de CLABEs disponibles en el pool — importa más."
                : "Se asignaron $asignadas CLABEs a todos los alumnos pendientes.",
        ]);
