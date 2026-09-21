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
    // SUM(total - monto_pagado), no SUM(total): desde que existen los abonos
    // (migracion_2026_09_21_abonos.sql) un cobro pendiente puede estar
    // parcialmente cubierto, y lo que la familia debe de verdad es el resto.
    // Para todo lo anterior a esa migración monto_pagado vale 0.00 y la
    // fórmula da exactamente el mismo resultado que antes.
    $pdo->prepare(
        "UPDATE clientes SET saldo_pendiente = (
            SELECT COALESCE(SUM(total - monto_pagado), 0) FROM cobros
            WHERE cliente_id = ? AND estado = 'pendiente'
        ) WHERE id = ?"
    )->execute([$cliente_id, $cliente_id]);
}

/**
 * Abona dinero a UN cobro concreto.
 *
 * Debe llamarse DENTRO de una transacción, con el cobro ya bloqueado por el
 * llamador (SELECT ... FOR UPDATE): sin ese bloqueo, dos abonos simultáneos
 * sobre el mismo cobro pueden leer el mismo monto_pagado y perder uno.
 *
 * Idempotencia: si `transaccion` ya existe en cobro_abonos, NO vuelve a
 * abonar. El proveedor reintenta notificaciones, y sin esto un reintento
 * abonaría dos veces el mismo dinero real.
 *
 * @return array{aplicado:float, sobrante:float, cubierto:bool, duplicado:bool}
 */
function aplicar_abono_a_cobro(PDO $pdo, int $cobro_id, float $monto, array $d = []): array
{
    $vacio = ['aplicado' => 0.0, 'sobrante' => round($monto, 2), 'cubierto' => false, 'duplicado' => false];
    if ($monto <= 0) return $vacio;

    $transaccion = trim(strval($d['transaccion'] ?? ''));
    if ($transaccion !== '') {
        $chk = $pdo->prepare("SELECT id FROM cobro_abonos WHERE transaccion_proveedor = ? LIMIT 1");
        $chk->execute([$transaccion]);
        if ($chk->fetch()) {
            $vacio['duplicado'] = true;
            return $vacio;
        }
    }

    $stmt = $pdo->prepare("SELECT id, total, monto_pagado, cliente_id, escuela_id FROM cobros WHERE id = ?");
    $stmt->execute([$cobro_id]);
    $cobro = $stmt->fetch();
    if (!$cobro) return $vacio;

    // Centavos enteros: sumar decimales en float arrastra errores que, a la
    // larga, dejan cobros "pagados" con un centavo de diferencia.
    $total_c   = intval(round(floatval($cobro['total']) * 100));
    $pagado_c  = intval(round(floatval($cobro['monto_pagado']) * 100));
    $falta_c   = max(0, $total_c - $pagado_c);
    $monto_c   = intval(round($monto * 100));
    $aplicar_c = min($monto_c, $falta_c);

    if ($aplicar_c <= 0) {
        $vacio['cubierto'] = true;
        return $vacio;
    }

    $pdo->prepare(
        "INSERT INTO cobro_abonos
            (cobro_id, cliente_id, escuela_id, monto, metodo, referencia, clabe,
             transaccion_proveedor, auth_code, origen, registrado_por, notas)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )->execute([
        $cobro_id,
        $cobro['cliente_id'] ?: null,
        $cobro['escuela_id'] ?: null,
        $aplicar_c / 100,
        isset($d['metodo']) && $d['metodo'] !== '' ? substr(strval($d['metodo']), 0, 20) : null,
        isset($d['referencia']) && $d['referencia'] !== '' ? substr(strval($d['referencia']), 0, 64) : null,
        isset($d['clabe']) && $d['clabe'] !== '' ? substr(strval($d['clabe']), 0, 24) : null,
        $transaccion !== '' ? substr($transaccion, 0, 64) : null,
        isset($d['auth_code']) && $d['auth_code'] !== '' ? substr(strval($d['auth_code']), 0, 32) : null,
        isset($d['origen']) ? substr(strval($d['origen']), 0, 30) : null,
        isset($d['registrado_por']) && $d['registrado_por'] ? intval($d['registrado_por']) : null,
        isset($d['notas']) && $d['notas'] !== '' ? strval($d['notas']) : null,
    ]);

    // monto_pagado se recalcula SIEMPRE desde el libro mayor, nunca se suma
    // sobre el valor anterior: así la columna cacheada no puede desviarse de
    // la verdad aunque algo se haya insertado o borrado por fuera.
    $pdo->prepare(
        "UPDATE cobros SET monto_pagado = (
            SELECT COALESCE(SUM(monto), 0) FROM cobro_abonos WHERE cobro_id = ?
         ) WHERE id = ?"
    )->execute([$cobro_id, $cobro_id]);

    $cubierto = ($pagado_c + $aplicar_c) >= $total_c;
    if ($cubierto) {
        $pdo->prepare("UPDATE cobros SET estado = 'pagado' WHERE id = ?")->execute([$cobro_id]);
    }

    return [
        'aplicado'  => $aplicar_c / 100,
        'sobrante'  => ($monto_c - $aplicar_c) / 100,
        'cubierto'  => $cubierto,
        'duplicado' => false,
    ];
}

