<?php
/**
 * diagnostico_smtp.php — Prueba la configuracion de correo sin correr el cron.
 *
 * Uso (solo por linea de comandos):
 *
 *     php diagnostico_smtp.php                    solo revisa conexion y login
 *     php diagnostico_smtp.php tu@correo.com      ademas manda un correo de prueba
 *
 * Va paso a paso y se detiene en el primero que falle, diciendo que significa.
 * Asi puedes corregir config.php e intentar de nuevo en segundos, en vez de
 * correr todo cron_recordatorios.php cada vez.
 *
 * BORRA ESTE ARCHIVO cuando termines: imprime la configuracion del servidor.
 */

if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    exit("Este diagnostico solo corre por linea de comandos.\n");
}

require_once __DIR__ . '/config.php';

$destino = $argv[1] ?? null;

// Lee una respuesta SMTP completa. Puede venir en varias lineas: la ultima
// lleva un ESPACIO en la 4a posicion ("250 OK") y las intermedias un guion
// ("250-EXTENSION"). Leer solo la primera desfasa todo el dialogo — es
// exactamente lo que hacia este script antes, y por eso interpretaba el
// segundo renglon del saludo como si fuera la respuesta al EHLO.
function leer_respuesta($socket) {
    $buffer = '';
    while (($linea = fgets($socket, 1024)) !== false) {
        $buffer .= $linea;
        if (strlen($linea) < 4 || $linea[3] === ' ') break;
    }
    return $buffer;
}

function paso($n, $texto) { echo "\n[$n] $texto\n"; }
function ok($m)   { echo "    OK    $m\n"; }
function falla($m, $ayuda = '') {
    echo "    FALLA $m\n";
    if ($ayuda) echo "\n    -> $ayuda\n";
    echo "\n";
    exit(1);
}

echo "═══ Diagnostico de correo saliente ═══\n";

// ── 1. Constantes ────────────────────────────────────────────
paso(1, 'Revisando la configuracion');

$requeridas = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM_EMAIL'];
foreach ($requeridas as $c) {
    if (!defined($c)) falla("falta la constante $c en config.php");
}
// La contrasena nunca se imprime.
printf("    host     %s:%d (%s)\n", SMTP_HOST, SMTP_PORT, SMTP_SECURE);
printf("    usuario  %s\n", SMTP_USER);
printf("    from     %s\n", SMTP_FROM_EMAIL);
printf("    password %s\n", SMTP_PASS === '' ? '(VACIA)' : str_repeat('*', min(12, strlen(SMTP_PASS))));

if (SMTP_PASS === '') falla('la contrasena esta vacia');

// Coherencia de dominios: causa tipica de que los correos caigan en spam.
$domUser = substr(strrchr(SMTP_USER, '@'), 1);
$domFrom = substr(strrchr(SMTP_FROM_EMAIL, '@'), 1);
$domHost = preg_replace('/^(mail|smtp)\./i', '', SMTP_HOST);

if (strcasecmp(SMTP_USER, SMTP_FROM_EMAIL) !== 0) {
    echo "\n    AVISO: SMTP_FROM_EMAIL no es igual a SMTP_USER.\n";
    echo "           Muchos servidores rechazan un From distinto al autenticado.\n";
}
if (strcasecmp($domUser, $domHost) !== 0) {
    echo "\n    AVISO: el usuario es de '$domUser' pero el host es '" . SMTP_HOST . "'.\n";
    echo "           Revisa que sea el buzon del dominio correcto.\n";
}
ok('constantes presentes');

// ── 2. Conexion ──────────────────────────────────────────────
paso(2, 'Conectando al servidor');

$host = (strtolower(SMTP_SECURE) === 'ssl' ? 'ssl://' : '') . SMTP_HOST;
$socket = @stream_socket_client($host . ':' . SMTP_PORT, $errno, $errstr, 15);
if (!$socket) {
    falla("no se pudo conectar a " . SMTP_HOST . ":" . SMTP_PORT . " ($errno: $errstr)",
          "Revisa el host y el puerto. Con SSL suele ser 465; con TLS/STARTTLS, 587.\n" .
          "       Si el error es 'Connection refused', el puerto esta cerrado o es el equivocado.");
}
stream_set_timeout($socket, 15);
$saludo = leer_respuesta($socket);
if (strpos($saludo, '220') !== 0) {
    falla("el servidor no saludo con 220: " . trim($saludo));
}
// Se muestra solo la primera linea: algunos servidores mandan un aviso legal
// de varios renglones que no aporta nada al diagnostico.
ok('conectado — ' . trim(strtok($saludo, "\n")));

