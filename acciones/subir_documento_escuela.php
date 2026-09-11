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

// Blindaje (11-sep-2026, hallado en revisión adversarial): antes cada subida
// insertaba una fila NUEVA aunque ya existiera una del mismo tipo -- si un
// documento se rechazaba y el colegio subía la versión corregida, la fila
// vieja 'rechazado' nunca desaparecía y revisar_documento_escuela.php (que
// recalcula el estado agregado leyendo TODAS las filas de la escuela) veía
// ese rechazo viejo para siempre, aunque la versión nueva ya estuviera
// aprobada. Ahora se reemplaza (UPDATE) la fila existente del mismo
// (escuela_id, tipo) en vez de acumular duplicados, y el archivo físico
// anterior se borra (best-effort, igual que ya hace subir_foto_cliente.php
// al reemplazar una foto).
$stmtExistente = $pdo->prepare("SELECT id, ruta_archivo FROM escuela_documentos WHERE escuela_id = ? AND tipo = ? LIMIT 1");
$stmtExistente->execute([$escuela_id, $tipo]);
$existente = $stmtExistente->fetch();

$nombreOriginal = mb_substr($_FILES['archivo']['name'] ?? '', 0, 255);

if ($existente) {
    $pdo->prepare(
        "UPDATE escuela_documentos SET
            ruta_archivo = ?, nombre_original = ?, mime_real = ?, tamano_bytes = ?,
            estado = 'pendiente', motivo_rechazo = NULL,
            subido_por = ?, subido_en = NOW(), revisado_por = NULL, revisado_en = NULL
         WHERE id = ?"
    )->execute([
        $res['ruta_relativa'], $nombreOriginal, $res['mime_real'], $res['tamano_bytes'],
        intval($usuario_actual['user_id'] ?? 0), $existente['id'],
    ]);
    $documento_id = intval($existente['id']);
    $rutaVieja = rtrim(UPLOADS_PRIVADOS_DIR_ABS, '/\\') . '/' . $existente['ruta_archivo'];
    if (is_file($rutaVieja)) @unlink($rutaVieja);
} else {
    $pdo->prepare(
        "INSERT INTO escuela_documentos (escuela_id, tipo, ruta_archivo, nombre_original, mime_real, tamano_bytes, estado, subido_por, subido_en)
         VALUES (?, ?, ?, ?, ?, ?, 'pendiente', ?, NOW())"
    )->execute([
        $escuela_id, $tipo, $res['ruta_relativa'], $nombreOriginal,
        $res['mime_real'], $res['tamano_bytes'], intval($usuario_actual['user_id'] ?? 0),
    ]);
    $documento_id = intval($pdo->lastInsertId());
}

// El estado agregado de la escuela vuelve a "en_revision" con CUALQUIER
// subida nueva, incluso si ya estaba 'aprobada' -- antes solo lo hacía desde
// 'sin_enviar'/'rechazada', así que subir una versión actualizada de un
// documento ya aprobado dejaba el agregado en 'aprobada' sin que nadie
// revisara el archivo nuevo.
$pdo->prepare("UPDATE escuelas SET documentacion_estado = 'en_revision' WHERE id = ?")->execute([$escuela_id]);

registrar_log($pdo, $usuario_actual, 'documento_escuela_subido', "Escuela #$escuela_id: subió documento '$tipo' (#$documento_id)", $escuela_id);

respond(['success' => true, 'documento_id' => $documento_id, 'tipo' => $tipo]);
