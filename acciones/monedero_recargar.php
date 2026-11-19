<?php
// monedero_recargar — la familia pide una recarga EN LÍNEA (F6).
//
// Crea un COBRO pendiente marcado es_recarga_monedero = 1 por el monto pedido.
// La familia lo paga después con la liga de tarjeta (generar_liga) o con la
// referencia de efectivo en tienda (generar_referencia_efectivo), igual que
// cualquier cobro; los webhooks de siempre lo marcan 'pagado' sin saber nada
// del monedero y monedero_acreditar_recargas() lo convierte en saldo.
//
// NUNCA SPEI: la CLABE es del alumno y un depósito se repartiría entre sus
// adeudos (aplicar_abono_a_cliente excluye las recargas a propósito).
//
// Roles: familia (su hijo) y admin. Este endpoint NO mueve dinero: solo crea el
// cobro; el saldo sube únicamente cuando el cobro queda pagado.
$ctx = monedero_ctx($pdo, $usuario_actual, $input, ['familia', 'admin'], true);

$cliente_id = intval($input['cliente_id'] ?? 0);
$metodo = trim(strval($input['metodo'] ?? ''));
if (!in_array($metodo, ['TC', 'EfectivoRef'], true)) {
    respond(['success' => false, 'error' => 'Elige cómo vas a pagar la recarga: tarjeta o efectivo en tienda.']);
}
$monto = monedero_monto_valido($input['monto'] ?? null, MONEDERO_RECARGA_MIN_EN_LINEA, MONEDERO_RECARGA_MAX);
if ($monto === null) {
    respond(['success' => false, 'error' => 'El monto de la recarga debe estar entre $' . number_format(MONEDERO_RECARGA_MIN_EN_LINEA, 0)
        . ' y $' . number_format(MONEDERO_RECARGA_MAX, 0) . '.']);
}
$alumno = monedero_alumno($pdo, $ctx, $usuario_actual, $cliente_id, true);

// Si el superadmin apagó la tarjeta o el efectivo en tienda para este colegio,
// la recarga tampoco puede pagarse así: se corta antes de crear un cobro huérfano.
requerir_metodo_pago_habilitado($pdo, $ctx['escuela_id'], $metodo, $metodo === 'TC' ? 'Tarjeta' : 'Efectivo (tienda)');

// Candado a nivel BD por alumno: serializa el conteo de pendientes y la
// creación, para que un doble clic no deje pasar dos recargas iguales ni se
// salte el máximo de pendientes. Se libera al terminar la petición.
$pdo->prepare("SELECT GET_LOCK(?, 10)")->execute(["monedero_recargar_{$cliente_id}"]);

try {
    // Doble clic / reintento tras un timeout: si ya hay una recarga pendiente
    // IGUAL (mismo método y monto) creada HOY, se devuelve esa en vez de crear
    // otra (cobros solo guarda `fecha`, no la hora). Si la familia la paga y
    // quiere otra igual, la siguiente petición ya no la encuentra pendiente y
    // crea una nueva.
    $st = $pdo->prepare(
        "SELECT id, folio, total, metodo FROM cobros
          WHERE cliente_id = ? AND es_recarga_monedero = 1 AND estado = 'pendiente'
            AND metodo = ? AND ABS(total - ?) < 0.01 AND monto_pagado = 0
            AND fecha = CURDATE()
          ORDER BY id DESC LIMIT 1"
    );
    $st->execute([$cliente_id, $metodo, $monto]);
    $dup = $st->fetch();
    if ($dup) {
        respond(['success' => true, 'duplicado' => true, 'cobro' => [
            'id' => intval($dup['id']), 'folio' => $dup['folio'],
            'total' => round(floatval($dup['total']), 2), 'metodo' => $dup['metodo'],
        ]]);
    }

    $st = $pdo->prepare(
        "SELECT COUNT(*) FROM cobros WHERE cliente_id = ? AND es_recarga_monedero = 1 AND estado = 'pendiente'"
    );
    $st->execute([$cliente_id]);
    if (intval($st->fetchColumn()) >= MONEDERO_RECARGAS_PENDIENTES_MAX) {
        respond(['success' => false, 'error' => 'Ya tienes ' . MONEDERO_RECARGAS_PENDIENTES_MAX
            . ' recargas esperando pago para este alumno. Págalas o espera a que se cancelen solas (a los '
            . MONEDERO_RECARGA_VIGENCIA_DIAS . ' días) antes de pedir otra.']);
    }

    // Mismas columnas que acciones/crear_cobro.php: sin caja ni sucursal (no
    // es una venta de mostrador) y con la matrícula como referencia inicial.
    // generar_liga / generar_referencia_efectivo sobreescriben `referencia`.
    $cobro_id = 0; $folio = '';
    $pdo->beginTransaction();
    for ($intento = 0; $intento < 3; $intento++) {
        $folio = monedero_folio_nuevo($pdo, $ctx['escuela_id']);
        try {
            $pdo->prepare(
                "INSERT INTO cobros (escuela_id, cliente_id, folio, total, metodo, estado, fecha, referencia, es_recarga_monedero)
                 VALUES (?, ?, ?, ?, ?, 'pendiente', CURDATE(), ?, 1)"
            )->execute([$ctx['escuela_id'], $cliente_id, $folio, $monto, $metodo, $alumno['matricula'] ?? '']);
            $cobro_id = intval($pdo->lastInsertId());
            break;
        } catch (\PDOException $e) {
            // Folio repetido por dos altas simultáneas (el folio sale de un
            // COUNT): se vuelve a calcular. Cualquier otro error sube.
            if ($e->getCode() !== '23000' || $intento === 2) throw $e;
        }
    }
    try {
        $pdo->prepare(
            "INSERT INTO cobro_items (cobro_id, producto_id, nombre, cantidad, precio_unitario, subtotal)
             VALUES (?, NULL, 'Recarga de monedero', 1, ?, ?)"
        )->execute([$cobro_id, $monto, $monto]);
    } catch (\PDOException $e) {
        // cobro_items es opcional (igual que en crear_cobro): no tumba la recarga.
        log_api('monedero_recargar: cobro_items no disponible: ' . $e->getMessage());
    }
    $pdo->commit();

    registrar_log($pdo, $usuario_actual, 'monedero_recarga_creada',
        "Recarga en línea cobro #{$cobro_id} folio {$folio} para {$alumno['nombre']}, \${$monto}, método {$metodo}", $ctx['escuela_id']);
    respond(['success' => true, 'cobro' => [
        'id' => $cobro_id, 'folio' => $folio, 'total' => $monto, 'metodo' => $metodo,
    ]]);
} catch (\Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    monedero_fallo($e, 'monedero_recargar');
}
