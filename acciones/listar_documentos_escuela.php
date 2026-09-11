<?php
// acciones/listar_documentos_escuela.php
//
// Lista los documentos fiscales subidos por un colegio. El admin solo ve
// los de su propia escuela; el superadmin, los de cualquiera.

$rol = $usuario_actual['rol'] ?? '';
requerir_rol($rol, ['superadmin', 'admin'], 'No tienes permiso para ver documentos.');

$escuela_id = intval($input['escuela_id'] ?? 0);
if (!$escuela_id) respond(['success' => false, 'error' => 'escuela_id requerido']);
requerir_escuela_propia($rol, $escuela_id, $usuario_actual, 'No tienes permiso sobre esta escuela.');

$stmt = $pdo->prepare(
    "SELECT id, tipo, nombre_original, tamano_bytes, estado, motivo_rechazo, subido_en, revisado_en
       FROM escuela_documentos WHERE escuela_id = ? ORDER BY subido_en DESC"
);
$stmt->execute([$escuela_id]);
$docs = array_map(function ($d) {
    $d['tamano_bytes'] = intval($d['tamano_bytes']);
    return $d;
}, $stmt->fetchAll());

respond(['success' => true, 'documentos' => $docs]);
