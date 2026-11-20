<?php
/**
 * lib/helpers_push.php — Avisos push en el navegador o el celular (OF-7b, 20-nov-2026)
 *
 * QUÉ ES
 *   Web Push sin librerías: PHP plano + OpenSSL + curl. Quien activa los avisos deja su navegador
 *   SUSCRITO (push_suscripciones). Cuando pasa algo, el servidor "toca" la dirección de ese
 *   navegador en el servicio de avisos de Google, Mozilla, Microsoft o Apple, y el navegador
 *   despierta a sw-edupago.js, que muestra el aviso aunque la plataforma esté cerrada.
 *
 * EL TOQUE VA VACÍO
 *   No se manda ningún texto en el toque (así no hay que cifrar nada). El service worker, al
 *   despertar, pregunta qué decir a la acción pública push_aviso, identificándose con el SHA-256
 *   de su propia dirección. Ese texto es GENÉRICO a propósito: nunca lleva montos, nombres de
 *   alumnos, folios ni el contenido de un ticket. Un aviso de pantalla lo ve cualquiera que pase.
 *
 * REGLA DE ORO: UN PUSH NUNCA RETRASA NI TUMBA UN PAGO
 *   · El evento (un webhook de pago, por ejemplo) solo ENCOLA: un INSERT barato, todo dentro de
 *     try/catch (push_encolar y las push_aviso_*). Nunca lanza.
 *   · El envío real (HTTP a los servicios de push) ocurre DESPUÉS de responder:
 *     push_programar_despacho() registra un register_shutdown_function que primero cierra la
 *     respuesta (fastcgi_finish_request / litespeed_finish_request) y recién entonces despacha,
 *     con un tope de tiempo total y timeouts de curl cortos. Si el servidor no puede cerrar la
 *     respuesta antes, en los webhooks NO se despacha en esa petición: queda en cola para el cron.
 *   · Lo que quede pendiente lo despacha cron_recordatorios.php en su siguiente corrida.
 *
 * LLAVES VAPID
 *   Se generan solas la primera vez (P-256 con OpenSSL) y viven en UN archivo,
 *   uploads_privados/push_vapid.pem: fuera de git (uploads_privados/.gitignore) y fuera del
 *   alcance web (uploads_privados/.htaccess niega todo), con permisos 0600 si el sistema lo permite.
 *   NUNCA se imprimen ni se escriben en logs. Borrar el archivo las rota (y deja inservibles las
 *   suscripciones existentes: ver docs/mejoras-of/of7b-push.md).
 *
 * SSRF
 *   Solo se acepta (y solo se llama) a HTTPS de los servicios de push conocidos:
 *   push_endpoint_valido().
 *
 * Sin la migración (tablas push_*), nada de esto aparece y nada falla: todo está en try/catch.
 * Las funciones puras (base64url, JWT, validación de endpoint, texto por tipo) las prueba
 * herramientas/pruebas.php sin base de datos ni red.
 */

const PUSH_ROLES = ['familia', 'alumno', 'admin', 'cajero', 'soporte', 'superadmin'];
const PUSH_ARCHIVO_LLAVE = 'push_vapid.pem';
const PUSH_MAX_FALLOS = 5;               // fallos seguidos tras los que la suscripción se desactiva
const PUSH_MAX_INTENTOS = 3;             // intentos de envío por aviso
const PUSH_TTL_SEGUNDOS = 86400;         // cuánto lo guarda el servicio de push si el dispositivo está apagado
const PUSH_VIGENCIA_HORAS = 24;          // un aviso más viejo ya no se envía ni se muestra
const PUSH_MAX_SUSCRIPCIONES_USUARIO = 10;
const PUSH_DEDUPE_MINUTOS = 10;          // no se encola otro aviso del mismo tipo si ya hay uno sin entregar

/** Servicios de push aceptados: host exacto o terminación (con el punto delante). */
const PUSH_HOSTS_EXACTOS = ['fcm.googleapis.com', 'web.push.apple.com', 'push.services.mozilla.com'];
const PUSH_HOSTS_SUFIJOS = ['.push.services.mozilla.com', '.notify.windows.com', '.web.push.apple.com'];

// ════════════════════════════════════════════════════════════════════════
// Funciones PURAS (sin base de datos ni red)
// ════════════════════════════════════════════════════════════════════════

