<?php
// acciones/ayuda_novedades_vistas.php — OF-7a (20-nov-2026)
//
// Marca las novedades como vistas para quien llama (quita el punto "nuevo" del menú). Solo
// admin y cajero: son los que tienen el ítem "Ayuda". La marca es por usuario (ayuda_usuario).
//
// Entrada: ninguna.

require_once __DIR__ . '/../lib/helpers_soporte.php';

$rolSop = $usuario_actual['rol'] ?? '';
requerir_rol($rolSop, SOPORTE_ROLES_COLEGIO, 'No tienes permiso para esta acción.');
$yo = intval($usuario_actual['user_id'] ?? 0);

soporte_requerir_tabla($pdo, 'ayuda_usuario');
try {
    $pdo->prepare(
        "INSERT INTO ayuda_usuario (usuario_id, novedades_vistas_en) VALUES (?, NOW())
         ON DUPLICATE KEY UPDATE novedades_vistas_en = NOW()"
    )->execute([$yo]);
} catch (\PDOException $e) {
    soporte_error_bd($e, 'ayuda_novedades_vistas');
}
respond(['success' => true]);
