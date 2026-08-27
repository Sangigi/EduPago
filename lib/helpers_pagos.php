<?php
// helpers_pagos.php
//
// `clientes.saldo_pendiente` es una columna cacheada — el Portal de Familia
// y el resto del sistema la leen directamente, NO la calculan en vivo desde
// `cobros`. Esta recalculación se copiaba y pegaba en cada punto del código
// que modifica `cobros` (api.php, los 4 webhooks de pago, el cron de
// recordatorios); un sitio (webhook_spei.php) había divergido a una fórmula
// de decremento en vez de recalcular desde la fuente, lo que la dejaba sin
// forma de autocorregirse si el saldo alguna vez se desincronizaba.

/**
 * Recalcula clientes.saldo_pendiente desde la fuente de verdad (SUM de
 * cobros pendientes) y lo guarda. Debe llamarse después de cualquier cambio
 * a `cobros` que afecte a este cliente (crear, confirmar, cancelar, aplicar
 * recargo, etc.).
 */
function recalcular_saldo_pendiente(PDO $pdo, int $cliente_id): void
{
    $pdo->prepare(
        "UPDATE clientes SET saldo_pendiente = (
            SELECT COALESCE(SUM(total), 0) FROM cobros
            WHERE cliente_id = ? AND estado = 'pendiente'
        ) WHERE id = ?"
    )->execute([$cliente_id, $cliente_id]);
}

require_once __DIR__ . '/curl_helper.php';

/**
 * Cobra un cobro pendiente con la tarjeta ya domiciliada (token) de un
 * cliente — la misma llamada al proveedor que usaba acciones/cobrar_cai.php
 * a mano, extraída aquí para que cron_recordatorios.php (cobro automático
 * de recurrentes) la comparta sin duplicar el payload/curl/parseo de
 * respuesta. NO valida permisos ni pertenencia — eso es responsabilidad de
 * cada llamador según su propio contexto (un endpoint autenticado vs. un
 * proceso de sistema sin sesión).
 *
 * @return array{success:bool, error?:string, auth?:?string, raw?:array}
 */
function cobrar_via_token(PDO $pdo, int $cobroId, int $clienteId, float $total, string $token, $expMes, $expAnio): array
{
    if ($total < 50 || $total > 15000) {
        return ['success' => false, 'error' => 'Monto fuera de rango ($50.00 - $15,000.00)'];
    }
    // Reference acotada a rango int32 (mismo motivo que generar_liga/cobrar_cai:
    // el proveedor rechaza formatos de referencia fuera de este patrón).
    $ref = strval(mt_rand(1000000000, 2147483647));
    $payload = [
        'User'          => PLE_USER,
        'Password'      => PLE_PASS,
        'IntegrationID' => intval(PLE_INT_ID_ACTIVO),
        'SchoolID'      => PLE_SCHOOL_ID_ACTIVO,
        'BusinessID'    => PLE_SCHOOL_ID_ACTIVO,
        'Token'         => $token,
        'Reference'     => intval($ref),
        'Amount'        => intval(round($total * 100)),
        'ExpMonth'      => $expMes,
        'ExpYear'       => $expAnio,
    ];
    log_api("cobrar_via_token -> cobro={$cobroId} cliente={$clienteId} total={$total} ref={$ref}");
    $res = curl_post(PLE_URL_DOMICILIACION_PAGAR, $payload);
    if ($res['error']) {
        return ['success' => false, 'error' => 'Error de red: ' . $res['error']];
    }
    $raw = json_decode($res['body'], true) ?? [];
    $tx  = $raw['txResponse'] ?? [];
    if (($raw['code'] ?? '') !== '00' || ($tx['response'] ?? '') !== 'approved') {
        log_api("cobrar_via_token FALLÓ -> " . json_encode($raw, JSON_UNESCAPED_UNICODE));
        return ['success' => false, 'error' => $raw['message'] ?? ($tx['nb_error'] ?? 'Cargo automático rechazado'), 'raw' => $raw];
    }
    $pdo->prepare("UPDATE cobros SET estado = 'pagado', metodo = 'TC', referencia = ?, auth_code = ? WHERE id = ?")
        ->execute([$ref, $tx['auth'] ?? null, $cobroId]);
    recalcular_saldo_pendiente($pdo, $clienteId);
    return ['success' => true, 'auth' => $tx['auth'] ?? null, 'raw' => $raw];
}
