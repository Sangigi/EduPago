<?php
// acciones/tesoreria_marcar_pagado.php
//
// Marca un gasto pendiente como pagado, dejando constancia de CUÁNDO se pagó
// de verdad — que no tiene por qué ser ni su fecha de captura ni su
// vencimiento. Sin ese dato no hay forma de medir si se está pagando a tiempo.
//
// También permite el camino inverso ('pendiente') para deshacer un error de
// dedo, y 'cancelado' para un gasto que al final no se va a pagar.
//
// Ver migracion_2026_09_22_provision_y_cuentas_por_pagar.sql.

requerir_rol($usuario_actual['rol'] ?? '', ['superadmin', 'tesoreria'], 'No tienes permiso para mover cuentas por pagar.');

$gasto_id = intval($input['gasto_id'] ?? 0);
$estado   = trim($input['estado'] ?? 'pagado');
$fecha    = trim($input['fecha_pago'] ?? '');

if (!$gasto_id) respond(['success' => false, 'error' => 'gasto_id requerido']);
if (!in_array($estado, ['pendiente', 'pagado', 'cancelado'], true)) {
    respond(['success' => false, 'error' => 'Estado inválido. Usa pendiente, pagado o cancelado.']);
}
// La fecha de pago solo aplica al estado 'pagado'. En los otros dos se limpia,
// para que no quede una fecha de pago colgando en un gasto que no se pagó.
if ($estado === 'pagado') {
    if ($fecha === '') $fecha = date('Y-m-d');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
        respond(['success' => false, 'error' => 'fecha_pago debe venir como YYYY-MM-DD.']);
    }
    // Una fecha de pago futura casi siempre es un error de captura, y
    // ensuciaría cualquier medición de puntualidad.
    if ($fecha > date('Y-m-d')) {
        respond(['success' => false, 'error' => 'La fecha de pago no puede ser futura.']);
    }
} else {
    $fecha = null;
}

try {
    $stmtG = $pdo->prepare(
        "SELECT g.id, g.escuela_id, g.concepto, g.monto, g.estado, p.nombre AS proveedor_nombre
           FROM gastos g LEFT JOIN proveedores p ON p.id = g.proveedor_id
          WHERE g.id = ?"
    );
    $stmtG->execute([$gasto_id]);
    $g = $stmtG->fetch();
} catch (\PDOException $e) {
    respond(['success' => false,
             'error' => 'Falta correr migracion_2026_09_22_provision_y_cuentas_por_pagar.sql en la base de datos.',
             'detalle' => $e->getMessage()]);
}

if (!$g) respond(['success' => false, 'error' => 'Gasto no encontrado']);
if ($g['estado'] === $estado) {
    respond(['success' => false, 'error' => 'Ese gasto ya está en estado "' . $estado . '".']);
}

$pdo->prepare("UPDATE gastos SET estado = ?, fecha_pago = ? WHERE id = ?")
    ->execute([$estado, $fecha, $gasto_id]);

registrar_log(
    $pdo, $usuario_actual, 'cuenta_por_pagar_actualizada',
    "Gasto #{$gasto_id} ({$g['concepto']}, \${$g['monto']}"
    . ($g['proveedor_nombre'] ? ", {$g['proveedor_nombre']}" : '')
    . "): {$g['estado']} -> {$estado}" . ($fecha ? " el {$fecha}" : ''),
    $g['escuela_id']
);

respond([
    'success'    => true,
    'gasto_id'   => $gasto_id,
    'estado'     => $estado,
    'fecha_pago' => $fecha,
]);
