<?php
/**
 * lib/helpers_alcance_producto.php — [F5] Colegiatura por grado/grupo (18-nov-2026).
 *
 * Un concepto recurrente (productos.tipo='recurrente') se le generaba a TODOS
 * los alumnos activos del colegio. Ahora cada concepto tiene un ALCANCE:
 *
 *   'todos'  → todos los alumnos activos (lo de siempre, y el DEFAULT)
 *   'grados' → alumnos cuyo clientes.grado_id esté en productos.alcance_ids
 *   'grupos' → alumnos inscritos (grupo_alumnos.activo = 1) en alguno de los
 *              grupos de productos.alcance_ids
 *
 * Las reglas viven aquí, en un solo lugar, porque las usan TRES lados que no
 * pueden discrepar:
 *   · acciones/crear_producto.php y editar_producto.php  → validar al guardar
 *   · acciones/producto_alcance_vista_previa.php          → "¿a cuántos les llega?"
 *   · cron_recordatorios.php (bloque 0)                    → a quién se le genera
 * Si la vista previa contara con una regla y el cron cobrara con otra, el
 * colegio vería "12 alumnos" y se le generaría el cargo a 40.
 *
 * Ninguna función de aquí llama a respond(): el cron no incluye api.php.
 * Devuelven el error y quien las llama decide qué hacer con él.
 */

/** Valores válidos de productos.alcance. */
const PRODUCTO_ALCANCES = ['todos', 'grados', 'grupos'];

/** Tope de ids por concepto: más que eso es casi seguro un error de captura. */
const PRODUCTO_ALCANCE_MAX_IDS = 300;

/**
 * Normaliza la lista de ids de alcance a enteros positivos, únicos y
 * ordenados. Acepta un arreglo (lo que manda el navegador) o el texto JSON
 * tal como se guarda en productos.alcance_ids. Cualquier otra cosa → [].
 */
function producto_alcance_ids($valor): array {
    if (is_string($valor)) {
        $valor = trim($valor);
        if ($valor === '') return [];
        $dec = json_decode($valor, true);
        $valor = is_array($dec) ? $dec : [];
    }
    if (!is_array($valor)) return [];
    $ids = [];
    foreach ($valor as $v) {
        if (!is_numeric($v)) continue;
        $n = intval($v);
        if ($n > 0) $ids[$n] = $n;
    }
    $ids = array_values($ids);
    sort($ids);
    return $ids;
}

/**
 * ¿Ya se corrió migracion_2026_11_18_f5_colegiatura_grado.sql?
 * Sin las columnas, crear/editar producto siguen funcionando como antes
 * (todo es 'todos'), y el cron trata a todos los conceptos como 'todos'.
 */
function producto_alcance_columna_existe(PDO $pdo): bool {
    static $existe = null;
    if ($existe === null) {
        try {
            $pdo->query("SELECT alcance, alcance_ids FROM productos LIMIT 0");
            $existe = true;
        } catch (\PDOException $e) {
            $existe = false;
        }
    }
    return $existe;
}

/**
 * Valida alcance + ids contra el catálogo de la escuela DEL PRODUCTO.
 *
 * $escuela_id debe venir ya resuelto por quien llama (de la fila del producto
 * o de la escuela del usuario), nunca del input sin validar: así es imposible
 * colgarle a un concepto los grupos de otro colegio.
 *
 * Devuelve:
 *   ['ok' => true,  'alcance' => 'todos'|'grados'|'grupos', 'ids' => int[],
 *    'alcance_ids' => ?string (JSON listo para guardar, NULL si 'todos')]
 *   ['ok' => false, 'error' => 'mensaje para el usuario']
 */
