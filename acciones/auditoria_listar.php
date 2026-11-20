<?php
// auditoria_listar — bitácora de auditoría con antes y después (OF-7c). Solo lectura.
//
// Roles:
//   superadmin y soporte  TODOS los colegios (filtro opcional escuela_id) y también lo de
//                         plataforma (escuela_id vacío: interruptores globales, etc.);
//   admin                 SOLO su colegio: el escuela_id sale de su sesión, nunca del input.
//
// Filtros (todos opcionales): desde, hasta (Y-m-d), usuario_id (quien hizo el cambio, a
// nombre de quién o quien lo hizo en realidad viendo como otro), accion (clave de
// AUDITORIA_ACCIONES), entidad, entidad_id, escuela_id (solo roles globales), pagina, por_pagina.
//
// Devuelve cada renglón con `antes` y `despues` ya decodificados (solo los campos que
// cambiaron; los secretos y datos médicos nunca se guardaron, ver lib/helpers_auditoria.php).
$rol_au = $usuario_actual['rol'] ?? '';
requerir_rol($rol_au, ['superadmin', 'soporte', 'admin'], 'No tienes permiso para ver la bitácora de auditoría.');
if (!auditoria_lista($pdo)) {
    respond(['success' => false, 'error' => 'La bitácora de auditoría aún no está instalada. Pide al administrador de la plataforma que aplique las migraciones (Diagnóstico → Base de datos).']);
}
$global_au = rol_alcance_global($rol_au);
if (!$global_au) {
    requerir_seccion_habilitada($pdo, $rol_au, intval($usuario_actual['escuela_id'] ?? 0), ['reportes', 'miequipo', 'dashboard']);
}

$pagina = max(1, intval($input['pagina'] ?? 1));
$por_pagina = max(1, min(intval($input['por_pagina'] ?? 25), 100));
$offset = ($pagina - 1) * $por_pagina;

$w = ['1=1']; $p = [];
if ($global_au) {
    if (!empty($input['escuela_id'])) { $w[] = 'a.escuela_id = ?'; $p[] = intval($input['escuela_id']); }
} else {
    $esc_au = intval($usuario_actual['escuela_id'] ?? 0);
    if ($esc_au <= 0) { http_response_code(403); respond(['success' => false, 'error' => 'Tu cuenta no está ligada a ningún colegio.']); }
    $w[] = 'a.escuela_id = ?'; $p[] = $esc_au; // NUNCA del input
}
if (!empty($input['desde']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $input['desde'])) { $w[] = 'a.creado_en >= ?'; $p[] = $input['desde'] . ' 00:00:00'; }
if (!empty($input['hasta']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $input['hasta'])) { $w[] = 'a.creado_en < ?'; $p[] = date('Y-m-d', strtotime($input['hasta'] . ' +1 day')) . ' 00:00:00'; }
if (!empty($input['usuario_id'])) { $w[] = '(a.usuario_id = ? OR a.suplantado_por = ?)'; $p[] = intval($input['usuario_id']); $p[] = intval($input['usuario_id']); }
if (!empty($input['accion']) && isset(AUDITORIA_ACCIONES[(string) $input['accion']])) { $w[] = 'a.accion = ?'; $p[] = (string) $input['accion']; }
if (!empty($input['entidad']) && isset(AUDITORIA_ENTIDADES[(string) $input['entidad']])) { $w[] = 'a.entidad = ?'; $p[] = (string) $input['entidad']; }
if (!empty($input['entidad_id'])) { $w[] = 'a.entidad_id = ?'; $p[] = intval($input['entidad_id']); }
$where = implode(' AND ', $w);

$cnt = $pdo->prepare("SELECT COUNT(*) FROM auditoria a WHERE {$where}");
$cnt->execute($p);
$total = intval($cnt->fetchColumn());

$st = $pdo->prepare(
    "SELECT a.id, a.escuela_id, e.nombre AS escuela_nombre, a.usuario_id, u.nombre AS usuario_nombre, u.rol AS usuario_rol,
            a.suplantado_por, r.nombre AS suplantado_por_nombre, a.accion, a.entidad, a.entidad_id, a.antes, a.despues, a.ip, a.creado_en
       FROM auditoria a
       LEFT JOIN usuarios u ON u.id = a.usuario_id
       LEFT JOIN usuarios r ON r.id = a.suplantado_por
       LEFT JOIN escuelas e ON e.id = a.escuela_id
      WHERE {$where}
      ORDER BY a.id DESC
      LIMIT {$por_pagina} OFFSET {$offset}"
);
$st->execute($p);
$filas = $st->fetchAll(PDO::FETCH_ASSOC);
foreach ($filas as &$f) {
    $f['id'] = intval($f['id']);
    foreach (['escuela_id', 'usuario_id', 'suplantado_por', 'entidad_id'] as $k) $f[$k] = $f[$k] !== null ? intval($f[$k]) : null;
    $f['antes'] = $f['antes'] !== null ? (json_decode($f['antes'], true) ?: (object) []) : (object) [];
    $f['despues'] = $f['despues'] !== null ? (json_decode($f['despues'], true) ?: (object) []) : (object) [];
    $f['accion_texto'] = AUDITORIA_ACCIONES[$f['accion']] ?? $f['accion'];
    // La IP solo la ve la plataforma: el admin del colegio no necesita la de su propio personal.
    if (!$global_au) unset($f['ip']);
}
unset($f);

// Para los filtros de la pantalla: quiénes aparecen (los 200 más recientes con movimiento).
$qu = $pdo->prepare(
    "SELECT DISTINCT u.id, u.nombre FROM auditoria a JOIN usuarios u ON u.id = a.usuario_id
      WHERE " . ($global_au ? '1=1' : 'a.escuela_id = ?') . " ORDER BY u.nombre LIMIT 200"
);
$qu->execute($global_au ? [] : [intval($usuario_actual['escuela_id'])]);
$usuarios_filtro = $qu->fetchAll(PDO::FETCH_ASSOC);

respond(['success' => true, 'registros' => $filas, 'total' => $total, 'pagina' => $pagina, 'por_pagina' => $por_pagina,
         'acciones' => AUDITORIA_ACCIONES, 'entidades' => AUDITORIA_ENTIDADES, 'usuarios' => $usuarios_filtro]);
