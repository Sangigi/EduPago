<?php
// acciones/superadmin_toggle_seccion_global.php
//
// Apaga/enciende una sección para TODAS las escuelas a la vez, sin ser
// "mantenimiento" (sin motivo obligatorio, sin ventana de tiempo, sin el
// aviso 503 de mantenimiento_activar.php) -- un interruptor permanente
// igual de simple que superadmin_toggle_seccion_escuela.php pero global.
// Se guarda en config_sistema, clave 'secciones_deshabilitadas_global'.

requerir_rol($usuario_actual['rol'] ?? '', ['superadmin'], 'Solo el super admin puede activar/desactivar secciones globalmente.');

$seccion = trim($input['seccion'] ?? '');
if (!array_key_exists($seccion, SECCIONES_DISPONIBLES)) {
    respond(['success' => false, 'error' => 'Sección inválida']);
}

$stmt = $pdo->prepare("SELECT valor FROM config_sistema WHERE clave = 'secciones_deshabilitadas_global' LIMIT 1");
$stmt->execute();
$row = $stmt->fetch();
$actuales = [];
if ($row && $row['valor']) {
    $tmp = json_decode($row['valor'], true);
    if (is_array($tmp) && !empty($tmp['deshabilitadas'])) $actuales = $tmp['deshabilitadas'];
}

$yaDeshabilitada = in_array($seccion, $actuales, true);
$nuevas = $yaDeshabilitada
    ? array_values(array_diff($actuales, [$seccion]))
    : array_values(array_merge($actuales, [$seccion]));

$valor = json_encode(['deshabilitadas' => $nuevas], JSON_UNESCAPED_UNICODE);
$pdo->prepare(
    "INSERT INTO config_sistema (clave, valor, actualizado_en, actualizado_por)
     VALUES ('secciones_deshabilitadas_global', ?, NOW(), ?)
     ON DUPLICATE KEY UPDATE valor = VALUES(valor), actualizado_en = VALUES(actualizado_en), actualizado_por = VALUES(actualizado_por)"
)->execute([$valor, $usuario_actual['user_id'] ?? null]);

registrar_log(
    $pdo, $usuario_actual, 'seccion_global_toggle',
    "Sección '$seccion' " . ($yaDeshabilitada ? 'habilitada' : 'deshabilitada') . ' globalmente (todas las escuelas)'
);

respond(['success' => true, 'deshabilitadas' => $nuevas]);
