<?php
// monedero_ajuste — corrección manual del saldo por el administrador (F6).
//
// Para lo que ningún flujo normal cubre: una recarga cancelada cuyo saldo el
// alumno ya se gastó, un reembolso a un alumno dado de baja, un error de
// captura. Escribe UN movimiento tipo 'ajuste' (signo +1 suma, -1 resta) con el
// motivo como descripción y el usuario que lo hizo. Nunca deja el saldo
// negativo (monedero_mover lanza). NO se corta con el módulo apagado: el admin
// debe poder corregir saldos aunque el colegio lo haya desactivado.
//
// Solo admin y superadmin. solicitud_key obligatoria (idempotencia): un doble
// clic no duplica el ajuste.
$ctx = monedero_ctx($pdo, $usuario_actual, $input, ['admin', 'superadmin']);

$cliente_id = intval($input['cliente_id'] ?? 0);
$signo = intval($input['signo'] ?? 0);
if ($signo !== 1 && $signo !== -1) {
    respond(['success' => false, 'error' => 'Indica si el ajuste suma (+) o resta (-) al saldo.']);
}
$monto = monedero_monto_valido($input['monto'] ?? null, 0.01, 100000);
if ($monto === null) {
    respond(['success' => false, 'error' => 'El monto del ajuste debe ser mayor a $0 y no pasar de $100,000.']);
}
$motivo = trim(strval($input['motivo'] ?? ''));
if (mb_strlen($motivo) < 5) {
    respond(['success' => false, 'error' => 'Escribe el motivo del ajuste (mínimo 5 caracteres): queda en el historial del alumno.']);
}
$llave = monedero_llave_cliente($input['solicitud_key'] ?? null);
if ($llave === null) {
    respond(['success' => false, 'error' => 'Falta la llave de la operación. Recarga la pantalla e intenta de nuevo.']);
}
$idem_key = 'ajuste:' . $ctx['escuela_id'] . ':' . $llave;
if (strlen($idem_key) > 80) respond(['success' => false, 'error' => 'La llave de la operación es demasiado larga.']);

monedero_alumno($pdo, $ctx, $usuario_actual, $cliente_id);

try {
    $pdo->beginTransaction();
    monedero_asegurar($pdo, $ctx['escuela_id'], $cliente_id);
    monedero_bloquear($pdo, $cliente_id);

    // Reintento con la misma llave: si fue para OTRO alumno es un error; si es
    // el mismo, se contesta lo ya hecho (monedero_mover tampoco duplicaría).
    $st = $pdo->prepare("SELECT cliente_id, saldo_despues FROM monedero_movimientos WHERE idem_key = ? LIMIT 1");
    $st->execute([$idem_key]);
    if ($previo = $st->fetch()) {
        $pdo->rollBack();
        if (intval($previo['cliente_id']) !== $cliente_id) {
            respond(['success' => false, 'error' => 'Esa operación ya se usó para otro alumno. Recarga la pantalla e intenta de nuevo.']);
        }
        respond(['success' => true, 'duplicado' => true, 'saldo_despues' => round(floatval($previo['saldo_despues']), 2)]);
    }

    $r = monedero_mover($pdo, $ctx['escuela_id'], $cliente_id, 'ajuste', $signo, monedero_c($monto), $idem_key, [
        'usuario_id'  => $ctx['user_id'],
        'descripcion' => $motivo,
    ]);
    $pdo->commit();

    registrar_log($pdo, $usuario_actual, 'monedero_ajuste',
        "Ajuste " . ($signo > 0 ? '+' : '-') . "\${$monto} al monedero del alumno #{$cliente_id}: {$motivo}", $ctx['escuela_id']);
    respond(['success' => true, 'duplicado' => false, 'saldo_despues' => $r['saldo_despues']]);
} catch (\Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    monedero_fallo($e, 'monedero_ajuste');
}
