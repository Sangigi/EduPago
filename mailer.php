<?php
/**
 * EduPago — Envío de correo (mail() nativo de PHP)
 *
 * Sin dependencias externas (no hay Composer/PHPMailer en el proyecto).
 * Hostinger soporta mail() sin configuración adicional, pero sin SMTP
 * autenticado/SPF/DKIM la entregabilidad es limitada. Si se contrata un SMTP
 * real más adelante, basta con reescribir el cuerpo de enviar_correo() —
 * ningún llamador necesita cambiar.
 */

require_once __DIR__ . '/config.php';

/**
 * Envía un correo HTML con adjuntos opcionales.
 *
 * @param string $destinatario Email del destinatario.
 * @param string $asunto
 * @param string $html_body Cuerpo en HTML.
 * @param array  $adjuntos  [{ nombre: string, contenido: string (binario), mime: string }]
 * @return array { success: bool, error?: string }
 */
function enviar_correo($destinatario, $asunto, $html_body, $adjuntos = []) {
    $destinatario = trim($destinatario);
    if (!$destinatario || !filter_var($destinatario, FILTER_VALIDATE_EMAIL)) {
        return ['success' => false, 'error' => 'Correo destinatario inválido'];
    }

    $boundary = 'edupago-' . bin2hex(random_bytes(12));
    $from_header = MAIL_FROM_NAME . ' <' . MAIL_FROM_EMAIL . '>';

    $headers = [];
    $headers[] = 'From: ' . $from_header;
    $headers[] = 'Reply-To: ' . MAIL_FROM_EMAIL;
    $headers[] = 'MIME-Version: 1.0';
    $headers[] = 'Content-Type: multipart/mixed; boundary="' . $boundary . '"';

    $body = "--{$boundary}\r\n";
    $body .= "Content-Type: text/html; charset=UTF-8\r\n";
    $body .= "Content-Transfer-Encoding: 8bit\r\n\r\n";
    $body .= $html_body . "\r\n\r\n";

    foreach ($adjuntos as $adj) {
        $nombre    = $adj['nombre']    ?? 'adjunto.bin';
        $contenido = $adj['contenido'] ?? '';
        $mime      = $adj['mime']      ?? 'application/octet-stream';
        if ($contenido === '') continue;
        $body .= "--{$boundary}\r\n";
        $body .= "Content-Type: {$mime}; name=\"{$nombre}\"\r\n";
        $body .= "Content-Transfer-Encoding: base64\r\n";
        $body .= "Content-Disposition: attachment; filename=\"{$nombre}\"\r\n\r\n";
        $body .= chunk_split(base64_encode($contenido)) . "\r\n";
    }
    $body .= "--{$boundary}--";

    // El asunto y el destinatario vienen de datos de la escuela/cliente — se
    // sanitizan quitando saltos de línea para evitar inyección de headers
    // (un \r\n en el asunto podría inyectar un destinatario BCC no deseado).
    $asunto_limpio = str_replace(["\r", "\n"], '', $asunto);

    $enviado = @mail($destinatario, $asunto_limpio, $body, implode("\r\n", $headers));

    if (!$enviado) {
        return ['success' => false, 'error' => 'El servidor no pudo enviar el correo (mail() falló)'];
    }
    return ['success' => true];
}
