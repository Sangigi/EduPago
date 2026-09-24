<?php
// acciones/subir_documento_escuela.php
//
// Sube un documento fiscal del colegio (INE del representante, constancia de
// situación fiscal, comprobante de domicilio, etc.). El admin solo puede
// subir documentos de SU PROPIA escuela; el superadmin, de cualquiera.
// El archivo se guarda en uploads_privados/ (nunca servible por URL directa,
// ver lib/uploads.php y config.php) — se descarga solo por
// descargar_documento_escuela.php, con autenticación.

// Los 5 documentos exactos que pide el formulario de alta de comercio de
// Cobroscontarjeta.com (11-sep-2026) -- reemplazan el catálogo anterior
// (inventado antes de tener el formulario real del proveedor).
$TIPOS_DOCUMENTO = ['identificacion_frente', 'identificacion_reverso', 'estado_cuenta_bancario', 'comprobante_domicilio', 'constancia_fiscal', 'acta_constitutiva'];

$rol = $usuario_actual['rol'] ?? '';
requerir_rol($rol, ['superadmin', 'admin'], 'No tienes permiso para subir documentos.');

$escuela_id = intval($_POST['escuela_id'] ?? 0);
$tipo       = trim($_POST['tipo'] ?? '');

if (!$escuela_id) respond(['success' => false, 'error' => 'escuela_id requerido']);
if (!in_array($tipo, $TIPOS_DOCUMENTO, true)) respond(['success' => false, 'error' => 'Tipo de documento inválido']);
requerir_escuela_propia($rol, $escuela_id, $usuario_actual, 'No tienes permiso sobre esta escuela.');

// CANDADO: los documentos solo se pueden subir cuando el formulario de alta de
// comercio ya está completo Y guardado (campos con asterisco + clausulado
// aceptado). Se valida contra la BASE, no contra lo que mande el navegador:
// la UI de Mi cuenta también bloquea los botones, pero eso es solo cortesía --
// un POST directo a este endpoint debe recibir el mismo rechazo.
$estadoForm = evaluar_formulario_datos_pago($pdo, $escuela_id);
if (!$estadoForm['completo']) {
    respond([
        'success' => false,
        'codigo' => 'formulario_incompleto',
        'error' => 'Primero completa y guarda el formulario de alta de comercio para poder subir documentos.',
        'campos_faltantes' => $estadoForm['faltantes'],
    ]);
}

if (empty($_FILES['archivo'])) respond(['success' => false, 'error' => 'archivo requerido']);

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
//
// El SELECT se movió ARRIBA de guardar_archivo_privado() (23-sep-2026). Antes
// el archivo se escribía en disco y solo después se miraba qué había en la
// base; con el candado de "aprobado" de abajo, cada intento rechazado habría
// dejado un archivo huérfano en uploads_privados/escuela_<id>/ que nadie
// borra nunca.
$stmtExistente = $pdo->prepare("SELECT id, ruta_archivo, estado FROM escuela_documentos WHERE escuela_id = ? AND tipo = ? LIMIT 1");
$stmtExistente->execute([$escuela_id, $tipo]);
$existente = $stmtExistente->fetch();

// ¿Ya estaba completo ANTES de esta subida? Se necesita para el aviso a
// contador de más abajo: hay que avisar en la TRANSICIÓN de "incompleto" a
// "completo y listo para revisar", no en cada documento suelto que se sube
// mientras el colegio todavía va juntando el resto (eso sería spam: son
// hasta 5 correos por colegio en vez de uno). El tipo_persona decide cuáles
// de los 5 son obligatorios (ver documentos_requeridos_por_tipo_persona en
// helpers_pagos.php) -- un negocio independiente no necesita constancia_fiscal.
$stmtTP2 = $pdo->prepare("SELECT tipo_persona, nombre FROM escuelas WHERE id = ?");
$stmtTP2->execute([$escuela_id]);
$escInfo = $stmtTP2->fetch() ?: ['tipo_persona' => null, 'nombre' => ''];
$tiposRequeridos2 = documentos_requeridos_por_tipo_persona($escInfo['tipo_persona']);

$stmtTiposPrev = $pdo->prepare("SELECT tipo FROM escuela_documentos WHERE escuela_id = ?");
$stmtTiposPrev->execute([$escuela_id]);
$tiposPresentesAntes = array_column($stmtTiposPrev->fetchAll(), 'tipo');
$completoAntes = empty(array_diff($tiposRequeridos2, $tiposPresentesAntes));

