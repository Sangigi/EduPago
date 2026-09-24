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
        // Desglose de ABONOS del cobro (24-sep-2026).
        //
        // Sin esto, un cobro pagado en varias exhibiciones solo mostraba el
        // total y el estado: no había forma de saber de dónde vino cada peso
        // —qué día, por qué método, con qué transacción del proveedor— y eso
        // es justo lo que hace falta para cuadrar el dinero o levantar una
        // aclaración.
        //
        // cobro_abonos es el libro mayor (la fuente de verdad); cobros.monto_pagado
        // es la columna cacheada que se recalcula desde aquí. Ver lib/helpers_pagos.php.
        try {
            $stmtAb = $pdo->prepare(
                "SELECT id, monto, metodo, referencia, clabe, transaccion_proveedor,
                        auth_code, origen, notas, creado_en
                   FROM cobro_abonos
                  WHERE cobro_id = ?
                  ORDER BY creado_en, id"
            );
            $stmtAb->execute([$cobro_id_det]);
            $abonos = $stmtAb->fetchAll();
        } catch (\PDOException $e) {
            // Si la migración de abonos no ha corrido, la tabla no existe. No
            // es motivo para romper el detalle: se devuelve vacío y la vista
            // simplemente no pinta la sección.
            $abonos = [];
        }
        respond(['success' => true, 'items' => $items, 'abonos' => $abonos]);
