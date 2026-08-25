<?php
        // Toma la primera CLABE libre del pool de la escuela y la asigna al alumno
        // Recibe: { escuela_id, cliente_id }
        $escuela_id = intval($input['escuela_id'] ?? 0);
        $cliente_id = intval($input['cliente_id'] ?? 0);
        if (!$escuela_id || !$cliente_id) {
            respond(['success' => false, 'error' => 'escuela_id y cliente_id son requeridos']);
        }
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
