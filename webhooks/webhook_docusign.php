<?php
/**
 * EduPago — Webhook DocuSign Connect
 *
 * DocuSign llama a esto vía HTTP POST cuando cambia el estatus de un sobre
 * (envelope) — nos interesa "completed" (ya lo firmaron todos los firmantes).
 *
 * IMPORTANTE — sin probar en vivo todavía: el formato exacto del payload que
 * manda DocuSign Connect depende de cómo se configure en su Admin. Al crear
 * la configuración de Connect ahí, selecciona formato JSON (no el XML legado)
 * para que esto la pueda leer tal cual está escrito. Si al probarlo de
 * verdad el formato real no calza con lo que se busca abajo, revisar
 * debug_webhook_docusign.txt (se guarda el payload completo tal cual llega)
 * y ajustar la extracción de campos — mismo patrón que ya se usó en
 * webhook_liga.php para su caso de la referencia envuelta.
 *
 * Configurar esta URL en DocuSign Admin → Connect → Add Configuration,
 * evento "Envelope Completed" (o "All events" si se prefiere ver de todo).
 *
 * NOTA (11-sep-2026): este archivo estaba corrompido en el repo -- un commit
 * externo ("Update webhook_docusign.php", 7cd1c3e) lo había sobreescrito por
 * accidente con el JS de views/Suscripciones.js. Se restauró desde su commit
 * padre. El candado que consultaba autorizacion_cai_estado en
 * lib/helpers_pagos.php sigue retirado a propósito (ver PRODUCCION.md 5.3as,
 * "Se pausó la implementación de 5.3ar" -- 5.3ar solo documenta cuándo se
 * AGREGÓ el candado, no cuándo se quitó) mientras se decide cómo/cuándo
 * implementar la firma real -- este webhook queda funcional pero dormido
 * hasta que se reactive ese candado.
 *
 * SEGURIDAD: hoy DOCUSIGN_CONNECT_HMAC_KEY está vacío en config.php, así que
 * la verificación de firma de abajo se salta por completo (solo deja un log
 * de advertencia) -- cualquiera que adivine/filtre un envelopeId real puede
 * marcar esa autorización como 'firmada' sin que DocuSign lo haya mandado.
 * Hoy esto no permite cobrar de más (el candado que dependía de ese estado
 * está retirado), pero SÍ hay que configurar un secreto real en
 * DOCUSIGN_CONNECT_HMAC_KEY antes de reactivar el candado de cobro.
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/helpers_pagos.php';
require_once __DIR__ . '/../lib/webhook_helpers.php';

header('Content-Type: application/json; charset=UTF-8');

$raw = file_get_contents('php://input');

file_put_contents(
    __DIR__ . '/debug_webhook_docusign.txt',
    "\n============================\n" . date('Y-m-d H:i:s') . "\n" . $raw . "\n============================\n",
    FILE_APPEND
);

function responder_docusign($ok, $msg) {
    webhook_responder(['success' => $ok, 'mensaje' => $msg]);
}

// Verificación HMAC — DocuSign manda la firma en el header X-DocuSign-Signature-1.
// Se valida SOLO si se configuró un secreto (DOCUSIGN_CONNECT_HMAC_KEY no
// vacío); sin secreto configurado no hay forma de validar, así que se deja
// pasar (igual que webhook_liga.php, que tampoco tiene autenticación propia
// del protocolo) pero advertido en el log.
if (defined('DOCUSIGN_CONNECT_HMAC_KEY') && DOCUSIGN_CONNECT_HMAC_KEY) {
    $firmaRecibida = $_SERVER['HTTP_X_DOCUSIGN_SIGNATURE_1'] ?? '';
    $firmaEsperada = base64_encode(hash_hmac('sha256', $raw, DOCUSIGN_CONNECT_HMAC_KEY, true));
    if (!$firmaRecibida || !hash_equals($firmaEsperada, $firmaRecibida)) {
        if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, '❌ WEBHOOK DOCUSIGN: firma HMAC inválida o ausente');
        responder_docusign(false, 'Firma inválida');
    }
} else {
    if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, '⚠ WEBHOOK DOCUSIGN sin DOCUSIGN_CONNECT_HMAC_KEY configurado — sin verificación de origen');
}

$data = json_decode($raw, true);
if (!is_array($data)) {
    if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, '❌ WEBHOOK DOCUSIGN: body no es JSON válido');
    responder_docusign(false, 'JSON inválido');
}

// El formato JSON "básico" de Connect trae envelopeId/status en la raíz; el
// formato "eventNotification" más nuevo los anida bajo data/envelopeSummary.
// Se intentan ambas rutas.
$envelopeId = $data['envelopeId']
    ?? $data['data']['envelopeId']
    ?? null;
$status = strtolower(
    $data['status']
    ?? $data['data']['envelopeSummary']['status']
    ?? ''
);

if (!$envelopeId) {
    if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, "❌ WEBHOOK DOCUSIGN: sin envelopeId reconocible\nRAW: {$raw}");
    responder_docusign(false, 'Falta envelopeId');
}

try {
    $stmt = $pdo->prepare("SELECT id, autorizacion_cai_estado FROM clientes WHERE autorizacion_cai_envelope_id = ? LIMIT 1");
    $stmt->execute([$envelopeId]);
    $cliente = $stmt->fetch();
    if (!$cliente) {
        if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, "⚠ WEBHOOK DOCUSIGN: envelope {$envelopeId} sin cliente asociado (huérfano)");
        responder_docusign(true, 'Recibido, sin cliente asociado a ese envelope');
    }

    if ($cliente['autorizacion_cai_estado'] === 'firmada') {
        responder_docusign(true, 'Ya estaba marcada como firmada (reintento idempotente)');
    }

    if ($status === 'completed') {
        $pdo->prepare(
            "UPDATE clientes SET autorizacion_cai_estado = 'firmada', autorizacion_cai_fecha_firma = NOW() WHERE id = ?"
        )->execute([$cliente['id']]);
        if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, "✅ WEBHOOK DOCUSIGN: autorización CAI firmada -> cliente={$cliente['id']} envelope={$envelopeId}");
        responder_docusign(true, 'Autorización marcada como firmada');
    } elseif (in_array($status, ['declined', 'voided'], true)) {
        $pdo->prepare("UPDATE clientes SET autorizacion_cai_estado = 'rechazada' WHERE id = ?")->execute([$cliente['id']]);
        if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, "❌ WEBHOOK DOCUSIGN: autorización CAI rechazada/anulada -> cliente={$cliente['id']} envelope={$envelopeId} status={$status}");
        responder_docusign(true, 'Autorización marcada como rechazada');
    } else {
        // sent / delivered / otro estatus intermedio: solo se deja constancia.
        if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, "WEBHOOK DOCUSIGN: estatus intermedio '{$status}' -> envelope={$envelopeId}");
        responder_docusign(true, 'Recibido, sin cambio de estado');
    }
} catch (\Throwable $e) {
    if (API_LOG_ENABLED) webhook_log(API_LOG_FILE, '❌ ERROR webhook_docusign: ' . $e->getMessage());
    responder_docusign(false, 'Error de sistema');
}
