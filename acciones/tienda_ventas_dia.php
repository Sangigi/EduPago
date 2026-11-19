<?php
// tienda_ventas_dia {fecha?} — ventas de la tiendita de un día, con el corte (F6).
//
// tienda: SOLO sus propias ventas y SOLO de hoy (la fecha del input se ignora).
// admin: todas las del colegio, de cualquier fecha (Y-m-d).
// Lectura: no se corta con el módulo apagado.
$ctx = monedero_ctx($pdo, $usuario_actual, $input, ['tienda', 'admin']);
$es_tienda = $ctx['rol'] === 'tienda';

$fecha = date('Y-m-d');
if (!$es_tienda) {
    $f = trim(strval($input['fecha'] ?? $_GET['fecha'] ?? ''));
    $d = DateTime::createFromFormat('Y-m-d', $f);
    if ($d && $d->format('Y-m-d') === $f) $fecha = $f;
}

$sql = "SELECT v.id, v.cliente_id, v.total, v.estado, v.usuario_id, v.creado_en, v.cancelada_en,
               cl.nombre AS alumno, cl.matricula, u.nombre AS vendedor
          FROM tienda_ventas v
          JOIN clientes cl ON cl.id = v.cliente_id
          LEFT JOIN usuarios u ON u.id = v.usuario_id
         WHERE v.escuela_id = ? AND v.creado_en >= ? AND v.creado_en < DATE_ADD(?, INTERVAL 1 DAY)";
$params = [$ctx['escuela_id'], $fecha, $fecha];
if ($es_tienda) { $sql .= " AND v.usuario_id = ?"; $params[] = $ctx['user_id']; }
$sql .= " ORDER BY v.id DESC LIMIT 500";
$st = $pdo->prepare($sql);
$st->execute($params);
$filas = $st->fetchAll();

$items = [];
if ($filas) {
    $ids = array_map(function ($f) { return intval($f['id']); }, $filas);
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $si = $pdo->prepare("SELECT venta_id, nombre, cantidad, precio_unitario, subtotal FROM tienda_venta_items WHERE venta_id IN ($ph) ORDER BY id");
    $si->execute($ids);
    foreach ($si->fetchAll() as $it) {
        $items[intval($it['venta_id'])][] = [
            'nombre' => $it['nombre'], 'cantidad' => intval($it['cantidad']),
            'precio_unitario' => round(floatval($it['precio_unitario']), 2), 'subtotal' => round(floatval($it['subtotal']), 2),
        ];
    }
}

$hoy = date('Y-m-d');
$corte = ['completadas' => ['n' => 0, 'total' => 0.0], 'canceladas' => ['n' => 0, 'total' => 0.0]];
$ventas = [];
foreach ($filas as $f) {
    $total_c = monedero_c($f['total']);
    $clave = $f['estado'] === 'completada' ? 'completadas' : 'canceladas';
    $corte[$clave]['n']++;
    $corte[$clave]['total'] = monedero_p(monedero_c($corte[$clave]['total']) + $total_c);
    $propia = intval($f['usuario_id']) === $ctx['user_id'];
    $ventas[] = [
        'id' => intval($f['id']), 'cliente_id' => intval($f['cliente_id']),
        'alumno' => $f['alumno'], 'matricula' => $f['matricula'], 'vendedor' => $f['vendedor'],
        'total' => monedero_p($total_c), 'estado' => $f['estado'],
        'creado_en' => $f['creado_en'], 'cancelada_en' => $f['cancelada_en'],
        'items' => $items[intval($f['id'])] ?? [],
        // La interfaz solo ofrece cancelar lo que el servidor aceptaría.
        'puede_cancelar' => $f['estado'] === 'completada' && (!$es_tienda || ($propia && $fecha === $hoy)),
    ];
}
respond(['success' => true, 'fecha' => $fecha, 'ventas' => $ventas, 'corte' => $corte]);
