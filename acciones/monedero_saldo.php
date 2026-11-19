<?php
// monedero_saldo — saldo y configuración del monedero de UN alumno (F6).
//
// Roles: familia (su hijo), alumno (él mismo), admin, cajero y superadmin.
// El alumno NUNCA manda su cliente_id: sale de su sesión (usuarios.cliente_id).
//
// Es una LECTURA: no se corta con el módulo apagado, pero con el módulo
// apagado y el alumno sin saldo ni movimientos responde habilitado:false SIN la
// clave `saldo`, que es la señal con la que PortalAlumno oculta su pestaña.
// Si tiene saldo o historial se muestra aunque el colegio apague el módulo:
// apagarlo no esconde el dinero de nadie.
$ctx = monedero_ctx($pdo, $usuario_actual, $input, ['familia', 'alumno', 'admin', 'cajero', 'superadmin']);

if ($ctx['rol'] === 'alumno') {
    $cliente_id = monedero_cliente_de_usuario_alumno($pdo, $usuario_actual);
    if ($cliente_id <= 0) respond(['success' => true, 'habilitado' => false]);
} else {
    $cliente_id = intval($input['cliente_id'] ?? $_GET['cliente_id'] ?? 0);
}
$alumno = monedero_alumno($pdo, $ctx, $usuario_actual, $cliente_id);

$activo = monedero_activo($pdo, $ctx['escuela_id']);
$es_cliente = in_array($ctx['rol'], ['familia', 'alumno'], true);
if (!$activo && $es_cliente && !monedero_tiene_historial($pdo, $cliente_id)) {
    respond(['success' => true, 'habilitado' => false]);
}

// Antes de mostrar un saldo se acreditan las recargas ya pagadas que el barrido
// todavía no había visto (los webhooks no tocan el monedero). Fuera de
// transacción: el barrido abre las suyas.
monedero_acreditar_recargas($pdo, $cliente_id);

$est = monedero_estado($pdo, $cliente_id);
$resp = [
    'success'        => true,
    'habilitado'     => $activo,
    'cliente_id'     => $cliente_id,
    'saldo'          => $est['saldo'],
    'limite_diario'  => $est['limite_diario'],
    'tiene_nip'      => $est['tiene_nip'],
    'bloqueado'      => $est['bloqueado'],
    'consumido_hoy'  => $est['consumido_hoy'],
    'disponible_hoy' => $est['disponible_hoy'],
];
// Las recargas pendientes llevan folio/referencia de pago: solo quien paga
// (familia) y la administración las ven, no el alumno.
if (in_array($ctx['rol'], ['familia', 'admin', 'superadmin'], true)) {
    $resp['recargas_pendientes'] = monedero_recargas_pendientes($pdo, $cliente_id);
}
respond($resp);
