<?php
// facturapi.php
//
// Cliente HTTP compartido para Facturapi.io (el PAC de facturación) —
// reemplaza 3 bloques curl_init/curl_setopt_array/curl_exec/curl_close casi
// idénticos en api.php (generar_cfdi, descargar_cfdi, enviar_factura_correo).
// Los 3 tenían CURLOPT_SSL_VERIFYPEER hardcodeado en false — a diferencia
// del resto del código, que usa true en curl_post() (api.php) — se corrige
// aquí. Facturapi.io es un proveedor completamente distinto de Pagadetodo/
// Cobroscontarjeta.com (facturación fiscal, no procesamiento de pagos), por
// eso vive aparte de helpers_pagos.php/webhook_helpers.php.
//
// IMPORTANTE: pasar CURLOPT_SSL_VERIFYPEER de false a true puede fallar si
// el bundle de certificados CA del servidor está desactualizado — probar
// una factura real (generar/descargar/enviar) antes de confiar en esto en
// producción.

function facturapi_request($ruta, $metodo = 'GET', $payload = null) {
    $ch = curl_init('https://www.facturapi.io/v2/' . $ruta);
    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . FACTURAPI_KEY],
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_SSL_VERIFYPEER => true,
    ];
    if ($metodo === 'POST') {
        $opts[CURLOPT_POST] = true;
        $opts[CURLOPT_POSTFIELDS] = json_encode($payload);
        $opts[CURLOPT_HTTPHEADER][] = 'Content-Type: application/json';
    } else {
        // Descarga de XML/PDF (descargar_cfdi, enviar_factura_correo):
        // Facturapi puede responder con una redirección al binario real.
        $opts[CURLOPT_FOLLOWLOCATION] = true;
    }
    curl_setopt_array($ch, $opts);
    $body      = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err       = curl_error($ch);
    curl_close($ch);
    return ['body' => $body, 'error' => $err, 'http_code' => $http_code];
}
