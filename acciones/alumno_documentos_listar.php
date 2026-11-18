<?php
// acciones/alumno_documentos_listar.php — F2 (18-nov-2026)
//
// Lista los documentos del expediente de un alumno. NUNCA manda ruta_archivo:
// el navegador solo conoce el id, y la descarga pasa por
// alumno_documento_descargar.php, que vuelve a validar rol y escuela.
//
// Entrada: cliente_id (JSON o ?cliente_id=).

require_once __DIR__ . '/../lib/helpers_expediente.php';

$rolExp = $usuario_actual['rol'] ?? '';
requerir_rol($rolExp, EXPEDIENTE_ROLES_LECTURA, 'No tienes permiso para ver los documentos de este alumno.');

$alumno = expediente_alumno($pdo, $usuario_actual,
    $input['cliente_id'] ?? $_GET['cliente_id'] ?? 0,
    EXPEDIENTE_ROLES_LECTURA, 'No tienes permiso para ver los documentos de este alumno.');

expediente_requerir_tabla($pdo, 'alumno_documentos');

$st = $pdo->prepare(
    "SELECT d.id, d.tipo, d.nombre_original, d.mime_real, d.tamano_bytes, d.subido_en,
            d.subido_por, u.nombre AS subido_por_nombre
     FROM alumno_documentos d
     LEFT JOIN usuarios u ON u.id = d.subido_por
     WHERE d.cliente_id = ? AND d.escuela_id = ?
     ORDER BY d.subido_en DESC, d.id DESC"
);
$st->execute([$alumno['id'], $alumno['escuela_id']]);
$documentos = array_map(function ($d) {
    $d['id']           = intval($d['id']);
    $d['tamano_bytes'] = $d['tamano_bytes'] !== null ? intval($d['tamano_bytes']) : null;
    $d['subido_por']   = $d['subido_por'] ? intval($d['subido_por']) : null;
    $d['tipo_nombre']  = EXPEDIENTE_TIPOS_DOCUMENTO[$d['tipo']] ?? $d['tipo'];
    return $d;
}, $st->fetchAll());

respond([
    'success'         => true,
    'documentos'      => $documentos,
    'tipos_documento' => EXPEDIENTE_TIPOS_DOCUMENTO,
    'puede_editar'    => expediente_puede_editar($usuario_actual),
    // Para que la vista avise ANTES de subir (la validación real es del servidor).
    'max_bytes'       => defined('UPLOADS_MAX_BYTES_DOCUMENTO') ? UPLOADS_MAX_BYTES_DOCUMENTO : null,
    'extensiones'     => defined('UPLOADS_EXT_DOCUMENTO') ? UPLOADS_EXT_DOCUMENTO : [],
]);
