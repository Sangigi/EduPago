<?php
// inventario_ajuste {tipo, item_id, cantidad, motivo, idem_key} — corrección manual
// de la existencia (merma, robo, regalo, pieza dañada) (OF-6).
//
// `cantidad` lleva signo: +3 suma tres piezas, -2 resta dos. El motivo es
// OBLIGATORIO (mínimo 3 caracteres): un ajuste sin explicación es justo lo que
// nadie puede auditar después. Para dejar la existencia igual a lo que hay en el
// anaquel usa el conteo físico, no esto.
// Solo admin (y superadmin con escuela_id). El producto debe ser del colegio y
// tener control. Idempotente por idem_key (un doble clic no ajusta dos veces).
$ctx = inventario_ctx($pdo, $usuario_actual, $input, ['admin', 'superadmin'], true);
$esc = $ctx['escuela_id'];

$llave = trim(strval($input['idem_key'] ?? ''));
if (!preg_match('/^[A-Za-z0-9_-]{8,64}$/', $llave)) {
    respond(['success' => false, 'error' => 'Falta la llave de la operación. Recarga la pantalla e intenta de nuevo.']);
}
$tipo = strval($input['tipo'] ?? '');
$item = inventario_item_propio($pdo, $ctx, $tipo, intval($input['item_id'] ?? 0));
if (!intval($item['maneja_existencias'])) {
    respond(['success' => false, 'error' => 'Este producto no maneja existencias. Actívalo primero.']);
}
$cant = inventario_ajuste_valido($input['cantidad'] ?? null);
if ($cant === null) respond(['success' => false, 'error' => 'La cantidad del ajuste debe ser un entero distinto de cero (con signo: negativo resta).']);
$motivo = trim(strval($input['motivo'] ?? ''));
if (mb_strlen($motivo) < 3) respond(['success' => false, 'error' => 'Escribe el motivo del ajuste (mínimo 3 caracteres).']);
if (mb_strlen($motivo) > 255) respond(['success' => false, 'error' => 'El motivo no puede pasar de 255 caracteres.']);

$m = null;
try {
    $pdo->beginTransaction();
    inventario_asegurar($pdo, $esc, $tipo, intval($item['id']));
    inventario_bloquear($pdo, $tipo, intval($item['id']));
    $m = inventario_mover($pdo, $esc, $tipo, intval($item['id']), 'ajuste', $cant,
        inventario_idem_lote('ajuste', $esc, $llave, 0), ['motivo' => $motivo, 'usuario_id' => $ctx['user_id']]);
    $pdo->commit();
} catch (\Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    inventario_fallo($e, 'inventario_ajuste');
}
if (!$m['duplicado']) {
    registrar_log($pdo, $usuario_actual, 'inventario_ajuste',
        "Ajuste de {$tipo} #{$item['id']} ({$item['nombre']}): " . ($cant > 0 ? '+' : '') . $cant . ". Motivo: {$motivo}", $esc);
}
respond(['success' => true, 'duplicado' => $m['duplicado'], 'existencia' => $m['existencia_despues'],
    'alertas' => inventario_alertas_contar($pdo, $esc)]);
