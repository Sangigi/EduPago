<?php
// acciones/iniciar_pago_agrupado.php
//
// Antes, si un alumno tenía varios cobros pendientes por separado, Tarjeta
// y Efectivo solo podían pagar UNO a la vez (generar_liga.php y generar_
// referencia_efectivo.php exigen un folio de un solo cobro real). SPEI sí
// podía cubrir todo junto porque usa la CLABE agregada del alumno, pero los
// otros dos métodos obligaban a pagar cobro por cobro.
//
// Este endpoint agrupa varios cobros pendientes del MISMO alumno en un solo
// pago: crea una fila en cobros_agrupados con el total sumado, liga cada
// cobro individual en cobros_agrupados_detalle (para el desglose), y genera
// la liga/referencia real con el proveedor. Al confirmarse el pago
// (webhook_liga.php), TODOS los cobros originales pasan a 'pagado' juntos.

$cliente_id = intval($input['cliente_id'] ?? 0);
$cobro_ids  = $input['cobro_ids'] ?? [];
$metodo     = trim($input['metodo'] ?? '');

// Log de entrada (10-sep-2026): todos los log_api() de este archivo estaban
// DESPUÉS de las validaciones/guards (requerir_escuela_propia, requerir_
// familia_propia, requerir_metodo_pago_habilitado, el INSERT a
// cobros_agrupados). Si CUALQUIERA de esos puntos rechazaba la petición o
// tronaba, el usuario veía un error en pantalla pero el log se quedaba
// completamente vacío -- imposible saber dónde se cortó. Esta línea es lo
// primero que corre, antes de cualquier validación, para garantizar que
// SIEMPRE quede un rastro aunque todo lo demás falle.
log_api("iniciar_pago_agrupado LLAMADA -> cliente_id={$cliente_id} cobro_ids=" . implode(',', array_map('intval', (array) $cobro_ids)) . " metodo={$metodo} rol=" . ($usuario_actual['rol'] ?? '?'));

if (!$cliente_id || !is_array($cobro_ids) || count($cobro_ids) < 1) {
    respond(['success' => false, 'error' => 'cliente_id y al menos un cobro_id son requeridos']);
}
if (!in_array($metodo, ['TC', 'EfectivoRef'], true)) {
    respond(['success' => false, 'error' => 'Método no soportado para pago agrupado.']);
}
$cobro_ids = array_values(array_unique(array_map('intval', $cobro_ids)));

// Se relee cada cobro desde la BD -- nunca se confía en el total que venga
// del navegador (mismo criterio que ya usan generar_liga.php y crear_cobro.php).
$in = implode(',', array_fill(0, count($cobro_ids), '?'));
$stmt = $pdo->prepare(
    "SELECT id, cliente_id, escuela_id, total, folio FROM cobros
      WHERE id IN ($in) AND estado = 'pendiente'"
);
$stmt->execute($cobro_ids);
$cobros = $stmt->fetchAll();

if (count($cobros) !== count($cobro_ids)) {
    log_api("iniciar_pago_agrupado RECHAZADO -> cobros ya no pendientes. pedidos=" . implode(',', $cobro_ids) . " encontrados=" . implode(',', array_column($cobros, 'id')));
    respond(['success' => false, 'error' => 'Uno o más cobros ya no están pendientes. Recarga e intenta de nuevo.']);
}
// Todos deben ser del mismo alumno y la misma escuela -- agrupar cobros de
// dos alumnos distintos en un solo cargo mezclaría a quién se le cobra qué.
foreach ($cobros as $c) {
    if (intval($c['cliente_id']) !== $cliente_id) {
        log_api("iniciar_pago_agrupado RECHAZADO -> cobro {$c['id']} es del cliente {$c['cliente_id']}, no de {$cliente_id}");
        respond(['success' => false, 'error' => 'Todos los cobros del grupo deben ser del mismo alumno.']);
    }
}
$escuela_id = intval($cobros[0]['escuela_id']);