// ── 3. EHLO ──────────────────────────────────────────────────
paso(3, 'Presentandose (EHLO)');

fwrite($socket, "EHLO " . $domFrom . "\r\n");
$resp = leer_respuesta($socket);
if (strpos($resp, '250') !== 0) falla("EHLO rechazado: " . trim($resp));
ok('aceptado');

$soportaAuth = stripos($resp, 'AUTH') !== false;
if (!$soportaAuth) {
    echo "    AVISO: el servidor no anuncio AUTH. Puede exigir STARTTLS antes.\n";
}

// ── 4. Autenticacion ─────────────────────────────────────────
paso(4, 'Autenticando');

function cmd($socket, $linea, $esperado) {
    fwrite($socket, $linea . "\r\n");
    $r = leer_respuesta($socket);
    return [strpos($r, (string)$esperado) === 0, trim($r)];
}

list($okAuth, $r) = cmd($socket, 'AUTH LOGIN', 334);
if (!$okAuth) falla("el servidor no acepto AUTH LOGIN: $r",
                    "Puede requerir STARTTLS (puerto 587) en vez de SSL directo (465).");

list($okUser, $r) = cmd($socket, base64_encode(SMTP_USER), 334);
if (!$okUser) falla("no acepto el usuario: $r");

list($okPass, $r) = cmd($socket, base64_encode(SMTP_PASS), 235);
if (!$okPass) {
    falla("login rechazado: $r",
          "Si dice '535 Incorrect authentication data', el usuario o la contrasena\n" .
          "       no son correctos para ESE host. Verifica en el panel de tu hosting:\n" .
          "         · que el buzon " . SMTP_USER . " exista en " . SMTP_HOST . "\n" .
          "         · que la contrasena sea la del buzon, no la del panel\n" .
          "         · que no haya espacios de mas al copiarla en config.php");
}
ok('autenticado correctamente');

// ── 5. Envio de prueba ───────────────────────────────────────
if (!$destino) {
    echo "\n═══ Conexion y login CORRECTOS ═══\n";
    echo "Para mandar un correo de prueba:\n";
    echo "    php diagnostico_smtp.php tu@correo.com\n\n";
    fwrite($socket, "QUIT\r\n");
    fclose($socket);
    exit(0);
}

paso(5, "Enviando correo de prueba a $destino");

list($okFrom, $r) = cmd($socket, 'MAIL FROM:<' . SMTP_FROM_EMAIL . '>', 250);
if (!$okFrom) falla("MAIL FROM rechazado: $r",
                    "El servidor no permite enviar como " . SMTP_FROM_EMAIL . ".\n" .
                    "       Normalmente SMTP_FROM_EMAIL debe ser igual a SMTP_USER.");

list($okRcpt, $r) = cmd($socket, 'RCPT TO:<' . $destino . '>', 250);
if (!$okRcpt) falla("RCPT TO rechazado: $r");

list($okData, $r) = cmd($socket, 'DATA', 354);
if (!$okData) falla("DATA rechazado: $r");

$nombre = defined('SMTP_FROM_NAME') ? SMTP_FROM_NAME : 'Sistema';
$cuerpo = "From: $nombre <" . SMTP_FROM_EMAIL . ">\r\n"
        . "To: <$destino>\r\n"
        . "Subject: Prueba de correo saliente\r\n"
        . "MIME-Version: 1.0\r\n"
        . "Content-Type: text/html; charset=UTF-8\r\n\r\n"
        . "<p>Si lees esto, el correo saliente ya funciona.</p>"
        . "<p>Enviado desde diagnostico_smtp.php el " . date('d/m/Y H:i:s') . ".</p>\r\n"
        . ".\r\n";
fwrite($socket, $cuerpo);
$r = leer_respuesta($socket);
if (strpos($r, '250') !== 0) falla("el servidor no acepto el mensaje: " . trim($r));

ok('mensaje aceptado por el servidor');
fwrite($socket, "QUIT\r\n");
fclose($socket);

echo "\n═══ TODO CORRECTO ═══\n";
echo "Revisa la bandeja de $destino (y la carpeta de spam).\n";
echo "Si llego a spam, es por SPF/DKIM del dominio, no por esta configuracion.\n\n";
echo "Ya puedes correr: php cron_recordatorios.php\n";
echo "Y acuerdate de borrar diagnostico_smtp.php cuando termines.\n\n";