function push_b64url_encode(string $bin): string
{
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

/** @return string|null null si no es base64url válido. */
function push_b64url_decode(string $s): ?string
{
    if ($s === '' || !preg_match('/^[A-Za-z0-9_-]+$/', $s)) return null;
    $b = strtr($s, '-_', '+/');
    $b .= str_repeat('=', (4 - strlen($b) % 4) % 4);
    $r = base64_decode($b, true);
    return $r === false ? null : $r;
}

/**
 * ¿Es una dirección de suscripción aceptable? Solo https, sin usuario/contraseña, puerto 443,
 * y un host de la lista de servicios de push conocidos. Así el servidor no se usa para pegarle
 * a URLs arbitrarias (SSRF) aunque alguien mande un "endpoint" inventado.
 */
function push_endpoint_valido($endpoint): bool
{
    if (!is_string($endpoint) || $endpoint === '' || strlen($endpoint) > 2000) return false;
    // Sin espacios, controles ni barras invertidas (parse_url las interpreta distinto que curl).
    if (preg_match('/[\x00-\x20\x7f\\\\]/', $endpoint)) return false;
    $p = parse_url($endpoint);
    if (!is_array($p)) return false;
    if (($p['scheme'] ?? '') !== 'https') return false;               // en minúsculas y sin variantes
    if (isset($p['user']) || isset($p['pass']) || isset($p['fragment'])) return false;
    if (isset($p['port']) && (int) $p['port'] !== 443) return false;
    $host = $p['host'] ?? '';
    if ($host === '' || !preg_match('/^[a-z0-9.-]+$/', $host)) return false;
    if (substr($host, -1) === '.' || strpos($host, '..') !== false) return false;
    if (!isset($p['path']) || $p['path'] === '' || $p['path'][0] !== '/' || $p['path'] === '/') return false;
    if (in_array($host, PUSH_HOSTS_EXACTOS, true)) return true;
    foreach (PUSH_HOSTS_SUFIJOS as $suf) {
        if (strlen($host) > strlen($suf) && substr($host, -strlen($suf)) === $suf) return true;
    }
    return false;
}

function push_endpoint_hash(string $endpoint): string
{
    return hash('sha256', $endpoint);
}

/** "https://host" del endpoint: es el `aud` del JWT de VAPID. */
function push_aud_de_endpoint(string $endpoint): ?string
{
    $p = parse_url($endpoint);
    if (!is_array($p) || empty($p['host'])) return null;
    return 'https://' . $p['host'];
}

/**
 * Un campo que el navegador manda codificado en hexadecimal (la dirección de suscripción lleva
 * "https://..." y los filtros de seguridad de algunos hostings rechazan eso tal cual). Si no es
 * hexadecimal se devuelve igual, recortado.
 */
function push_decodificar_campo($v): string
{
    $v = trim((string) $v);
    if ($v !== '' && strlen($v) % 2 === 0 && ctype_xdigit($v)) {
        $r = hex2bin($v);
        if ($r !== false) return trim($r);
    }
    return $v;
}

/** "Chrome en Windows", "Safari en iOS"... a partir del User-Agent (texto corto, sin datos personales). */
function push_dispositivo_desde_ua($ua): string
{
    $ua = (string) $ua;
    if ($ua === '') return 'Navegador';
    if (preg_match('/Edg(e|A|iOS)?\//', $ua))            $nav = 'Edge';
    elseif (preg_match('/OPR\/|Opera/', $ua))            $nav = 'Opera';
    elseif (stripos($ua, 'SamsungBrowser') !== false)    $nav = 'Samsung Internet';
    elseif (preg_match('/Firefox\/|FxiOS\//', $ua))      $nav = 'Firefox';
    elseif (preg_match('/Chrome\/|CriOS\//', $ua))       $nav = 'Chrome';
    elseif (stripos($ua, 'Safari') !== false)            $nav = 'Safari';
    else                                                  $nav = 'Navegador';
    if (preg_match('/iPhone|iPad|iPod/', $ua))           $so = 'iOS';
    elseif (stripos($ua, 'Android') !== false)           $so = 'Android';
    elseif (stripos($ua, 'Windows') !== false)           $so = 'Windows';
    elseif (stripos($ua, 'CrOS') !== false)              $so = 'ChromeOS';
    elseif (stripos($ua, 'Mac OS X') !== false)          $so = 'macOS';
    elseif (stripos($ua, 'Linux') !== false)             $so = 'Linux';
    else                                                  $so = '';
    return $so !== '' ? "$nav en $so" : $nav;
}

/** OpenSSL firma en DER; el JWT (ES256) pide r||s, 32 bytes cada uno. Null si el DER no es válido. */
function push_der_a_raw(string $der): ?string
{
    if (strlen($der) < 8 || ord($der[0]) !== 0x30) return null;
    $p = (ord($der[1]) & 0x80) ? 2 + (ord($der[1]) & 0x7f) : 2;
    $out = '';
    for ($i = 0; $i < 2; $i++) {
        if (!isset($der[$p + 1]) || ord($der[$p]) !== 0x02) return null;
        $largo = ord($der[$p + 1]);
        $v = ltrim(substr($der, $p + 2, $largo), "\0");
        $p += 2 + $largo;
        if (strlen($v) > 32) return null;
        $out .= str_pad($v, 32, "\0", STR_PAD_LEFT);
    }
    return $out;
}

/** Inversa de push_der_a_raw (la usan las pruebas para verificar la firma con openssl_verify). */
function push_raw_a_der(string $raw): ?string
{
    if (strlen($raw) !== 64) return null;
    $enteros = '';
    foreach ([substr($raw, 0, 32), substr($raw, 32)] as $n) {
        $n = ltrim($n, "\0");
        if ($n === '' || ord($n[0]) & 0x80) $n = "\0" . $n;
        $enteros .= "\x02" . chr(strlen($n)) . $n;
    }
    return "\x30" . chr(strlen($enteros)) . $enteros;
}

/**
 * El JWT de VAPID (ES256) para un servicio de push: `aud` = origen del servicio, `exp` a 12 h
 * (el máximo permitido es 24 h), `sub` = contacto del servidor. Null si OpenSSL no pudo firmar.
 */
function push_jwt_vapid(string $aud, string $pem_privada, string $sub, ?int $exp = null): ?string
{
    $cab  = push_b64url_encode(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
    $dato = push_b64url_encode(json_encode(
        ['aud' => $aud, 'exp' => $exp ?? (time() + 12 * 3600), 'sub' => $sub],
        JSON_UNESCAPED_SLASHES
    ));
    $firmar = $cab . '.' . $dato;
    $der = '';
    if (!@openssl_sign($firmar, $der, $pem_privada, OPENSSL_ALGO_SHA256)) return null;
    $raw = push_der_a_raw($der);
    return $raw === null ? null : $firmar . '.' . push_b64url_encode($raw);
}

/** El contacto (`sub`) de VAPID: un mailto: del propio sistema, o https del host. */
function push_sub_vapid(): string
{
    if (defined('SMTP_FROM_EMAIL') && SMTP_FROM_EMAIL) return 'mailto:' . SMTP_FROM_EMAIL;
    $host = preg_replace('/[^a-z0-9.\-:]/i', '', (string) ($_SERVER['HTTP_HOST'] ?? ''));
    return $host !== '' ? 'https://' . $host : 'mailto:soporte@localhost';
}

/**
 * El texto de cada tipo de aviso. GENÉRICO A PROPÓSITO: sin montos, nombres, folios ni contenido
 * de tickets. `url` es relativa a la carpeta de la aplicación; sw-edupago.js la abre con esa base
 * y la app (assets/js/push_cliente.js) la convierte en la pantalla correspondiente.
 * 'urgencia' es la cabecera Urgency del toque ('high' despierta aunque el celular esté en ahorro).
 */
function push_texto_tipo(string $tipo): array
{
    static $t = [
        'pago_confirmado'   => ['titulo' => 'Pago confirmado',      'cuerpo' => 'Tu pago fue confirmado.',                 'url' => '?ir=pagos',           'urgencia' => 'high'],
        'recordatorio_pago' => ['titulo' => 'Recordatorio de pago', 'cuerpo' => 'Tienes un recordatorio de pago.',         'url' => '?ir=pagos',           'urgencia' => 'normal'],
        'calificaciones'    => ['titulo' => 'Calificaciones',       'cuerpo' => 'Se publicaron calificaciones.',           'url' => '?ir=calificaciones',  'urgencia' => 'normal'],
        'soporte_respuesta' => ['titulo' => 'Soporte',              'cuerpo' => 'Soporte respondió tu ticket.',            'url' => '?ir=ayuda',           'urgencia' => 'high'],
        'soporte_nuevo'     => ['titulo' => 'Tickets de soporte',   'cuerpo' => 'Hay un ticket nuevo de un colegio.',      'url' => '?ir=soporte_tickets', 'urgencia' => 'normal'],
        'soporte_colegio'   => ['titulo' => 'Tickets de soporte',   'cuerpo' => 'Un colegio respondió en un ticket.',      'url' => '?ir=soporte_tickets', 'urgencia' => 'normal'],
        'prueba'            => ['titulo' => 'Aviso de prueba',      'cuerpo' => 'Los avisos funcionan en este dispositivo.', 'url' => '',                   'urgencia' => 'high'],
    ];
    return $t[$tipo] ?? ['titulo' => 'EduPago', 'cuerpo' => 'Tienes un aviso nuevo.', 'url' => '', 'urgencia' => 'normal'];
}

/** El aviso que se muestra cuando no hay nada pendiente (o no se reconoce al dispositivo): idéntico en ambos casos. */
function push_aviso_generico(): array
{
    return ['titulo' => 'EduPago', 'cuerpo' => 'Tienes un aviso nuevo.', 'url' => '', 'tag' => 'edupago-aviso'];
}

// ════════════════════════════════════════════════════════════════════════
// Registro y límite de tasa
// ════════════════════════════════════════════════════════════════════════

/** Rastro mínimo, sin llaves ni direcciones de suscripción. */
function push_log(string $msg): void
{
    $linea = '[EduPago] push: ' . $msg;
    if (function_exists('log_api') && defined('API_LOG_ENABLED')) {
        log_api($linea);
    } else {
        error_log($linea);
    }
}

function push_dir_privado(): string
{
    return defined('UPLOADS_PRIVADOS_DIR_ABS') ? rtrim(UPLOADS_PRIVADOS_DIR_ABS, '/\\') : (__DIR__ . '/../uploads_privados');
}

/**
 * Límite de tasa de ventana fija, en archivos pequeños (sin tablas nuevas): true = dejar pasar.
 * Si no se puede escribir, deja pasar (un fallo del límite no debe bloquear a nadie).
 */
function push_tasa_permitir(string $clave, int $limite, int $ventana_seg, ?string $dir = null, ?int $ahora = null): bool
{
    try {
        $dir = $dir ?? (push_dir_privado() . '/push_tasa');
        if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) return true;
        $ahora = $ahora ?? time();
        $cubeta = intdiv($ahora, max(1, $ventana_seg));
        $fh = @fopen($dir . '/' . sha1($clave) . '_' . $cubeta, 'c+');
        if (!$fh) return true;
        flock($fh, LOCK_EX);
        $n = (int) stream_get_contents($fh) + 1;
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, (string) $n);
        fflush($fh);
        flock($fh, LOCK_UN);
        fclose($fh);
        if (mt_rand(1, 60) === 1) push_tasa_limpiar($dir, $ventana_seg * 3, $ahora);
        return $n <= $limite;
    } catch (\Throwable $e) {
        return true;
    }
}

