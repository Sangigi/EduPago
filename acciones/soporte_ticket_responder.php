<?php
// acciones/soporte_ticket_responder.php — OF-7a (20-nov-2026)
//
// Agrega un mensaje a un ticket. multipart/form-data (puede llevar adjuntos): $input
// llega vacío y se lee $_POST/$_FILES.
//
// Entrada ($_POST): ticket_id, texto, interno (solo plataforma: '1' = nota interna),
// estado (solo plataforma, mensaje público: estado en que queda el ticket tras
// responder). ($_FILES): archivos[] (opcional, hasta 5).
//
//   · colegio (admin/cajero): solo en tickets de SU escuela. `interno` se IGNORA: nunca
//     puede escribir una nota interna. Si el ticket estaba resuelto, se reabre.
//   · plataforma: mensaje público (se avisa por correo al colegio) o nota interna (nadie
//     más la ve y NO manda correo). Al contestar un ticket sin asignar, queda asignado a
//     quien contestó.
//
// Las reglas de estado salen de soporte_estado_tras_mensaje() (probada en pruebas.php).

require_once __DIR__ . '/../lib/helpers_soporte.php';

$rolSop = $usuario_actual['rol'] ?? '';
requerir_rol($rolSop, array_merge(SOPORTE_ROLES_COLEGIO, SOPORTE_ROLES_PLATAFORMA), 'No tienes permiso para responder tickets de soporte.');
$esPlataforma = soporte_es_plataforma($rolSop);
$lado = soporte_lado($rolSop);
$yo = intval($usuario_actual['user_id'] ?? 0);

soporte_requerir_tabla($pdo, 'soporte_tickets');

