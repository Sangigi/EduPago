<?php
// inventario_listar — existencias del colegio (OF-6). Solo lectura.
//
// Roles: admin y superadmin (este con escuela_id). Devuelve:
//   items       los productos CON control de existencias (conceptos + tiendita),
//               con existencia, mínimo, último costo y estado
//               ('agotado' <= 0, 'bajo' <= mínimo, 'ok'); negativo = true si < 0.
//   sin_control productos que se podrían controlar y todavía no (para el botón
//               "Controlar" de la pantalla): conceptos de categoría física y
//               productos de la tiendita.
//   alertas     {agotados, bajos, negativos}, la misma consulta agregada del
//               aviso del Dashboard.
//   tienda      si existe la columna de la tiendita (si no, solo conceptos).
// Los precios y nombres salen de las tablas del colegio; nada del input.
$ctx = inventario_ctx($pdo, $usuario_actual, $input, ['admin', 'superadmin']);
$esc = $ctx['escuela_id'];
$con_tienda = inventario_tienda_listo($pdo);

$items = [];
$st = $pdo->prepare(
    "SELECT p.id, p.nombre, p.categoria, p.precio, p.activo,
            COALESCE(e.existencia, 0) AS existencia, COALESCE(e.minimo, 0) AS minimo, e.ultimo_costo
       FROM productos p
       LEFT JOIN inventario_existencias e ON e.tipo = 'concepto' AND e.item_id = p.id
      WHERE p.escuela_id = ? AND p.maneja_existencias = 1
      ORDER BY p.nombre LIMIT 2000"
);
$st->execute([$esc]);
foreach ($st->fetchAll() as $f) {
    $items[] = ['tipo' => 'concepto', 'id' => intval($f['id']), 'nombre' => $f['nombre'], 'categoria' => $f['categoria'],
        'precio' => round(floatval($f['precio']), 2), 'activo' => (bool) intval($f['activo']),
        'existencia' => intval($f['existencia']), 'minimo' => intval($f['minimo']),
        'ultimo_costo' => $f['ultimo_costo'] !== null ? round(floatval($f['ultimo_costo']), 2) : null];
}
if ($con_tienda) {
    $st = $pdo->prepare(
        "SELECT t.id, t.nombre, t.precio, t.activo,
                COALESCE(e.existencia, 0) AS existencia, COALESCE(e.minimo, 0) AS minimo, e.ultimo_costo
           FROM tienda_productos t
           LEFT JOIN inventario_existencias e ON e.tipo = 'tienda' AND e.item_id = t.id
          WHERE t.escuela_id = ? AND t.maneja_existencias = 1
          ORDER BY t.nombre LIMIT 2000"
    );
    $st->execute([$esc]);
    foreach ($st->fetchAll() as $f) {
        $items[] = ['tipo' => 'tienda', 'id' => intval($f['id']), 'nombre' => $f['nombre'], 'categoria' => null,
            'precio' => round(floatval($f['precio']), 2), 'activo' => (bool) intval($f['activo']),
            'existencia' => intval($f['existencia']), 'minimo' => intval($f['minimo']),
            'ultimo_costo' => $f['ultimo_costo'] !== null ? round(floatval($f['ultimo_costo']), 2) : null];
    }
}
foreach ($items as $i => $it) {
    $items[$i]['estado'] = inventario_estado($it['existencia'], $it['minimo']);
    $items[$i]['negativo'] = $it['existencia'] < 0;
}

// Lo que se podría controlar y aún no (activos; conceptos únicos de categoría física).
$sin_control = [];
$ph = implode(',', array_fill(0, count(INVENTARIO_CATEGORIAS_FISICAS), '?'));
$st = $pdo->prepare(
    "SELECT id, nombre, categoria, precio FROM productos
      WHERE escuela_id = ? AND maneja_existencias = 0 AND activo = 1 AND tipo = 'unico' AND precio >= 0
        AND categoria IN ({$ph}) ORDER BY nombre LIMIT 500"
);
$st->execute(array_merge([$esc], INVENTARIO_CATEGORIAS_FISICAS));
foreach ($st->fetchAll() as $f) {
    $sin_control[] = ['tipo' => 'concepto', 'id' => intval($f['id']), 'nombre' => $f['nombre'],
        'categoria' => $f['categoria'], 'precio' => round(floatval($f['precio']), 2)];
}
if ($con_tienda) {
    $st = $pdo->prepare("SELECT id, nombre, precio FROM tienda_productos WHERE escuela_id = ? AND maneja_existencias = 0 AND activo = 1 ORDER BY nombre LIMIT 500");
    $st->execute([$esc]);
    foreach ($st->fetchAll() as $f) {
        $sin_control[] = ['tipo' => 'tienda', 'id' => intval($f['id']), 'nombre' => $f['nombre'],
            'categoria' => null, 'precio' => round(floatval($f['precio']), 2)];
    }
}

respond(['success' => true, 'items' => $items, 'sin_control' => $sin_control,
    'alertas' => inventario_alertas_contar($pdo, $esc), 'tienda' => $con_tienda]);
