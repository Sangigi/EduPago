<?php
// acciones/superadmin_toggle_metodo_escuela.php
//
// Mismo patrón que superadmin_toggle_seccion_escuela.php, pero para métodos
// de pago (Tarjeta, SPEI, Efectivo, Efectivo en tienda, Cheque, Domiciliación)
// en vez de secciones del menú.

requerir_rol($usuario_actual['rol'] ?? '', ['superadmin'], 'Solo el super admin puede activar/desactivar métodos de pago.');
$id = intval($input['id'] ?? 0);
$metodo = trim($input['metodo'] ?? '');
if (!$id) respond(['success' => false, 'error' => 'id requerido']);
$metodos_validos = ['Efectivo', 'TC', 'SPEI', 'EfectivoRef', 'Cheque', 'CAI'];
if (!in_array($metodo, $metodos_validos, true)) {
    respond(['success' => false, 'error' => 'Método inválido']);
}
$stmt = $pdo->prepare("SELECT metodos_pago_deshabilitados FROM escuelas WHERE id = ?");
$stmt->execute([$id]);
$row = $stmt->fetch();
if (!$row) respond(['success' => false, 'error' => 'Escuela no encontrada']);

$deshabilitados = json_decode($row['metodos_pago_deshabilitados'] ?? '', true);
if (!is_array($deshabilitados)) $deshabilitados = [];
$yaDeshabilitado = in_array($metodo, $deshabilitados, true);
$deshabilitados = $yaDeshabilitado
    ? array_values(array_diff($deshabilitados, [$metodo]))
    : array_values(array_merge($deshabilitados, [$metodo]));

$pdo->prepare("UPDATE escuelas SET metodos_pago_deshabilitados = ? WHERE id = ?")
    ->execute([json_encode($deshabilitados), $id]);

registrar_log(
    $pdo, $usuario_actual, 'escuela_metodo_pago_toggle',
    "Escuela #$id: método '$metodo' " . ($yaDeshabilitado ? 'habilitado' : 'deshabilitado'),
    $id
);
respond(['success' => true, 'metodos_pago_deshabilitados' => $deshabilitados]);
