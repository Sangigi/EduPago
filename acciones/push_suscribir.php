<?php
// acciones/push_suscribir.php — OF-7b (20-nov-2026)
//
// Este navegador/dispositivo avisa a la cuenta que tiene la sesión abierta.
//
// Entrada (JSON): ep (la dirección de suscripción del navegador, codificada en hexadecimal: algunos
// filtros de seguridad de hosting rechazan un "https://..." tal cual en el cuerpo), p256dh y auth
// (también en hexadecimal; opcionales: el toque va vacío y no se usan hoy).
//
// Solo se aceptan direcciones HTTPS de los servicios de push conocidos (push_endpoint_valido): el
// servidor no se usa para pegarle a URLs arbitrarias. Si la dirección ya estaba con otra cuenta
// (otra persona entró en ese navegador), pasa a esta: no hereda los avisos de la anterior.

$rolPush = $usuario_actual['rol'] ?? '';
requerir_rol($rolPush, PUSH_ROLES, 'Tu rol no usa avisos en el dispositivo.');
$uidPush = intval($usuario_actual['user_id'] ?? 0);

if (!push_tablas_listas($pdo) || !push_estado()['ok']) {
    respond(['success' => false, 'error' => 'Los avisos en el dispositivo no están disponibles por ahora.']);
}
if (!push_tasa_permitir('suscribir:' . $uidPush, 20, 60)) {
    http_response_code(429);
    respond(['success' => false, 'error' => 'Demasiados intentos. Espera un minuto.']);
}

$epPush = push_decodificar_campo($input['ep'] ?? ($input['endpoint'] ?? ''));
if (!push_endpoint_valido($epPush)) {
    respond(['success' => false, 'error' => 'La dirección de avisos de este navegador no es válida.']);
}
$p256Push = push_decodificar_campo($input['p256dh'] ?? '');
$authPush = push_decodificar_campo($input['auth'] ?? '');

try {
    $rPush = push_suscribir($pdo, $uidPush, !empty($usuario_actual['escuela_id']) ? intval($usuario_actual['escuela_id']) : null,
        $epPush, $p256Push !== '' ? $p256Push : null, $authPush !== '' ? $authPush : null,
        push_dispositivo_desde_ua($_SERVER['HTTP_USER_AGENT'] ?? ''));
} catch (\Throwable $e) {
    push_log('push_suscribir: ' . $e->getMessage());
    respond(['success' => false, 'error' => 'No se pudo guardar la suscripción. Intenta de nuevo.']);
}
respond(['success' => (bool) $rPush['ok'], 'error' => $rPush['error'] ?? null]);
