<?php
// tienda_vender — cobra una compra de la tiendita contra el monedero del alumno (F6).
//
// Roles: tienda y admin. Se corta con el monedero apagado.
// TODAS las reglas corren dentro de UNA transacción con el renglón del monedero
// bloqueado (SELECT ... FOR UPDATE): ese candado serializa dos ventas
// simultáneas del mismo alumno (dos cajeros, doble clic) para que no gasten el
// mismo saldo dos veces, y hace que el NIP, el límite diario y el saldo se
// evalúen sobre datos que nadie más puede cambiar mientras tanto.
//
//   · Los precios salen SIEMPRE de tienda_productos (mismo colegio, activos);
//     el navegador solo manda producto_id y cantidad.
//   · idem_key (del navegador, una por intento) se guarda como 'e<escuela>:<llave>':
//     reintentar el mismo cobro tras un error de red devuelve la venta ya hecha.
//   · NIP: cada fallo se COMMITEA (si se hiciera rollback el contador nunca
//     subiría y el NIP de 4 dígitos se adivinaría en 10,000 intentos).
$ctx = monedero_ctx($pdo, $usuario_actual, $input, ['tienda', 'admin'], true);

$cliente_id = intval($input['cliente_id'] ?? 0);

// ── Llave de idempotencia ──
$llave = monedero_llave_cliente($input['idem_key'] ?? null);
if ($llave === null) {
    respond(['success' => false, 'error' => 'Falta la llave de la operación. Recarga la pantalla e intenta de nuevo.']);
}
$venta_key = 'e' . $ctx['escuela_id'] . ':' . $llave;

// ── Renglones y total (en centavos) ──
$items_in = $input['items'] ?? [];
if (!is_array($items_in)) $items_in = [];
if (count($items_in) > 40) respond(['success' => false, 'error' => 'Demasiados renglones en una sola venta.']);
$pedidos = []; // producto_id => cantidad
foreach ($items_in as $it) {
    $pid = filter_var($it['producto_id'] ?? null, FILTER_VALIDATE_INT);
    $cant = filter_var($it['cantidad'] ?? null, FILTER_VALIDATE_INT);
    if ($pid === false || $pid <= 0 || $cant === false || $cant < 1 || $cant > 50) {
        respond(['success' => false, 'error' => 'Cada producto debe llevar una cantidad entera entre 1 y 50.']);
    }
    $pedidos[$pid] = ($pedidos[$pid] ?? 0) + $cant;
    if ($pedidos[$pid] > 50) respond(['success' => false, 'error' => 'Máximo 50 piezas de un mismo producto por venta.']);
}
$libre_c = 0; $concepto_libre = '';
if (isset($input['monto_libre']) && $input['monto_libre'] !== '' && $input['monto_libre'] !== null) {
    $libre = monedero_monto_valido($input['monto_libre'], 0.01, MONEDERO_VENTA_MAX);
    if ($libre === null) respond(['success' => false, 'error' => 'El monto libre debe ser mayor a $0 y no pasar de $' . number_format(MONEDERO_VENTA_MAX, 0) . '.']);
    $libre_c = monedero_c($libre);
    $concepto_libre = trim(strval($input['concepto_libre'] ?? ''));
    if ($concepto_libre === '') $concepto_libre = 'Venta libre';
    $concepto_libre = mb_substr($concepto_libre, 0, 80);
}
if (!$pedidos && $libre_c <= 0) respond(['success' => false, 'error' => 'La venta está vacía: agrega al menos un producto o un monto.']);

