<?php
// inventario_entrada — entrada de mercancía (OF-6).
//
// Body: {
//   lineas: [{tipo: 'concepto'|'tienda', item_id, cantidad, costo_unitario?}],   (1 a 30)
//   proveedor_id?, nota?,
//   registrar_gasto?: true, forma_pago?, fecha?,      // el gasto por el TOTAL de la entrada
//   idem_key                                          // una por intento, la pone el navegador
// }
//
// Solo admin (y superadmin con escuela_id). Todo corre en UNA transacción: o entran
// todas las piezas (y el gasto, si se pidió) o no entra nada. Cada renglón es un
// movimiento 'entrada' en el libro (idem derivada de idem_key + renglón): reintentar
// el mismo envío devuelve la entrada ya hecha sin duplicar piezas ni el gasto.
//
// El gasto (casilla "Registrar también como gasto") se inserta con el MISMO SQL y las
// mismas validaciones que acciones/crear_gasto.php: proveedor del MISMO colegio, forma
// de pago de la lista, fecha Y-m-d, monto > 0 y sección 'gastos' habilitada. Exige
// costo unitario en todos los renglones (sin costo no hay total).
$ctx = inventario_ctx($pdo, $usuario_actual, $input, ['admin', 'superadmin'], true);
$esc = $ctx['escuela_id'];

$llave = trim(strval($input['idem_key'] ?? ''));
if (!preg_match('/^[A-Za-z0-9_-]{8,64}$/', $llave)) {
    respond(['success' => false, 'error' => 'Falta la llave de la operación. Recarga la pantalla e intenta de nuevo.']);
}

$lineas_in = $input['lineas'] ?? [];
if (!is_array($lineas_in) || !$lineas_in) respond(['success' => false, 'error' => 'Agrega al menos un producto a la entrada.']);
if (count($lineas_in) > 30) respond(['success' => false, 'error' => 'Una entrada admite hasta 30 productos. Divídela en dos.']);

$lineas = []; $vistos = [];
foreach (array_values($lineas_in) as $i => $l) {
    $n = $i + 1;
    $tipo = strval($l['tipo'] ?? '');
    $item = inventario_item_propio($pdo, $ctx, $tipo, intval($l['item_id'] ?? 0));
    if (!intval($item['maneja_existencias'])) {
        respond(['success' => false, 'error' => "«{$item['nombre']}» no maneja existencias. Actívalo en Inventario primero."]);
    }
    $clave = $tipo . ':' . $item['id'];
    if (isset($vistos[$clave])) respond(['success' => false, 'error' => "«{$item['nombre']}» aparece dos veces en la entrada. Suma las piezas en un solo renglón."]);
    $vistos[$clave] = true;
    $cant = inventario_cantidad_valida($l['cantidad'] ?? null);
    if ($cant === null) respond(['success' => false, 'error' => "Renglón {$n} («{$item['nombre']}»): la cantidad debe ser un entero entre 1 y " . number_format(INVENTARIO_CANTIDAD_MAX) . '.']);
    list($costo_ok, $costo_c) = inventario_costo_valido($l['costo_unitario'] ?? null);
    if (!$costo_ok) respond(['success' => false, 'error' => "Renglón {$n} («{$item['nombre']}»): el costo unitario no es válido."]);
    $lineas[] = ['indice' => $i, 'tipo' => $tipo, 'item_id' => intval($item['id']), 'nombre' => $item['nombre'],
                 'cantidad' => $cant, 'costo_c' => $costo_c];
}

// Proveedor (opcional): debe ser de ESTE colegio.
$proveedor_id = intval($input['proveedor_id'] ?? 0) ?: null;
if ($proveedor_id) {
    $chk = $pdo->prepare("SELECT id FROM proveedores WHERE id = ? AND escuela_id = ?");
    $chk->execute([$proveedor_id, $esc]);
    if (!$chk->fetch()) respond(['success' => false, 'error' => 'El proveedor no corresponde a un proveedor de este colegio.']);
}
$nota = mb_substr(trim(strval($input['nota'] ?? '')), 0, 200);

