<?php
// acciones/cancelar_cfdi.php  [OF-2]
//
// Cancela la factura (CFDI) de un cobro ante el SAT, vía Facturapi.
//
//   entrada: { cobro_id, motivo: '01'|'02'|'03'|'04', uuid_sustitucion? }
//   roles:   superadmin y admin de la escuela del cobro.
//
// CANCELAR LA FACTURA NO CANCELA EL COBRO NI MUEVE DINERO: el cobro conserva
// su total, su estado y sus abonos; solo queda sin factura vigente para poder
// volver a facturarlo. Todo se registra en facturas_canceladas.
//
// El SAT puede pedir que el RECEPTOR acepte la cancelación: entonces
// Facturapi responde "pendiente" y la factura sigue vigente hasta que el
// receptor acepte o rechace (o venza el plazo). Ese estado se guarda y se
// muestra; acciones/cancelar_cfdi_actualizar.php lo vuelve a consultar.

require_once __DIR__ . '/../lib/helpers_cancelacion.php';

$rol_canc = $usuario_actual['rol'] ?? '';
requerir_rol($rol_canc, ['superadmin', 'admin'], 'Solo el administrador del colegio puede cancelar facturas.');

$cobro_id = intval($input['cobro_id'] ?? 0);
$motivo   = trim((string) ($input['motivo'] ?? ''));
$sustit   = strtolower(trim((string) ($input['uuid_sustitucion'] ?? '')));
if (!$cobro_id) respond(['success' => false, 'error' => 'cobro_id requerido']);
if (!in_array($motivo, CFDI_MOTIVOS_CANCELACION, true)) {
    respond(['success' => false, 'error' => 'Motivo inválido: usa 01, 02, 03 o 04.']);
}
// Facturapi exige la factura sustituta con los motivos 01 y 04.
if (in_array($motivo, CFDI_MOTIVOS_CON_SUSTITUCION, true)) {
    if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $sustit)) {
        respond(['success' => false, 'error' => 'Con el motivo ' . $motivo . ' hay que indicar el folio fiscal (UUID) de la factura que sustituye a esta.']);
    }
} else {
    $sustit = ''; // 02 y 03 no llevan sustitución
}

$stmt = $pdo->prepare(
    "SELECT id, escuela_id, folio, total, factura, facturapi_id, factura_uuid, factura_serie,
            factura_folio, factura_rfc_receptor
       FROM cobros WHERE id = ?"
);
$stmt->execute([$cobro_id]);
$co = $stmt->fetch();
if (!$co) respond(['success' => false, 'error' => 'Cobro no encontrado.']);
// La escuela sale de la FILA del cobro, nunca del input.
requerir_escuela_propia($rol_canc, $co['escuela_id'], $usuario_actual, 'No tienes permiso para cancelar facturas de otra escuela.');
requerir_seccion_habilitada($pdo, $rol_canc, $co['escuela_id'], ['facturacion']);

if (!cancelacion_migracion_lista($pdo)) {
    respond(['success' => false, 'error' => 'Para cancelar facturas falta correr la migración migracion_2026_11_19_of2_impuestos.sql.']);
}
if (empty($co['factura']) || empty($co['facturapi_id']) || empty($co['factura_uuid'])) {
    respond(['success' => false, 'error' => 'Este cobro no tiene una factura vigente que cancelar.']);
}
$estadoActual = $pdo->prepare("SELECT factura_cancelacion_estado FROM cobros WHERE id = ?");
$estadoActual->execute([$cobro_id]);
if ($estadoActual->fetchColumn() === 'pendiente') {
    respond(['success' => false, 'error' => 'Ya hay una cancelación pendiente de aceptación del receptor para esta factura. Usa "Actualizar estado".']);
}
if ($sustit !== '' && $sustit === strtolower((string) $co['factura_uuid'])) {
    respond(['success' => false, 'error' => 'La factura sustituta no puede ser la misma que se está cancelando.']);
}

// Si algún abono ya tiene su complemento de pago (CFDI de pago) ligado a esta
// factura, el SAT no deja cancelar la factura mientras esos pagos sigan
// vigentes: primero habría que cancelar cada complemento. Ese paso no existe
// todavía en el sistema, así que se avisa en vez de pegarle al PAC para que
// rechace.
try {
    $stmtC = $pdo->prepare("SELECT COUNT(*) FROM cobro_abonos WHERE cobro_id = ? AND cfdi_complemento_uuid IS NOT NULL AND cfdi_complemento_uuid <> ''");
    $stmtC->execute([$cobro_id]);
    if (intval($stmtC->fetchColumn()) > 0) {
        respond(['success' => false, 'error' => 'Esta factura ya tiene complementos de pago emitidos. Primero hay que cancelar esos complementos (desde el panel de Facturapi), y después la factura.']);
    }
} catch (\PDOException $e) {
    // Sin columnas cfdi_complemento_*: no hay complementos que revisar.
}

