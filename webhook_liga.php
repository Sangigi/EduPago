<?php
/**
 * EduPago — Webhook Liga/CAI (EntregarPagoLigaToken)
 *
 * Cobroscontarjeta.com llama a esto vía HTTP POST cuando un padre de
 * familia termina de pagar una liga generada por 'generar_liga' (que usa
 * GenerarLigaDomiciliacionIndi de Pagalaescuela). El body trae el estatus
 * del pago (approved/denied/error) y, si fue exitoso, el token de tarjeta
 * (number_tkn) + mes/año de expiración para poder cobrar CAI después.
 *
 * Configurar esta URL en el Sandbox de Pagalaescuela como:
 *   Comercios / Pago en línea → "Entregar liga" (o el que corresponda a
 *   EntregarPagoLigaToken según lo que Cobroscontarjeta.com acuerde contigo)
 *
 * IMPORTANTE: el protocolo de Cobroscontarjeta.com para este servicio NO
 * define un mecanismo propio de autenticación del webhook (a diferencia de
 * SPEI que sí es un servicio EMISOR con GET+POST propios). La validación
 * de que el request es legítimo se hace verificando que 'reference' exista
 * como cobros.referencia con estado 'pendiente' — un atacante tendría que
 * adivinar una referencia numérica de 13 dígitos que generamos nosotros.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/helpers_pagos.php';
require_once __DIR__ . '/lib/webhook_helpers.php';

header('Content-Type: application/json; charset=UTF-8');

$ts  = date('Y-m-d H:i:s');

if (!ip_permitida_pago_sin_token()) {
    if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, '❌ WEBHOOK LIGA rechazado por IP no permitida: ' . ($_SERVER['REMOTE_ADDR'] ?? '?'));
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode(['success' => false, 'mensaje' => 'No autorizado'], JSON_UNESCAPED_UNICODE);
    exit;
}

$raw = file_get_contents('php://input');

file_put_contents(
    __DIR__ . '/debug_webhook.txt',
    "\n============================\n" .
    date('Y-m-d H:i:s') . "\n" .
    "METHOD: " . ($_SERVER['REQUEST_METHOD'] ?? 'N/A') . "\n" .
    "CONTENT_TYPE: " . ($_SERVER['CONTENT_TYPE'] ?? 'N/A') . "\n" .
    "CONTENT_LENGTH: " . ($_SERVER['CONTENT_LENGTH'] ?? 'N/A') . "\n" .
    "GET:\n" . print_r($_GET, true) .
    "POST:\n" . print_r($_POST, true) .
    "RAW:\n" . $raw . "\n" .
    "============================\n",
    FILE_APPEND
);

if (API_LOG_ENABLED) {
    file_put_contents(
        __DIR__ . '/webhook_log.txt',
        "\n[{$ts}] ══ WEBHOOK LIGA/CAI ══\nRAW:\n{$raw}\n" . str_repeat('─', 60) . "\n",
        FILE_APPEND
    );
}

function responder_liga($ok, $msg) {
    // Cobroscontarjeta.com no exige un formato de respuesta estricto para
    // este webhook (solo espera 200 OK); devolvemos algo simple y claro.
    echo json_encode(['success' => $ok, 'mensaje' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

$data = json_decode($raw, true);

if (!is_array($data)) {
    // Intentar recibir application/x-www-form-urlencoded
    if (!empty($_POST)) {
        $data = $_POST;
    } else {
        parse_str($raw, $parsed);
        $data = $parsed;
    }
}

if (!is_array($data) || empty($data)) {
    if (API_LOG_ENABLED) {
        webhook_log(
            API_LOG_FILE,
            "❌ WEBHOOK LIGA: body vacío o formato desconocido\n" .
            "Content-Type: " . ($_SERVER['CONTENT_TYPE'] ?? 'desconocido') . "\n" .
            "RAW: {$raw}"
        );
    }

    responder_liga(false, 'JSON inválido o body vacío');
}

$reference   = trim($data['reference'] ?? '');
$response    = strtolower(trim($data['response'] ?? '')); // approved | denied | error
$auth        = trim($data['auth'] ?? '');
$foliocpagos = trim($data['foliocpagos'] ?? '');
$amount      = $data['amount'] ?? null;
$number_tkn  = trim($data['number_tkn'] ?? '');
$cc_expmonth = trim($data['cc_expmonth'] ?? '');
$cc_expyear  = trim($data['cc_expyear'] ?? '');
$nb_error    = trim($data['nb_error'] ?? '');

if (!$reference) {
    if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, "❌ WEBHOOK LIGA: sin 'reference' en el body");
    responder_liga(false, 'Falta reference');
}

try {
    $stmt = $pdo->prepare("SELECT id, cliente_id, total, estado, auth_code FROM cobros WHERE referencia = ? ORDER BY id DESC LIMIT 1");
    $stmt->execute([$reference]);
    $cobro = $stmt->fetch();

    // Cobroscontarjeta.com no regresa nuestra Reference original (15 digitos)
    // tal cual: la envuelve en un codigo propio mas largo con la forma
    // prefijo + nuestros 9 digitos finales (la parte aleatoria) + 1 digito de
    // cola -- confirmado con un pago real (nuestra "000000182222901" volvio
    // como "0000020000001822229011"). Si el match exacto falla, reconstruimos
    // nuestra referencia tomando esos 9 digitos (10 posiciones antes del final
    // del string recibido) y volvemos a buscar.
    if (!$cobro && preg_match('/\d{10}$/', $reference)) {
        $core9 = substr($reference, -10, 9);
        $referencia_reconstruida = str_pad($core9, 15, '0', STR_PAD_LEFT);
        $stmt->execute([$referencia_reconstruida]);
        $cobro = $stmt->fetch();
        if ($cobro) {
            log_api_liga("LIGA reference envuelta reconocida -> recibido:{$reference} reconstruida:{$referencia_reconstruida} cobro_id:{$cobro['id']}");
        }
    }
    if (!$cobro) {
        $log_msg = "⚠ LIGA HUÉRFANA | ref:{$reference} folio_cct:{$foliocpagos} response:{$response}";
        if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, $log_msg);
        responder_liga(true, 'Recibido, sin cobro pendiente para esa referencia');
    }

    // Idempotencia: si ya está pagado con el mismo auth, no reprocesar.
    if ($cobro['estado'] === 'pagado') {
        if ($cobro['auth_code'] === $auth) {
            responder_liga(true, 'Ya estaba confirmado (reintento idempotente)');
        }
        if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, "⚠ LIGA reintento con distinto auth | cobro_id:{$cobro['id']} previo:{$cobro['auth_code']} nuevo:{$auth}");
        responder_liga(true, 'Cobro ya confirmado previamente');
    }

    if ($response !== 'approved') {
        // denied / error: dejamos el cobro pendiente para que caja pueda
        // reintentar generando una liga nueva; solo se loguea el rechazo.
        if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, "❌ LIGA rechazada | ref:{$reference} response:{$response} nb_error:{$nb_error}");
        responder_liga(true, 'Pago no aprobado, registrado');
    }

    // Validar monto (viene en pesos según la doc de este webhook — "Importe
    // pagado"). ANTES: si el monto no coincidía, o si venía vacío/0, el cobro
    // se confirmaba igual y solo se dejaba un log — cualquiera podía llamar a
    // este webhook con response=approved sin `amount` (o con 0) y marcar como
    // pagado un cobro sin que hubiera un cargo real. Ahora, igual que
    // webhook_spei.php y pago_referencia.php, un monto ausente o que no
    // coincide (tolerancia de 1 centavo) RECHAZA la confirmación.
    if ($amount === null || floatval($amount) <= 0) {
        if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, "❌ LIGA sin monto válido, se rechaza | ref:{$reference}");
        responder_liga(false, 'Falta el monto pagado (amount)');
    }
    $monto_recibido = floatval($amount);
    if (abs($monto_recibido - floatval($cobro['total'])) > 0.01) {
        if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, "❌ LIGA monto no coincide, se rechaza | cobro_id:{$cobro['id']} esperado:{$cobro['total']} recibido:{$monto_recibido}");
        responder_liga(false, 'El monto pagado no coincide con el cobro pendiente');
    }

    $pdo->beginTransaction();

    $pdo->prepare("UPDATE cobros SET estado = 'pagado', metodo = 'TC', auth_code = ? WHERE id = ?")
        ->execute([$auth ?: $foliocpagos, $cobro['id']]);

    // Recalcular saldo_pendiente del cliente vinculado (mismo patrón que confirmar_pago).
    if (!empty($cobro['cliente_id'])) {
        recalcular_saldo_pendiente($pdo, intval($cobro['cliente_id']));

        // Tokenización para CAI: solo si Pagalaescuela mandó un token válido.
        if ($number_tkn) {
            $pdo->prepare(
                "UPDATE clientes SET token_tarjeta = ?, token_tarjeta_expmes = ?, token_tarjeta_expanio = ?, token_tarjeta_estado = 'activo' WHERE id = ?"
            )->execute([$number_tkn, $cc_expmonth, $cc_expyear, $cobro['cliente_id']]);
        }
    }

    $pdo->commit();

    log_api_liga("LIGA confirmada -> cobro_id:{$cobro['id']} ref:{$reference} auth:{$auth} tokenizado:" . ($number_tkn ? 'sí' : 'no'));
    responder_liga(true, 'Pago confirmado');

} catch (\Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, '❌ ERROR webhook_liga: ' . $e->getMessage());
    responder_liga(false, 'Error de sistema');
}

function log_api_liga($msg) {
    if (!API_LOG_ENABLED) return;
    webhook_log(API_LOG_FILE, $msg);
}
