<?php
// acciones/alumno_documento_subir.php — F2 (18-nov-2026)
//
// Sube un documento al expediente del alumno. multipart/form-data, NO JSON:
// $input de api.php llega vacío en este tipo de petición, por eso se lee
// $_POST/$_FILES directo (mismo patrón que subir_documento_escuela.php).
//
// El archivo va a uploads_privados/escuela_<id>/alumnos/<cliente_id>/ con
// guardar_archivo_privado() (lib/uploads.php): MIME real leído de los bytes,
// nombre aleatorio, carpeta con "Require all denied". A diferencia de la foto
// del alumno (uploads/fotos_clientes, pública por URL), un acta de nacimiento
// o una INE no tienen por qué poder abrirse sin sesión.
//
// No se reemplaza nada: cada subida es una fila nueva (puede haber varias
// boletas anteriores u "otro"). Para corregir, se elimina y se vuelve a subir.
//
// Entrada ($_POST): cliente_id, tipo. ($_FILES): archivo.

require_once __DIR__ . '/../lib/helpers_expediente.php';

$rolExp = $usuario_actual['rol'] ?? '';
requerir_rol($rolExp, EXPEDIENTE_ROLES_GESTION, 'No tienes permiso para subir documentos a este expediente.');

$alumno = expediente_alumno($pdo, $usuario_actual, $_POST['cliente_id'] ?? 0,
    EXPEDIENTE_ROLES_GESTION, 'No tienes permiso para subir documentos a este expediente.');

$tipo = trim((string) ($_POST['tipo'] ?? ''));
if (!array_key_exists($tipo, EXPEDIENTE_TIPOS_DOCUMENTO)) {
    respond(['success' => false, 'error' => 'Elige qué documento es (acta, CURP, boleta, etc.).']);
}

// Antes de escribir en disco: si falta la migración o ya se llegó al tope, no
// debe quedar un archivo huérfano que nadie borra.
expediente_requerir_tabla($pdo, 'alumno_documentos');
$sc = $pdo->prepare("SELECT COUNT(*) FROM alumno_documentos WHERE cliente_id = ? AND escuela_id = ?");
$sc->execute([$alumno['id'], $alumno['escuela_id']]);
if (intval($sc->fetchColumn()) >= EXPEDIENTE_MAX_DOCUMENTOS) {
    respond(['success' => false, 'error' => 'Este expediente ya tiene ' . EXPEDIENTE_MAX_DOCUMENTOS . ' documentos. Elimina los que ya no sirvan antes de subir otro.']);
}

if (empty($_FILES['archivo'])) respond(['success' => false, 'error' => 'No se recibió ningún archivo.']);

$subcarpeta = 'escuela_' . $alumno['escuela_id'] . '/alumnos/' . $alumno['id'];
$res = guardar_archivo_privado($_FILES['archivo'], $subcarpeta, UPLOADS_EXT_DOCUMENTO, UPLOADS_MAX_BYTES_DOCUMENTO);
if (!$res['ok']) respond(['success' => false, 'error' => $res['error']]);

$nombreOriginal = expediente_nombre_archivo($_FILES['archivo']['name'] ?? '');

try {
    $pdo->prepare(
        "INSERT INTO alumno_documentos
            (escuela_id, cliente_id, tipo, ruta_archivo, nombre_original, mime_real, tamano_bytes, subido_por, subido_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())"
    )->execute([
        $alumno['escuela_id'], $alumno['id'], $tipo, $res['ruta_relativa'], $nombreOriginal,
        $res['mime_real'], intval($res['tamano_bytes']), intval($usuario_actual['user_id'] ?? 0) ?: null,
    ]);
    $documento_id = intval($pdo->lastInsertId());
} catch (\PDOException $e) {
    // El archivo ya se escribió: sin fila que lo apunte nadie lo podría ver
    // ni borrar nunca, así que se elimina aquí mismo.
    $huerfano = expediente_ruta_documento($res['ruta_relativa']);
    if ($huerfano) @unlink($huerfano);
    expediente_error_bd($e, 'alumno_documento_subir');
}

registrar_log($pdo, $usuario_actual, 'alumno_documento_subido',
    "Alumno #{$alumno['id']}: subió documento '{$tipo}' (#{$documento_id})", $alumno['escuela_id']);

respond([
    'success'   => true,
    'documento' => [
        'id'                => $documento_id,
        'tipo'              => $tipo,
        'tipo_nombre'       => EXPEDIENTE_TIPOS_DOCUMENTO[$tipo],
        'nombre_original'   => $nombreOriginal,
        'mime_real'         => $res['mime_real'],
        'tamano_bytes'      => intval($res['tamano_bytes']),
        'subido_en'         => date('Y-m-d H:i:s'),
        'subido_por'        => intval($usuario_actual['user_id'] ?? 0) ?: null,
        'subido_por_nombre' => null,
    ],
]);
