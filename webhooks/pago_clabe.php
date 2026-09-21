<?php
/**
 * EduPago — Servicio de Autorización de Pago (SPEI)
 * Doc: IntegracionesSpei_V1_4, sección "Servicio de Autorización de Pago"
 *
 * Cobroscontarjeta.com llama: POST https://TU_DOMINIO/webhooks/pago_clabe.php
 * Body: { clabe, fecha, monto, transaccion }
 * Respuesta esperada: HTTP 200 + JSON { codigo, autorizacion, mensaje, transaccion, fecha }
 *
 * Configurar en Sandbox → EndPoint → Pago por SPEI → "Pagar clabe".
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/helpers_pagos.php';
require_once __DIR__ . '/../lib/webhook_helpers.php';

header('Content-Type: application/json; charset=UTF-8');

function responder_pago_clabe($codigo, $mensaje, $autorizacion = '', $transaccion = '') {
    webhook_responder([
        'codigo'       => $codigo,
        'autorizacion' => $autorizacion,
        'mensaje'      => $mensaje,
        'transaccion'  => strval($transaccion),
        'fecha'        => date('Y-m-d'),
    ]);
}

function log_pago_clabe($msg) {
    if (defined('REFERENCIA_LOG_FILE')) {
        webhook_log(REFERENCIA_LOG_FILE, 'SPEI-PAGO | ' . $msg);
    }
}

// Control de origen (21-sep-2026). Este endpoint es el más poderoso de los
// cinco: marca como pagados TODOS los cobros pendientes de un alumno de un
// solo golpe. Hasta hoy no validaba NADA -- ni token ni IP. El
// WEBHOOK_SPEI_TOKEN de config.php solo se verifica en webhook_spei.php, que
// es el endpoint del esquema viejo que el propio repo declara muerto (ver
// consulta_clabe.php:14-19), así que en la práctica este servicio estaba
// abierto. Con IPS_PERMITIDAS_PAGOS_SIN_TOKEN vacía esto NO bloquea nada
// todavía (mismo comportamiento que antes), pero ya deja registrada la IP de
// cada llamada en ips_webhooks_log.txt para poder armar la lista blanca.
if (!ip_permitida_pago_sin_token()) {
    log_pago_clabe('rechazado por IP no permitida: ' . ($_SERVER['REMOTE_ADDR'] ?? '?'));
    responder_pago_clabe(40, 'No autorizado');
}

$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);
log_pago_clabe("RAW: {$raw}");

if (!$data || !is_array($data)) {
    responder_pago_clabe(50, 'JSON inválido o body vacío');
}

$clabe       = trim($data['clabe'] ?? '');
$monto_cent  = intval($data['monto'] ?? 0);
$transaccion = trim(strval($data['transaccion'] ?? ''));

if (!$clabe || !preg_match('/^\d{18}$/', $clabe)) {
    log_pago_clabe("formato inválido: '{$clabe}'");
    responder_pago_clabe(15, 'Referencia con error de formato', '', $transaccion);
}

if ($monto_cent <= 0) {
    responder_pago_clabe(30, 'Monto inválido', '', $transaccion);
}

try {
    $pdo->beginTransaction();

    // escuela_id se trae para poder atribuir a un colegio los depósitos que
    // no se logren aplicar (ver registrar_pago_no_aplicado más abajo).
    $stmtCli = $pdo->prepare(
        "SELECT id, escuela_id FROM clientes WHERE clabe_individual = ? AND clabe_individual_estado = 'activa' LIMIT 1"
    );
    $stmtCli->execute([$clabe]);
    $cliente = $stmtCli->fetch();

    if (!$cliente) {
        $pdo->rollBack();
        log_pago_clabe("clabe no encontrada: {$clabe}");
        // Dinero que llegó a una CLABE que no reconocemos (o que se liberó y
        // volvió al pool). Antes se descartaba sin dejar nada en BD.
        registrar_pago_no_aplicado($pdo, [
            'canal'          => 'spei',
            'motivo'         => 'clabe_desconocida',
            'clabe'          => $clabe,
            'transaccion'    => $transaccion,
            'monto_recibido' => $monto_cent / 100,
            'payload_raw'    => $raw,
        ]);
        responder_pago_clabe(40, 'Adquiriente inválido', '', $transaccion);
    }

    // Se cobran TODOS los pendientes del alumno en un solo pago — antes solo
    // se buscaba UN cobro (por 'transaccion' o el más viejo), así que si el
    // alumno tenía dos o más conceptos pendientes por separado (ej.
    // colegiatura + inscripción), pagar la suma de ambos en un solo depósito
    // SPEI siempre fallaba con "Monto inválido", y un pendiente viejo
    // olvidado bloqueaba para siempre cualquier pago nuevo.
    $stmtPend = $pdo->prepare(
        "SELECT id, total, auth_code FROM cobros WHERE cliente_id = ? AND estado = 'pendiente' ORDER BY id ASC FOR UPDATE"
    );
    $stmtPend->execute([$cliente['id']]);
    $pendientes = $stmtPend->fetchAll();

    if (empty($pendientes)) {
        // Nada pendiente: puede ser un reintento del banco sobre un pago que
        // ya se procesó por completo — idempotente, no un error, si ya hay
        // algo pagado con auth_code (evita que un reintento legítimo del
        // proveedor se tope con un falso "Adquiriente inválido").
        $stmtUltimo = $pdo->prepare(
            "SELECT auth_code FROM cobros WHERE cliente_id = ? AND estado = 'pagado' AND auth_code IS NOT NULL ORDER BY id DESC LIMIT 1"
        );
        $stmtUltimo->execute([$cliente['id']]);
        $ultimo = $stmtUltimo->fetch();
        $pdo->rollBack();
        if ($ultimo) {
            log_pago_clabe("ya pagado (idempotente, sin pendientes): cliente:{$cliente['id']}");
            // OJO — esta rama responde "Operación exitosa" reciclando un
            // auth_code viejo SIN comparar el monto: si de verdad entró un
            // depósito nuevo (y no un reintento del proveedor sobre uno ya
            // aplicado), lo estamos autorizando sin aplicarlo ni registrarlo.
            // No se cambia el comportamiento aquí (romper la idempotencia
            // haría fallar reintentos legítimos), pero al menos ya queda la
            // constancia para poder revisarlo caso por caso.
            registrar_pago_no_aplicado($pdo, [
                'canal'          => 'spei',
                'motivo'         => 'idempotente_sin_monto',
                'clabe'          => $clabe,
                'transaccion'    => $transaccion,
                'auth_code'      => $ultimo['auth_code'],
                'monto_recibido' => $monto_cent / 100,
                'cliente_id'     => $cliente['id'],
                'escuela_id'     => $cliente['escuela_id'] ?? null,
                'payload_raw'    => $raw,
            ]);
            responder_pago_clabe(0, 'Operación exitosa', $ultimo['auth_code'], $transaccion);
        }
        log_pago_clabe("sin pendientes para clabe:{$clabe} cliente:{$cliente['id']}");
        // Llegó dinero para un alumno que ya no debe nada.
        registrar_pago_no_aplicado($pdo, [
            'canal'          => 'spei',
            'motivo'         => 'sin_adeudo_pendiente',
            'clabe'          => $clabe,
            'transaccion'    => $transaccion,
            'monto_recibido' => $monto_cent / 100,
            'cliente_id'     => $cliente['id'],
            'escuela_id'     => $cliente['escuela_id'] ?? null,
            'payload_raw'    => $raw,
        ]);
        responder_pago_clabe(40, 'Adquiriente inválido', '', $transaccion);
    }

    $total_pendiente = 0.0;
    foreach ($pendientes as $p) { $total_pendiente += floatval($p['total']); }
    $monto_esperado_cent = intval(round($total_pendiente * 100));

    $autorizacion = str_pad(strval(rand(0, 99999999)), 8, '0', STR_PAD_LEFT);

    // ABONOS (21-sep-2026). Antes, cualquier monto distinto al total exacto se
    // rechazaba con código 30 y el proveedor le devolvía el dinero a la
    // familia automáticamente (confirmado en producción ese mismo día: una
    // transferencia de $8.00 contra un adeudo de $10.00 volvió sola). Es
    // decir: no se perdía dinero, pero era imposible abonar de a poco — la
    // familia tenía que transferir el total al centavo, o el colegio partir el
    // cobro a mano en dos.
    //
    // Ahora el depósito se aplica como abono, del cobro más viejo al más
    // nuevo, y los cobros se marcan 'pagado' solo cuando quedan cubiertos.
    // OJO CON LA CONSECUENCIA: al responder código 0 el proveedor YA NO
    // devuelve el dinero — se queda con nosotros y la familia espera el
    // crédito. Por eso aplicar_abono_a_cliente() es idempotente por
    // `transaccion` y corre con los cobros bloqueados (FOR UPDATE).
    $resAbono = aplicar_abono_a_cliente($pdo, intval($cliente['id']), $monto_cent / 100, [
        'metodo'      => 'SPEI',
        'clabe'       => $clabe,
        'transaccion' => $transaccion,
        'auth_code'   => $autorizacion,
        'origen'      => 'webhook_spei',
    ]);

    if ($resAbono['duplicado']) {
        // Reintento del proveedor sobre un depósito ya abonado.
        $pdo->rollBack();
        log_pago_clabe("abono duplicado (idempotente): cliente:{$cliente['id']} transaccion:{$transaccion}");
        responder_pago_clabe(0, 'Operación exitosa', $autorizacion, $transaccion);
    }

    // auth_code en los cobros que quedaron cubiertos con este depósito: se
    // conserva porque el resto del sistema (Historial, comprobantes, la rama
    // idempotente de arriba) lo lee de `cobros`, no de `cobro_abonos`.
    $pdo->prepare(
        "UPDATE cobros SET auth_code = ?
          WHERE cliente_id = ? AND estado = 'pagado' AND (auth_code IS NULL OR auth_code = '')"
    )->execute([$autorizacion, $cliente['id']]);

    recalcular_saldo_pendiente($pdo, intval($cliente['id']));

    // Sobrepago: pagó más de lo que debía. El excedente no se pierde ni se
    // inventa un saldo a favor (eso sería otra feature): queda registrado
    // para que el colegio lo vea en Cobros y decida qué hacer.
    if ($resAbono['sobrante'] > 0.004) {
        registrar_pago_no_aplicado($pdo, [
            'canal'          => 'spei',
            'motivo'         => 'sobrepago',
            'clabe'          => $clabe,
            'transaccion'    => $transaccion !== '' ? $transaccion . '-sobrante' : '',
            'auth_code'      => $autorizacion,
            'monto_recibido' => $resAbono['sobrante'],
            'monto_esperado' => 0,
            'cliente_id'     => $cliente['id'],
            'escuela_id'     => $cliente['escuela_id'] ?? null,
            'payload_raw'    => $raw,
        ]);
    }

    $pdo->commit();

    log_pago_clabe(
        "OK: clabe:{$clabe} cliente:{$cliente['id']}"
        . " recibido:{$monto_cent} esperado:{$monto_esperado_cent}"
        . " abonado:" . round($resAbono['aplicado'] * 100)
        . " sobrante:" . round($resAbono['sobrante'] * 100)
        . " cobros:" . implode(',', $resAbono['cobros'])
        . " auth:{$autorizacion}"
    );
    responder_pago_clabe(0, 'Operación exitosa', $autorizacion, $transaccion ?: $cliente['id']);

} catch (\Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    log_pago_clabe("ERROR: " . $e->getMessage());
    responder_pago_clabe(50, 'Error de sistema', '', $transaccion ?? '');
}
