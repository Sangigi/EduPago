<?php
/**
 * lib/helpers_becas.php — [OF-3] Becas y descuentos guardados en el alumno.
 *
 * Hasta OF-3 una beca era un concepto con precio negativo que el cajero
 * agregaba a mano en Caja cada vez. Ahora vive en el alumno (tabla
 * alumno_becas, migracion_2026_11_19_of3_cobranza.sql) y se aplica sola en
 * los cobros recurrentes que genera el cron, y se propone sola en Caja.
 *
 * Este archivo tiene dos partes:
 *
 *   1. FUNCIONES PURAS (sin base de datos, sin respond()): se pueden probar
 *      con un script de PHP suelto. Todo el cálculo es en CENTAVOS ENTEROS.
 *        becas_centavos, becas_fecha_valida, becas_alcance_ids, becas_aplica,
 *        becas_calcular_descuento, becas_etiqueta, becas_validar_input.
 *
 *   2. ACCESO A DATOS (toleran que la migración no haya corrido):
 *        becas_tabla_lista, becas_mapa_escuela, becas_insertar_item.
 *
 * REGLA DE CÁLCULO (una sola fuente; el espejo en el navegador es
 * becasCalcular() en views/components/BecasAlumno.js):
 *
 *   1. Se toman las becas ACTIVAS, VIGENTES en la fecha y cuyo ALCANCE incluye
 *      el concepto (por categoría de productos.categoria o por id de producto).
 *   2. Los PORCENTAJES se suman, con tope de 100%, y se aplican sobre el
 *      precio: 30% + 20% = 50% del precio ORIGINAL (no 20% del ya rebajado).
 *   3. Después se restan los MONTOS FIJOS, uno por uno, hasta agotar el precio.
 *   4. El descuento total nunca supera el precio (nunca queda un cobro negativo).
 *   5. Se devuelve el descuento total y el detalle por beca: la suma del
 *      detalle es EXACTAMENTE el total (es lo que se vuelve renglón negativo).
 *
 * Ejemplo: precio $2,450.00, beca 30% y beca $200.00 → 30% = $735.00,
 * luego $200.00 → descuento $935.00, queda $1,515.00.
 */

require_once __DIR__ . '/helpers_impuestos.php'; // impuestos_snapshot_producto / impuestos_items_listos

/** Tipos y alcances válidos de alumno_becas. */
const BECA_TIPOS    = ['porcentaje', 'monto'];
const BECA_ALCANCES = ['categorias', 'productos'];

/** Tope de elementos en alcance_ids: más que eso es casi seguro un error de captura. */
const BECA_MAX_ALCANCE = 100;

// ════════════════════════════════════════════════════════════════════════
//  1. FUNCIONES PURAS
// ════════════════════════════════════════════════════════════════════════

/** Centavos enteros desde un monto en pesos (evita errores de float). */
function becas_centavos($pesos): int
{
    return intval(round(floatval($pesos) * 100));
}

/** ¿$s es una fecha 'YYYY-MM-DD' real? */
function becas_fecha_valida($s): bool
{
    if (!is_string($s) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) return false;
    [$y, $m, $d] = array_map('intval', explode('-', $s));
    return checkdate($m, $d, $y);
}

/**
 * Lista de alcance de una beca, normalizada. Acepta un arreglo o el texto JSON
 * tal como se guarda en alumno_becas.alcance_ids.
 *   'categorias' → textos en minúsculas, sin espacios, únicos.
 *   'productos'  → enteros positivos, únicos.
 */
function becas_alcance_ids($valor, string $alcance): array
{
    if (is_string($valor)) {
        $valor = trim($valor);
        if ($valor === '') return [];
        $dec = json_decode($valor, true);
        $valor = is_array($dec) ? $dec : [];
    }
    if (!is_array($valor)) return [];
    $out = [];
    foreach ($valor as $v) {
        if ($alcance === 'productos') {
            if (!is_numeric($v)) continue;
            $n = intval($v);
            if ($n > 0) $out[$n] = $n;
        } else {
            if (!is_string($v) && !is_numeric($v)) continue;
            $t = strtolower(trim((string) $v));
            if ($t !== '') $out[$t] = $t;
        }
    }
    return array_values($out);
}

/**
 * ¿Esta beca (fila de alumno_becas) aplica a este concepto en esta fecha?
 *   $concepto: ['id' => productos.id, 'categoria' => productos.categoria].
 *   $fecha: 'YYYY-MM-DD' (la del cobro).
 */
