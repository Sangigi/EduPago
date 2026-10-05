<?php
// acciones/subir_contrato_firmado.php
//
// La escuela (admin) sube el contrato firmado desde Mi cuenta. Al subirlo el
// estatus pasa solo a 'firmado' y se avisa por correo a las cuentas de
// provisión. Solo se acepta cuando el contrato está en 'enviado': antes no hay
// nada que firmar y, una vez firmado, no se reemplaza (provision puede
// regresarlo a 'enviado' si hubiera que corregirlo).
// Recibe multipart/form-data: escuela_id y archivo (pdf/jpg/png, máx 10 MB).

$rol = $usuario_actual['rol'] ?? '';
requerir_rol($rol, ['superadmin', 'admin'], 'No tienes permiso para subir el contrato.');

$escuela_id = intval($_POST['escuela_id'] ?? 0);
if (!$escuela_id) respond(['success' => false, 'error' => 'escuela_id requerido']);
requerir_escuela_propia($rol, $escuela_id, $usuario_actual, 'No tienes permiso sobre esta escuela.');

$st = $pdo->prepare("SELECT nombre, contrato_estado FROM escuelas WHERE id = ?");
$st->execute([$escuela_id]);
$esc = $st->fetch();
if (!$esc) respond(['success' => false, 'error' => 'Colegio no encontrado']);

if ($esc['contrato_estado'] !== 'enviado') {
    respond(['success' => false, 'error' => $esc['contrato_estado'] === 'firmado'
        ? 'El contrato ya está firmado.'
        : 'Todavía no te hemos enviado el contrato para firma.']);
}
if (empty($_FILES['archivo'])) respond(['success' => false, 'error' => 'Selecciona el archivo del contrato firmado.']);

$g = guardar_archivo_privado($_FILES['archivo'], 'escuela_' . $escuela_id . '/contrato_firmado', UPLOADS_EXT_DOCUMENTO, UPLOADS_MAX_BYTES_DOCUMENTO);
if (!$g['ok']) respond(['success' => false, 'error' => $g['error']]);

$pdo->prepare(
    "UPDATE escuelas SET contrato_estado = 'firmado', contrato_fecha_firma = CURDATE(),
        contrato_firmado_ruta = ?, contrato_firmado_nombre = ?, contrato_firmado_mime = ?
      WHERE id = ?"
)->execute([$g['ruta_relativa'], mb_substr(basename($_FILES['archivo']['name']), 0, 255), $g['mime_real'], $escuela_id]);

registrar_log($pdo, $usuario_actual, 'contrato_firmado_subido', "Colegio #$escuela_id: contrato firmado subido", $escuela_id);

// ── Aviso a PROVISIÓN ───────────────────────────────────────────────────
// Nunca tumba la subida: el contrato ya quedó guardado y firmado.
$aviso = false;
try {
    $stP = $pdo->prepare("SELECT email FROM usuarios WHERE rol = 'provision' AND activo = 1 AND email IS NOT NULL AND email <> ''");
    $stP->execute();
    $dest = array_values(array_unique(array_filter(array_column($stP->fetchAll(), 'email'))));
    if ($dest) {
        $n = htmlspecialchars($esc['nombre'] ?: ('Escuela #' . $escuela_id));
        $html = "
            <p>Hola,</p>
            <p><strong>{$n} subió su contrato firmado.</strong></p>
            <p>El estatus del contrato ya quedó en <strong>firmado</strong>. Puedes revisar el archivo en tu panel.</p>
            <p>— Sistema Pagalaescuela</p>
        ";
        $r = enviar_correo($dest, "Contrato firmado: {$esc['nombre']}", $html);
        $aviso = (bool) ($r['success'] ?? false);
        if (!$aviso) log_api("subir_contrato_firmado: falló el aviso a provisión por la escuela #{$escuela_id} -> " . ($r['error'] ?? 'desconocido'));
    } else {
        log_api("subir_contrato_firmado: escuela #{$escuela_id} firmó, pero NO hay ninguna cuenta con rol 'provision' activa que avisar.");
    }
} catch (\Throwable $e) {
    log_api("subir_contrato_firmado: error armando el aviso a provisión de la escuela #{$escuela_id} -> " . $e->getMessage());
}

respond(['success' => true, 'contrato_estado' => 'firmado', 'aviso_provision_enviado' => $aviso]);
