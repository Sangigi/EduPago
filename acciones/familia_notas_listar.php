<?php
// acciones/familia_notas_listar.php — [OF-3] Notas de cobranza de UNA familia
// (línea de tiempo, de la más reciente a la más antigua; las eliminadas no salen).
//
// Roles: superadmin, admin y cajero de la escuela de la familia.
// Entrada: familia_id. La escuela sale de la familia, nunca del input.

require_once __DIR__ . '/../lib/helpers_notas_cobranza.php';

$fam_nl = notas_familia_autorizada($pdo, $usuario_actual, intval($input['familia_id'] ?? 0));
if (!notas_tabla_lista($pdo)) {
    respond(['success' => true, 'notas' => [], 'falta_migracion' => true,
             'aviso' => 'Falta correr la migración de OF-3 (migracion_2026_11_19_of3_cobranza.sql) para usar las notas de cobranza.']);
}

$st = $pdo->prepare(
    "SELECT n.*, u.nombre AS autor_nombre, cl.nombre AS cliente_nombre
       FROM familia_notas n
  LEFT JOIN usuarios u ON u.id = n.usuario_id
  LEFT JOIN clientes cl ON cl.id = n.cliente_id
      WHERE n.escuela_id = ? AND n.familia_id = ? AND n.eliminado = 0
      ORDER BY n.creado_en DESC, n.id DESC
      LIMIT 300"
);
$st->execute([$fam_nl['escuela_id'], $fam_nl['id']]);
$notas_nl = array_map(function ($f) use ($usuario_actual) { return notas_fila_publica($f, $usuario_actual); }, $st->fetchAll(PDO::FETCH_ASSOC));
respond(['success' => true, 'notas' => $notas_nl, 'familia' => ['id' => intval($fam_nl['id']), 'nombre' => $fam_nl['nombre']]]);
