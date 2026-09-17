<?php
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin', 'admin'], 'No tienes permiso para eliminar planteles.');
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        $stmt = $pdo->prepare("SELECT * FROM planteles WHERE id = ?");
        $stmt->execute([$id]);
        $plantelDel = $stmt->fetch();
        if (!$plantelDel) respond(['success' => false, 'error' => 'Plantel no encontrado']);
        requerir_escuela_propia($rol_actual, $plantelDel['escuela_id'], $usuario_actual, 'Solo puedes eliminar planteles de tu propia escuela.');
        $escPlantelId = intval($plantelDel['escuela_plantel_id']);
        $cntAlumnos = $pdo->prepare("SELECT COUNT(*) AS n FROM clientes WHERE escuela_id = ?");
        $cntAlumnos->execute([$escPlantelId]);
        $nAlumnos = intval($cntAlumnos->fetch()['n'] ?? 0);
        $cntCobros = $pdo->prepare("SELECT COUNT(*) AS n FROM cobros WHERE escuela_id = ?");
        $cntCobros->execute([$escPlantelId]);
        $nCobros = intval($cntCobros->fetch()['n'] ?? 0);
        if ($nAlumnos > 0 || $nCobros > 0) {
            respond(['success' => false, 'error' => "Este plantel ya tiene $nAlumnos alumno(s) y $nCobros cobro(s) registrados — no se puede eliminar sin perder ese historial. Desactívalo en su lugar."]);
        }
        try {
            $pdo->beginTransaction();
            $pdo->prepare("DELETE FROM usuarios WHERE escuela_id = ? AND rol = 'admin'")->execute([$escPlantelId]);
            $pdo->prepare("DELETE FROM planteles WHERE id = ?")->execute([$id]);
            $pdo->prepare("DELETE FROM escuelas WHERE id = ? AND es_plantel = 1")->execute([$escPlantelId]);
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            respond(['success' => false, 'error' => 'No se pudo eliminar: ' . $e->getMessage()]);
        }
        registrar_log($pdo, $usuario_actual, 'plantel_eliminado', "Plantel #$id eliminado (sin historial)");
        respond(['success' => true]);