$rolAgrup = $usuario_actual['rol'] ?? '';
requerir_escuela_propia($rolAgrup, $escuela_id, $usuario_actual, 'No tienes permiso sobre estos cobros.');
requerir_seccion_habilitada($pdo, $rolAgrup, $escuela_id, ['caja']);
if ($rolAgrup === 'familia') {
    $stmtFam = $pdo->prepare("SELECT familia_id FROM clientes WHERE id = ?");
    $stmtFam->execute([$cliente_id]);
    $fam = $stmtFam->fetch();
    requerir_familia_propia($fam ? $fam['familia_id'] : null, $usuario_actual, 'No tienes permiso sobre estos cobros.');
}
requerir_metodo_pago_habilitado($pdo, $escuela_id, $metodo, $metodo === 'TC' ? 'Tarjeta' : 'Efectivo (tienda)');

// Modo demo (11-sep-2026): cortar ANTES de crear el registro de
// cobros_agrupados o de llamar al proveedor.
responder_demo_si_aplica($pdo, $escuela_id);

// Idempotencia para Efectivo (10-sep-2026): si ya existe un cobro agrupado
// 'pendiente' con exactamente el mismo conjunto de cobro_ids (mismo alumno),
// se reutiliza su referencia/código de barras en vez de crear otro registro
// y pedirle uno nuevo al proveedor cada vez que se abre la pantalla de pago.
// Para Tarjeta no aplica: la liga de pago es de un solo uso y el propio
// proveedor la vence rápido, así que no hay "documento" que reutilizar.
if ($metodo === 'EfectivoRef') {
    sort($cobro_ids);
    $stmtVig = $pdo->prepare(
        "SELECT ca.id, ca.folio, ca.referencia, ca.barcode_url, ca.payformat_url, ca.vencimiento, ca.total
           FROM cobros_agrupados ca
          WHERE ca.cliente_id = ? AND ca.metodo = 'EfectivoRef' AND ca.estado = 'pendiente'
            AND ca.referencia IS NOT NULL AND ca.vencimiento >= CURDATE()"
    );
    $stmtVig->execute([$cliente_id]);
    foreach ($stmtVig->fetchAll() as $cand) {
        $stmtDet = $pdo->prepare("SELECT cobro_id FROM cobros_agrupados_detalle WHERE cobro_agrupado_id = ?");
        $stmtDet->execute([$cand['id']]);
        $detIds = array_map('intval', array_column($stmtDet->fetchAll(), 'cobro_id'));
        sort($detIds);
        if ($detIds === $cobro_ids) {
            log_api("iniciar_pago_agrupado(Efectivo) -> cliente={$cliente_id} reutilizando agrupado #{$cand['id']} referencia {$cand['referencia']}");
            respond([
                'success'     => true,
                'referencia'  => $cand['referencia'],
                'folio'       => $cand['folio'],
                'barcode_url' => $cand['barcode_url'] ?? $cand['payformat_url'] ?? null,
                'vencimiento' => $cand['vencimiento'],
                'total'       => floatval($cand['total']),
                'conceptos'   => count($cobro_ids),
                'reutilizada' => true,
            ]);
        }
    }
}

$total = array_sum(array_map(fn($c) => floatval($c['total']), $cobros));
if ($total < 50) respond(['success' => false, 'error' => 'Monto mínimo $50.00 (mínimo de Cobroscontarjeta.com)']);
if ($total > 15000) {
    respond(['success' => false, 'error' => 'La suma de estos conceptos supera $15,000.00 (máximo de Cobroscontarjeta.com). Paga alguno por separado desde Historial.']);
}

