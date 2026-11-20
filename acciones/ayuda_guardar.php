<?php
// acciones/ayuda_guardar.php — OF-7a (20-nov-2026)
//
// Crea o edita un artículo / novedad de Ayuda. Solo soporte y superadmin.
//
// Entrada (JSON): id (vacío = crear), tipo ('articulo'|'novedad'), titulo, cuerpo, roles_visibles
// (lista, subconjunto de admin/cajero; por omisión ambos), publicado (bool).
//
// El cuerpo es TEXTO PLANO con formato mínimo (párrafos, listas con "- ", **negritas**). Aquí se
// guarda tal cual lo escribieron; quien lo pinta (views/Ayuda.js) arma elementos React y nunca
// inserta el texto como HTML, así que un "<script>" escrito en el cuerpo se ve como texto.
// publicado_en se fija al publicar (y al volver a publicar un borrador): es lo que decide si una
// novedad es "nueva" para el colegio, así que corregir una errata NO la vuelve a marcar nueva.

require_once __DIR__ . '/../lib/helpers_soporte.php';

$rolSop = $usuario_actual['rol'] ?? '';
requerir_rol($rolSop, SOPORTE_ROLES_PLATAFORMA, 'Solo soporte puede editar la ayuda.');
$yo = intval($usuario_actual['user_id'] ?? 0);

soporte_requerir_tabla($pdo, 'ayuda_articulos');

$id = intval($input['id'] ?? 0);
$tipo = trim((string) ($input['tipo'] ?? ''));
if (!isset(AYUDA_TIPOS[$tipo])) respond(['success' => false, 'error' => 'Elige si es un artículo o una novedad.']);
$titulo = expediente_texto($input['titulo'] ?? null, AYUDA_MAX_TITULO, 'título');
if ($titulo === null) respond(['success' => false, 'error' => 'Escribe el título.']);
$cuerpo = expediente_texto($input['cuerpo'] ?? null, AYUDA_MAX_CUERPO, 'texto', true);
if ($cuerpo === null) respond(['success' => false, 'error' => 'Escribe el texto.']);
$roles = array_key_exists('roles_visibles', $input) ? ayuda_roles_normalizar($input['roles_visibles']) : AYUDA_ROLES_VISIBLES;
if (!$roles) respond(['success' => false, 'error' => 'Elige al menos un rol que pueda verlo (admin o cajero).']);
$publicado = expediente_bool($input['publicado'] ?? 0);
$rolesJson = json_encode($roles);

try {
    if ($id > 0) {
        $st = $pdo->prepare("SELECT publicado FROM ayuda_articulos WHERE id = ? FOR UPDATE");
        $pdo->beginTransaction();
        $st->execute([$id]);
        $ant = $st->fetch();
        if (!$ant) { $pdo->rollBack(); http_response_code(404); respond(['success' => false, 'error' => 'Artículo no encontrado.']); }
        // publicado_en: se fija al pasar de borrador a publicado; si ya estaba publicado se conserva.
        // OJO: en un UPDATE de MySQL las asignaciones se evalúan de izquierda a derecha y las
        // siguientes ya ven el valor nuevo: publicado_en va ANTES de publicado para leer el valor viejo.
        $pdo->prepare(
            "UPDATE ayuda_articulos
                SET publicado_en = CASE WHEN ? = 1 AND (publicado = 0 OR publicado_en IS NULL) THEN NOW() ELSE publicado_en END,
                    tipo = ?, titulo = ?, cuerpo = ?, roles_visibles = ?, publicado = ?
              WHERE id = ?"
        )->execute([$publicado, $tipo, $titulo, $cuerpo, $rolesJson, $publicado, $id]);
        $pdo->commit();
        $accion = 'ayuda_articulo_editado';
    } else {
        $pdo->prepare(
            "INSERT INTO ayuda_articulos (tipo, titulo, cuerpo, roles_visibles, publicado, publicado_en, creado_por, creado_en)
             VALUES (?, ?, ?, ?, ?, " . ($publicado ? 'NOW()' : 'NULL') . ", ?, NOW())"
        )->execute([$tipo, $titulo, $cuerpo, $rolesJson, $publicado, $yo]);
        $id = intval($pdo->lastInsertId());
        $accion = 'ayuda_articulo_creado';
    }
} catch (\Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    soporte_error_bd($e, 'ayuda_guardar');
}

registrar_log($pdo, $usuario_actual, $accion,
    "Ayuda #{$id} ({$tipo}, " . ($publicado ? 'publicado' : 'borrador') . "): {$titulo}", null);

respond(['success' => true, 'id' => $id, 'publicado' => (bool) $publicado]);
