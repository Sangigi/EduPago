<?php
// acciones/familia_nota_eliminar.php — [OF-3] Baja LÓGICA de una nota de cobranza
// (eliminado = 1; la fila se conserva). Solo su autor o admin / superadmin, de la
// escuela de la familia.
//
// Entrada: id.

require_once __DIR__ . '/../lib/helpers_notas_cobranza.php';

$rol_ne = $usuario_actual['rol'] ?? '';
requerir_rol($rol_ne, NOTA_ROLES, 'No tienes permiso para eliminar notas de cobranza.');
notas_requerir_tabla($pdo);

$nota_id_ne = intval($input['id'] ?? 0);
if ($nota_id_ne <= 0) respond(['success' => false, 'error' => 'id requerido']);
$st = $pdo->prepare("SELECT * FROM familia_notas WHERE id = ? AND eliminado = 0");
$st->execute([$nota_id_ne]);
$nota_ne = $st->fetch(PDO::FETCH_ASSOC);
if (!$nota_ne) {
    http_response_code(404);
    respond(['success' => false, 'error' => 'Nota no encontrada.']);
}
$fam_ne = notas_familia_autorizada($pdo, $usuario_actual, intval($nota_ne['familia_id']));
if (intval($nota_ne['escuela_id']) !== intval($fam_ne['escuela_id']) || !notas_puede_modificar($usuario_actual, $nota_ne)) {
    http_response_code(403);
    respond(['success' => false, 'error' => 'Solo quien escribió la nota o la administración del colegio puede eliminarla.']);
}
$pdo->prepare("UPDATE familia_notas SET eliminado = 1, actualizado_en = NOW() WHERE id = ? AND escuela_id = ?")
    ->execute([$nota_id_ne, $nota_ne['escuela_id']]);
registrar_log($pdo, $usuario_actual, 'familia_nota_eliminada',
    "Nota #{$nota_id_ne} de la familia #{$fam_ne['id']} ({$fam_ne['nombre']}) eliminada", intval($fam_ne['escuela_id']));
respond(['success' => true, 'id' => $nota_id_ne]);
