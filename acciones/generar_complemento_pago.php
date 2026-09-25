<?php
// acciones/generar_complemento_pago.php
//
// Emite el CFDI DE PAGO (tipo "P", complemento de recepción de pagos) de UN
// abono, ligado a la factura PPD del cobro.
//
// POR QUÉ HACE FALTA
//
// Cuando un cobro se paga en parcialidades, acciones/generar_cfdi.php emite la
// factura de ingreso como PPD con forma de pago "99 Por definir". Esa factura
// por sí sola NO acredita ningún pago: para el SAT queda pendiente. Hay que
// mandar un comprobante de pago POR CADA abono recibido, diciendo cuánto se
// cobró, con qué forma, y cuánto saldo quedaba antes y después.
//
// Sin esto, la factura PPD queda colgada y el cliente no puede deducir.
//
// ORDEN OBLIGATORIO: primero la factura PPD del cobro, después los
// complementos. Un complemento necesita el UUID de la factura a la que se
// liga, así que sin ella no hay nada que referenciar.

$rol = $usuario_actual['rol'] ?? '';
requerir_rol($rol, ['superadmin', 'admin', 'cajero'], 'No tienes permiso para emitir complementos de pago.');

$abono_id = intval($input['abono_id'] ?? 0);
if (!$abono_id) respond(['success' => false, 'error' => 'abono_id requerido']);

// Todo lo necesario en una consulta: el abono, su cobro, la factura PPD a la
// que se liga y los datos fiscales de quien paga.
$stmt = $pdo->prepare(
    "SELECT a.id, a.cobro_id, a.escuela_id, a.monto, a.metodo, a.referencia,
            a.auth_code, a.creado_en, a.cfdi_complemento_uuid,
            c.total AS cobro_total, c.folio AS cobro_folio,
            c.factura_uuid AS cobro_factura_uuid, c.cliente_id,
            cl.familia_id
       FROM cobro_abonos a
       JOIN cobros c   ON c.id = a.cobro_id
  LEFT JOIN clientes cl ON cl.id = c.cliente_id
      WHERE a.id = ?"
);
$stmt->execute([$abono_id]);
$ab = $stmt->fetch();
if (!$ab) respond(['success' => false, 'error' => 'Abono no encontrado']);

requerir_escuela_propia($rol, $ab['escuela_id'], $usuario_actual, 'No tienes permiso sobre este cobro.');

// Mismo candado que generar_cfdi.php: un negocio independiente cobra pero no
// factura, así que tampoco emite complementos.
$stmtTP = $pdo->prepare("SELECT tipo_persona FROM escuelas WHERE id = ?");
$stmtTP->execute([$ab['escuela_id']]);
if (!escuela_puede_facturar($stmtTP->fetchColumn())) {
    respond(['success' => false, 'error' => 'Este colegio está registrado como Negocio independiente y no puede emitir facturas.']);
}

if (!empty($ab['cfdi_complemento_uuid'])) {
    respond(['success' => false,
             'error' => 'Este abono ya tiene su complemento de pago (' . $ab['cfdi_complemento_uuid'] . ').']);
}
if (empty($ab['cobro_factura_uuid'])) {
    respond(['success' => false,
             'codigo' => 'sin_factura_ppd',
             'error'  => 'Primero hay que facturar el cobro. El complemento de pago se liga al folio fiscal de esa factura, así que sin ella no hay a qué referenciarlo.']);
}

// ── Saldos: cuánto se debía ANTES de este abono y cuánto queda DESPUÉS ────
//
// El SAT los pide explícitos. Se calculan sumando los abonos ANTERIORES a
// este (por id, que es el orden real de captura) en vez de leer
// cobros.monto_pagado: esa columna es un cache del estado ACTUAL, y si se
// emite el complemento de un abono viejo daría el saldo de hoy, no el de
// entonces. Mismo razonamiento que el ledger de cobro_abonos.
$stmtPrev = $pdo->prepare("SELECT COALESCE(SUM(monto), 0) FROM cobro_abonos WHERE cobro_id = ? AND id < ?");
$stmtPrev->execute([$ab['cobro_id'], $abono_id]);
$pagadoAntes = floatval($stmtPrev->fetchColumn());

$totalCobro  = floatval($ab['cobro_total']);
$montoAbono  = floatval($ab['monto']);
$saldoAntes  = round($totalCobro - $pagadoAntes, 2);
$saldoDespues = round($saldoAntes - $montoAbono, 2);
if ($saldoDespues < 0) $saldoDespues = 0.0; // sobrepago: el saldo no baja de cero

// Número de parcialidad: cuántos abonos hubo antes de este, más uno.
$stmtN = $pdo->prepare("SELECT COUNT(*) FROM cobro_abonos WHERE cobro_id = ? AND id <= ?");
$stmtN->execute([$ab['cobro_id'], $abono_id]);
$numParcialidad = max(1, intval($stmtN->fetchColumn()));

