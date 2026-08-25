<?php
        $escuela_id  = intval($input['escuela_id']  ?? 0);
        $cliente_id  = intval($input['cliente_id']  ?? 0) ?: null;
        $metodo      = trim($input['metodo']         ?? '');
        $referencia  = trim($input['referencia']     ?? '');
        $carrito     = $input['carrito']             ?? [];
        $sucursal_id = intval($input['sucursal_id']  ?? 0) ?: null;
        $caja_id_pos = intval($input['caja_id']      ?? 0) ?: null;
        if (!$escuela_id || !$metodo || empty($carrito)) {
            respond(['success' => false, 'error' => 'Faltan datos del cobro']);
        }
        // Validar contra el enum real de la columna `cobros.metodo` — sin esto,
        // un typo o un cliente mal formado inserta basura silenciosa (así se
        // coló el cobro con metodo='' que encontramos en el dump).
        $metodos_validos = ['Efectivo', 'EfectivoRef', 'TC', 'SPEI', 'CoDi', 'Cheque'];
        if (!in_array($metodo, $metodos_validos, true)) {
            respond(['success' => false, 'error' => 'Método de pago inválido']);
        }
        // Validar que cliente_id sea un alumno real de esta escuela — sin esto
        // se coló un bug donde el Portal de Familia mandaba el id de `familias`
        // como si fuera un id de `clientes` (tablas con AUTO_INCREMENT
        // independientes): el saldo del alumno correcto nunca se actualizaba,
        // o peor, se recalculaba el de un alumno ajeno que compartiera ese
        // mismo número de id por coincidencia.
        if ($cliente_id) {
            $chkCliCobro = $pdo->prepare("SELECT id, familia_id FROM clientes WHERE id = ? AND escuela_id = ?");
            $chkCliCobro->execute([$cliente_id, $escuela_id]);
            $cliCobro = $chkCliCobro->fetch();
            if (!$cliCobro) respond(['success' => false, 'error' => 'cliente_id no corresponde a un alumno de esta escuela']);
            // Un usuario rol 'familia' solo puede generar cobros de SUS PROPIOS hijos.
            if (($usuario_actual['rol'] ?? '') === 'familia') {
                requerir_familia_propia($cliCobro['familia_id'], $usuario_actual, 'No puedes generar cobros para este alumno.');
            }
        }
        // El corte de caja compara las ventas del día contra el efectivo/
        // tarjeta contados; si un cobro del POS no trae caja_id, esas ventas
        // quedan invisibles para el corte (antes SIEMPRE pasaba esto: el
        // frontend nunca mandaba caja_id, así que el corte jamás reflejaba
        // ventas reales). Para cajero/admin (los roles que operan el POS) se
        // exige que exista una caja realmente abierta y sea SUYA — así el
        // corte de caja deja de ser opcional: sin caja abierta, no se puede
        // cobrar. Familia (portal) y superadmin no pasan por el POS físico.
        $rol_actual_cobro = $usuario_actual['rol'] ?? '';
        if (in_array($rol_actual_cobro, ['cajero', 'admin'], true)) {
            if (!$caja_id_pos) {
                respond(['success' => false, 'error' => 'No tienes una caja abierta. Abre tu turno en "Corte de caja" antes de cobrar.']);
            }
            $chkCaja = $pdo->prepare("SELECT id FROM caja WHERE id = ? AND usuario_id = ? AND estado = 'abierta'");
            $chkCaja->execute([$caja_id_pos, intval($usuario_actual['user_id'])]);
            if (!$chkCaja->fetch()) {
                respond(['success' => false, 'error' => 'Tu caja no está abierta (o ya se cerró). Abre un nuevo turno en "Corte de caja" antes de cobrar.']);
            }
        }
        // Calcular total desde el carrito
        $total = 0;
        foreach ($carrito as $item) {
            $total += floatval($item['precio'] ?? 0) * intval($item['qty'] ?? 1);
        }
        // Reusar un cobro pendiente existente en vez de crear uno nuevo, para
        // métodos que dependen de una referencia externa (SPEI/TC/EfectivoRef):
        // sin esto, cada clic en "Pagar" (ej. un padre reintentando desde el
        // portal, o F5) creaba un cobro 'pendiente' NUEVO con un id distinto,
        // dejando varios cobros pendientes acumulados para el mismo alumno.
        // consulta_clabe.php/pago_clabe.php resuelven "el cobro pendiente más
        // antiguo" de un alumno cuando la 'transaccion' no calza exacto — con
        // varios pendientes de montos distintos, el banco terminaba
        // comparando el pago contra un cobro viejo y equivocado, y siempre
        // fallaba con "Monto inválido" aunque el monto pagado fuera correcto.
        if ($cliente_id && in_array($metodo, ['SPEI', 'TC', 'EfectivoRef'], true)) {
            // Candado a nivel BD (no solo el SELECT de arriba) para cerrar la
            // ventana de carrera: si un 503/timeout hace que el navegador
            // reintente "Pagar" mientras la primera petición aún no terminaba
            // de insertar, sin esto podían colarse dos cobros idénticos antes
            // de que el chequeo de duplicado alcanzara a ver el primero. Se
            // libera solo al terminar la petición (la conexión se cierra).
            $lockKeyCobro = "crear_cobro_{$cliente_id}_{$metodo}_" . number_format($total, 2, '.', '');
            $pdo->prepare("SELECT GET_LOCK(?, 10)")->execute([$lockKeyCobro]);
            $stmtDup = $pdo->prepare(
                "SELECT * FROM cobros WHERE cliente_id = ? AND metodo = ? AND estado = 'pendiente'
                 AND ABS(total - ?) < 0.01 ORDER BY id DESC LIMIT 1"
            );
            $stmtDup->execute([$cliente_id, $metodo, $total]);
            $dup = $stmtDup->fetch();
            if ($dup) {
                $dup['total'] = floatval($dup['total']);
                $dup['items'] = $carrito;
                $stmtNombreDup = $pdo->prepare("SELECT nombre FROM clientes WHERE id = ?");
                $stmtNombreDup->execute([$cliente_id]);
                $dup['cliente'] = $stmtNombreDup->fetchColumn() ?: 'Cliente general';
                $rsDup = $pdo->prepare("SELECT saldo_pendiente FROM clientes WHERE id = ?");
                $rsDup->execute([$cliente_id]);
                respond([
                    'success'     => true,
                    'cobro'       => $dup,
                    'cliente_id'  => $cliente_id,
                    'nuevo_saldo' => floatval($rsDup->fetchColumn()),
                ]);
            }
        }
        // Generar folio: CLA-ESC{esc_id}-{timestamp}
        $stmt = $pdo->prepare("SELECT clave FROM escuelas WHERE id = ?");
        $stmt->execute([$escuela_id]);
        $esc = $stmt->fetch();
        $clave = $esc ? $esc['clave'] : 'ESC';
        $stmt = $pdo->prepare("SELECT COUNT(*) as n FROM cobros WHERE escuela_id = ?");
        $stmt->execute([$escuela_id]);
        $row = $stmt->fetch();
        $n = intval($row['n'] ?? 0) + 1;
        $folio = $clave . '-' . str_pad($n, 4, '0', STR_PAD_LEFT);
        $stmt = $pdo->prepare(
            "INSERT INTO cobros (escuela_id, cliente_id, folio, total, metodo, estado, fecha, referencia, sucursal_id, caja_id)
             VALUES (?, ?, ?, ?, ?, 'pendiente', CURDATE(), ?, ?, ?)"
        );
        $stmt->execute([$escuela_id, $cliente_id, $folio, $total, $metodo, $referencia, $sucursal_id, $caja_id_pos]);
        $cobro_id = $pdo->lastInsertId();
        // Guardar el detalle línea por línea (qué se compró) — snapshot del
        // nombre/precio al momento de la venta, no una referencia viva al
        // catálogo, para que el historial no cambie si editas productos después.
        // Envuelto en try/catch: si `cobro_items` aún no existe (falta migrar),
        // el cobro en sí NO debe fallar — es lo crítico.
        try {
            $stmtItem = $pdo->prepare(
                "INSERT INTO cobro_items (cobro_id, producto_id, nombre, cantidad, precio_unitario, subtotal)
                 VALUES (?, ?, ?, ?, ?, ?)"
            );
            foreach ($carrito as $item) {
                $precio = floatval($item['precio'] ?? 0);
                $qty    = intval($item['qty'] ?? 1);
                $stmtItem->execute([
                    $cobro_id,
                    intval($item['id'] ?? 0) ?: null,
                    trim($item['nombre'] ?? 'Concepto'),
                    $qty,
                    $precio,
                    $precio * $qty,
                ]);
            }
        } catch (\PDOException $e) {
            file_put_contents(__DIR__ . '/api_log.txt', date('Y-m-d H:i:s') . " | cobro_items no disponible (¿falta migrar tabla?): " . $e->getMessage() . "\n", FILE_APPEND);
        }
        // Obtener nombre del cliente y recalcular su saldo_pendiente
        $cliente_nombre = 'Cliente general';
        if ($cliente_id) {
            $s2 = $pdo->prepare("SELECT nombre FROM clientes WHERE id = ?");
            $s2->execute([$cliente_id]);
            $cl = $s2->fetch();
            if ($cl) $cliente_nombre = $cl['nombre'];
            recalcular_saldo_pendiente($pdo, $cliente_id);
        }
        $nuevo_saldo_crear = 0;
        if ($cliente_id) {
            $rs = $pdo->prepare("SELECT saldo_pendiente FROM clientes WHERE id = ?");
            $rs->execute([$cliente_id]);
            $nuevo_saldo_crear = floatval($rs->fetchColumn());
        }
        registrar_log($pdo, $usuario_actual, 'cobro_creado', "Cobro #{$cobro_id} folio {$folio} para {$cliente_nombre}, total \${$total}, metodo {$metodo}", $escuela_id);
        respond([
            'success' => true,
            'cobro' => [
                'id'         => intval($cobro_id),
                'folio'      => $folio,
                'escuela_id' => $escuela_id,
                'cliente_id' => $cliente_id,
                'cliente'    => $cliente_nombre,
                'total'      => $total,
                'metodo'     => $metodo,
                'estado'     => 'pendiente',
                'referencia' => $referencia,
                'fecha'      => date('Y-m-d'),
                'items'      => $carrito,
            ],
            'cliente_id'  => $cliente_id,
            'nuevo_saldo' => $nuevo_saldo_crear,
        ]);
