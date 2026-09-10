<?php
// acciones/invitacion_generar_pago.php
//
// El colegio, durante el registro público (registro.html), elige un plan y
// paga la primera mensualidad ANTES de que el superadmin revise su solicitud
// — así la aprobación es sobre una intención de compra ya confirmada, no
// sobre un formulario sin ningún compromiso.
//
// Reutiliza EXACTAMENTE el mismo mecanismo de pago que ya cobra a cualquier
// colegio (generar_liga.php / generar_referencia_efectivo.php): la cuenta de
// destino ya existe y es la misma para todos los cobros del sistema
// (PLE_SCHOOL_ID_ACTIVO, ver config.php) — la suscripción no necesita una
// cuenta nueva.
//
// PÚBLICO (sin sesión): igual que invitacion_ver / invitacion_enviar, la
// única llave es el token de un solo uso que viaja en la liga de invitación.

$token = trim($input['token'] ?? '');
$metodo = trim($input['metodo'] ?? ''); // 'TC' | 'Efectivo'
$generico = ['success' => false, 'error' => 'Esta liga no es válida o ya venció.'];

if (strlen($token) !== 64 || !ctype_xdigit($token)) respond($generico);
if (!in_array($metodo, ['TC', 'Efectivo'], true)) {
    respond(['success' => false, 'error' => 'Método de pago no soportado.']);
}

$stmt = $pdo->prepare(
    "SELECT id, estado, expira, intentos, plan_elegido, monto_suscripcion
       FROM invitaciones_colegio WHERE token_hash = ? LIMIT 1"
);
$stmt->execute([hash('sha256', $token)]);
$inv = $stmt->fetch();

// Mismo criterio que invitacion_enviar.php: no revelar si el token existe.
if (!$inv || strtotime($inv['expira']) < time()) {
    if ($inv) {
        $pdo->prepare("UPDATE invitaciones_colegio SET intentos = intentos + 1 WHERE id = ?")
            ->execute([$inv['id']]);
    }
    respond($generico);
}
// 'enviado': ya llenó sus datos y eligió plan, y aún no ha pagado.
// Si ya está en 'pagado' o después, no se genera un segundo cobro.
if ($inv['estado'] !== 'enviado') {
    respond(['success' => false, 'error' => 'Esta invitación no está esperando un pago en este momento.']);
}
if (!$inv['plan_elegido'] || !$inv['monto_suscripcion']) {
    respond(['success' => false, 'error' => 'Falta elegir un plan antes de pagar.']);
}

$total = floatval($inv['monto_suscripcion']);
if ($total < 50 || $total > 15000) {
    // Los planes actuales (999 / 1500 / 3000) siempre caen dentro del rango
    // del proveedor; esto solo protege si algún día se agrega un plan fuera
    // de rango sin ajustar el cobro (anual, por ejemplo).
    respond(['success' => false, 'error' => 'El monto de este plan no se puede cobrar con este método. Contacta a soporte.']);
}

// Folio propio, distinto al de cobros normales (que llevan la clave de la
// escuela — esta invitación aún no tiene una). Único por invitación: no hay
// riesgo de choque con folios de cobros reales.
$folio = 'SUSC-' . $inv['id'];

