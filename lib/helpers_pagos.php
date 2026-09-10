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
require_once __DIR__ . '/mailer.php';

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
// Construye el Reference del pago.
//
// La doc (IntegracionesCAI_V1_1, pags. 4, 9 y 13) pide Numerico (13):
//     000000000 + 0000  =  9 digitos del alumno + 4 del pago
//
// PERO esta cuenta rechaza 13 digitos con codigo 22 ("El formato de la
// referencia es incorrecto") — probado el 27-ago-2026, MIENTRAS la
// integracion corria en el Sandbox de pagadetodo.mx (workaround temporal,
// ver 5.3aw en PRODUCCION.md). Desde el 2026-09-08 corre en produccion real
// contra pagalaescuela.mx (el dominio que la doc original de mayo 2022 sí
// describe) — el formato de 15 digitos NO se ha vuelto a probar contra el
// validador de producción real; si algún cobro real regresa código 22, este
// es el primer lugar a revisar.
//
// Ademas hay una restriccion propia: webhook_liga.php reconstruye nuestra
// referencia a partir de los ULTIMOS 9 DIGITOS del codigo envuelto que
// devuelve el proveedor. Si la parte significativa pasa de 9 digitos, el
// webhook ya no encuentra el cobro y el pago se queda sin confirmar.
//
// Por eso la parte con informacion son 9 digitos, dentro de un largo de 15:
//     000000 + 00000 + 0000
//              alumno   pago
//
// Se conserva lo que la doc realmente busca —que la referencia identifique al
// alumno— dentro de lo que esta cuenta acepta. Soporta 99,999 alumnos y
// 9,999 pagos por alumno.
function construir_referencia_pago(PDO $pdo, $clienteId): string
{
    $largoTotal = defined('REFERENCIA_DIGITOS') ? intval(REFERENCIA_DIGITOS) : 15;
    if ($largoTotal < 13) $largoTotal = 13;

    // Sin cliente (cobro general) se usa 0 en el bloque de alumno.
    $alumno = str_pad(strval(max(0, intval($clienteId)) % 100000), 5, '0', STR_PAD_LEFT);

    // Bug real (reportado: "pago, salgo, reintento — a la 2a/3a vez falla con
    // 'la referencia es única e irrepetible'"): el consecutivo se calculaba
    // contando cuántas filas de `cobros` de este cliente tienen referencia no
    // vacía. Pero generar_liga.php/cobrar_via_token SOBRESCRIBEN la referencia
    // del MISMO cobro pendiente en cada reintento (no insertan una fila
    // nueva) — así que ese conteo nunca avanzaba más allá de 1, y cada
    // reintento recalculaba una referencia que YA se le había mandado al
    // proveedor en un intento anterior (localmente "olvidada" al
    // sobrescribirse, pero el proveedor la recuerda para siempre: por eso
    // rechazaba con su código 23). Se reemplaza por el tiempo actual —nunca
    // se "olvida" ni se puede repetir sin importar cuántas veces se
    // sobrescriba `cobros.referencia`— y se deja el ciclo de abajo como
    // respaldo si por casualidad coincidiera con algo ya usado localmente.
    $desde = (intval(time()) % 10000) + 1;

    // La doc exige que sea unica e irrepetible (codigo 23): se avanza el
    // consecutivo hasta dar con uno que no exista ya.
    $chk = $pdo->prepare("SELECT 1 FROM cobros WHERE referencia = ? LIMIT 1");
    for ($i = 0; $i < 500; $i++) {
        $pago = str_pad(strval(($desde + $i) % 10000), 4, '0', STR_PAD_LEFT);
        $ref  = str_pad($alumno . $pago, $largoTotal, '0', STR_PAD_LEFT);
        $chk->execute([$ref]);
        if (!$chk->fetch()) return $ref;
    }
    $pago = str_pad(strval(mt_rand(0, 9999)), 4, '0', STR_PAD_LEFT);
    return str_pad($alumno . $pago, $largoTotal, '0', STR_PAD_LEFT);
}
// Igual que construir_referencia_pago(), pero para cobros que NO viven en la
// tabla `cobros` -- hoy solo el pago de suscripcion durante el registro de un
// colegio (invitaciones_colegio), antes de que exista un escuela_id real.
// Revisa unicidad en AMBAS tablas: una referencia de suscripcion nunca debe
// coincidir con una de cobros normales, ni con otra de suscripcion.
function construir_referencia_pago_generico(PDO $pdo, $idEntidad): string
{
    $largoTotal = defined('REFERENCIA_DIGITOS') ? intval(REFERENCIA_DIGITOS) : 15;
    if ($largoTotal < 13) $largoTotal = 13;

    $bloque = str_pad(strval(max(0, intval($idEntidad)) % 100000), 5, '0', STR_PAD_LEFT);
    $desde  = (intval(time()) % 10000) + 1;

    $chkCobros = $pdo->prepare("SELECT 1 FROM cobros WHERE referencia = ? LIMIT 1");
    $chkInv    = $pdo->prepare("SELECT 1 FROM invitaciones_colegio WHERE pago_referencia = ? LIMIT 1");
    for ($i = 0; $i < 500; $i++) {
        $pago = str_pad(strval(($desde + $i) % 10000), 4, '0', STR_PAD_LEFT);
        $ref  = str_pad($bloque . $pago, $largoTotal, '0', STR_PAD_LEFT);
        $chkCobros->execute([$ref]);
        if ($chkCobros->fetch()) continue;
        $chkInv->execute([$ref]);
        if ($chkInv->fetch()) continue;
        return $ref;
    }
    $pago = str_pad(strval(mt_rand(0, 9999)), 4, '0', STR_PAD_LEFT);
    return str_pad($bloque . $pago, $largoTotal, '0', STR_PAD_LEFT);
}

