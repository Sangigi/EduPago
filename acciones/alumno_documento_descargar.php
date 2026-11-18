<?php
// acciones/alumno_documento_descargar.php — F2 (18-nov-2026)
//
// Sirve un documento del expediente por PHP, nunca por URL directa (el archivo
// vive en uploads_privados/, con "Require all denied"). Mismo patrón que
// descargar_documento_escuela.php: recibe un ID —nunca una ruta—, resuelve el
// alumno dueño en BD y autoriza por rol + escuela del alumno.
//
// Entrada: documento_id (?documento_id= o JSON). La vista lo abre con
// abrirDocumentoPrivado() (views/components/Comprobantes.js), que manda el
// token en la cabecera Authorization.

require_once __DIR__ . '/../lib/helpers_expediente.php';

$rolExp = $usuario_actual['rol'] ?? '';
requerir_rol($rolExp, EXPEDIENTE_ROLES_LECTURA, 'No tienes permiso para ver este documento.');

expediente_requerir_tabla($pdo, 'alumno_documentos');

$documento_id = intval($_GET['documento_id'] ?? $input['documento_id'] ?? 0);
if ($documento_id <= 0) respond(['success' => false, 'error' => 'Falta indicar el documento.']);

$st = $pdo->prepare("SELECT id, escuela_id, cliente_id, tipo, ruta_archivo, mime_real, nombre_original FROM alumno_documentos WHERE id = ?");
$st->execute([$documento_id]);
$doc = $st->fetch();
if (!$doc) { http_response_code(404); respond(['success' => false, 'error' => 'Documento no encontrado.']); }

$alumno = expediente_alumno($pdo, $usuario_actual, $doc['cliente_id'],
    EXPEDIENTE_ROLES_LECTURA, 'No tienes permiso para ver este documento.');
// La fila del documento y su alumno deben ser del mismo colegio; si no, algo
// se corrompió y es mejor negar que servir el archivo de otro colegio.
if (intval($doc['escuela_id']) !== $alumno['escuela_id']) {
    http_response_code(403);
    respond(['success' => false, 'error' => 'No tienes permiso para ver este documento.']);
}

$rutaAbs = expediente_ruta_documento($doc['ruta_archivo']);
if (!$rutaAbs) { http_response_code(404); respond(['success' => false, 'error' => 'El archivo ya no existe en el servidor.']); }

// ── Validadores para responder 304 (ver descargar_documento_escuela.php) ──
// Un documento del expediente nunca se reemplaza (subir siempre inserta una
// fila nueva), pero se conserva 'no-cache' + ETag por consistencia: el
// navegador siempre pregunta y, si no cambió, recibe un 304 vacío.
$mtime  = filemtime($rutaAbs);
$tamano = filesize($rutaAbs);
$etag   = '"' . md5($doc['ruta_archivo'] . '|' . $mtime . '|' . $tamano) . '"';

header_remove('Pragma');
header('Cache-Control: private, no-cache');
header('ETag: ' . $etag);
header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $mtime) . ' GMT');

$noMatch = trim($_SERVER['HTTP_IF_NONE_MATCH'] ?? '');
$coincide = false;
if ($noMatch !== '') {
    foreach (explode(',', $noMatch) as $candidato) {
        $candidato = trim($candidato);
        if (stripos($candidato, 'W/') === 0) $candidato = substr($candidato, 2);
        if ($candidato === '*' || $candidato === $etag) { $coincide = true; break; }
    }
} else {
    $desde = trim($_SERVER['HTTP_IF_MODIFIED_SINCE'] ?? '');
    if ($desde !== '') {
        $ts = @strtotime($desde);
        if ($ts !== false && $ts >= $mtime) $coincide = true;
    }
}
if ($coincide) {
    http_response_code(304);
    exit;
}

// Bitácora de quién abrió qué documento del expediente (solo en la descarga
// real, no en el 304). Sin el nombre del archivo: puede traer datos personales.
registrar_log($pdo, $usuario_actual, 'alumno_documento_descargado',
    "Alumno #{$alumno['id']}: abrió documento '{$doc['tipo']}' (#{$documento_id})", $alumno['escuela_id']);

// Nombre para el navegador: versión ASCII en filename= (compatibilidad) y la
// original en filename*= (RFC 5987) para no perder acentos.
$nombre = expediente_nombre_archivo($doc['nombre_original']) ?: basename($doc['ruta_archivo']);
$nombreAscii = preg_replace('/[^A-Za-z0-9._ -]/', '_', $nombre);

// El MIME guardado salió de finfo y está acotado a jpg/png/pdf por
// UPLOADS_MIME_PERMITIDOS; nosniff evita que el navegador "adivine" otro tipo.
header_remove('Content-Type');
header('Content-Type: ' . ($doc['mime_real'] ?: 'application/octet-stream'));
header('X-Content-Type-Options: nosniff');
header('Content-Disposition: inline; filename="' . $nombreAscii . '"; filename*=UTF-8\'\'' . rawurlencode($nombre));
header('Content-Length: ' . $tamano);
log_api("alumno_documento_descargar -> id={$documento_id} alumno={$alumno['id']} escuela={$alumno['escuela_id']}");

// readfile() transmite por bloques (memoria constante); se vacían los buffers
// que traiga php.ini para no volver a juntar el archivo entero en memoria.
while (ob_get_level() > 0) { ob_end_flush(); }
readfile($rutaAbs);
exit;