if ($metodo === 'TC') {
    // Mismo formato de Id/Reference que generar_liga.php — confirmado por el
    // proveedor como el único válido (ver ese archivo para el historial de
    // por qué). El "cliente_id" aquí es el id de la invitación, no un alumno:
    // construir_referencia_pago() solo lo usa para formar el prefijo, nunca
    // consulta si existe en `clientes`.
    $ref = construir_referencia_pago_generico($pdo, $inv['id']);
    $id_pago = str_pad(strval($inv['id']), 9, '0', STR_PAD_LEFT);

    $pdo->prepare(
        "UPDATE invitaciones_colegio
            SET metodo_pago = 'TC', pago_referencia = ?, pago_folio = ?
          WHERE id = ?"
    )->execute([$ref, $folio, $inv['id']]);

    $payload = [
        'User'           => PLE_USER,
        'Password'       => PLE_PASS,
        'IntegrationID'  => intval(PLE_INT_ID_ACTIVO),
        'SchoolID'       => PLE_SCHOOL_ID_ACTIVO,
        'BusinessID'     => PLE_SCHOOL_ID_ACTIVO,
        'PaymentTypes'   => PLE_PAYMENT_TYPES,
        'Id'             => $id_pago,
        'Description'    => substr('Suscripción ' . ucfirst($inv['plan_elegido']), 0, 50),
        'Amount'         => intval(round($total * 100)),
        'Reference'      => $ref,
        'ExpirationDate' => date('Y-m-d', strtotime('+1 day')),
    ];
    log_api("invitacion_generar_pago(TC) -> invitacion={$inv['id']} plan={$inv['plan_elegido']} total={$total} ref={$ref}");

    $res = curl_post(PLE_URL_LIGA_TOKEN, $payload);
    if ($res['error']) respond(['success' => false, 'error' => 'Error de red: ' . $res['error']]);
    $raw = json_decode($res['body'], true) ?? [];
    $data_resp = [];
    foreach ($raw as $k => $v) { $data_resp[trim($k)] = $v; }
    $codigo_resp = $data_resp['code'] ?? null;
    $url_pago = $data_resp['url'] ?? $data_resp['Url'] ?? $data_resp['URL'] ?? null;

    if ($codigo_resp !== 'success' || !$url_pago) {
        $payload_log = $payload; $payload_log['Password'] = '***';
        log_api("invitacion_generar_pago(TC) FALLÓ -> " . json_encode($data_resp, JSON_UNESCAPED_UNICODE)
                . " | payload: " . json_encode($payload_log, JSON_UNESCAPED_UNICODE));
        respond(['success' => false, 'error' => $data_resp['message'] ?? ($data_resp['Message'] ?? 'Sin URL de pago')]);
    }

    respond(['success' => true, 'url' => $url_pago, 'referencia' => $ref]);
}

// Efectivo (OXXO / tiendas participantes) — mismo endpoint del proveedor que
// generar_referencia_efectivo.php, pero SIN la validación "WHERE folio IN
// cobros" porque este folio no vive en esa tabla: es de una invitación.
$ref = construir_referencia_pago_generico($pdo, $inv['id']);

$pdo->prepare(
    "UPDATE invitaciones_colegio
        SET metodo_pago = 'Efectivo', pago_referencia = ?, pago_folio = ?
      WHERE id = ?"
)->execute([$ref, $folio, $inv['id']]);

$payload = [
    'User'           => PLE_USER,
    'Password'       => PLE_PASS,
    'IntegrationID'  => intval(PLE_INT_ID_ACTIVO),
    'SchoolID'       => PLE_SCHOOL_ID_ACTIVO,
    'BusinessID'     => PLE_SCHOOL_ID_ACTIVO,
    'Id'             => str_pad(strval($inv['id']), 9, '0', STR_PAD_LEFT),
    'Description'    => substr('Suscripción ' . ucfirst($inv['plan_elegido']), 0, 50),
    'Amount'         => intval(round($total * 100)),
    'Reference'      => $ref,
    'ExpirationDate' => date('Y-m-d', strtotime('+3 day')),
];
log_api("invitacion_generar_pago(Efectivo) -> invitacion={$inv['id']} plan={$inv['plan_elegido']} total={$total} ref={$ref}");

$res = curl_post(PLE_URL_REFERENCIA, $payload);
if ($res['error']) respond(['success' => false, 'error' => 'Error de red: ' . $res['error']]);
$raw = json_decode($res['body'], true) ?? [];

if (empty($raw['Reference']) && empty($raw['BarCode']) && empty($raw['PayFormat'])) {
    log_api("invitacion_generar_pago(Efectivo) FALLÓ -> " . json_encode($raw, JSON_UNESCAPED_UNICODE));
    respond(['success' => false, 'error' => $raw['Message'] ?? 'No se pudo generar la referencia de pago']);
}

$vencimiento = date('Y-m-d', strtotime('+3 day'));
$pdo->prepare(
    "UPDATE invitaciones_colegio
        SET pago_barcode_url = ?, pago_vencimiento = ?
      WHERE id = ?"
)->execute([$raw['BarCode'] ?? $raw['PayFormat'] ?? null, $vencimiento, $inv['id']]);

respond([
    'success'      => true,
    'referencia'   => $ref,
    'barcode_url'  => $raw['BarCode'] ?? $raw['PayFormat'] ?? null,
    'vencimiento'  => $vencimiento,
]);
