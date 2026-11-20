<?php
// acciones/importar_saldos_deshacer.php — [OF-5] Deshacer una importación de adeudos.
//
// Se puede deshacer SOLO si NINGUNO de sus cobros ha recibido pagos
// (monto_pagado = 0) ni dejó de estar pendiente. Si alguno ya recibió pago, NO
// deja deshacer y dice cuáles (folio, alumno y cuánto recibió): hay que
// cancelarlos a mano desde Cobros, uno por uno, con su motivo.
//
// Qué hace, todo en UNA transacción con la importación y sus cobros bloqueados:
//   · cancela cada cobro con el motivo "Importación deshecha" (las columnas
//     cancelado_* de OF-3 si existen; si no, solo cambia el estado y el motivo
//     queda en la bitácora);
//   · recalcula el saldo de cada alumno afectado;
//   · libera las huellas (huella = NULL, deshecha = 1) para poder volver a
//     importar el mismo archivo si se corrigió algo;
//   · marca la importación como 'deshecha'.
// Los cobros NO se borran: quedan cancelados, con su historial.
//
// Entrada (JSON): importacion_id, escuela_id (solo superadmin).
// Roles: admin y superadmin; la escuela se toma de la FILA de la importación.

require_once __DIR__ . '/../lib/helpers_importar_saldos.php';

$rol_deshacer = $usuario_actual['rol'] ?? '';
requerir_rol($rol_deshacer, ['superadmin', 'admin'], 'No tienes permiso para deshacer importaciones de adeudos.');

if (!importar_tablas_listas($pdo)) {
    respond(['success' => false, 'falta_migracion' => true, 'error' => IMPORTAR_AVISO_MIGRACION]);
}

$imp_id = intval($input['importacion_id'] ?? 0);
if ($imp_id <= 0) respond(['success' => false, 'error' => 'importacion_id requerido']);

// La escuela es la de la FILA, nunca la que mande el navegador.
$sI = $pdo->prepare("SELECT escuela_id FROM importaciones_saldos WHERE id = ?");
$sI->execute([$imp_id]);
$filaImp = $sI->fetch();
if (!$filaImp) respond(['success' => false, 'error' => 'Importación no encontrada.']);
$escuela_id = intval($filaImp['escuela_id']);
requerir_escuela_propia($rol_deshacer, $escuela_id, $usuario_actual, 'No tienes permiso para deshacer esta importación.');
requerir_seccion_habilitada($pdo, $rol_deshacer, $escuela_id, ['cobros']);

@set_time_limit(300);
$llave_candado = 'edupago_importar_saldos_' . $escuela_id;
$got = $pdo->prepare("SELECT GET_LOCK(?, 5)");
$got->execute([$llave_candado]);
if (intval($got->fetchColumn()) !== 1) {
    respond(['success' => false, 'error' => 'Hay otra importación de este colegio en curso. Espera a que termine e inténtalo de nuevo.']);
}

