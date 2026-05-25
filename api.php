<?php
/**
 * EduPago — Backend API
 * Conecta con Pagadetodo.mx para SPEI y ligas de pago con tarjeta.
 */

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function respond($data) {
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function log_api($msg) {
    if (!API_LOG_ENABLED) return;
    $line = date('Y-m-d H:i:s') . ' | ' . $msg . "\n";
    file_put_contents(API_LOG_FILE, $line, FILE_APPEND);
}

function curl_post($url, $payload) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $result = curl_exec($ch);
    $err    = curl_error($ch);
    $code   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['body' => $result, 'http_code' => $code, 'error' => $err];
}

// ─── Router ──────────────────────────────────────────────────────────────────
$action = $_GET['action'] ?? '';
$input  = json_decode(file_get_contents('php://input'), true) ?? [];

switch ($action) {

    // ══════════════════════════════════════════════════════════════════════════
    // 1. GENERAR CLABE DINÁMICA PARA SPEI
    // ══════════════════════════════════════════════════════════════════════════
    case 'generar_clabe':
        $folio  = $input['folio']  ?? 'COB-0000';
        $total  = $input['total']  ?? 0;
        $nombre = $input['nombre'] ?? 'Cliente';
        $email  = $input['email']  ?? '';

        // Referencia numérica de 15 dígitos
        $num = preg_replace('/\D/', '', $folio);
        $ref = substr(str_pad($num . time(), 15, '0', STR_PAD_LEFT), -15);

        $payload = [
            'User'           => PDT_USER,
            'Password'       => PDT_PASS,
            'IntegrationID'  => PDT_INT_ID,
            'BusinessID'     => PDT_BUS_ID_SPEI,
            'Description'    => ESCUELA_NOMBRE . ' ' . $folio,
            'Account'        => $ref,
            'CustomerEmail'  => $email,
            'CustomerName'   => $nombre,
            'ExpirationDate' => date('Y-m-d', strtotime('+2 days')),
        ];

        log_api("generar_clabe -> folio={$folio} total={$total}");
        $res = curl_post(PDT_URL_CLABE, $payload);

        if ($res['error']) {
            log_api("generar_clabe ERROR CURL: " . $res['error']);
            respond(['success' => false, 'error' => 'Error de red: ' . $res['error']]);
        }

        $data = json_decode($res['body'], true);
        log_api("generar_clabe RESP: " . $res['body']);

        $clabe = $data['Clabe']
              ?? $data['response']['Clabe']
              ?? $data['data']['Clabe']
              ?? null;

        if (!$clabe) {
            respond([
                'success' => false,
                'error'   => 'No se pudo obtener CLABE. Respuesta: ' . $res['body'],
                'raw'     => $data,
            ]);
        }

        respond([
            'success'    => true,
            'clabe'      => $clabe,
            'referencia' => $ref,
            'expira'     => date('Y-m-d H:i:s', strtotime('+48 hours')),
        ]);
    break;


    // ══════════════════════════════════════════════════════════════════════════
    // 2. VERIFICAR PAGO SPEI (polling)
    // ══════════════════════════════════════════════════════════════════════════
    case 'verificar_spei':
        $clabe = $input['clabe'] ?? '';

        if (!$clabe) {
            respond(['success' => false, 'error' => 'CLABE requerida']);
        }

        $params = http_build_query([
            'User'          => PDT_USER,
            'Password'      => PDT_PASS,
            'IntegrationID' => PDT_INT_ID,
            'BusinessID'    => PDT_BUS_ID_SPEI,
            'Clabe'         => $clabe,
        ]);

        $ch = curl_init(PDT_URL_CONSULTA . '?' . $params);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_SSL_VERIFYPEER => false,
        ]);
        $result = curl_exec($ch);
        $err    = curl_error($ch);
        curl_close($ch);

        log_api("verificar_spei clabe={$clabe} -> " . $result);

        if ($err) {
            respond(['success' => false, 'error' => $err]);
        }

        $data = json_decode($result, true);

        // codigo=0 y monto>0 = pago recibido
        $pagado = isset($data['codigo']) && $data['codigo'] == 0
               && isset($data['monto'])  && floatval($data['monto']) > 0;

        respond([
            'success'     => true,
            'pagado'      => $pagado,
            'monto'       => $data['monto']       ?? null,
            'transaccion' => $data['transaccion'] ?? null,
            'raw'         => $data,
        ]);
    break;


    // ══════════════════════════════════════════════════════════════════════════
    // 3. GENERAR LIGA DE PAGO CON TARJETA
    // ══════════════════════════════════════════════════════════════════════════
    case 'generar_liga':
        $folio       = $input['folio']       ?? 'COB-0000';
        $total       = floatval($input['total'] ?? 0);
        $descripcion = $input['descripcion'] ?? ESCUELA_NOMBRE . ' ' . $folio;

        if ($total < 10) {
            respond(['success' => false, 'error' => 'Monto mínimo $10.00']);
        }

        // ID: 9 dígitos, Reference: 15 dígitos (formato que acepta Pagadetodo)
        $ts       = intval(substr(time(), -6));
        $rand     = rand(100, 999);
        $base     = $ts . $rand;
        $id_pago  = str_pad($base, 9,  '0', STR_PAD_LEFT);
        $ref_pago = str_pad($base, 15, '0', STR_PAD_LEFT);

        $payload = [
            'User'          => PDT_USER,
            'Password'      => PDT_PASS,
            'IntegrationID' => PDT_INT_ID,
            'BusinessID'    => PDT_BUS_ID_TC,
            'PaymentTypes'  => '401',
            'Id'            => $id_pago,
            'Description'   => substr($descripcion, 0, 40),
            'Amount'        => intval($total * 100),
            'Reference'     => $ref_pago,
            'ExpirationDate'=> date('Y-m-d', strtotime('+1 day')),
        ];

        log_api("generar_liga -> folio={$folio} total={$total}");
        $res = curl_post(PDT_URL_LIGA, $payload);

        if ($res['error']) {
            log_api("generar_liga ERROR CURL: " . $res['error']);
            respond(['success' => false, 'error' => 'Error de red: ' . $res['error']]);
        }

        log_api("generar_liga RESP: " . $res['body']);

        // Limpiar espacios en claves (bug conocido de Pagadetodo)
        $raw = json_decode($res['body'], true) ?? [];
        $data = [];
        foreach ($raw as $k => $v) { $data[trim($k)] = $v; }

        $url_pago = $data['url'] ?? $data['Url'] ?? $data['URL'] ?? null;

        if (!$url_pago) {
            respond([
                'success' => false,
                'error'   => 'No se recibió URL de pago. Respuesta: ' . $res['body'],
                'raw'     => $data,
            ]);
        }

        respond([
            'success'    => true,
            'url'        => $url_pago,
            'referencia' => $ref_pago,
            'qr_url'     => 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=' . urlencode($url_pago),
            'expira'     => date('Y-m-d H:i:s', strtotime('+1 day')),
        ]);
    break;


    // ══════════════════════════════════════════════════════════════════════════
    // DEFAULT
    // ══════════════════════════════════════════════════════════════════════════
    default:
        respond([
            'success'  => false,
            'error'    => 'Acción no reconocida: ' . htmlspecialchars($action),
            'acciones' => ['generar_clabe', 'verificar_spei', 'generar_liga'],
        ]);
}
?>
