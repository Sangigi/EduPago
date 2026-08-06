<?php
/**
 * EduPago — Diagnóstico de entorno
 * Accede a: https://tudominio.com/diagnostico.php
 * ELIMINA ESTE ARCHIVO después de verificar que todo funciona.
 */

// Protección básica: solo accesible localmente o con token
$token = $_GET['token'] ?? '';
if ($token !== 'edupago_check_2026') {
    http_response_code(403);
    die('Acceso denegado. Usa: diagnostico.php?token=edupago_check_2026');
}

header('Content-Type: text/html; charset=UTF-8');

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

function check($label, $ok, $detail = '') {
    $icon  = $ok ? '✅' : '❌';
    $color = $ok ? '#16a34a' : '#dc2626';
    echo "<tr><td>{$icon} {$label}</td><td style='color:{$color}'>" . ($ok ? 'OK' : 'FALLO') . "</td><td style='color:#666;font-size:12px'>{$detail}</td></tr>";
}

?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>EduPago — Diagnóstico</title>
<style>
  body { font-family: sans-serif; max-width: 700px; margin: 40px auto; padding: 20px; }
  h1 { color: #1e3a8a; } h2 { color: #334155; margin-top: 30px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
  td:first-child { font-weight: 600; width: 40%; }
  .warn { background: #fef9c3; padding: 12px; border-radius: 8px; font-size: 13px; }
</style>
</head>
<body>
<h1>🔍 EduPago — Diagnóstico de entorno</h1>

<h2>Planteles / Escuelas (BD real)</h2>
<table>
<?php
try {
    $stmt = $pdo->query("SELECT id, nombre, es_plantel, escuela_padre_id FROM escuelas ORDER BY id");
    $escs = $stmt->fetchAll();
    foreach ($escs as $e) {
        $tipo = $e['es_plantel'] ? 'PLANTEL de escuela #' . $e['escuela_padre_id'] : 'ESCUELA principal';
        check('Escuela #' . $e['id'] . ' — ' . $e['nombre'], true, $tipo . ' (es_plantel tipo PHP: ' . gettype($e['es_plantel']) . ' = ' . var_export($e['es_plantel'], true) . ')');
    }
} catch (Exception $ex) {
    check('Consulta escuelas', false, $ex->getMessage());
}
try {
    $stmt2 = $pdo->query("SELECT id, escuela_id, escuela_plantel_id, nombre, activo FROM planteles ORDER BY escuela_id, id");
    $plts = $stmt2->fetchAll();
    if (!$plts) {
        check('Tabla planteles', true, 'Vacía — no hay filas');
    }
    foreach ($plts as $p) {
        check('Plantel #' . $p['id'] . ' — ' . $p['nombre'], true, 'escuela_id (tipo ' . gettype($p['escuela_id']) . ') = ' . var_export($p['escuela_id'], true) . ' → escuela_plantel_id ' . $p['escuela_plantel_id'] . ' | activo=' . var_export($p['activo'], true));
    }
} catch (Exception $ex) {
    check('Consulta planteles', false, $ex->getMessage());
}
?>
</table>

<h2>Webhook SPEI</h2>
<table>
<?php
// Simular recepción de webhook
$testWebhookPayload = json_encode([
    'clabe'       => '646180633000TEST',
    'monto'       => '10000',
    'transaccion' => 'TEST123',
    'fecha'       => date('Y-m-d'),
]);
$archivoTest = __DIR__ . '/pagos_spei.json';
$canWrite = is_writable(__DIR__);
check('Puede escribir pagos_spei.json', $canWrite, $canWrite ? 'OK' : 'Sin permisos de escritura');

$jsonExists = file_exists($archivoTest);
$pagosData  = $jsonExists ? json_decode(file_get_contents($archivoTest), true) : [];
check('pagos_spei.json existe', $jsonExists, $jsonExists ? count($pagosData) . ' pagos registrados' : 'Se creará al primer pago');
check('URL del webhook', true, WEBHOOK_URL);
?>
</table>

<h2>PHP y extensiones</h2>
<table>
<?php
check('PHP versión', version_compare(PHP_VERSION, '7.4', '>='), PHP_VERSION);
check('Extensión cURL', extension_loaded('curl'), 'Requerida para llamadas a Pagadetodo');
check('Extensión JSON', extension_loaded('json'));
check('Extensión OpenSSL', extension_loaded('openssl'), 'Requerida para HTTPS');
check('allow_url_fopen', ini_get('allow_url_fopen'), 'Para llamadas HTTP');
check('Escritura en directorio', is_writable(__DIR__), 'Para api_log.txt');
?>
</table>

<h2>Conectividad con Pagadetodo.mx</h2>
<table>
<?php
// Probar conexión SPEI (CLABE)
$testPayload = [
    'User'           => PDT_USER,
    'Password'       => PDT_PASS,
    'IntegrationID'  => PDT_INT_ID,
    'BusinessID'     => PDT_BUS_ID_SPEI,
    'Description'    => 'Test EduPago',
    'Account'        => '000000000000001',
    'CustomerEmail'  => 'test@test.com',
    'CustomerName'   => 'Test',
    'ExpirationDate' => date('Y-m-d', strtotime('+1 day')),
];

$ch = curl_init(PDT_URL_CLABE);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    CURLOPT_POSTFIELDS     => json_encode($testPayload),
    CURLOPT_TIMEOUT        => 15,
    CURLOPT_SSL_VERIFYPEER => false,
]);
$result   = curl_exec($ch);
$err      = curl_error($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$respData  = json_decode($result, true);
$clabe     = $respData['Clabe'] ?? $respData['response']['Clabe'] ?? null;
$tieneClabe = !empty($clabe);

check('Alcanza pagadetodo.mx', !$err && $httpCode > 0, "HTTP {$httpCode}");
check('API SPEI responde', $httpCode === 200, "Código: {$httpCode}");
check('Genera CLABE real', $tieneClabe, $tieneClabe ? "CLABE: {$clabe}" : "Resp: " . substr($result, 0, 100));

// Probar conexión ligas de pago
$ts2      = intval(substr(time(), -6));
$rand2    = rand(100, 999);
$base2    = $ts2 . $rand2;
$id2      = str_pad($base2, 9,  '0', STR_PAD_LEFT);
$ref2     = str_pad($base2, 15, '0', STR_PAD_LEFT);

$testLiga = [
    'User'          => PDT_USER,
    'Password'      => PDT_PASS,
    'IntegrationID' => PDT_INT_ID,
    'BusinessID'    => PDT_BUS_ID_TC,
    'PaymentTypes'  => '401',
    'Id'            => $id2,
    'Description'   => 'Test EduPago',
    'Amount'        => 5000,
    'Reference'     => $ref2,
    'ExpirationDate'=> date('Y-m-d', strtotime('+1 day')),
];

$ch2 = curl_init(PDT_URL_LIGA);
curl_setopt_array($ch2, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    CURLOPT_POSTFIELDS     => json_encode($testLiga),
    CURLOPT_TIMEOUT        => 15,
    CURLOPT_SSL_VERIFYPEER => false,
]);
$result2   = curl_exec($ch2);
$err2      = curl_error($ch2);
$httpCode2 = curl_getinfo($ch2, CURLINFO_HTTP_CODE);
curl_close($ch2);

$respData2 = json_decode($result2, true) ?? [];
$clean2    = [];
foreach ($respData2 as $k => $v) { $clean2[trim($k)] = $v; }
$tieneUrl  = !empty($clean2['url'] ?? $clean2['Url'] ?? null);

check('API Ligas responde', $httpCode2 === 200, "Código: {$httpCode2}");
check('Genera liga de pago', $tieneUrl, $tieneUrl ? "URL recibida ✓" : "Resp: " . substr($result2, 0, 100));
?>
</table>

<h2>Configuración cargada</h2>
<table>
<?php
check('PDT_USER', !empty(PDT_USER), PDT_USER);
check('PDT_INT_ID', !empty(PDT_INT_ID), PDT_INT_ID);
check('PDT_BUS_ID_SPEI', !empty(PDT_BUS_ID_SPEI), PDT_BUS_ID_SPEI);
check('PDT_BUS_ID_TC', !empty(PDT_BUS_ID_TC), PDT_BUS_ID_TC);
check('Zona horaria', true, date('Y-m-d H:i:s T'));
?>
</table>

<div class="warn">
  ⚠️ <strong>Elimina este archivo</strong> cuando confirmes que todo funciona:<br>
  <code>diagnostico.php</code>
</div>

</body>
</html>