/** Borra los contadores de ventanas ya pasadas. */
function push_tasa_limpiar(string $dir, int $edad_seg, int $ahora): void
{
    foreach (@scandir($dir) ?: [] as $n) {
        if ($n === '.' || $n === '..' || strpos($n, '_') === false) continue;
        $f = $dir . '/' . $n;
        if (is_file($f) && $ahora - (int) @filemtime($f) > $edad_seg) @unlink($f);
    }
}

// ════════════════════════════════════════════════════════════════════════
// Llaves VAPID
// ════════════════════════════════════════════════════════════════════════

/** Dónde vive el archivo de llaves (uno solo, con la llave privada en PEM). */
function push_ruta_llave(): string
{
    return push_dir_privado() . '/' . PUSH_ARCHIVO_LLAVE;
}

/**
 * Genera un par P-256 con OpenSSL y devuelve el PEM de la privada, o null. Algunos servidores
 * (sobre todo Windows) no encuentran openssl.cnf: se prueba también con la que trae PHP.
 */
function push_generar_pem(): ?string
{
    if (!function_exists('openssl_pkey_new')) return null;
    $base = ['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC];
    $intentos = [$base];
    foreach ([getenv('OPENSSL_CONF'), dirname(PHP_BINARY) . '/extras/ssl/openssl.cnf'] as $cnf) {
        if ($cnf && is_file($cnf)) $intentos[] = $base + ['config' => $cnf];
    }
    foreach ($intentos as $op) {
        $k = @openssl_pkey_new($op);
        $pem = '';
        if ($k && @openssl_pkey_export($k, $pem, null, $op) && $pem !== '') {
            return $pem;
        }
    }
    while (openssl_error_string() !== false) { /* vaciar la cola de errores de OpenSSL */ }
    return null;
}

/** La llave pública (65 bytes sin comprimir, en base64url) de un PEM privado, o null. */
function push_publica_de_pem(string $pem): ?string
{
    $k = @openssl_pkey_get_private($pem);
    if (!$k) return null;
    $d = openssl_pkey_get_details($k);
    if (empty($d['ec']['x']) || empty($d['ec']['y'])) return null;
    if (($d['ec']['curve_name'] ?? '') !== 'prime256v1') return null;
    return push_b64url_encode("\x04" . str_pad($d['ec']['x'], 32, "\0", STR_PAD_LEFT) . str_pad($d['ec']['y'], 32, "\0", STR_PAD_LEFT));
}

/**
 * Las llaves del servidor: ['publica' => base64url, 'privada' => PEM], o null si no hay forma de
 * tenerlas (en ese caso push queda apagado: push_estado()). La primera vez se generan y se
 * guardan con permisos 0600. NUNCA se registran.
 */
function push_llaves(?string $ruta = null): ?array
{
    static $cache = [];
    $ruta = $ruta ?? push_ruta_llave();
    if (array_key_exists($ruta, $cache)) return $cache[$ruta];

    $leer = function () use ($ruta): ?array {
        $pem = is_file($ruta) ? @file_get_contents($ruta) : false;
        if (!is_string($pem) || strpos($pem, 'PRIVATE KEY') === false) return null;
        $pub = push_publica_de_pem($pem);
        return $pub ? ['publica' => $pub, 'privada' => $pem] : null;
    };
    $ll = $leer();
    if ($ll === null && is_file($ruta)) {
        usleep(150000);   // quizá otra petición la está escribiendo en este instante
        $ll = $leer();
    }
    if ($ll === null && !is_file($ruta)) {
        $pem = push_generar_pem();
        if ($pem === null) {
            push_log('OpenSSL no pudo generar las llaves VAPID (¿sin soporte de curvas elípticas?): los avisos push quedan apagados.');
        } else {
            $dir = dirname($ruta);
            if (!is_dir($dir)) @mkdir($dir, 0755, true);
            // 'x': crea solo si no existe. Si dos peticiones llegan a la vez, una gana y la otra lee la suya.
            $fh = @fopen($ruta, 'x');
            if ($fh) {
                @chmod($ruta, 0600);
                fwrite($fh, $pem);
                fclose($fh);
            }
            for ($i = 0; $i < 4 && $ll === null; $i++) {
                $ll = $leer();
                if ($ll === null) usleep(50000);
            }
            if ($ll === null) push_log('no se pudo guardar el archivo de llaves VAPID en uploads_privados/ (permisos de escritura).');
        }
    } elseif ($ll === null) {
        push_log('el archivo de llaves VAPID existe pero no es válido: bórralo para que se genere uno nuevo.');
    }
    return $cache[$ruta] = $ll;
}

/** ['ok' => bool, 'motivo' => texto para el superadmin]. */
function push_estado(): array
{
    if (!function_exists('openssl_sign') || !function_exists('curl_init')) {
        return ['ok' => false, 'motivo' => 'Al servidor le falta la extensión ' . (!function_exists('openssl_sign') ? 'openssl' : 'curl') . ' de PHP.'];
    }
    if (push_llaves() === null) {
        return ['ok' => false, 'motivo' => 'No se pudieron generar o guardar las llaves de los avisos (uploads_privados/' . PUSH_ARCHIVO_LLAVE
            . '): revisa que OpenSSL tenga soporte de curvas elípticas y que esa carpeta sea escribible. Mientras tanto los avisos push están apagados.'];
    }
    return ['ok' => true, 'motivo' => ''];
}

// ════════════════════════════════════════════════════════════════════════
// Base de datos
// ════════════════════════════════════════════════════════════════════════

/** ¿Corrió la migración? (tablas push_*). Se cachea por petición. */
function push_tablas_listas(PDO $pdo): bool
{
    static $ok = null;
    if ($ok !== null) return $ok;
    try {
        $pdo->query('SELECT 1 FROM push_suscripciones LIMIT 1');
        $pdo->query('SELECT 1 FROM push_avisos LIMIT 1');
        return $ok = true;
    } catch (\Throwable $e) {
        return false;   // sin cachear: si la migración corre durante un cron largo, se entera
    }
}

/**
 * Alta (o reasignación) de una suscripción. Si la dirección ya estaba con OTRA cuenta (alguien
 * entró en ese navegador), pasa a la cuenta actual: no hereda los avisos de la anterior.
 *
 * @return array{ok:bool, error?:string}
 */
function push_suscribir(PDO $pdo, int $usuario_id, ?int $escuela_id, string $endpoint, ?string $p256dh, ?string $auth, string $dispositivo): array
{
    if (!push_endpoint_valido($endpoint)) return ['ok' => false, 'error' => 'La dirección de avisos de este navegador no es válida.'];
    $p256dh = ($p256dh !== null && preg_match('/^[A-Za-z0-9_-]{60,120}$/', $p256dh)) ? $p256dh : null;
    $auth   = ($auth !== null && preg_match('/^[A-Za-z0-9_-]{12,40}$/', $auth)) ? $auth : null;
    $pdo->prepare(
        "INSERT INTO push_suscripciones (usuario_id, escuela_id, endpoint, endpoint_hash, p256dh, auth, dispositivo, creado_en, fallos)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), 0)
         ON DUPLICATE KEY UPDATE usuario_id = VALUES(usuario_id), escuela_id = VALUES(escuela_id), endpoint = VALUES(endpoint),
                                 p256dh = VALUES(p256dh), auth = VALUES(auth), dispositivo = VALUES(dispositivo), fallos = 0"
    )->execute([$usuario_id, $escuela_id, $endpoint, push_endpoint_hash($endpoint), $p256dh, $auth, mb_substr($dispositivo, 0, 80)]);
    // Tope por cuenta: se quedan las más recientes.
    $pdo->prepare(
        "DELETE FROM push_suscripciones WHERE usuario_id = ? AND id NOT IN (
            SELECT id FROM (SELECT id FROM push_suscripciones WHERE usuario_id = ? ORDER BY id DESC LIMIT " . PUSH_MAX_SUSCRIPCIONES_USUARIO . ") t)"
    )->execute([$usuario_id, $usuario_id]);
    return ['ok' => true];
}

