<?php
        // [F5] Alcance del concepto (todos / grados / grupos): reglas en un solo lugar.
        require_once __DIR__ . '/../lib/helpers_alcance_producto.php';
        // [OF-2] IVA por concepto, clave SAT y unidad.
        require_once __DIR__ . '/../lib/helpers_impuestos.php';
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin', 'admin'], 'No tienes permiso para editar conceptos de pago.');
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        // [F5] también 'tipo': el alcance solo se guarda en recurrentes, y si
        // el formulario no manda 'tipo' hay que saber el que ya tiene.
        // [OF-6] SELECT * (en vez de columnas sueltas) para ver también categoria, precio y
        // maneja_existencias, que solo existen después de la migración de inventario.
        $stmtEscuela = $pdo->prepare("SELECT * FROM productos WHERE id = ?");
        $stmtEscuela->execute([$id]);
        $filaEscuela = $stmtEscuela->fetch();
        if (!$filaEscuela) respond(['success' => false, 'error' => 'Producto no encontrado']);
        $escuela_id = intval($filaEscuela['escuela_id']);
        requerir_escuela_propia($rol_actual, $escuela_id, $usuario_actual, 'No tienes permiso para editar este concepto de pago.');
        requerir_seccion_habilitada($pdo, $rol_actual, $escuela_id, ['productos']);
        // [OF-6] "Maneja existencias". null = el formulario no lo mandó (un Productos.js viejo
        // en caché): no se toca. Si el concepto QUEDA con control (lo pida ahora o ya lo
        // tuviera), su categoría/tipo/precio finales deben seguir siendo de un producto
        // físico: no se puede volver colegiatura un concepto con existencias sin apagarlo antes.
        $invPedido = array_key_exists('maneja_existencias', $input)
            ? (!empty($input['maneja_existencias']) && strval($input['maneja_existencias']) !== '0') : null;
        $invActual = !empty($filaEscuela['maneja_existencias']);
        $invFinal = $invPedido ?? $invActual;
        if ($invFinal) {
            if ($invPedido === true && !inventario_listo($pdo)) {
                respond(['success' => false, 'error' => 'Para manejar existencias falta aplicar la migración de inventario (migracion_2026_11_20_of6_inventario.sql). Guarda el concepto sin esa casilla.']);
            }
            $catInv = array_key_exists('categoria', $input) ? trim(strval($input['categoria'])) : ($filaEscuela['categoria'] ?? '');
            $tipoInv = array_key_exists('tipo', $input) ? (trim(strval($input['tipo'])) === 'recurrente' ? 'recurrente' : 'unico') : ($filaEscuela['tipo'] ?? 'unico');
            $precioInv = array_key_exists('precio', $input) ? $input['precio'] : ($filaEscuela['precio'] ?? 0);
            $razonInv = inventario_concepto_elegible($catInv, $tipoInv, $precioInv);
            if ($razonInv !== null) {
                respond(['success' => false, 'error' => $razonInv . ($invActual && $invPedido === null ? ' Este concepto maneja existencias: desmarca "Maneja existencias" antes de cambiarlo.' : '')]);
            }
        }
        $campos = ['nombre', 'categoria', 'precio', 'emoji', 'activo'];
        $sets = []; $vals = [];
        foreach ($campos as $c) {
            if (array_key_exists($c, $input)) {
                $sets[] = "`$c` = ?";
                $vals[] = $c === 'activo' ? ((bool)$input[$c] ? 1 : 0) : $input[$c];
            }
        }
        // El formulario de Productos.js siempre manda 'tipo' junto con el resto
        // de campos de recurrencia — si viene, se revalida y actualiza el set completo.
        if (array_key_exists('tipo', $input)) {
            $rec = validar_datos_recurrente($input);
            foreach ($rec as $campoRec => $valorRec) {
                $sets[] = "`$campoRec` = ?";
                $vals[] = $valorRec;
            }
        }
        // [F5] Alcance (a quién se le genera el cobro recurrente). Los ids se
        // validan contra la escuela DE LA FILA ($escuela_id), nunca contra la
        // del input. Solo se toca si el formulario lo manda: una pestaña con
        // el Productos.js viejo en caché (sin el selector) no debe regresar a
        // 'todos' una colegiatura que ya estaba limitada a un grado.
        // Excepción: un concepto que queda como 'unico' siempre va a 'todos',
        // porque el alcance solo lo usa el cron de recurrentes.
        $tipoFinal = array_key_exists('tipo', $input) ? $rec['tipo'] : ($filaEscuela['tipo'] ?? 'unico');
        if (array_key_exists('alcance', $input) || $tipoFinal !== 'recurrente') {
            $alc = ['ok' => true, 'alcance' => 'todos', 'alcance_ids' => null, 'ids' => []];
            if ($tipoFinal === 'recurrente') {
                $alc = producto_alcance_normalizar($pdo, $escuela_id, $input['alcance'], $input['alcance_ids'] ?? []);
                if (!$alc['ok']) respond(['success' => false, 'error' => $alc['error']]);
            }
            if (producto_alcance_columna_existe($pdo)) {
                $sets[] = "`alcance` = ?";
                $vals[] = $alc['alcance'];
                $sets[] = "`alcance_ids` = ?";
                $vals[] = $alc['alcance_ids'];
            } elseif ($alc['alcance'] !== 'todos') {
                respond(['success' => false, 'error' => 'Para cobrar por grado o por grupo falta correr la migración migracion_2026_11_18_f5_colegiatura_grado.sql. Mientras tanto, guárdalo como "Todos los alumnos".']);
            }
        }
        // [OF-2] IVA / clave SAT / unidad. Solo se tocan los campos que vienen en
        // el input (un Productos.js viejo en caché no los manda y no debe
        // regresar a '16' un concepto que ya se marcó como exento). Cambiarlos
        // NO altera cobros ya creados: sus renglones guardan su propio snapshot.
        $imp = impuestos_validar_input($input);
        if (!$imp['ok']) respond(['success' => false, 'error' => $imp['error']]);
        $avisoImp = null;
        if ($imp['campos']) {
            if (impuestos_productos_listos($pdo)) {
                foreach ($imp['campos'] as $campoImp => $valorImp) {
                    $sets[] = "`$campoImp` = ?";
                    $vals[] = $valorImp;
                }
            } elseif (($imp['campos']['iva_tasa'] ?? '16') !== '16'
                || ($imp['campos']['clave_sat'] ?? IMPUESTO_CLAVE_SAT_DEFAULT) !== IMPUESTO_CLAVE_SAT_DEFAULT
                || ($imp['campos']['clave_unidad'] ?? IMPUESTO_UNIDAD_DEFAULT) !== IMPUESTO_UNIDAD_DEFAULT) {
                // No se bloquea el guardado del resto del concepto: se avisa.
                $avisoImp = 'El concepto se guardó, pero el IVA, la clave SAT y la unidad NO: falta correr la migración migracion_2026_11_19_of2_impuestos.sql.';
            }
        }
        if (empty($sets)) respond(['success' => false, 'error' => $avisoImp ?: 'Sin campos a actualizar']);
        $vals[] = $id;
        $stmt = $pdo->prepare("UPDATE productos SET " . implode(', ', $sets) . " WHERE id = ?");
        $stmt->execute($vals);
        // [OF-6] Cambió la casilla: activa o apaga el control (y deja listo su renglón).
        // Apagarlo conserva existencia e historial; solo deja de moverse con las ventas.
        if ($invPedido !== null && $invPedido !== $invActual) {
            try {
                inventario_fijar_control($pdo, $escuela_id, 'concepto', $id, $invPedido);
            } catch (\Throwable $eInv) {
                log_api("editar_producto: no se pudo cambiar el inventario del concepto #{$id}: " . $eInv->getMessage());
                $avisoImp = trim(($avisoImp ? $avisoImp . ' ' : '') . 'El concepto se guardó, pero no se pudo cambiar el control de existencias: hazlo desde Inventario.');
            }
        }
        $stmt2 = $pdo->prepare("SELECT * FROM productos WHERE id = ?");
        $stmt2->execute([$id]);
        $productoActualizado = $stmt2->fetch(PDO::FETCH_ASSOC);
        if (!$productoActualizado) respond(['success' => false, 'error' => 'Producto no encontrado']);
        // [OF-7c] Auditoría: precio, IVA, alcance, etc. Antes = la fila leída al inicio; después = la ya actualizada.
        $campos_aud_prod = array_flip(['nombre', 'categoria', 'precio', 'activo', 'tipo', 'periodicidad_meses', 'fecha_inicio',
            'dia_ventana_inicio', 'dia_ventana_fin', 'penalizacion_tipo', 'penalizacion_valor', 'alcance', 'alcance_ids',
            'iva_tasa', 'clave_sat', 'clave_unidad', 'maneja_existencias']);
        auditar($pdo, $usuario_actual, 'producto.editar', 'producto', $id,
            array_intersect_key($filaEscuela, $campos_aud_prod), array_intersect_key($productoActualizado, $campos_aud_prod), $escuela_id);
        $productoActualizado['activo'] = (bool)$productoActualizado['activo'];
        $productoActualizado['precio'] = floatval($productoActualizado['precio']);
        // [OF-6] maneja_existencias como entero y la existencia actual (null si no maneja).
        if (array_key_exists('maneja_existencias', $productoActualizado)) {
            $productoActualizado['maneja_existencias'] = intval($productoActualizado['maneja_existencias']);
            $productoActualizado['existencia'] = null;
            if ($productoActualizado['maneja_existencias'] && inventario_listo($pdo)) {
                $stEx = $pdo->prepare("SELECT existencia FROM inventario_existencias WHERE tipo = 'concepto' AND item_id = ?");
                $stEx->execute([$id]);
                $exv = $stEx->fetchColumn();
                $productoActualizado['existencia'] = $exv === false ? 0 : intval($exv);
            }
        }
        // [F5] alcance_ids como arreglo de enteros (en la base es texto JSON).
        if (array_key_exists('alcance_ids', $productoActualizado)) {
            $productoActualizado['alcance_ids'] = producto_alcance_ids($productoActualizado['alcance_ids']);
        }
        respond(['success' => true, 'producto' => $productoActualizado, 'aviso' => $avisoImp]);
