<?php
        $cobro_id_det = intval($input['cobro_id'] ?? $_GET['cobro_id'] ?? 0);
        if (!$cobro_id_det) respond(['success' => false, 'error' => 'cobro_id requerido']);
        $chk = $pdo->prepare("SELECT escuela_id, cliente_id FROM cobros WHERE id = ?");
        $chk->execute([$cobro_id_det]);
        $cobroRow = $chk->fetch();
        if (!$cobroRow) respond(['success' => false, 'error' => 'Cobro no encontrado']);
        $rolDet = $usuario_actual['rol'] ?? '';
        requerir_escuela_propia($rolDet, $cobroRow['escuela_id'], $usuario_actual, 'No tienes permiso para ver este cobro.');
        requerir_seccion_habilitada($pdo, $rolDet, $cobroRow['escuela_id'], ['cobros']);
        // Antes solo se validaba la escuela: cualquier padre de familia podía
        // ver el detalle de un cobro de OTRA familia de la misma escuela.
        if ($rolDet === 'familia') {
            $stmtFamDet = $pdo->prepare("SELECT familia_id FROM clientes WHERE id = ?");
            $stmtFamDet->execute([$cobroRow['cliente_id']]);
            $famDet = $stmtFamDet->fetch();
            requerir_familia_propia($famDet ? $famDet['familia_id'] : null, $usuario_actual, 'No tienes permiso para ver este cobro.');
        }
        try {
            $stmt = $pdo->prepare("SELECT * FROM cobro_items WHERE cobro_id = ? ORDER BY id");
            $stmt->execute([$cobro_id_det]);
            $items = $stmt->fetchAll();
        } catch (\PDOException $e) {
            $items = [];
        }
        respond(['success' => true, 'items' => $items]);
