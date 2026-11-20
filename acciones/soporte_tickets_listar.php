<?php
// acciones/soporte_tickets_listar.php — OF-7a (20-nov-2026)
//
// Lista de tickets. Una sola acción para los dos lados, con alcance distinto:
//   · admin / cajero:      SOLO los de su escuela (la escuela sale de la sesión; un
//                          escuela_id en la petición se ignora).
//   · soporte / superadmin: todos los colegios, con filtros y la bandeja ordenada
//                          "lo más viejo y sin respuesta primero".
//
// Entrada (JSON, todo opcional): estado ('abiertos' = todo menos resueltos, 'todos' o un
// estado), categoria, escuela_id (solo plataforma), asignado ('yo' | 'ninguno' | id; solo
// plataforma), q (texto en el asunto), pagina.
//
// No devuelve el texto de los mensajes (eso es soporte_ticket_ver): solo la fila resumen.

require_once __DIR__ . '/../lib/helpers_soporte.php';

$rolSop = $usuario_actual['rol'] ?? '';
requerir_rol($rolSop, array_merge(SOPORTE_ROLES_COLEGIO, SOPORTE_ROLES_PLATAFORMA), 'No tienes permiso para ver tickets de soporte.');
$esPlataforma = soporte_es_plataforma($rolSop);
$yo = intval($usuario_actual['user_id'] ?? 0);

soporte_requerir_tabla($pdo, 'soporte_tickets');

$donde = [];
$params = [];
if ($esPlataforma) {
    $eid = intval($input['escuela_id'] ?? 0);
    if ($eid > 0) { $donde[] = 't.escuela_id = ?'; $params[] = $eid; }
    $asig = $input['asignado'] ?? '';
    if ($asig === 'yo') { $donde[] = 't.asignado_a = ?'; $params[] = $yo; }
    elseif ($asig === 'ninguno') { $donde[] = 't.asignado_a IS NULL'; }
    elseif (intval($asig) > 0) { $donde[] = 't.asignado_a = ?'; $params[] = intval($asig); }
} else {
    $miEscuela = intval($usuario_actual['escuela_id'] ?? 0);
    if ($miEscuela <= 0) respond(['success' => false, 'error' => 'Tu cuenta no está ligada a ningún colegio.']);
    $donde[] = 't.escuela_id = ?';
    $params[] = $miEscuela;
}

// El conteo por estado se calcula con los filtros de colegio/asignado/categoría/búsqueda,
// pero SIN el filtro de estado (para que las pestañas muestren cuántos hay en cada una).
$cat = trim((string) ($input['categoria'] ?? ''));
if ($cat !== '' && isset(SOPORTE_CATEGORIAS[$cat])) { $donde[] = 't.categoria = ?'; $params[] = $cat; }
$q = trim((string) ($input['q'] ?? ''));
if ($q !== '') {
    $donde[] = "t.asunto LIKE ? ESCAPE '|'";
    $params[] = '%' . str_replace(['|', '%', '_'], ['||', '|%', '|_'], mb_substr($q, 0, 80, 'UTF-8')) . '%';
}
$whereBase = $donde ? 'WHERE ' . implode(' AND ', $donde) : '';

$estadoF = trim((string) ($input['estado'] ?? 'abiertos'));
$dondeEstado = '';
$paramsEstado = [];
if ($estadoF === 'abiertos' || $estadoF === '') { $dondeEstado = "t.estado <> 'resuelto'"; }
elseif (isset(SOPORTE_ESTADOS[$estadoF])) { $dondeEstado = 't.estado = ?'; $paramsEstado[] = $estadoF; }
$whereLista = $whereBase . ($dondeEstado ? ($whereBase ? ' AND ' : 'WHERE ') . $dondeEstado : '');

$porPagina = 40;
$pagina = max(1, intval($input['pagina'] ?? 1));