function becas_aplica(array $beca, array $concepto, string $fecha): bool
{
    if (empty($beca['activo']) || intval($beca['activo']) !== 1) return false;
    $desde = $beca['vigente_desde'] ?? null;
    $hasta = $beca['vigente_hasta'] ?? null;
    if ($desde && $fecha < $desde) return false;
    if ($hasta && $fecha > $hasta) return false;

    $alcance = strtolower(trim((string) ($beca['alcance'] ?? '')));
    $ids = becas_alcance_ids($beca['alcance_ids'] ?? null, $alcance);
    if (!$ids) return false; // sin alcance definido: no aplica a nada (ante la duda, no se descuenta)
    if ($alcance === 'productos') {
        return intval($concepto['id'] ?? 0) > 0 && in_array(intval($concepto['id']), $ids, true);
    }
    if ($alcance === 'categorias') {
        $cat = strtolower(trim((string) ($concepto['categoria'] ?? '')));
        return $cat !== '' && in_array($cat, $ids, true);
    }
    return false;
}

/** Texto corto del valor de una beca: "30%", "12.5%" o "$500.00". */
function becas_valor_texto(array $beca): string
{
    $v = floatval($beca['valor'] ?? 0);
    if (($beca['tipo'] ?? '') === 'porcentaje') {
        return rtrim(rtrim(number_format($v, 2, '.', ''), '0'), '.') . '%';
    }
    return '$' . number_format($v, 2, '.', ',');
}

/** Nombre del renglón negativo: "Beca: Hermanos (30%)". Máx. 100 caracteres. */
function becas_etiqueta(array $beca): string
{
    $nombre = trim((string) ($beca['nombre'] ?? ''));
    $txt = 'Beca: ' . ($nombre !== '' ? $nombre : 'Descuento') . ' (' . becas_valor_texto($beca) . ')';
    return mb_strlen($txt) > 100 ? mb_substr($txt, 0, 99) . '…' : $txt;
}

/**
 * Cálculo del descuento. Ver la regla en la cabecera del archivo.
 *
 * $becas: filas de alumno_becas del alumno (cualquier estado: aquí se filtran
 *         las que aplican). $precio_c: precio del concepto en centavos.
 *
 * Devuelve:
 *   ['precio_c'      => int,
 *    'descuento_c'   => int  (0 ≤ descuento ≤ precio),
 *    'final_c'       => int  (precio - descuento),
 *    'porcentaje_bp' => int  (% sumado con tope, en puntos base: 3000 = 30%),
 *    'detalle'       => [['beca_id','nombre','tipo','valor','monto_c','etiqueta'], ...]]
 *  Solo entran al detalle las becas que de verdad descontaron algo (monto_c > 0);
 *  la suma de monto_c del detalle es exactamente descuento_c.
 */
function becas_calcular_descuento(array $becas, array $concepto, int $precio_c, string $fecha): array
{
    $res = ['precio_c' => $precio_c, 'descuento_c' => 0, 'final_c' => $precio_c, 'porcentaje_bp' => 0, 'detalle' => []];
    if ($precio_c <= 0) return $res;

    $aplican = [];
    foreach ($becas as $b) {
        if (becas_aplica($b, $concepto, $fecha)) $aplican[] = $b;
    }
    if (!$aplican) return $res;
    // Orden estable: por id (las más antiguas primero). El orden solo cambia a
    // quién se le atribuye el descuento en el detalle, nunca el total.
    usort($aplican, function ($a, $b) { return intval($a['id'] ?? 0) <=> intval($b['id'] ?? 0); });

    $detalle = [];
    // ── 1) Porcentajes, sumados con tope de 100% ──
    // Cada beca recibe la DIFERENCIA entre el descuento acumulado antes y
    // después de sumarla (descuento acumulado = round(precio × % acumulado)):
    // así el total es exacto y el tope de 100% queda repartido sin residuos.
    $acum_bp = 0;
    $acum_c  = 0;
    foreach ($aplican as $b) {
        if (($b['tipo'] ?? '') !== 'porcentaje') continue;
        $bp = intval(round(floatval($b['valor'] ?? 0) * 100));
        if ($bp <= 0) continue;
        $nuevo_bp = min(10000, $acum_bp + $bp);
        $nuevo_c  = intdiv($precio_c * $nuevo_bp + 5000, 10000); // redondeo al centavo más cercano
        $monto_c  = $nuevo_c - $acum_c;
        $acum_bp  = $nuevo_bp;
        $acum_c   = $nuevo_c;
        if ($monto_c > 0) $detalle[] = becas_linea_detalle($b, $monto_c);
    }
    $res['porcentaje_bp'] = $acum_bp;

    // ── 2) Montos fijos, después de los porcentajes ──
    $restante_c = $precio_c - $acum_c;
    foreach ($aplican as $b) {
        if (($b['tipo'] ?? '') !== 'monto') continue;
        $valor_c = becas_centavos($b['valor'] ?? 0);
        if ($valor_c <= 0 || $restante_c <= 0) continue;
        $monto_c = min($valor_c, $restante_c);
        $restante_c -= $monto_c;
        $detalle[] = becas_linea_detalle($b, $monto_c);
    }

    $descuento_c = array_sum(array_column($detalle, 'monto_c'));
    $res['descuento_c'] = $descuento_c;
    $res['final_c']     = $precio_c - $descuento_c;
    $res['detalle']     = $detalle;
    return $res;
}

