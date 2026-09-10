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
//
// Idempotencia (10-sep-2026): antes, cada vez que se abría esta pantalla se
// llamaba de nuevo a GenerarReferenciaIndi y se le pedía al proveedor una
// referencia/código de barras NUEVO, aunque ya hubiera uno vigente sin
// pagar. El ticket viejo seguía siendo válido en tienda, así que el padre o
// el colegio podían terminar con dos referencias distintas para el mismo
// cobro y pagar la que ya no piensan usar. Si ya existe una referencia de
// este MISMO folio (mismo mes) que todavía no venció y no fue liquidada
// (el webhook la pone en NULL al confirmar el pago, ver pago_referencia.php),
// se regresa esa misma sin volver a llamar al proveedor.
$stmtVig = $pdo->prepare(
    "SELECT pago_renovacion_referencia, pago_renovacion_barcode_url, pago_renovacion_payformat_url, pago_renovacion_vencimiento
       FROM escuelas
      WHERE id = ? AND pago_renovacion_folio = ? AND pago_renovacion_referencia IS NOT NULL
        AND pago_renovacion_vencimiento >= CURDATE()"
);
$stmtVig->execute([$esc['id'], $folio]);
$vigente = $stmtVig->fetch();
if ($vigente) {
    log_api("escuela_generar_pago_renovacion(Efectivo) -> escuela={$esc['id']} folio={$folio} reutilizando referencia vigente {$vigente['pago_renovacion_referencia']}");
    respond([
        'success'     => true,
        'folio'       => $folio,
        'referencia'  => $vigente['pago_renovacion_referencia'],
        'barcode_url' => $vigente['pago_renovacion_barcode_url'] ?? $vigente['pago_renovacion_payformat_url'] ?? null,
        'vencimiento' => $vigente['pago_renovacion_vencimiento'],
        'monto'       => $total,
        'reutilizada' => true,
    ]);
}

$ref = construir_referencia_pago_generico($pdo, $refBase);
$pdo->prepare(
    "UPDATE escuelas SET pago_renovacion_referencia = ?, pago_renovacion_folio = ?, pago_renovacion_monto = ?
      WHERE id = ?"
)->execute([$ref, $folio, $total, $esc['id']]);

// Efectivo — mismo payload probado en generar_referencia_efectivo.php:
// GenerarReferenciaIndi no lleva 'Id' (eso es del servicio de Tarjeta,
// GenerarLigaDomiciliacionIndi) y sí espera CustomerEmail/CustomerName.
// Mandar el payload con la forma de Tarjeta es lo que el proveedor
// rechazaba con {"Message":"Error."}.
//
// IntegrationID SIN intval (10-sep-2026): a diferencia del servicio de Liga
// (GenerarLigaDomiciliacionIndi, arriba), que sí acepta IntegrationID como
// número, el servicio de Referencias (GenerarReferenciaIndi) lo rechaza con
// el genérico {"Message":"Error."} cuando se manda como entero — la única
// llamada de este endpoint que sí funciona (generar_referencia_efectivo.php)
// lo manda como texto ('106', no 106). Mismo bug que en
// iniciar_pago_agrupado.php.
$payload = [
    'User'           => PLE_USER,
    'Password'       => PLE_PASS,
    'IntegrationID'  => PLE_INT_ID_ACTIVO,
    'SchoolID'       => PLE_SCHOOL_ID_ACTIVO,
    'BusinessID'     => PLE_SCHOOL_ID_ACTIVO,
    'Description'    => substr('Renovación ' . $esc['nombre'], 0, 50),
    'Amount'         => intval(round($total * 100)),
    'Reference'      => $ref,
    'CustomerEmail'  => '',
    'CustomerName'   => '',
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

// IMPORTANTE (mismo bug que ya se corrigió en generar_referencia_efectivo.php):
// $ref es solo la referencia interna que "quema" el intento antes de llamar
// al proveedor. La que el cliente va a presentar en tienda — y la que
// consulta_referencia.php/pago_referencia.php usan para encontrar este pago
// cuando llegue el webhook — es la Reference ENVUELTA que regresa el
// proveedor ($raw['Reference']). Antes se guardaba y regresaba $ref interno,
// así que el webhook nunca podía conciliar un pago de renovación aunque el
// padre/colegio sí lo hiciera en tienda.
$referencia_cct = $raw['Reference'];
$vencimiento     = date('Y-m-d', strtotime('+3 day'));
$pdo->prepare(
    "UPDATE escuelas SET pago_renovacion_referencia = ?, pago_renovacion_barcode_url = ?, pago_renovacion_payformat_url = ?, pago_renovacion_vencimiento = ?
      WHERE id = ?"
)->execute([$referencia_cct, $raw['BarCode'] ?? null, $raw['PayFormat'] ?? null, $vencimiento, $esc['id']]);

respond([
    'success'     => true,
    'folio'       => $folio,
    'referencia'  => $referencia_cct,
    'barcode_url' => $raw['BarCode'] ?? $raw['PayFormat'] ?? null,
    'vencimiento' => $vencimiento,
    'monto'       => $total,
]);
