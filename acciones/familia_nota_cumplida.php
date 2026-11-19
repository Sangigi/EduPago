<?php
// acciones/familia_nota_cumplida.php — [OF-3] Marca (o desmarca) como CUMPLIDO el
// compromiso de pago de una nota. Cualquier superadmin, admin o cajero de la
// escuela de la familia puede hacerlo (quien cobra no siempre es quien anotó el
// acuerdo). Solo aplica a notas que tienen fecha de compromiso.
//
// Entrada: id, cumplido (1 = cumplido, 0 = volver a dejarlo pendiente; por omisión 1).

require_once __DIR__ . '/../lib/helpers_notas_cobranza.php';

$rol_nc = $usuario_actual['rol'] ?? '';
requerir_rol($rol_nc, NOTA_ROLES, 'No tienes permiso para marcar compromisos de pago.');
notas_requerir_tabla($pdo);

$nota_id_nc = intval($input['id'] ?? 0);
if ($nota_id_nc <= 0) respond(['success' => false, 'error' => 'id requerido']);
$st = $pdo->prepare("SELECT * FROM familia_notas WHERE id = ? AND eliminado = 0");
$st->execute([$nota_id_nc]);
$nota_nc = $st->fetch(PDO::FETCH_ASSOC);
if (!$nota_nc) {
    http_response_code(404);
    respond(['success' => false, 'error' => 'Nota no encontrada.']);
}
$fam_nc = notas_familia_autorizada($pdo, $usuario_actual, intval($nota_nc['familia_id']));
if (intval($nota_nc['escuela_id']) !== intval($fam_nc['escuela_id'])) {
    http_response_code(403);
    respond(['success' => false, 'error' => 'La nota no corresponde al colegio de la familia.']);
}
if (empty($nota_nc['fecha_compromiso'])) {
    respond(['success' => false, 'error' => 'Esta nota no tiene un compromiso de pago.']);
}
$cumplido_nc = array_key_exists('cumplido', $input) && !$input['cumplido'] ? 0 : 1;
$pdo->prepare("UPDATE familia_notas SET cumplido = ?, actualizado_en = NOW() WHERE id = ? AND escuela_id = ?")
    ->execute([$cumplido_nc, $nota_id_nc, $nota_nc['escuela_id']]);
registrar_log($pdo, $usuario_actual, 'familia_compromiso_' . ($cumplido_nc ? 'cumplido' : 'reabierto'),
    "Compromiso de pago (nota #{$nota_id_nc}) de la familia #{$fam_nc['id']} ({$fam_nc['nombre']}) " . ($cumplido_nc ? 'marcado como cumplido' : 'reabierto'),
    intval($fam_nc['escuela_id']));
respond(['success' => true, 'id' => $nota_id_nc, 'cumplido' => (bool) $cumplido_nc]);