/**
 * Reparte un depósito entre TODOS los cobros pendientes de un alumno, del más
 * viejo al más nuevo, hasta agotarlo.
 *
 * Es el caso del canal SPEI: la CLABE es del ALUMNO, no de un cobro, así que
 * un depósito no viene marcado para ningún cobro en particular. Se aplica a
 * lo más viejo primero, que es lo que espera cualquiera que deba varias
 * colegiaturas.
 *
 * Debe llamarse DENTRO de una transacción. Bloquea él mismo los cobros.
 *
 * @return array{aplicado:float, sobrante:float, cobros:int[], duplicado:bool}
 */
function aplicar_abono_a_cliente(PDO $pdo, int $cliente_id, float $monto, array $d = []): array
{
    $res = ['aplicado' => 0.0, 'sobrante' => round($monto, 2), 'cobros' => [], 'duplicado' => false];
    if ($monto <= 0) return $res;

    $transaccion = trim(strval($d['transaccion'] ?? ''));
    if ($transaccion !== '') {
        $chk = $pdo->prepare("SELECT id FROM cobro_abonos WHERE transaccion_proveedor = ? LIMIT 1");
        $chk->execute([$transaccion]);
        if ($chk->fetch()) {
            $res['duplicado'] = true;
            $res['sobrante']  = 0.0;
            return $res;
        }
    }

    $stmt = $pdo->prepare(
        "SELECT id FROM cobros
          WHERE cliente_id = ? AND estado = 'pendiente'
          ORDER BY id ASC FOR UPDATE"
    );
    $stmt->execute([$cliente_id]);
    $ids = array_column($stmt->fetchAll(), 'id');

    $restante = $monto;
    foreach ($ids as $i => $cid) {
        if ($restante <= 0.004) break;
        // La transacción del proveedor solo puede ir en UN renglón (la llave
        // única de cobro_abonos es global). Se le pone al primero; los demás
        // quedan ligados por el auth_code y la fecha.
        $datos = $d;
        if ($i > 0) unset($datos['transaccion']);
        $r = aplicar_abono_a_cobro($pdo, intval($cid), $restante, $datos);
        if ($r['aplicado'] > 0) {
            $res['aplicado'] += $r['aplicado'];
            $res['cobros'][] = intval($cid);
            $restante = round($restante - $r['aplicado'], 2);
        }
    }

    $res['sobrante'] = round($restante, 2);
    return $res;
}

/**
 * Deja constancia en BD de un depósito que llegó pero NO se pudo aplicar.
 *
 * Hasta el 21-sep-2026 los 3 webhooks de pago descartaban estos casos con un
 * rollBack() y una línea de texto en un .txt — sin una sola fila en la base de
 * datos. Eso hacía imposible conciliar, detectar el faltante, o responderle a
 * una familia que reclamara con su comprobante. Ver la tabla y el caso real
 * que lo originó en migracion_2026_09_21_pagos_no_aplicados.sql.
 *
 * DOS REGLAS AL LLAMARLA:
 *
 * 1. SIEMPRE después de rollBack()/commit(), NUNCA dentro de la transacción
 *    que el webhook va a revertir — si no, la fila se borraría junto con el
 *    rechazo, que es exactamente lo que esta función existe para evitar.
 *
 * 2. Nunca puede tumbar la respuesta del webhook. Si el INSERT falla (tabla
 *    sin migrar, BD caída), se traga el error y sigue: es preferible perder
 *    el registro a romper la conciliación de un pago que sí era válido.
 *
 * @param array $d canal, motivo, referencia, clabe, transaccion, auth_code,
 *                 monto_recibido, monto_esperado, cliente_id, cobro_id,
 *                 escuela_id, payload_raw
 */
