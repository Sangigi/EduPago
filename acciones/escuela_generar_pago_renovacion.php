<?php
// acciones/escuela_generar_pago_renovacion.php
//
// Genera el cobro de la RENOVACIÓN mensual de un colegio ya activo (a
// diferencia de invitacion_generar_pago.php, que es solo para la primera
// mensualidad durante el registro). Antes renovar era 100% manual —
// renovar_suscripcion.php solo movía la fecha de vencimiento sin que hubiera
// ningún cobro real de por medio.
//
// Reutiliza la misma cuenta de pago que ya cobra a cualquier colegio del
// sistema (PLE_SCHOOL_ID_ACTIVO) y el mismo webhook (webhook_liga.php), que
// ahora también reconoce este tercer tipo de referencia.
//
// Puede llamarlo el superadmin (para cualquier escuela) o el admin de esa
// misma escuela (para la suya) — hoy solo hay un botón para esto en el panel
// del superadmin (Suscripciones.js), pero el backend ya acepta ambos roles
// para cuando exista una vista de autoservicio del lado del colegio.

requerir_rol($usuario_actual['rol'] ?? '', ['superadmin', 'admin'], 'No tienes permiso para generar este pago.');

$escuela_id = intval($input['escuela_id'] ?? 0);
$metodo     = trim($input['metodo'] ?? '');
if (!$escuela_id) respond(['success' => false, 'error' => 'escuela_id requerido']);
if (!in_array($metodo, ['TC', 'Efectivo'], true)) {
    respond(['success' => false, 'error' => 'Método de pago no soportado.']);
}
requerir_escuela_propia($usuario_actual['rol'] ?? '', $escuela_id, $usuario_actual,
    'No puedes generar pagos de renovación para otra escuela.');

$stmt = $pdo->prepare("SELECT id, nombre, plan, fecha_vencimiento_plan FROM escuelas WHERE id = ? AND es_plantel = 0");
$stmt->execute([$escuela_id]);
$esc = $stmt->fetch();
if (!$esc) respond(['success' => false, 'error' => 'Colegio no encontrado']);

$total = floatval(PLANES_LIMITES[$esc['plan']]['precio'] ?? PLANES_LIMITES[PLAN_FALLBACK]['precio']);
if ($total < 50 || $total > 15000) {
    respond(['success' => false, 'error' => 'El monto de este plan no se puede cobrar con este método. Contacta a soporte.']);
}

$folio = 'RENOV-' . $esc['id'] . '-' . date('Ym');
// El "cliente_id" para la referencia es el id de la escuela, con un
// desplazamiento grande para que nunca coincida por casualidad con el id de
// una invitación o un alumno real (los tres comparten el mismo formato de
// referencia de 15 dígitos, pero cada uno consulta su propia tabla).
$refBase = 500000 + intval($esc['id']);

if ($metodo === 'TC') {
    $ref = construir_referencia_pago_generico($pdo, $refBase);
    $id_pago = str_pad(strval($esc['id']), 9, '0', STR_PAD_LEFT);

    $pdo->prepare(
        "UPDATE escuelas SET pago_renovacion_referencia = ?, pago_renovacion_folio = ?, pago_renovacion_monto = ?
          WHERE id = ?"
    )->execute([$ref, $folio, $total, $esc['id']]);

    $payload = [
        'User'           => PLE_USER,
        'Password'       => PLE_PASS,
        'IntegrationID'  => intval(PLE_INT_ID_ACTIVO),
        'SchoolID'       => PLE_SCHOOL_ID_ACTIVO,
        'BusinessID'     => PLE_SCHOOL_ID_ACTIVO,
        'PaymentTypes'   => PLE_PAYMENT_TYPES,
        'Id'             => $id_pago,
        'Description'    => substr('Renovación ' . $esc['nombre'], 0, 50),
        'Amount'         => intval(round($total * 100)),
        'Reference'      => $ref,
        'ExpirationDate' => date('Y-m-d', strtotime('+3 day')),
    ];
    log_api("escuela_generar_pago_renovacion(TC) -> escuela={$esc['id']} total={$total} ref={$ref}");

    $res = curl_post(PLE_URL_LIGA_TOKEN, $payload);
    if ($res['error']) respond(['success' => false, 'error' => 'Error de red: ' . $res['error']]);
    $raw = json_decode($res['body'], true) ?? [];
    $data_resp = [];
    foreach ($raw as $k => $v) { $data_resp[trim($k)] = $v; }
    $url_pago = $data_resp['url'] ?? $data_resp['Url'] ?? $data_resp['URL'] ?? null;

    if (($data_resp['code'] ?? null) !== 'success' || !$url_pago) {
        $payload_log = $payload; $payload_log['Password'] = '***';
        log_api("escuela_generar_pago_renovacion(TC) FALLÓ -> " . json_encode($data_resp, JSON_UNESCAPED_UNICODE)
                . " | payload: " . json_encode($payload_log, JSON_UNESCAPED_UNICODE));
        respond(['success' => false, 'error' => $data_resp['message'] ?? ($data_resp['Message'] ?? 'Sin URL de pago')]);
    }

    respond(['success' => true, 'url' => $url_pago, 'referencia' => $ref, 'monto' => $total]);
}

// Efectivo
$ref = construir_referencia_pago_generico($pdo, $refBase);
$pdo->prepare(
    "UPDATE escuelas SET pago_renovacion_referencia = ?, pago_renovacion_folio = ?, pago_renovacion_monto = ?
      WHERE id = ?"
)->execute([$ref, $folio, $total, $esc['id']]);

$payload = [
    'User'           => PLE_USER,
    'Password'       => PLE_PASS,
    'IntegrationID'  => intval(PLE_INT_ID_ACTIVO),
    'SchoolID'       => PLE_SCHOOL_ID_ACTIVO,
    'BusinessID'     => PLE_SCHOOL_ID_ACTIVO,
    'Id'             => str_pad(strval($esc['id']), 9, '0', STR_PAD_LEFT),
    'Description'    => substr('Renovación ' . $esc['nombre'], 0, 50),
    'Amount'         => intval(round($total * 100)),
    'Reference'      => $ref,
    'ExpirationDate' => date('Y-m-d', strtotime('+3 day')),
];
log_api("escuela_generar_pago_renovacion(Efectivo) -> escuela={$esc['id']} total={$total} ref={$ref}");

$res = curl_post(PLE_URL_REFERENCIA, $payload);
if ($res['error']) respond(['success' => false, 'error' => 'Error de red: ' . $res['error']]);
$raw = json_decode($res['body'], true) ?? [];

if (empty($raw['Reference']) && empty($raw['BarCode']) && empty($raw['PayFormat'])) {
    log_api("escuela_generar_pago_renovacion(Efectivo) FALLÓ -> " . json_encode($raw, JSON_UNESCAPED_UNICODE));
    respond(['success' => false, 'error' => $raw['Message'] ?? 'No se pudo generar la referencia de pago']);
}

respond([
    'success'     => true,
    'folio'       => $folio,
    'referencia'  => $ref,
    'barcode_url' => $raw['BarCode'] ?? $raw['PayFormat'] ?? null,
    'vencimiento' => date('Y-m-d', strtotime('+3 day')),
    'monto'       => $total,
]);
