<?php
        // Recibe: { escuela_id }
        $escuela_id = intval($input['escuela_id'] ?? 0);
        if (!$escuela_id) respond(['success' => false, 'error' => 'escuela_id requerido']);
        $stmt = $pdo->prepare(
            "SELECT cp.id, cp.clabe, cp.estado, cp.fecha_alta, cp.fecha_asign,
                    c.nombre AS alumno, c.matricula
             FROM clabe_pool cp
             LEFT JOIN clientes c ON c.id = cp.cliente_id
             WHERE cp.escuela_id = ?
             ORDER BY cp.estado ASC, cp.id ASC"
        );
        $stmt->execute([$escuela_id]);
        $pool = $stmt->fetchAll();
        // Contadores
        $stmt2 = $pdo->prepare(
            "SELECT estado, COUNT(*) as n FROM clabe_pool WHERE escuela_id = ? GROUP BY estado"
        );
        $stmt2->execute([$escuela_id]);
        $conteos = [];
        foreach ($stmt2->fetchAll() as $row) $conteos[$row['estado']] = intval($row['n']);
        respond([
            'success' => true,
            'pool'    => $pool,
            'totales' => [
                'libre'    => $conteos['libre']    ?? 0,
                'asignada' => $conteos['asignada'] ?? 0,
                'liberada' => $conteos['liberada'] ?? 0,
            ],
        ]);
