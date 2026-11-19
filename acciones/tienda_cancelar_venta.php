<?php
// tienda_cancelar_venta {venta_id, motivo?} — cancela una venta y devuelve el dinero (F6).
//
// tienda: solo ventas PROPIAS y del MISMO DÍA. admin: cualquiera de su colegio.
// Escribe un 'reverso' (+total, idem 'reverso:<venta_id>') y marca la venta como
// cancelada. Funciona aunque el monedero del alumno esté bloqueado o el módulo
// apagado: es devolver dinero que ya se le había cobrado.
//
// Orden de candados: primero el monedero (igual que tienda_vender) y luego la
// venta, para que las dos acciones nunca se esperen en círculo.
$ctx = monedero_ctx($pdo, $usuario_actual, $input, ['tienda', 'admin']);

$venta_id = intval($input['venta_id'] ?? 0);
if ($venta_id <= 0) respond(['success' => false, 'error' => 'Falta indicar la venta.']);
$motivo = mb_substr(trim(strval($input['motivo'] ?? '')), 0, 120);

// Lectura simple para saber de quién es el monedero que hay que bloquear;
// todo se vuelve a comprobar bajo candado.
$st = $pdo->prepare("SELECT cliente_id, escuela_id FROM tienda_ventas WHERE id = ?");
$st->execute([$venta_id]);
$pre = $st->fetch();
if (!$pre) respond(['success' => false, 'error' => 'Venta no encontrada.']);
if (intval($pre['escuela_id']) !== $ctx['escuela_id']) monedero_403('Esa venta no pertenece a tu colegio.');
$cliente_id = intval($pre['cliente_id']);

try {
    $pdo->beginTransaction();
    monedero_asegurar($pdo, $ctx['escuela_id'], $cliente_id);
    monedero_bloquear($pdo, $cliente_id);

    $st = $pdo->prepare("SELECT id, escuela_id, cliente_id, total, usuario_id, estado, (DATE(creado_en) = CURDATE()) AS es_de_hoy FROM tienda_ventas WHERE id = ? FOR UPDATE");
    $st->execute([$venta_id]);
    $v = $st->fetch();
    if (!$v || intval($v['escuela_id']) !== $ctx['escuela_id'] || intval($v['cliente_id']) !== $cliente_id) {
        throw new MonederoError('Venta no encontrada.');
    }
    if ($ctx['rol'] === 'tienda') {
        if (intval($v['usuario_id']) !== $ctx['user_id']) {
            throw new MonederoError('Solo puedes cancelar tus propias ventas. Pide al administrador que cancele esta.');
        }
        if (!intval($v['es_de_hoy'])) {
            throw new MonederoError('Solo se pueden cancelar ventas de hoy. Pide al administrador que cancele esta.');
        }
    }
    if ($v['estado'] !== 'completada') {
        throw new MonederoError('Esa venta ya estaba cancelada.');
    }

    $mov = monedero_mover($pdo, $ctx['escuela_id'], $cliente_id, 'reverso', 1, monedero_c($v['total']),
        'reverso:' . $venta_id, [
            'venta_id'    => $venta_id,
            'usuario_id'  => $ctx['user_id'],
            'descripcion' => 'Cancelación de la venta #' . $venta_id . ($motivo !== '' ? ': ' . $motivo : ''),
        ]);
    $pdo->prepare("UPDATE tienda_ventas SET estado = 'cancelada', cancelada_en = NOW(), cancelada_por = ? WHERE id = ? AND estado = 'completada'")
        ->execute([$ctx['user_id'], $venta_id]);
    $pdo->commit();

    registrar_log($pdo, $usuario_actual, 'tienda_venta_cancelada',
        "Venta #{$venta_id} cancelada (\$" . number_format(floatval($v['total']), 2) . ")" . ($motivo !== '' ? ": {$motivo}" : ''), $ctx['escuela_id']);
    respond(['success' => true, 'venta' => ['id' => $venta_id, 'estado' => 'cancelada'], 'saldo_despues' => $mov['saldo_despues']]);
} catch (\Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    monedero_fallo($e, 'tienda_cancelar_venta');
}
