<?php
        requerir_rol($usuario_actual['rol'] ?? '', ['superadmin'], 'Solo el super admin puede editar referidos.');
        $idRef = intval($input['id'] ?? 0);
        if (!$idRef) respond(['success' => false, 'error' => 'id requerido']);
        $estados_validos_ref = ['prospecto', 'demo_agendada', 'implementacion', 'activo'];
        $sets = []; $vals = [];
        if (array_key_exists('comision_pct', $input)) {
            $pctRef = floatval($input['comision_pct']);
            if ($pctRef < 0 || $pctRef > 100) respond(['success' => false, 'error' => 'La comisión debe estar entre 0 y 100']);
            $sets[] = 'comision_pct = ?'; $vals[] = $pctRef;
        }
        if (array_key_exists('estado', $input)) {
            if (!in_array($input['estado'], $estados_validos_ref, true)) respond(['success' => false, 'error' => 'Estado inválido']);
            $sets[] = 'estado = ?'; $vals[] = $input['estado'];
        }
        if (array_key_exists('escuela_id', $input)) {
            $escIdRef = intval($input['escuela_id'] ?? 0) ?: null;
            $sets[] = 'escuela_id = ?'; $vals[] = $escIdRef;
        }
        if (array_key_exists('num_alumnos', $input)) {
            $sets[] = 'num_alumnos = ?'; $vals[] = intval($input['num_alumnos'] ?? 0) ?: null;
        }
        if (array_key_exists('notas', $input)) {
            $sets[] = 'notas = ?'; $vals[] = trim($input['notas'] ?? '') ?: null;
        }
        if (empty($sets)) respond(['success' => false, 'error' => 'Sin campos a actualizar']);
        $vals[] = $idRef;
        $pdo->prepare("UPDATE distribuidor_referidos SET " . implode(', ', $sets) . " WHERE id = ?")->execute($vals);
        registrar_log($pdo, $usuario_actual, 'referido_editado', "Referido #$idRef actualizado");
        $stmt2Ref = $pdo->prepare(
            "SELECT r.*, u.nombre AS distribuidor_nombre, e.nombre AS escuela_nombre
             FROM distribuidor_referidos r
             LEFT JOIN usuarios u ON u.id = r.distribuidor_id
             LEFT JOIN escuelas e ON e.id = r.escuela_id
             WHERE r.id = ?"
        );
        $stmt2Ref->execute([$idRef]);
        $refActualizado = $stmt2Ref->fetch();
        if ($refActualizado) {
            $refActualizado['id'] = intval($refActualizado['id']);
            $refActualizado['distribuidor_id'] = intval($refActualizado['distribuidor_id']);
            $refActualizado['escuela_id'] = $refActualizado['escuela_id'] ? intval($refActualizado['escuela_id']) : null;
            $refActualizado['comision_pct'] = floatval($refActualizado['comision_pct']);
        }
        respond(['success' => true, 'referido' => $refActualizado]);
