<?php
/**
 * EduPago — "Entregar clabe" (SPEI)
 * Doc: IntegracionesSpei_V1_4 — sección EndPoint / Sandbox, campo
 * "Entregar clabe". Solo informativo, igual que entregar_referencia.php.
 * Configurar en Sandbox → EndPoint → Pago por SPEI → "Entregar clabe".
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/webhook_helpers.php';

header('Content-Type: application/json; charset=UTF-8');

$raw = file_get_contents('php://input');

if (defined('REFERENCIA_LOG_FILE')) {
    webhook_log(REFERENCIA_LOG_FILE, "SPEI-ENTREGAR | {$_SERVER['REQUEST_METHOD']} | RAW: {$raw}");
}

echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);