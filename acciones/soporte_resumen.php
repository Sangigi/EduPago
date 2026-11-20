<?php
// acciones/soporte_resumen.php — OF-7a (20-nov-2026)
//
// Los contadores del menú, en una sola llamada ligera:
//   · colegio (admin/cajero): tickets de SU escuela con respuesta de soporte sin leer, y si hay
//     novedades de Ayuda sin ver (el punto "nuevo").
//   · plataforma (soporte/superadmin): tickets vivos sin respuesta y cuántos de ellos no ha abierto
//     este usuario.
//
// TOLERANTE: si la migración aún no corrió devuelve ceros con instalado=false (no un error), para
// que el menú de TODA la app no se rompa por esto.

require_once __DIR__ . '/../lib/helpers_soporte.php';

$rolSop = $usuario_actual['rol'] ?? '';
requerir_rol($rolSop, array_merge(SOPORTE_ROLES_COLEGIO, SOPORTE_ROLES_PLATAFORMA), 'No tienes permiso para esta consulta.');
$esPlataforma = soporte_es_plataforma($rolSop);
$yo = intval($usuario_actual['user_id'] ?? 0);

$out = ['success' => true, 'instalado' => true, 'no_leidos' => 0, 'sin_respuesta' => 0, 'novedades_sin_ver' => 0];

try {
    if ($esPlataforma) {
        $st = $pdo->prepare(
            "SELECT COUNT(*) AS sin_respuesta,
                    SUM(l.leido_en IS NULL OR l.leido_en < t.ultimo_mensaje_en) AS no_leidos
               FROM soporte_tickets t LEFT JOIN soporte_lecturas l ON l.ticket_id = t.id AND l.usuario_id = ?
              WHERE t.estado <> 'resuelto' AND t.ultimo_autor = 'colegio'"
        );
        $st->execute([$yo]);
        $f = $st->fetch();
        $out['sin_respuesta'] = intval($f['sin_respuesta']);
        $out['no_leidos'] = intval($f['no_leidos']);
    } else {
        $esc = intval($usuario_actual['escuela_id'] ?? 0);
        $st = $pdo->prepare(
            "SELECT COUNT(*) FROM soporte_tickets t LEFT JOIN soporte_lecturas l ON l.ticket_id = t.id AND l.usuario_id = ?
              WHERE t.escuela_id = ? AND t.ultimo_autor = 'soporte' AND (l.leido_en IS NULL OR l.leido_en < t.ultimo_mensaje_en)"
        );
        $st->execute([$yo, $esc]);
        $out['no_leidos'] = intval($st->fetchColumn());
    }
} catch (\PDOException $e) {
    $out['instalado'] = false;
}

if (!$esPlataforma) {
    try {
        $out['novedades_sin_ver'] = ayuda_contar_novedades_sin_ver($pdo, $usuario_actual);
    } catch (\PDOException $e) { /* sin migración: sin punto "nuevo" */ }
}
respond($out);
