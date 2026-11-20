<?php
// acciones/soporte_ticket_crear.php — OF-7a (20-nov-2026)
//
// El colegio abre un ticket de soporte. multipart/form-data (lleva adjuntos), NO
// JSON: $input llega vacío y se lee $_POST/$_FILES, igual que alumno_documento_subir.
//
// Entrada ($_POST): asunto, categoria, mensaje. ($_FILES): archivos[] (opcional, hasta 5).
//
// Solo admin y cajero, y SIEMPRE en su propia escuela: la escuela sale de la sesión,
// nunca de lo que mande el navegador.

require_once __DIR__ . '/../lib/helpers_soporte.php';

$rolSop = $usuario_actual['rol'] ?? '';
requerir_rol($rolSop, SOPORTE_ROLES_COLEGIO, 'Solo el personal del colegio puede abrir tickets de soporte.');
$escuela_id = intval($usuario_actual['escuela_id'] ?? 0);
if ($escuela_id <= 0) respond(['success' => false, 'error' => 'Tu cuenta no está ligada a ningún colegio.']);
$usuario_id = intval($usuario_actual['user_id'] ?? 0);

soporte_requerir_tabla($pdo, 'soporte_tickets');

// Si el envío rebasa post_max_size de PHP, $_POST y $_FILES llegan VACÍOS y el
// error parecería "falta el asunto": se dice lo que pasó.
if (empty($_POST) && intval($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
    respond(['success' => false, 'error' => 'El envío es demasiado grande para el servidor. Adjunta menos archivos o más pequeños.']);
}

$asunto = expediente_texto($_POST['asunto'] ?? null, SOPORTE_MAX_ASUNTO, 'asunto');
if ($asunto === null) respond(['success' => false, 'error' => 'Escribe el asunto del ticket.']);
$categoria = trim((string) ($_POST['categoria'] ?? 'otro'));
if (!isset(SOPORTE_CATEGORIAS[$categoria])) respond(['success' => false, 'error' => 'Elige una categoría válida.']);
$mensaje = soporte_texto_mensaje($_POST['mensaje'] ?? null, 'mensaje');

// Freno anti-abuso: un usuario no abre más de N tickets por hora.
$sc = $pdo->prepare("SELECT COUNT(*) FROM soporte_tickets WHERE creado_por = ? AND creado_en > DATE_SUB(NOW(), INTERVAL 1 HOUR)");
$sc->execute([$usuario_id]);
if (intval($sc->fetchColumn()) >= SOPORTE_MAX_TICKETS_POR_HORA) {
    respond(['success' => false, 'error' => 'Abriste varios tickets en poco tiempo. Responde en alguno de los que ya tienes abiertos o intenta de nuevo en una hora.']);
}

// Los archivos se validan y guardan ANTES de tocar la base; si el INSERT falla se borran.
$guardados = soporte_guardar_adjuntos(soporte_archivos_subidos('archivos'), $escuela_id, null);

try {
    $pdo->beginTransaction();
    $pdo->prepare(
        "INSERT INTO soporte_tickets (escuela_id, creado_por, asunto, categoria, estado, prioridad, ultimo_autor, ultimo_mensaje_en, creado_en)
         VALUES (?, ?, ?, ?, 'abierto', 'normal', 'colegio', NOW(3), NOW())"
    )->execute([$escuela_id, $usuario_id, $asunto, $categoria]);
    $ticket_id = intval($pdo->lastInsertId());

    $pdo->prepare(
        "INSERT INTO soporte_mensajes (ticket_id, usuario_id, rol_autor, texto, interno, creado_en) VALUES (?, ?, ?, ?, 0, NOW())"
    )->execute([$ticket_id, $usuario_id, $rolSop, $mensaje]);
    $mensaje_id = intval($pdo->lastInsertId());

    foreach ($guardados as $g) {
        $pdo->prepare(
            "INSERT INTO soporte_adjuntos (ticket_id, mensaje_id, nombre_original, ruta_archivo, mime_real, tamano_bytes, creado_en)
             VALUES (?, ?, ?, ?, ?, ?, NOW())"
        )->execute([$ticket_id, $mensaje_id, $g['nombre_original'], $g['ruta_relativa'], $g['mime_real'], $g['tamano_bytes']]);
    }
    // El que lo crea ya "vio" su propio ticket.
    $u = $pdo->prepare("SELECT ultimo_mensaje_en FROM soporte_tickets WHERE id = ?");
    $u->execute([$ticket_id]);
    soporte_marcar_leido($pdo, $ticket_id, $usuario_id, $u->fetchColumn());
    $pdo->commit();
} catch (\Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    soporte_borrar_archivos($guardados);
    soporte_error_bd($e, 'soporte_ticket_crear');
}

registrar_log($pdo, $usuario_actual, 'soporte_ticket_creado',
    "Ticket #{$ticket_id} ({$categoria}), " . count($guardados) . ' adjunto(s)', $escuela_id);

// Aviso a soporte y superadmin: solo número, colegio y liga (nada del contenido).
$nombreEsc = '';
try {
    $en = $pdo->prepare("SELECT nombre FROM escuelas WHERE id = ?");
    $en->execute([$escuela_id]);
    $nombreEsc = (string) $en->fetchColumn();
} catch (\Throwable $e) { /* el aviso sale igual sin el nombre */ }
$correo_enviado = soporte_enviar_aviso($pdo, soporte_correos_plataforma($pdo),
    "Nuevo ticket de soporte #{$ticket_id}",
    "Nuevo ticket #{$ticket_id}",
    "El colegio " . ($nombreEsc !== '' ? $nombreEsc : "#{$escuela_id}") . " abrió un ticket de soporte (" . SOPORTE_CATEGORIAS[$categoria] . ").",
    $ticket_id);

// [OF-7b] Aviso push a soporte y superadmin (texto genérico; nada del contenido). Solo ENCOLA (try/catch,
// nunca lanza); el envío va DESPUÉS de responder.
push_aviso_a_plataforma($pdo, 'soporte_nuevo');

respond(['success' => true, 'ticket_id' => $ticket_id, 'adjuntos' => count($guardados), 'aviso_enviado' => $correo_enviado]);