function registrar_pago_no_aplicado(PDO $pdo, array $d): void
{
    try {
        // Cadena vacía -> NULL: en el índice UNIQUE de la tabla varios NULL no
        // chocan entre sí, pero varias '' sí — y eso haría que dos avisos
        // distintos sin id de transacción se pisaran uno al otro.
        $transaccion = trim(strval($d['transaccion'] ?? ''));
        if ($transaccion === '') $transaccion = null;

        $sql = "INSERT INTO pagos_no_aplicados
                    (canal, motivo, referencia, clabe, transaccion_proveedor, auth_code,
                     monto_recibido, monto_esperado, cliente_id, cobro_id, escuela_id,
                     payload_raw, ip_origen)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    intentos = intentos + 1,
                    actualizado_en = NOW()";

        $pdo->prepare($sql)->execute([
            substr(strval($d['canal'] ?? 'desconocido'), 0, 20),
            substr(strval($d['motivo'] ?? 'desconocido'), 0, 40),
            isset($d['referencia']) && $d['referencia'] !== '' ? substr(strval($d['referencia']), 0, 64) : null,
            isset($d['clabe']) && $d['clabe'] !== '' ? substr(strval($d['clabe']), 0, 24) : null,
            $transaccion !== null ? substr($transaccion, 0, 64) : null,
            isset($d['auth_code']) && $d['auth_code'] !== '' ? substr(strval($d['auth_code']), 0, 32) : null,
            round(floatval($d['monto_recibido'] ?? 0), 2),
            isset($d['monto_esperado']) ? round(floatval($d['monto_esperado']), 2) : null,
            isset($d['cliente_id']) && $d['cliente_id'] ? intval($d['cliente_id']) : null,
            isset($d['cobro_id']) && $d['cobro_id'] ? intval($d['cobro_id']) : null,
            isset($d['escuela_id']) && $d['escuela_id'] ? intval($d['escuela_id']) : null,
            // El payload crudo se recorta: es para reconstruir el caso, no un archivo.
            isset($d['payload_raw']) ? substr(strval($d['payload_raw']), 0, 8000) : null,
            $_SERVER['REMOTE_ADDR'] ?? null,
        ]);
    } catch (\Throwable $e) {
        // Regla 2: jamás propagar. Solo dejar rastro en el log de texto.
        if (defined('REFERENCIA_LOG_FILE') && function_exists('webhook_log')) {
            webhook_log(REFERENCIA_LOG_FILE, 'NO-APLICADO | falló el registro en BD: ' . $e->getMessage());
        }
    }
}

require_once __DIR__ . '/curl_helper.php';
require_once __DIR__ . '/mailer.php';