/** Borra una suscripción (y sus avisos). Solo si es de ese usuario. */
function push_quitar(PDO $pdo, int $usuario_id, string $endpoint_hash): void
{
    $st = $pdo->prepare('SELECT id FROM push_suscripciones WHERE endpoint_hash = ? AND usuario_id = ?');
    $st->execute([$endpoint_hash, $usuario_id]);
    foreach ($st->fetchAll() as $f) push_borrar_suscripcion($pdo, (int) $f['id']);
}

function push_borrar_suscripcion(PDO $pdo, int $id): void
{
    $pdo->prepare('DELETE FROM push_avisos WHERE suscripcion_id = ?')->execute([$id]);
    $pdo->prepare('DELETE FROM push_suscripciones WHERE id = ?')->execute([$id]);
}

/**
 * Lo que el service worker viene a preguntar al despertar: el aviso más viejo ya enviado y aún
 * no entregado de ESA suscripción, que se marca entregado. Un hash desconocido y "nada
 * pendiente" responden IGUAL (el aviso genérico): no se revela si el dispositivo existe.
 * Solo lleva texto genérico (ver push_texto_tipo).
 */
function push_aviso_para_hash(PDO $pdo, string $hash): array
{
    $generico = push_aviso_generico();
    if (!preg_match('/^[a-f0-9]{64}$/', $hash)) return $generico;
    try {
        $st = $pdo->prepare('SELECT id FROM push_suscripciones WHERE endpoint_hash = ?');
        $st->execute([$hash]);
        $sid = $st->fetchColumn();
        if (!$sid) return $generico;
        for ($i = 0; $i < 2; $i++) {   // 2.º intento si otro despertar se llevó el mismo aviso a la vez
            $st = $pdo->prepare(
                "SELECT id, tipo, titulo, cuerpo, url FROM push_avisos
                  WHERE suscripcion_id = ? AND enviado_en IS NOT NULL AND entregado_en IS NULL
                    AND creado_en > DATE_SUB(NOW(), INTERVAL " . PUSH_VIGENCIA_HORAS . " HOUR)
                  ORDER BY id ASC LIMIT 1"
            );
            $st->execute([(int) $sid]);
            $a = $st->fetch();
            if (!$a) break;
            $u = $pdo->prepare('UPDATE push_avisos SET entregado_en = NOW() WHERE id = ? AND entregado_en IS NULL');
            $u->execute([(int) $a['id']]);
            if ($u->rowCount() === 1) {
                $pdo->prepare('UPDATE push_suscripciones SET ultimo_ok = NOW(), fallos = 0 WHERE id = ?')->execute([(int) $sid]);
                return ['titulo' => (string) $a['titulo'], 'cuerpo' => (string) $a['cuerpo'],
                        'url' => (string) ($a['url'] ?? ''), 'tag' => 'edupago-' . $a['tipo']];
            }
        }
    } catch (\Throwable $e) {
        // sin tablas o sin base: el aviso genérico igual se muestra
    }
    return $generico;
}

