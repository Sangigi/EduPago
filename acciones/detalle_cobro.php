<?php
        $cobro_id_det = intval($input['cobro_id'] ?? $_GET['cobro_id'] ?? 0);
        if (!$cobro_id_det) respond(['success' => false, 'error' => 'cobro_id requerido']);
        $chk = $pdo->prepare("SELECT escuela_id, cliente_id, folio FROM cobros WHERE id = ?");
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
            // [F0] Se pasa la escuela del cobro (ya leída arriba) como candado extra.
            requerir_familia_propia($famDet ? $famDet['familia_id'] : null, $usuario_actual, 'No tienes permiso para ver este cobro.', $cobroRow['escuela_id']);
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
        // [OF-3] `folio` solo si la columna ya existe; los abonos anteriores a OF-3
        // (folio NULL) lo reciben calculado más abajo.
        $colFolioAb = abonos_col_folio($pdo) ? 'folio, ' : '';
        try {
            $stmtAb = $pdo->prepare(
                "SELECT id, {$colFolioAb}monto, metodo, referencia, clabe, transaccion_proveedor,
                        auth_code, origen, notas, creado_en,
                        cfdi_complemento_id, cfdi_complemento_uuid, cfdi_complemento_en
                   FROM cobro_abonos
                  WHERE cobro_id = ?
                  ORDER BY creado_en, id"
            );
            $stmtAb->execute([$cobro_id_det]);
            $abonos = $stmtAb->fetchAll();
        } catch (\PDOException $e) {
            // Si la migración de abonos (o la de complemento_pago) no ha
            // corrido, alguna de esas columnas no existe. No es motivo para
            // romper el detalle: se reintenta sin ellas antes de rendirse.
            try {
                $stmtAb = $pdo->prepare(
                    "SELECT id, {$colFolioAb}monto, metodo, referencia, clabe, transaccion_proveedor,
                            auth_code, origen, notas, creado_en
                       FROM cobro_abonos
                      WHERE cobro_id = ?
                      ORDER BY creado_en, id"
                );
                $stmtAb->execute([$cobro_id_det]);
                $abonos = $stmtAb->fetchAll();
            } catch (\PDOException $e2) {
                $abonos = [];
            }
        }
        // [OF-3] Folio de cada abono. Los nuevos ya lo traen guardado; a los viejos
        // (NULL) se les calcula igual que los nuevos: folio del cobro + número de
        // abono por orden de id (el mismo orden que usa el complemento de pago).
        $ids_ab = array_map(function ($a) { return intval($a['id']); }, $abonos);
        sort($ids_ab);
        $numero_ab = array_flip($ids_ab); // id => posición (0 = primero)
        foreach ($abonos as $k_ab => $a_ab) {
            if (empty($a_ab['folio'])) {
                $abonos[$k_ab]['folio'] = abono_folio_texto($cobroRow['folio'] ?? '', ($numero_ab[intval($a_ab['id'])] ?? 0) + 1, $cobro_id_det);
            }
        }
        $resp_det = ['success' => true, 'items' => $items, 'abonos' => $abonos];
        // [OF-3] Estado fresco del cobro + registro de cancelación, solo para el
        // personal del colegio (la familia no ve quién ni por qué se canceló).
        if (in_array($rolDet, ['superadmin', 'admin', 'cajero'], true)) {
            try {
                $conCan = cobros_cols_cancelacion($pdo)
                    ? ", co.cancelado_motivo, co.cancelado_en, co.cancelado_monto_recibido, co.cancelado_por, u.nombre AS cancelado_por_nombre"
                    : '';
                $joinCan = $conCan ? " LEFT JOIN usuarios u ON u.id = co.cancelado_por" : '';
                $stmtInfo = $pdo->prepare("SELECT co.id, co.folio, co.estado, co.total, co.monto_pagado, co.factura_uuid{$conCan} FROM cobros co{$joinCan} WHERE co.id = ?");
                $stmtInfo->execute([$cobro_id_det]);
                $info = $stmtInfo->fetch(PDO::FETCH_ASSOC);
                if ($info) $resp_det['cobro'] = $info;
            } catch (\PDOException $eInfo) {
                // Sin la tabla usuarios.nombre o similar: el detalle sigue sin el bloque.
            }
        }
        respond($resp_det);