<?php
// acciones/descargar_documento_escuela.php
//
// Sirve un documento fiscal por PHP, nunca por URL directa (el archivo real
// vive en uploads_privados/, que tiene "Require all denied"). Mismo patrón
// de autorización que descargar_cfdi.php: recibe un ID (nunca la ruta del
// filesystem), resuelve el dueño en BD, y autoriza por rol/escuela.

$documento_id = intval($_GET['documento_id'] ?? $input['documento_id'] ?? 0);
if (!$documento_id) respond(['success' => false, 'error' => 'documento_id requerido']);

$stmt = $pdo->prepare("SELECT escuela_id, ruta_archivo, mime_real, nombre_original FROM escuela_documentos WHERE id = ?");
$stmt->execute([$documento_id]);
$doc = $stmt->fetch();
if (!$doc) { http_response_code(404); respond(['success' => false, 'error' => 'Documento no encontrado']); }

$rol = $usuario_actual['rol'] ?? '';
requerir_rol($rol, ['superadmin', 'admin'], 'No tienes permiso para descargar este documento.');
requerir_escuela_propia($rol, $doc['escuela_id'], $usuario_actual, 'No tienes permiso sobre este documento.');

$rutaAbs = rtrim(UPLOADS_PRIVADOS_DIR_ABS, '/\\') . '/' . $doc['ruta_archivo'];
if (!is_file($rutaAbs)) { http_response_code(404); respond(['success' => false, 'error' => 'El archivo ya no existe en el servidor.']); }

$binario = file_get_contents($rutaAbs);
header_remove('Content-Type');
header('Content-Type: ' . ($doc['mime_real'] ?: 'application/octet-stream'));
header('Content-Disposition: inline; filename="' . basename($doc['nombre_original'] ?: $doc['ruta_archivo']) . '"');
header('Content-Length: ' . strlen($binario));
header('Cache-Control: no-cache, must-revalidate');
log_api("descargar_documento_escuela -> id={$documento_id} escuela={$doc['escuela_id']}");
echo $binario;
exit;