/** Renglón del detalle de becas_calcular_descuento(). */
function becas_linea_detalle(array $beca, int $monto_c): array
{
    return [
        'beca_id'  => intval($beca['id'] ?? 0),
        'nombre'   => (string) ($beca['nombre'] ?? ''),
        'tipo'     => (string) ($beca['tipo'] ?? ''),
        'valor'    => floatval($beca['valor'] ?? 0),
        'monto_c'  => $monto_c,
        'etiqueta' => becas_etiqueta($beca),
    ];
}

/**
 * Valida y normaliza lo que manda el formulario de una beca.
 * Devuelve ['ok' => true, 'datos' => [...columnas listas para guardar]] o
 * ['ok' => false, 'error' => 'mensaje para el usuario'].
 * NO valida que los productos del alcance sean de la escuela: eso necesita la
 * base y lo hace quien llama (acciones/alumno_beca_guardar.php).
 */
function becas_validar_input(array $in): array
{
    $nombre = trim((string) ($in['nombre'] ?? ''));
    if ($nombre === '') return ['ok' => false, 'error' => 'Ponle un nombre a la beca (p. ej. "Beca SEP", "Hermanos").'];
    if (mb_strlen($nombre) > 80) return ['ok' => false, 'error' => 'El nombre de la beca no puede pasar de 80 caracteres.'];

    $tipo = strtolower(trim((string) ($in['tipo'] ?? '')));
    if (!in_array($tipo, BECA_TIPOS, true)) return ['ok' => false, 'error' => 'Elige si la beca es un porcentaje o un monto fijo.'];

    $valor_raw = $in['valor'] ?? null;
    if (!is_numeric($valor_raw)) return ['ok' => false, 'error' => 'El valor de la beca debe ser un número.'];
    $valor_c = becas_centavos($valor_raw);
    if ($valor_c <= 0) return ['ok' => false, 'error' => 'El valor de la beca debe ser mayor a cero.'];
    if ($tipo === 'porcentaje' && $valor_c > 10000) return ['ok' => false, 'error' => 'Un porcentaje no puede pasar de 100%.'];
    if ($tipo === 'monto' && $valor_c > 99999999) return ['ok' => false, 'error' => 'El monto de la beca es demasiado grande.'];

    $alcance = strtolower(trim((string) ($in['alcance'] ?? '')));
    if (!in_array($alcance, BECA_ALCANCES, true)) return ['ok' => false, 'error' => 'Elige a qué conceptos aplica: por categoría o conceptos concretos.'];
    $ids = becas_alcance_ids($in['alcance_ids'] ?? [], $alcance);
    if (!$ids) return ['ok' => false, 'error' => $alcance === 'categorias'
        ? 'Elige al menos una categoría a la que aplica la beca.'
        : 'Elige al menos un concepto al que aplica la beca.'];
    if (count($ids) > BECA_MAX_ALCANCE) return ['ok' => false, 'error' => 'Elegiste demasiados conceptos. Usa categorías.'];
    if ($alcance === 'categorias') {
        foreach ($ids as $c) {
            if (mb_strlen($c) > 40 || !preg_match('/^[a-z0-9_\-áéíóúñü ]+$/u', $c)) {
                return ['ok' => false, 'error' => 'Una de las categorías elegidas no es válida.'];
            }
        }
    }

    $desde = isset($in['vigente_desde']) && $in['vigente_desde'] !== '' ? $in['vigente_desde'] : null;
    $hasta = isset($in['vigente_hasta']) && $in['vigente_hasta'] !== '' ? $in['vigente_hasta'] : null;
    if ($desde !== null && !becas_fecha_valida($desde)) return ['ok' => false, 'error' => 'La fecha "vigente desde" no es válida.'];
    if ($hasta !== null && !becas_fecha_valida($hasta)) return ['ok' => false, 'error' => 'La fecha "vigente hasta" no es válida.'];
    if ($desde !== null && $hasta !== null && $hasta < $desde) return ['ok' => false, 'error' => 'La beca no puede terminar antes de empezar.'];

    $notas = trim((string) ($in['notas'] ?? ''));
    if (mb_strlen($notas) > 255) return ['ok' => false, 'error' => 'Las notas no pueden pasar de 255 caracteres.'];

    return ['ok' => true, 'datos' => [
        'nombre'        => $nombre,
        'tipo'          => $tipo,
        'valor'         => $valor_c / 100,
        'alcance'       => $alcance,
        'alcance_ids'   => $ids,
        'vigente_desde' => $desde,
        'vigente_hasta' => $hasta,
        'notas'         => $notas !== '' ? $notas : null,
    ]];
}