// ── Generación de CLABE SPEI real vía Pagadetodo (GenerarClabeIndi) ────────
// Extraída de acciones/generar_clabe_individual.php (15-sep-2026) para que
// el endpoint masivo (acciones/generar_clabes_individual_masivo.php) llame
// EXACTAMENTE la misma lógica alumno por alumno, sin duplicar el
// payload/curl/parseo de respuesta ni el guardado en `clientes`.
//
// NO valida permisos, pertenencia de escuela ni modo demo — eso es
// responsabilidad de cada llamador (igual que cobrar_via_token()).
//
// @return array{success:bool, error?:string, clabe?:string}
function generar_clabe_pagadetodo(PDO $pdo, $alumno_id, string $matricula, string $nombre, string $email): array
{
    // 'Account' debe ser numérico y de longitud fija -- Pagadetodo lo rechaza
    // (código 22 "formato de la referencia incorrecto" / código 11 "formato
    // de la Account incorrecto") si se manda la matrícula tal cual, porque
    // las matrículas son texto libre capturado por cada escuela (con
    // letras, guiones, o de 1 sola cifra: "A-1023", "9", etc.) y no
    // cumplen lo que pide su validador. Se probó también con 9 dígitos
    // (mismo patrón que el 'Id' de cobrar_via_token) y Pagadetodo lo
    // siguió rechazando igual. Se usan 15 dígitos porque es el estándar
    // confirmado para 'pagadetodo.mx' (mismo dominio de este endpoint) en
    // el resto del proyecto -- ver REFERENCIA_DIGITOS en config.php, que
    // vale 15 quando el host activo es pagadetodo.mx y 13 en
    // pagalaescuela.mx. Sigue siendo una hipótesis sin confirmar por el
    // proveedor específicamente para 'Account' de GenerarClabeIndi (el
    // caso confirmado con 15 dígitos es el campo 'Reference' de otro
    // servicio) -- si Pagadetodo lo vuelve a rechazar, hay que pedirles
    // el spec exacto de este campo en vez de seguir probando longitudes.
    $account = str_pad(strval(max(0, intval($alumno_id))), 15, '0', STR_PAD_LEFT);
    $payload = [
        'User'           => PDT_USER,
        'Password'       => PDT_PASS,
        'IntegrationID'  => PDT_INT_ID,
        'BusinessID'     => PDT_BUS_ID_SPEI,
        'Description'    => substr("EduPago - {$nombre}", 0, 40),
        'Account'        => $account,
        'CustomerEmail'  => $email ?: 'sin-correo@edupago.mx',
        'CustomerName'   => substr($nombre, 0, 60),
        'ExpirationDate' => date('Y-m-d', strtotime('+' . SPEI_CLABE_EXPIRACION_DIAS . ' days')),
    ];
    $res = curl_post(PDT_URL_CLABE, $payload);
    if ($res['error']) {
        log_api("generar_clabe_pagadetodo ERROR DE RED -> alumno={$alumno_id} account={$account} -> " . $res['error']);
        return ['success' => false, 'error' => 'Error de red: ' . $res['error']];
    }
    $raw = json_decode($res['body'], true) ?? [];
    $clabe = $raw['Clabe'] ?? $raw['clabe'] ?? null;
    if (!$clabe) {
        // Se deja constancia de la respuesta CRUDA de Pagadetodo (antes se
        // descartaba por completo) -- sin esto no había forma de saber SI
        // fue rechazo de credenciales, Account duplicada, IntegrationID
        // incorrecto, etc.: solo el mensaje genérico "no devolvió una CLABE".
        log_api("generar_clabe_pagadetodo SIN CLABE -> alumno={$alumno_id} account={$account} http={$res['http_code']} raw=" . json_encode($raw, JSON_UNESCAPED_UNICODE) . " body_original=" . $res['body']);
        return ['success' => false, 'error' => 'Pagadetodo no devolvió una CLABE'];
    }
    try {
        $stmt = $pdo->prepare("UPDATE clientes SET clabe_individual = ?, clabe_individual_estado = 'activa', clabe_individual_fecha = CURRENT_DATE WHERE id = ?");
        $stmt->execute([$clabe, $alumno_id]);
    } catch (\PDOException $e) {
        log_api("ERROR DB generar_clabe_pagadetodo: " . $e->getMessage());
    }
    return ['success' => true, 'clabe' => $clabe];
}

// ── Modo demo por escuela (11-sep-2026) ────────────────────────────────────
// Una escuela en modo 'demo' puede recorrer TODO el sistema, pero ningún
// cobro real se manda a la pasarela de pagos ni se asigna una CLABE STP
// real. Vive aquí (no en api.php) porque cron_recordatorios.php y los
// webhooks también llaman cobrar_via_token() y NO incluyen api.php.
//
// Diseñado para fallar CERRADO: si la escuela no se encuentra, o falla la
// consulta (columna sin migrar, etc.), se trata como demo — es decir, NO se
// cobra — en vez de al revés. Fail-open aquí significaría cobrar dinero real
// por accidente; fail-closed en el peor caso solo bloquea un cobro legítimo,
// que es un error mucho más barato de corregir.
function escuela_en_modo_demo($pdo, $escuela_id): bool
{
    // Blindaje (11-sep-2026, hallado en revisión adversarial): esta rama
    // fallaba ABIERTO (false = "no es demo" = sí cobrar), justo al revés del
    // diseño documentado arriba. Hoy los 6 call-sites reales siempre validan
    // su escuela_id antes de llegar aquí (nunca pasan 0/null), así que esto
    // no es explotable todavía -- pero es una trampa para un futuro
    // call-site que sí lo haga. Un escuela_id ausente es, por definición,
    // información insuficiente: se trata como demo (no cobrar).
    if (!$escuela_id) return true;
    try {
        $stmt = $pdo->prepare("SELECT modo FROM escuelas WHERE id = ?");
        $stmt->execute([$escuela_id]);
        $row = $stmt->fetch();
        if (!$row) return true; // escuela no encontrada -> fail closed
        return ($row['modo'] ?? 'activa') === 'demo';
    } catch (\Throwable $e) {
        return true; // columna/tabla no disponible -> fail closed
    }
}

