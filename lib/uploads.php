<?php
/**
 * EduPago — Utilidad compartida para guardar archivos subidos por el
 * usuario ($_FILES). Usada tanto por la foto de un alumno (Portal Familia)
 * como por el comprobante de un gasto (Proveedores/Gastos) — por eso no
 * tiene nada específico de ningún módulo: recibe subcarpeta, extensiones
 * permitidas y tamaño máximo como parámetros.
 */

define('UPLOADS_MIME_PERMITIDOS', [
    'jpg'  => ['image/jpeg'],
    'jpeg' => ['image/jpeg'],
    'png'  => ['image/png'],
    'webp' => ['image/webp'],
    'gif'  => ['image/gif'],
    'pdf'  => ['application/pdf'],
]);

function uploads_error_texto($codigo) {
    switch ($codigo) {
        case UPLOAD_ERR_OK: return null;
        case UPLOAD_ERR_INI_SIZE:
        case UPLOAD_ERR_FORM_SIZE: return 'El archivo es demasiado grande.';
        case UPLOAD_ERR_PARTIAL:   return 'El archivo se subió incompleto. Intenta de nuevo.';
        case UPLOAD_ERR_NO_FILE:   return 'No se recibió ningún archivo.';
        default: return 'No se pudo guardar el archivo en el servidor. Intenta de nuevo.';
    }
}

/**
 * @param array $file un elemento de $_FILES, ej. $_FILES['foto']
 * @return array ['ok'=>bool, 'ruta_relativa'=>string|null, 'error'=>string|null]
 */
function guardar_archivo_subido(array $file, string $subcarpeta, array $extensionesPermitidas, int $maxBytes): array {
    $errTxt = uploads_error_texto($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($errTxt !== null) return ['ok' => false, 'ruta_relativa' => null, 'error' => $errTxt];

    if (!is_uploaded_file($file['tmp_name'])) {
        return ['ok' => false, 'ruta_relativa' => null, 'error' => 'Subida inválida.'];
    }
    if ($file['size'] <= 0) return ['ok' => false, 'ruta_relativa' => null, 'error' => 'El archivo está vacío.'];
    if ($file['size'] > $maxBytes) {
        $mb = round($maxBytes / 1024 / 1024, 1);
        return ['ok' => false, 'ruta_relativa' => null, 'error' => "El archivo supera el límite de {$mb} MB."];
    }

    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, $extensionesPermitidas, true)) {
        return ['ok' => false, 'ruta_relativa' => null, 'error' => 'Tipo de archivo no permitido.'];
    }

    // MIME REAL leído de los bytes del archivo (finfo), no de $file['type']
    // (eso lo manda el navegador y cualquiera lo falsifica) — esto es lo
    // que detecta un .php disfrazado de .jpg aunque la extensión "pase".
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeReal = $finfo ? finfo_file($finfo, $file['tmp_name']) : false;
    if ($finfo) finfo_close($finfo);
    $esperados = UPLOADS_MIME_PERMITIDOS[$ext] ?? [];
    if (!$mimeReal || empty($esperados) || !in_array($mimeReal, $esperados, true)) {
        return ['ok' => false, 'ruta_relativa' => null, 'error' => 'El archivo no parece ser del tipo esperado.'];
    }

    $baseDir = rtrim(UPLOADS_DIR_ABS, '/\\') . '/' . trim($subcarpeta, '/\\');
    if (!is_dir($baseDir) && !mkdir($baseDir, 0755, true) && !is_dir($baseDir)) {
        return ['ok' => false, 'ruta_relativa' => null, 'error' => 'No se pudo preparar el directorio de subida.'];
    }

    // Nombre único (nunca el nombre original): evita colisiones/sobrescritura
    // y no expone el nombre de archivo original del usuario.
    $nombre = date('Ymd_His') . '_' . bin2hex(random_bytes(8)) . '.' . $ext;
    $rutaAbs = $baseDir . '/' . $nombre;
    if (!move_uploaded_file($file['tmp_name'], $rutaAbs)) {
        return ['ok' => false, 'ruta_relativa' => null, 'error' => 'No se pudo guardar el archivo.'];
    }
    @chmod($rutaAbs, 0644);

    return ['ok' => true, 'ruta_relativa' => 'uploads/' . trim($subcarpeta, '/\\') . '/' . $nombre, 'error' => null];
}

