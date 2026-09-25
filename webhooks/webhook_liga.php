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
    __DIR__ . '/../logs/debug_webhook.txt',
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
        __DIR__ . '/../logs/webhook_log.txt',
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
    // escuela_id va en el SELECT porque las filas de pagos_no_aplicados que se
    // escriben más abajo lo necesitan para quedar atribuidas a un colegio; sin
    // él, un admin no veía en su panel los avisos de sus propios cobros.
    $stmt = $pdo->prepare("SELECT id, cliente_id, escuela_id, total, estado, auth_code FROM cobros WHERE referencia = ? ORDER BY id DESC LIMIT 1");
    $stmt->execute([$reference]);
    $cobro = $stmt->fetch();

    // Cobroscontarjeta.com no regresa nuestra Reference original tal cual: la
    // envuelve como PLE_SCHOOL_ID_ACTIVO (su propio identificador de comercio,
    // "000002" en producción) + NUESTRA referencia completa intacta + relleno
    // de ceros a la derecha hasta completar el ancho fijo de su campo. Si el
    // match exacto falla, la reconstruimos leyendo justo esos
    // REFERENCIA_DIGITOS caracteres inmediatamente después del prefijo.
    //
    // CORREGIDO 21-sep-2026 (bug real en producción, pago aprobado por el
    // banco que se quedó "pendiente" para siempre): el heurístico anterior
    // tomaba los últimos 9 dígitos antes de 1 dígito de cola, asumiendo un
    // relleno fijo de 1 dígito. Eso coincidía por casualidad con el formato
    // viejo de 15 dígitos ("000000182222901" volvía como
    // "0000020000001822229011", relleno real de 1 dígito), pero con el
    // formato actual de 13 dígitos el relleno real resultó ser de 3 dígitos,
    // no de 1: nuestra "0000000014901" volvió como
    // "0000020000000014901002" (prefijo "000002" + los 13 dígitos intactos +
    // relleno "002"). El heurístico anterior reconstruía
    // "0000001490100" (2 ceros de más) en vez de "0000000014901", nunca
    // hacía match, y el cobro se registraba como "LIGA HUÉRFANA" pese a que
    // el pago sí se había cobrado de verdad. Anclar la extracción al
    // prefijo fijo (conocido, viene de nuestra propia config) en vez de
    // contar posiciones desde el final ya no depende de cuántos dígitos de
    // relleno use el proveedor.
    if (!$cobro && strpos($reference, PLE_SCHOOL_ID_ACTIVO) === 0
        && strlen($reference) >= strlen(PLE_SCHOOL_ID_ACTIVO) + REFERENCIA_DIGITOS) {
        $referencia_reconstruida = substr($reference, strlen(PLE_SCHOOL_ID_ACTIVO), REFERENCIA_DIGITOS);
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
            "SELECT id, escuela_id, plan_elegido, monto_suscripcion, estado, pago_auth_code
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
            // Blindaje (11-sep-2026, hallado en revisión adversarial): una
            // invitación rechazada/cancelada/expirada no debe revivirse a
            // 'pagado' -- antes solo se excluían 'pagado'/'aprobada' y este
            // pago (real, ya cobrado por el proveedor) habría quedado listo
            // para que invitacion_resolver.php la aprobara pese al rechazo.
            if (in_array($inv['estado'], ['rechazada', 'cancelada', 'expirada'], true)) {
                if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, "⚠ LIGA SUSCRIPCIÓN para invitación {$inv['estado']} -> invitacion:{$inv['id']} ref:{$refBuscar} auth:{$auth} (pago recibido pero NO se revive la invitación, requiere revisión manual)");
                responder_liga(true, 'Invitación ya cerrada, pago recibido para revisión manual');
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
                registrar_pago_no_aplicado($pdo, [
                    'canal'          => 'tarjeta',
                    'motivo'         => 'monto_no_coincide',
                    'referencia'     => $refBuscar,
                    'transaccion'    => $foliocpagos,
                    'auth_code'      => $auth,
                    'monto_recibido' => $monto_recibido_susc,
                    'monto_esperado' => floatval($inv['monto_suscripcion']),
                    'payload_raw'    => $raw,
                ]);
                responder_liga(false, 'El monto pagado no coincide con el plan elegido');
            }

            // Primera mensualidad al historial. El colegio YA existe en este
            // punto: acciones/invitacion_enviar.php lo crea al recibir el
            // formulario y deja invitaciones_colegio.escuela_id apuntando a él,
            // y solo después se cobra. Si aun así viniera sin escuela_id, la
            // función descarta la fila sola en vez de fallar.
            registrar_pago_suscripcion($pdo, [
                'escuela_id' => $inv['escuela_id'],
                'origen'     => 'registro',
                'metodo'     => 'TC',
                'plan'       => $inv['plan_elegido'],
                'monto'      => $inv['monto_suscripcion'],
                'referencia' => $refBuscar,
                'auth_code'  => $auth ?: $foliocpagos,
            ]);

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
            "SELECT id, nombre, email, plan, fecha_vencimiento_plan, pago_renovacion_monto,
                    pago_renovacion_folio, pago_renovacion_plan, modo, fecha_fin_prueba
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
                registrar_pago_no_aplicado($pdo, [
                    'canal'          => 'tarjeta',
                    'motivo'         => 'monto_no_coincide',
                    'referencia'     => $refBuscarEsc,
                    'transaccion'    => $foliocpagos,
                    'auth_code'      => $auth,
                    'monto_recibido' => $montoRecibidoRenov,
                    'monto_esperado' => floatval($escRenov['pago_renovacion_monto']),
                    'escuela_id'     => $escRenov['id'],
                    'payload_raw'    => $raw,
                ]);
                responder_liga(false, 'El monto pagado no coincide con el plan');
            }

            // Modo demo: la fecha de inicio de la suscripción es SIEMPRE la
            // fecha en que se confirma el pago -- los días de prueba
            // restantes NO se acumulan, extienden ni suman al periodo
            // contratado (aclaración del cliente, 11-sep-2026). La
            // fecha_vencimiento_plan de una escuela en demo es solo un
            // placeholder de su creación, nunca una suscripción real que
            // haya que respetar.
            $enDemo = ($escRenov['modo'] ?? 'activa') === 'demo';
            if ($enDemo) {
                $baseRenov = date('Y-m-d');
            } else {
                // Un mes calendario desde el vencimiento actual si sigue vigente,
                // o desde hoy si ya venció -- mismo criterio que renovar_suscripcion.php,
                // para no premiar ni penalizar por pagar antes o después de tiempo.
                $baseRenov = $escRenov['fecha_vencimiento_plan'];
                if (!$baseRenov || strtotime($baseRenov) < strtotime(date('Y-m-d'))) $baseRenov = date('Y-m-d');
            }
            $nuevoVencimiento = siguiente_vencimiento_mensual($baseRenov);

            // Se guarda el pago en el historial ANTES del UPDATE de abajo, que
            // es justo el que pone en NULL monto, referencia y folio. Si se
            // hiciera después, ya no habría nada que guardar — ese era el
            // motivo de que no existiera historial de suscripción.
            registrar_pago_suscripcion($pdo, [
                'escuela_id'  => $escRenov['id'],
                'origen'      => 'renovacion',
                'metodo'      => 'TC',
                'plan'        => ($escRenov['pago_renovacion_plan'] ?: $escRenov['plan']),
                'monto'       => $escRenov['pago_renovacion_monto'],
                'referencia'  => $refBuscarEsc,
                'folio'       => $escRenov['pago_renovacion_folio'],
                'auth_code'   => isset($auth) ? $auth : null,
                'cubre_desde' => $baseRenov,
                'cubre_hasta' => $nuevoVencimiento,
            ]);

            $pdo->prepare(
                // El plan elegido al pagar se aplica AQUÍ, al confirmarse el
                // cobro — nunca al generarlo (22-sep-2026, ver la nota en
                // acciones/escuela_generar_pago_renovacion.php). COALESCE:
                // si el pago no traía plan elegido, la escuela renueva con el
                // que ya tenía.
                //
                // pago_renovacion_plan se limpia junto con el resto de las
                // columnas del cobro: es parte del pago en curso, y dejarlo
                // haría que el próximo cobro heredara una intención vieja.
                "UPDATE escuelas
                    SET fecha_vencimiento_plan = ?, ultimo_recordatorio_plan = NULL,
                        plan = COALESCE(NULLIF(pago_renovacion_plan, ''), plan),
                        pago_renovacion_referencia = NULL, pago_renovacion_folio = NULL, pago_renovacion_monto = NULL,
                        pago_renovacion_plan = NULL,
                        modo = 'activa', fecha_fin_prueba = NULL
                  WHERE id = ?"
            )->execute([$nuevoVencimiento, $escRenov['id']]);

            registrar_log($pdo, ['user_id' => null, 'rol' => 'sistema'], 'suscripcion_renovada_automatico',
                "Escuela '{$escRenov['nombre']}' #{$escRenov['id']}: pago detectado, vencimiento -> {$nuevoVencimiento}",
                $escRenov['id']);

            // Correo de confirmación al colegio -- antes la renovación quedaba
            // registrada solo en el log del sistema, sin avisar a nadie. Mismos
            // destinatarios que el aviso de vencimiento próximo (cron_recordatorios.php):
            // el correo de contacto de la escuela + sus admins activos.
            try {
                $destinatarios = [];
                if (!empty($escRenov['email'])) $destinatarios[] = $escRenov['email'];
                $stmtAdmins = $pdo->prepare("SELECT email FROM usuarios WHERE escuela_id = ? AND rol = 'admin' AND activo = 1");
                $stmtAdmins->execute([$escRenov['id']]);
                foreach ($stmtAdmins->fetchAll() as $a) $destinatarios[] = $a['email'];
                $destinatarios = array_values(array_unique(array_filter($destinatarios)));

                if ($destinatarios) {
                    $fechaFmtRenov = date('d/m/Y', strtotime($nuevoVencimiento));
                    $rCorreoRenov = enviar_correo(
                        $destinatarios,
                        'Tu suscripción de Pagalaescuela fue renovada',
                        "<p>Hola,</p>
                         <p>Se confirmó el pago de renovación de la suscripción de <strong>" . htmlspecialchars($escRenov['nombre']) . "</strong>.</p>
                         <p>Tu nueva fecha de vencimiento es <strong>{$fechaFmtRenov}</strong>.</p>
                         <p>— Equipo Pagalaescuela</p>"
                    );
                    log_api_liga('LIGA RENOVACIÓN: correo de confirmación a ' . implode(',', $destinatarios)
                        . ' -> ' . (!empty($rCorreoRenov['success']) ? 'OK' : ('FALLÓ: ' . ($rCorreoRenov['error'] ?? 'desconocido'))));
                } else {
                    log_api_liga("LIGA RENOVACIÓN: escuela #{$escRenov['id']} sin correo de contacto ni admin activo, se omite aviso de renovación.");
                }
            } catch (\Throwable $eMailRenov) {
                log_api_liga('LIGA RENOVACIÓN: no se pudo mandar el correo de confirmación -> ' . $eMailRenov->getMessage());
            }

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
                registrar_pago_no_aplicado($pdo, [
                    'canal'          => 'tarjeta',
                    'motivo'         => 'monto_no_coincide',
                    'referencia'     => $refBuscarGrp,
                    'transaccion'    => $foliocpagos,
                    'auth_code'      => $auth,
                    'monto_recibido' => $montoRecibidoGrp,
                    'monto_esperado' => floatval($grp['total']),
                    'cliente_id'     => $grp['cliente_id'] ?? null,
                    'escuela_id'     => $grp['escuela_id'] ?? null,
                    'payload_raw'    => $raw,
                ]);
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

                // El importe cobrado se REPARTE como abonos, cobro por cobro
                // (22-sep-2026), igual que en pago_referencia.php.
                //
                // Antes esto liquidaba de golpe con monto_pagado = total contra
                // el total CONGELADO en cobros_agrupados al generar la liga. La
                // liga vive días, así que cualquier abono que entrara mientras
                // tanto se cobraba dos veces y el monto_pagado = total borraba
                // la evidencia. (Ese monto_pagado = total lo puse yo mismo hoy
                // para sostener el invariante; sostenerlo así resultó ser el
                // error — quien lo sostiene bien es el reparto, que además
                // escribe el renglón en el libro mayor.)
                $sobranteGrpTC = 0.0;
                if ($idsDetalle) {
                    $inPlaceholders = implode(',', array_fill(0, count($idsDetalle), '?'));
                    // aplicar_abono_a_cobro() exige los cobros bloqueados.
                    $pdo->prepare("SELECT id FROM cobros WHERE id IN ($inPlaceholders) FOR UPDATE")
                        ->execute($idsDetalle);

                    $restanteGrpTC = floatval($grp['total']);
                    $llaveGrpTC    = false;
                    foreach ($idsDetalle as $cidGrpTC) {
                        if ($restanteGrpTC <= 0.004) break;
                        $datosGrpTC = [
                            'metodo'      => 'TC',
                            'referencia'  => $refBuscarGrp,
                            'transaccion' => $foliocpagos,
                            'auth_code'   => $auth,
                            'origen'      => 'webhook_liga',
                        ];
                        if ($llaveGrpTC) $datosGrpTC['sin_idem'] = true;
                        $rGrpTC = aplicar_abono_a_cobro($pdo, intval($cidGrpTC), $restanteGrpTC, $datosGrpTC);
                        if ($rGrpTC['aplicado'] > 0) {
                            $llaveGrpTC    = true;
                            $restanteGrpTC = round($restanteGrpTC - $rGrpTC['aplicado'], 2);
                        }
                    }
                    $sobranteGrpTC = round($restanteGrpTC, 2);

                    // metodo = 'TC' (10-sep-2026): el comentario de arriba ya decía
                    // "con el mismo auth_code y metodo" pero el UPDATE nunca lo ponía
                    // -- cobros.metodo se quedaba vacío para todo pago agrupado con
                    // tarjeta, así que la gráfica de "por método" (Dashboard/Reportes)
                    // los perdía en "Otro / sin método" en vez de "Tarjeta". El
                    // estado y el monto_pagado ya los movió el reparto.
                    $pdo->prepare(
                        "UPDATE cobros SET metodo = 'TC',
                                           auth_code = COALESCE(NULLIF(auth_code, ''), ?),
                                           referencia = ?
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

            log_api_liga("LIGA AGRUPADA confirmada -> agrupado_id:{$grp['id']} ref:{$refBuscarGrp} auth:{$auth} cobros:" . implode(',', $idsDetalle) . ($sobranteGrpTC > 0.004 ? " SOBRANTE:{$sobranteGrpTC}" : ''));

            // Sobrante: se cobró más de lo que los cobros del grupo debían hoy,
            // normalmente porque entró un abono entre la generación de la liga y
            // su pago. Queda registrado para que el colegio lo resuelva.
            // Después del commit, regla 1 de registrar_pago_no_aplicado.
            if ($sobranteGrpTC > 0.004) {
                registrar_pago_no_aplicado($pdo, [
                    'canal'          => 'tarjeta',
                    'motivo'         => 'sobrepago',
                    'referencia'     => $refBuscarGrp,
                    'transaccion'    => $foliocpagos !== '' ? $foliocpagos . '-sobrante' : '',
                    'auth_code'      => $auth,
                    'monto_recibido' => $sobranteGrpTC,
                    'monto_esperado' => 0,
                    'cliente_id'     => $grp['cliente_id'] ?? null,
                    'escuela_id'     => $grp['escuela_id'] ?? null,
                    'payload_raw'    => $raw,
                ]);
            }
            responder_liga(true, 'Pago agrupado confirmado, ' . count($idsDetalle) . ' conceptos pagados');
        }
    }



    if (!$cobro) {
        $log_msg = "⚠ LIGA HUÉRFANA | ref:{$reference} folio_cct:{$foliocpagos} response:{$response}";
        if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, $log_msg);
        // Éste es el caso que PRODUCCION.md (5.3ax) dejó marcado como "anomalía
        // a investigar": una liga HUÉRFANA con response:approved significa que
        // el banco SÍ cobró y nosotros no supimos a qué cobro aplicarlo. Hasta
        // hoy solo quedaba esa línea de texto; ahora queda una fila revisable.
        // Se distingue del caso no aprobado, que no mueve dinero.
        registrar_pago_no_aplicado($pdo, [
            'canal'          => 'tarjeta',
            'motivo'         => $response === 'approved' ? 'huerfana_cobrada' : 'huerfana_no_aprobada',
            'referencia'     => $reference,
            'transaccion'    => $foliocpagos,
            'auth_code'      => $auth,
            'monto_recibido' => $amount !== null ? floatval($amount) : 0,
            'payload_raw'    => $raw,
        ]);
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
    $montoDistinto  = abs($monto_recibido - floatval($cobro['total'])) > 0.01;

    $pdo->beginTransaction();

    // ABONOS (21-sep-2026). ANTES: si el monto no coincidía, se rechazaba y el
    // cobro se quedaba pendiente — pero para llegar hasta aquí el pago ya pasó
    // el filtro response==='approved', o sea que EL BANCO YA COBRÓ. Descartar
    // ese aviso era perder el rastro de dinero real (es justo lo que produjo
    // las "LIGA HUÉRFANA con response:approved" que PRODUCCION.md 5.3ax dejó
    // pendientes de investigar). Ahora se aplica como abono.
    //
    // A diferencia de SPEI/efectivo, aquí el importe lo fijamos NOSOTROS al
    // generar la liga, así que una diferencia no es un abono deliberado de la
    // familia: es una anomalía. Se aplica igual (el dinero existe) pero además
    // se deja un aviso en pagos_no_aplicados para que alguien lo revise.
    $resAbono = aplicar_abono_a_cobro($pdo, intval($cobro['id']), $monto_recibido, [
        'metodo'      => 'TC',
        'referencia'  => $reference,
        'transaccion' => $foliocpagos,
        'auth_code'   => $auth,
        'origen'      => 'webhook_liga',
    ]);

    if ($resAbono['duplicado']) {
        $pdo->rollBack();
        log_api_liga("LIGA abono duplicado (idempotente) -> cobro_id:{$cobro['id']} folio_cct:{$foliocpagos}");
        // Mismo criterio que los otros dos webhooks: se confirma para no
        // disparar una devolución, pero queda la fila por si el "duplicado"
        // encubría un cargo real. Los reintentos legítimos se colapsan en un
        // renglón gracias al UNIQUE (canal, transaccion). Después del rollBack.
        registrar_pago_no_aplicado($pdo, [
            'canal'          => 'tarjeta',
            'motivo'         => 'duplicado_idempotente',
            'referencia'     => $reference,
            // '-dup': ver la nota en pago_clabe.php. Sin el sufijo, el UNIQUE
            // (canal, transaccion) haría que este aviso se fundiera con el de
            // otra rama que ya hubiera escrito este mismo foliocpagos.
            'transaccion'    => $foliocpagos !== '' ? $foliocpagos . '-dup' : '',
            'auth_code'      => $auth,
            'monto_recibido' => $monto_recibido,
            'monto_esperado' => floatval($cobro['total']),
            'cliente_id'     => $cobro['cliente_id'] ?? null,
            'cobro_id'       => $cobro['id'],
            'escuela_id'     => $cobro['escuela_id'] ?? null,
            'payload_raw'    => $raw,
        ]);
        responder_liga(true, 'Ya estaba confirmado (reintento idempotente)');
    }

    if ($montoDistinto) {
        if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, "⚠ LIGA monto distinto, se APLICA como abono y se marca para revisión | cobro_id:{$cobro['id']} esperado:{$cobro['total']} recibido:{$monto_recibido}");
        registrar_pago_no_aplicado($pdo, [
            'canal'          => 'tarjeta',
            'motivo'         => $resAbono['sobrante'] > 0.004 ? 'sobrepago' : 'monto_distinto_aplicado',
            'referencia'     => $reference,
            'transaccion'    => $foliocpagos !== '' ? $foliocpagos . '-rev' : '',
            'auth_code'      => $auth,
            'monto_recibido' => $monto_recibido,
            'monto_esperado' => floatval($cobro['total']),
            'cliente_id'     => $cobro['cliente_id'] ?? null,
            'cobro_id'       => $cobro['id'],
            'payload_raw'    => $raw,
        ]);
    }

    // El estado lo decidió aplicar_abono_a_cobro(): solo queda 'pagado' si el
    // abono cubrió el total. Aquí solo se guarda la evidencia del cargo.
    $pdo->prepare("UPDATE cobros SET metodo = 'TC', auth_code = ?, cc_mask = ?, cc_type = ?, pago_email = ? WHERE id = ?")
        ->execute([$auth ?: $foliocpagos, $cc_mask ?: null, $cc_type ?: null, $pago_email ?: null, $cobro['id']]);

    // Recalcular saldo_pendiente del cliente vinculado (mismo patrón que confirmar_pago).
    if (!empty($cobro['cliente_id'])) {
        recalcular_saldo_pendiente($pdo, intval($cobro['cliente_id']));

        // Tokenización para CAI: solo si Pagalaescuela mandó un token válido
        // Y la domiciliación está HABILITADA para esta escuela (22-sep-2026).
        //
        // Antes bastaba con que el proveedor mandara number_tkn: la tarjeta se
        // guardaba y token_tarjeta_estado quedaba en 'activo' aunque el colegio
        // tuviera la domiciliación apagada. De ahí salían los dos correos que
        // no deberían existir — el de cargo recurrente y el aviso de "se va a
        // cobrar a tu tarjeta guardada" — porque el cron busca por
        // token_tarjeta_estado='activo', no por si el método está permitido.
        //
        // Guardar la tarjeta de alguien que no autorizó domiciliación no es un
        // detalle de configuración: es conservar un instrumento de pago sin
        // permiso. Por eso el bloqueo va aquí, en el punto donde se persiste,
        // y no solo en el momento de cobrar.
        //
        // La liga se sigue generando con PLE_URL_LIGA_TOKEN, que tokeniza del
        // lado del proveedor. Existe PLE_URL_LIGA_SIMPLE (GenerarLigaIndi) que
        // no tokeniza, pero su contrato de payload no está verificado contra
        // este proveedor y cambiarlo a ciegas arriesga tumbar todos los pagos
        // con tarjeta. Lo correcto es confirmarlo con Cobroscontarjeta.com y
        // entonces elegir la URL según el método; mientras tanto, lo que no se
        // guarda no se puede cobrar.
        $cai_apagado = metodo_pago_deshabilitado($pdo, intval($cobro['escuela_id'] ?? 0), 'CAI');
        if ($number_tkn && !$cai_apagado) {
            $pdo->prepare(
                "UPDATE clientes SET token_tarjeta = ?, token_tarjeta_expmes = ?, token_tarjeta_expanio = ?, token_tarjeta_estado = 'activo', token_tarjeta_mask = ?, token_tarjeta_tipo = ? WHERE id = ?"
            )->execute([$number_tkn, $cc_expmonth, $cc_expyear, $cc_mask ?: null, $cc_type ?: null, $cobro['cliente_id']]);
        } elseif ($number_tkn && $cai_apagado) {
            // La máscara sí se guarda: sirve para mostrar "terminada en ****"
            // en el historial del pago. Lo que NO se guarda es el token, que es
            // lo único con lo que se podría volver a cobrar.
            $pdo->prepare(
                "UPDATE clientes SET token_tarjeta_mask = ?, token_tarjeta_tipo = ? WHERE id = ?"
            )->execute([$cc_mask ?: null, $cc_type ?: null, $cobro['cliente_id']]);
            log_api_liga("LIGA token DESCARTADO (domiciliación apagada) -> cliente:{$cobro['cliente_id']} escuela:" . ($cobro['escuela_id'] ?? '?'));
        }
    }

    $pdo->commit();

    log_api_liga(
        "LIGA confirmada -> cobro_id:{$cobro['id']} ref:{$reference} auth:{$auth}"
        . " abonado:{$resAbono['aplicado']} cubierto:" . ($resAbono['cubierto'] ? 'si' : 'no')
        . " tarjeta:" . ($cc_mask ?: 's/d') . " tokenizado:" . ($number_tkn ? 'sí' : 'no')
    );
    responder_liga(true, $resAbono['cubierto'] ? 'Pago confirmado' : 'Abono aplicado, cobro parcialmente cubierto');

} catch (\Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) $pdo->rollBack();
    if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, '❌ ERROR webhook_liga: ' . $e->getMessage());
    responder_liga(false, 'Error de sistema');
}

function log_api_liga($msg) {
    if (!API_LOG_ENABLED) return;
    webhook_log(API_LOG_FILE, $msg);
}
