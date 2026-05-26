<?php
/**
 * EduPago — Webhook SPEI
 *
 * Pagadetodo/Cobroscontarjeta llama a esta URL cuando recibe
 * una transferencia SPEI en cualquiera de tus CLABEs dinámicas.
 *
 * Flujo:
 *   1. Pagadetodo POST → { clabe, monto, transaccion, fecha }
 *   2. Este archivo guarda el pago en pagos_spei.json
 *   3. Responde { codigo:0, autorizacion, mensaje, transaccion, fecha }
 *   4. EduPago lee pagos_spei.json en el siguiente polling (api.php?action=verificar_spei)
 *
 * URL a registrar en Pagadetodo:
 *   https://test.grupoideasmx.com/webhook_spei.php
 */

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=UTF-8');

// ── Guardar raw para debug ────────────────────────────────────────────────────
$raw = file_get_contents('php://input');
$ts  = date('Y-m-d H:i:s');

if (API_LOG_ENABLED) {
    file_put_contents(
        __DIR__ . '/webhook_log.txt',
        "\n[{$ts}] RAW:\n{$raw}\n" . str_repeat('-', 50) . "\n",
        FILE_APPEND
    );
}

// ── Parsear JSON de Pagadetodo ────────────────────────────────────────────────
$data = json_decode($raw, true);

if (!$data || !is_array($data)) {
    echo json_encode([
        'codigo'       => 50,
        'autorizacion' => '',
        'mensaje'      => 'JSON inválido',
        'transaccion'  => '0',
        'fecha'        => date('Y-m-d'),
    ]);
    exit;
}

$clabe       = $data['clabe']       ?? '';
$monto       = $data['monto']       ?? '0';   // en centavos: "15000" = $150.00
$transaccion = $data['transaccion'] ?? '0';
$fecha       = $data['fecha']       ?? date('Y-m-d');

// ── Validar campos mínimos ────────────────────────────────────────────────────
if (!$clabe || !$monto || $monto === '0') {
    echo json_encode([
        'codigo'       => 15,
        'autorizacion' => '',
        'mensaje'      => 'Datos incompletos',
        'transaccion'  => $transaccion,
        'fecha'        => date('Y-m-d'),
    ]);
    exit;
}

// ── Guardar pago en pagos_spei.json ──────────────────────────────────────────
// Este archivo es la "base de datos" ligera que lee api.php?action=verificar_spei
$archivo_pagos = __DIR__ . '/pagos_spei.json';

$pagos = [];
if (file_exists($archivo_pagos)) {
    $pagos = json_decode(file_get_contents($archivo_pagos), true) ?? [];
}

$autorizacion = rand(10000000, 99999999);

// Indexado por CLABE para búsqueda O(1)
$pagos[$clabe] = [
    'clabe'        => $clabe,
    'monto'        => $monto,                        // centavos
    'monto_pesos'  => number_format($monto / 100, 2),
    'transaccion'  => $transaccion,
    'autorizacion' => $autorizacion,
    'fecha'        => $fecha,
    'recibido_en'  => $ts,
    'pagado'       => true,
];

file_put_contents(
    $archivo_pagos,
    json_encode($pagos, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)
);

if (API_LOG_ENABLED) {
    file_put_contents(
        API_LOG_FILE,
        "{$ts} | WEBHOOK SPEI recibido | CLABE:{$clabe} monto:{$monto} transaccion:{$transaccion}\n",
        FILE_APPEND
    );
}

// ── Responder a Pagadetodo (OBLIGATORIO para que no reintente) ────────────────
echo json_encode([
    'codigo'       => 0,
    'autorizacion' => $autorizacion,
    'mensaje'      => 'Operación exitosa',
    'transaccion'  => $transaccion,
    'fecha'        => date('Y-m-d'),
]);
?>