// ════════════════════════════════════════════════════════════════════════
// Encolar (barato, nunca lanza)
// ════════════════════════════════════════════════════════════════════════

/**
 * Encola un aviso del $tipo para cada suscripción de los usuarios que devuelve $sql_usuarios
 * (un SELECT de ids de usuarios, con sus $params). Un solo INSERT ... SELECT. No encola si esa
 * suscripción ya tiene un aviso del mismo tipo sin entregar de los últimos minutos (varios
 * eventos seguidos = un solo aviso). Después programa el despacho DESPUÉS de responder.
 *
 * NUNCA lanza: si falta la migración o falla algo, devuelve 0 y la lógica que lo llamó sigue igual.
 *
 * @param array $op 'dedupe' (bool, true), 'tope_cierre' (seg. si se puede cerrar la respuesta, 3.0),
 *                  'tope_sin_cierre' (seg. si NO se puede, 0 = no despachar en esta petición)
 */
function push_encolar(PDO $pdo, string $tipo, string $sql_usuarios, array $params, array $op = []): int
{
    try {
        $t = push_texto_tipo($tipo);
        $dedupe = $op['dedupe'] ?? true;
        $sql = "INSERT INTO push_avisos (suscripcion_id, tipo, titulo, cuerpo, url, creado_en)
                SELECT s.id, ?, ?, ?, ?, NOW()
                  FROM push_suscripciones s
                 WHERE s.usuario_id IN ($sql_usuarios) AND s.fallos < " . PUSH_MAX_FALLOS;
        $par = array_merge([$tipo, $t['titulo'], $t['cuerpo'], $t['url'] !== '' ? $t['url'] : null], $params);
        if ($dedupe) {
            $sql .= " AND NOT EXISTS (SELECT 1 FROM push_avisos a WHERE a.suscripcion_id = s.id AND a.tipo = ?
                                       AND a.entregado_en IS NULL
                                       AND a.creado_en > DATE_SUB(NOW(), INTERVAL " . PUSH_DEDUPE_MINUTOS . " MINUTE))";
            $par[] = $tipo;
        }
        $st = $pdo->prepare($sql);
        $st->execute($par);
        $n = $st->rowCount();
        if ($n > 0) push_programar_despacho($pdo, (float) ($op['tope_cierre'] ?? 3.0), (float) ($op['tope_sin_cierre'] ?? 0.0));
        return $n;
    } catch (\Throwable $e) {
        // Sin migración es lo esperado antes de desplegarla: no ensucia el log.
        if (stripos($e->getMessage(), "doesn't exist") === false) push_log('no se pudo encolar ' . $tipo . ': ' . $e->getMessage());
        return 0;
    }
}

