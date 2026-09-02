<?php
/**
 * PRUEBA AISLADA — solo para confirmar la IP pública de SALIDA real de este
 * servidor (la que ve Cobroscontarjeta.com cuando llamamos a su API), para
 * dársela si piden ponerla en su whitelist.
 *
 * Corre esto una vez (php test_ip_publica.php, o desde el navegador) y
 * BÓRRALO del servidor cuando termines — no necesita credenciales, pero no
 * hay razón para dejarlo accesible por URL.
 */

// GET simple, sin usar curl_post() (ese helper del proyecto siempre manda
// POST + JSON, y estos servicios de "cuál es mi IP" solo aceptan GET).
function consultar($url) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $body = curl_exec($ch);
    $err  = curl_error($ch);
    curl_close($ch);
    return $err ? "(error: {$err})" : trim($body ?: '(sin respuesta)');
}

// Dos servicios independientes de "cuál es mi IP", por si uno falla o
// alguno de los dos difiere (algunos hostings usan varias IPs de salida).
echo "IP pública (ipify):    " . consultar('https://api.ipify.org') . "\n";
echo "IP pública (ifconfig):  " . consultar('https://ifconfig.me/ip') . "\n";
