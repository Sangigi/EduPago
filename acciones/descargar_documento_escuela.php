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
requerir_rol($rol, ['superadmin', 'admin', 'contador', 'provision'], 'No tienes permiso para descargar este documento.');
// 'contador' revisa documentos de cualquier escuela -- bypass local, ver
// nota en listar_documentos_escuela.php (no se toca requerir_escuela_propia
// global, que comparten decenas de acciones no relacionadas).
if (!in_array($rol, ['contador', 'provision'], true)) {
    requerir_escuela_propia($rol, $doc['escuela_id'], $usuario_actual, 'No tienes permiso sobre este documento.');
}

$rutaAbs = rtrim(UPLOADS_PRIVADOS_DIR_ABS, '/\\') . '/' . $doc['ruta_archivo'];
if (!is_file($rutaAbs)) { http_response_code(404); respond(['success' => false, 'error' => 'El archivo ya no existe en el servidor.']); }

// Se transmite con readfile() en vez de file_get_contents()+echo (25-sep-2026).
//
// El patrón anterior metía el archivo ENTERO en una variable de PHP (hasta
// 10 MB, ver UPLOADS_MAX_BYTES_DOCUMENTO en config.php) y después lo copiaba
// al buffer de salida: pico de memoria de ~2x el archivo, y el worker de
// PHP-FPM secuestrado desde que empezaba a leer el disco hasta que el cliente
// terminaba de recibir los 10 MB. En hosting compartido el pool de workers por
// cuenta es chico, así que varias descargas simultáneas NO se servían en
// paralelo: se encolaban — y detrás de ellas se encolaba también la petición
// de recarga de index.html, que el .htaccess obliga a ir al servidor.
//
// Eso era exactamente el "si doy click a todos y recargo la página los abre
// uno por uno muy lento" y parte del "al recargar tarda demasiado".
// readfile() transmite por bloques: memoria constante y primer byte mucho antes.
header_remove('Content-Type');
header('Content-Type: ' . ($doc['mime_real'] ?: 'application/octet-stream'));
header('Content-Disposition: inline; filename="' . basename($doc['nombre_original'] ?: $doc['ruta_archivo']) . '"');
header('Content-Length: ' . filesize($rutaAbs));
header('Cache-Control: no-cache, must-revalidate');
log_api("descargar_documento_escuela -> id={$documento_id} escuela={$doc['escuela_id']}");

// Si el servidor trae output_buffering activo desde php.ini (no lo fijamos
// nosotros: no hay ob_start() en el repo ni nada en .user.ini), ese buffer
// anularía la ventaja de readfile(), porque volvería a juntarlo todo en
// memoria antes de mandarlo. Se vacían los niveles que existan antes de
// empezar a transmitir.
while (ob_get_level() > 0) { ob_end_flush(); }
readfile($rutaAbs);
exit;
