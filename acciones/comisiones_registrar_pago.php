<?php
// acciones/comisiones_registrar_pago.php
//
// Registra un pago hecho al distribuidor y lo aplica a los meses que liquida.
//
// Esto es lo que hoy NO existe en ninguna parte del sistema: se buscó en todo
// el repo (liquidac|payout|comision_pagada|pago_distribuidor) y no había nada.
// Sin esto no hay forma de saber qué ya se pagó y qué se debe.
//
// Ver lib/helpers_comisiones.php.

requerir_rol($usuario_actual['rol'] ?? '', ['superadmin', 'tesoreria'],
             'No tienes permiso para registrar pagos de comisión.');

$distPago  = intval($input['distribuidor_id'] ?? 0);
$fechaPago = trim($input['fecha_pago'] ?? '');
$metodoPag = trim($input['metodo'] ?? '') ?: null;
$refPago   = trim($input['referencia'] ?? '') ?: null;
$notasPago = trim($input['notas'] ?? '') ?: null;
// [{devengo_id, monto}, ...]
$aplicaciones = is_array($input['aplicaciones'] ?? null) ? $input['aplicaciones'] : [];

if (!$distPago)  respond(['success' => false, 'error' => 'distribuidor_id requerido']);
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fechaPago)) {
    respond(['success' => false, 'error' => 'Indica la fecha de pago (YYYY-MM-DD).']);
}
// Mismo criterio que tesoreria_marcar_pagado.php: no se registra un pago con
// fecha futura. Un comprobante de algo que todavía no pasó no es un comprobante.
if ($fechaPago > date('Y-m-d')) {
    respond(['success' => false, 'error' => 'La fecha de pago no puede ser futura.']);
}
if (!$aplicaciones) {
    respond(['success' => false, 'error' => 'Indica a qué meses se aplica este pago.']);
}

try {
    $pdo->beginTransaction();

    // Los datos bancarios se copian AL MOMENTO del pago. Si el distribuidor
    // cambia su CLABE después, el comprobante tiene que seguir diciendo a
    // dónde se mandó el dinero.
    $uStmt = $pdo->prepare("SELECT pago_banco, pago_clabe, pago_titular FROM usuarios WHERE id = ? AND rol = 'distribuidor'");
    $uStmt->execute([$distPago]);
    $datosBanco = $uStmt->fetch();
    if (!$datosBanco) { $pdo->rollBack(); respond(['success' => false, 'error' => 'Distribuidor no encontrado.']); }

    // Se valida ANTES de insertar nada: ningún devengo puede recibir más de lo
    // que le falta. Sin esto se podría pagar dos veces el mismo mes y el
    // sistema lo daría por bueno.
    $total = 0.0;
    $validadas = [];
    $devStmt = $pdo->prepare(
        "SELECT id, distribuidor_id, periodo, comision, monto_liquidado
           FROM comision_devengos WHERE id = ? FOR UPDATE"
    );
    foreach ($aplicaciones as $ap) {
        $did = intval($ap['devengo_id'] ?? 0);
        $mon = round(floatval($ap['monto'] ?? 0), 2);
        if (!$did || $mon <= 0) { $pdo->rollBack(); respond(['success' => false, 'error' => 'Aplicación inválida: falta devengo o monto.']); }

        $devStmt->execute([$did]);
        $dev = $devStmt->fetch();
        if (!$dev) { $pdo->rollBack(); respond(['success' => false, 'error' => "El devengo #$did no existe."]); }
        if (intval($dev['distribuidor_id']) !== $distPago) {
            $pdo->rollBack();
            respond(['success' => false, 'error' => "El devengo #$did es de otro distribuidor."]);
        }
        $falta = round(floatval($dev['comision']) - floatval($dev['monto_liquidado']), 2);
        if ($mon > $falta + 0.005) {
            $pdo->rollBack();
            respond(['success' => false,
                     'error' => "Al mes {$dev['periodo']} solo le faltan $" . number_format($falta, 2) . " y estás aplicando $" . number_format($mon, 2) . "."]);
        }
        $validadas[] = ['id' => $did, 'monto' => $mon];
        $total += $mon;
    }

    $pdo->prepare(
        "INSERT INTO comision_liquidaciones
           (distribuidor_id, monto_total, fecha_pago, metodo, referencia,
            pago_banco, pago_clabe, pago_titular, notas, registrado_por)
         VALUES (?,?,?,?,?,?,?,?,?,?)"
    )->execute([
        $distPago, round($total, 2), $fechaPago, $metodoPag, $refPago,
        $datosBanco['pago_banco'], $datosBanco['pago_clabe'], $datosBanco['pago_titular'],
        $notasPago, intval($usuario_actual['user_id'] ?? 0) ?: null,
    ]);
    $liqId = intval($pdo->lastInsertId());

    $insDet = $pdo->prepare(
        "INSERT INTO comision_liquidacion_detalle (liquidacion_id, devengo_id, monto_aplicado) VALUES (?,?,?)"
    );
    foreach ($validadas as $v) $insDet->execute([$liqId, $v['id'], $v['monto']]);

    $pdo->commit();

    // El recálculo va DESPUÉS del commit y por devengo: monto_liquidado es una
    // columna cacheada y se recalcula siempre desde el detalle, nunca se suma
    // sobre el valor anterior. Misma regla de oro que cobros.monto_pagado.
    foreach ($validadas as $v) comision_recalcular_liquidado($pdo, $v['id']);

} catch (\PDOException $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    respond(['success' => false, 'error' => 'No se pudo registrar el pago: ' . $e->getMessage()]);
}

registrar_log($pdo, $usuario_actual, 'comision_pago_registrado',
    "Pago #$liqId al distribuidor #$distPago por $" . number_format($total, 2) . " ($fechaPago)");

respond(['success' => true, 'liquidacion_id' => $liqId, 'monto_total' => round($total, 2)]);