function cobrar_via_token(PDO $pdo, int $cobroId, int $clienteId, float $total, string $token, $expMes, $expAnio): array
{
    if ($total < 50 || $total > 15000) {
        return ['success' => false, 'error' => 'Monto fuera de rango ($50.00 - $15,000.00)'];
    }
    // NOTA: aquí vivía un candado que exigía clientes.autorizacion_cai_estado
    // = 'firmada' (autorización firmada por DocuSign) antes de cobrar — se
    // quitó a petición del usuario mientras se decide cómo/cuándo implementar
    // la firma de verdad. El esqueleto queda listo sin usar: migración
    // migracion_2026_08_28_autorizacion_firmada_cai.sql, lib/docusign_helper.php,
    // acciones/iniciar_firma_cai.php, webhooks/webhook_docusign.php. Para
    // reactivar el candado, restaurar el bloque que consultaba
    // autorizacion_cai_estado aquí (ver PRODUCCION.md 5.3ar).
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
    // Reservar la referencia YA, antes de mandarla al proveedor — no hasta
    // que el cargo tenga éxito. Bug real de producción (2026-08-28): si el
    // intento falla, construir_referencia_pago() nunca se enteraba y volvía a
    // proponer la MISMA referencia en el siguiente reintento — el proveedor
    // sí la recuerda desde el primer intento y la rechaza como duplicada
    // ("La referencia es única e irrepetible"). Mismo fix que generar_liga.php.
    $pdo->prepare("UPDATE cobros SET referencia = ? WHERE id = ?")->execute([$ref, $cobroId]);
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
    // Evidencia del pago: antes se descartaba por completo (cc_number/cc_type
    // no se leían de $tx ni se guardaban en ningún lado) — sin esto no hay
    // forma de confirmar "qué tarjeta terminada en qué dígitos" se cobró.
    // El campo se llama cc_number en la doc de este endpoint (Servicio de
    // pago por domiciliación), pero ya viene como el valor enmascarado
    // (ej. "1111"), no el número completo.
    $ccMask = trim((string) ($tx['cc_number'] ?? ''));
    $ccType = trim((string) ($tx['cc_type'] ?? ''));

    // referencia ya se guardó arriba (antes de llamar al proveedor) — aquí
    // solo falta marcar el cobro como pagado con el resto de la evidencia.
    $pdo->prepare("UPDATE cobros SET estado = 'pagado', metodo = 'TC', auth_code = ?, cc_mask = ?, cc_type = ? WHERE id = ?")
        ->execute([$tx['auth'] ?? null, $ccMask ?: null, $ccType ?: null, $cobroId]);
    if ($ccMask || $ccType) {
        $pdo->prepare("UPDATE clientes SET token_tarjeta_mask = ?, token_tarjeta_tipo = ? WHERE id = ?")
            ->execute([$ccMask ?: null, $ccType ?: null, $clienteId]);
    }
    recalcular_saldo_pendiente($pdo, $clienteId);
    // Antes el exito NO dejaba rastro: solo se registraba el fallo, asi que
    // la unica forma de saber si un cargo habia pasado era su ausencia en el
    // log. Ahora se registra igual que el fallo, con el codigo de autorizacion.
    log_api("cobrar_via_token OK -> cobro={$cobroId} cliente={$clienteId} total={$total} ref={$ref} auth=" . ($tx['auth'] ?? 'sin-auth'));

    // Correo de confirmación al titular — antes SOLO lo mandaba el cron de
    // cargos automáticos (cron_recordatorios.php), así que un cobro MANUAL
    // (botón "Tarjeta guardada" en Caja.js/PortalFamilia.js) no avisaba a
    // nadie. Se centraliza aquí para que ambos caminos avisen por igual, sin
    // duplicar el texto del correo en dos archivos distintos.
    try {
        $stmtDest = $pdo->prepare(
            "SELECT cl.nombre AS cliente_nombre, cl.email AS cliente_email, fa.email AS familia_email
               FROM clientes cl LEFT JOIN familias fa ON fa.id = cl.familia_id
              WHERE cl.id = ?"
        );
        $stmtDest->execute([$clienteId]);
        $dest = $stmtDest->fetch();
        $destinoEmail = $dest ? ($dest['cliente_email'] ?: $dest['familia_email']) : null;
        if ($destinoEmail) {
            $totalFmt = '$' . number_format($total, 2) . ' MXN';
            $tarjetaTxt = $ccMask ? " (tarjeta terminada en {$ccMask})" : '';
            $rCorreo = enviar_correo(
                $destinoEmail,
                'Se cobró tu pago automático',
                "<p>Hola,</p>
                 <p>Se realizó un cargo de <strong>{$totalFmt}</strong> a tu tarjeta guardada{$tarjetaTxt} para "
                 . htmlspecialchars($dest['cliente_nombre'] ?? '') . ".</p>
                 <p>— Pagalaescuela</p>"
            );
            // enviar_correo() solo deja rastro en CORREOS_LOG_FILE cuando
            // FALLA — un envío exitoso no dejaba ninguna línea en ningún lado,
            // así que no había forma directa de comprobar "sí se mandó" salvo
            // que llegara a la bandeja real. Se deja constancia explícita
            // aquí también, para que sea fácil de verificar sin depender de
            // revisar el correo de alguien más.
            log_api('cobrar_via_token: correo de confirmación a ' . $destinoEmail
                . ' -> ' . (!empty($rCorreo['success']) ? 'OK' : ('FALLÓ: ' . ($rCorreo['error'] ?? 'desconocido'))));
        }
    } catch (\Throwable $eMail) {
        log_api('cobrar_via_token: no se pudo mandar el correo de confirmación -> ' . $eMail->getMessage());
    }

    return ['success' => true, 'auth' => $tx['auth'] ?? null, 'raw' => $raw];
}