// ════════════════════════════════════════════════════════════════════════
//  2. ACCESO A DATOS
// ════════════════════════════════════════════════════════════════════════

/**
 * ¿Existe la tabla alumno_becas? (migracion_2026_11_19_of3_cobranza.sql)
 * Se consulta una vez por proceso. Si la consulta truena, se asume que NO
 * existe: el código cae al comportamiento de antes de OF-3 (sin becas).
 */
function becas_tabla_lista(PDO $pdo): bool
{
    static $ok = null;
    if ($ok !== null) return $ok;
    try {
        $ok = (bool) $pdo->query("SHOW TABLES LIKE 'alumno_becas'")->fetch();
    } catch (\Throwable $e) {
        $ok = false;
    }
    return $ok;
}

/**
 * Becas ACTIVAS de toda una escuela, agrupadas por alumno: [cliente_id => [fila, ...]].
 * El cron la usa una vez por concepto en vez de una consulta por alumno. La
 * vigencia NO se filtra aquí (la decide becas_aplica con la fecha del cobro).
 * Sin tabla o con error → [] (sin becas).
 */
function becas_mapa_escuela(PDO $pdo, int $escuela_id): array
{
    if (!becas_tabla_lista($pdo)) return [];
    try {
        $st = $pdo->prepare("SELECT * FROM alumno_becas WHERE escuela_id = ? AND activo = 1 ORDER BY cliente_id, id");
        $st->execute([$escuela_id]);
        $mapa = [];
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $b) {
            $mapa[intval($b['cliente_id'])][] = $b;
        }
        return $mapa;
    } catch (\Throwable $e) {
        return [];
    }
}

/**
 * INSERT del renglón NEGATIVO de una beca en cobro_items (producto_id NULL).
 * Copia el snapshot de IVA / clave SAT / unidad del CONCEPTO al que descuenta:
 * cfdi_armar_renglones() (OF-2) exige snapshot en TODOS los renglones, también
 * en los negativos, y convierte el negativo en `discount` repartido sobre los
 * positivos. Sin snapshot (migración OF-2 sin correr o concepto sin datos) el
 * renglón se guarda igual, sin él: se factura como antes de OF-2.
 * Puede lanzar PDOException (quien llama ya lo envuelve: cobro_items es opcional).
 */
function becas_insertar_item(PDO $pdo, $escuela_id, $cobro_id, $producto_id_concepto, string $etiqueta, int $monto_c): void
{
    $monto = -($monto_c / 100);
    $snap = impuestos_items_listos($pdo) ? impuestos_snapshot_producto($pdo, $producto_id_concepto, $escuela_id) : null;
    if ($snap) {
        $pdo->prepare(
            "INSERT INTO cobro_items (cobro_id, producto_id, nombre, cantidad, precio_unitario, subtotal, iva_tasa, clave_sat, clave_unidad)
             VALUES (?, NULL, ?, 1, ?, ?, ?, ?, ?)"
        )->execute([$cobro_id, $etiqueta, $monto, $monto, $snap['iva_tasa'], $snap['clave_sat'], $snap['clave_unidad']]);
        return;
    }
    $pdo->prepare(
        "INSERT INTO cobro_items (cobro_id, producto_id, nombre, cantidad, precio_unitario, subtotal)
         VALUES (?, NULL, ?, 1, ?, ?)"
    )->execute([$cobro_id, $etiqueta, $monto, $monto]);
}

