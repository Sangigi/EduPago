<?php
/**
 * EduPago — Servicio de Consulta de Referencia (efectivo OXXO/terceros)
 * Doc: IntegracionesReferencias_V1_4, sección "Servicio de Consulta de Referencia"
 *
 * Cobroscontarjeta.com llama: GET https://TU_DOMINIO/webhooks/consulta_referencia.php?r=REFERENCIA
 * Body de la petición: vacío (según doc).
 * Respuesta esperada: HTTP 200 + JSON { codigo, mensaje, monto, referencia, transaccion, parcial }
 *
 * Configurar esta URL (sin query string, CCT agrega /?r=REFERENCIA solo) en
 * el Sandbox → EndPoint → Comercios → "Consultar referencia".
 *
 * ANTES (hasta 11-sep-2026) solo conocía `cobros` -- así que si el cliente
 * llegaba a la tienda a pagar una referencia de renovación de suscripción,
 * de pago agrupado, o de alta de colegio nueva, la tienda la rechazaba en
 * el momento (código 40 "Adquiriente inválido") ANTES de que el pago
 * siquiera llegara a webhooks/pago_referencia.php, que sí sabe conciliar
 * los cuatro casos. Ahora consulta los mismos cuatro orígenes, en el mismo
 * orden que pago_referencia.php.
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/webhook_helpers.php';

header('Content-Type: application/json; charset=UTF-8');

function responder_consulta($codigo, $mensaje, $monto = 0, $referencia = '', $transaccion = 0) {
    webhook_responder([
        'codigo'      => $codigo,
        'mensaje'     => $mensaje,
        'monto'       => strval($monto),
        'referencia'  => $referencia,
        'transaccion' => strval($transaccion),
        'parcial'     => true, // el manual exige que siempre vaya en true
    ]);
}

function log_ref($msg) {
    if (defined('REFERENCIA_LOG_FILE')) {
        webhook_log(REFERENCIA_LOG_FILE, 'CONSULTA | ' . $msg);
    }
}

$referencia = trim($_GET['r'] ?? '');

if (!$referencia || !preg_match('/^\d+$/', $referencia)) {
    log_ref("formato inválido: '{$referencia}'");
    responder_consulta(15, 'Referencia con error de formato');
}

try {
    $stmt = $pdo->prepare(
        "SELECT id, total, estado, ref_vencimiento FROM cobros WHERE referencia = ? AND metodo = 'EfectivoRef' ORDER BY id DESC LIMIT 1"
    );
    $stmt->execute([$referencia]);
    $cobro = $stmt->fetch();

    if ($cobro) {
        if ($cobro['estado'] === 'pagado') {
            log_ref("ya pagada: {$referencia} cobro_id:{$cobro['id']}");
            responder_consulta(13, 'Referencia sin adeudo', 0, $referencia);
        }
        if ($cobro['estado'] === 'cancelado') {
            log_ref("cancelada: {$referencia} cobro_id:{$cobro['id']}");
            responder_consulta(13, 'Referencia cancelada', 0, $referencia);
        }
        if ($cobro['ref_vencimiento'] && strtotime($cobro['ref_vencimiento']) < strtotime(date('Y-m-d'))) {
            log_ref("vencida: {$referencia} cobro_id:{$cobro['id']}");
            responder_consulta(14, 'Referencia fuera de vigencia', 0, $referencia);
        }
        // Identificador consecutivo de la operación — usamos el id del
        // cobro, suficiente porque es único y estable para toda la vida de
        // esa referencia.
        $monto_centavos = intval(round(floatval($cobro['total']) * 100));
        log_ref("OK cobro: {$referencia} cobro_id:{$cobro['id']} monto:{$monto_centavos}");
        responder_consulta(0, 'Operación exitosa', $monto_centavos, $referencia, intval($cobro['id']));
    }

    // Pago AGRUPADO (Portal Familia): varios cobros de un mismo alumno
    // pagados juntos con una sola referencia.
    $stmtGrp = $pdo->prepare("SELECT id, total, estado, vencimiento FROM cobros_agrupados WHERE referencia = ? LIMIT 1");
    $stmtGrp->execute([$referencia]);
    $grp = $stmtGrp->fetch();
    if ($grp) {
        if ($grp['estado'] === 'pagado') {
            log_ref("agrupado ya pagado: {$referencia} agrupado_id:{$grp['id']}");
            responder_consulta(13, 'Referencia sin adeudo', 0, $referencia);
        }
        if ($grp['vencimiento'] && strtotime($grp['vencimiento']) < strtotime(date('Y-m-d'))) {
            log_ref("agrupado vencido: {$referencia} agrupado_id:{$grp['id']}");
            responder_consulta(14, 'Referencia fuera de vigencia', 0, $referencia);
        }
        $monto_centavos = intval(round(floatval($grp['total']) * 100));
        log_ref("OK agrupado: {$referencia} agrupado_id:{$grp['id']} monto:{$monto_centavos}");
        responder_consulta(0, 'Operación exitosa', $monto_centavos, $referencia, intval($grp['id']));
    }

    // Renovación de suscripción de un colegio ya activo (o saliendo de demo).
    $stmtEsc = $pdo->prepare(
        "SELECT id, pago_renovacion_monto, pago_renovacion_vencimiento FROM escuelas WHERE pago_renovacion_referencia = ? LIMIT 1"
    );
    $stmtEsc->execute([$referencia]);
    $esc = $stmtEsc->fetch();
    if ($esc) {
        if ($esc['pago_renovacion_vencimiento'] && strtotime($esc['pago_renovacion_vencimiento']) < strtotime(date('Y-m-d'))) {
            log_ref("renovación vencida: {$referencia} escuela_id:{$esc['id']}");
            responder_consulta(14, 'Referencia fuera de vigencia', 0, $referencia);
        }
        $monto_centavos = intval(round(floatval($esc['pago_renovacion_monto']) * 100));
        log_ref("OK renovación: {$referencia} escuela_id:{$esc['id']} monto:{$monto_centavos}");
        responder_consulta(0, 'Operación exitosa', $monto_centavos, $referencia, intval($esc['id']));
    }

    // Suscripción NUEVA de un colegio en registro (flujo heredado — desde
    // 11-sep-2026 las escuelas nuevas se crean directo en modo demo, sin
    // pagar aquí, pero una invitación vieja a medias todavía puede llegar).
    $stmtInv = $pdo->prepare(
        "SELECT id, monto_suscripcion, estado, pago_vencimiento FROM invitaciones_colegio WHERE pago_referencia = ? LIMIT 1"
    );
    $stmtInv->execute([$referencia]);
    $inv = $stmtInv->fetch();
    if ($inv) {
        if (in_array($inv['estado'], ['pagado', 'aprobada'], true)) {
            log_ref("suscripción ya pagada: {$referencia} invitacion_id:{$inv['id']}");
            responder_consulta(13, 'Referencia sin adeudo', 0, $referencia);
        }
        // Blindaje (11-sep-2026, hallado en revisión adversarial): una
        // invitación rechazada/cancelada/expirada NO debe poder pagarse en
        // tienda -- antes solo se excluían 'pagado'/'aprobada', así que
        // cualquiera de estos tres estados terminales caía al "OK" de abajo
        // y la tienda aceptaba el pago de una solicitud que el superadmin ya
        // había cerrado.
        if (in_array($inv['estado'], ['rechazada', 'cancelada', 'expirada'], true)) {
            log_ref("suscripción {$inv['estado']}: {$referencia} invitacion_id:{$inv['id']}");
            responder_consulta(40, 'Adquiriente inválido', 0, $referencia);
        }
        if ($inv['pago_vencimiento'] && strtotime($inv['pago_vencimiento']) < strtotime(date('Y-m-d'))) {
            log_ref("suscripción vencida: {$referencia} invitacion_id:{$inv['id']}");
            responder_consulta(14, 'Referencia fuera de vigencia', 0, $referencia);
        }
        $monto_centavos = intval(round(floatval($inv['monto_suscripcion']) * 100));
        log_ref("OK suscripción nueva: {$referencia} invitacion_id:{$inv['id']} monto:{$monto_centavos}");
        responder_consulta(0, 'Operación exitosa', $monto_centavos, $referencia, intval($inv['id']));
    }

    log_ref("no encontrada en ningún origen: {$referencia}");
    responder_consulta(40, 'Adquiriente inválido', 0, $referencia);

} catch (\Throwable $e) {
    log_ref("ERROR: " . $e->getMessage());
    responder_consulta(50, 'Error de sistema', 0, $referencia);
}
