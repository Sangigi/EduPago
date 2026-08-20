<?php
// webhook_helpers.php
//
// Los 10 endpoints de pago (webhook_liga.php, webhook_spei.php,
// pago_referencia.php, cancela_pago_referencia.php, cancela_pago_spei.php,
// pago_clabe.php, consulta_referencia.php, consulta_clabe.php,
// entregar_referencia.php, entregar_clabe.php) cada uno reimplementaba dos
// mecánicas idénticas:
//
//  1) "escribe una línea con fecha a un archivo de log" (log_api_liga,
//     log_ref_pago, log_ref_cancela, log_cancela_spei, log_clabe, log_ref,
//     log_pago_clabe, o líneas sueltas de file_put_contents). Se centraliza
//     en webhook_log() — cada archivo conserva su propia función de log con
//     su nombre y su condición de activado (API_LOG_ENABLED vs
//     defined('REFERENCIA_LOG_FILE')) tal cual estaban, solo delegando la
//     escritura real.
//
//  2) "arma el JSON de respuesta y corta la ejecución" (responder_liga,
//     responder de SPEI, responder_pago, responder_cancela_spei,
//     responder_consulta, responder_consulta_clabe, responder_pago_clabe).
//     Se centraliza en webhook_responder() — a propósito NO unifica el
//     CONTENIDO del JSON (cada proveedor/endpoint espera campos distintos:
//     'codigo'/'autorizacion'/'transaccion'/'fecha', o 'success'/'mensaje',
//     etc. — ver el manual de Cobroscontarjeta.com/Pagadetodo de cada uno).
//     Cada responder_* sigue armando su propio arreglo específico; solo se
//     comparte el "echo json_encode(...); exit;" mecánico que los 8
//     repetían idéntico.

function webhook_log($archivo, $mensaje) {
    file_put_contents($archivo, date('Y-m-d H:i:s') . ' | ' . $mensaje . "\n", FILE_APPEND);
}

function webhook_responder($payload) {
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}
