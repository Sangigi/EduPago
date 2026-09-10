<?php
// acciones/mantenimiento_activar.php
//
// Apaga secciones para TODAS las escuelas a la vez, con motivo y ventana de
// tiempo. Complementa el apagado por escuela individual (que ya existía).
// Se guarda en config_sistema, clave 'mantenimiento_secciones' — ver
// mantenimiento_secciones_activo() en lib/helpers_pagos.php para cómo se lee.

requerir_rol($usuario_actual['rol'] ?? '', ['superadmin'], 'Solo el super admin puede activar el modo mantenimiento.');

$secciones = $input['secciones'] ?? [];
$motivo    = trim($input['motivo'] ?? '');
$fin       = trim($input['fin'] ?? ''); // ISO datetime, o vacío = indefinido

if (!is_array($secciones) || count($secciones) < 1) {
    respond(['success' => false, 'error' => 'Elige al menos una sección.']);
}
$secciones = array_values(array_filter($secciones, fn($s) => array_key_exists($s, SECCIONES_DISPONIBLES)));
if (count($secciones) < 1) {
    respond(['success' => false, 'error' => 'Ninguna de las secciones enviadas es válida.']);
}
if ($fin !== '' && strtotime($fin) === false) {
    respond(['success' => false, 'error' => 'La fecha/hora de fin no es válida.']);
}
if ($fin !== '' && strtotime($fin) <= time()) {
    respond(['success' => false, 'error' => 'La fecha de fin debe ser en el futuro.']);
}

$datos = [
    'secciones' => $secciones,
    'motivo'    => $motivo !== '' ? $motivo : 'Mantenimiento programado',
    'inicio'    => date('Y-m-d H:i:s'),
    'fin'       => $fin !== '' ? date('Y-m-d H:i:s', strtotime($fin)) : null,
];

$pdo->prepare(
    "INSERT INTO config_sistema (clave, valor, actualizado_en, actualizado_por)
     VALUES ('mantenimiento_secciones', ?, NOW(), ?)
     ON DUPLICATE KEY UPDATE valor = VALUES(valor), actualizado_en = VALUES(actualizado_en), actualizado_por = VALUES(actualizado_por)"
)->execute([json_encode($datos, JSON_UNESCAPED_UNICODE), $usuario_actual['user_id'] ?? null]);

registrar_log(
    $pdo, $usuario_actual, 'mantenimiento_activado',
    'Secciones: ' . implode(',', $secciones) . ' | motivo: ' . $datos['motivo'] . ' | fin: ' . ($datos['fin'] ?? 'indefinido')
);

respond(['success' => true, 'mantenimiento' => $datos]);