$productos = [];
if ($pedidos) {
    $ph = implode(',', array_fill(0, count($pedidos), '?'));
    $st = $pdo->prepare("SELECT id, nombre, precio FROM tienda_productos WHERE escuela_id = ? AND activo = 1 AND id IN ($ph)");
    $st->execute(array_merge([$ctx['escuela_id']], array_keys($pedidos)));
    foreach ($st->fetchAll() as $p) $productos[intval($p['id'])] = $p;
    if (count($productos) !== count($pedidos)) {
        respond(['success' => false, 'error' => 'Algún producto ya no está disponible. Actualiza el catálogo e intenta de nuevo.']);
    }
}
$renglones = []; // para tienda_venta_items
$total_c = 0;
foreach ($pedidos as $pid => $cant) {
    $precio_c = monedero_c($productos[$pid]['precio']);
    $renglones[] = ['producto_id' => $pid, 'nombre' => $productos[$pid]['nombre'], 'cantidad' => $cant,
                    'precio_c' => $precio_c, 'subtotal_c' => $precio_c * $cant];
    $total_c += $precio_c * $cant;
}
if ($libre_c > 0) {
    $renglones[] = ['producto_id' => null, 'nombre' => $concepto_libre, 'cantidad' => 1,
                    'precio_c' => $libre_c, 'subtotal_c' => $libre_c];
    $total_c += $libre_c;
}
if ($total_c <= 0 || $total_c > MONEDERO_VENTA_MAX * 100) {
    respond(['success' => false, 'error' => 'El total de la venta debe ser mayor a $0 y no pasar de $' . number_format(MONEDERO_VENTA_MAX, 0) . '.']);
}

$alumno = monedero_alumno($pdo, $ctx, $usuario_actual, $cliente_id, true);
$nip = trim(strval($input['nip'] ?? ''));