$folio = 'GRUPO-' . $cliente_id . '-' . time();
$pdo->beginTransaction();
try {
    $pdo->prepare(
        "INSERT INTO cobros_agrupados (escuela_id, cliente_id, folio, total, metodo, estado)
         VALUES (?, ?, ?, ?, ?, 'pendiente')"
    )->execute([$escuela_id, $cliente_id, $folio, $total, $metodo]);
    $agrupado_id = intval($pdo->lastInsertId());

    $stmtDet = $pdo->prepare(
        "INSERT INTO cobros_agrupados_detalle (cobro_agrupado_id, cobro_id, total) VALUES (?, ?, ?)"
    );
    foreach ($cobros as $c) {
        $stmtDet->execute([$agrupado_id, intval($c['id']), floatval($c['total'])]);
    }
    $pdo->commit();
} catch (\Throwable $e) {
    $pdo->rollBack();
    log_api("iniciar_pago_agrupado FALLÓ AL INSERTAR -> " . $e->getMessage());
    // Duplicate entry por cobro_id (10-sep-2026): en producción,
    // cobros_agrupados_detalle tiene un índice ÚNICO sobre cobro_id
    // (idx_cobro, ver migracion_2026_09_10_fix_idx_cobro_detalle.sql) que NO
    // debería existir -- un cobro puede quedar "quemado" para siempre por un
    // intento de grupo viejo que nunca se pagó (referencia vencida, liga de
    // tarjeta nunca completada), bloqueando cualquier intento nuevo aunque
    // el cobro siga pendiente. No se intenta arreglar solo (borrar/cancelar
    // el grupo viejo aquí podría romper la conciliación si ese grupo viejo
    // sí llega a pagarse después -- webhook_liga.php lo busca por
    // `referencia`, no por estado). El arreglo real es correr la migración
    // que vuelve ese índice NO único.
    if ($e instanceof \PDOException && $e->getCode() === '23000') {
        respond(['success' => false, 'error' => 'Uno de estos conceptos ya fue parte de otro intento de pago agrupado. Contacta a soporte para liberarlo (falta correr una migración de base de datos).']);
    }
    respond(['success' => false, 'error' => 'No se pudo preparar el pago agrupado.']);
}

// El "cliente_id" para construir_referencia_pago() usa un desplazamiento
// distinto al de cobros normales y al de renovaciones de escuela, para que
// las tres referencias nunca puedan coincidir por casualidad.
$refBase = 700000 + $agrupado_id;
$ref     = construir_referencia_pago_generico($pdo, $refBase);
$pdo->prepare("UPDATE cobros_agrupados SET referencia = ? WHERE id = ?")->execute([$ref, $agrupado_id]);

$descripcion = 'Pago agrupado (' . count($cobros) . ' conceptos)';

if ($metodo === 'TC') {
    $id_pago = str_pad(strval($cliente_id), 9, '0', STR_PAD_LEFT);
    $payload = [
        'User'           => PLE_USER,
        'Password'       => PLE_PASS,
        'IntegrationID'  => intval(PLE_INT_ID_ACTIVO),
        'SchoolID'       => PLE_SCHOOL_ID_ACTIVO,
        'BusinessID'     => PLE_SCHOOL_ID_ACTIVO,
        'PaymentTypes'   => PLE_PAYMENT_TYPES,
        'Id'             => $id_pago,
        'Description'    => substr($descripcion, 0, 50),
        'Amount'         => intval(round($total * 100)),
        'Reference'      => $ref,
        'ExpirationDate' => date('Y-m-d', strtotime('+1 day')),
    ];
    log_api("iniciar_pago_agrupado(TC) -> agrupado_id={$agrupado_id} cliente={$cliente_id} cobros=" . implode(',', $cobro_ids) . " total={$total} ref={$ref}");

    $res = curl_post(PLE_URL_LIGA_TOKEN, $payload);
    if ($res['error']) {
        log_api("iniciar_pago_agrupado(TC) ERROR DE RED -> " . $res['error']);
        respond(['success' => false, 'error' => 'Error de red: ' . $res['error']]);
    }
    $raw = json_decode($res['body'], true) ?? [];
    $data_resp = [];
    foreach ($raw as $k => $v) { $data_resp[trim($k)] = $v; }
    $url_pago = $data_resp['url'] ?? $data_resp['Url'] ?? $data_resp['URL'] ?? null;

    if (($data_resp['code'] ?? null) !== 'success' || !$url_pago) {
        $payload_log = $payload; $payload_log['Password'] = '***';
        log_api("iniciar_pago_agrupado(TC) FALLÓ -> " . json_encode($data_resp, JSON_UNESCAPED_UNICODE) . " | payload: " . json_encode($payload_log, JSON_UNESCAPED_UNICODE));
        respond(['success' => false, 'error' => $data_resp['message'] ?? ($data_resp['Message'] ?? 'Sin URL de pago')]);
    }

    respond([
        'success' => true, 'url' => $url_pago, 'referencia' => $ref, 'folio' => $folio,
        'total' => $total, 'conceptos' => count($cobros),
    ]);
}

