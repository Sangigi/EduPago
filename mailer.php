<?php
/**
 * mailer.php — Envío de correo por SMTP, sin dependencias externas (no hay
 * Composer/vendor en este proyecto; ver PRODUCCION.md). Habla el protocolo
 * SMTP directo por sockets (EHLO/STARTTLS/AUTH LOGIN/MAIL FROM/RCPT TO/DATA).
 *
 * Uso:
 *   require_once __DIR__ . '/mailer.php';
 *   $r = enviar_correo('familia@ejemplo.com', 'Asunto', '<p>Hola</p>');
 *   // Con adjuntos (ej. PDF de factura):
 *   $r = enviar_correo($email, $asunto, $html, [
 *     ['nombre' => 'factura.pdf', 'contenido' => $pdfBinario, 'mime' => 'application/pdf'],
 *   ]);
 *   if (!$r['success']) { ... $r['error'] ... }
 *
 * Los errores también se registran en CORREOS_LOG_FILE (config.php).
 */

function enviar_correo($destinatarios, $asunto, $htmlBody, $adjuntos = []) {
    $destinatarios = is_array($destinatarios) ? $destinatarios : [$destinatarios];
    $destinatarios = array_values(array_unique(array_filter(array_map('trim', $destinatarios))));
    if (empty($destinatarios)) {
        return ['success' => false, 'error' => 'Sin destinatarios'];
    }

    try {
        $socket = _smtp_conectar();
        _smtp_leer($socket, 220);

        _smtp_ehlo($socket);

        if (strtolower(SMTP_SECURE) === 'tls') {
            _smtp_comando($socket, "STARTTLS", 220);
            if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new Exception('No se pudo iniciar TLS (STARTTLS) con el servidor SMTP.');
            }
            _smtp_ehlo($socket);
        }

        _smtp_comando($socket, "AUTH LOGIN", 334);
        _smtp_comando($socket, base64_encode(SMTP_USER), 334);
        _smtp_comando($socket, base64_encode(SMTP_PASS), 235);

        _smtp_comando($socket, "MAIL FROM:<" . SMTP_FROM_EMAIL . ">", 250);
        foreach ($destinatarios as $to) {
            _smtp_comando($socket, "RCPT TO:<$to>", [250, 251]);
        }

        _smtp_comando($socket, "DATA", 354);
        $mensaje = _construir_mensaje($destinatarios, $asunto, $htmlBody, $adjuntos);
        fwrite($socket, $mensaje . "\r\n.\r\n");
        _smtp_leer($socket, 250);

        _smtp_comando($socket, "QUIT", 221);
        fclose($socket);

        return ['success' => true, 'error' => null];
    } catch (Exception $e) {
        if (isset($socket) && is_resource($socket)) fclose($socket);
        $msg = $e->getMessage();
        if (defined('CORREOS_LOG_FILE')) {
            file_put_contents(CORREOS_LOG_FILE, date('Y-m-d H:i:s') . " | ERROR enviando a [" . implode(',', $destinatarios) . "] asunto \"$asunto\": $msg\n", FILE_APPEND);
        }
        return ['success' => false, 'error' => $msg];
    }
}

function _smtp_conectar() {
    $host = (strtolower(SMTP_SECURE) === 'ssl' ? 'ssl://' : '') . SMTP_HOST;
    $socket = @stream_socket_client("$host:" . SMTP_PORT, $errno, $errstr, 15);
    if (!$socket) {
        throw new Exception("No se pudo conectar a " . SMTP_HOST . ":" . SMTP_PORT . " ($errno: $errstr)");
    }
    stream_set_timeout($socket, 15);
    return $socket;
}

function _smtp_ehlo($socket) {
    fwrite($socket, "EHLO " . (defined('SMTP_FROM_EMAIL') ? substr(strrchr(SMTP_FROM_EMAIL, "@"), 1) : 'localhost') . "\r\n");
    _smtp_leer($socket, 250);
}

// Envía un comando y valida que la respuesta empiece con alguno de los
// códigos esperados (int o array de ints); lanza excepción si no.
function _smtp_comando($socket, $comando, $codigosEsperados) {
    fwrite($socket, $comando . "\r\n");
    $respuesta = _smtp_leer($socket, $codigosEsperados);
    return $respuesta;
}

