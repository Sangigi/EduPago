<?php
// tienda_productos_listar — catálogo de la tiendita del colegio (F6).
//
// Roles: tienda y admin. El vendedor solo ve los activos; el admin puede pedir
// también los inactivos con todos=1 (para administrar el catálogo).
$ctx = monedero_ctx($pdo, $usuario_actual, $input, ['tienda', 'admin']);

$todos = $ctx['rol'] === 'admin' && !empty($input['todos'] ?? $_GET['todos'] ?? 0);
$st = $pdo->prepare(
    "SELECT id, nombre, precio, activo FROM tienda_productos
      WHERE escuela_id = ?" . ($todos ? '' : ' AND activo = 1') . "
      ORDER BY activo DESC, nombre"
);
$st->execute([$ctx['escuela_id']]);
$productos = array_map(function ($p) {
    return ['id' => intval($p['id']), 'nombre' => $p['nombre'],
            'precio' => round(floatval($p['precio']), 2), 'activo' => (bool) intval($p['activo'])];
}, $st->fetchAll());
respond(['success' => true, 'productos' => $productos]);