/** Pago confirmado o abono aplicado → familia de los alumnos de esos cobros. Nunca lanza. */
function push_aviso_pago_cobros(PDO $pdo, array $cobro_ids, string $tipo = 'pago_confirmado'): int
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $cobro_ids))));
    if (!$ids) return 0;
    $ph = implode(',', array_fill(0, count($ids), '?'));
    return push_encolar($pdo, $tipo,
        "SELECT u.id FROM usuarios u
          WHERE u.rol = 'familia' AND u.activo = 1 AND u.familia_id IN (
                SELECT cl.familia_id FROM clientes cl JOIN cobros co ON co.cliente_id = cl.id
                 WHERE co.id IN ($ph) AND cl.familia_id IS NOT NULL)",
        $ids);
}

/** Periodo publicado → familias y alumnos con calificaciones en ese periodo. Nunca lanza. */
function push_aviso_periodo(PDO $pdo, int $escuela_id, int $periodo_id): int
{
    $alumnos = "SELECT DISTINCT ca.cliente_id FROM calificaciones ca
                 WHERE ca.periodo_id = ? AND ca.escuela_id = ? AND ca.calificacion IS NOT NULL";
    return push_encolar($pdo, 'calificaciones',
        "SELECT u.id FROM usuarios u
          WHERE u.activo = 1 AND (
                (u.rol = 'familia' AND u.familia_id IN (SELECT cl.familia_id FROM clientes cl WHERE cl.familia_id IS NOT NULL AND cl.id IN ($alumnos)))
             OR (u.rol = 'alumno'  AND u.cliente_id IN ($alumnos)))",
        [$periodo_id, $escuela_id, $periodo_id, $escuela_id],
        ['tope_cierre' => 15.0, 'tope_sin_cierre' => 3.0]);
}

/** Soporte respondió (mensaje público, nunca nota interna) → admin y cajero de ESA escuela. Nunca lanza. */
function push_aviso_soporte_respondio(PDO $pdo, int $escuela_id): int
{
    return push_encolar($pdo, 'soporte_respuesta',
        "SELECT u.id FROM usuarios u WHERE u.rol IN ('admin', 'cajero') AND u.activo = 1 AND u.escuela_id = ?",
        [$escuela_id], ['tope_sin_cierre' => 3.0]);
}

