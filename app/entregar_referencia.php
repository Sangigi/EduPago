<?php
/**
 * EduPago — "Entregar referencia" (efectivo OXXO/terceros)
 * Doc: IntegracionesReferencias_V1_4 — sección EndPoint / Sandbox, campo
 * "Entregar referencia": "se registra el endpoint donde le entregaremos
 * los datos de la petición al momento de consumir nuestro api de
 * GenerarFormasPagos".
 *
 * A diferencia de Consultar/Pagar/Cancelar (que SÍ son servicios que TÚ
 * expones para que Cobroscontarjeta.com te pregunte algo y decida según tu
 * respuesta), este es solo informativo: CCT te manda una copia de lo que
 * procesó al generar la referencia. No hay estructura de respuesta
 * documentada que condicione nada del lado de CCT — solo se loguea.
 *
 * Configurar en Sandbox → EndPoint → Comercios → "Entregar referencia".
 */

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=UTF-8');

$raw = file_get_contents('php://input');

if (defined('REFERENCIA_LOG_FILE')) {
    file_put_contents(
        REFERENCIA_LOG_FILE,
        date('Y-m-d H:i:s') . " | ENTREGAR | {$_SERVER['REQUEST_METHOD']} | RAW: {$raw}\n",
        FILE_APPEND
    );
}

// No se requiere ninguna acción de negocio: la referencia ya se guardó en
// `cobros` desde generar_referencia_efectivo (api.php) en el momento en que
// EduPago llamó a GenerarReferenciaIndi. Solo confirmamos recepción.
echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);