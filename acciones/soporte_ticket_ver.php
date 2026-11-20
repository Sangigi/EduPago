<?php
// acciones/soporte_ticket_ver.php — OF-7a (20-nov-2026)
//
// Un ticket con su conversación y sus adjuntos. Marca el ticket como leído para quien
// lo abre (hasta el último mensaje que se le muestra).
//
// Entrada (JSON): ticket_id.
//
// NOTAS INTERNAS: para admin/cajero la consulta de mensajes lleva `interno = 0` (ver
// soporte_condicion_interno), y los adjuntos se piden con el mismo filtro a través de su
// mensaje. No es un detalle de la vista: aunque alguien llame esta acción a mano, el
// servidor no manda lo interno. Tampoco se le manda el nombre ni el correo de quien de
// soporte escribió: ve "Soporte".

require_once __DIR__ . '/../lib/helpers_soporte.php';

$rolSop = $usuario_actual['rol'] ?? '';
requerir_rol($rolSop, array_merge(SOPORTE_ROLES_COLEGIO, SOPORTE_ROLES_PLATAFORMA), 'No tienes permiso para ver tickets de soporte.');
$esPlataforma = soporte_es_plataforma($rolSop);
$yo = intval($usuario_actual['user_id'] ?? 0);

soporte_requerir_tabla($pdo, 'soporte_tickets');
$ticket = soporte_ticket_cargar($pdo, $usuario_actual, $input['ticket_id'] ?? 0);

try {
    $st = $pdo->prepare(
        "SELECT m.id, m.usuario_id, m.rol_autor, m.texto, m.interno, m.creado_en, u.nombre AS autor_nombre
           FROM soporte_mensajes m LEFT JOIN usuarios u ON u.id = m.usuario_id
          WHERE m.ticket_id = ?" . soporte_condicion_interno($rolSop, 'm') . "
          ORDER BY m.creado_en ASC, m.id ASC"
    );
    $st->execute([$ticket['id']]);
    $mensajes = $st->fetchAll();

    $sa = $pdo->prepare(
        "SELECT a.id, a.mensaje_id, a.nombre_original, a.mime_real, a.tamano_bytes
           FROM soporte_adjuntos a JOIN soporte_mensajes m ON m.id = a.mensaje_id
          WHERE a.ticket_id = ?" . soporte_condicion_interno($rolSop, 'm') . "
          ORDER BY a.id ASC"
    );
    $sa->execute([$ticket['id']]);
    $adjuntosPorMensaje = [];
    foreach ($sa->fetchAll() as $a) {
        $adjuntosPorMensaje[intval($a['mensaje_id'])][] = [
            'id' => intval($a['id']), 'nombre_original' => $a['nombre_original'],
            'mime_real' => $a['mime_real'], 'tamano_bytes' => intval($a['tamano_bytes']),
        ];
    }

    // Marca de leído: hasta el último mensaje público (ultimo_mensaje_en), no hasta "ahora": si
    // llegó otro mientras se armaba esta respuesta, seguirá apareciendo como no leído.
    soporte_marcar_leido($pdo, $ticket['id'], $yo, $ticket['ultimo_mensaje_en']);
} catch (\PDOException $e) {
    soporte_error_bd($e, 'soporte_ticket_ver');
}

$salida = [];
foreach ($mensajes as $m) {
    $delSoporte = soporte_es_plataforma($m['rol_autor']);
    $fila = [
        'id' => intval($m['id']),
        'lado' => $delSoporte ? 'soporte' : 'colegio',
        'texto' => $m['texto'],
        'creado_en' => $m['creado_en'],
        'adjuntos' => $adjuntosPorMensaje[intval($m['id'])] ?? [],
        'propio' => intval($m['usuario_id']) === $yo,
    ];
    if ($esPlataforma) {
        $fila['interno'] = (bool) $m['interno'];
        $fila['autor_nombre'] = $m['autor_nombre'];
    } else {
        // Nada de nombres de soporte; el de un compañero del colegio sí (lo ven en su propio ticket).
        $fila['autor_nombre'] = $delSoporte ? 'Soporte EduPago' : $m['autor_nombre'];
    }
    $salida[] = $fila;
}

$t = [
    'id' => $ticket['id'], 'escuela_id' => $ticket['escuela_id'], 'escuela_nombre' => $ticket['escuela_nombre'],
    'asunto' => $ticket['asunto'], 'categoria' => $ticket['categoria'],
    'categoria_nombre' => SOPORTE_CATEGORIAS[$ticket['categoria']] ?? $ticket['categoria'],
    'estado' => $ticket['estado'], 'estado_nombre' => SOPORTE_ESTADOS[$ticket['estado']] ?? $ticket['estado'],
    'creado_en' => $ticket['creado_en'], 'actualizado_en' => $ticket['actualizado_en'], 'cerrado_en' => $ticket['cerrado_en'],
    'creado_por' => $ticket['creado_por'],
];
if ($esPlataforma) {
    $t['prioridad'] = $ticket['prioridad'];
    $t['asignado_a'] = $ticket['asignado_a'];
}
respond([
    'success' => true, 'ticket' => $t, 'mensajes' => $salida,
    'puede_nota_interna' => $esPlataforma,
    'estados' => SOPORTE_ESTADOS,
    'max_adjuntos' => SOPORTE_MAX_ADJUNTOS_MENSAJE,
    'max_bytes' => defined('UPLOADS_MAX_BYTES_DOCUMENTO') ? UPLOADS_MAX_BYTES_DOCUMENTO : null,
]);
