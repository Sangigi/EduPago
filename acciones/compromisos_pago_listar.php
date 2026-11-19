<?php
// acciones/compromisos_pago_listar.php — [OF-3] Compromisos de pago con fecha de
// HOY o VENCIDOS y sin cumplir, de toda la escuela (para el bloque "Compromisos de
// pago de hoy y vencidos" de Recordatorios).
//
// Roles: superadmin, admin y cajero. La escuela sale del usuario (admin, cajero);
// el superadmin la manda como escuela_id. Cada fila trae lo que la familia debe
// hoy (suma de saldo_pendiente de sus alumnos) para que el cajero vea si ya pagó.
//
// Entrada: escuela_id (solo superadmin).

require_once __DIR__ . '/../lib/helpers_notas_cobranza.php';

$rol_cp = $usuario_actual['rol'] ?? '';
requerir_rol($rol_cp, NOTA_ROLES, 'No tienes permiso para ver los compromisos de pago.');
$escuela_cp = $rol_cp === 'superadmin' ? intval($input['escuela_id'] ?? 0) : intval($usuario_actual['escuela_id'] ?? 0);
if ($escuela_cp <= 0) respond(['success' => false, 'error' => 'escuela_id requerido']);
requerir_seccion_habilitada($pdo, $rol_cp, $escuela_cp, ['familias', 'cobros', 'recordatorios']);
if (!notas_tabla_lista($pdo)) {
    respond(['success' => true, 'compromisos' => [], 'falta_migracion' => true]);
}

$st = $pdo->prepare(
    "SELECT n.*, u.nombre AS autor_nombre, cl.nombre AS cliente_nombre, f.nombre AS familia_nombre,
            (SELECT COALESCE(SUM(c2.saldo_pendiente), 0) FROM clientes c2
              WHERE c2.familia_id = n.familia_id AND c2.escuela_id = n.escuela_id) AS saldo_familia
       FROM familia_notas n
       JOIN familias f ON f.id = n.familia_id AND f.escuela_id = n.escuela_id
  LEFT JOIN usuarios u ON u.id = n.usuario_id
  LEFT JOIN clientes cl ON cl.id = n.cliente_id
      WHERE n.escuela_id = ? AND n.eliminado = 0
        AND n.fecha_compromiso IS NOT NULL AND n.fecha_compromiso <= CURDATE()
        AND (n.cumplido IS NULL OR n.cumplido = 0)
      ORDER BY n.fecha_compromiso ASC, n.id ASC
      LIMIT 300"
);
$st->execute([$escuela_cp]);
$hoy_cp = date('Y-m-d');
$compromisos = array_map(function ($f) use ($usuario_actual, $hoy_cp) {
    $n = notas_fila_publica($f, $usuario_actual);
    $n['familia_nombre'] = $f['familia_nombre'];
    $n['saldo_familia'] = round(floatval($f['saldo_familia']), 2);
    $n['vencido'] = $f['fecha_compromiso'] < $hoy_cp;
    return $n;
}, $st->fetchAll(PDO::FETCH_ASSOC));
respond(['success' => true, 'compromisos' => $compromisos, 'hoy' => $hoy_cp]);
