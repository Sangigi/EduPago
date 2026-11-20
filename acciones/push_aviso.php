<?php
// acciones/push_aviso.php — OF-7b (20-nov-2026)  ·  PÚBLICA (declarada en $acciones_publicas de api.php)
//
// La llama el service worker (sw-edupago.js) al despertar por un toque vacío, SIN sesión: el service
// worker no tiene la sesión de la página. Se identifica con el SHA-256 de su propia dirección de
// suscripción (campo h), que solo conocen el navegador, el servicio de push y el servidor.
//
// Qué responde: SOLO el texto del aviso de ESE dispositivo, y es genérico ("Tu pago fue confirmado"):
// jamás montos, nombres, folios ni contenido de tickets. Un hash que no existe y un dispositivo sin
// nada pendiente reciben la MISMA respuesta (el aviso genérico), así no se puede preguntar "¿existe
// este dispositivo?".
//
// Límite de tasa: por IP y por hash (push_tasa_permitir). Excedido = 429, y el service worker muestra
// igual su aviso genérico.

$hashAviso = strtolower(trim((string) ($input['h'] ?? '')));
$ipAviso = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
if (!push_tasa_permitir('aviso-ip:' . $ipAviso, 60, 60)
    || ($hashAviso !== '' && !push_tasa_permitir('aviso-h:' . $hashAviso, 20, 60))) {
    http_response_code(429);
    respond(['success' => false, 'error' => 'Demasiadas consultas.']);
}
respond(['success' => true] + push_aviso_para_hash($pdo, $hashAviso));
