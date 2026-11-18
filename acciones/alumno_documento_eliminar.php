<?php
// acciones/alumno_documento_eliminar.php — F2 (18-nov-2026)
//
// Elimina un documento del expediente: primero la fila y después el archivo.
// En ese orden a propósito: si el unlink falla queda un archivo huérfano en
// uploads_privados/ (inaccesible, nadie lo apunta), que es mucho mejor que
// una fila que apunta a un archivo inexistente y truena al abrirlo.
//
// Entrada: id (del documento).

require_once __DIR__ . '/../lib/helpers_expediente.php';

$rolExp = $usuario_actual['rol'] ?? '';
requerir_rol($rolExp, EXPEDIENTE_ROLES_GESTION, 'No tienes permiso para eliminar documentos de este expediente.');

expediente_requerir_tabla($pdo, 'alumno_documentos');

$documento_id = intval($input['id'] ?? $input['documento_id'] ?? 0);
if ($documento_id <= 0) respond(['success' => false, 'error' => 'Falta indicar el documento.']);

$st = $pdo->prepare("SELECT id, escuela_id, cliente_id, tipo, ruta_archivo FROM alumno_documentos WHERE id = ?");
$st->execute([$documento_id]);
$doc = $st->fetch();
if (!$doc) { http_response_code(404); respond(['success' => false, 'error' => 'Documento no encontrado.']); }

$alumno = expediente_alumno($pdo, $usuario_actual, $doc['cliente_id'],
    EXPEDIENTE_ROLES_GESTION, 'No tienes permiso para eliminar documentos de este expediente.');
if (intval($doc['escuela_id']) !== $alumno['escuela_id']) {
    http_response_code(403);
    respond(['success' => false, 'error' => 'No tienes permiso para eliminar este documento.']);
}

$pdo->prepare("DELETE FROM alumno_documentos WHERE id = ? AND escuela_id = ?")
    ->execute([$documento_id, $alumno['escuela_id']]);

$rutaAbs = expediente_ruta_documento($doc['ruta_archivo']);
if ($rutaAbs && !@unlink($rutaAbs)) {
    log_api("alumno_documento_eliminar: la fila #{$documento_id} se borró pero el archivo no ({$doc['ruta_archivo']})");
}

registrar_log($pdo, $usuario_actual, 'alumno_documento_eliminado',
    "Alumno #{$alumno['id']}: eliminó documento '{$doc['tipo']}' (#{$documento_id})", $alumno['escuela_id']);

respond(['success' => true, 'id' => $documento_id]);
