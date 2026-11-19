<?php
// acciones/cancelar_cfdi_actualizar.php  [OF-2]
//
// Consulta a Facturapi cómo va una cancelación que quedó "pendiente" de
// aceptación del receptor, y aplica el resultado:
//   aceptada  → la factura queda cancelada y el cobro listo para facturarse de nuevo
//   rechazada / vencida → la factura SIGUE vigente (el historial lo anota)
//   sigue pendiente → no cambia nada
//
//   entrada: { cobro_id }   roles: superadmin y admin de la escuela del cobro.

require_once __DIR__ . '/../lib/helpers_cancelacion.php';

$rol_act = $usuario_actual['rol'] ?? '';
requerir_rol($rol_act, ['superadmin', 'admin'], 'Solo el administrador del colegio puede revisar cancelaciones de facturas.');

$cobro_id = intval($input['cobro_id'] ?? 0);
if (!$cobro_id) respond(['success' => false, 'error' => 'cobro_id requerido']);
if (!cancelacion_migracion_lista($pdo)) {
    respond(['success' => false, 'error' => 'Falta correr la migración migracion_2026_11_19_of2_impuestos.sql.']);
}

$stmt = $pdo->prepare("SELECT id, escuela_id, folio, facturapi_id, factura_uuid, factura_cancelacion_estado FROM cobros WHERE id = ?");
$stmt->execute([$cobro_id]);
$co = $stmt->fetch();
if (!$co) respond(['success' => false, 'error' => 'Cobro no encontrado.']);
requerir_escuela_propia($rol_act, $co['escuela_id'], $usuario_actual, 'No tienes permiso sobre este cobro.');
requerir_seccion_habilitada($pdo, $rol_act, $co['escuela_id'], ['facturacion']);
if ($co['factura_cancelacion_estado'] !== 'pendiente' || empty($co['facturapi_id'])) {
    respond(['success' => false, 'error' => 'Este cobro no tiene una cancelación pendiente.']);
}

$stmtH = $pdo->prepare(
    "SELECT id FROM facturas_canceladas WHERE cobro_id = ? AND facturapi_id = ? AND estado = 'pending' ORDER BY id DESC LIMIT 1"
);
$stmtH->execute([$cobro_id, $co['facturapi_id']]);
$histId = intval($stmtH->fetchColumn());
if (!$histId) respond(['success' => false, 'error' => 'No se encontró la solicitud de cancelación en el historial.']);

$res = facturapi_request('invoices/' . rawurlencode($co['facturapi_id']));
if ($res['error']) {
    log_api("cancelar_cfdi_actualizar: error cURL cobro:{$cobro_id} -> " . $res['error']);
    respond(['success' => false, 'error' => 'Error de red al contactar al PAC.']);
}
$inv = json_decode($res['body'], true);
if ($res['http_code'] !== 200 || !is_array($inv)) {
    log_api("cancelar_cfdi_actualizar: respuesta inesperada cobro:{$cobro_id} HTTP {$res['http_code']} -> " . $res['body']);
    respond(['success' => false, 'error' => 'No se pudo consultar el estado en el PAC.']);
}
$estado = cancelacion_estado_pac($inv);
if ($estado === 'valid') $estado = 'pending'; // sin dato de cancelación: sigue en trámite

try {
    $pdo->beginTransaction();
    cancelacion_aplicar_estado($pdo, $histId, $cobro_id, $estado, $res['body']);
    $pdo->commit();
} catch (\Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    log_api("cancelar_cfdi_actualizar: no se guardó el estado {$estado} cobro:{$cobro_id} -> " . $e->getMessage());
    respond(['success' => false, 'error' => 'No se pudo guardar el nuevo estado.']);
}

if ($estado !== 'pending') {
    registrar_log($pdo, $usuario_actual, 'cfdi_cancelacion_estado',
        "Cobro {$co['folio']} (#{$cobro_id}): la cancelación de {$co['factura_uuid']} quedó en {$estado}", $co['escuela_id']);
}
$mensajes = [
    'canceled' => 'El receptor aceptó: la factura quedó cancelada y el cobro está listo para facturarse de nuevo.',
    'pending'  => 'Sigue pendiente de aceptación del receptor.',
    'rejected' => 'El receptor rechazó la cancelación: la factura sigue vigente.',
    'expired'  => 'La solicitud venció sin respuesta: la factura sigue vigente.',
];
respond(['success' => true, 'estado' => $estado, 'cobro_id' => $cobro_id, 'mensaje' => $mensajes[$estado] ?? '']);
