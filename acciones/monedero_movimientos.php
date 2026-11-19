<?php
// monedero_movimientos — libro del monedero de UN alumno, más recientes primero (F6).
//
// Mismos roles y reglas de pertenencia que monedero_saldo. `monto` viaja CON
// SIGNO (negativo = consumo o retiro) porque PortalAlumno lo pinta rojo/verde
// según el signo y no conoce el campo `tipo`.
$ctx = monedero_ctx($pdo, $usuario_actual, $input, ['familia', 'alumno', 'admin', 'cajero', 'superadmin']);

if ($ctx['rol'] === 'alumno') {
    $cliente_id = monedero_cliente_de_usuario_alumno($pdo, $usuario_actual);
    if ($cliente_id <= 0) respond(['success' => true, 'movimientos' => []]);
} else {
    $cliente_id = intval($input['cliente_id'] ?? $_GET['cliente_id'] ?? 0);
}
monedero_alumno($pdo, $ctx, $usuario_actual, $cliente_id);

$limite = intval($input['limite'] ?? 100);
if ($limite < 1 || $limite > 100) $limite = 100;

// Que el movimiento de una recarga recién pagada ya aparezca en la lista.
monedero_acreditar_recargas($pdo, $cliente_id);

// `limite` ya es un entero validado: se interpola porque LIMIT con parámetro
// ligado no siempre funciona con emulación apagada.
$st = $pdo->prepare(
    "SELECT id, creado_en, tipo, signo, monto, saldo_despues, descripcion
       FROM monedero_movimientos
      WHERE cliente_id = ? AND escuela_id = ?
      ORDER BY id DESC LIMIT {$limite}"
);
$st->execute([$cliente_id, $ctx['escuela_id']]);

$etiquetas = [
    'recarga' => 'Recarga',
    'consumo' => 'Compra en la tiendita',
    'ajuste'  => 'Ajuste del colegio',
    'reverso' => 'Devolución de compra',
];
$movs = [];
foreach ($st->fetchAll() as $r) {
    $movs[] = [
        'id'            => intval($r['id']),
        'fecha'         => $r['creado_en'],
        'tipo'          => $r['tipo'],
        'concepto'      => ($r['descripcion'] !== null && $r['descripcion'] !== '') ? $r['descripcion'] : ($etiquetas[$r['tipo']] ?? $r['tipo']),
        'monto'         => round(intval($r['signo']) * floatval($r['monto']), 2),
        'saldo_despues' => round(floatval($r['saldo_despues']), 2),
    ];
}
respond(['success' => true, 'movimientos' => $movs]);
