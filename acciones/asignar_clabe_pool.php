<?php
        // Toma la primera CLABE libre del pool de la escuela y la asigna al alumno
        // Recibe: { escuela_id, cliente_id } -- escuela_id del input NUNCA se usa
        // para autorizar (ver blindaje abajo): se deriva SIEMPRE del propio
        // cliente en BD, la única fuente de verdad de a qué escuela pertenece.
        //
        // Blindaje (11-sep-2026, hallado en revisión adversarial de la Fase 2):
        // este archivo no tenía requerir_rol() ni requerir_escuela_propia() --
        // cualquier usuario autenticado (incluido rol 'familia', para el que
        // requerir_seccion_habilitada es un no-op total) podía mandar el
        // escuela_id de OTRO colegio y robar/reasignar una CLABE SPEI real de
        // esa escuela a un cliente arbitrario. El guard de modo demo tampoco
        // protegía nada porque evaluaba ese mismo escuela_id ajeno sin validar.
        $cliente_id = intval($input['cliente_id'] ?? 0);
        if (!$cliente_id) {
            respond(['success' => false, 'error' => 'cliente_id es requerido']);
        }
        $rolClabePool = $usuario_actual['rol'] ?? '';
        requerir_rol($rolClabePool, ['superadmin', 'admin', 'cajero'], 'No tienes permiso para asignar CLABEs.');

        $stmtCliEscPool = $pdo->prepare("SELECT escuela_id FROM clientes WHERE id = ?");
        $stmtCliEscPool->execute([$cliente_id]);
        $filaCliPool = $stmtCliEscPool->fetch();
        if (!$filaCliPool) respond(['success' => false, 'error' => 'Alumno no encontrado']);
        $escuela_id = intval($filaCliPool['escuela_id']);

        requerir_escuela_propia($rolClabePool, $escuela_id, $usuario_actual, 'No tienes permiso sobre este alumno.');
        requerir_seccion_habilitada($pdo, $rolClabePool, $escuela_id, ['alumnos', 'familias']);
        // Modo demo: una CLABE real queda viva y puede recibir un SPEI real
        // en cualquier momento futuro, a diferencia de una liga/referencia de
        // un solo uso -- se bloquea por completo, no se puede simular.
        responder_demo_si_aplica($pdo, $escuela_id, 'Esta cuenta está en modo de prueba: no se asignan CLABEs SPEI reales.');
        // Verificar que el alumno no tenga ya CLABE asignada del pool
        $chk = $pdo->prepare(
            "SELECT clabe FROM clabe_pool WHERE cliente_id = ? AND estado = 'asignada'"
        );
        $chk->execute([$cliente_id]);
        if ($row = $chk->fetch()) {
            respond(['success' => true, 'clabe' => $row['clabe'], 'ya_tenia' => true]);
        }
        // Tomar la primera CLABE libre (FOR UPDATE para evitar race conditions)
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                "SELECT id, clabe FROM clabe_pool
                 WHERE escuela_id = ? AND estado IN ('libre', 'liberada')
                 ORDER BY id ASC LIMIT 1 FOR UPDATE"
            );
            $stmt->execute([$escuela_id]);
            $clabeRow = $stmt->fetch();
            if (!$clabeRow) {
                $pdo->rollBack();
                respond(['success' => false, 'error' => 'No hay CLABEs SPEI disponibles. Importa más CLABEs al pool.']);
            }
            // Marcar como asignada en el pool
            $upd = $pdo->prepare(
                "UPDATE clabe_pool SET estado='asignada', cliente_id=?, fecha_asign=CURDATE()
                 WHERE id = ?"
            );
            $upd->execute([$cliente_id, $clabeRow['id']]);
            // Actualizar el alumno en la tabla clientes
            $upd2 = $pdo->prepare(
                "UPDATE clientes SET clabe_individual=?, clabe_individual_estado='activa',
                 clabe_individual_fecha=CURDATE() WHERE id=?"
            );
            $upd2->execute([$clabeRow['clabe'], $cliente_id]);
            $pdo->commit();
            respond(['success' => true, 'clabe' => $clabeRow['clabe']]);
        } catch (Exception $e) {
            $pdo->rollBack();
            respond(['success' => false, 'error' => 'Error al asignar CLABE: ' . $e->getMessage()]);
        }
