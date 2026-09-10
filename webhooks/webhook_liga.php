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

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/helpers_pagos.php';
require_once __DIR__ . '/../lib/webhook_helpers.php';

header('Content-Type: application/json; charset=UTF-8');

$ts  = date('Y-m-d H:i:s');

if (!ip_permitida_pago_sin_token()) {
    if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, '❌ WEBHOOK LIGA rechazado por IP no permitida: ' . ($_SERVER['REMOTE_ADDR'] ?? '?'));
    header('Content-Type: application/json; charset=UTF-8');
    webhook_responder(['success' => false, 'mensaje' => 'No autorizado']);
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
    webhook_responder(['success' => $ok, 'mensaje' => $msg]);
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

// Ultimo recurso: algunos proveedores mandan la notificacion como GET con
// los datos en la query string. Antes solo se leia $_POST y el body, asi que
// ese aviso se descartaba y el cobro se quedaba en 'pendiente' pese a pagarse.
if ((!is_array($data) || empty($data)) && !empty($_GET)) {
    $data = $_GET;
}

// Una llamada COMPLETAMENTE vacia (sin body, sin POST y sin GET) no es una
// notificacion de pago: es una prueba de alcance del proveedor, o alguien
// abriendo la URL en el navegador. Se responde 200 OK para que la validacion
// del endpoint pase, en vez de un error que lo marque como caido.
if ((!is_array($data) || empty($data)) && ($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    if (API_LOG_ENABLED) {
        webhook_log(API_LOG_FILE, 'WEBHOOK LIGA: ping sin datos desde ' . ($_SERVER['REMOTE_ADDR'] ?? '?') . ' - respondido 200 OK');
    }
    responder_liga(true, 'Webhook activo');
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
// Evidencia del pago que antes se descartaba por completo (no había dónde
// guardarla): la doc trae cc_mask como campo propio ("Número de la máscara
// de la tarjeta"), pero por si el proveedor solo manda cc_number en la
// práctica (como pasa en otros de sus webhooks), se usa como respaldo.
$cc_mask     = trim($data['cc_mask'] ?? $data['cc_number'] ?? '');
$cc_type     = trim($data['cc_type'] ?? '');
$pago_email  = trim($data['email'] ?? '');

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
        // REFERENCIA_DIGITOS, NO 15 fijo: desde que se migró a producción en
        // pagalaescuela.mx (08-sep-2026) las referencias que generamos son de
        // 13 dígitos, no 15 (ese 15 era del Sandbox de pagadetodo.mx). Dejar
        // esto en 15 hacía que TODO pago con tarjeta llegara aquí como
        // "huérfano" aunque el banco sí lo hubiera aprobado, porque el
        // padding ya no coincidía con lo que de verdad se guardó en
        // `referencia` — el pago quedaba aprobado por el banco pero nunca
        // se marcaba como pagado en el sistema.
        $referencia_reconstruida = str_pad($core9, REFERENCIA_DIGITOS, '0', STR_PAD_LEFT);
        $stmt->execute([$referencia_reconstruida]);
        $cobro = $stmt->fetch();
        if ($cobro) {
            log_api_liga("LIGA reference envuelta reconocida -> recibido:{$reference} reconstruida:{$referencia_reconstruida} cobro_id:{$cobro['id']}");
        }
    }
    // Si no coincide con ningun cobro de alumno, puede ser un pago de
    // SUSCRIPCION de un colegio en registro (invitaciones_colegio), que usa
    // el mismo mecanismo de liga/referencia pero no vive en `cobros`. Se
    // revisa aqui, antes de darla por huerfana, con la misma reconstruccion
    // de referencia envuelta que ya se aplica arriba para cobros normales.
    if (!$cobro) {
        $refBuscar = $referencia_reconstruida ?? $reference;
        $stmtInv = $pdo->prepare(
            "SELECT id, monto_suscripcion, estado, pago_auth_code
               FROM invitaciones_colegio WHERE pago_referencia = ? LIMIT 1"
        );
        $stmtInv->execute([$refBuscar]);
        $inv = $stmtInv->fetch();

        if ($inv) {
            // Idempotencia: mismo criterio que el bloque de cobros de abajo.
            if ($inv['estado'] === 'pagado' || $inv['estado'] === 'aprobada') {
                if ($inv['pago_auth_code'] === $auth) {
                    responder_liga(true, 'Ya estaba confirmado (reintento idempotente)');
                }
                responder_liga(true, 'Suscripción ya confirmada previamente');
            }
            if ($response !== 'approved') {
                if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, "❌ LIGA SUSCRIPCIÓN rechazada | ref:{$refBuscar} response:{$response} nb_error:{$nb_error}");
                responder_liga(true, 'Pago de suscripción no aprobado, registrado');
            }
            if ($amount === null || floatval($amount) <= 0) {
                if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, "❌ LIGA SUSCRIPCIÓN sin monto válido | ref:{$refBuscar}");
                responder_liga(false, 'Falta el monto pagado (amount)');
            }
            $monto_recibido_susc = floatval($amount);
            if (abs($monto_recibido_susc - floatval($inv['monto_suscripcion'])) > 0.01) {
                if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, "❌ LIGA SUSCRIPCIÓN monto no coincide | invitacion:{$inv['id']} esperado:{$inv['monto_suscripcion']} recibido:{$monto_recibido_susc}");
                responder_liga(false, 'El monto pagado no coincide con el plan elegido');
            }

            $pdo->prepare(
                "UPDATE invitaciones_colegio
                    SET estado = 'pagado', pago_auth_code = ?, pagado_en = NOW()
                  WHERE id = ?"
            )->execute([$auth ?: $foliocpagos, $inv['id']]);

            log_api_liga("LIGA SUSCRIPCIÓN confirmada -> invitacion_id:{$inv['id']} ref:{$refBuscar} auth:{$auth}");
            responder_liga(true, 'Pago de suscripción confirmado');
        }
    }

    // Tercera posibilidad: pago de RENOVACION de una escuela ya activa
    // (distinto del pago de suscripcion NUEVA de arriba, que es solo para
    // colegios en registro). Antes renovar era 100% manual -- el superadmin
    // movia la fecha de vencimiento sin que hubiera ningun cobro real de por
    // medio. Ahora, si el pago coincide con una referencia de renovacion en
    // curso, la fecha de vencimiento se extiende SOLA.
    if (!$cobro) {
        $refBuscarEsc = $referencia_reconstruida ?? $reference;
        $stmtEsc = $pdo->prepare(
            "SELECT id, nombre, plan, fecha_vencimiento_plan, pago_renovacion_monto
               FROM escuelas WHERE pago_renovacion_referencia = ? LIMIT 1"
        );
        $stmtEsc->execute([$refBuscarEsc]);
        $escRenov = $stmtEsc->fetch();

        if ($escRenov) {
            if ($response !== 'approved') {
                if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, "❌ LIGA RENOVACIÓN rechazada | ref:{$refBuscarEsc} response:{$response} nb_error:{$nb_error}");
                responder_liga(true, 'Pago de renovación no aprobado, registrado');
            }
            if ($amount === null || floatval($amount) <= 0) {
                if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, "❌ LIGA RENOVACIÓN sin monto válido | ref:{$refBuscarEsc}");
                responder_liga(false, 'Falta el monto pagado (amount)');
            }
            $montoRecibidoRenov = floatval($amount);
            if (abs($montoRecibidoRenov - floatval($escRenov['pago_renovacion_monto'])) > 0.01) {
                if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, "❌ LIGA RENOVACIÓN monto no coincide | escuela:{$escRenov['id']} esperado:{$escRenov['pago_renovacion_monto']} recibido:{$montoRecibidoRenov}");
                responder_liga(false, 'El monto pagado no coincide con el plan');
            }

            // Un mes calendario desde el vencimiento actual si sigue vigente,
            // o desde hoy si ya venció -- mismo criterio que renovar_suscripcion.php,
            // para no premiar ni penalizar por pagar antes o después de tiempo.
            $baseRenov = $escRenov['fecha_vencimiento_plan'];
            if (!$baseRenov || strtotime($baseRenov) < strtotime(date('Y-m-d'))) $baseRenov = date('Y-m-d');
            $nuevoVencimiento = siguiente_vencimiento_mensual($baseRenov);

            $pdo->prepare(
                "UPDATE escuelas
                    SET fecha_vencimiento_plan = ?, ultimo_recordatorio_plan = NULL,
                        pago_renovacion_referencia = NULL, pago_renovacion_folio = NULL, pago_renovacion_monto = NULL
                  WHERE id = ?"
            )->execute([$nuevoVencimiento, $escRenov['id']]);

            registrar_log($pdo, ['user_id' => null, 'rol' => 'sistema'], 'suscripcion_renovada_automatico',
                "Escuela '{$escRenov['nombre']}' #{$escRenov['id']}: pago detectado, vencimiento -> {$nuevoVencimiento}",
                $escRenov['id']);

            log_api_liga("LIGA RENOVACIÓN confirmada -> escuela_id:{$escRenov['id']} ref:{$refBuscarEsc} auth:{$auth} nuevo_vencimiento:{$nuevoVencimiento}");
            responder_liga(true, 'Renovación confirmada, suscripción extendida');
        }
    }

    // Cuarta posibilidad: pago AGRUPADO desde Portal Familia (varios cobros
    // pendientes del mismo alumno pagados juntos, ver
    // acciones/iniciar_pago_agrupado.php). Al confirmarse, TODOS los cobros
    // originales del grupo pasan a pagado, no solo un cobro suelto.
    if (!$cobro) {
        $refBuscarGrp = $referencia_reconstruida ?? $reference;
        $stmtGrp = $pdo->prepare(
            "SELECT id, cliente_id, escuela_id, total, estado, auth_code
               FROM cobros_agrupados WHERE referencia = ? LIMIT 1"
        );
        $stmtGrp->execute([$refBuscarGrp]);
        $grp = $stmtGrp->fetch();

        if ($grp) {
            if ($grp['estado'] === 'pagado') {
                if ($grp['auth_code'] === $auth) {
                    responder_liga(true, 'Ya estaba confirmado (reintento idempotente)');
                }
                responder_liga(true, 'Pago agrupado ya confirmado previamente');
            }
            if ($response !== 'approved') {
                if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, "❌ LIGA AGRUPADA rechazada | ref:{$refBuscarGrp} response:{$response} nb_error:{$nb_error}");
                responder_liga(true, 'Pago agrupado no aprobado, registrado');
            }
            if ($amount === null || floatval($amount) <= 0) {
                if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, "❌ LIGA AGRUPADA sin monto válido | ref:{$refBuscarGrp}");
                responder_liga(false, 'Falta el monto pagado (amount)');
            }
            $montoRecibidoGrp = floatval($amount);
            if (abs($montoRecibidoGrp - floatval($grp['total'])) > 0.01) {
                if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, "❌ LIGA AGRUPADA monto no coincide | agrupado:{$grp['id']} esperado:{$grp['total']} recibido:{$montoRecibidoGrp}");
                responder_liga(false, 'El monto pagado no coincide con el grupo');
            }

            $pdo->beginTransaction();
            try {
                $pdo->prepare("UPDATE cobros_agrupados SET estado = 'pagado', auth_code = ?, pagado_en = NOW() WHERE id = ?")
                    ->execute([$auth ?: $foliocpagos, $grp['id']]);

                // Cada cobro individual del grupo pasa a pagado, con el mismo
                // auth_code y metodo -- se ven en Historial igual que
                // cualquier otro cobro pagado, solo que comparten referencia.
                $stmtDetalle = $pdo->prepare(
                    "SELECT cobro_id FROM cobros_agrupados_detalle WHERE cobro_agrupado_id = ?"
                );
                $stmtDetalle->execute([$grp['id']]);
                $idsDetalle = array_column($stmtDetalle->fetchAll(), 'cobro_id');

                if ($idsDetalle) {
                    $inPlaceholders = implode(',', array_fill(0, count($idsDetalle), '?'));
                    $pdo->prepare(
                        "UPDATE cobros SET estado = 'pagado', auth_code = ?, referencia = ?
                          WHERE id IN ($inPlaceholders)"
                    )->execute(array_merge([$auth ?: $foliocpagos, $refBuscarGrp], $idsDetalle));
                }

                if (!empty($grp['cliente_id'])) {
                    recalcular_saldo_pendiente($pdo, intval($grp['cliente_id']));
                }

                $pdo->commit();
            } catch (\Throwable $e) {
                $pdo->rollBack();
                if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, "❌ ERROR confirmando LIGA AGRUPADA: " . $e->getMessage());
                responder_liga(false, 'Error de sistema');
            }

            log_api_liga("LIGA AGRUPADA confirmada -> agrupado_id:{$grp['id']} ref:{$refBuscarGrp} auth:{$auth} cobros:" . implode(',', $idsDetalle));
            responder_liga(true, 'Pago agrupado confirmado, ' . count($idsDetalle) . ' conceptos pagados');
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

    $pdo->prepare("UPDATE cobros SET estado = 'pagado', metodo = 'TC', auth_code = ?, cc_mask = ?, cc_type = ?, pago_email = ? WHERE id = ?")
        ->execute([$auth ?: $foliocpagos, $cc_mask ?: null, $cc_type ?: null, $pago_email ?: null, $cobro['id']]);

    // Recalcular saldo_pendiente del cliente vinculado (mismo patrón que confirmar_pago).
    if (!empty($cobro['cliente_id'])) {
        recalcular_saldo_pendiente($pdo, intval($cobro['cliente_id']));

        // Tokenización para CAI: solo si Pagalaescuela mandó un token válido.
        // cc_mask/cc_type también se guardan aquí (no solo en el cobro): es la
        // única forma de mostrar "tarjeta terminada en ****" en la UI sin
        // tener que ir a buscar el cobro que la originó.
        if ($number_tkn) {
            $pdo->prepare(
                "UPDATE clientes SET token_tarjeta = ?, token_tarjeta_expmes = ?, token_tarjeta_expanio = ?, token_tarjeta_estado = 'activo', token_tarjeta_mask = ?, token_tarjeta_tipo = ? WHERE id = ?"
            )->execute([$number_tkn, $cc_expmonth, $cc_expyear, $cc_mask ?: null, $cc_type ?: null, $cobro['cliente_id']]);
        }
    }

    $pdo->commit();

    log_api_liga("LIGA confirmada -> cobro_id:{$cobro['id']} ref:{$reference} auth:{$auth} tarjeta:" . ($cc_mask ?: 's/d') . " tokenizado:" . ($number_tkn ? 'sí' : 'no'));
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