try {
    $pdo->beginTransaction();
    monedero_asegurar($pdo, $ctx['escuela_id'], $cliente_id);
    $m = monedero_bloquear($pdo, $cliente_id);

    // ── Reintento: ¿ya existe una venta con esta llave? ──
    $st = $pdo->prepare("SELECT id, cliente_id, total, estado, creado_en FROM tienda_ventas WHERE idem_key = ? LIMIT 1");
    $st->execute([$venta_key]);
    if ($v = $st->fetch()) {
        $pdo->rollBack();
        if (intval($v['cliente_id']) === $cliente_id && monedero_c($v['total']) === $total_c) {
            if ($v['estado'] !== 'completada') {
                respond(['success' => false, 'error' => 'Esa venta ya fue cancelada. Inicia una venta nueva.']);
            }
            $est = monedero_estado($pdo, $cliente_id);
            respond(['success' => true, 'duplicado' => true,
                'venta' => ['id' => intval($v['id']), 'total' => monedero_p($total_c), 'creado_en' => $v['creado_en']],
                'saldo_despues' => $est['saldo']]);
        }
        respond(['success' => false, 'error' => 'Esa operación ya se usó con otra venta. Recarga la pantalla e intenta de nuevo.']);
    }

    // ── Monedero bloqueado por la familia ──
    if (intval($m['bloqueado'])) {
        throw new MonederoError('El monedero de ' . $alumno['nombre'] . ' está bloqueado por su familia. No se puede cobrar.');
    }

    // ── NIP ──
    if (!empty($m['nip_hash'])) {
        $st = $pdo->prepare("SELECT TIMESTAMPDIFF(SECOND, NOW(), nip_bloqueado_hasta) FROM monederos WHERE cliente_id = ? AND nip_bloqueado_hasta IS NOT NULL");
        $st->execute([$cliente_id]);
        $seg = $st->fetchColumn();
        if ($seg !== false && $seg !== null && intval($seg) > 0) {
            throw new MonederoError('El NIP está bloqueado por demasiados intentos fallidos. Intenta de nuevo en '
                . max(1, intval(ceil(intval($seg) / 60))) . ' minuto(s).');
        }
        if ($nip === '') {
            throw new MonederoError('Este monedero tiene NIP: pídele al alumno que lo escriba.');
        }
        if (!password_verify($nip, $m['nip_hash'])) {
            $intentos = intval($m['nip_intentos']) + 1;
            if ($intentos >= MONEDERO_NIP_INTENTOS_MAX) {
                $pdo->prepare("UPDATE monederos SET nip_intentos = 0, nip_bloqueado_hasta = DATE_ADD(NOW(), INTERVAL " . intval(MONEDERO_NIP_BLOQUEO_MIN) . " MINUTE) WHERE cliente_id = ?")
                    ->execute([$cliente_id]);
                $msg = 'NIP incorrecto ' . MONEDERO_NIP_INTENTOS_MAX . ' veces seguidas. El monedero no acepta NIP por ' . MONEDERO_NIP_BLOQUEO_MIN . ' minutos.';
            } else {
                $pdo->prepare("UPDATE monederos SET nip_intentos = ? WHERE cliente_id = ?")->execute([$intentos, $cliente_id]);
                $msg = 'NIP incorrecto. Quedan ' . (MONEDERO_NIP_INTENTOS_MAX - $intentos) . ' intento(s).';
            }
            // COMMIT del contador ANTES de contestar el error: un rollback aquí
            // dejaría el contador en cero y el NIP se podría adivinar sin freno.
            $pdo->commit();
            monedero_log("NIP incorrecto cliente_id={$cliente_id} intentos=" . ($intentos >= MONEDERO_NIP_INTENTOS_MAX ? 'BLOQUEADO' : $intentos) . " usuario_id={$ctx['user_id']}");
            respond(['success' => false, 'error' => $msg, 'nip_incorrecto' => true]);
        }
        if (intval($m['nip_intentos']) > 0) {
            $pdo->prepare("UPDATE monederos SET nip_intentos = 0 WHERE cliente_id = ?")->execute([$cliente_id]);
        }
    }

    // ── Límite diario ──
    if ($m['limite_diario'] !== null) {
        $limite_c = monedero_c($m['limite_diario']);
        $hoy_c = monedero_consumido_hoy_c($pdo, $cliente_id);
        if ($hoy_c + $total_c > $limite_c) {
            throw new MonederoError('Supera el límite diario de $' . number_format(monedero_p($limite_c), 2)
                . ' que puso la familia. Hoy ya consumió $' . number_format(monedero_p($hoy_c), 2)
                . ' y le quedan $' . number_format(monedero_p(max(0, $limite_c - $hoy_c)), 2) . '.');
        }
    }

    // ── Venta ──
    $pdo->prepare("INSERT INTO tienda_ventas (escuela_id, cliente_id, total, usuario_id, estado, idem_key) VALUES (?, ?, ?, ?, 'completada', ?)")
        ->execute([$ctx['escuela_id'], $cliente_id, monedero_p($total_c), $ctx['user_id'], $venta_key]);
    $venta_id = intval($pdo->lastInsertId());
    $ins = $pdo->prepare("INSERT INTO tienda_venta_items (venta_id, producto_id, nombre, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?)");
    $resumen = [];
    foreach ($renglones as $r) {
        $ins->execute([$venta_id, $r['producto_id'], $r['nombre'], $r['cantidad'], monedero_p($r['precio_c']), monedero_p($r['subtotal_c'])]);
        $resumen[] = ($r['cantidad'] > 1 ? $r['cantidad'] . ' x ' : '') . $r['nombre'];
    }

    // Saldo insuficiente = MonederoError: rollback de TODO (venta incluida).
    $mov = monedero_mover($pdo, $ctx['escuela_id'], $cliente_id, 'consumo', -1, $total_c, 'venta:' . $venta_id, [
        'venta_id'    => $venta_id,
        'usuario_id'  => $ctx['user_id'],
        'descripcion' => 'Tiendita: ' . implode(', ', $resumen),
    ]);
    $st = $pdo->prepare("SELECT creado_en FROM tienda_ventas WHERE id = ?");
    $st->execute([$venta_id]);
    $creado = $st->fetchColumn();
    $pdo->commit();

    respond(['success' => true, 'duplicado' => false,
        'venta' => ['id' => $venta_id, 'total' => monedero_p($total_c), 'creado_en' => $creado],
        'saldo_despues' => $mov['saldo_despues']]);
} catch (\Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    // UNIQUE de tienda_ventas.idem_key: la misma llave ya la usó OTRO alumno.
    if ($e instanceof \PDOException && $e->getCode() === '23000') {
        monedero_log('tienda_vender: llave repetida ' . $venta_key . ' ' . $e->getMessage());
        respond(['success' => false, 'error' => 'Esa operación ya se registró. Recarga la pantalla y revisa las ventas de hoy antes de repetir el cobro.']);
    }
    monedero_fallo($e, 'tienda_vender');
}
