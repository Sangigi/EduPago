<?php
// lib/curl_helper.php — curl_post()/log_api() vivían solo dentro de api.php,
// así que ningún script fuera del ciclo de petición HTTP (como
// cron_recordatorios.php, que corre por CLI y nunca incluye api.php) podía
// llamar a un proveedor de pago externo. Se extraen aquí para que ambos
// (api.php y el cron) los compartan sin duplicar la implementación.

function curl_post($url, $payload, $headers = []) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => array_merge(['Content-Type: application/json'], $headers),
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $result    = curl_exec($ch);
    $err       = curl_error($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['body' => $result, 'error' => $err, 'http_code' => $http_code];
}

function log_api($msg) {
    if (!API_LOG_ENABLED) return;
    file_put_contents(API_LOG_FILE, date('Y-m-d H:i:s') . ' | ' . $msg . "\n", FILE_APPEND);
}
