<?php
/**
 * EduPago — Webhook SPEI v2 (CLABE Fija)
 *
 * Con CLABE fija, el campo que identifica AL ALUMNO es el CONCEPTO
 * de la transferencia (lo que el padre escribe: su matrícula).
 *
 * Pagadetodo/STP llama a esta URL con un POST cuando llega dinero.
 * Campos típicos del payload de STP:
 *   - clabe_destino   : la CLABE fija de la escuela
 *   - concepto_pago   : lo que escribió el padre (matrícula / referencia)
 *   - monto           : en centavos (ej: "280000" = $2,800)
 *   - clave_rastreo   : ID único de la transferencia en SPEI
 *   - nombre_ordenante: nombre del banco/titular que transfirió
 *   - fecha           : fecha de la transferencia
 *
 * Nota: Pagadetodo puede llamar estos campos diferente en su API real.
 *   Revisar su documentación y ajustar los alias al fondo de este archivo.
 *
 * Flujo:
 *   1. STP/Pagadetodo POST → webhook_spei.php
 *   2. Se extrae el CONCEPTO (= matrícula del alumno)
 *   3. Se guarda en pagos_spei.json indexado por CONCEPTO
 *   4. api.php?action=verificar_spei&referencia=MATRICULA lo consulta
 *   5. Frontend confirma automáticamente el cobro
 */

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=UTF-8');

$ts  = date('Y-m-d H:i:s');
$raw = file_get_contents('php://input');

// Log siempre para debug (especialmente en primeras pruebas)
if (API_LOG_ENABLED) {
    file_put_contents(
        __DIR__ . '/webhook_log.txt',
        "\n[{$ts}] ══ WEBHOOK SPEI ══\nRAW:\n{$raw}\n" . str_repeat('─', 60) . "\n",
        FILE_APPEND
    );
}

$data = json_decode($raw, true);

// ── Respuesta de error estándar (Pagadetodo debe recibir codigo:0 para no reintentar) ──
function responder($codigo, $msg, $transaccion = '0') {
    echo json_encode([
        'codigo'       => $codigo,
        'autorizacion' => $codigo === 0 ? rand(10000000, 99999999) : '',
        'mensaje'      => $msg,
        'transaccion'  => $transaccion,
        'fecha'        => date('Y-m-d'),
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!$data || !is_array($data)) {
    responder(50, 'JSON inválido o body vacío');
}

// ── Normalizar campos (Pagadetodo puede usar distintos nombres) ───────────────
// Ajusta estos alias según la documentación real de Pagadetodo / STP
$clabe_destino   = $data['clabe_destino']   ?? $data['clabe']       ?? $data['cuentaDestino']    ?? '';
$concepto        = $data['concepto_pago']   ?? $data['concepto']    ?? $data['referencia']        ?? $data['descripcion'] ?? '';
$clave_rastreo   = $data['clave_rastreo']   ?? $data['transaccion'] ?? $data['idTransaccion']     ?? uniqid('spei_');
$monto_centavos  = $data['monto']           ?? $data['importe']     ?? '0';
$nombre_emisor   = $data['nombre_ordenante']?? $data['nombreOrd']   ?? 'Transferencia SPEI';
$fecha           = $data['fecha']           ?? date('Y-m-d');

// Limpiar y normalizar el concepto (quitar espacios, mayúsculas)
$concepto_limpio = strtoupper(trim(preg_replace('/\s+/', '-', $concepto)));

// ── Validaciones mínimas ──────────────────────────────────────────────────────
if (!$monto_centavos || $monto_centavos === '0' || intval($monto_centavos) <= 0) {
    responder(15, 'Monto inválido o cero');
}

if (!$concepto_limpio) {
    // Pago sin concepto: guardar igual pero marcado para revisión manual
    $concepto_limpio = 'SIN-CONCEPTO-' . date('YmdHis');
    if (API_LOG_ENABLED) {
        file_put_contents(API_LOG_FILE,
            "{$ts} | ⚠ SPEI SIN CONCEPTO | monto:{$monto_centavos} rastreo:{$clave_rastreo}\n",
            FILE_APPEND);
    }
}

// ── Guardar en pagos_spei.json ────────────────────────────────────────────────
// Indexado primero por CONCEPTO (matrícula/referencia que escribió el padre).
// Con CLABEs individuales, además se guarda 'clabe_destino' en cada registro
// para que api.php?action=verificar_spei pueda localizar el pago por CLABE
// aunque el concepto venga vacío o ilegible.
$archivo_pagos = __DIR__ . '/pagos_spei.json';

// Usar flock para evitar race conditions si llegan dos webhooks simultáneos
$fp = fopen($archivo_pagos, 'c+');
if (!$fp) responder(99, 'Error de escritura en servidor');

flock($fp, LOCK_EX);
$contenido = stream_get_contents($fp);
$pagos = $contenido ? (json_decode($contenido, true) ?? []) : [];

$autorizacion = rand(10000000, 99999999);
$monto_pesos  = number_format(intval($monto_centavos) / 100, 2);

// Determinar la clave de indexación principal:
// - Si hay concepto legible, se usa como antes (compatibilidad con CLABE fija legado).
// - Si NO hay concepto (transferencia a CLABE individual sin concepto escrito),
//   se indexa por la CLABE destino + clave de rastreo para no pisar pagos previos.
$tiene_concepto_legible = $concepto && !str_starts_with($concepto_limpio, 'SIN-CONCEPTO-');
$clave_indice = $tiene_concepto_legible
    ? $concepto_limpio
    : ('CLABE-' . $clabe_destino . '-' . $clave_rastreo);

// Si ya existía un pago con esta referencia, acumular (pago parcial o duplicado)
$ya_existia = isset($pagos[$clave_indice]) && $pagos[$clave_indice]['pagado'];

$pagos[$clave_indice] = [
    'concepto'       => $concepto_limpio,
    'concepto_raw'   => $concepto,          // Guardar original para debug
    'clabe_destino'  => $clabe_destino,     // CLABE individual del alumno (o fija, legado)
    'monto'          => intval($monto_centavos),
    'monto_pesos'    => $monto_pesos,
    'clave_rastreo'  => $clave_rastreo,
    'autorizacion'   => $autorizacion,
    'nombre_emisor'  => $nombre_emisor,
    'fecha'          => $fecha,
    'recibido_en'    => $ts,
    'pagado'         => true,
    'requiere_revision' => !$concepto || $ya_existia, // Marcar para revisión si repetido
];


rewind($fp);
ftruncate($fp, 0);
fwrite($fp, json_encode($pagos, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
flock($fp, LOCK_UN);
fclose($fp);

// Log resumen
if (API_LOG_ENABLED) {
    file_put_contents(API_LOG_FILE,
        "{$ts} | ✓ SPEI RECIBIDO | indice:{$clave_indice} clabe:{$clabe_destino} monto:\${$monto_pesos} rastreo:{$clave_rastreo}\n",
        FILE_APPEND);
}

// ── Responder éxito a Pagadetodo ──────────────────────────────────────────────
// CRÍTICO: si no respondes código 0, Pagadetodo reintentará el webhook.
responder(0, 'Operación exitosa', $clave_rastreo);
?>
