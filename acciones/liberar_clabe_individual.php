<?php
        $clabe     = trim($input['clabe']     ?? '');
        $alumno_id = trim($input['alumno_id'] ?? '');
        if (!$clabe) respond(['success' => false, 'error' => 'clabe requerida']);
        // ── Liberar CLABE en Base de Datos ──
        try {
            $stmt = $pdo->prepare("UPDATE clientes SET clabe_individual_estado = 'liberada' WHERE clabe_individual = ? AND id = ?");
            $stmt->execute([$clabe, $alumno_id]);
        } catch (\PDOException $e) {
            respond(['success' => false, 'error' => 'Error de BD al liberar CLABE']);
        }
        respond(['success' => true, 'mensaje' => 'CLABE liberada']);
