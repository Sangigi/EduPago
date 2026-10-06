<?php
// acciones/enviar_contrato_escuela.php
//
// provision (o superadmin) sube el PDF del contrato de UNA escuela y el sistema
// lo manda por correo al contacto de firma que la escuela capturó en Mi cuenta
// (escuela_datos_pago.contacto_contrato_*). Al enviarse con éxito el estatus
// pasa solo a 'enviado'. Sin plantillas: el documento es el que se sube.
//
// Si no viene archivo y ya hay uno guardado, REENVÍA ese mismo.
// Recibe multipart/form-data: escuela_id y (opcional) archivo, y desde el
// 06-oct-2026 también lo que captura el modal "Solicitar firmas" de provisión:
//   correo        (opcional) correo del firmante para ESTE envío; si no viene
//                 se usa el contacto de firma que capturó el colegio.
//   mensaje       (opcional) texto para el firmante, va en el cuerpo del correo.
//   firma_efirma  / firma_simple  ('1') método de firma permitido.

requerir_rol($usuario_actual['rol'] ?? '', ['superadmin', 'provision'], 'No tienes permiso para enviar contratos.');

$escuela_id = intval($_POST['escuela_id'] ?? 0);
if (!$escuela_id) respond(['success' => false, 'error' => 'escuela_id requerido']);

$st = $pdo->prepare(
    "SELECT e.nombre, e.contrato_ruta, e.contrato_nombre,
            p.contacto_contrato_nombre, p.contacto_contrato_correo
       FROM escuelas e
       LEFT JOIN escuela_datos_pago p ON p.escuela_id = e.id
      WHERE e.id = ?"
);
$st->execute([$escuela_id]);
$esc = $st->fetch();
if (!$esc) respond(['success' => false, 'error' => 'Colegio no encontrado']);

$correo = trim((string) ($_POST['correo'] ?? ''));
if ($correo === '') $correo = trim((string) ($esc['contacto_contrato_correo'] ?? ''));
if ($correo === '' || !filter_var($correo, FILTER_VALIDATE_EMAIL)) {
    respond(['success' => false, 'error' => 'Indica un correo válido para el firmante (el colegio lo captura en Mi cuenta → Personas de contacto).']);
}
$mensajeFirmante = mb_substr(trim((string) ($_POST['mensaje'] ?? '')), 0, 1000);
$usaEfirma = !empty($_POST['firma_efirma']);
$usaSimple = !empty($_POST['firma_simple']);
if (!$usaEfirma && !$usaSimple) { $usaEfirma = true; $usaSimple = true; }
$metodos = [];
if ($usaEfirma) $metodos[] = 'firma electrónica avanzada (e.firma)';
if ($usaSimple) $metodos[] = 'firma electrónica simple';
$metodosTxt = implode(' o ', $metodos);

$ruta = $esc['contrato_ruta'];
$nombreOriginal = $esc['contrato_nombre'];

if (!empty($_FILES['archivo']) && ($_FILES['archivo']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
    $g = guardar_archivo_privado($_FILES['archivo'], 'escuela_' . $escuela_id . '/contrato', ['pdf'], UPLOADS_MAX_BYTES_DOCUMENTO);
    if (!$g['ok']) respond(['success' => false, 'error' => $g['error']]);
    $ruta = $g['ruta_relativa'];
    $nombreOriginal = mb_substr(basename($_FILES['archivo']['name']), 0, 255);
    $pdo->prepare("UPDATE escuelas SET contrato_ruta = ?, contrato_nombre = ? WHERE id = ?")
        ->execute([$ruta, $nombreOriginal, $escuela_id]);
}

if (!$ruta) respond(['success' => false, 'error' => 'Sube el PDF del contrato para poder enviarlo.']);

$abs = rtrim(UPLOADS_PRIVADOS_DIR_ABS, '/\\') . '/' . $ruta;
$binario = is_file($abs) ? file_get_contents($abs) : false;
if ($binario === false || $binario === '') {
    respond(['success' => false, 'error' => 'No se encontró el archivo del contrato en el servidor. Vuelve a subirlo.']);
}

$nombreEsc = htmlspecialchars($esc['nombre'] ?: ('Escuela #' . $escuela_id));
$saludo = trim((string) $esc['contacto_contrato_nombre']) !== '' ? htmlspecialchars($esc['contacto_contrato_nombre']) : 'Hola';
$html = "
    <p>{$saludo},</p>
    <p>Te enviamos el contrato de <strong>{$nombreEsc}</strong> para su firma. Está adjunto a este correo.</p>
    " . ($mensajeFirmante !== '' ? "<p><em>" . nl2br(htmlspecialchars($mensajeFirmante)) . "</em></p>" : '') . "
    <p>Método de firma permitido: {$metodosTxt}.</p>
    <p><strong>Cuando lo tengas firmado, súbelo en la plataforma Pagalaescuela, en la sección
       «Mi cuenta» (tarjeta «Contrato»).</strong> No hace falta responder este correo ni mandarlo por otro medio:
       al subirlo, el sistema lo registra como firmado automáticamente.</p>
    <p>Para entrar a Mi cuenta usa el acceso del administrador del colegio.</p>
    <p>— Pagalaescuela</p>
";
$adjName = $nombreOriginal ? preg_replace('/[^A-Za-z0-9._ -]/', '_', $nombreOriginal) : 'contrato.pdf';
$r = enviar_correo($correo, "Contrato para firma: {$esc['nombre']}", $html, [
    ['nombre' => $adjName, 'contenido' => $binario, 'mime' => 'application/pdf'],
]);
if (!($r['success'] ?? false)) {
    log_api("enviar_contrato_escuela: falló el envío a escuela #{$escuela_id} -> " . ($r['error'] ?? 'desconocido'));
    respond(['success' => false, 'error' => 'El contrato quedó guardado pero no se pudo enviar el correo. Intenta reenviarlo.']);
}

$pdo->prepare(
    "UPDATE escuelas SET contrato_estado = 'enviado',
        contrato_fecha_envio = CURDATE(), contrato_fecha_firma = NULL
      WHERE id = ?"
)->execute([$escuela_id]);

registrar_log($pdo, $usuario_actual, 'contrato_enviado', "Colegio #$escuela_id: contrato enviado a $correo (método: $metodosTxt)", $escuela_id);

respond(['success' => true, 'mensaje' => "Contrato enviado a $correo.", 'contrato_nombre' => $nombreOriginal]);