// UN DOCUMENTO APROBADO YA NO SE PUEDE REEMPLAZAR (23-sep-2026).
//
// Esto REVIERTE a propósito parte del blindaje del 11-sep que describe el
// comentario de arriba. Aquel arreglo hacía que re-subir un documento
// aprobado lo devolviera a 'pendiente' para que nadie colara un archivo nuevo
// bajo una aprobación vieja. Resolvía el problema correcto por el lado
// equivocado: el archivo aprobado ya se había borrado del disco con el
// @unlink de más abajo, sin copia ni versionado, así que cualquier cuenta
// admin del colegio podía destruir evidencia que el contador ya había
// validado. Ahora simplemente no se deja reemplazar.
//
// La válvula de escape para una aprobación equivocada es por el lado de quien
// revisa: contador, provisión y superadmin pueden RECHAZAR un documento
// aunque ya esté aprobado (revisar_documento_escuela.php no valida el estado
// previo), y con eso el colegio recupera la posibilidad de subir la versión
// corregida. Sin esa válvula, un documento mal aprobado quedaría congelado
// para siempre.
if ($existente && ($existente['estado'] ?? '') === 'aprobado') {
    respond(['success' => false,
             'error' => 'Este documento ya fue aprobado y no se puede reemplazar. '
                      . 'Si necesitas subir una versión corregida, pídenos que lo rechacemos primero.']);
}

$res = guardar_archivo_privado($_FILES['archivo'], 'escuela_' . $escuela_id, UPLOADS_EXT_DOCUMENTO, UPLOADS_MAX_BYTES_DOCUMENTO);
if (!$res['ok']) respond(['success' => false, 'error' => $res['error']]);

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

// ── Aviso a CONTADOR: documentación completa y lista para revisar ──────
//
// Sin esto, la cola de contador solo se descubre entrando a mirarla -- un
// colegio puede terminar de subir sus 5 documentos y quedarse esperando
// días sin que nadie se entere de que ya hay algo que revisar.
//
// Se dispara solo cuando ESTA subida es la que completa el set (transición
// de incompleto a completo): cubre tanto la primera vez que el colegio junta
// los 5 documentos, como cuando corrige el último documento que le habían
// rechazado y con eso el set vuelve a quedar completo. No se repite en cada
// subida suelta mientras el colegio todavía va juntando el resto, ni cada
// vez que se reemplaza un documento ya aprobado dentro de un set que ya
// estaba completo.
$aviso_contador_enviado = false;
$tiposPresentesDespues = array_unique(array_merge($tiposPresentesAntes, [$tipo]));
$completoDespues = empty(array_diff($tiposRequeridos2, $tiposPresentesDespues));
if (!$completoAntes && $completoDespues) {
    try {
        // A todas las cuentas de contador activas -- es trabajo de equipo, no
        // de una persona fija: quien esté disponible lo revisa.
        $stmtCont = $pdo->prepare("SELECT email FROM usuarios WHERE rol = 'contador' AND activo = 1 AND email IS NOT NULL AND email <> ''");
        $stmtCont->execute();
        $destCont = array_values(array_unique(array_filter(array_column($stmtCont->fetchAll(), 'email'))));

        if ($destCont) {
            $nombreEscC = htmlspecialchars($escInfo['nombre'] ?: ('Escuela #' . $escuela_id));
            $htmlCont = "
                <p>Hola,</p>
                <p><strong>{$nombreEscC} acaba de terminar de subir su documentación</strong> y ya está lista para revisar.</p>
                <p>Lo encuentras en tu panel, en la lista de colegios pendientes de revisión.</p>
                <p>— Sistema Pagalaescuela</p>
            ";
            $rCont = enviar_correo($destCont, "Documentación lista para revisar: {$escInfo['nombre']}", $htmlCont);
            $aviso_contador_enviado = (bool) ($rCont['success'] ?? false);
            if (!$aviso_contador_enviado) {
                log_api("subir_documento_escuela: falló el aviso a contador por la escuela #{$escuela_id} -> " . ($rCont['error'] ?? 'desconocido'));
            }
        } else {
            // No es un error del flujo: puede que todavía no existan cuentas
            // de contador. Pero sí hay que poder enterarse, porque significa
            // que este colegio se queda en la cola sin que nadie lo sepa.
            log_api("subir_documento_escuela: escuela #{$escuela_id} lista para revisar, pero NO hay ninguna cuenta con rol 'contador' activa que avisar.");
        }
    } catch (\Throwable $eCont) {
        // Nunca tumbar la subida del documento por un problema de correo: el
        // archivo y la fila ya quedaron guardados, que es lo que importa.
        log_api("subir_documento_escuela: error armando el aviso a contador de la escuela #{$escuela_id} -> " . $eCont->getMessage());
    }
}

respond(['success' => true, 'documento_id' => $documento_id, 'tipo' => $tipo, 'aviso_contador_enviado' => $aviso_contador_enviado]);