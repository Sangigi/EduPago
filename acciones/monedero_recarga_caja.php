<?php
// monedero_recarga_caja — recarga PRESENCIAL en caja (efectivo o terminal) (F6).
//
// El cobro nace YA PAGADO y se acredita en la misma transacción. Deja el cobro
// con los mismos efectos que un cobro de mostrador normal (crear_cobro +
// confirmar_pago): caja_id y sucursal_id de la caja abierta del cajero,
// estado 'pagado' y monto_pagado = total. Así aparece en el corte de caja
// (caja_cerrar suma cobros pagados con ese caja_id por método) igual que
// cualquier cobro en efectivo o tarjeta. Como en Caja.js, cajero y admin
// necesitan una caja abierta propia; el dinero que entra por aquí DEBE estar
// en el cajón al cerrar, por eso no se puede acreditar sin caja.
//
// Roles: admin y cajero (superadmin no opera el POS).
// solicitud_key obligatoria: un doble clic o un reintento tras un timeout
// devuelve la recarga ya hecha en vez de duplicarla.
$ctx = monedero_ctx($pdo, $usuario_actual, $input, ['admin', 'cajero'], true);

$cliente_id = intval($input['cliente_id'] ?? 0);
$metodo = trim(strval($input['metodo'] ?? ''));
if (!in_array($metodo, ['Efectivo', 'TC'], true)) {
    respond(['success' => false, 'error' => 'Elige si la recarga se cobró en efectivo o con terminal (tarjeta).']);
}
$monto = monedero_monto_valido($input['monto'] ?? null, MONEDERO_RECARGA_MIN, MONEDERO_RECARGA_MAX);
if ($monto === null) {
    respond(['success' => false, 'error' => 'El monto de la recarga debe estar entre $' . number_format(MONEDERO_RECARGA_MIN, 0)
        . ' y $' . number_format(MONEDERO_RECARGA_MAX, 0) . '.']);
}
$llave = monedero_llave_cliente($input['solicitud_key'] ?? null);
if ($llave === null) {
    respond(['success' => false, 'error' => 'Falta la llave de la operación. Recarga la pantalla e intenta de nuevo.']);
}
// Acotada por colegio: dos colegios con la misma llave no deben chocar.
$solicitud_key = 'e' . $ctx['escuela_id'] . ':' . $llave;
$alumno = monedero_alumno($pdo, $ctx, $usuario_actual, $cliente_id, true);
$monto_c = monedero_c($monto);

// ── Caja abierta del usuario (mismo requisito que crear_cobro.php) ──
$caja_id = intval($input['caja_id'] ?? 0);
if ($caja_id) {
    $st = $pdo->prepare(
        "SELECT ca.id, ca.sucursal_id FROM caja ca JOIN sucursales s ON s.id = ca.sucursal_id
          WHERE ca.id = ? AND ca.usuario_id = ? AND ca.estado = 'abierta' AND s.escuela_id = ?"
    );
    $st->execute([$caja_id, $ctx['user_id'], $ctx['escuela_id']]);
} else {
    $st = $pdo->prepare(
        "SELECT ca.id, ca.sucursal_id FROM caja ca JOIN sucursales s ON s.id = ca.sucursal_id
          WHERE ca.usuario_id = ? AND ca.estado = 'abierta' AND s.escuela_id = ?
          ORDER BY ca.id DESC LIMIT 1"
    );
    $st->execute([$ctx['user_id'], $ctx['escuela_id']]);
}
$caja = $st->fetch();

/** Respuesta de una recarga ya registrada con esa solicitud_key (reintento). */
$responder_hecha = function (array $mov) use ($pdo, $cliente_id, $ctx) {
    if (intval($mov['cliente_id']) !== $cliente_id || intval($mov['escuela_id']) !== $ctx['escuela_id']) {
        respond(['success' => false, 'error' => 'Esa operación ya se usó para otro alumno. Recarga la pantalla e intenta de nuevo.']);
    }
    $co = null;
    if (!empty($mov['cobro_id'])) {
        $s = $pdo->prepare("SELECT id, folio, total, metodo FROM cobros WHERE id = ?");
        $s->execute([intval($mov['cobro_id'])]);
        $co = $s->fetch() ?: null;
    }
    respond(['success' => true, 'duplicado' => true,
        'cobro' => $co ? ['id' => intval($co['id']), 'folio' => $co['folio'], 'total' => round(floatval($co['total']), 2), 'metodo' => $co['metodo']] : null,
        'saldo_despues' => round(floatval($mov['saldo_despues']), 2)]);
};

