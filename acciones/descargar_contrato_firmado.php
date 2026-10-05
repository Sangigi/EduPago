<?php
// acciones/descargar_contrato_firmado.php
//
// Sirve el contrato firmado por PHP (el archivo vive en uploads_privados/, no
// es servible por URL). Recibe escuela_id, nunca una ruta.

$rol = $usuario_actual['rol'] ?? '';
requerir_rol($rol, ['superadmin', 'admin', 'provision'], 'No tienes permiso para descargar este contrato.');

$escuela_id = intval($_GET['escuela_id'] ?? $input['escuela_id'] ?? 0);
if (!$escuela_id) respond(['success' => false, 'error' => 'escuela_id requerido']);
if ($rol !== 'provision') {
    requerir_escuela_propia($rol, $escuela_id, $usuario_actual, 'No tienes permiso sobre esta escuela.');
}

$st = $pdo->prepare("SELECT contrato_firmado_ruta, contrato_firmado_nombre, contrato_firmado_mime FROM escuelas WHERE id = ?");
$st->execute([$escuela_id]);
$c = $st->fetch();
if (!$c || empty($c['contrato_firmado_ruta'])) { http_response_code(404); respond(['success' => false, 'error' => 'Este colegio no tiene contrato firmado.']); }

$abs = rtrim(UPLOADS_PRIVADOS_DIR_ABS, '/\\') . '/' . $c['contrato_firmado_ruta'];
if (!is_file($abs)) { http_response_code(404); respond(['success' => false, 'error' => 'El archivo ya no existe en el servidor.']); }

header_remove('Pragma');
header_remove('Content-Type');
header('Cache-Control: private, no-cache');
header('Content-Type: ' . ($c['contrato_firmado_mime'] ?: 'application/octet-stream'));
header('Content-Disposition: inline; filename="' . basename($c['contrato_firmado_nombre'] ?: 'contrato_firmado') . '"');
header('Content-Length: ' . filesize($abs));
log_api("descargar_contrato_firmado -> escuela={$escuela_id}");
while (ob_get_level() > 0) ob_end_clean();
readfile($abs);
exit;