try {
    $conteo = $pdo->prepare("SELECT t.estado, COUNT(*) AS n FROM soporte_tickets t {$whereBase} GROUP BY t.estado");
    $conteo->execute($params);
    $conteos = array_fill_keys(array_keys(SOPORTE_ESTADOS), 0);
    foreach ($conteo->fetchAll() as $c) $conteos[$c['estado']] = intval($c['n']);

    $total = $pdo->prepare("SELECT COUNT(*) FROM soporte_tickets t {$whereLista}");
    $total->execute(array_merge($params, $paramsEstado));
    $total = intval($total->fetchColumn());

    // Orden de la bandeja: resueltos al final; entre los demás, primero los que el colegio
    // escribió y soporte no ha contestado; dentro de cada grupo, el más VIEJO primero.
    // Del lado del colegio se ordena igual (lo último que pasó arriba tiene poco sentido
    // con pocos tickets), pero con lo más reciente primero.
    $orden = $esPlataforma
        ? "(t.estado = 'resuelto') ASC, (t.ultimo_autor = 'colegio') DESC, t.ultimo_mensaje_en ASC, t.id ASC"
        : "(t.estado = 'resuelto') ASC, t.ultimo_mensaje_en DESC, t.id DESC";

    $sql = "SELECT t.id, t.escuela_id, e.nombre AS escuela_nombre, t.creado_por, uc.nombre AS creado_por_nombre,
                   t.asunto, t.categoria, t.estado, t.prioridad, t.asignado_a, ua.nombre AS asignado_nombre,
                   t.ultimo_autor, t.ultimo_mensaje_en, t.creado_en, t.actualizado_en, t.cerrado_en,
                   TIMESTAMPDIFF(MINUTE, t.ultimo_mensaje_en, NOW(3)) AS minutos_desde_ultimo,
                   TIMESTAMPDIFF(MINUTE, t.creado_en, NOW()) AS minutos_abierto,
                   (t.ultimo_autor = ? AND (l.leido_en IS NULL OR l.leido_en < t.ultimo_mensaje_en)) AS no_leido
              FROM soporte_tickets t
              LEFT JOIN escuelas e ON e.id = t.escuela_id
              LEFT JOIN usuarios uc ON uc.id = t.creado_por
              LEFT JOIN usuarios ua ON ua.id = t.asignado_a
              LEFT JOIN soporte_lecturas l ON l.ticket_id = t.id AND l.usuario_id = ?
              {$whereLista}
              ORDER BY {$orden}
              LIMIT {$porPagina} OFFSET " . (($pagina - 1) * $porPagina);
    // "No leído" = lo último que se escribió es del OTRO lado y no lo he abierto desde entonces.
    $st = $pdo->prepare($sql);
    $st->execute(array_merge([$esPlataforma ? 'colegio' : 'soporte', $yo], $params, $paramsEstado));
    $tickets = $st->fetchAll();
} catch (\PDOException $e) {
    soporte_error_bd($e, 'soporte_tickets_listar');
}

foreach ($tickets as &$t) {
    foreach (['id', 'escuela_id', 'creado_por', 'minutos_desde_ultimo', 'minutos_abierto'] as $k) $t[$k] = intval($t[$k]);
    $t['asignado_a'] = $t['asignado_a'] ? intval($t['asignado_a']) : null;
    $t['no_leido'] = (bool) $t['no_leido'];
    // "Sin respuesta" = el colegio habló último y el ticket sigue vivo.
    $t['sin_respuesta'] = $t['ultimo_autor'] === 'colegio' && $t['estado'] !== 'resuelto';
    $t['categoria_nombre'] = SOPORTE_CATEGORIAS[$t['categoria']] ?? $t['categoria'];
    $t['estado_nombre'] = SOPORTE_ESTADOS[$t['estado']] ?? $t['estado'];
    if (!$esPlataforma) {
        // El colegio no necesita saber quién de soporte lo tiene asignado.
        unset($t['asignado_a'], $t['asignado_nombre'], $t['prioridad']);
    }
}
unset($t);

$out = [
    'success' => true, 'tickets' => $tickets, 'total' => $total, 'pagina' => $pagina,
    'por_pagina' => $porPagina, 'conteos' => $conteos,
    'categorias' => SOPORTE_CATEGORIAS, 'estados' => SOPORTE_ESTADOS,
];
if ($esPlataforma) {
    // Quién puede tener un ticket asignado.
    $ag = $pdo->query("SELECT id, nombre, rol FROM usuarios WHERE rol IN ('soporte', 'superadmin') AND activo = 1 ORDER BY nombre");
    $out['agentes'] = array_map(function ($a) { return ['id' => intval($a['id']), 'nombre' => $a['nombre'], 'rol' => $a['rol']]; }, $ag->fetchAll());
    $out['prioridades'] = SOPORTE_PRIORIDADES;
}
respond($out);
