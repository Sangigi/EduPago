<?php
// monedero_activar {activo: 0|1} — enciende o apaga el monedero del colegio (F6).
//
// Admin (su colegio) y superadmin (escuela_id del input). Es la ÚNICA acción de
// escritura del módulo que no se corta con el monedero apagado (si no, no habría
// forma de encenderlo). Apagarlo no toca saldos ni movimientos: corta recargas
// (en línea y en caja), ventas y cambios de configuración; las consultas, las
// cancelaciones de venta y los ajustes del admin siguen funcionando.
$ctx = monedero_ctx($pdo, $usuario_actual, $input, ['admin', 'superadmin']);

if (!array_key_exists('activo', $input)) {
    respond(['success' => false, 'error' => 'Indica si el monedero debe quedar activado o desactivado.']);
}
$activo = (!empty($input['activo']) && strval($input['activo']) !== '0') ? 1 : 0;

try {
    $st = $pdo->prepare("UPDATE escuelas SET monedero_activo = ? WHERE id = ?");
    $st->execute([$activo, $ctx['escuela_id']]);
} catch (\PDOException $e) {
    monedero_log('monedero_activar: ' . $e->getMessage());
    respond(['success' => false, 'error' => 'Falta correr la migración del monedero (columna escuelas.monedero_activo).']);
}
registrar_log($pdo, $usuario_actual, $activo ? 'monedero_activado' : 'monedero_desactivado',
    'Monedero ' . ($activo ? 'activado' : 'desactivado') . ' para el colegio', $ctx['escuela_id']);
respond(['success' => true, 'monedero_activo' => $activo]);
