<?php
        // [F5] Alcance del concepto (todos / grados / grupos): reglas en un solo lugar.
        require_once __DIR__ . '/../lib/helpers_alcance_producto.php';
        // [OF-2] IVA por concepto, clave SAT y unidad.
        require_once __DIR__ . '/../lib/helpers_impuestos.php';
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin', 'admin'], 'No tienes permiso para crear conceptos de pago.');
        $escuela_id = intval($input['escuela_id'] ?? 0);
        $nombre     = trim($input['nombre']       ?? '');
        $categoria  = trim($input['categoria']    ?? '') ?: 'otro';
        $precio     = floatval($input['precio']   ?? 0);
        $emoji      = trim($input['emoji']        ?? '');
        $activo     = array_key_exists('activo', $input) ? (bool)$input['activo'] : true;
        if (!$escuela_id || !$nombre) respond(['success' => false, 'error' => 'escuela_id y nombre son requeridos']);
        // [F5] escuela_id viene del navegador: un admin solo puede crear
        // conceptos en SU colegio. Antes no se comparaba, y con el alcance por
        // grado/grupo además se validarían los ids contra un colegio ajeno.
        // Para el admin no cambia nada: Productos.js siempre manda el suyo.
        requerir_escuela_propia($rol_actual, $escuela_id, $usuario_actual, 'No tienes permiso para crear conceptos de pago en este colegio.');
        requerir_seccion_habilitada($pdo, $rol_actual, $escuela_id, ['productos']);
        $rec = validar_datos_recurrente($input);
        // [F5] A quién se le genera el cobro. Solo aplica a recurrentes (los
        // únicos se agregan a mano en Caja), así que un concepto único siempre
        // queda en 'todos'. Se valida ANTES del INSERT: si el concepto se
        // guardara y el alcance fallara después, quedaría en 'todos' y el cron
        // le generaría la colegiatura de un grado a todo el colegio.
        $alc = ['ok' => true, 'alcance' => 'todos', 'alcance_ids' => null, 'ids' => []];
        if ($rec['tipo'] === 'recurrente') {
            $alc = producto_alcance_normalizar($pdo, $escuela_id, $input['alcance'] ?? 'todos', $input['alcance_ids'] ?? []);
            if (!$alc['ok']) respond(['success' => false, 'error' => $alc['error']]);
        }
        $colsAlcance = '';
        $valsAlcance = [];
        if (producto_alcance_columna_existe($pdo)) {
            $colsAlcance = ', alcance, alcance_ids';
            $valsAlcance = [$alc['alcance'], $alc['alcance_ids']];
        } elseif ($alc['alcance'] !== 'todos') {
            respond(['success' => false, 'error' => 'Para cobrar por grado o por grupo falta correr la migración migracion_2026_11_18_f5_colegiatura_grado.sql. Mientras tanto, guárdalo como "Todos los alumnos".']);
        }
        // [OF-2] IVA / clave SAT / unidad. Lo que no llegue en el input toma el
        // valor de siempre (16% / 86101800 / E48): un Productos.js viejo en
        // caché sigue creando conceptos igual que antes. Si la migración aún no
        // corrió y piden algo distinto al default, se avisa en vez de ignorarlo.
        $imp = impuestos_validar_input($input);
        if (!$imp['ok']) respond(['success' => false, 'error' => $imp['error']]);
        $impCampos = array_merge([
            'iva_tasa' => '16', 'clave_sat' => IMPUESTO_CLAVE_SAT_DEFAULT, 'clave_unidad' => IMPUESTO_UNIDAD_DEFAULT,
        ], $imp['campos']);
        $impGuardado = impuestos_productos_listos($pdo);
        if ($impGuardado) {
            $colsAlcance .= ', iva_tasa, clave_sat, clave_unidad';
            $valsAlcance = array_merge($valsAlcance, [$impCampos['iva_tasa'], $impCampos['clave_sat'], $impCampos['clave_unidad']]);
        } elseif ($impCampos['iva_tasa'] !== '16' || $impCampos['clave_sat'] !== IMPUESTO_CLAVE_SAT_DEFAULT || $impCampos['clave_unidad'] !== IMPUESTO_UNIDAD_DEFAULT) {
            respond(['success' => false, 'error' => 'Para configurar IVA, clave SAT y unidad falta correr la migración migracion_2026_11_19_of2_impuestos.sql.']);
        }
        $stmt = $pdo->prepare(
            "INSERT INTO productos (escuela_id, nombre, categoria, precio, emoji, activo, tipo, periodicidad_meses, fecha_inicio, dia_ventana_inicio, dia_ventana_fin, penalizacion_tipo, penalizacion_valor$colsAlcance)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?" . str_repeat(', ?', count($valsAlcance)) . ")"
        );
        $stmt->execute(array_merge([
            $escuela_id, $nombre, $categoria, $precio, $emoji, $activo ? 1 : 0,
            $rec['tipo'], $rec['periodicidad_meses'], $rec['fecha_inicio'],
            $rec['dia_ventana_inicio'], $rec['dia_ventana_fin'], $rec['penalizacion_tipo'], $rec['penalizacion_valor'],
        ], $valsAlcance));
        $id = intval($pdo->lastInsertId());
        respond(['success' => true, 'producto' => array_merge([
            'id' => $id, 'escuela_id' => $escuela_id, 'nombre' => $nombre,
            'categoria' => $categoria, 'precio' => $precio, 'emoji' => $emoji, 'activo' => $activo,
        ], $rec, [
            // [F5] Ya como arreglo de enteros (cargar_datos lo manda como texto JSON;
            // Productos.js entiende las dos formas).
            'alcance' => $alc['alcance'], 'alcance_ids' => $alc['ids'],
        ], $impGuardado ? $impCampos : [])]);
