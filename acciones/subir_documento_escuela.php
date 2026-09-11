<?php
// acciones/subir_documento_escuela.php
//
// Sube un documento fiscal del colegio (INE del representante, constancia de
// situación fiscal, comprobante de domicilio, etc.). El admin solo puede
// subir documentos de SU PROPIA escuela; el superadmin, de cualquiera.
// El archivo se guarda en uploads_privados/ (nunca servible por URL directa,
// ver lib/uploads.php y config.php) — se descarga solo por
// descargar_documento_escuela.php, con autenticación.

$TIPOS_DOCUMENTO = ['ine_representante', 'constancia_situacion_fiscal', 'comprobante_domicilio', 'acta_constitutiva', 'poder_notarial'];

$rol = $usuario_actual['rol'] ?? '';
requerir_rol($rol, ['superadmin', 'admin'], 'No tienes permiso para subir documentos.');

$escuela_id = intval($_POST['escuela_id'] ?? 0);
$tipo       = trim($_POST['tipo'] ?? '');

if (!$escuela_id) respond(['success' => false, 'error' => 'escuela_id requerido']);
if (!in_array($tipo, $TIPOS_DOCUMENTO, true)) respond(['success' => false, 'error' => 'Tipo de documento inválido']);
requerir_escuela_propia($rol, $escuela_id, $usuario_actual, 'No tienes permiso sobre esta escuela.');

if (empty($_FILES['archivo'])) respond(['success' => false, 'error' => 'archivo requerido']);

$res = guardar_archivo_privado($_FILES['archivo'], 'escuela_' . $escuela_id, UPLOADS_EXT_DOCUMENTO, UPLOADS_MAX_BYTES_DOCUMENTO);
if (!$res['ok']) respond(['success' => false, 'error' => $res['error']]);

$pdo->prepare(
    "INSERT INTO escuela_documentos (escuela_id, tipo, ruta_archivo, nombre_original, mime_real, tamano_bytes, estado, subido_por, subido_en)
     VALUES (?, ?, ?, ?, ?, ?, 'pendiente', ?, NOW())"
)->execute([
    $escuela_id, $tipo, $res['ruta_relativa'],
    mb_substr($_FILES['archivo']['name'] ?? '', 0, 255),
    $res['mime_real'], $res['tamano_bytes'],
    intval($usuario_actual['user_id'] ?? 0),
]);
$documento_id = intval($pdo->lastInsertId());

// El estado agregado de la escuela pasa a "en_revision" en cuanto sube algo
// -- así el superadmin sabe, con un solo campo, que hay documentos
// esperando revisión, sin tener que abrir cada escuela a checar.
$pdo->prepare(
    "UPDATE escuelas SET documentacion_estado = 'en_revision' WHERE id = ? AND documentacion_estado IN ('sin_enviar', 'rechazada')"
)->execute([$escuela_id]);

registrar_log($pdo, $usuario_actual, 'documento_escuela_subido', "Escuela #$escuela_id: subió documento '$tipo' (#$documento_id)", $escuela_id);

respond(['success' => true, 'documento_id' => $documento_id, 'tipo' => $tipo]);