// Un candado por cobro: dos clics seguidos no mandan dos solicitudes al SAT.
$pdo->prepare("SELECT GET_LOCK(?, 10)")->execute(["cancelar_cfdi_{$cobro_id}"]);

$query = 'motive=' . $motivo . ($sustit !== '' ? '&substitution=' . rawurlencode($sustit) : '');
$res = facturapi_request('invoices/' . rawurlencode($co['facturapi_id']) . '?' . $query, 'DELETE');
if ($res['error']) {
    log_api("cancelar_cfdi: error cURL Facturapi cobro:{$cobro_id} -> " . $res['error']);
    respond(['success' => false, 'error' => 'Error de red al contactar al PAC. Intenta de nuevo; si el problema sigue, revisa el estado de la factura antes de reintentar.']);
}
$inv = json_decode($res['body'], true);
if ($res['http_code'] < 200 || $res['http_code'] >= 300 || !is_array($inv)) {
    $detalle = is_array($inv) ? ($inv['message'] ?? 'respuesta inesperada del PAC') : 'respuesta inesperada del PAC';
    log_api("cancelar_cfdi: el PAC rechazó cobro:{$cobro_id} motivo:{$motivo} (HTTP {$res['http_code']}) -> " . $res['body']);
    respond(['success' => false, 'error' => 'El PAC no pudo cancelar la factura: ' . $detalle]);
}

$estado = cancelacion_estado_pac($inv);
if ($estado === 'valid') {
    // El PAC aceptó la solicitud pero aún no marca nada: se trata como pendiente
    // y se consulta después, en vez de dar por cancelada una factura vigente.
    log_api("cancelar_cfdi: respuesta sin estado de cancelación, se toma como pendiente cobro:{$cobro_id} -> " . $res['body']);
    $estado = 'pending';
}

$serieFolio = trim(($co['factura_serie'] ?? '') . ($co['factura_folio'] ?? ''));
try {
    $pdo->beginTransaction();
    $pdo->prepare(
        "INSERT INTO facturas_canceladas
            (escuela_id, cobro_id, facturapi_id, uuid, serie_folio, total, rfc_receptor, motivo, sustitucion_uuid, estado, respuesta_pac, usuario_id, cancelada_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, NOW())"
    )->execute([
        $co['escuela_id'], $cobro_id, $co['facturapi_id'], $co['factura_uuid'], $serieFolio ?: null,
        $co['total'], $co['factura_rfc_receptor'], $motivo, $sustit !== '' ? $sustit : null,
        $res['body'], $usuario_actual['user_id'] ?? null,
    ]);
    $histId = intval($pdo->lastInsertId());
    cancelacion_aplicar_estado($pdo, $histId, $cobro_id, $estado, null);
    $pdo->commit();
} catch (\Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    // El PAC YA procesó la solicitud: que quede en el log con todo para reconciliar.
    log_api("cancelar_cfdi: ¡el PAC aceptó pero NO se guardó en la base! cobro:{$cobro_id} uuid:{$co['factura_uuid']} estado:{$estado} -> " . $e->getMessage());
    respond(['success' => false, 'error' => 'La solicitud llegó al PAC pero no se pudo guardar en el sistema. Avisa a soporte con el folio fiscal ' . $co['factura_uuid'] . '.']);
}

// [OF-7c] Bitácora de auditoría (después del commit; nunca tumba la cancelación).
auditar($pdo, $usuario_actual, 'cfdi.cancelar', 'cfdi', $cobro_id,
    ['estado_cancelacion' => null, 'motivo' => null, 'uuid_sustitucion' => null],
    ['estado_cancelacion' => $estado, 'motivo' => $motivo, 'uuid_sustitucion' => $sustit !== '' ? $sustit : null],
    $co['escuela_id']);
registrar_log($pdo, $usuario_actual, 'cfdi_cancelacion',
    "Cobro {$co['folio']} (#{$cobro_id}): cancelación de factura {$co['factura_uuid']} motivo {$motivo}" . ($sustit !== '' ? " sustituta {$sustit}" : '') . " -> {$estado}",
    $co['escuela_id']);

respond([
    'success' => true,
    'estado'  => $estado, // 'canceled' | 'pending'
    'cobro_id' => $cobro_id,
    'uuid'    => $co['factura_uuid'],
    'mensaje' => $estado === 'canceled'
        ? 'Factura cancelada. El cobro quedó listo para facturarse de nuevo; el dinero no se movió.'
        : 'Solicitud enviada. El receptor debe aceptar la cancelación; la factura sigue vigente hasta entonces. Usa "Actualizar estado" para revisarla.',
]);
