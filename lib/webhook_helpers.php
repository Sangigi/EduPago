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

// ════════════════════════════════════════════════════════════════════════
// [OF-1] CANDADO POR SECRETO EN LA RUTA (19-nov-2026)
// ════════════════════════════════════════════════════════════════════════
//
// EL PROBLEMA: los 7 avisos que llaman ip_permitida_pago_sin_token() solo
// se defienden por IP, y con IPS_PERMITIDAS_PAGOS_SIN_TOKEN vacía aceptan a
// cualquiera. Para marcar un cobro como pagado basta saber su referencia y
// su monto, y la referencia va impresa en el ticket de la familia.
//
// LA SOLUCIÓN (la misma de OF-LIBERTYFIN, /pagadetodo/{secreto}/...): el
// proveedor llama a una dirección que lleva un secreto que solo él conoce:
//
//     https://DOMINIO/webhooks/pago_clabe.php/SECRETO
//
// Va en la RUTA (PATH_INFO) y no en ?k= porque el proveedor le agrega
// "/?r=CLABE" al final en las consultas: con ?k= el valor quedaría pegado
// ("SECRETO/?r=...") y se perdería el parámetro r. Con la ruta queda
// .../consulta_clabe.php/SECRETO/?r=CLABE y las dos cosas llegan bien.
//
// CONFIGURACIÓN (a mano en el config.php del servidor; NO en git, porque ese
// archivo tiene cambios locales y tocarlo rompería el git pull):
//
//   define('WEBHOOK_SECRETO_RUTA', '<48+ caracteres al azar>');
//       php -r "echo bin2hex(random_bytes(24));"
//   define('WEBHOOKS_EXIGIR_SECRETO', true);   // SOLO cuando ya estén dadas
//                                              // de alta TODAS las direcciones
//                                              // nuevas en el panel del proveedor
//
// TRANSICIÓN SIN CORTAR PAGOS:
//   1. Sin WEBHOOK_SECRETO_RUTA todo funciona exactamente como antes.
//   2. Con el secreto definido, las direcciones viejas siguen pasando por el
//      candado de IP de siempre, y las nuevas (con secreto) pasan aunque su
//      IP no esté en la lista.
//   3. Con WEBHOOKS_EXIGIR_SECRETO = true, lo que llegue sin el secreto se
//      rechaza aunque la IP esté permitida.
//
// El secreto se BORRA de $_SERVER en cuanto se lee, para que ninguna
// bitácora (ips_webhooks_log.txt guarda REQUEST_URI) lo escriba en disco.

/** Secreto que trae la petición en su ruta (primer segmento de PATH_INFO). */
function webhook_secreto_recibido(): string
{
    $pi = $_SERVER['PATH_INFO'] ?? ($_SERVER['ORIG_PATH_INFO'] ?? '');
    if (!is_string($pi) || $pi === '') return '';
    $partes = explode('/', trim($pi, '/'));
    return trim((string) ($partes[0] ?? ''));
}

/**
 * ¿Se le permite a esta petición seguir? Reemplaza a
 * ip_permitida_pago_sin_token() en los avisos de pago, que se sigue llamando
 * por dentro para conservar su bitácora de IPs.
 */
function webhook_origen_permitido(): bool
{
    static $resultado = null;
    if ($resultado !== null) return $resultado;

    $configurado = defined('WEBHOOK_SECRETO_RUTA') ? trim((string) WEBHOOK_SECRETO_RUTA) : '';
    $exigir      = defined('WEBHOOKS_EXIGIR_SECRETO') && WEBHOOKS_EXIGIR_SECRETO === true;
    $recibido    = webhook_secreto_recibido();

    // Borrar el secreto de todo lo que alguna bitácora pudiera escribir. Solo
    // si es largo: un "secreto" de 1-2 letras mandado por un curioso no debe
    // tachar letras sueltas de la URL registrada.
    if (strlen($recibido) >= 16) {
        foreach (['REQUEST_URI', 'PATH_INFO', 'ORIG_PATH_INFO', 'PHP_SELF', 'PATH_TRANSLATED',
                  'SCRIPT_URL', 'SCRIPT_URI', 'REDIRECT_URL', 'UNENCODED_URL'] as $k) {
            if (isset($_SERVER[$k]) && is_string($_SERVER[$k])) {
                $_SERVER[$k] = str_replace($recibido, '***', $_SERVER[$k]);
            }
        }
    }

    // Un secreto corto en config no protege nada: se trata como no configurado.
    $secreto_ok = strlen($configurado) >= 24 && $recibido !== '' && hash_equals($configurado, $recibido);

    // Se llama SIEMPRE: escribe la línea de ips_webhooks_log.txt (ya sin el
    // secreto) y aplica la lista de IPs para las direcciones viejas.
    $ip_ok = function_exists('ip_permitida_pago_sin_token') ? ip_permitida_pago_sin_token() : true;

    $estado = $secreto_ok ? 'secreto-ok' : ($recibido !== '' ? 'secreto-INCORRECTO' : 'sin-secreto');
    if ($secreto_ok) {
        $resultado = true;
    } elseif ($exigir) {
        $resultado = false;
    } else {
        $resultado = $ip_ok;
    }
    @file_put_contents(
        __DIR__ . '/../ips_webhooks_log.txt',
        date('Y-m-d H:i:s') . ' | ' . ($_SERVER['REMOTE_ADDR'] ?? 'sin-ip')
            . ' | ' . basename((string) ($_SERVER['SCRIPT_NAME'] ?? '?'))
            . ' | ' . $estado . ($exigir ? ' (exigido)' : '')
            . ' | ' . ($resultado ? 'PASA' : 'RECHAZADA') . "\n",
        FILE_APPEND
    );
    return $resultado;
}
