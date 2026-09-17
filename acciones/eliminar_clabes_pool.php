<?php
        // Elimina CLABEs libres/liberadas del pool (no asignadas)
        // Recibe: { escuela_id, ids: [1,2,3] }
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin', 'admin'], 'No tienes permiso para eliminar CLABEs del pool.');
        $escuela_id = intval($input['escuela_id'] ?? 0);
        $ids = array_filter(array_map('intval', $input['ids'] ?? []), fn($i) => $i > 0);
        if (!$escuela_id || empty($ids)) respond(['success' => false, 'error' => 'Datos insuficientes']);
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare(
            "DELETE FROM clabe_pool WHERE escuela_id=? AND id IN ($placeholders) AND estado != 'asignada'"
        );
        $stmt->execute(array_merge([$escuela_id], $ids));
        registrar_log($pdo, $usuario_actual, 'clabes_eliminadas', $stmt->rowCount() . ' CLABE(s) eliminadas del pool', $escuela_id);
        respond(['success' => true, 'eliminadas' => $stmt->rowCount()]);