// Forma de pago del ABONO (no la del cobro): cada parcialidad pudo cobrarse
// por un medio distinto — el primer abono en efectivo y el segundo por SPEI.
// Misma tabla del catálogo c_FormaPago que usa generar_cfdi.php.
$metodoAb = strtoupper(trim($ab['metodo'] ?? ''));
$forma_pago_sat = '03'; // Transferencia electrónica
if ($metodoAb === 'EFECTIVO' || $metodoAb === 'EFECTIVOREF') {
    $forma_pago_sat = '01';
} elseif ($metodoAb === 'CHEQUE') {
    $forma_pago_sat = '02';
} elseif ($metodoAb === 'TC' || $metodoAb === 'TARJETA' || $metodoAb === 'CAI') {
    $forma_pago_sat = '04';
}

// Datos fiscales del receptor: los mismos que se guardaron al emitir la
// factura PPD (el CFDI de pago tiene que ir al mismo receptor).
// Nombres reales de las columnas: rfc_factura / razon_social_factura /
// cp_factura / regimen_factura. Son las que escribe generar_cfdi.php al
// timbrar, para prellenar la siguiente factura del mismo receptor. (NO son
// `rfc`/`razon_social`: esas viven en `escuelas` y son del colegio emisor,
// no del tutor que recibe la factura.)
$stmtFis = $pdo->prepare(
    "SELECT COALESCE(f.rfc_factura, cl.rfc_factura) AS rfc,
            COALESCE(f.razon_social_factura, cl.razon_social_factura) AS razon_social,
            COALESCE(f.regimen_factura, cl.regimen_factura) AS regimen_fiscal,
            COALESCE(f.cp_factura, cl.cp_factura) AS cp_fiscal,
            COALESCE(f.email, cl.email) AS email
       FROM clientes cl LEFT JOIN familias f ON f.id = cl.familia_id
      WHERE cl.id = ?"
);
$fis = $stmtFis->fetch() ?: [];
if (empty($fis['rfc'])) {
    respond(['success' => false,
             'error' => 'Falta el RFC del receptor. Captúralo antes de emitir el complemento.']);
}

// ── Payload de Facturapi (v2) ────────────────────────────────────────────
//
// Un CFDI de pago es type "P" y NO lleva `items`: el importe va dentro del
// complemento, no en conceptos. `related_documents` es lo que lo amarra a la
// factura PPD por su UUID.
//
// OJO AL PROBAR: la forma exacta de este payload hay que confirmarla contra
// el entorno de pruebas de Facturapi antes de usarlo con la llave real. Un
// campo mal nombrado aquí no se detecta hasta que el PAC rechaza el timbrado.
$payload = [
    'type'     => 'P',
    'customer' => [
        'legal_name' => $fis['razon_social'],
        'tax_id'     => $fis['rfc'],
        'tax_system' => $fis['regimen_fiscal'],
        'address'    => ['zip' => $fis['cp_fiscal']],
        'email'      => $fis['email'] ?: null,
    ],
    'complements' => [[
        'type' => 'pago',
        'data' => [[
            'payment_form' => $forma_pago_sat,
            'date'         => date('c', strtotime($ab['creado_en'] ?: 'now')),
            'related_documents' => [[
                'uuid'         => $ab['cobro_factura_uuid'],
                'amount'       => $montoAbono,
                'installment'  => $numParcialidad,
                'last_balance' => $saldoAntes,
                'taxes'        => [['type' => 'IVA', 'rate' => 0.16, 'withholding' => false]],
            ]],
        ]],
    ]],
];

$res = facturapi_request('invoices', 'POST', $payload);
if ($res['error']) {
    log_api("complemento_pago: error cURL Facturapi abono #$abono_id -> " . $res['error']);
    respond(['success' => false, 'error' => 'Error de red al contactar al PAC.']);
}
$resp = json_decode($res['body'], true);
if ($res['http_code'] < 200 || $res['http_code'] >= 300 || empty($resp['id'])) {
    $detalle = $resp['message'] ?? ($resp['error'] ?? 'respuesta inesperada del PAC');
    log_api("complemento_pago: el PAC rechazó el abono #$abono_id (HTTP {$res['http_code']}) -> " . $res['body']);
    respond(['success' => false, 'error' => 'El PAC rechazó el complemento: ' . $detalle]);
}

$uuid = $resp['uuid'] ?? 'PENDIENTE';
$pdo->prepare(
    "UPDATE cobro_abonos SET cfdi_complemento_id = ?, cfdi_complemento_uuid = ?, cfdi_complemento_en = NOW() WHERE id = ?"
)->execute([$resp['id'], $uuid, $abono_id]);

registrar_log($pdo, $usuario_actual, 'complemento_pago_emitido',
    "Abono #$abono_id del cobro {$ab['cobro_folio']}: complemento de pago $uuid (parcialidad $numParcialidad, saldo $saldoDespues)",
    $ab['escuela_id']);

respond([
    'success'        => true,
    'uuid'           => $uuid,
    'parcialidad'    => $numParcialidad,
    'saldo_anterior' => $saldoAntes,
    'saldo_restante' => $saldoDespues,
]);