$cols_cancelacion = cobros_cols_cancelacion($pdo); // [OF-3]
$MOTIVO = 'Importación deshecha';
$err = null; $bloqueantes = []; $cancelados = 0; $monto_c = 0; $ya_cancelados = 0; $archivo = '';
try {
    $pdo->beginTransaction();
    $lock = $pdo->prepare("SELECT id, estado, archivo_nombre FROM importaciones_saldos WHERE id = ? AND escuela_id = ? FOR UPDATE");
    $lock->execute([$imp_id, $escuela_id]);
    $imp = $lock->fetch();
    if (!$imp) {
        $err = 'Importación no encontrada.';
    } elseif ($imp['estado'] !== 'aplicada') {
        $err = 'Esta importación ya estaba deshecha.';
    } else {
        $archivo = (string) $imp['archivo_nombre'];
        $rev = importar_revisar_deshacer($pdo, $imp_id, true);
        $bloqueantes = $rev['bloqueantes'];
        $ya_cancelados = $rev['ya_cancelados'];
        if ($bloqueantes) {
            $err = 'No se puede deshacer: ' . count($bloqueantes) . ' cobro(s) de esta importación ya recibieron pagos o cambiaron de estado. Cancélalos a mano desde Cobros si es lo que quieres.';
        } else {
            $uid = intval($usuario_actual['user_id'] ?? 0) ?: null;
            $a_cancelar = [];
            foreach ($rev['cancelables'] as $c) {
                if ($c['estado'] === 'pendiente') {
                    $a_cancelar[] = intval($c['cobro_id']);
                    $monto_c += intval(round(floatval($c['total']) * 100));
                }
            }
            // Clientes afectados (todos los de la importación; el recálculo es idempotente).
            $sc = $pdo->prepare("SELECT DISTINCT cliente_id FROM importaciones_saldos_filas WHERE importacion_id = ? AND deshecha = 0");
            $sc->execute([$imp_id]);
            $clientes = array_map('intval', $sc->fetchAll(PDO::FETCH_COLUMN));

            foreach (array_chunk($a_cancelar, 500) as $lote) {
                $q = implode(',', array_fill(0, count($lote), '?'));
                if ($cols_cancelacion) {
                    $up = $pdo->prepare(
                        "UPDATE cobros SET estado = 'cancelado', cancelado_motivo = ?, cancelado_por = ?, cancelado_en = NOW(), cancelado_monto_recibido = 0
                          WHERE id IN ($q) AND estado = 'pendiente' AND COALESCE(monto_pagado, 0) = 0"
                    );
                    $up->execute(array_merge([$MOTIVO, $uid], $lote));
                } else {
                    $up = $pdo->prepare("UPDATE cobros SET estado = 'cancelado' WHERE id IN ($q) AND estado = 'pendiente' AND COALESCE(monto_pagado, 0) = 0");
                    $up->execute($lote);
                }
                // Los bloqueamos FOR UPDATE arriba: si no se canceló justo cada uno, algo cambió. No se sigue a medias.
                if ($up->rowCount() !== count($lote)) throw new RuntimeException('Un cobro cambió de estado mientras se deshacía.');
                $cancelados += $up->rowCount();
            }
            foreach ($clientes as $cid) recalcular_saldo_pendiente($pdo, $cid);
            $pdo->prepare("UPDATE importaciones_saldos_filas SET huella = NULL, deshecha = 1 WHERE importacion_id = ? AND deshecha = 0")->execute([$imp_id]);
            $pdo->prepare("UPDATE importaciones_saldos SET estado = 'deshecha', deshecha_por = ?, deshecha_en = NOW() WHERE id = ?")->execute([$uid, $imp_id]);
        }
    }
    if ($err !== null) $pdo->rollBack(); else $pdo->commit();
} catch (\Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    log_api("importar_saldos_deshacer: importación #{$imp_id} -> " . $e->getMessage());
    try { $pdo->prepare("SELECT RELEASE_LOCK(?)")->execute([$llave_candado]); } catch (\Throwable $e2) { }
    respond(['success' => false, 'error' => 'No se pudo deshacer la importación (no se cambió nada). Intenta de nuevo; si el problema sigue, avisa a soporte.']);
}
try { $pdo->prepare("SELECT RELEASE_LOCK(?)")->execute([$llave_candado]); } catch (\Throwable $e) { }

if ($err !== null) {
    respond([
        'success' => false, 'error' => $err,
        'bloqueantes' => array_map(function ($b) {
            return ['cobro_id' => intval($b['cobro_id']), 'folio' => $b['folio'], 'alumno' => $b['alumno'],
                    'estado' => $b['estado'], 'pagado' => floatval($b['monto_pagado']), 'motivo' => $b['motivo']];
        }, array_slice($bloqueantes, 0, 100)),
        'total_bloqueantes' => count($bloqueantes),
    ]);
}

registrar_log($pdo, $usuario_actual, 'importacion_saldos_deshecha',
    "Importación #{$imp_id} ({$archivo}) deshecha: {$cancelados} cobro(s) cancelados por $" . number_format($monto_c / 100, 2)
    . ($ya_cancelados ? " ({$ya_cancelados} ya estaban cancelados)" : '') . ". Motivo: {$MOTIVO}"
    . ($cols_cancelacion ? '' : '. [sin migración OF-3: motivo solo en bitácora]'),
    $escuela_id);

// [OF-7c] Auditoría: la importación pasó de aplicada a deshecha.
auditar($pdo, $usuario_actual, 'importacion.deshacer', 'importacion', $imp_id,
    ['estado' => 'aplicada', 'cobros_cancelados' => 0, 'monto_cancelado' => 0],
    ['estado' => 'deshecha', 'cobros_cancelados' => $cancelados, 'monto_cancelado' => importar_pesos($monto_c)], $escuela_id);
respond(['success' => true, 'importacion_id' => $imp_id, 'cobros_cancelados' => $cancelados, 'monto' => importar_pesos($monto_c), 'ya_cancelados' => $ya_cancelados]);
