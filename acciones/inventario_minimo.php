<?php
// inventario_minimo {tipo, item_id, minimo} — el mínimo a partir del cual avisa
// "queda poco" (OF-6). 0 = sin aviso de poco (solo avisa cuando se acaba).
// Solo admin / superadmin; el producto debe ser del colegio y tener control.
$ctx = inventario_ctx($pdo, $usuario_actual, $input, ['admin', 'superadmin'], true);

$tipo = strval($input['tipo'] ?? '');
$item_id = intval($input['item_id'] ?? 0);
$item = inventario_item_propio($pdo, $ctx, $tipo, $item_id);
if (!intval($item['maneja_existencias'])) {
    respond(['success' => false, 'error' => 'Este producto no maneja existencias. Actívalo primero.']);
}
$minimo = inventario_contado_valido($input['minimo'] ?? null);
if ($minimo === null || $minimo > INVENTARIO_CANTIDAD_MAX) {
    respond(['success' => false, 'error' => 'El mínimo debe ser un número entero de 0 en adelante.']);
}
try {
    inventario_asegurar($pdo, $ctx['escuela_id'], $tipo, $item_id);
    $pdo->prepare("UPDATE inventario_existencias SET minimo = ?, actualizado_en = NOW() WHERE tipo = ? AND item_id = ? AND escuela_id = ?")
        ->execute([$minimo, $tipo, $item_id, $ctx['escuela_id']]);
} catch (\Throwable $e) {
    inventario_fallo($e, 'inventario_minimo');
}
respond(['success' => true, 'minimo' => $minimo, 'alertas' => inventario_alertas_contar($pdo, $ctx['escuela_id'])]);
