<?php
        // Por defecto solo borra un colegio (no plantel) que nunca tuvo
        // actividad real. Si ya tiene datos, se puede forzar un borrado en
        // cascada de TODO (alumnos, cobros, usuarios, etc.) — irreversible —
        // pero solo si mandan confirmar_clave = la clave exacta del colegio,
        // como segunda confirmación real (no basta con forzar=true a ciegas).
        requerir_rol($usuario_actual['rol'] ?? '', ['superadmin'], 'Solo el super admin puede eliminar colegios.');
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        $forzar = !empty($input['forzar']);
        $confirmar_clave = trim($input['confirmar_clave'] ?? '');
        $stmt = $pdo->prepare("SELECT * FROM escuelas WHERE id = ?");
        $stmt->execute([$id]);
        $escDel = $stmt->fetch();
        if (!$escDel) respond(['success' => false, 'error' => 'Colegio no encontrado']);
        if ((bool)$escDel['es_plantel']) {
            respond(['success' => false, 'error' => 'Esto es un plantel, no un colegio — elimínalo desde "Eliminar plantel" en su colegio principal.']);
        }
        $stmtPlanteles = $pdo->prepare("SELECT id FROM escuelas WHERE escuela_padre_id = ? AND es_plantel = 1");
        $stmtPlanteles->execute([$id]);
        $idsPlanteles = array_map('intval', array_column($stmtPlanteles->fetchAll(), 'id'));
        $idsGrupo = array_merge([$id], $idsPlanteles);
        $inGrupo = implode(',', array_fill(0, count($idsGrupo), '?'));

        $contar = function($tabla) use ($pdo, $idsGrupo, $inGrupo) {
            $s = $pdo->prepare("SELECT COUNT(*) AS n FROM `$tabla` WHERE escuela_id IN ($inGrupo)");
            $s->execute($idsGrupo);
            return intval($s->fetch()['n'] ?? 0);
        };
        $nPlanteles = count($idsPlanteles);
        $nAlumnos   = $contar('clientes');
        $nCobros    = $contar('cobros');
        $nClabes    = $contar('clabe_pool');
        $nUsuarios  = $contar('usuarios');
        $nFamilias  = $contar('familias');
        $nProductos = $contar('productos');
        $nReferidos = $contar('distribuidor_referidos');

        $hayDatos = $nPlanteles > 0 || $nAlumnos > 0 || $nCobros > 0 || $nClabes > 0 || $nReferidos > 0;
        if ($hayDatos && !$forzar) {
            $motivos = array_filter([
                $nPlanteles > 0  ? "$nPlanteles plantel(es)" : null,
                $nAlumnos > 0    ? "$nAlumnos alumno(s)"      : null,
                $nCobros > 0     ? "$nCobros cobro(s)"        : null,
                $nClabes > 0     ? "$nClabes CLABE(s) en el pool" : null,
                $nReferidos > 0  ? "$nReferidos comisión(es) de distribuidor asociada(s)" : null,
            ]);
            respond([
                'success' => false,
                'error' => 'Este colegio ya tiene ' . implode(', ', $motivos) . ' — no se puede eliminar sin perder ese historial.',
                'requiere_confirmacion_forzada' => true,
                'clave_para_confirmar' => $escDel['clave'],
            ]);
        }
        if ($hayDatos && $forzar && $confirmar_clave !== $escDel['clave']) {
            respond(['success' => false, 'error' => 'La clave de confirmación no coincide con la del colegio. No se eliminó nada.']);
        }

        try {
            $pdo->beginTransaction();
            $pdo->prepare("DELETE FROM cobro_items WHERE cobro_id IN (SELECT id FROM cobros WHERE escuela_id IN ($inGrupo))")->execute($idsGrupo);
            $pdo->prepare("DELETE FROM pagos_recurrentes_generados WHERE cobro_id IN (SELECT id FROM cobros WHERE escuela_id IN ($inGrupo)) OR producto_id IN (SELECT id FROM productos WHERE escuela_id IN ($inGrupo))")->execute(array_merge($idsGrupo, $idsGrupo));
            $pdo->prepare("DELETE FROM recordatorios WHERE escuela_id IN ($inGrupo)")->execute($idsGrupo);
            $pdo->prepare("DELETE FROM cobros WHERE escuela_id IN ($inGrupo)")->execute($idsGrupo);
            $pdo->prepare("DELETE FROM clabe_pool WHERE escuela_id IN ($inGrupo)")->execute($idsGrupo);
            $pdo->prepare("DELETE FROM clientes WHERE escuela_id IN ($inGrupo)")->execute($idsGrupo);
            $pdo->prepare("DELETE FROM familias WHERE escuela_id IN ($inGrupo)")->execute($idsGrupo);
            $pdo->prepare("DELETE FROM productos WHERE escuela_id IN ($inGrupo)")->execute($idsGrupo);
            // Sin ON DELETE CASCADE (a diferencia de clientes/familias/usuarios) —
            // si un distribuidor refirió este colegio, la fila queda apuntando a
            // su escuela_id y el DELETE de más abajo truena con error 1451.
            $pdo->prepare("DELETE FROM distribuidor_referidos WHERE escuela_id IN ($inGrupo)")->execute($idsGrupo);
            $pdo->prepare("DELETE FROM usuarios WHERE escuela_id IN ($inGrupo)")->execute($idsGrupo);
            $pdo->prepare("DELETE FROM planteles WHERE escuela_id = ?")->execute([$id]);
            $pdo->prepare("DELETE FROM escuelas WHERE id IN ($inGrupo)")->execute($idsGrupo);
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            respond(['success' => false, 'error' => 'No se pudo eliminar: ' . $e->getMessage()]);
        }
        $resumenEliminado = $hayDatos
            ? "$nPlanteles plantel(es), $nAlumnos alumno(s), $nCobros cobro(s), $nUsuarios usuario(s), $nFamilias familia(s), $nProductos producto(s), $nClabes CLABE(s), $nReferidos referido(s) de distribuidor"
            : 'sin historial';
        registrar_log($pdo, $usuario_actual, 'escuela_eliminada', "Colegio #$id '{$escDel['nombre']}' eliminado" . ($hayDatos ? " FORZADO junto con: $resumenEliminado" : ' (sin historial)'));
        respond(['success' => true, 'id' => $id, 'ids_planteles_eliminados' => $idsPlanteles, 'resumen_eliminado' => $hayDatos ? $resumenEliminado : null]);