// Lee la respuesta completa del servidor (puede venir en varias líneas,
// "250-..." de continuación y "250 ..." en la última) y valida el código.
function _smtp_leer($socket, $codigosEsperados) {
    $codigosEsperados = is_array($codigosEsperados) ? $codigosEsperados : [$codigosEsperados];
    $buffer = '';
    while (($linea = fgets($socket, 515)) !== false) {
        $buffer .= $linea;
        // La última línea de una respuesta multi-línea tiene un espacio (no
        // guion) en la 4ª posición: "250 OK" vs "250-EXTENSION".
        if (strlen($linea) < 4 || $linea[3] === ' ') break;
    }
    if ($buffer === '') {
        throw new Exception('El servidor SMTP cerró la conexión sin responder.');
    }
    $codigo = intval(substr($buffer, 0, 3));
    if (!in_array($codigo, $codigosEsperados, true)) {
        throw new Exception("Respuesta SMTP inesperada: " . trim($buffer));
    }
    return $buffer;
}

function _construir_mensaje($destinatarios, $asunto, $htmlBody, $adjuntos = []) {
    $fromNombre = _mime_encode(SMTP_FROM_NAME);
    $asuntoCod  = _mime_encode($asunto);
    $to = implode(', ', $destinatarios);
    $fechaHdr = date('r');
    $messageId = '<' . bin2hex(random_bytes(16)) . '@' . substr(strrchr(SMTP_FROM_EMAIL, "@"), 1) . '>';

    $headersBase = [
        "From: $fromNombre <" . SMTP_FROM_EMAIL . ">",
        "To: $to",
        "Subject: $asuntoCod",
        "Date: $fechaHdr",
        "Message-ID: $messageId",
        "MIME-Version: 1.0",
    ];

    // Base64 evita tener que escapar líneas que empiecen con "." (dot-stuffing)
    // o preocuparse por saltos de línea sueltos dentro del HTML.
    $cuerpoHtml = chunk_split(base64_encode($htmlBody));

    $adjuntos = array_filter($adjuntos, fn($a) => !empty($a['contenido']));
    if (empty($adjuntos)) {
        $headers = array_merge($headersBase, [
            "Content-Type: text/html; charset=UTF-8",
            "Content-Transfer-Encoding: base64",
        ]);
        return implode("\r\n", $headers) . "\r\n\r\n" . $cuerpoHtml;
    }

    // Con adjuntos: multipart/mixed — una parte HTML + una parte por adjunto
    // (ej. el PDF de una factura CFDI en enviar_factura_correo).
    $boundary = 'pagalaescuela-' . bin2hex(random_bytes(12));
    $headers = array_merge($headersBase, [
        "Content-Type: multipart/mixed; boundary=\"$boundary\"",
    ]);

    $partes  = "--$boundary\r\n";
    $partes .= "Content-Type: text/html; charset=UTF-8\r\n";
    $partes .= "Content-Transfer-Encoding: base64\r\n\r\n";
    $partes .= $cuerpoHtml . "\r\n";

    foreach ($adjuntos as $adj) {
        $nombre    = $adj['nombre']    ?? 'adjunto.bin';
        $contenido = $adj['contenido'] ?? '';
        $mime      = $adj['mime']      ?? 'application/octet-stream';
        $partes .= "--$boundary\r\n";
        $partes .= "Content-Type: $mime; name=\"$nombre\"\r\n";
        $partes .= "Content-Transfer-Encoding: base64\r\n";
        $partes .= "Content-Disposition: attachment; filename=\"$nombre\"\r\n\r\n";
        $partes .= chunk_split(base64_encode($contenido)) . "\r\n";
    }
    $partes .= "--$boundary--\r\n";

    return implode("\r\n", $headers) . "\r\n\r\n" . $partes;
}

function _mime_encode($texto) {
    if (preg_match('/^[\x20-\x7E]*$/', $texto)) return $texto; // solo ASCII, no requiere codificar
    return '=?UTF-8?B?' . base64_encode($texto) . '?=';
}
