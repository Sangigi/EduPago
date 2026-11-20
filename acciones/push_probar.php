<?php
// acciones/push_probar.php — OF-7b (20-nov-2026)
//
// Manda un aviso de PRUEBA a TODOS los dispositivos con avisos activos de quien la llama, ahora mismo,
// y dice qué contestó cada servicio de push (solo códigos, para saber dónde se pierde si no aparece).
// Aquí el envío es inmediato (el usuario está esperando el resultado); los avisos de eventos, en
// cambio, se mandan después de responder.

$rolPush = $usuario_actual['rol'] ?? '';
requerir_rol($rolPush, PUSH_ROLES, 'Tu rol no usa avisos en el dispositivo.');
$uidPush = intval($usuario_actual['user_id'] ?? 0);

if (!push_tablas_listas($pdo) || !push_estado()['ok']) {
    respond(['success' => false, 'error' => 'Los avisos en el dispositivo no están disponibles por ahora.']);
}
if (!push_tasa_permitir('probar:' . $uidPush, 5, 60)) {
    http_response_code(429);
    respond(['success' => false, 'error' => 'Espera un minuto antes de mandar otra prueba.']);
}

$stPush = $pdo->prepare('SELECT COUNT(*) FROM push_suscripciones WHERE usuario_id = ? AND fallos < ' . PUSH_MAX_FALLOS);
$stPush->execute([$uidPush]);
$dispositivosPush = intval($stPush->fetchColumn());
if ($dispositivosPush === 0) {
    respond(['success' => true, 'dispositivos' => 0, 'enviados' => 0, 'fallidos' => 0, 'eliminados' => 0, 'codigos' => [],
             'mensaje' => 'Todavía no tienes ningún dispositivo con avisos activos. Actívalos primero.']);
}

// Sin deduplicar y sin despacho al cierre (tope 0): se manda aquí mismo.
push_encolar($pdo, 'prueba', 'SELECT u.id FROM usuarios u WHERE u.id = ?', [$uidPush],
    ['dedupe' => false, 'tope_cierre' => 0.0, 'tope_sin_cierre' => 0.0]);
$rPush = push_despachar($pdo, 6.0, 30, $uidPush);

respond([
    'success'      => true,
    'dispositivos' => $dispositivosPush,
    'enviados'     => $rPush['enviados'],
    'fallidos'     => $rPush['fallidos'],
    'eliminados'   => $rPush['eliminadas'],
    'codigos'      => array_values(array_unique(array_column($rPush['detalle'], 'codigo'))),
]);
