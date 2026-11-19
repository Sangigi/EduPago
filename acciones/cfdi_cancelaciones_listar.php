<?php
// acciones/cfdi_cancelaciones_listar.php  [OF-2]
//
// Historial de facturas canceladas (y de solicitudes pendientes) de un colegio,
// para la pestaña "Canceladas" de Facturación.
//   entrada: { escuela_id }   roles: superadmin y admin de ese colegio.

require_once __DIR__ . '/../lib/helpers_cancelacion.php';

$rol_lc = $usuario_actual['rol'] ?? '';
requerir_rol($rol_lc, ['superadmin', 'admin'], 'No tienes permiso para ver el historial de cancelaciones.');
$escuela_id = intval($input['escuela_id'] ?? 0);
if (!$escuela_id) respond(['success' => false, 'error' => 'escuela_id requerido']);
requerir_escuela_propia($rol_lc, $escuela_id, $usuario_actual, 'No tienes permiso sobre este colegio.');

if (!cancelacion_migracion_lista($pdo)) {
    respond(['success' => true, 'cancelaciones' => [], 'aviso' => 'Falta aplicar una actualización de la base de datos para poder cancelar facturas.']);
}
$stmt = $pdo->prepare(
    "SELECT f.id, f.cobro_id, f.uuid, f.serie_folio, f.total, f.rfc_receptor, f.motivo,
            f.sustitucion_uuid, f.estado, f.cancelada_en, f.actualizada_en,
            c.folio AS cobro_folio, u.nombre AS usuario
       FROM facturas_canceladas f
  LEFT JOIN cobros c   ON c.id = f.cobro_id
  LEFT JOIN usuarios u ON u.id = f.usuario_id
      WHERE f.escuela_id = ?
      ORDER BY f.id DESC LIMIT 200"
);
$stmt->execute([$escuela_id]);
$filas = array_map(function ($f) {
    $f['total'] = $f['total'] !== null ? floatval($f['total']) : null;
    return $f;
}, $stmt->fetchAll());
respond(['success' => true, 'cancelaciones' => $filas]);
