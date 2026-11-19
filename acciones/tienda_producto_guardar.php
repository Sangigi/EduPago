<?php
// tienda_producto_guardar {id?, nombre, precio, activo} — alta/edición del catálogo (F6).
//
// Solo admin. El precio se acota a 0.50..MONEDERO_VENTA_MAX. Al editar se
// comprueba que el producto sea de SU colegio. No se borran productos (las
// ventas guardan snapshot de nombre y precio, pero se conserva el historial):
// se desactivan con activo = 0. NO se corta con el módulo apagado: es solo
// catálogo, no mueve dinero.
$ctx = monedero_ctx($pdo, $usuario_actual, $input, ['admin']);

$id = intval($input['id'] ?? 0);
$nombre = trim(strval($input['nombre'] ?? ''));
if ($nombre === '' || mb_strlen($nombre) > 80) {
    respond(['success' => false, 'error' => 'El nombre del producto es obligatorio y puede tener hasta 80 caracteres.']);
}
$precio = monedero_monto_valido($input['precio'] ?? null, 0.50, MONEDERO_VENTA_MAX);
if ($precio === null) {
    respond(['success' => false, 'error' => 'El precio debe estar entre $0.50 y $' . number_format(MONEDERO_VENTA_MAX, 0) . '.']);
}
$activo = (!array_key_exists('activo', $input) || (!empty($input['activo']) && strval($input['activo']) !== '0')) ? 1 : 0;

try {
    if ($id) {
        $st = $pdo->prepare("SELECT escuela_id FROM tienda_productos WHERE id = ?");
        $st->execute([$id]);
        $fila = $st->fetch();
        if (!$fila) respond(['success' => false, 'error' => 'Producto no encontrado.']);
        if (intval($fila['escuela_id']) !== $ctx['escuela_id']) {
            monedero_403('Ese producto no pertenece a tu colegio.');
        }
        $pdo->prepare("UPDATE tienda_productos SET nombre = ?, precio = ?, activo = ? WHERE id = ? AND escuela_id = ?")
            ->execute([$nombre, $precio, $activo, $id, $ctx['escuela_id']]);
    } else {
        $pdo->prepare("INSERT INTO tienda_productos (escuela_id, nombre, precio, activo) VALUES (?, ?, ?, ?)")
            ->execute([$ctx['escuela_id'], $nombre, $precio, $activo]);
        $id = intval($pdo->lastInsertId());
    }
} catch (\Throwable $e) {
    monedero_fallo($e, 'tienda_producto_guardar');
}
respond(['success' => true, 'producto' => ['id' => $id, 'nombre' => $nombre, 'precio' => $precio, 'activo' => (bool) $activo]]);
