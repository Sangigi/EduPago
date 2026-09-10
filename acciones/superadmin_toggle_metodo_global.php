<?php
// acciones/superadmin_toggle_metodo_global.php
//
// Apaga/enciende un método de pago para TODAS las escuelas a la vez.
// Complementa superadmin_toggle_metodo_escuela.php (por escuela individual).
// Se guarda en config_sistema, clave 'metodos_pago_global'.

requerir_rol($usuario_actual['rol'] ?? '', ['superadmin'], 'Solo el super admin puede activar/desactivar métodos de pago globalmente.');

$metodo = trim($input['metodo'] ?? '');
$metodos_validos = ['Efectivo', 'TC', 'SPEI', 'EfectivoRef', 'Cheque', 'CAI'];
if (!in_array($metodo, $metodos_validos, true)) {
    respond(['success' => false, 'error' => 'Método inválido']);
}

$stmt = $pdo->prepare("SELECT valor FROM config_sistema WHERE clave = 'metodos_pago_global' LIMIT 1");
$stmt->execute();
$row = $stmt->fetch();
$actuales = [];
if ($row && $row['valor']) {
    $tmp = json_decode($row['valor'], true);
    if (is_array($tmp) && !empty($tmp['deshabilitados'])) $actuales = $tmp['deshabilitados'];
}

$yaDeshabilitado = in_array($metodo, $actuales, true);
$nuevos = $yaDeshabilitado
    ? array_values(array_diff($actuales, [$metodo]))
    : array_values(array_merge($actuales, [$metodo]));

$valor = json_encode(['deshabilitados' => $nuevos], JSON_UNESCAPED_UNICODE);
$pdo->prepare(
    "INSERT INTO config_sistema (clave, valor, actualizado_en, actualizado_por)
     VALUES ('metodos_pago_global', ?, NOW(), ?)
     ON DUPLICATE KEY UPDATE valor = VALUES(valor), actualizado_en = VALUES(actualizado_en), actualizado_por = VALUES(actualizado_por)"
)->execute([$valor, $usuario_actual['user_id'] ?? null]);

registrar_log(
    $pdo, $usuario_actual, 'metodo_pago_global_toggle',
    "Método '$metodo' " . ($yaDeshabilitado ? 'habilitado' : 'deshabilitado') . ' globalmente (todas las escuelas)'
);

respond(['success' => true, 'deshabilitados' => $nuevos]);