/** Ticket nuevo ('soporte_nuevo') o respuesta del colegio ('soporte_colegio') → soporte y superadmin. Nunca lanza. */
function push_aviso_a_plataforma(PDO $pdo, string $tipo): int
{
    return push_encolar($pdo, $tipo,
        "SELECT u.id FROM usuarios u WHERE u.rol IN ('soporte', 'superadmin') AND u.activo = 1",
        [], ['tope_sin_cierre' => 3.0]);
}

// ════════════════════════════════════════════════════════════════════════
// Despachar (HTTP a los servicios de push)
// ════════════════════════════════════════════════════════════════════════

/**
 * Programa el despacho para DESPUÉS de responder. Una sola vez por petición. En CLI no hace
 * nada (el cron despacha al final). Si el servidor puede cerrar la respuesta
 * (fastcgi_finish_request / litespeed_finish_request), el despacho corre ya con el cliente
 * desconectado, con tope de $tope_cierre segundos. Si no puede, solo corre con
 * $tope_sin_cierre > 0 (acciones de pantalla); en los webhooks queda 0: se deja en cola para el
 * cron antes que hacer esperar al proveedor.
 */
function push_programar_despacho(PDO $pdo, float $tope_cierre = 3.0, float $tope_sin_cierre = 0.0): void
{
    static $programado = false;
    if ($programado || PHP_SAPI === 'cli') return;
    $puede_cerrar = function_exists('fastcgi_finish_request') || function_exists('litespeed_finish_request');
    $tope = $puede_cerrar ? $tope_cierre : $tope_sin_cierre;
    if ($tope <= 0) return;
    $programado = true;
    register_shutdown_function(function () use ($pdo, $tope, $puede_cerrar) {
        try {
            @ignore_user_abort(true);
            if ($puede_cerrar) {
                // exit ya ocurrió: lo que haya en los buffers de salida hay que soltarlo ANTES de cerrar.
                while (ob_get_level() > 0) @ob_end_flush();
                @flush();
                if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
                else litespeed_finish_request();
            }
            @set_time_limit((int) ceil($tope) + 10);
            if ($pdo->inTransaction()) return;   // jamás despachar con una transacción de dinero abierta
            push_despachar($pdo, $tope, 30);
        } catch (\Throwable $e) {
            push_log('despacho al cierre: ' . $e->getMessage());
        }
    });
}

/**
 * Toma los avisos pendientes (hasta $lote) y los marca como enviados (enviado_en = ahora,
 * intentos + 1) bajo un candado, para que dos procesos no manden lo mismo. El candado solo dura
 * lo que tarda el SELECT + UPDATE; el envío va fuera de él.
 *
 * @return array[] filas con id, suscripcion_id, tipo, endpoint
 */
function push_reclamar(PDO $pdo, int $lote, ?int $usuario_id = null, array $excluir = []): array
{
    $candado = 'edupago_push_reclamo';
    $got = (int) $pdo->query("SELECT GET_LOCK('$candado', 2)")->fetchColumn();
    if ($got !== 1) return [];
    try {
        $sql = "SELECT a.id, a.suscripcion_id, a.tipo, s.endpoint
                  FROM push_avisos a JOIN push_suscripciones s ON s.id = a.suscripcion_id
                 WHERE a.enviado_en IS NULL AND a.intentos < " . PUSH_MAX_INTENTOS . "
                   AND a.creado_en > DATE_SUB(NOW(), INTERVAL " . PUSH_VIGENCIA_HORAS . " HOUR)
                   AND s.fallos < " . PUSH_MAX_FALLOS
             . ($usuario_id !== null ? ' AND s.usuario_id = ' . (int) $usuario_id : '')
             . ($excluir ? ' AND a.id NOT IN (' . implode(',', array_map('intval', $excluir)) . ')' : '')
             . " ORDER BY a.id ASC LIMIT " . (int) $lote;
        $filas = $pdo->query($sql)->fetchAll();
        if ($filas) {
            $ids = implode(',', array_map('intval', array_column($filas, 'id')));
            $pdo->exec("UPDATE push_avisos SET enviado_en = NOW(), intentos = intentos + 1 WHERE id IN ($ids) AND enviado_en IS NULL");
        }
        return $filas;
    } finally {
        $pdo->query("SELECT RELEASE_LOCK('$candado')")->fetchAll();
    }
}

/**
 * Despacha avisos pendientes por lotes, en paralelo (curl_multi), hasta $tope_seg segundos.
 * Marca cada uno: enviado (2xx), suscripción muerta (404/410: se borra), o fallo (se reintenta
 * hasta PUSH_MAX_INTENTOS y la suscripción acumula fallos; tras PUSH_MAX_FALLOS queda
 * desactivada hasta que el usuario la reactive). Nunca lanza.
 *
 * @return array{enviados:int, fallidos:int, eliminadas:int, detalle:array}
 */
