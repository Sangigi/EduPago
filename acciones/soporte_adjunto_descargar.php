<?php
// acciones/soporte_adjunto_descargar.php — OF-7a (20-nov-2026)
//
// Sirve un adjunto de un ticket por PHP, nunca por URL directa (el archivo vive en
// uploads_privados/ con "Require all denied"). Recibe un ID —nunca una ruta—, resuelve
// el ticket dueño en la base y autoriza: plataforma ve todo; admin/cajero solo los de su
// escuela, y NUNCA un adjunto de una nota interna (se trata como si no existiera).
//
// Entrada (?adjunto_id= o JSON). La vista lo abre con abrirDocumentoPrivado()
// (views/components/Comprobantes.js), que manda el token en la cabecera Authorization.

require_once __DIR__ . '/../lib/helpers_soporte.php';

$rolSop = $usuario_actual['rol'] ?? '';
requerir_rol($rolSop, array_merge(SOPORTE_ROLES_COLEGIO, SOPORTE_ROLES_PLATAFORMA), 'No tienes permiso para ver este archivo.');

soporte_requerir_tabla($pdo, 'soporte_adjuntos');

$adjunto_id = intval($_GET['adjunto_id'] ?? $input['adjunto_id'] ?? 0);
if ($adjunto_id <= 0) respond(['success' => false, 'error' => 'Falta indicar el archivo.']);

$st = $pdo->prepare(
    "SELECT a.id, a.ticket_id, a.ruta_archivo, a.mime_real, a.nombre_original, m.interno
       FROM soporte_adjuntos a JOIN soporte_mensajes m ON m.id = a.mensaje_id
      WHERE a.id = ?"
);
$st->execute([$adjunto_id]);
$adj = $st->fetch();
// Mismo 404 si no existe, si es de otro colegio o si es de una nota interna.
if (!$adj || (!soporte_es_plataforma($rolSop) && intval($adj['interno']) === 1)) {
    http_response_code(404);
    respond(['success' => false, 'error' => 'Archivo no encontrado.']);
}
$ticket = soporte_ticket_cargar($pdo, $usuario_actual, $adj['ticket_id']);   // 404 si es de otro colegio

$rutaAbs = expediente_ruta_documento($adj['ruta_archivo']);
if (!$rutaAbs) { http_response_code(404); respond(['success' => false, 'error' => 'El archivo ya no existe en el servidor.']); }

$tamano = filesize($rutaAbs);
$nombre = expediente_nombre_archivo($adj['nombre_original']) ?: basename($adj['ruta_archivo']);
$nombreAscii = preg_replace('/[^A-Za-z0-9._ -]/', '_', $nombre);

// El MIME guardado salió de finfo y firma de bytes, acotado a jpg/png/webp/pdf; nosniff evita
// que el navegador "adivine" otro tipo. "private, no-store": no queda en cachés compartidas.
header_remove('Pragma');
header('Cache-Control: private, no-store');
header_remove('Content-Type');
header('Content-Type: ' . ($adj['mime_real'] ?: 'application/octet-stream'));
header('X-Content-Type-Options: nosniff');
header('Content-Disposition: inline; filename="' . $nombreAscii . '"; filename*=UTF-8\'\'' . rawurlencode($nombre));
header('Content-Length: ' . $tamano);
log_api("soporte_adjunto_descargar -> id={$adjunto_id} ticket={$ticket['id']} escuela={$ticket['escuela_id']} rol={$rolSop}");

while (ob_get_level() > 0) { ob_end_flush(); }
readfile($rutaAbs);
exit;
