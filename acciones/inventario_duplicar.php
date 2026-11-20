<?php
// inventario_duplicar {tipo, item_id, nombre} — "Duplicar como otra talla" (OF-6).
//
// Sin variantes en esta versión: cada talla es su propio producto ("Playera deportiva
// T8"). Para no capturar todo de nuevo, esto copia un producto con otro nombre: misma
// categoría, precio, emoji y datos fiscales (concepto) o mismo precio (tiendita), con
// control de existencias ya activo, existencia 0 y el mismo mínimo. El original no se toca.
// Solo admin (y superadmin con escuela_id); el original debe ser del colegio.
$ctx = inventario_ctx($pdo, $usuario_actual, $input, ['admin', 'superadmin'], true);
$esc = $ctx['escuela_id'];

$tipo = strval($input['tipo'] ?? '');
$orig = inventario_item_propio($pdo, $ctx, $tipo, intval($input['item_id'] ?? 0));
$nombre = trim(strval($input['nombre'] ?? ''));
if ($nombre === '' || mb_strlen($nombre) > ($tipo === 'tienda' ? 80 : 100)) {
    respond(['success' => false, 'error' => 'Escribe el nombre del producto nuevo (por ejemplo "Playera deportiva T10").']);
}
if (mb_strtolower($nombre) === mb_strtolower(trim($orig['nombre']))) {
    respond(['success' => false, 'error' => 'El nombre debe ser distinto al del original (incluye la talla).']);
}

$nuevo_id = 0; $producto = null;
try {
    $minimo = 0;
    $st = $pdo->prepare("SELECT minimo FROM inventario_existencias WHERE tipo = ? AND item_id = ?");
    $st->execute([$tipo, intval($orig['id'])]);
    $minimo = intval($st->fetchColumn());

    $pdo->beginTransaction();
    if ($tipo === 'concepto') {
        require_once __DIR__ . '/../lib/helpers_impuestos.php';
        $razon = inventario_concepto_elegible($orig['categoria'], $orig['tipo_concepto'], $orig['precio']);
        if ($razon !== null) throw new InventarioError($razon);
        // Datos propios del original que no trae inventario_item().
        $so = $pdo->prepare("SELECT emoji" . (impuestos_productos_listos($pdo) ? ', iva_tasa, clave_sat, clave_unidad' : '') . " FROM productos WHERE id = ? AND escuela_id = ?");
        $so->execute([intval($orig['id']), $esc]);
        $fo = $so->fetch() ?: [];
        // Mismas columnas que acciones/crear_producto.php para un concepto único.
        $cols = 'escuela_id, nombre, categoria, precio, emoji, activo, tipo, periodicidad_meses, fecha_inicio, dia_ventana_inicio, dia_ventana_fin, penalizacion_tipo, penalizacion_valor, maneja_existencias';
        $vals = [$esc, $nombre, $orig['categoria'], $orig['precio'], $fo['emoji'] ?? '', 1, 'unico', null, null, 1, 5, null, null, 1];
        if (isset($fo['iva_tasa'])) {
            $cols .= ', iva_tasa, clave_sat, clave_unidad';
            array_push($vals, $fo['iva_tasa'], $fo['clave_sat'], $fo['clave_unidad']);
        }
        $pdo->prepare("INSERT INTO productos ({$cols}) VALUES (" . implode(', ', array_fill(0, count($vals), '?')) . ")")->execute($vals);
    } else {
        $pdo->prepare("INSERT INTO tienda_productos (escuela_id, nombre, precio, activo, maneja_existencias) VALUES (?, ?, ?, 1, 1)")
            ->execute([$esc, $nombre, $orig['precio']]);
    }
    $nuevo_id = intval($pdo->lastInsertId());
    inventario_asegurar($pdo, $esc, $tipo, $nuevo_id);
    if ($minimo > 0) {
        $pdo->prepare("UPDATE inventario_existencias SET minimo = ? WHERE tipo = ? AND item_id = ?")->execute([$minimo, $tipo, $nuevo_id]);
    }
    $pdo->commit();
    if ($tipo === 'concepto') {
        $sp = $pdo->prepare("SELECT * FROM productos WHERE id = ?");
        $sp->execute([$nuevo_id]);
        $producto = $sp->fetch() ?: null;
        if ($producto) { $producto['activo'] = (bool) $producto['activo']; $producto['precio'] = floatval($producto['precio']); }
    }
} catch (\Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    inventario_fallo($e, 'inventario_duplicar');
}
registrar_log($pdo, $usuario_actual, 'inventario_duplicado',
    "Producto {$tipo} #{$nuevo_id} ({$nombre}) creado como copia de #{$orig['id']} ({$orig['nombre']})", $esc);
respond(['success' => true, 'item' => ['tipo' => $tipo, 'id' => $nuevo_id, 'nombre' => $nombre],
    'producto' => $producto, 'alertas' => inventario_alertas_contar($pdo, $esc)]);
