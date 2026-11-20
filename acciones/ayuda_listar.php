<?php
// acciones/ayuda_listar.php — OF-7a (20-nov-2026)
//
// Artículos y novedades de Ayuda.
//   · admin / cajero: SOLO los publicados cuyo roles_visibles incluye su rol. El filtro es del
//     servidor (ayuda_visible_para): un borrador o un artículo de otro rol no se manda.
//   · soporte / superadmin: todos, borradores incluidos (para editarlos).
//
// El buscador de la vista filtra en el navegador sobre esta lista (son pocas filas; se limita a
// 300). Devuelve también cuántas novedades hay sin ver (el punto "nuevo" del menú).

require_once __DIR__ . '/../lib/helpers_soporte.php';

$rolSop = $usuario_actual['rol'] ?? '';
requerir_rol($rolSop, array_merge(SOPORTE_ROLES_COLEGIO, SOPORTE_ROLES_PLATAFORMA), 'No tienes permiso para ver la ayuda.');
$esPlataforma = soporte_es_plataforma($rolSop);

soporte_requerir_tabla($pdo, 'ayuda_articulos');

try {
    $st = $pdo->query(
        "SELECT a.id, a.tipo, a.titulo, a.cuerpo, a.roles_visibles, a.publicado, a.publicado_en, a.creado_en, a.actualizado_en,
                u.nombre AS autor_nombre
           FROM ayuda_articulos a LEFT JOIN usuarios u ON u.id = a.creado_por
          ORDER BY (a.tipo = 'novedad') DESC, COALESCE(a.publicado_en, a.creado_en) DESC, a.id DESC
          LIMIT 300"
    );
    $filas = $st->fetchAll();
    $novedades_sin_ver = $esPlataforma ? 0 : ayuda_contar_novedades_sin_ver($pdo, $usuario_actual);
    $vistas_en = null;
    if (!$esPlataforma) {
        // Misma base que ayuda_contar_novedades_sin_ver(): la última vez que las vio o, si nunca, su alta.
        $v = $pdo->prepare("SELECT COALESCE((SELECT novedades_vistas_en FROM ayuda_usuario WHERE usuario_id = ?),
                                            (SELECT fecha_alta FROM usuarios WHERE id = ?))");
        $yoAy = intval($usuario_actual['user_id'] ?? 0);
        $v->execute([$yoAy, $yoAy]);
        $vistas_en = $v->fetchColumn() ?: null;
    }
} catch (\PDOException $e) {
    soporte_error_bd($e, 'ayuda_listar');
}

$items = [];
foreach ($filas as $f) {
    if (!$esPlataforma && !ayuda_visible_para($f, $rolSop)) continue;
    $item = [
        'id' => intval($f['id']), 'tipo' => $f['tipo'], 'titulo' => $f['titulo'], 'cuerpo' => $f['cuerpo'],
        'publicado_en' => $f['publicado_en'], 'actualizado_en' => $f['actualizado_en'],
    ];
    if ($esPlataforma) {
        $item['roles_visibles'] = ayuda_roles_normalizar($f['roles_visibles']);
        $item['publicado'] = (bool) $f['publicado'];
        $item['creado_en'] = $f['creado_en'];
        $item['autor_nombre'] = $f['autor_nombre'];
    } elseif ($f['tipo'] === 'novedad') {
        // "Nueva" para ESTE usuario: se publicó después de la última vez que vio las novedades.
        $item['nueva'] = $vistas_en === null || strcmp((string) $f['publicado_en'], (string) $vistas_en) > 0;
    }
    $items[] = $item;
}

respond([
    'success' => true, 'items' => $items, 'novedades_sin_ver' => $novedades_sin_ver,
    'puede_editar' => $esPlataforma, 'tipos' => AYUDA_TIPOS, 'roles' => AYUDA_ROLES_VISIBLES,
]);
