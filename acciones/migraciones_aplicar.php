<?php
// acciones/migraciones_aplicar.php  [OF-4a]
//
// Aplica los pasos de migración pendientes (ver lib/migraciones.php). Solo
// superadmin y SOLO con confirmación explícita ({"confirmar": true}): un ALTER
// sobre una tabla grande bloquea esa tabla mientras corre, así que no debe
// dispararse por accidente ni en horario de cobro. Lo recomendable es la línea
// de comandos (php herramientas/migrar.php --aplicar); esto existe para quien
// no tiene SSH a la mano.

requerir_rol($usuario_actual['rol'] ?? '', ['superadmin'], 'Solo el super admin puede aplicar migraciones.');

if (empty($input['confirmar'])) {
    respond(['success' => false, 'error' => 'Falta la confirmación para aplicar las migraciones.']);
}

require_once __DIR__ . '/../lib/migraciones.php';

// Que cerrar la pestaña a medio ALTER no mate el script, y que haya margen.
ignore_user_abort(true);
@set_time_limit(300);

try {
    $res = migraciones_aplicar($pdo);
} catch (\Throwable $e) {
    log_api('migraciones_aplicar fallo: ' . $e->getMessage());
    respond(['success' => false, 'error' => 'No se pudieron aplicar las migraciones: ' . $e->getMessage()]);
}

registrar_log(
    $pdo, $usuario_actual, 'migraciones_aplicadas',
    'Aplicadas: ' . $res['aplicadas'] . ' | ya existian: ' . $res['ya_existian'] . ' | avisos: ' . $res['avisos']
        . ($res['ok'] ? '' : ' | ERROR en ' . ($res['error']['id'] ?? '-') . ': ' . ($res['error']['mensaje'] ?? ''))
);

$estado = migraciones_estado($pdo);
respond([
    'success'     => $res['ok'],
    'error'       => $res['ok'] ? null : ('Se detuvo en ' . ($res['error']['id'] ?? '-') . ': ' . ($res['error']['mensaje'] ?? '')),
    'resultado'   => $res,
    'pendientes'  => $estado['pendientes'],
    'por_registrar' => $estado['por_registrar'],
    'pasos'       => $estado['pasos'],
    'total'       => $estado['total'],
    'bloqueadas'  => $estado['bloqueadas'],
]);
