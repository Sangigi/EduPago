<?php
/**
 * EduPago — Servicio de Consulta de Clabe (SPEI)
 * Doc: IntegracionesSpei_V1_4, sección "Servicio de Consulta de Clabe"
 *
 * Cobroscontarjeta.com llama: GET https://TU_DOMINIO/webhooks/consulta_clabe.php?r=CLABE
 * Body de la petición: vacío (según doc).
 * Respuesta esperada: HTTP 200 + JSON { codigo, mensaje, monto, clabe, transaccion, parcial }
 *
 * Configurar esta URL (sin query string, CCT agrega /?r=CLABE solo) en el
 * Sandbox → EndPoint → Pago por SPEI → "Consultar clabe".
 *
 * IMPORTANTE — por qué existe este archivo:
 * El webhook_spei.php anterior atendía SOLO peticiones POST con un esquema
 * propio (?token=, campo "concepto_pago", etc.) que NO es el protocolo real
 * de Cobroscontarjeta.com. El protocolo real exige, ANTES del pago, que el
 * banco del cliente valide la CLABE con un GET a este endpoint — sin esto,
 * la transferencia SPEI nunca se completa del lado del banco, así que el
 * flujo se moría aquí mismo, antes de siquiera llegar a "pagar".
 *
 * En EduPago, la CLABE es del ALUMNO (no de un cobro específico), así que
 * "consultar" una CLABE significa: buscar al alumno dueño de esa CLABE y
 * devolver el monto de su cobro pendiente más antiguo.
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/webhook_helpers.php';

header('Content-Type: application/json; charset=UTF-8');

function responder_consulta_clabe($codigo, $mensaje, $monto = 0, $clabe = '', $transaccion = 0) {
    webhook_responder([
        'codigo'      => $codigo,
        'mensaje'     => $mensaje,
        'monto'       => strval($monto),
        'clabe'       => $clabe,
        'transaccion' => strval($transaccion),
        'parcial'     => true, // el manual exige que siempre vaya en true
    ]);
}

function log_clabe($msg) {
    if (defined('REFERENCIA_LOG_FILE')) {
        webhook_log(REFERENCIA_LOG_FILE, 'SPEI-CONSULTA | ' . $msg);
    }
}

$clabe = trim($_GET['r'] ?? '');

if (!$clabe || !preg_match('/^\d{18}$/', $clabe)) {
    log_clabe("formato inválido: '{$clabe}'");
    responder_consulta_clabe(15, 'Referencia con error de formato', 0, $clabe);
}

try {
    $stmt = $pdo->prepare(
        "SELECT id AS cliente_id FROM clientes WHERE clabe_individual = ? AND clabe_individual_estado = 'activa' LIMIT 1"
    );
    $stmt->execute([$clabe]);
    $cliente = $stmt->fetch();

    if (!$cliente) {
        log_clabe("clabe no encontrada o inactiva: {$clabe}");
        responder_consulta_clabe(40, 'Adquiriente inválido', 0, $clabe);
    }

    // Suma de TODOS los cobros pendientes de ese alumno (una CLABE puede cubrir
    // varios cobros a lo largo del ciclo escolar; se cobran todos de un jalón).
    $stmtCob = $pdo->prepare(
        "SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS total FROM cobros WHERE cliente_id = ? AND estado = 'pendiente'"
    );
    $stmtCob->execute([$cliente['cliente_id']]);
    $resumen = $stmtCob->fetch();

    if (!$resumen || intval($resumen['n']) === 0) {
        log_clabe("sin adeudo pendiente: clabe:{$clabe} cliente:{$cliente['cliente_id']}");
        responder_consulta_clabe(13, 'Referencia sin adeudo', 0, $clabe);
    }

    $monto_centavos = intval(round(floatval($resumen['total']) * 100));

    log_clabe("OK: clabe:{$clabe} cliente:{$cliente['cliente_id']} pendientes:{$resumen['n']} monto:{$monto_centavos}");
    // transaccion = id del CLIENTE (ya no de un cobro específico): el pago
    // ahora cubre de un jalón TODOS los pendientes de ese alumno.
    responder_consulta_clabe(0, 'Operación exitosa', $monto_centavos, $clabe, intval($cliente['cliente_id']));

} catch (\Throwable $e) {
    log_clabe("ERROR: " . $e->getMessage());
    responder_consulta_clabe(50, 'Error de sistema', 0, $clabe);
}