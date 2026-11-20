<?php
        // Sin control de rol/pertenencia, cualquier usuario autenticado
        // (incluida una cuenta 'familia') podía cancelar CUALQUIER cobro
        // pendiente de CUALQUIER escuela — y como saldo_pendiente solo suma
        // cobros 'pendiente', cancelar el propio adeudo lo hacía desaparecer
        // sin pagar. Nunca se usa desde el Portal de Familia (solo desde
        // views/Cobros.js, del lado admin/cajero).
        //
        // [OF-3] Cancelar con motivo y registro:
        //   · El motivo es OBLIGATORIO (mínimo 5 caracteres).
        //   · Todo ocurre en UNA transacción con el cobro bloqueado (FOR UPDATE):
        //     solo se cancela si SIGUE en 'pendiente' o 'pagado' (dos clics, o dos
        //     personas a la vez, no cancelan dos veces ni pisan el registro de la
        //     primera).
        //   · Se guarda quién, cuándo, por qué y cuánto dinero ya se había recibido
        //     (cancelado_* en cobros; migracion_2026_11_19_of3_cobranza.sql).
        //   · Un cobro CON dinero recibido sí se puede cancelar (es la forma de
        //     corregir errores, y el monedero depende de cancelar recargas
        //     pagadas), pero la respuesta avisa que NO se devuelve dinero: la
        //     devolución se registra por fuera. Los abonos (cobro_abonos) no se
        //     tocan: siguen en el libro como evidencia de lo recibido.
        //   · Un cobro FACTURADO (factura_uuid vigente) también se puede cancelar,
        //     pero se avisa que la factura sigue vigente: hay que usar "Cancelar
        //     factura" (Facturación). Cancelar el cobro NO cancela el CFDI.
        //   · Sin la migración: sigue cancelando como antes, exige el motivo y lo
        //     deja solo en registrar_log.
        $rol_actual_cancelar = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual_cancelar, ['superadmin', 'admin', 'cajero'], 'No tienes permiso para cancelar cobros.');
        $cobro_id = intval($input['cobro_id'] ?? 0);
        if (!$cobro_id) respond(['success' => false, 'error' => 'cobro_id requerido']);
        $motivo_cancelar = trim((string) ($input['motivo'] ?? ''));
        if (mb_strlen($motivo_cancelar) < 5) {
            respond(['success' => false, 'error' => 'Escribe el motivo de la cancelación (mínimo 5 caracteres).']);
        }
        if (mb_strlen($motivo_cancelar) > 255) {
            respond(['success' => false, 'error' => 'El motivo no puede pasar de 255 caracteres.']);
        }
        // La escuela del cobro se valida ANTES de bloquear nada (el escuela_id
        // del input nunca se usa). El cobro se vuelve a leer ya con el candado.
        $chkEscCancel = $pdo->prepare("SELECT escuela_id FROM cobros WHERE id = ?");
        $chkEscCancel->execute([$cobro_id]);
        $escCancel = $chkEscCancel->fetch();
        if (!$escCancel) respond(['success' => false, 'error' => 'Cobro no encontrado']);
        requerir_escuela_propia($rol_actual_cancelar, $escCancel['escuela_id'], $usuario_actual, 'No tienes permiso para cancelar este cobro.');
        if (in_array($rol_actual_cancelar, ['admin', 'cajero'], true)) {
            requerir_seccion_habilitada($pdo, $rol_actual_cancelar, $escCancel['escuela_id'], ['cobros']);
        }

        $cols_cancelacion = cobros_cols_cancelacion($pdo); // [OF-3] ¿ya corrió la migración?
        $cancel_error = null; $cancel_res = null;
        try {
            $pdo->beginTransaction();
            $lock = $pdo->prepare("SELECT id, cliente_id, escuela_id, folio, estado, total, monto_pagado, factura_uuid FROM cobros WHERE id = ? FOR UPDATE");
            $lock->execute([$cobro_id]);
            $cob_row = $lock->fetch();
            if (!$cob_row) {
                $cancel_error = 'Cobro no encontrado';
            } elseif ($cob_row['estado'] === 'cancelado') {
                $cancel_error = 'Este cobro ya estaba cancelado.';
            } elseif (!in_array($cob_row['estado'], ['pendiente', 'pagado'], true)) {
                $cancel_error = 'Un cobro en estado "' . $cob_row['estado'] . '" no se puede cancelar.';
            }
            if ($cancel_error === null) {
                // Dinero ya recibido: lo que dice el libro (monto_pagado). Un cobro
                // 'pagado' con monto_pagado menor al total (anterior a los abonos)
                // se cuenta completo: estado='pagado' implica cubierto.
                $recibido_c = intval(round(floatval($cob_row['monto_pagado']) * 100));
                if ($cob_row['estado'] === 'pagado') {
                    $recibido_c = max($recibido_c, intval(round(floatval($cob_row['total']) * 100)));
                }
                $recibido = $recibido_c / 100;
                if ($cols_cancelacion) {
                    $up = $pdo->prepare(
                        "UPDATE cobros SET estado = 'cancelado', cancelado_motivo = ?, cancelado_por = ?, cancelado_en = NOW(),
                                cancelado_monto_recibido = ?
                          WHERE id = ? AND estado IN ('pendiente', 'pagado')"
                    );
                    $up->execute([$motivo_cancelar, intval($usuario_actual['user_id'] ?? 0) ?: null, $recibido, $cobro_id]);
                } else {
                    $up = $pdo->prepare("UPDATE cobros SET estado = 'cancelado' WHERE id = ? AND estado IN ('pendiente', 'pagado')");
                    $up->execute([$cobro_id]);
                }
                if ($up->rowCount() === 0) {
                    $cancel_error = 'El cobro cambió de estado mientras se cancelaba. Recarga y revisa.';
                } else {
                    // Recalcular saldo_pendiente del cliente vinculado
                    $nuevo_saldo = 0; $cliente_id_afectado = null;
                    if (!empty($cob_row['cliente_id'])) {
                        $cliente_id_afectado = intval($cob_row['cliente_id']);
                        recalcular_saldo_pendiente($pdo, $cliente_id_afectado);
                        $rs = $pdo->prepare("SELECT saldo_pendiente FROM clientes WHERE id = ?");
                        $rs->execute([$cliente_id_afectado]);
                        $nuevo_saldo = floatval($rs->fetchColumn());
                    }
                    $cancel_res = [
                        'cliente_id' => $cliente_id_afectado, 'nuevo_saldo' => $nuevo_saldo,
                        'recibido' => $recibido, 'folio' => $cob_row['folio'],
                        'facturado' => trim((string) ($cob_row['factura_uuid'] ?? '')) !== '',
                        'factura_uuid' => $cob_row['factura_uuid'] ?? null,
                    ];
                }
            }
            if ($cancel_error !== null) {
                $pdo->rollBack();
            } else {
                $pdo->commit();
            }
        } catch (\Throwable $eCancel) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            log_api("cancelar_cobro: error cobro #{$cobro_id} -> " . $eCancel->getMessage());
            respond(['success' => false, 'error' => 'No se pudo cancelar el cobro. Intenta de nuevo; si el problema sigue, avisa a soporte.']);
        }
        if ($cancel_error !== null) respond(['success' => false, 'error' => $cancel_error]);

        // [OF-6] Inventario: lo que este cobro descontó al crearse regresa a la existencia
        // (movimiento 'devolucion', idem 'devol_cobro:<cobro>:<producto>'). Va DESPUÉS del
        // commit de la cancelación y nunca lanza: si falla, el cobro ya quedó cancelado y
        // el detalle queda en el log. Si el cobro no descontó nada, no devuelve nada.
        $inv_devuelto = ['piezas' => 0, 'productos' => 0, 'errores' => 0];
        try {
            $inv_devuelto = inventario_devolver_documento($pdo, intval($escCancel['escuela_id']), 'concepto', $cobro_id,
                intval($usuario_actual['user_id'] ?? 0), $motivo_cancelar);
        } catch (\Throwable $eInv) {
            log_api("cancelar_cobro: inventario falló cobro #{$cobro_id}: " . $eInv->getMessage());
        }

        // Avisos que el modal y la respuesta muestran tal cual.
        $avisos_cancelar = [];
        if ($inv_devuelto['piezas'] > 0) {
            $avisos_cancelar[] = 'Se regresaron ' . $inv_devuelto['piezas'] . ' pieza(s) al inventario (' . $inv_devuelto['productos'] . ' producto(s)).';
        }
        if ($cancel_res['recibido'] > 0) {
            $avisos_cancelar[] = 'Este cobro ya tenía $' . number_format($cancel_res['recibido'], 2) . ' recibidos. Cancelarlo NO devuelve el dinero: registra la devolución por fuera.';
        }
        if ($cancel_res['facturado']) {
            $avisos_cancelar[] = 'El cobro está facturado (folio fiscal ' . $cancel_res['factura_uuid'] . '): la factura sigue vigente. Cancélala desde Facturación → "Cancelar factura".';
        }
        registrar_log($pdo, $usuario_actual, 'cobro_cancelado',
            "Cobro #{$cobro_id} ({$cancel_res['folio']}) cancelado. Motivo: {$motivo_cancelar}"
            . ($cancel_res['recibido'] > 0 ? '. Dinero recibido al cancelar: $' . number_format($cancel_res['recibido'], 2) . ' (NO devuelto)' : '')
            . ($cancel_res['facturado'] ? '. Factura vigente ' . $cancel_res['factura_uuid'] : '')
            . ($cols_cancelacion ? '' : '. [sin migración OF-3: motivo solo en bitácora]'),
            $escCancel['escuela_id']);
        respond(['success' => true, 'cobro_id' => $cobro_id,
                 'cliente_id' => $cancel_res['cliente_id'], 'nuevo_saldo' => $cancel_res['nuevo_saldo'],
                 'monto_recibido' => $cancel_res['recibido'],
                 'facturado' => $cancel_res['facturado'],
                 'avisos' => $avisos_cancelar,
                 'motivo_guardado' => $cols_cancelacion]);
