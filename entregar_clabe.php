<?php
/**
 * EduPago — "Entregar clabe" (SPEI)
 * Doc: IntegracionesSpei_V1_4 — sección EndPoint / Sandbox, campo
 * "Entregar clabe". Solo informativo, igual que entregar_referencia.php.
 * Configurar en Sandbox → EndPoint → Pago por SPEI → "Entregar clabe".
 */

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=UTF-8');

$raw = file_get_contents('php://input');

if (defined('REFERENCIA_LOG_FILE')) {
    file_put_contents(
        REFERENCIA_LOG_FILE,
        date('Y-m-d H:i:s') . " | SPEI-ENTREGAR | {$_SERVER['REQUEST_METHOD']} | RAW: {$raw}\n",
        FILE_APPEND
    );
}

echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);