// EfectivoRef — el payload de este servicio (GenerarReferenciaIndi) NO es
// igual al de Tarjeta (GenerarLigaDomiciliacionIndi): no lleva 'Id', y sí
// espera 'CustomerEmail'/'CustomerName' (vacíos si no se capturan). Antes
// este payload copiaba la forma del de Tarjeta de arriba, lo que el
// proveedor rechazaba con un genérico {"Message":"Error."} — mismo payload
// ya usado (y probado) en generar_referencia_efectivo.php.
//
// IntegrationID SIN intval (10-sep-2026): a diferencia de Liga, que sí
// acepta IntegrationID como número, GenerarReferenciaIndi lo rechaza con el
// mismo {"Message":"Error."} genérico cuando se manda como entero — la
// llamada que sí funciona (generar_referencia_efectivo.php) lo manda como
// texto ('106', no 106). Esto era la causa real de que el pago agrupado en
// efectivo nunca funcionara.
$payload = [
    'User'           => PLE_USER,
    'Password'       => PLE_PASS,
    'IntegrationID'  => PLE_INT_ID_ACTIVO,
    'SchoolID'       => PLE_SCHOOL_ID_ACTIVO,
    'BusinessID'     => PLE_SCHOOL_ID_ACTIVO,
    'Description'    => substr($descripcion, 0, 50),
    'Amount'         => intval(round($total * 100)),
    'Reference'      => $ref,
    'CustomerEmail'  => '',
    'CustomerName'   => '',
    'ExpirationDate' => date('Y-m-d', strtotime('+3 day')),
];
$payload_log = $payload; $payload_log['Password'] = '***';
log_api("iniciar_pago_agrupado(Efectivo) -> agrupado_id={$agrupado_id} cliente={$cliente_id} cobros=" . implode(',', $cobro_ids) . " total={$total} ref={$ref} | payload: " . json_encode($payload_log, JSON_UNESCAPED_UNICODE));

$res = curl_post(PLE_URL_REFERENCIA, $payload);
if ($res['error']) log_api("iniciar_pago_agrupado(Efectivo) ERROR DE RED -> " . $res['error']);
if ($res['error']) respond(['success' => false, 'error' => 'Error de red: ' . $res['error']]);
$raw = json_decode($res['body'], true) ?? [];

if (empty($raw['Reference']) && empty($raw['BarCode']) && empty($raw['PayFormat'])) {
    log_api("iniciar_pago_agrupado(Efectivo) FALLÓ -> " . json_encode($raw, JSON_UNESCAPED_UNICODE));
    respond(['success' => false, 'error' => $raw['Message'] ?? 'No se pudo generar la referencia de pago']);
}

$vencimiento = date('Y-m-d', strtotime('+3 day'));
$pdo->prepare("UPDATE cobros_agrupados SET barcode_url = ?, payformat_url = ?, vencimiento = ? WHERE id = ?")
    ->execute([$raw['BarCode'] ?? null, $raw['PayFormat'] ?? null, $vencimiento, $agrupado_id]);

respond([
    'success'     => true,
    'referencia'  => $ref,
    'folio'       => $folio,
    'barcode_url' => $raw['BarCode'] ?? $raw['PayFormat'] ?? null,
    'vencimiento' => $vencimiento,
    'total'       => $total,
    'conceptos'   => count($cobros),
]);