// Días de prueba por defecto configurados por el superadmin
// (config_sistema.demo_dias_default) — usado tanto al activar demo a mano
// (superadmin_toggle_modo_demo.php) como al crear una escuela nueva ya en
// demo desde el registro público (invitacion_enviar.php).
function dias_demo_default($pdo): int
{
    try {
        $stmtCfg = $pdo->prepare("SELECT valor FROM config_sistema WHERE clave = 'demo_dias_default'");
        $stmtCfg->execute();
        return intval($stmtCfg->fetchColumn()) ?: 15;
    } catch (\Throwable $e) {
        return 15;
    }
}

// Para endpoints en acciones/*.php que responden con respond() (definida en
// api.php, que ya está cargado cuando esto se llama desde un endpoint real).
// Corta la ejecución igual que un requerir_rol()/requerir_seccion_habilitada().
function responder_demo_si_aplica($pdo, $escuela_id, $mensaje = null): void
{
    if (escuela_en_modo_demo($pdo, $escuela_id)) {
        respond([
            'success' => true,
            'demo'    => true,
            'mensaje' => $mensaje ?? 'Esta cuenta está en modo de prueba: aquí se generaría el cobro real, pero no se envía a la pasarela de pagos.',
        ]);
    }
}

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
// tabla `cobros`: pago de suscripcion nuevo (invitaciones_colegio) o pago
// de RENOVACION de una escuela ya activa (escuelas.pago_renovacion_*).
// Revisa unicidad en las TRES tablas para que nunca coincidan entre si.
function construir_referencia_pago_generico(PDO $pdo, $idEntidad): string
{
    $largoTotal = defined('REFERENCIA_DIGITOS') ? intval(REFERENCIA_DIGITOS) : 15;
    if ($largoTotal < 13) $largoTotal = 13;

    $bloque = str_pad(strval(max(0, intval($idEntidad)) % 100000), 5, '0', STR_PAD_LEFT);
    $desde  = (intval(time()) % 10000) + 1;

    $chkCobros = $pdo->prepare("SELECT 1 FROM cobros WHERE referencia = ? LIMIT 1");
    $chkInv    = $pdo->prepare("SELECT 1 FROM invitaciones_colegio WHERE pago_referencia = ? LIMIT 1");
    // Tercera tabla: pagos de RENOVACION de escuelas ya activas (distinto
    // de invitaciones_colegio, que es solo la primera mensualidad). Sin
    // este chequeo, una referencia de renovacion podria coincidir con otra
    // ya en curso para OTRA escuela y el webhook confirmaria la que no era.
    $chkEsc    = $pdo->prepare("SELECT 1 FROM escuelas WHERE pago_renovacion_referencia = ? LIMIT 1");
    $chkGrupo  = $pdo->prepare("SELECT 1 FROM cobros_agrupados WHERE referencia = ? LIMIT 1");
    for ($i = 0; $i < 500; $i++) {
        $pago = str_pad(strval(($desde + $i) % 10000), 4, '0', STR_PAD_LEFT);
        $ref  = str_pad($bloque . $pago, $largoTotal, '0', STR_PAD_LEFT);
        $chkCobros->execute([$ref]);
        if ($chkCobros->fetch()) continue;
        $chkInv->execute([$ref]);
        if ($chkInv->fetch()) continue;
        $chkEsc->execute([$ref]);
        if ($chkEsc->fetch()) continue;
        $chkGrupo->execute([$ref]);
        if ($chkGrupo->fetch()) continue;
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
    // Modo demo (11-sep-2026): esta función la llaman tanto el botón manual
    // "Tarjeta guardada" (acciones/cobrar_cai.php) como el cargo automático
    // diario del cron -- este guard cubre los dos de un solo golpe. No se
    // marca el cobro como pagado (sigue pendiente): es más honesto que
    // fingir un cargo real que nunca ocurrió.
    try {
        $stmtDemo = $pdo->prepare("SELECT e.modo FROM clientes c JOIN escuelas e ON e.id = c.escuela_id WHERE c.id = ?");
        $stmtDemo->execute([$clienteId]);
        $rowDemo = $stmtDemo->fetch();
        $enDemo = !$rowDemo || ($rowDemo['modo'] ?? 'activa') === 'demo';
    } catch (\Throwable $e) {
        $enDemo = true; // fail closed
    }
    if ($enDemo) {
        log_api("cobrar_via_token -> DEMO, no se llama al proveedor. cobro={$cobroId} cliente={$clienteId} total={$total}");
        return ['success' => false, 'demo' => true, 'error' => 'Esta cuenta está en modo de prueba: no se realizan cargos automáticos reales.'];
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

// Movidas aqui desde api.php: cron_recordatorios.php y webhooks/webhook_liga.php
// tambien las necesitan (renovacion automatica de suscripcion) y ninguno de
// los dos incluye api.php -- este archivo si esta incluido en los tres.
function siguiente_vencimiento_mensual($fechaBase) {
    // Dos bugs distintos en la version anterior, los dos por el mismo
    // motivo: usar strtotime('+1 month') sobre un dia que no existe en el
    // mes siguiente. PHP no lo recorta -- lo DESBORDA al mes de despues:
    // strtotime('2026-01-31 +1 month') da marzo, no febrero, porque de
    // enero 31 + 1 mes 'deberia' caer en 31 de febrero, que no existe, y
    // PHP en su lugar suma los dias que faltan sobre el mes siguiente.
    // Por eso ahora el mes/anio destino se calculan con aritmetica de
    // enteros (nunca con strtotime), y el dia se recorta aparte si hace
    // falta -- asi 31-ene siempre cae en febrero, nunca en marzo.
    $partes = explode('-', substr($fechaBase, 0, 10));
    $anio  = intval($partes[0]);
    $mes   = intval($partes[1]);
    $dia   = intval($partes[2]);
    $mes++;
    if ($mes > 12) { $mes = 1; $anio++; }
    $ultimoDiaDelMes = intval(date('t', mktime(0, 0, 0, $mes, 1, $anio)));
    $diaFinal = min($dia, $ultimoDiaDelMes);
    return sprintf('%04d-%02d-%02d', $anio, $mes, $diaFinal);
}

function registrar_log($pdo, $usuario_actual, $accion, $detalle = null, $escuela_id = null) {
    try {
        $stmt = $pdo->prepare(
            "INSERT INTO logs_sistema (usuario_id, usuario_nombre, escuela_id, accion, detalle, ip)
             VALUES (?, ?, ?, ?, ?, ?)"
        );
        $stmt->execute([
            $usuario_actual['user_id'] ?? null,
            $usuario_actual['nombre'] ?? ($usuario_actual['email'] ?? null),
            $escuela_id ?? ($usuario_actual['escuela_id'] ?? null),
            $accion,
            $detalle,
            $_SERVER['REMOTE_ADDR'] ?? null,
        ]);
    } catch (\PDOException $e) {
        file_put_contents(__DIR__ . '/api_log.txt', date('Y-m-d H:i:s') . " | registrar_log falló (¿falta migrar logs_sistema?): " . $e->getMessage() . "\n", FILE_APPEND);
    }
}

// ── Modo mantenimiento GLOBAL de secciones ─────────────────────────────────
// Complementa el apagado por escuela (escuelas.secciones_deshabilitadas):
// esto apaga una seccion para TODAS las escuelas a la vez, con motivo y
// ventana de tiempo, sin tener que tocar escuela por escuela.
function mantenimiento_secciones_activo(PDO $pdo) {
    static $cache = null;
    if ($cache !== null) return $cache;
    try {
        $stmt = $pdo->prepare("SELECT valor FROM config_sistema WHERE clave = 'mantenimiento_secciones' LIMIT 1");
        $stmt->execute();
        $row = $stmt->fetch();
        if (!$row || !$row['valor']) { $cache = null; return null; }
        $datos = json_decode($row['valor'], true);
        if (!is_array($datos) || empty($datos['secciones'])) { $cache = null; return null; }
        $ahora = time();
        if (!empty($datos['inicio']) && strtotime($datos['inicio']) > $ahora) { $cache = null; return null; }
        if (!empty($datos['fin']) && strtotime($datos['fin']) < $ahora) { $cache = null; return null; }
        $cache = $datos;
        return $datos;
    } catch (\PDOException $e) {
        // Tabla no migrada todavía: se comporta como si no hubiera mantenimiento.
        $cache = null;
        return null;
    }
}

// Igual que requerir_seccion_habilitada() pero para el apagado GLOBAL. Se
// llama junto a esa función, nunca en su lugar: una escuela puede tener la
// seccion apagada por su cuenta Y por mantenimiento global al mismo tiempo.
function requerir_seccion_sin_mantenimiento($pdo, $rol_actual, $secciones, $mensaje = null) {
    if ($rol_actual !== 'admin' && $rol_actual !== 'cajero') return;
    $mant = mantenimiento_secciones_activo($pdo);
    if (!$mant) return;
    foreach ((array) $secciones as $s) {
        if (!in_array($s, $mant['secciones'], true)) return; // al menos una sigue disponible
    }
    http_response_code(503);
    respond([
        'success' => false,
        'error'   => $mensaje ?? ('Esta sección está en mantenimiento' . (!empty($mant['motivo']) ? ": {$mant['motivo']}" : '') . '.'),
        'mantenimiento' => true,
    ]);
}

// ── Métodos de pago deshabilitados ──────────────────────────────────────────
// $metodo es uno de: 'Efectivo','TC','SPEI','EfectivoRef','Cheque','CAI'.
// Revisa PRIMERO el apagado global (afecta a todas las escuelas) y LUEGO el
// de esta escuela en particular — cualquiera de los dos basta para bloquear.
function metodo_pago_deshabilitado(PDO $pdo, $escuelaId, $metodo) {
    try {
        $stmt = $pdo->prepare("SELECT valor FROM config_sistema WHERE clave = 'metodos_pago_global' LIMIT 1");
        $stmt->execute();
        $row = $stmt->fetch();
        if ($row && $row['valor']) {
            $datos = json_decode($row['valor'], true);
            if (is_array($datos) && in_array($metodo, $datos['deshabilitados'] ?? [], true)) return true;
        }
    } catch (\PDOException $e) {
        // Tabla no migrada: se ignora el chequeo global, no se bloquea nada.
    }

    if ($escuelaId) {
        // Igual que arriba: si la migracion todavia no corrio, la columna
        // metodos_pago_deshabilitados NO EXISTE en escuelas -- sin este
        // try/catch, CUALQUIER pago (Tarjeta, Efectivo, Cheque, CAI) fallaba
        // con un error fatal de SQL antes de poder cobrar nada, porque esta
        // consulta corre en cada intento de pago sin excepcion.
        try {
            $stmt2 = $pdo->prepare("SELECT metodos_pago_deshabilitados FROM escuelas WHERE id = ?");
            $stmt2->execute([intval($escuelaId)]);
            $row2 = $stmt2->fetch();
            if ($row2 && $row2['metodos_pago_deshabilitados']) {
                $lista = json_decode($row2['metodos_pago_deshabilitados'], true);
                if (is_array($lista) && in_array($metodo, $lista, true)) return true;
            }
        } catch (\PDOException $e) {
            // Columna no migrada: se ignora el chequeo por escuela, no se bloquea nada.
        }
    }
    return false;
}

// Corta la petición si el método está deshabilitado. $etiqueta es el nombre
// legible para el mensaje de error (ej. "Tarjeta", "Domiciliación").
function requerir_metodo_pago_habilitado(PDO $pdo, $escuelaId, $metodo, $etiqueta = null) {
    if (metodo_pago_deshabilitado($pdo, $escuelaId, $metodo)) {
        http_response_code(403);
        respond([
            'success' => false,
            'error'   => 'El método de pago' . ($etiqueta ? " \"{$etiqueta}\"" : '') . ' no está disponible en este momento.',
        ]);
    }
}