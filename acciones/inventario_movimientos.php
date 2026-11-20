<?php
// inventario_movimientos {tipo?, item_id?, antes_id?, limite?} — el libro de movimientos (OF-6).
//
// Solo lectura. Admin (y superadmin con escuela_id). Con tipo + item_id: la historia de
// UN producto; sin ellos: lo último de todo el colegio. Pagina hacia atrás con antes_id
// (el id más bajo de la página anterior). Cada renglón trae quién, cuándo, cuánto, la
// existencia que quedó, el motivo y el documento (cobro con su folio, venta de la
// tiendita, gasto). Todo filtrado por el colegio de la sesión.
$ctx = inventario_ctx($pdo, $usuario_actual, $input, ['admin', 'superadmin']);
$esc = $ctx['escuela_id'];

$donde = 'm.escuela_id = ?'; $params = [$esc];
$tipo = strval($input['tipo'] ?? '');
$item_id = intval($input['item_id'] ?? 0);
if ($tipo !== '' || $item_id) {
    $item = inventario_item_propio($pdo, $ctx, $tipo, $item_id); // valida tipo y colegio
    $donde .= ' AND m.tipo = ? AND m.item_id = ?';
    array_push($params, $tipo, intval($item['id']));
}
$antes_id = intval($input['antes_id'] ?? 0);
if ($antes_id > 0) { $donde .= ' AND m.id < ?'; $params[] = $antes_id; }
$limite = max(1, min(200, intval($input['limite'] ?? 50)));
$con_tienda = inventario_tienda_listo($pdo);

try {
    $sql = "SELECT m.id, m.creado_en, m.tipo, m.item_id, m.movimiento, m.cantidad, m.existencia_despues,
                   m.costo_unitario, m.motivo, m.cobro_id, m.venta_id, m.gasto_id,
                   " . ($con_tienda ? 'COALESCE(p.nombre, t.nombre)' : 'p.nombre') . " AS producto,
                   u.nombre AS usuario, pr.nombre AS proveedor, c.folio AS folio
              FROM inventario_movimientos m
              LEFT JOIN productos p ON m.tipo = 'concepto' AND p.id = m.item_id"
         . ($con_tienda ? " LEFT JOIN tienda_productos t ON m.tipo = 'tienda' AND t.id = m.item_id" : '') . "
              LEFT JOIN usuarios u ON u.id = m.usuario_id
              LEFT JOIN proveedores pr ON pr.id = m.proveedor_id
              LEFT JOIN cobros c ON c.id = m.cobro_id
             WHERE {$donde}
             ORDER BY m.id DESC
             LIMIT " . ($limite + 1);
    $st = $pdo->prepare($sql);
    $st->execute($params);
    $filas = $st->fetchAll();
} catch (\Throwable $e) {
    inventario_fallo($e, 'inventario_movimientos');
}
$hay_mas = count($filas) > $limite;
if ($hay_mas) array_pop($filas);
$movs = array_map(function ($f) {
    return [
        'id' => intval($f['id']), 'creado_en' => $f['creado_en'], 'tipo' => $f['tipo'], 'item_id' => intval($f['item_id']),
        'producto' => $f['producto'], 'movimiento' => $f['movimiento'], 'cantidad' => intval($f['cantidad']),
        'existencia_despues' => intval($f['existencia_despues']),
        'costo_unitario' => $f['costo_unitario'] !== null ? round(floatval($f['costo_unitario']), 2) : null,
        'motivo' => $f['motivo'], 'usuario' => $f['usuario'], 'proveedor' => $f['proveedor'],
        'cobro_id' => $f['cobro_id'] ? intval($f['cobro_id']) : null, 'folio' => $f['folio'],
        'venta_id' => $f['venta_id'] ? intval($f['venta_id']) : null,
        'gasto_id' => $f['gasto_id'] ? intval($f['gasto_id']) : null,
    ];
}, $filas);
respond(['success' => true, 'movimientos' => $movs, 'hay_mas' => $hay_mas]);
