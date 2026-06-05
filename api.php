<?php
/**
 * EduPago — Backend API v3
 * CLABE fija. Verificación por concepto/matrícula. CFDI mock.
 */
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit(); }

function respond($data) {
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}
function log_api($msg) {
    if (!API_LOG_ENABLED) return;
    file_put_contents(API_LOG_FILE, date('Y-m-d H:i:s') . ' | ' . $msg . "\n", FILE_APPEND);
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
    curl_close($ch);
    return ['body' => $result, 'error' => $err];
}

$action = $_GET['action'] ?? '';
$input  = json_decode(file_get_contents('php://input'), true) ?? [];

switch ($action) {

    // ══════════════════════════════════════════════════════════════════════════
    // 1. OBTENER CLABE FIJA
    //    Devuelve la CLABE configurada. El concepto que el padre escribe
    //    en la transferencia ES la referencia (matrícula del alumno).
    // ══════════════════════════════════════════════════════════════════════════
    case 'obtener_clabe':
        $referencia  = $input['referencia']  ?? 'REF-0000';
        $total       = floatval($input['total'] ?? 0);
        $nombre      = $input['nombre']      ?? '';
        $escuela     = $input['escuela']     ?? '';

        log_api("obtener_clabe -> ref={$referencia} total={$total}");

        respond([
            'success'      => true,
            'clabe'        => SPEI_CLABE_FIJA,
            'banco'        => SPEI_BANCO,
            'beneficiario' => SPEI_BENEFICIARIO,
            'referencia'   => strtoupper(trim($referencia)),
            'instruccion'  => "Al transferir, escribe como CONCEPTO exactamente: " . strtoupper(trim($referencia)),
            'es_fija'      => true,
        ]);
    break;

    // ══════════════════════════════════════════════════════════════════════════
    // 2. VERIFICAR PAGO SPEI POR REFERENCIA/CONCEPTO
    //    Busca en pagos_spei.json usando el concepto (matrícula), no la CLABE.
    // ══════════════════════════════════════════════════════════════════════════
    case 'verificar_spei':
        $referencia = strtoupper(trim($input['referencia'] ?? ''));
        if (!$referencia) respond(['success' => false, 'error' => 'Referencia requerida']);

        $archivo = __DIR__ . '/pagos_spei.json';
        if (!file_exists($archivo)) respond(['success' => true, 'pagado' => false]);

        $pagos = json_decode(file_get_contents($archivo), true) ?? [];

        // Busca exacto primero, luego busca que el concepto CONTENGA la referencia
        $pago = $pagos[$referencia] ?? null;
        if (!$pago) {
            foreach ($pagos as $key => $p) {
                if (str_contains($key, $referencia) || str_contains($referencia, $key)) {
                    $pago = $p;
                    break;
                }
            }
        }

        if ($pago && $pago['pagado'] === true) {
            log_api("verificar_spei PAGADO ref={$referencia} monto={$pago['monto_pesos']}");
            respond([
                'success'       => true,
                'pagado'        => true,
                'monto'         => $pago['monto'],
                'monto_pesos'   => $pago['monto_pesos'],
                'clave_rastreo' => $pago['clave_rastreo'],
                'autorizacion'  => $pago['autorizacion'],
                'nombre_emisor' => $pago['nombre_emisor'] ?? '',
                'fecha'         => $pago['fecha'],
            ]);
        }

        respond(['success' => true, 'pagado' => false]);
    break;

    // ══════════════════════════════════════════════════════════════════════════
    // 3. SIMULAR PAGO SPEI (para testing sin webhook real)
    //    Llama internamente a la lógica del webhook.
    // ══════════════════════════════════════════════════════════════════════════
    case 'simular_spei':
        $referencia = strtoupper(trim($input['referencia'] ?? ''));
        $monto      = intval(floatval($input['monto'] ?? 0) * 100);
        $emisor     = $input['emisor'] ?? 'PADRE DE FAMILIA DEMO';

        if (!$referencia || $monto <= 0) {
            respond(['success' => false, 'error' => 'referencia y monto requeridos']);
        }

        $archivo  = __DIR__ . '/pagos_spei.json';
        $fp       = fopen($archivo, 'c+');
        flock($fp, LOCK_EX);
        $contenido = stream_get_contents($fp);
        $pagos     = $contenido ? (json_decode($contenido, true) ?? []) : [];

        $autorizacion = rand(10000000, 99999999);
        $pagos[$referencia] = [
            'concepto'       => $referencia,
            'concepto_raw'   => $referencia,
            'clabe_destino'  => SPEI_CLABE_FIJA,
            'monto'          => $monto,
            'monto_pesos'    => number_format($monto / 100, 2),
            'clave_rastreo'  => 'SIM-' . date('YmdHis'),
            'autorizacion'   => $autorizacion,
            'nombre_emisor'  => $emisor,
            'fecha'          => date('Y-m-d'),
            'recibido_en'    => date('Y-m-d H:i:s'),
            'pagado'         => true,
            'simulado'       => true,
        ];

        rewind($fp);
        ftruncate($fp, 0);
        fwrite($fp, json_encode($pagos, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        flock($fp, LOCK_UN);
        fclose($fp);

        log_api("simular_spei -> ref={$referencia} monto=" . number_format($monto/100,2));
        respond(['success' => true, 'autorizacion' => $autorizacion, 'mensaje' => 'Pago simulado OK']);
    break;

    // ══════════════════════════════════════════════════════════════════════════
    // 4. GENERAR LIGA TARJETA (sin cambios)
    // ══════════════════════════════════════════════════════════════════════════
    case 'generar_liga':
        $folio       = $input['folio']       ?? 'COB-0000';
        $total       = floatval($input['total'] ?? 0);
        $descripcion = $input['descripcion'] ?? 'Pago escolar';

        if ($total < 10) respond(['success' => false, 'error' => 'Monto mínimo $10.00']);

        $ts      = intval(substr(time(), -6));
        $rand    = rand(100, 999);
        $base    = $ts . $rand;
        $id_pago = str_pad($base, 9,  '0', STR_PAD_LEFT);
        $ref     = str_pad($base, 15, '0', STR_PAD_LEFT);

        $payload = [
            'User'          => PDT_USER,
            'Password'      => PDT_PASS,
            'IntegrationID' => PDT_INT_ID,
            'BusinessID'    => PDT_BUS_ID_TC,
            'PaymentTypes'  => '401',
            'Id'            => $id_pago,
            'Description'   => substr($descripcion, 0, 40),
            'Amount'        => intval($total * 100),
            'Reference'     => $ref,
            'ExpirationDate'=> date('Y-m-d', strtotime('+1 day')),
        ];

        log_api("generar_liga -> folio={$folio} total={$total}");
        $res = curl_post(PDT_URL_LIGA, $payload);

        if ($res['error']) respond(['success' => false, 'error' => 'Error de red: ' . $res['error']]);

        $raw  = json_decode($res['body'], true) ?? [];
        $data_resp = [];
        foreach ($raw as $k => $v) { $data_resp[trim($k)] = $v; }

        $url_pago = $data_resp['url'] ?? $data_resp['Url'] ?? $data_resp['URL'] ?? null;
        if (!$url_pago) {
            respond(['success' => false, 'error' => 'Sin URL de pago', 'raw' => $data_resp]);
        }

        respond([
            'success'    => true,
            'url'        => $url_pago,
            'referencia' => $ref,
            'qr_url'     => 'https://api.qrserver.com/v2/create-qr-code/?size=300x300&margin=10&data=' . urlencode($url_pago),
        ]);
    break;

    // ══════════════════════════════════════════════════════════════════════════
    // 5. GENERAR CFDI (mock — conectar a PAC real en producción)
    //    Estructura real de CFDI 4.0. Listo para Facturama / SW SAPiens / etc.
    // ══════════════════════════════════════════════════════════════════════════
    case 'generar_cfdi':
        $cobro_id    = $input['cobro_id']    ?? '';
        $rfc         = strtoupper(trim($input['rfc'] ?? ''));
        $razon       = strtoupper(trim($input['razon_social'] ?? ''));
        $uso         = $input['uso_cfdi']    ?? 'D10';
        $regimen     = $input['regimen']     ?? '616';
        $email       = $input['email']       ?? '';
        $total       = floatval($input['total']   ?? 0);
        $descripcion = $input['descripcion'] ?? 'Servicios educativos';
        
        // CFDI 4.0 exige el Código Postal del receptor. 
        // Si no lo pides en el frontend, Facturapi arrojará error si no coincide con el RFC.
        $cp_receptor = $input['cp_receptor'] ?? '97000'; 

        if (!$rfc || !$razon || $total <= 0) {
            respond(['success' => false, 'error' => 'RFC, razón social y total son requeridos']);
        }

        // 1. Estructuramos el payload para Facturapi
        // Facturapi calcula automáticamente el subtotal e IVA a partir del precio final
        // si le indicas que el precio incluye impuestos, o puedes enviarlo desglosado.
        // Aquí enviamos el subtotal y le decimos que agregue el IVA del 16%.
        $subtotal = round($total / 1.16, 2);

        $payload_facturapi = [
            "customer" => [
                "legal_name" => $razon,
                "tax_id"     => $rfc,
                "tax_system" => $regimen,
                "zip"        => $cp_receptor,
                "email"      => $email
            ],
            "items" => [
                [
                    "quantity" => 1,
                    "product" => [
                        "description" => $descripcion,
                        "product_key" => "86101800", // Servicios educativos
                        "price"       => $subtotal,
                        "taxes"       => [
                            [
                                "type" => "IVA",
                                "rate" => 0.16
                            ]
                        ]
                    ]
                ]
            ],
            "use"          => $uso,
            "payment_form" => "03", // Transferencia electrónica
            "payment_method" => "PUE"
        ];

        // 2. Ejecutamos la petición cURL a Facturapi
        $ch = curl_init('https://www.facturapi.io/v1/invoices');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . FACTURAPI_KEY
            ],
            CURLOPT_POSTFIELDS     => json_encode($payload_facturapi),
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_SSL_VERIFYPEER => false, // Cambiar a true en producción estricta
        ]);

        $result = curl_exec($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($err) {
            log_api("ERROR cURL Facturapi: " . $err);
            respond(['success' => false, 'error' => 'Error de red al contactar al PAC.']);
        }

        $response_data = json_decode($result, true);

        // 3. Manejo de la respuesta
        if ($http_code >= 200 && $http_code < 300 && isset($response_data['id'])) {
            
            $uuid = $response_data['uuid'] ?? 'PENDIENTE';
            
            log_api("generar_cfdi -> EXITOSO cobro:{$cobro_id} uuid:{$uuid}");

            respond([
                'success'        => true,
                'facturapi_id'   => $response_data['id'],
                'uuid'           => $uuid,
                'folio_fiscal'   => $uuid,
                'serie'          => 'F',
                'folio'          => $response_data['folio_number'] ?? '',
                'fecha_timbrado' => $response_data['created_at'] ?? date('Y-m-d\TH:i:s'),
                'subtotal'       => $subtotal,
                'iva'            => round($total - $subtotal, 2),
                'total'          => $total,
                // Facturapi permite descargar el XML con una URL pública si configuras tu cuenta,
                // o haciendo un GET a https://www.facturapi.io/v2/invoices/{id}/xml
                'xml'            => '',
                'qr_url'         => 'https://api.qrserver.com/v2/create-qr-code/?size=200x200&data=' . urlencode($response_data['verification_url'] ?? ''),
                'nota'           => 'Timbrado exitoso con Facturapi.',
            ]);

        } else {
            // Error devuelto por Facturapi (ej. CP no coincide con RFC)
            $mensaje_error = $response_data['message'] ?? 'Error desconocido al timbrar';
            log_api("ERROR Facturapi: " . $result);
            respond(['success' => false, 'error' => $mensaje_error]);
        }
    break;

    default:
        respond(['success' => false, 'error' => "Acción no reconocida: {$action}",
            'acciones' => ['obtener_clabe','verificar_spei','simular_spei','generar_liga','generar_cfdi']]);
}
?>
