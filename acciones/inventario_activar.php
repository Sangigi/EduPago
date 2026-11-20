<?php
// inventario_activar {tipo, item_id, maneja} — activa o desactiva el control de
// existencias de un producto (OF-6).
//
// Solo admin (y superadmin con escuela_id). El producto debe ser del colegio de
// la sesión. Un concepto solo puede controlarse si es de categoría física y no
// es recurrente ni un descuento (inventario_concepto_elegible). Desactivar no
// borra la existencia ni el historial: solo deja de moverse con las ventas.
$ctx = inventario_ctx($pdo, $usuario_actual, $input, ['admin', 'superadmin'], true);

$tipo = strval($input['tipo'] ?? '');
$item_id = intval($input['item_id'] ?? 0);
$maneja = !empty($input['maneja']) && strval($input['maneja']) !== '0';
$item = inventario_item_propio($pdo, $ctx, $tipo, $item_id);

try {
    inventario_fijar_control($pdo, $ctx['escuela_id'], $tipo, $item_id, $maneja);
} catch (\Throwable $e) {
    inventario_fallo($e, 'inventario_activar');
}
registrar_log($pdo, $usuario_actual, $maneja ? 'inventario_activado' : 'inventario_desactivado',
    "Inventario " . ($maneja ? 'activado' : 'desactivado') . " para {$tipo} #{$item_id} ({$item['nombre']})", $ctx['escuela_id']);
respond(['success' => true, 'tipo' => $tipo, 'item_id' => $item_id, 'maneja' => $maneja,
    'alertas' => inventario_alertas_contar($pdo, $ctx['escuela_id'])]);
