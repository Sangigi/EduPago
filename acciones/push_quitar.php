<?php
// acciones/push_quitar.php — OF-7b (20-nov-2026)
//
// Este dispositivo deja de recibir avisos. Solo borra una suscripción DE ESTA CUENTA. Siempre responde
// success (si no existía o ya no era suya, el resultado para quien llama es el mismo).
//
// Entrada (JSON): ep (dirección de suscripción en hexadecimal) o h (su SHA-256).

$rolPush = $usuario_actual['rol'] ?? '';
requerir_rol($rolPush, PUSH_ROLES, 'Tu rol no usa avisos en el dispositivo.');

$hashPush = strtolower(trim((string) ($input['h'] ?? '')));
if (!preg_match('/^[a-f0-9]{64}$/', $hashPush)) {
    $epPush = push_decodificar_campo($input['ep'] ?? ($input['endpoint'] ?? ''));
    $hashPush = $epPush !== '' ? push_endpoint_hash($epPush) : '';
}
if ($hashPush !== '' && push_tablas_listas($pdo)) {
    try {
        push_quitar($pdo, intval($usuario_actual['user_id'] ?? 0), $hashPush);
    } catch (\Throwable $e) {
        push_log('push_quitar: ' . $e->getMessage());
    }
}
respond(['success' => true]);
