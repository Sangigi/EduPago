<?php
// acciones/listar_documentos_escuela.php
//
// Lista los documentos fiscales subidos por un colegio. El admin solo ve
// los de su propia escuela; superadmin y contador, los de cualquiera.

$rol = $usuario_actual['rol'] ?? '';
requerir_rol($rol, ['superadmin', 'admin', 'contador'], 'No tienes permiso para ver documentos.');

$escuela_id = intval($input['escuela_id'] ?? 0);
if (!$escuela_id) respond(['success' => false, 'error' => 'escuela_id requerido']);
// 'contador' revisa documentos de CUALQUIER escuela (no tiene escuela_id
// propia, como superadmin) -- pero NO se le agrega a la excepción de
// requerir_escuela_propia() en api.php, porque esa función la comparten
// decenas de acciones no relacionadas (cobros, clientes, gastos...) y eso
// le daría acceso de facto a todo lo demás. El bypass queda local a este
// archivo.
if ($rol !== 'contador') {
    requerir_escuela_propia($rol, $escuela_id, $usuario_actual, 'No tienes permiso sobre esta escuela.');
}

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
