<?php
// acciones/alumno_expediente_obtener.php — F2 (18-nov-2026)
//
// Devuelve el expediente de UN alumno: datos personales, datos médicos y el
// estado del aviso de privacidad, más cuántos tutores y documentos tiene.
// Los datos médicos ya NO viajan en cargar_datos (que también recibe el
// cajero): esta acción es la única forma de leerlos, con rol y escuela
// validados en lib/helpers_expediente.php.
//
// Entrada: cliente_id (JSON o ?cliente_id=).

require_once __DIR__ . '/../lib/helpers_expediente.php';

$rolExp = $usuario_actual['rol'] ?? '';
requerir_rol($rolExp, EXPEDIENTE_ROLES_LECTURA, 'No tienes permiso para ver el expediente de este alumno.');

$alumno = expediente_alumno($pdo, $usuario_actual,
    $input['cliente_id'] ?? $_GET['cliente_id'] ?? 0,
    EXPEDIENTE_ROLES_LECTURA, 'No tienes permiso para ver el expediente de este alumno.');

try {
    $expediente = expediente_cargar($pdo, $alumno['id']);
} catch (\PDOException $e) {
    expediente_error_bd($e, 'alumno_expediente_obtener');
}
if (!$expediente) {
    http_response_code(404);
    respond(['success' => false, 'error' => 'Alumno no encontrado.']);
}

// Conteos para las pestañas. Si la tabla aún no existe se manda null en vez
// de tumbar el expediente completo: los datos personales sí se pueden ver.
$conteos = ['tutores' => null, 'documentos' => null];
try {
    $st = $pdo->prepare("SELECT COUNT(*) FROM alumno_tutores WHERE cliente_id = ? AND escuela_id = ? AND activo = 1");
    $st->execute([$alumno['id'], $alumno['escuela_id']]);
    $conteos['tutores'] = intval($st->fetchColumn());
} catch (\PDOException $e) { /* migración pendiente */ }
try {
    $st = $pdo->prepare("SELECT COUNT(*) FROM alumno_documentos WHERE cliente_id = ? AND escuela_id = ?");
    $st->execute([$alumno['id'], $alumno['escuela_id']]);
    $conteos['documentos'] = intval($st->fetchColumn());
} catch (\PDOException $e) { /* migración pendiente */ }

respond([
    'success'          => true,
    'expediente'       => $expediente,
    'conteos'          => $conteos,
    'puede_editar'     => expediente_puede_editar($usuario_actual),
    'tipos_documento'  => EXPEDIENTE_TIPOS_DOCUMENTO,
    'parentescos'      => EXPEDIENTE_PARENTESCOS_TUTOR,
    'tipos_sangre'     => EXPEDIENTE_TIPOS_SANGRE,
]);