/** Fila de alumno_becas lista para el navegador (tipos reales, alcance_ids como arreglo). */
function becas_fila_publica(array $f): array
{
    $alcance = (string) ($f['alcance'] ?? '');
    return [
        'id'            => intval($f['id']),
        'cliente_id'    => intval($f['cliente_id']),
        'nombre'        => (string) $f['nombre'],
        'tipo'          => (string) $f['tipo'],
        'valor'         => floatval($f['valor']),
        'alcance'       => $alcance,
        'alcance_ids'   => becas_alcance_ids($f['alcance_ids'] ?? null, $alcance),
        'vigente_desde' => $f['vigente_desde'] ?: null,
        'vigente_hasta' => $f['vigente_hasta'] ?: null,
        'activo'        => intval($f['activo']) === 1,
        'notas'         => $f['notas'] ?: null,
        'creado_en'     => $f['creado_en'] ?? null,
    ];
}

/**
 * Descuento MENSUAL estimado de un conjunto de becas activas del colegio, para
 * la vista "Becas del colegio". Es una estimación: para cada concepto
 * recurrente activo se calcula el descuento que se aplicaría HOY a cada alumno
 * activo al que el concepto le llega (mismo filtro de alcance que usa el cron,
 * lib/helpers_alcance_producto.php) y se divide entre la periodicidad
 * (un concepto semestral con $600 de descuento pesa $100 al mes).
 *
 * $becas_por_alumno: [cliente_id => [filas de alumno_becas]] (becas activas).
 * Devuelve ['total' => pesos, 'por_beca' => [beca_id => pesos]].
 * Nunca lanza: ante un error de consulta de un concepto, lo omite.
 */
function becas_estimado_mensual(PDO $pdo, int $escuela_id, array $becas_por_alumno, string $hoy): array
{
    require_once __DIR__ . '/helpers_alcance_producto.php';
    $out = ['total' => 0.0, 'por_beca' => []];
    if (!$becas_por_alumno) return $out;
    $ids_alumnos = array_map('intval', array_keys($becas_por_alumno));
    try {
        $st = $pdo->prepare("SELECT * FROM productos WHERE escuela_id = ? AND tipo = 'recurrente' AND activo = 1");
        $st->execute([$escuela_id]);
        $productos = $st->fetchAll(PDO::FETCH_ASSOC);
    } catch (\Throwable $e) {
        return $out;
    }
    $total_c = 0.0;
    $por_beca_c = [];
    $in = implode(',', array_fill(0, count($ids_alumnos), '?'));
    foreach ($productos as $p) {
        $meses = intval($p['periodicidad_meses'] ?? 0);
        if ($meses <= 0 || empty($p['fecha_inicio'])) continue;
        $precio_c = becas_centavos($p['precio'] ?? 0);
        if ($precio_c <= 0) continue;
        $f = producto_alcance_filtro_sql($p, 'clientes');
        try {
            $s2 = $pdo->prepare("SELECT id FROM clientes WHERE escuela_id = ? AND tipo = 'alumno' AND activo = 1 AND id IN ($in)" . $f['sql']);
            $s2->execute(array_merge([$escuela_id], $ids_alumnos, $f['params']));
            $alcanzados = $s2->fetchAll(PDO::FETCH_COLUMN);
        } catch (\Throwable $e) {
            continue;
        }
        $concepto = ['id' => intval($p['id']), 'categoria' => $p['categoria'] ?? ''];
        foreach ($alcanzados as $cid) {
            $r = becas_calcular_descuento($becas_por_alumno[intval($cid)] ?? [], $concepto, $precio_c, $hoy);
            foreach ($r['detalle'] as $d) {
                $mensual = $d['monto_c'] / $meses;
                $total_c += $mensual;
                $por_beca_c[$d['beca_id']] = ($por_beca_c[$d['beca_id']] ?? 0) + $mensual;
            }
        }
    }
    $out['total'] = round($total_c) / 100;
    foreach ($por_beca_c as $id => $c) $out['por_beca'][$id] = round($c) / 100;
    return $out;
}
