<?php
// inventario_conteo — conteo físico (OF-6).
//
// Body: { lineas: [{tipo, item_id, contado, esperado?}], motivo, idem_key }
//   · `contado`: lo que hay en el anaquel (entero >= 0). Los renglones sin capturar
//     NO se mandan (no se tocan).
//   · `esperado`: la existencia que mostraba la hoja cuando se abrió; solo sirve para
//     AVISAR qué productos tuvieron movimiento mientras se contaba (la venta no se
//     detiene), no cambia lo que se escribe.
//   · `motivo`: obligatorio (mínimo 3 caracteres), p. ej. "Inventario de agosto".
//
// Por cada producto cuya existencia (según el LIBRO, bajo candado) difiere de lo contado
// se escribe un movimiento 'conteo' por la diferencia (contado - existencia): la existencia
// queda exactamente en lo contado. Los iguales no escriben nada. Todo en UNA transacción
// (o se aplica el conteo completo o nada), con los renglones bloqueados en orden fijo.
//
// Si la tienda vende mientras se cuenta, la diferencia se calcula contra la existencia DE
// ESE MOMENTO: cuenta con la tienda cerrada o revisa la lista `cambiaron` de la respuesta.
// Solo admin (y superadmin con escuela_id). Productos del colegio y con control.
$ctx = inventario_ctx($pdo, $usuario_actual, $input, ['admin', 'superadmin'], true);
$esc = $ctx['escuela_id'];

$llave = trim(strval($input['idem_key'] ?? ''));
if (!preg_match('/^[A-Za-z0-9_-]{8,64}$/', $llave)) {
    respond(['success' => false, 'error' => 'Falta la llave de la operación. Recarga la pantalla e intenta de nuevo.']);
}
$motivo = trim(strval($input['motivo'] ?? ''));
if (mb_strlen($motivo) < 3) respond(['success' => false, 'error' => 'Escribe el motivo del conteo (mínimo 3 caracteres), p. ej. "Inventario de fin de ciclo".']);
if (mb_strlen($motivo) > 200) respond(['success' => false, 'error' => 'El motivo no puede pasar de 200 caracteres.']);

$lineas_in = $input['lineas'] ?? [];
if (!is_array($lineas_in) || !$lineas_in) respond(['success' => false, 'error' => 'Captura lo contado de al menos un producto.']);
if (count($lineas_in) > 500) respond(['success' => false, 'error' => 'Un conteo admite hasta 500 productos a la vez.']);

$lineas = []; $contados = []; $esperados = []; $vistos = [];
foreach (array_values($lineas_in) as $i => $l) {
    $tipo = strval($l['tipo'] ?? '');
    $item = inventario_item_propio($pdo, $ctx, $tipo, intval($l['item_id'] ?? 0));
    if (!intval($item['maneja_existencias'])) {
        respond(['success' => false, 'error' => "«{$item['nombre']}» no maneja existencias."]);
    }
    $clave = $tipo . ':' . $item['id'];
    if (isset($vistos[$clave])) respond(['success' => false, 'error' => "«{$item['nombre']}» aparece dos veces en el conteo."]);
    $vistos[$clave] = true;
    $contado = inventario_contado_valido($l['contado'] ?? null);
    if ($contado === null) respond(['success' => false, 'error' => "«{$item['nombre']}»: lo contado debe ser un entero de 0 en adelante."]);
    $lineas[$clave] = ['indice' => $i, 'tipo' => $tipo, 'item_id' => intval($item['id']), 'nombre' => $item['nombre']];
    $contados[$clave] = $contado;
    if (isset($l['esperado']) && $l['esperado'] !== '' && is_numeric($l['esperado'])) $esperados[$clave] = intval($l['esperado']);
}

// Orden fijo de bloqueo.
$claves = array_keys($lineas);
usort($claves, function ($a, $b) use ($lineas) {
    return [$lineas[$a]['tipo'], $lineas[$a]['item_id']] <=> [$lineas[$b]['tipo'], $lineas[$b]['item_id']];
});

$aplicados = []; $cambiaron = []; $iguales = 0;
try {
    $pdo->beginTransaction();
    foreach ($claves as $k) inventario_asegurar($pdo, $esc, $lineas[$k]['tipo'], $lineas[$k]['item_id']);
    foreach ($claves as $k) inventario_bloquear($pdo, $lineas[$k]['tipo'], $lineas[$k]['item_id']);

    $actuales = [];
    foreach ($claves as $k) $actuales[$k] = inventario_existencia_libro($pdo, $lineas[$k]['tipo'], $lineas[$k]['item_id']);
    $plan = inventario_conteo_plan($actuales, $contados);
    $iguales = count($contados) - count($plan);

    foreach ($plan as $p) {
        $l = $lineas[$p['clave']];
        $m = inventario_mover($pdo, $esc, $l['tipo'], $l['item_id'], 'conteo', $p['diferencia'],
            inventario_idem_lote('conteo', $esc, $llave, $l['indice']),
            ['motivo' => 'Conteo físico: ' . $motivo, 'usuario_id' => $ctx['user_id']]);
        if ($m['duplicado']) { $iguales++; continue; } // un reintento: ya estaba aplicado
        $aplicados[] = ['tipo' => $l['tipo'], 'item_id' => $l['item_id'], 'nombre' => $l['nombre'],
                        'antes' => $p['actual'], 'contado' => $p['contado'], 'diferencia' => $p['diferencia']];
    }
    foreach ($esperados as $k => $esp) {
        if (isset($actuales[$k]) && $actuales[$k] !== $esp) {
            $cambiaron[] = ['tipo' => $lineas[$k]['tipo'], 'item_id' => $lineas[$k]['item_id'], 'nombre' => $lineas[$k]['nombre'],
                            'esperado' => $esp, 'habia' => $actuales[$k]];
        }
    }
    $pdo->commit();
} catch (\Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    inventario_fallo($e, 'inventario_conteo');
}
if ($aplicados) {
    $r = [];
    foreach (array_slice($aplicados, 0, 15) as $a) $r[] = "{$a['nombre']} {$a['antes']}→{$a['contado']}";
    registrar_log($pdo, $usuario_actual, 'inventario_conteo',
        'Conteo físico (' . $motivo . '): ' . count($aplicados) . ' ajustados, ' . $iguales . ' sin diferencia. ' . implode('; ', $r) . (count($aplicados) > 15 ? '…' : ''), $esc);
}
respond(['success' => true, 'aplicados' => $aplicados, 'sin_diferencia' => $iguales, 'cambiaron' => $cambiaron,
    'alertas' => inventario_alertas_contar($pdo, $esc)]);