// Reintento: se contesta ANTES de pedir caja (la caja pudo cerrarse entre el
// primer intento y el reintento, y aun así la recarga ya está hecha).
$buscar = $pdo->prepare("SELECT cliente_id, escuela_id, cobro_id, saldo_despues FROM monedero_movimientos WHERE solicitud_key = ? LIMIT 1");
$buscar->execute([$solicitud_key]);
if ($previo = $buscar->fetch()) $responder_hecha($previo);

if (!$caja) {
    respond(['success' => false, 'error' => 'No tienes una caja abierta. Abre tu turno en "Corte de caja" antes de recargar el monedero.']);
}

try {
    $pdo->beginTransaction();
    monedero_asegurar($pdo, $ctx['escuela_id'], $cliente_id);
    monedero_bloquear($pdo, $cliente_id);

    // Bajo el candado del monedero se vuelve a mirar: otra petición con la
    // misma llave para este alumno pudo terminar mientras esperábamos.
    $buscar->execute([$solicitud_key]);
    if ($previo = $buscar->fetch()) {
        $pdo->rollBack();
        $responder_hecha($previo);
    }

    $cobro_id = 0; $folio = '';
    for ($intento = 0; $intento < 3; $intento++) {
        $folio = monedero_folio_nuevo($pdo, $ctx['escuela_id']);
        try {
            $pdo->prepare(
                "INSERT INTO cobros (escuela_id, cliente_id, folio, total, metodo, estado, monto_pagado, fecha, referencia, sucursal_id, caja_id, es_recarga_monedero)
                 VALUES (?, ?, ?, ?, ?, 'pagado', ?, CURDATE(), ?, ?, ?, 1)"
            )->execute([$ctx['escuela_id'], $cliente_id, $folio, $monto, $metodo, $monto,
                $alumno['matricula'] ?? '', intval($caja['sucursal_id']), intval($caja['id'])]);
            $cobro_id = intval($pdo->lastInsertId());
            break;
        } catch (\PDOException $e) {
            if ($e->getCode() !== '23000' || $intento === 2) throw $e;
        }
    }
    try {
        $pdo->prepare(
            "INSERT INTO cobro_items (cobro_id, producto_id, nombre, cantidad, precio_unitario, subtotal)
             VALUES (?, NULL, 'Recarga de monedero', 1, ?, ?)"
        )->execute([$cobro_id, $monto, $monto]);
    } catch (\PDOException $e) {
        log_api('monedero_recarga_caja: cobro_items no disponible: ' . $e->getMessage());
    }

    $r = monedero_mover($pdo, $ctx['escuela_id'], $cliente_id, 'recarga', 1, $monto_c,
        'recarga:' . $cobro_id, [
            'cobro_id'      => $cobro_id,
            'solicitud_key' => $solicitud_key,
            'usuario_id'    => $ctx['user_id'],
            'descripcion'   => 'Recarga ' . $folio . ' (' . monedero_etiqueta_metodo($metodo) . ')',
        ]);
    $pdo->commit();

    registrar_log($pdo, $usuario_actual, 'monedero_recarga_caja',
        "Recarga en caja cobro #{$cobro_id} folio {$folio} para {$alumno['nombre']}, \${$monto}, {$metodo}", $ctx['escuela_id']);
    respond(['success' => true, 'duplicado' => false,
        'cobro' => ['id' => $cobro_id, 'folio' => $folio, 'total' => $monto, 'metodo' => $metodo],
        'saldo_despues' => $r['saldo_despues']]);
} catch (\Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    // UNIQUE de solicitud_key: la misma llave ya la usó OTRO alumno.
    if ($e instanceof \PDOException && $e->getCode() === '23000') {
        monedero_log('monedero_recarga_caja: llave repetida ' . $solicitud_key . ' ' . $e->getMessage());
        respond(['success' => false, 'error' => 'Esa operación ya se registró. Recarga la pantalla y revisa el saldo del alumno antes de repetirla.']);
    }
    monedero_fallo($e, 'monedero_recarga_caja');
}
