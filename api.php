<?php
/**
 * EduPago — Backend API v2
 * Multi-escuela. CLABE fija. Pagadetodo para tarjeta.
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
    $code   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['body' => $result, 'http_code' => $code, 'error' => $err];
}

$action = $_GET['action'] ?? '';
$input  = json_decode(file_get_contents('php://input'), true) ?? [];

switch ($action) {

    // ══════════════════════════════════════════════════════════════════════════
    // 1. CLABE FIJA — ya no genera CLABE dinámica, devuelve la fija configurada
    //    La referencia (concepto de la transferencia) identifica al alumno.
    // ══════════════════════════════════════════════════════════════════════════
    case 'obtener_clabe':
        $folio      = $input['folio']      ?? 'COB-0000';
        $total      = $input['total']      ?? 0;
        $nombre     = $input['nombre']     ?? 'Cliente';
        $escuela    = $input['escuela']    ?? 'Escuela';
        $referencia = $input['referencia'] ?? $folio; // Matrícula o folio corto

        log_api("obtener_clabe -> folio={$folio} total={$total} ref={$referencia}");

        respond([
            'success'      => true,
            'clabe'        => SPEI_CLABE_FIJA,
            'banco'        => SPEI_BANCO,
            'beneficiario' => SPEI_BENEFICIARIO,
            'referencia'   => $referencia,   // Este es el concepto que el padre escribe
            'instruccion'  => "Al hacer la transferencia, escribe como concepto: {$referencia}",
        ]);
    break;


    // ══════════════════════════════════════════════════════════════════════════
    // 2. VERIFICAR PAGO SPEI (via webhook que llena pagos_spei.json)
    // ══════════════════════════════════════════════════════════════════════════
    case 'verificar_spei':
        $referencia = $input['referencia'] ?? '';

        if (!$referencia) respond(['success' => false, 'error' => 'Referencia requerida']);

        $archivo_pagos = __DIR__ . '/pagos_spei.json';
        if (!file_exists($archivo_pagos)) respond(['success' => true, 'pagado' => false]);

        $pagos = json_decode(file_get_contents($archivo_pagos), true) ?? [];

        if (isset($pagos[$referencia]) && $pagos[$referencia]['pagado'] === true) {
            $pago = $pagos[$referencia];
            log_api("verificar_spei PAGADO ref={$referencia} monto={$pago['monto']}");
            respond([
                'success'     => true,
                'pagado'      => true,
                'monto'       => $pago['monto'],
                'monto_pesos' => $pago['monto_pesos'],
                'transaccion' => $pago['transaccion'],
                'autorizacion'=> $pago['autorizacion'],
                'fecha'       => $pago['fecha'],
            ]);
        }

        respond(['success' => true, 'pagado' => false]);
    break;


    // ══════════════════════════════════════════════════════════════════════════
    // 3. GENERAR LIGA DE PAGO CON TARJETA (sin cambios)
    // ══════════════════════════════════════════════════════════════════════════
    case 'generar_liga':
        $folio       = $input['folio']       ?? 'COB-0000';
        $total       = floatval($input['total'] ?? 0);
        $descripcion = $input['descripcion'] ?? 'Pago escolar ' . $folio;

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

        log_api("generar_liga RESP: " . $res['body']);
        $raw = json_decode($res['body'], true) ?? [];
        $data = [];
        foreach ($raw as $k => $v) { $data[trim($k)] = $v; }

        $url_pago = $data['url'] ?? $data['Url'] ?? $data['URL'] ?? null;
        if (!$url_pago) {
            respond(['success' => false, 'error' => 'No se recibió URL de pago. Resp: ' . $res['body'], 'raw' => $data]);
        }

        respond([
            'success'    => true,
            'url'        => $url_pago,
            'referencia' => $ref,
            'qr_url'     => 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=' . urlencode($url_pago),
            'expira'     => date('Y-m-d H:i:s', strtotime('+1 day')),
        ]);
    break;


    default:
        respond(['success' => false, 'error' => 'Acción no reconocida: ' . htmlspecialchars($action),
            'acciones' => ['obtener_clabe', 'verificar_spei', 'generar_liga']]);
}
?>
