<?php
// acciones/push_llave_publica.php — OF-7b (20-nov-2026)
//
// La llave pública VAPID del servidor, para que el navegador se suscriba a los avisos push, y si los
// avisos están disponibles. NO crea nada en la base: sin la migración (tablas push_*) o sin llaves,
// responde disponible = false y la pantalla simplemente no ofrece la opción.
//
// Responde solo lo que ese navegador necesita. El detalle de por qué están apagados (OpenSSL sin
// curvas elípticas, carpeta sin permiso de escritura) solo lo recibe el superadmin.
//
// La llave privada NUNCA sale de uploads_privados/push_vapid.pem. Ver lib/helpers_push.php.

$rolPush = $usuario_actual['rol'] ?? '';
requerir_rol($rolPush, PUSH_ROLES, 'Tu rol no usa avisos en el dispositivo.');

if (!push_tablas_listas($pdo)) {
    respond(['success' => true, 'disponible' => false, 'motivo' => 'migracion']);
}
$estadoPush = push_estado();
if (!$estadoPush['ok']) {
    $resp = ['success' => true, 'disponible' => false, 'motivo' => 'servidor'];
    if ($rolPush === 'superadmin') $resp['detalle'] = $estadoPush['motivo'];
    respond($resp);
}
$llavesPush = push_llaves();
respond(['success' => true, 'disponible' => true, 'llave' => $llavesPush['publica']]);