function push_despachar(PDO $pdo, float $tope_seg = 3.0, int $lote = 30, ?int $usuario_id = null): array
{
    $res = ['enviados' => 0, 'fallidos' => 0, 'eliminadas' => 0, 'detalle' => []];
    try {
        if (!function_exists('curl_multi_init') || !push_tablas_listas($pdo)) return $res;
        $ll = push_llaves();
        if ($ll === null) return $res;
        $sub = push_sub_vapid();
        $t0 = microtime(true);
        $firmas = [];
        $intentados = [];

        while (microtime(true) - $t0 < $tope_seg) {
            // Lo ya intentado en ESTA corrida no se reclama otra vez: un reintento va en la siguiente
            // (el cron, o el próximo evento), no en un bucle contra un servicio que acaba de fallar.
            $filas = push_reclamar($pdo, $lote, $usuario_id, $intentados);
            if (!$filas) break;
            foreach ($filas as $f) $intentados[] = (int) $f['id'];

            $mh = curl_multi_init();
            $hs = [];
            $resuelto = [];   // id de aviso => código HTTP (0 = no hubo respuesta)
            $restante = max(1.0, $tope_seg - (microtime(true) - $t0));
            foreach ($filas as $f) {
                $id = (int) $f['id'];
                if (!push_endpoint_valido((string) $f['endpoint'])) { $resuelto[$id] = 410; continue; }   // dirección inválida: se descarta
                $aud = push_aud_de_endpoint($f['endpoint']);
                if (!isset($firmas[$aud])) $firmas[$aud] = push_jwt_vapid($aud, $ll['privada'], $sub);
                if (!$firmas[$aud]) { $resuelto[$id] = 0; continue; }
                $urg = push_texto_tipo((string) $f['tipo'])['urgencia'];
                $ch = curl_init($f['endpoint']);
                curl_setopt_array($ch, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_POST           => true,
                    CURLOPT_POSTFIELDS     => '',
                    CURLOPT_HTTPHEADER     => [
                        'TTL: ' . PUSH_TTL_SEGUNDOS,
                        'Urgency: ' . $urg,
                        'Content-Length: 0',
                        'Authorization: vapid t=' . $firmas[$aud] . ', k=' . $ll['publica'],
                    ],
                    CURLOPT_TIMEOUT        => (int) max(2, min(5, ceil($restante))),
                    CURLOPT_CONNECTTIMEOUT => 2,
                    CURLOPT_FOLLOWLOCATION => false,
                    CURLOPT_PROTOCOLS      => CURLPROTO_HTTPS,
                    CURLOPT_SSL_VERIFYPEER => true,
                    CURLOPT_SSL_VERIFYHOST => 2,
                ]);
                curl_multi_add_handle($mh, $ch);
                $hs[$id] = $ch;
            }
            $corriendo = 0;
            $limite = microtime(true) + $restante + 1.5;
            do {
                $st = curl_multi_exec($mh, $corriendo);
                if ($corriendo > 0) curl_multi_select($mh, 0.2);
            } while ($corriendo > 0 && $st === CURLM_OK && microtime(true) < $limite);
            foreach ($hs as $id => $ch) {
                $resuelto[$id] = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_multi_remove_handle($mh, $ch);
                curl_close($ch);
            }
            curl_multi_close($mh);

            // Resultado por aviso y, una sola vez, por suscripción.
            $porSusc = [];   // suscripcion_id => 'ok' | 'muerta' | 'fallo'
            foreach ($filas as $f) {
                $id = (int) $f['id']; $sid = (int) $f['suscripcion_id'];
                $cod = $resuelto[$id] ?? 0;
                $res['detalle'][] = ['aviso_id' => $id, 'suscripcion_id' => $sid, 'codigo' => $cod];
                if ($cod >= 200 && $cod < 300) {
                    $res['enviados']++;
                    if (($porSusc[$sid] ?? '') === '') $porSusc[$sid] = 'ok';
                } elseif ($cod === 404 || $cod === 410) {
                    $porSusc[$sid] = 'muerta';
                } else {
                    $res['fallidos']++;
                    // Se libera para el reintento (intentos ya subió al reclamarlo; al tope queda fallido).
                    $pdo->prepare('UPDATE push_avisos SET enviado_en = NULL WHERE id = ?')->execute([$id]);
                    if (($porSusc[$sid] ?? '') !== 'muerta') $porSusc[$sid] = 'fallo';
                }
            }
            foreach ($porSusc as $sid => $r) {
                if ($r === 'ok') {
                    $pdo->prepare('UPDATE push_suscripciones SET ultimo_ok = NOW(), fallos = 0 WHERE id = ?')->execute([$sid]);
                } elseif ($r === 'muerta') {
                    push_borrar_suscripcion($pdo, $sid);
                    $res['eliminadas']++;
                } else {
                    $pdo->prepare('UPDATE push_suscripciones SET fallos = fallos + 1 WHERE id = ?')->execute([$sid]);
                }
            }
            if (count($filas) < $lote) break;
        }
    } catch (\Throwable $e) {
        push_log('despacho: ' . $e->getMessage());
    }
    return $res;
}

/** Limpieza que hace el cron: avisos viejos, huérfanos y suscripciones desactivadas hace meses. */
function push_mantenimiento(PDO $pdo): array
{
    $r = ['avisos' => 0, 'suscripciones' => 0];
    try {
        $r['avisos'] = (int) $pdo->exec('DELETE FROM push_avisos WHERE creado_en < DATE_SUB(NOW(), INTERVAL 30 DAY)');
        $pdo->exec('DELETE a FROM push_avisos a LEFT JOIN push_suscripciones s ON s.id = a.suscripcion_id WHERE s.id IS NULL');
        $r['suscripciones'] = (int) $pdo->exec('DELETE FROM push_suscripciones WHERE fallos >= ' . PUSH_MAX_FALLOS
            . ' AND COALESCE(ultimo_ok, creado_en) < DATE_SUB(NOW(), INTERVAL 60 DAY)');
    } catch (\Throwable $e) {
        push_log('mantenimiento: ' . $e->getMessage());
    }
    return $r;
}