/**
 * Igual que guardar_archivo_subido(), pero guarda en UPLOADS_PRIVADOS_DIR_ABS
 * (carpeta con .htaccess "Require all denied" — nunca servible por URL
 * directa). Para documentos fiscales del colegio (INE, constancia de
 * situación fiscal, etc.): a diferencia de una foto de alumno, no hay
 * ningún motivo para que sean públicos ni siquiera por oscuridad.
 *
 * @return array ['ok'=>bool, 'ruta_relativa'=>string|null, 'mime_real'=>string|null, 'tamano_bytes'=>int|null, 'error'=>string|null]
 */
function guardar_archivo_privado(array $file, string $subcarpeta, array $extensionesPermitidas, int $maxBytes): array {
    $errTxt = uploads_error_texto($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($errTxt !== null) return ['ok' => false, 'ruta_relativa' => null, 'mime_real' => null, 'tamano_bytes' => null, 'error' => $errTxt];

    if (!is_uploaded_file($file['tmp_name'])) {
        return ['ok' => false, 'ruta_relativa' => null, 'mime_real' => null, 'tamano_bytes' => null, 'error' => 'Subida inválida.'];
    }
    if ($file['size'] <= 0) return ['ok' => false, 'ruta_relativa' => null, 'mime_real' => null, 'tamano_bytes' => null, 'error' => 'El archivo está vacío.'];
    if ($file['size'] > $maxBytes) {
        $mb = round($maxBytes / 1024 / 1024, 1);
        return ['ok' => false, 'ruta_relativa' => null, 'mime_real' => null, 'tamano_bytes' => null, 'error' => "El archivo supera el límite de {$mb} MB."];
    }

    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, $extensionesPermitidas, true)) {
        return ['ok' => false, 'ruta_relativa' => null, 'mime_real' => null, 'tamano_bytes' => null, 'error' => 'Tipo de archivo no permitido.'];
    }

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeReal = $finfo ? finfo_file($finfo, $file['tmp_name']) : false;
    if ($finfo) finfo_close($finfo);
    $esperados = UPLOADS_MIME_PERMITIDOS[$ext] ?? [];
    if (!$mimeReal || empty($esperados) || !in_array($mimeReal, $esperados, true)) {
        return ['ok' => false, 'ruta_relativa' => null, 'mime_real' => null, 'tamano_bytes' => null, 'error' => 'El archivo no parece ser del tipo esperado.'];
    }

    $baseDir = rtrim(UPLOADS_PRIVADOS_DIR_ABS, '/\\') . '/' . trim($subcarpeta, '/\\');
    if (!is_dir($baseDir) && !mkdir($baseDir, 0755, true) && !is_dir($baseDir)) {
        return ['ok' => false, 'ruta_relativa' => null, 'mime_real' => null, 'tamano_bytes' => null, 'error' => 'No se pudo preparar el directorio de subida.'];
    }
    // El .htaccess raíz de uploads_privados/ ya deniega todo, pero cada
    // subcarpeta nueva (mkdir recursivo) no lo hereda por sí sola en todas
    // las configuraciones de Apache -- se copia explícito por si acaso.
    $htaccessOrigen = rtrim(UPLOADS_PRIVADOS_DIR_ABS, '/\\') . '/.htaccess';
    $htaccessDestino = $baseDir . '/.htaccess';
    if (is_file($htaccessOrigen) && !is_file($htaccessDestino)) {
        @copy($htaccessOrigen, $htaccessDestino);
    }

    $nombre = date('Ymd_His') . '_' . bin2hex(random_bytes(8)) . '.' . $ext;
    $rutaAbs = $baseDir . '/' . $nombre;
    if (!move_uploaded_file($file['tmp_name'], $rutaAbs)) {
        return ['ok' => false, 'ruta_relativa' => null, 'mime_real' => null, 'tamano_bytes' => null, 'error' => 'No se pudo guardar el archivo.'];
    }
    @chmod($rutaAbs, 0644);

    return [
        'ok' => true,
        'ruta_relativa' => trim($subcarpeta, '/\\') . '/' . $nombre,
        'mime_real' => $mimeReal,
        'tamano_bytes' => $file['size'],
        'error' => null,
    ];
}