if (empty($_POST) && intval($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
    respond(['success' => false, 'error' => 'El envío es demasiado grande para el servidor. Adjunta menos archivos o más pequeños.']);
}

$texto = soporte_texto_mensaje($_POST['texto'] ?? null, 'mensaje');
// SOLO la plataforma puede marcar una nota como interna; para el colegio el campo no existe.
$interno = $esPlataforma && in_array(strtolower((string) ($_POST['interno'] ?? '')), ['1', 'true', 'si', 'on'], true) ? 1 : 0;
$estadoPedido = $esPlataforma && !$interno ? trim((string) ($_POST['estado'] ?? '')) : null;
if ($estadoPedido !== null && $estadoPedido !== '' && !isset(SOPORTE_ESTADOS[$estadoPedido])) {
    respond(['success' => false, 'error' => 'El estado elegido no es válido.']);
}

// Propiedad ANTES de guardar archivos: no se escribe nada en disco para un ticket ajeno.
$ticket = soporte_ticket_cargar($pdo, $usuario_actual, $_POST['ticket_id'] ?? 0);

$sc = $pdo->prepare("SELECT COUNT(*) FROM soporte_adjuntos WHERE ticket_id = ?");
$sc->execute([$ticket['id']]);
$archivos = soporte_archivos_subidos('archivos');
if (intval($sc->fetchColumn()) + count($archivos) > SOPORTE_MAX_ADJUNTOS_TICKET) {
    respond(['success' => false, 'error' => 'Este ticket ya tiene demasiados archivos adjuntos (máximo ' . SOPORTE_MAX_ADJUNTOS_TICKET . ').']);
}
$guardados = soporte_guardar_adjuntos($archivos, $ticket['escuela_id'], $ticket['id']);

$estadoNuevo = $ticket['estado'];
try {
    $pdo->beginTransaction();
    // Se vuelve a leer el ticket con candado: el estado que decide la transición es el de AHORA.
    $actual = soporte_ticket_cargar($pdo, $usuario_actual, $ticket['id'], true);
    $estadoNuevo = $actual['estado'];

    $pdo->prepare(
        "INSERT INTO soporte_mensajes (ticket_id, usuario_id, rol_autor, texto, interno, creado_en) VALUES (?, ?, ?, ?, ?, NOW())"
    )->execute([$actual['id'], $yo, $rolSop, $texto, $interno]);
    $mensaje_id = intval($pdo->lastInsertId());
    foreach ($guardados as $g) {
        $pdo->prepare(
            "INSERT INTO soporte_adjuntos (ticket_id, mensaje_id, nombre_original, ruta_archivo, mime_real, tamano_bytes, creado_en)
             VALUES (?, ?, ?, ?, ?, ?, NOW())"
        )->execute([$actual['id'], $mensaje_id, $g['nombre_original'], $g['ruta_relativa'], $g['mime_real'], $g['tamano_bytes']]);
    }

    if ($interno) {
        // Una nota interna no cambia estado, ni "último autor", ni lo que el colegio ve como novedad.
        $pdo->prepare("UPDATE soporte_tickets SET actualizado_en = NOW() WHERE id = ?")->execute([$actual['id']]);
    } else {
        $estadoNuevo = soporte_estado_tras_mensaje($actual['estado'], $lado, $estadoPedido);
        $asignar = ($esPlataforma && !$actual['asignado_a']) ? $yo : $actual['asignado_a'];
        $pdo->prepare(
            "UPDATE soporte_tickets
                SET ultimo_autor = ?, ultimo_mensaje_en = NOW(3), estado = ?, asignado_a = ?,
                    cerrado_en = CASE WHEN ? = 'resuelto' THEN COALESCE(cerrado_en, NOW()) ELSE NULL END
              WHERE id = ?"
        )->execute([$lado, $estadoNuevo, $asignar, $estadoNuevo, $actual['id']]);
        $u = $pdo->prepare("SELECT ultimo_mensaje_en FROM soporte_tickets WHERE id = ?");
        $u->execute([$actual['id']]);
        soporte_marcar_leido($pdo, $actual['id'], $yo, $u->fetchColumn());
    }
    $pdo->commit();
} catch (\Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    soporte_borrar_archivos($guardados);
    soporte_error_bd($e, 'soporte_ticket_responder');
}

// Sin el texto: ni la nota ni el mensaje van al log.
registrar_log($pdo, $usuario_actual, $interno ? 'soporte_nota_interna' : 'soporte_ticket_respuesta',
    "Ticket #{$ticket['id']}: " . ($interno ? 'nota interna' : "respuesta del {$lado}") . ($estadoNuevo !== $ticket['estado'] ? " (estado {$ticket['estado']} → {$estadoNuevo})" : '')
    . ', ' . count($guardados) . ' adjunto(s)', $ticket['escuela_id']);

// Correos (nunca con el contenido): soporte contesta → al colegio; el colegio contesta → a soporte.
// Una nota interna no manda nada a nadie.
$correo_enviado = false;
if (!$interno) {
    if ($esPlataforma) {
        $correo_enviado = soporte_enviar_aviso($pdo, soporte_correos_colegio($pdo, $ticket['id'], $ticket['creado_por']),
            "Soporte respondió tu ticket #{$ticket['id']}",
            "Tienes una respuesta de soporte en el ticket #{$ticket['id']}",
            'El equipo de soporte de EduPago respondió a tu solicitud. Entra a Ayuda para leer la respuesta y contestar.',
            $ticket['id']);
    } else {
        $correo_enviado = soporte_enviar_aviso($pdo, soporte_correos_plataforma($pdo),
            "Respuesta del colegio en el ticket #{$ticket['id']}",
            "Nueva respuesta en el ticket #{$ticket['id']}",
            'El colegio ' . ($ticket['escuela_nombre'] ?: '#' . $ticket['escuela_id']) . ' respondió en su ticket de soporte.',
            $ticket['id']);
    }
    // [OF-7b] Aviso push (texto genérico, nunca el contenido), solo en mensajes PÚBLICOS: la nota interna
    // no avisa a nadie. Soporte contestó -> admin y cajero de ESE colegio; el colegio contestó -> soporte y
    // superadmin. Solo ENCOLA (try/catch, nunca lanza); el envío va DESPUÉS de responder.
    if ($esPlataforma) push_aviso_soporte_respondio($pdo, intval($ticket['escuela_id']));
    else push_aviso_a_plataforma($pdo, 'soporte_colegio');
}

respond([
    'success' => true, 'mensaje_id' => $mensaje_id, 'estado' => $estadoNuevo,
    'estado_nombre' => SOPORTE_ESTADOS[$estadoNuevo] ?? $estadoNuevo,
    'interno' => (bool) $interno, 'adjuntos' => count($guardados), 'aviso_enviado' => $correo_enviado,
]);
