<?php
// monedero_config_guardar — límite diario, NIP y bloqueo del monedero de UN alumno (F6).
//
// Roles: familia (solo su hijo) y admin. El ALUMNO no entra a propósito: es
// quien gasta, y no debe poder quitarse el NIP ni el límite que puso su familia.
// Solo se actualizan las claves que vengan en la petición:
//   limite_diario  null/'' = sin límite · 0..MONEDERO_VENTA_MAX (0 = no puede gastar nada)
//   nip            ''  = quitar el NIP · exactamente 4 dígitos = poner/cambiar
//   bloqueado      0|1
// Cambiar o quitar el NIP resetea el contador de intentos y su bloqueo.
// Nunca se devuelve nip_hash (monedero_publico).
$ctx = monedero_ctx($pdo, $usuario_actual, $input, ['familia', 'admin'], true);

$cliente_id = intval($input['cliente_id'] ?? 0);
$alumno = monedero_alumno($pdo, $ctx, $usuario_actual, $cliente_id);

$sets = []; $params = [];

if (array_key_exists('limite_diario', $input)) {
    $v = $input['limite_diario'];
    if ($v === null || $v === '') {
        $sets[] = 'limite_diario = NULL';
    } else {
        $lim = monedero_monto_valido($v, 0, MONEDERO_VENTA_MAX);
        if ($lim === null) {
            respond(['success' => false, 'error' => 'El límite diario debe ser un monto entre $0 y $' . number_format(MONEDERO_VENTA_MAX, 0) . ', o déjalo vacío para no poner límite.']);
        }
        $sets[] = 'limite_diario = ?';
        $params[] = $lim;
    }
}

if (array_key_exists('nip', $input)) {
    $nip = trim(strval($input['nip'] ?? ''));
    if ($nip === '') {
        $sets[] = 'nip_hash = NULL';
    } else {
        if (!preg_match('/^[0-9]{4}$/', $nip)) {
            respond(['success' => false, 'error' => 'El NIP debe tener exactamente 4 números.']);
        }
        $sets[] = 'nip_hash = ?';
        $params[] = password_hash($nip, PASSWORD_DEFAULT);
    }
    // Un NIP nuevo (o su ausencia) empieza sin intentos fallidos ni bloqueo.
    $sets[] = 'nip_intentos = 0';
    $sets[] = 'nip_bloqueado_hasta = NULL';
}

if (array_key_exists('bloqueado', $input)) {
    $sets[] = 'bloqueado = ?';
    $params[] = (!empty($input['bloqueado']) && strval($input['bloqueado']) !== '0') ? 1 : 0;
}

if (!$sets) respond(['success' => false, 'error' => 'No hay nada que guardar.']);

try {
    $pdo->beginTransaction();
    monedero_asegurar($pdo, $ctx['escuela_id'], $cliente_id);
    monedero_bloquear($pdo, $cliente_id);
    $pdo->prepare("UPDATE monederos SET " . implode(', ', $sets) . ", actualizado_en = NOW() WHERE cliente_id = ?")
        ->execute(array_merge($params, [$cliente_id]));
    $st = $pdo->prepare("SELECT * FROM monederos WHERE cliente_id = ?");
    $st->execute([$cliente_id]);
    $m = $st->fetch();
    $pdo->commit();

    // Sin el valor del NIP en el log: solo qué se tocó.
    $tocado = [];
    if (array_key_exists('limite_diario', $input)) $tocado[] = 'límite diario';
    if (array_key_exists('nip', $input)) $tocado[] = 'NIP';
    if (array_key_exists('bloqueado', $input)) $tocado[] = 'bloqueo';
    registrar_log($pdo, $usuario_actual, 'monedero_config', "Monedero de {$alumno['nombre']}: " . implode(', ', $tocado), $ctx['escuela_id']);

    respond(['success' => true, 'monedero' => monedero_publico($m)]);
} catch (\Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    monedero_fallo($e, 'monedero_config_guardar');
}
