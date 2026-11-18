<?php
        // [F5] Alcance del concepto (todos / grados / grupos): reglas en un solo lugar.
        require_once __DIR__ . '/../lib/helpers_alcance_producto.php';
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin', 'admin'], 'No tienes permiso para editar conceptos de pago.');
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        // [F5] también 'tipo': el alcance solo se guarda en recurrentes, y si
        // el formulario no manda 'tipo' hay que saber el que ya tiene.
        $stmtEscuela = $pdo->prepare("SELECT escuela_id, tipo FROM productos WHERE id = ?");
        $stmtEscuela->execute([$id]);
        $filaEscuela = $stmtEscuela->fetch();
        if (!$filaEscuela) respond(['success' => false, 'error' => 'Producto no encontrado']);
        $escuela_id = intval($filaEscuela['escuela_id']);
        requerir_escuela_propia($rol_actual, $escuela_id, $usuario_actual, 'No tienes permiso para editar este concepto de pago.');
        requerir_seccion_habilitada($pdo, $rol_actual, $escuela_id, ['productos']);
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
        if (empty($sets)) respond(['success' => false, 'error' => 'Sin campos a actualizar']);
        $vals[] = $id;
        $stmt = $pdo->prepare("UPDATE productos SET " . implode(', ', $sets) . " WHERE id = ?");
        $stmt->execute($vals);
        $stmt2 = $pdo->prepare("SELECT * FROM productos WHERE id = ?");
        $stmt2->execute([$id]);
        $productoActualizado = $stmt2->fetch(PDO::FETCH_ASSOC);
        if (!$productoActualizado) respond(['success' => false, 'error' => 'Producto no encontrado']);
        $productoActualizado['activo'] = (bool)$productoActualizado['activo'];
        $productoActualizado['precio'] = floatval($productoActualizado['precio']);
        // [F5] alcance_ids como arreglo de enteros (en la base es texto JSON).
        if (array_key_exists('alcance_ids', $productoActualizado)) {
            $productoActualizado['alcance_ids'] = producto_alcance_ids($productoActualizado['alcance_ids']);
        }
        respond(['success' => true, 'producto' => $productoActualizado]);
