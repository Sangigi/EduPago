<?php
error_reporting(E_ALL);
ini_set('display_errors', '1');

/**
 * PRUEBA AISLADA — NO tocar producción hasta confirmar éxito real aquí.
 * Corre este script directo (php test_domiciliacion.php, o desde el
 * navegador si el hosting lo permite) contra el endpoint de domiciliación
 * (GenerarLigaDomiciliacionIndi / PLE_URL_LIGA_TOKEN) usando el MISMO
 * formato de Id/Reference que ya sabemos que funciona en el endpoint
 * simple (GenerarLigaIndi) — 9 y 15 dígitos, con ceros a la izquierda,
 * enviados como STRING.
 *
 * Si esto responde "code":"success", entonces sí puedes migrar
 * generar_liga.php de PLE_URL_LIGA_SIMPLE a PLE_URL_LIGA_TOKEN.
 * Si NO responde success, guarda la respuesta cruda y mándasela al
 * proveedor — probablemente falte algo de su lado (SchoolID vs
 * BusinessID, un campo extra, etc.) pese a que digan que "ya funciona".
 *
 * IMPORTANTE: borra este archivo del servidor cuando termines de probar
 * (contiene credenciales del proveedor vía config.php y queda accesible
 * si tu hosting permite ejecutar PHP sueltos por URL).
 */

require __DIR__ . '/config.php';
require __DIR__ . '/lib/curl_helper.php';

// Folio/monto de prueba — usa un monto bajo real de Sandbox, NUNCA un
// cobro real de producción para esta prueba.
$base    = intval(substr(strval(time()), -6)) . mt_rand(100, 999);
$id_pago = str_pad($base, 9,  '0', STR_PAD_LEFT);
$ref     = str_pad($base, REFERENCIA_DIGITOS, '0', STR_PAD_LEFT);

$payload = [
    'User'           => PLE_USER,
    'Password'       => PLE_PASS,
    'IntegrationID'  => intval(PLE_INT_ID_ACTIVO),
    'SchoolID'       => PLE_SCHOOL_ID_ACTIVO,
    'BusinessID'     => PLE_SCHOOL_ID_ACTIVO,
    'PaymentTypes'   => PLE_PAYMENT_TYPES,
    'Id'             => $id_pago,
    'Description'    => 'PRUEBA domiciliacion - borrar',
    'Amount'         => 5000, // $50.00 de prueba
    'Reference'      => $ref,
    'ExpirationDate' => date('Y-m-d', strtotime('+1 day')),
];

echo "=== Probando endpoint de DOMICILIACIÓN ===\n";
echo "URL: " . PLE_URL_LIGA_TOKEN . "\n";
echo "Id: {$id_pago}  Reference: {$ref}\n\n";

$res = curl_post(PLE_URL_LIGA_TOKEN, $payload);

echo "HTTP code: " . ($res['http_code'] ?? '?') . "\n";
if ($res['error']) {
    echo "ERROR DE RED: " . $res['error'] . "\n";
    exit(1);
}

echo "Respuesta cruda:\n";
echo $res['body'] . "\n\n";

$raw = json_decode($res['body'], true) ?? [];
$data_resp = [];
foreach ($raw as $k => $v) { $data_resp[trim($k)] = $v; }
$codigo_resp = $data_resp['code'] ?? null;
$url_pago    = $data_resp['url'] ?? $data_resp['Url'] ?? $data_resp['URL'] ?? null;

if ($codigo_resp === 'success' && $url_pago) {
    echo "✅ ÉXITO — el endpoint de domiciliación SÍ respondió success.\n";
    echo "URL de pago: {$url_pago}\n";
    echo "Ahora sí puedes migrar generar_liga.php a PLE_URL_LIGA_TOKEN.\n";
} else {
    echo "❌ TODAVÍA NO — no respondió success.\n";
    echo "Código: " . ($codigo_resp ?? 'null') . "\n";
    echo "Mensaje: " . ($data_resp['message'] ?? $data_resp['Message'] ?? '(sin mensaje)') . "\n";
    echo "Manda esta respuesta completa al proveedor antes de migrar nada.\n";
}