// Gasto opcional.
$registrar_gasto = !empty($input['registrar_gasto']) && strval($input['registrar_gasto']) !== '0';
$gasto_total_c = null; $forma_pago = ''; $fecha = date('Y-m-d');
if ($registrar_gasto) {
    requerir_seccion_habilitada($pdo, $ctx['rol'], $esc, ['gastos'], 'La sección de Gastos no está habilitada para este colegio.');
    $gasto_total_c = inventario_total_entrada_c($lineas);
    if ($gasto_total_c === null) respond(['success' => false, 'error' => 'Para registrar el gasto, captura el costo unitario de todos los productos.']);
    if ($gasto_total_c <= 0) respond(['success' => false, 'error' => 'El total de la compra debe ser mayor a cero para registrarla como gasto.']);
    $forma_pago = trim(strval($input['forma_pago'] ?? ''));
    if (!in_array($forma_pago, INVENTARIO_FORMAS_PAGO_GASTO, true)) respond(['success' => false, 'error' => 'Elige la forma de pago del gasto.']);
    $fecha = trim(strval($input['fecha'] ?? '')) ?: date('Y-m-d');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha) || !checkdate(intval(substr($fecha, 5, 2)), intval(substr($fecha, 8, 2)), intval(substr($fecha, 0, 4)))) {
        respond(['success' => false, 'error' => 'La fecha del gasto no es válida.']);
    }
}

// Bloqueo en orden fijo (tipo, id) para que dos entradas simultáneas no se esperen en círculo.
$orden = $lineas;
usort($orden, function ($a, $b) { return [$a['tipo'], $a['item_id']] <=> [$b['tipo'], $b['item_id']]; });

$duplicado = false; $gasto_id = null; $resultado = []; $resumen = [];
try {
    $pdo->beginTransaction();
    foreach ($orden as $l) inventario_asegurar($pdo, $esc, $l['tipo'], $l['item_id']);
    foreach ($orden as $l) inventario_bloquear($pdo, $l['tipo'], $l['item_id']);

    // Reintento: si el primer renglón ya está en el libro, esta entrada ya se hizo.
    $prev = $pdo->prepare("SELECT 1 FROM inventario_movimientos WHERE idem_key = ? LIMIT 1");
    $prev->execute([inventario_idem_lote('entrada', $esc, $llave, 0)]);
    if ($prev->fetchColumn()) {
        $pdo->rollBack();
        $duplicado = true;
    }

    if (!$duplicado) {
        foreach ($lineas as $l) $resumen[] = $l['cantidad'] . ' × ' . $l['nombre'];
        if ($registrar_gasto) {
            $gasto_id = inventario_insertar_gasto($pdo, $esc, $proveedor_id,
                'Compra de mercancía: ' . implode(', ', $resumen), $gasto_total_c / 100, $fecha, $forma_pago, $ctx['user_id'] ?: null);
        }

        foreach ($lineas as $l) {
            $m = inventario_mover($pdo, $esc, $l['tipo'], $l['item_id'], 'entrada', $l['cantidad'],
                inventario_idem_lote('entrada', $esc, $llave, $l['indice']), [
                    'costo_c' => $l['costo_c'], 'proveedor_id' => $proveedor_id, 'gasto_id' => $gasto_id,
                    'motivo' => $nota !== '' ? $nota : 'Entrada de mercancía', 'usuario_id' => $ctx['user_id'],
                ]);
            $resultado[] = ['tipo' => $l['tipo'], 'item_id' => $l['item_id'], 'nombre' => $l['nombre'],
                            'cantidad' => $l['cantidad'], 'existencia_despues' => $m['existencia_despues']];
        }
        $pdo->commit();
    }
} catch (\Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    inventario_fallo($e, 'inventario_entrada');
}

if ($duplicado) respond(['success' => true, 'duplicado' => true, 'alertas' => inventario_alertas_contar($pdo, $esc)]);
registrar_log($pdo, $usuario_actual, 'inventario_entrada',
    'Entrada de mercancía: ' . implode(', ', $resumen) . ($gasto_id ? " (gasto #{$gasto_id}, \$" . number_format($gasto_total_c / 100, 2) . ")" : ''), $esc);
if ($gasto_id) {
    registrar_log($pdo, $usuario_actual, 'gasto_creado',
        "Gasto #{$gasto_id}: Compra de mercancía, \$" . number_format($gasto_total_c / 100, 2) . ", {$forma_pago} (desde Inventario)", $esc);
}
respond(['success' => true, 'duplicado' => false, 'lineas' => $resultado, 'gasto_id' => $gasto_id,
    'alertas' => inventario_alertas_contar($pdo, $esc)]);
