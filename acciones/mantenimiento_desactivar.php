<?php
// acciones/mantenimiento_desactivar.php
//
// Apaga el modo mantenimiento global antes de tiempo (sin esperar a que
// llegue la fecha de fin, o cuando se activó sin fecha de fin/indefinido).

requerir_rol($usuario_actual['rol'] ?? '', ['superadmin'], 'Solo el super admin puede desactivar el modo mantenimiento.');

$pdo->prepare("DELETE FROM config_sistema WHERE clave = 'mantenimiento_secciones'")->execute();

registrar_log($pdo, $usuario_actual, 'mantenimiento_desactivado', 'Modo mantenimiento global desactivado manualmente.');

respond(['success' => true]);
