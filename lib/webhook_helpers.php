<?php
// webhook_helpers.php
//
// Los 4 webhooks de pago (webhook_liga.php, webhook_spei.php,
// pago_referencia.php, cancela_pago_referencia.php) cada uno reimplementaba
// la misma mecánica de "escribe una línea con fecha a un archivo de log"
// (log_api_liga, log_ref_pago, log_ref_cancela, o líneas sueltas de
// file_put_contents repetidas en webhook_spei.php). Se centraliza aquí esa
// única pieza mecánica — cada webhook conserva su propia función de log con
// su nombre y su condición de activado (API_LOG_ENABLED vs
// defined('REFERENCIA_LOG_FILE')) tal cual estaban, solo delegando la
// escritura real a webhook_log().
//
// A propósito NO se toca ningún formateador de respuesta (responder_liga,
// responder de SPEI, responder_pago, responder_cancela): cada uno habla un
// protocolo JSON distinto y específico del proveedor (Cobroscontarjeta.com/
// Pagadetodo) — unificarlos arriesgaría romper ese contrato externo.

function webhook_log($archivo, $mensaje) {
    file_put_contents($archivo, date('Y-m-d H:i:s') . ' | ' . $mensaje . "\n", FILE_APPEND);
}
