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
// Construye el Reference segun la documentacion de Cobroscontarjeta.com
// (IntegracionesCAI_V1_1, pag. 4, 9 y 13):
//
//     Numerico (13) = 000000000 + 0000
//     9 digitos para el alumno + 4 digitos para el pago de ese alumno
//
// Antes se mandaba un numero basado en time() sin relacion con el alumno, y
// de 15 digitos. Funcionaba, pero incumple la spec en longitud y, sobre todo,
// impide identificar de quien es el pago en los reportes del proveedor.
//
// La doc tambien exige que sea unica e irrepetible (codigo 23), por eso se
// avanza el consecutivo hasta encontrar uno que no exista ya en cobros.
//
// Si el proveedor llegara a rechazar el formato de 13 (codigo 22), define
// REFERENCIA_FORMATO_LARGO = true en config.php para volver al de 15 digitos
// sin tocar codigo.
function construir_referencia_pago(PDO $pdo, $clienteId): string
{
    if (defined('REFERENCIA_FORMATO_LARGO') && REFERENCIA_FORMATO_LARGO) {
        $base = intval(substr(strval(time()), -6)) . mt_rand(100, 999);
        return str_pad($base, 15, '0', STR_PAD_LEFT);
    }

    // Sin cliente (cobro general) se usa 0 en el bloque de alumno.
    $alumno = str_pad(strval(max(0, intval($clienteId))), 9, '0', STR_PAD_LEFT);

    $stmt = $pdo->prepare(
        "SELECT COUNT(*) AS n FROM cobros
          WHERE cliente_id = ? AND referencia IS NOT NULL AND referencia <> ''"
    );
    $stmt->execute([intval($clienteId)]);
    $desde = intval($stmt->fetch()['n'] ?? 0) + 1;

    $chk = $pdo->prepare("SELECT 1 FROM cobros WHERE referencia = ? LIMIT 1");
    for ($i = 0; $i < 300; $i++) {
        $consecutivo = ($desde + $i) % 10000;
        $ref = $alumno . str_pad(strval($consecutivo), 4, '0', STR_PAD_LEFT);
        $chk->execute([$ref]);
        if (!$chk->fetch()) return $ref;
    }
    // Salida de emergencia: no deberia llegar aqui con 10000 combinaciones.
    return $alumno . str_pad(strval(mt_rand(0, 9999)), 4, '0', STR_PAD_LEFT);
}

function cobrar_via_token(PDO $pdo, int $cobroId, int $clienteId, float $total, string $token, $expMes, $expAnio): array
{
    if ($total < 50 || $total > 15000) {
        return ['success' => false, 'error' => 'Monto fuera de rango ($50.00 - $15,000.00)'];
    }
    // Formato de referencia: se usa EXACTAMENTE el mismo patron que
    // acciones/generar_liga.php, que es el unico confirmado como valido por
    // el proveedor: Id de 9 digitos y Reference de 15, ambos con ceros a la
    // izquierda y enviados como STRING (no como numero JSON).
    //
    // ANTES: se mandaba mt_rand(1000000000, 2147483647) convertido con
    // intval() — es decir, 10 digitos, sin ceros y como numero. Ese es
    // justo uno de los formatos que el propio comentario de generar_liga
    // documenta como fallidos con code 22 "El formato de la referencia es
    // incorrecto", que era el error que impedia cobrar con tarjeta guardada.
    $ref     = construir_referencia_pago($pdo, $clienteId);
    $id_pago = str_pad(strval(max(0, intval($clienteId))), 9, '0', STR_PAD_LEFT);
    $payload = [
        'User'          => PLE_USER,
        'Password'      => PLE_PASS,
        'IntegrationID' => intval(PLE_INT_ID_ACTIVO),
        'SchoolID'      => PLE_SCHOOL_ID_ACTIVO,
        'BusinessID'    => PLE_SCHOOL_ID_ACTIVO,
        'Token'         => $token,
        'Id'            => $id_pago,
        'Reference'     => $ref,
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
    // Antes el exito NO dejaba rastro: solo se registraba el fallo, asi que
    // la unica forma de saber si un cargo habia pasado era su ausencia en el
    // log. Ahora se registra igual que el fallo, con el codigo de autorizacion.
    log_api("cobrar_via_token OK -> cobro={$cobroId} cliente={$clienteId} total={$total} ref={$ref} auth=" . ($tx['auth'] ?? 'sin-auth'));
    return ['success' => true, 'auth' => $tx['auth'] ?? null, 'raw' => $raw];
}