function producto_alcance_normalizar(PDO $pdo, int $escuela_id, $alcance, $ids_entrada): array {
    // null / '' = no se eligió nada → 'todos' (lo de siempre). Cualquier cosa
    // que no sea texto (un arreglo, un número) es inválida, no 'todos'.
    $alcance = $alcance === null ? '' : (is_string($alcance) ? strtolower(trim($alcance)) : '?');
    if ($alcance === '') $alcance = 'todos';
    if (!in_array($alcance, PRODUCTO_ALCANCES, true)) {
        return ['ok' => false, 'error' => 'Elige a quién se cobra el concepto: todos los alumnos, ciertos grados o ciertos grupos.'];
    }
    if ($alcance === 'todos') {
        // 'todos' ignora los ids a propósito: si el formulario mandó alguno
        // (quedó marcado antes de cambiar de opción) no debe guardarse, o al
        // volver a "Grados" reaparecería una selección que nadie eligió.
        return ['ok' => true, 'alcance' => 'todos', 'ids' => [], 'alcance_ids' => null];
    }

    $ids = producto_alcance_ids($ids_entrada);
    $etiqueta = $alcance === 'grados' ? 'grado' : 'grupo';
    if (!$ids) {
        return ['ok' => false, 'error' => "Elige al menos un {$etiqueta} al que se le cobrará este concepto."];
    }
    if (count($ids) > PRODUCTO_ALCANCE_MAX_IDS) {
        return ['ok' => false, 'error' => 'Elegiste demasiados ' . $etiqueta . 's. Si es para todo el colegio, usa "Todos los alumnos".'];
    }
    $in = implode(',', array_fill(0, count($ids), '?'));

    if ($alcance === 'grados') {
        // El catálogo de grados (niveles_grados) y clientes.grado_id los crea
        // F3. Si esa migración no se ha corrido, mensaje claro en vez de 500.
        try {
            $st = $pdo->prepare("SELECT id FROM niveles_grados WHERE escuela_id = ? AND id IN ($in)");
            $st->execute(array_merge([$escuela_id], $ids));
            $validos = $st->fetchAll(PDO::FETCH_COLUMN);
        } catch (\PDOException $e) {
            return ['ok' => false, 'error' => 'Primero configura el catálogo de grados en Control escolar.'];
        }
        // Tabla de grados sin la columna en alumnos = migración a medias: el
        // cron no podría filtrar y el concepto no le llegaría a nadie.
        try {
            $pdo->query("SELECT grado_id FROM clientes LIMIT 0");
        } catch (\PDOException $e) {
            return ['ok' => false, 'error' => 'Primero configura el catálogo de grados en Control escolar (falta asignar grado a los alumnos: la migración de grados no está completa).'];
        }
        if (count($validos) !== count($ids)) {
            return ['ok' => false, 'error' => 'Uno o más grados elegidos ya no existen en el catálogo de este colegio. Recarga la página y vuelve a elegirlos.'];
        }
    } else {
        try {
            $st = $pdo->prepare("SELECT id FROM grupos WHERE escuela_id = ? AND id IN ($in)");
            $st->execute(array_merge([$escuela_id], $ids));
            $validos = $st->fetchAll(PDO::FETCH_COLUMN);
        } catch (\PDOException $e) {
            return ['ok' => false, 'error' => 'El control escolar aún no está instalado en la base de datos, así que todavía no se puede cobrar por grupo.'];
        }
        if (count($validos) !== count($ids)) {
            return ['ok' => false, 'error' => 'Uno o más grupos elegidos no pertenecen a este colegio. Recarga la página y vuelve a elegirlos.'];
        }
    }

    return ['ok' => true, 'alcance' => $alcance, 'ids' => $ids, 'alcance_ids' => json_encode($ids)];
}

/**
 * Fragmento SQL que filtra la tabla `clientes` según el alcance de un
 * producto. Se pega al final de un WHERE que ya filtra escuela/tipo/activo:
 *
 *   $f = producto_alcance_filtro_sql($prod, 'clientes');
 *   "SELECT ... FROM clientes WHERE escuela_id = ? AND activo = 1" . $f['sql']
 *   execute(array_merge([$escuela_id], $f['params']))
 *
 * Si el producto no trae 'alcance' (la migración de F5 no se ha corrido y
 * SELECT * no devuelve la columna) se comporta como 'todos': exactamente lo
 * de antes. En cambio, un alcance por grado/grupo SIN ids, o un valor que no
 * se reconoce, NO cobra a nadie ('1 = 0'): ante la duda es preferible no
 * generar un cargo a generárselo a todo el colegio con el precio de un grado.
 *
 * Devuelve ['sql' => string, 'params' => array, 'alcance' => string, 'ids' => int[]].
 */
function producto_alcance_filtro_sql(array $producto, string $alias = 'clientes'): array {
    if (!preg_match('/^[a-z_][a-z0-9_]*$/i', $alias)) $alias = 'clientes';
    $alcance = strtolower(trim((string) ($producto['alcance'] ?? 'todos')));
    if ($alcance === '' || $alcance === 'todos') {
        return ['sql' => '', 'params' => [], 'alcance' => 'todos', 'ids' => []];
    }
    $ids = producto_alcance_ids($producto['alcance_ids'] ?? null);
    if (!$ids || !in_array($alcance, PRODUCTO_ALCANCES, true)) {
        return ['sql' => ' AND 1 = 0', 'params' => [], 'alcance' => $alcance, 'ids' => $ids];
    }
    $in = implode(',', array_fill(0, count($ids), '?'));
    if ($alcance === 'grados') {
        $sql = " AND {$alias}.grado_id IN ($in)";
    } else {
        // Mismo colegio que el alumno (defensa extra: los ids ya se validaron
        // al guardar) e inscripción ACTIVA: la baja de un alumno del grupo
        // (escolar_baja_alumno_grupo) o su cambio a otro grupo del mismo
        // ciclo (escolar_inscribir_alumnos) lo sacan de este cobro.
        $sql = " AND EXISTS (SELECT 1 FROM grupo_alumnos ga_f5"
             . " WHERE ga_f5.cliente_id = {$alias}.id AND ga_f5.escuela_id = {$alias}.escuela_id"
             . " AND ga_f5.activo = 1 AND ga_f5.grupo_id IN ($in))";
    }
    return ['sql' => $sql, 'params' => $ids, 'alcance' => $alcance, 'ids' => $ids];
}
