<?php
/**
 * lib/helpers_inventario.php — Inventario con existencias (OF-6, 20-nov-2026)
 *
 * Cuenta PIEZAS de lo que el colegio vende físicamente (uniformes, libros,
 * material, productos de la tiendita). NO mueve dinero: no toca cobros,
 * abonos, saldos ni el monedero. Lo incluyen api.php y las pruebas.
 *
 * ── QUÉ SE CONTROLA ──────────────────────────────────────────────────────
 *   · tipo 'concepto' → un concepto de pago (productos) con
 *     productos.maneja_existencias = 1. Solo categorías físicas
 *     (INVENTARIO_CATEGORIAS_FISICAS): una colegiatura nunca tiene existencias.
 *   · tipo 'tienda'   → un producto de la tiendita (tienda_productos) con
 *     tienda_productos.maneja_existencias = 1.
 *   Sin variantes: cada talla es su propio producto ("Playera deportiva T8").
 *
 * ── MODELO ───────────────────────────────────────────────────────────────
 * Mismo patrón que el monedero (lib/helpers_monedero.php): un LIBRO
 * (inventario_movimientos, inmutable) que es la fuente de verdad y una
 * existencia CACHEADA (inventario_existencias.existencia) que se recalcula
 * desde el libro en cada movimiento — nunca se suma sobre el valor anterior.
 *
 * INVARIANTES (no las rompas al tocar esto):
 *   1. inventario_existencias.existencia == SUM(cantidad) del producto en el libro.
 *   2. Toda escritura va en una transacción con el renglón de existencias
 *      bloqueado (SELECT ... FOR UPDATE): dos ventas simultáneas de la última
 *      pieza se serializan en vez de leer la misma existencia.
 *   3. Cada movimiento lleva idem_key ÚNICA y determinística: un reintento
 *      (doble clic, cobro cancelado dos veces) choca contra el UNIQUE y no
 *      mueve piezas dos veces.
 *   4. La existencia PUEDE quedar negativa. Es a propósito: el producto puede
 *      estar físicamente aunque el conteo esté mal, y bloquear la venta en
 *      caja por un número equivocado es peor que mostrarlo en rojo. El aviso
 *      "se acabó" cuenta lo que sea ≤ 0.
 *
 * ── DE DÓNDE SALEN LOS MOVIMIENTOS ───────────────────────────────────────
 *   entrada     inventario_entrada      (compra de mercancía; opcional gasto)
 *   venta       crear_cobro.php         idem 'venta_cobro:<cobro>:<producto>'
 *               tienda_vender.php       idem 'venta_tienda:<venta>:<producto>'
 *   devolucion  cancelar_cobro.php      idem 'devol_cobro:<cobro>:<producto>'
 *               tienda_cancelar_venta   idem 'devol_tienda:<venta>:<producto>'
 *   ajuste      inventario_ajuste       (merma, robo, regalo; con motivo)
 *   conteo      inventario_conteo       (la diferencia contra lo contado)
 * Las importaciones (OF-5) y el cron de recurrentes NO mueven inventario.
 *
 * Los enganches de venta/devolución van en try/catch (inventario_registrar_ventas
 * e inventario_devolver_documento no lanzan): si el inventario falla, el cobro o
 * la venta NO se caen. Queda en el log y en el detector de incoherencias
 * (lib/helpers_diagnostico.php).
 *
 * Sin la migración (migracion_2026_11_20_of6_inventario.sql) todo esto es
 * no-op: inventario_listo() devuelve false y el sistema funciona como antes.
 */

const INVENTARIO_TIPOS = ['concepto', 'tienda'];
const INVENTARIO_MOVIMIENTOS = ['entrada', 'venta', 'devolucion', 'ajuste', 'conteo'];
// Una sola entrada/ajuste/venta no pasa de esto (acota teclazos de más).
const INVENTARIO_CANTIDAD_MAX = 100000;
// Lo contado en un conteo físico.
const INVENTARIO_CONTADO_MAX = 1000000;
// Categorías de concepto que PUEDEN manejar existencias (lo que se vende físicamente).
// Las demás (colegiatura, anualidad, inscripción, examen, beca, transporte,
// extracurricular) son servicios o descuentos: nunca.
const INVENTARIO_CATEGORIAS_FISICAS = ['uniforme', 'material', 'comedor', 'otro'];
// Las que la pantalla de Conceptos sugiere marcar por defecto.
const INVENTARIO_CATEGORIAS_SUGERIDAS = ['uniforme', 'material'];
// Formas de pago válidas de un gasto (las mismas que acciones/crear_gasto.php).
const INVENTARIO_FORMAS_PAGO_GASTO = ['Efectivo', 'Transferencia', 'Cheque', 'TarjetaEmpresarial', 'Otro'];

if (!class_exists('InventarioError')) {
    /** Error de negocio del inventario (cantidad inválida, producto sin control...). */
    class InventarioError extends \RuntimeException {}
}

// ═══════════════════════════ FUNCIONES PURAS ═════════════════════════════
// (probadas en herramientas/pruebas.php; no tocan la base)

/** Cantidad entera positiva de una entrada/ajuste/venta; null si no es válida. */
function inventario_cantidad_valida($v, int $max = INVENTARIO_CANTIDAD_MAX): ?int
{
    if (is_string($v)) $v = trim($v);
    $n = filter_var($v, FILTER_VALIDATE_INT);
    if ($n === false || $n < 1 || $n > $max) return null;
    return $n;
}

/** Lo contado en un conteo físico: entero ≥ 0; null si no es válido (o vacío). */
function inventario_contado_valido($v): ?int
{
    if ($v === null) return null;
    if (is_string($v)) $v = trim($v);
    if ($v === '') return null;
    $n = filter_var($v, FILTER_VALIDATE_INT);
    if ($n === false || $n < 0 || $n > INVENTARIO_CONTADO_MAX) return null;
    return $n;
}

/** Ajuste manual: entero distinto de cero (puede ser negativo); null si no es válido. */
function inventario_ajuste_valido($v): ?int
{
    if (is_string($v)) $v = trim($v);
    $n = filter_var($v, FILTER_VALIDATE_INT);
    if ($n === false || $n === 0 || abs($n) > INVENTARIO_CANTIDAD_MAX) return null;
    return $n;
}

/**
 * Costo unitario opcional. Devuelve [ok, centavos|null]: vacío/null = sin costo
 * (ok), un número entre 0 y 999,999.99 = centavos, cualquier otra cosa = no ok.
 */
function inventario_costo_valido($v): array
{
    if ($v === null) return [true, null];
    if (is_string($v)) {
        $v = trim(str_replace(',', '', $v));
        if ($v === '') return [true, null];
    }
    if (!is_numeric($v)) return [false, null];
    $f = floatval($v);
    if ($f < 0 || $f > 999999.99) return [false, null];
    return [true, intval(round($f * 100))];
}

/** Cambio de existencia (con signo) que produce un movimiento. */
function inventario_delta(string $movimiento, int $cantidad): int
{
    switch ($movimiento) {
        case 'entrada':
        case 'devolucion':
            return abs($cantidad);
        case 'venta':
            return -abs($cantidad);
        case 'ajuste':
        case 'conteo':
            return $cantidad; // ya viene con signo
    }
    throw new InventarioError('Tipo de movimiento inválido.');
}

/**
 * Estado de un producto según su existencia y su mínimo:
 *   'agotado' (≤ 0; incluye negativos) · 'bajo' (mínimo > 0 y existencia ≤ mínimo) · 'ok'.
 * Es la MISMA regla que la consulta agregada de inventario_alertas_contar().
 */
function inventario_estado(int $existencia, int $minimo): string
{
    if ($existencia <= 0) return 'agotado';
    if ($minimo > 0 && $existencia <= $minimo) return 'bajo';
    return 'ok';
}

/** Cantidades pedidas de un carrito de Caja ([{id, qty}]) como [producto_id => piezas]. */
function inventario_agrupar_carrito($carrito): array
{
    $out = [];
    if (!is_array($carrito)) return $out;
    foreach ($carrito as $it) {
        if (!is_array($it)) continue;
        $id = intval($it['id'] ?? 0);
        $q = intval($it['qty'] ?? 1);
        if ($id <= 0 || $q <= 0) continue;
        $out[$id] = ($out[$id] ?? 0) + $q;
    }
    return $out;
}

/** Null si un concepto PUEDE manejar existencias; si no, la razón en una frase. */
function inventario_concepto_elegible($categoria, $tipo, $precio): ?string
{
    if (($tipo ?? 'unico') === 'recurrente') {
        return 'Un concepto recurrente (colegiatura, cuota automática) no maneja existencias.';
    }
    if (!in_array(strval($categoria), INVENTARIO_CATEGORIAS_FISICAS, true)) {
        return 'Solo los conceptos físicos (uniforme, material, comedor u otro) pueden manejar existencias. Una colegiatura o un servicio no.';
    }
    if (floatval($precio) < 0) return 'Un descuento no maneja existencias.';
    return null;
}

/** Llave de idempotencia de una venta o devolución ligada a un documento. */
function inventario_idem_documento(string $movimiento, string $tipo, int $documento_id, int $item_id): string
{
    $pref = [
        'concepto' => ['venta' => 'venta_cobro', 'devolucion' => 'devol_cobro'],
        'tienda'   => ['venta' => 'venta_tienda', 'devolucion' => 'devol_tienda'],
    ];
    if (!isset($pref[$tipo][$movimiento])) throw new InventarioError('Movimiento sin documento.');
    return $pref[$tipo][$movimiento] . ':' . $documento_id . ':' . $item_id;
}

/**
 * Llave de idempotencia de un renglón de una operación en lote (entrada, conteo):
 * la llave del navegador se mezcla con el colegio y el renglón. Se resume con
 * sha1 porque idem_key admite 80 caracteres y la llave del navegador llega a 64.
 */
function inventario_idem_lote(string $operacion, int $escuela_id, string $llave, int $indice): string
{
    return substr($operacion, 0, 8) . ':' . substr(sha1($escuela_id . '|' . $llave), 0, 24) . ':' . $indice;
}

/**
 * Plan de un conteo físico. $actuales y $contados: ['tipo:item_id' => entero]
 * (los $contados que no se capturaron no vienen o son null). Devuelve solo los
 * renglones donde lo contado difiere de lo que hay, con la diferencia con signo
 * (contado - actual), en el orden de $contados.
 *
 * @return array<int, array{clave:string, actual:int, contado:int, diferencia:int}>
 */
function inventario_conteo_plan(array $actuales, array $contados): array
{
    $plan = [];
    foreach ($contados as $clave => $contado) {
        if ($contado === null || !array_key_exists($clave, $actuales)) continue;
        $dif = intval($contado) - intval($actuales[$clave]);
        if ($dif === 0) continue;
        $plan[] = ['clave' => $clave, 'actual' => intval($actuales[$clave]), 'contado' => intval($contado), 'diferencia' => $dif];
    }
    return $plan;
}

/** Total de una entrada (centavos) a partir de renglones [cantidad, costo_c|null]; null si algún renglón no tiene costo. */
function inventario_total_entrada_c(array $lineas): ?int
{
    $total = 0;
    foreach ($lineas as $l) {
        if (!isset($l['costo_c']) || $l['costo_c'] === null) return null;
        $total += intval($l['cantidad']) * intval($l['costo_c']);
    }
    return $total;
}

// ═══════════════════════════ ACCESO A LA BASE ═════════════════════════════

/** Nombre de la tabla del catálogo según el tipo. */
function inventario_tabla_item(string $tipo): string
{
    if ($tipo === 'concepto') return 'productos';
    if ($tipo === 'tienda') return 'tienda_productos';
    throw new InventarioError('Tipo de producto inválido.');
}

function inventario_log(string $msg): void
{
    if (function_exists('log_api')) {
        log_api('INVENTARIO ' . $msg);
        return;
    }
    @file_put_contents(defined('API_LOG_FILE') ? API_LOG_FILE : (__DIR__ . '/../api_log.txt'),
        date('Y-m-d H:i:s') . ' | INVENTARIO ' . $msg . PHP_EOL, FILE_APPEND);
}

/**
 * ¿Ya corrió la migración de OF-6 (las dos tablas y productos.maneja_existencias)?
 * Cacheado por proceso. Sin ella el inventario es no-op.
 */
function inventario_listo(PDO $pdo): bool
{
    static $ok = null;
    if ($ok !== null) return $ok;
    try {
        $pdo->query("SELECT 1 FROM inventario_existencias LIMIT 1");
        $pdo->query("SELECT 1 FROM inventario_movimientos LIMIT 1");
        $pdo->query("SELECT maneja_existencias FROM productos LIMIT 0");
        $ok = true;
    } catch (\Throwable $e) {
        $ok = false;
    }
    return $ok;
}

/** ¿Existe tienda_productos.maneja_existencias? (la tiendita es de F6; puede no estar). */
function inventario_tienda_listo(PDO $pdo): bool
{
    static $ok = null;
    if ($ok !== null) return $ok;
    try {
        $pdo->query("SELECT maneja_existencias FROM tienda_productos LIMIT 0");
        $ok = true;
    } catch (\Throwable $e) {
        $ok = false;
    }
    return $ok;
}

/** El producto (de cualquiera de los dos catálogos) o null. NO valida la escuela: compárala. */
function inventario_item(PDO $pdo, string $tipo, int $item_id): ?array
{
    if ($tipo === 'concepto') {
        $st = $pdo->prepare("SELECT id, escuela_id, nombre, categoria, tipo AS tipo_concepto, precio, activo, maneja_existencias FROM productos WHERE id = ?");
    } elseif ($tipo === 'tienda') {
        if (!inventario_tienda_listo($pdo)) return null;
        $st = $pdo->prepare("SELECT id, escuela_id, nombre, NULL AS categoria, 'unico' AS tipo_concepto, precio, activo, maneja_existencias FROM tienda_productos WHERE id = ?");
    } else {
        return null;
    }
    $st->execute([$item_id]);
    $f = $st->fetch();
    return $f ?: null;
}

/** Crea el renglón de existencias (0) si no existe. Idempotente. */
function inventario_asegurar(PDO $pdo, int $escuela_id, string $tipo, int $item_id): void
{
    $pdo->prepare(
        "INSERT INTO inventario_existencias (escuela_id, tipo, item_id, existencia, minimo)
         VALUES (?, ?, ?, 0, 0)
         ON DUPLICATE KEY UPDATE item_id = item_id"
    )->execute([$escuela_id, $tipo, $item_id]);
}

/** Bloquea el renglón de existencias hasta el commit/rollback (transacción abierta + inventario_asegurar). */
function inventario_bloquear(PDO $pdo, string $tipo, int $item_id): array
{
    $st = $pdo->prepare("SELECT * FROM inventario_existencias WHERE tipo = ? AND item_id = ? FOR UPDATE");
    $st->execute([$tipo, $item_id]);
    $f = $st->fetch();
    if (!$f) throw new InventarioError('No se encontró el renglón de existencias del producto.');
    return $f;
}

/**
 * Existencia según el LIBRO (fuente de verdad). LOCK IN SHARE MODE por la misma
 * razón que en el monedero: dentro de una transacción REPEATABLE READ una lectura
 * normal vería la foto de la primera lectura, no lo último confirmado.
 */
function inventario_existencia_libro(PDO $pdo, string $tipo, int $item_id): int
{
    $st = $pdo->prepare("SELECT COALESCE(SUM(cantidad), 0) FROM inventario_movimientos WHERE tipo = ? AND item_id = ? LOCK IN SHARE MODE");
    $st->execute([$tipo, $item_id]);
    return intval($st->fetchColumn());
}

/**
 * Escribe UN movimiento y deja inventario_existencias.existencia igual al libro.
 *
 * Requisitos del llamador: transacción abierta y renglón bloqueado con
 * inventario_bloquear(). NO lanza por existencia insuficiente (puede quedar
 * negativa, ver la cabecera).
 *
 * $cantidad: entrada/venta/devolucion → entero POSITIVO (el signo lo pone
 * inventario_delta); ajuste/conteo → entero con signo distinto de cero.
 * Idempotente por $idem_key: si ya existe, NO escribe y devuelve duplicado.
 *
 * @param array $extra costo_c (centavos), proveedor_id, cobro_id, venta_id, gasto_id, motivo, usuario_id
 * @return array{id:int, existencia_despues:int, delta:int, duplicado:bool}
 */
function inventario_mover(PDO $pdo, int $escuela_id, string $tipo, int $item_id, string $movimiento, int $cantidad, string $idem_key, array $extra = []): array
{
    if (!in_array($tipo, INVENTARIO_TIPOS, true)) throw new InventarioError('Tipo de producto inválido.');
    if (!in_array($movimiento, INVENTARIO_MOVIMIENTOS, true)) throw new InventarioError('Tipo de movimiento inválido.');
    if ($cantidad === 0) throw new InventarioError('La cantidad no puede ser cero.');
    if (abs($cantidad) > INVENTARIO_CONTADO_MAX) throw new InventarioError('Cantidad fuera de rango.');
    if (in_array($movimiento, ['entrada', 'venta', 'devolucion'], true) && $cantidad < 0) {
        throw new InventarioError('La cantidad de una entrada, venta o devolución debe ser positiva.');
    }
    if ($idem_key === '' || strlen($idem_key) > 80) throw new InventarioError('Llave de idempotencia inválida.');

    $chk = $pdo->prepare("SELECT id, existencia_despues, cantidad FROM inventario_movimientos WHERE idem_key = ? LIMIT 1");
    $chk->execute([$idem_key]);
    if ($prev = $chk->fetch()) {
        return ['id' => intval($prev['id']), 'existencia_despues' => intval($prev['existencia_despues']),
                'delta' => intval($prev['cantidad']), 'duplicado' => true];
    }

    $delta = inventario_delta($movimiento, $cantidad);
    // La existencia de partida sale del LIBRO, no de la columna cacheada: si la
    // columna se hubiera desviado por algo hecho a mano, esta escritura la corrige.
    $despues = inventario_existencia_libro($pdo, $tipo, $item_id) + $delta;

    $costo_c = isset($extra['costo_c']) && $extra['costo_c'] !== null ? intval($extra['costo_c']) : null;
    $pdo->prepare(
        "INSERT INTO inventario_movimientos
            (escuela_id, tipo, item_id, movimiento, cantidad, existencia_despues, costo_unitario,
             proveedor_id, cobro_id, venta_id, gasto_id, motivo, usuario_id, idem_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )->execute([
        $escuela_id, $tipo, $item_id, $movimiento, $delta, $despues,
        $costo_c !== null ? round($costo_c / 100, 2) : null,
        !empty($extra['proveedor_id']) ? intval($extra['proveedor_id']) : null,
        !empty($extra['cobro_id']) ? intval($extra['cobro_id']) : null,
        !empty($extra['venta_id']) ? intval($extra['venta_id']) : null,
        !empty($extra['gasto_id']) ? intval($extra['gasto_id']) : null,
        isset($extra['motivo']) && $extra['motivo'] !== '' ? mb_substr(strval($extra['motivo']), 0, 255) : null,
        !empty($extra['usuario_id']) ? intval($extra['usuario_id']) : null,
        $idem_key,
    ]);
    $id = intval($pdo->lastInsertId());

    $pdo->prepare(
        "UPDATE inventario_existencias
            SET existencia = ?, ultimo_costo = COALESCE(?, ultimo_costo), actualizado_en = NOW()
          WHERE tipo = ? AND item_id = ?"
    )->execute([$despues, $costo_c !== null && $movimiento === 'entrada' ? round($costo_c / 100, 2) : null, $tipo, $item_id]);

    return ['id' => $id, 'existencia_despues' => $despues, 'delta' => $delta, 'duplicado' => false];
}

/**
 * Activa o desactiva el control de existencias de un producto (y deja listo su
 * renglón al activar). Valida que el producto sea de $escuela_id y, para un
 * concepto, que sea una categoría física. Lanza InventarioError si no procede.
 * Desactivar NO borra existencia ni historial: solo deja de moverse con las ventas.
 */
function inventario_fijar_control(PDO $pdo, int $escuela_id, string $tipo, int $item_id, bool $maneja): void
{
    $item = inventario_item($pdo, $tipo, $item_id);
    if (!$item || intval($item['escuela_id']) !== $escuela_id) throw new InventarioError('Producto no encontrado.');
    if ($maneja && $tipo === 'concepto') {
        $razon = inventario_concepto_elegible($item['categoria'], $item['tipo_concepto'], $item['precio']);
        if ($razon !== null) throw new InventarioError($razon);
    }
    $tabla = inventario_tabla_item($tipo);
    $pdo->prepare("UPDATE {$tabla} SET maneja_existencias = ? WHERE id = ? AND escuela_id = ?")
        ->execute([$maneja ? 1 : 0, $item_id, $escuela_id]);
    if ($maneja) inventario_asegurar($pdo, $escuela_id, $tipo, $item_id);
}

/**
 * Los avisos del colegio en UNA consulta agregada (no una por producto: el aviso
 * se pide en cada carga del panel, así que una consulta por producto se pagaría
 * cientos de veces). Cuenta solo productos ACTIVOS con control de existencias.
 *   agotados  existencia ≤ 0 (incluye negativos)
 *   bajos     existencia > 0, mínimo > 0 y existencia ≤ mínimo
 *   negativos existencia < 0 (subconjunto de agotados, para mostrar el aviso fuerte)
 * Devuelve null si el inventario no está instalado o la consulta falla.
 */
function inventario_alertas_contar(PDO $pdo, int $escuela_id): ?array
{
    if (!inventario_listo($pdo)) return null;
    try {
        $con_tienda = inventario_tienda_listo($pdo);
        $sql = "SELECT
                    COALESCE(SUM(e.existencia <= 0), 0) AS agotados,
                    COALESCE(SUM(e.existencia > 0 AND e.minimo > 0 AND e.existencia <= e.minimo), 0) AS bajos,
                    COALESCE(SUM(e.existencia < 0), 0) AS negativos
                  FROM inventario_existencias e
                  LEFT JOIN productos p ON e.tipo = 'concepto' AND p.id = e.item_id"
              . ($con_tienda ? " LEFT JOIN tienda_productos t ON e.tipo = 'tienda' AND t.id = e.item_id" : '')
              . " WHERE e.escuela_id = ? AND ((e.tipo = 'concepto' AND p.maneja_existencias = 1 AND p.activo = 1)"
              . ($con_tienda ? " OR (e.tipo = 'tienda' AND t.maneja_existencias = 1 AND t.activo = 1)" : '') . ")";
        $st = $pdo->prepare($sql);
        $st->execute([$escuela_id]);
        $f = $st->fetch() ?: [];
        return ['agotados' => intval($f['agotados'] ?? 0), 'bajos' => intval($f['bajos'] ?? 0), 'negativos' => intval($f['negativos'] ?? 0)];
    } catch (\Throwable $e) {
        inventario_log('alertas_contar: ' . $e->getMessage());
        return null;
    }
}

/**
 * Existencias de los productos CON control de un colegio, como
 * [item_id => existencia], para mostrarlas junto al producto en Caja y en la
 * tiendita (los que no manejan existencias no aparecen: no se les pinta nada).
 * UNA consulta por catálogo. Vacío si el inventario no está instalado o falla.
 */
function inventario_existencias_de(PDO $pdo, int $escuela_id, string $tipo): array
{
    if (!inventario_listo($pdo)) return [];
    if ($tipo === 'tienda' && !inventario_tienda_listo($pdo)) return [];
    try {
        $tabla = inventario_tabla_item($tipo);
        $st = $pdo->prepare(
            "SELECT x.id, COALESCE(e.existencia, 0) AS existencia
               FROM {$tabla} x
               LEFT JOIN inventario_existencias e ON e.tipo = ? AND e.item_id = x.id
              WHERE x.escuela_id = ? AND x.maneja_existencias = 1"
        );
        $st->execute([$tipo, $escuela_id]);
        $out = [];
        foreach ($st->fetchAll() as $f) $out[intval($f['id'])] = intval($f['existencia']);
        return $out;
    } catch (\Throwable $e) {
        inventario_log('existencias_de: ' . $e->getMessage());
        return [];
    }
}

// ═══════════════════════════ ENGANCHES DE VENTA ═══════════════════════════

/**
 * Registra la VENTA de $pedidos ([item_id => piezas]) para los productos que
 * manejan existencias. NUNCA lanza: si algo falla, lo escribe en el log y sigue
 * (la venta o el cobro ya ocurrieron y no deben caerse por el inventario).
 *
 * Llamar DESPUÉS del commit de la venta (cada renglón abre su propia transacción
 * corta; si ya hay una abierta se usa esa). El producto se busca SOLO dentro de
 * $escuela_id: los ids del carrito vienen del navegador.
 *
 * $doc: ['cobro_id' => n] (tipo 'concepto') o ['venta_id' => n] (tipo 'tienda').
 *
 * @return array{piezas:int, productos:int, errores:int}
 */
function inventario_registrar_ventas(PDO $pdo, int $escuela_id, string $tipo, array $pedidos, array $doc, int $usuario_id = 0): array
{
    $res = ['piezas' => 0, 'productos' => 0, 'errores' => 0];
    try {
        if (!$pedidos || !inventario_listo($pdo)) return $res;
        if ($tipo === 'tienda' && !inventario_tienda_listo($pdo)) return $res;
        $doc_id = intval($tipo === 'tienda' ? ($doc['venta_id'] ?? 0) : ($doc['cobro_id'] ?? 0));
        if ($doc_id <= 0) return $res;

        $ids = array_map('intval', array_keys($pedidos));
        $tabla = inventario_tabla_item($tipo);
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $st = $pdo->prepare("SELECT id FROM {$tabla} WHERE escuela_id = ? AND maneja_existencias = 1 AND id IN ({$ph})");
        $st->execute(array_merge([$escuela_id], $ids));
        $controlados = array_map('intval', $st->fetchAll(\PDO::FETCH_COLUMN));

        foreach ($controlados as $item_id) {
            $piezas = intval($pedidos[$item_id] ?? 0);
            if ($piezas <= 0) continue;
            $propia = !$pdo->inTransaction();
            try {
                if ($propia) $pdo->beginTransaction();
                inventario_asegurar($pdo, $escuela_id, $tipo, $item_id);
                inventario_bloquear($pdo, $tipo, $item_id);
                $extra = ['usuario_id' => $usuario_id, 'motivo' => $tipo === 'tienda' ? 'Venta en tiendita #' . $doc_id : 'Cobro #' . $doc_id]
                    + ($tipo === 'tienda' ? ['venta_id' => $doc_id] : ['cobro_id' => $doc_id]);
                $m = inventario_mover($pdo, $escuela_id, $tipo, $item_id, 'venta', $piezas,
                    inventario_idem_documento('venta', $tipo, $doc_id, $item_id), $extra);
                if ($propia) $pdo->commit();
                if (!$m['duplicado']) { $res['piezas'] += $piezas; $res['productos']++; }
            } catch (\Throwable $e) {
                if ($propia && $pdo->inTransaction()) $pdo->rollBack();
                $res['errores']++;
                inventario_log("venta {$tipo} doc={$doc_id} item={$item_id}: " . get_class($e) . ' ' . $e->getMessage());
            }
        }
    } catch (\Throwable $e) {
        $res['errores']++;
        inventario_log("registrar_ventas {$tipo}: " . get_class($e) . ' ' . $e->getMessage());
    }
    return $res;
}

/**
 * Regresa al inventario lo que ese documento había descontado: lee del LIBRO
 * las ventas de ese cobro/venta y escribe una devolución por cada una, por las
 * MISMAS piezas. Si el documento no descontó nada (producto sin control, venta
 * anterior al inventario, o el inventario falló entonces), no hace nada: nunca
 * se devuelve lo que no se descontó. NUNCA lanza.
 *
 * $tipo 'concepto' → $documento_id es el cobro; 'tienda' → la venta de la tiendita.
 *
 * @return array{piezas:int, productos:int, errores:int}
 */
function inventario_devolver_documento(PDO $pdo, int $escuela_id, string $tipo, int $documento_id, int $usuario_id = 0, string $motivo = ''): array
{
    $res = ['piezas' => 0, 'productos' => 0, 'errores' => 0];
    try {
        if ($documento_id <= 0 || !inventario_listo($pdo)) return $res;
        $col = $tipo === 'tienda' ? 'venta_id' : 'cobro_id';
        $st = $pdo->prepare(
            "SELECT item_id, -SUM(cantidad) AS piezas FROM inventario_movimientos
              WHERE escuela_id = ? AND tipo = ? AND movimiento = 'venta' AND {$col} = ?
              GROUP BY item_id"
        );
        $st->execute([$escuela_id, $tipo, $documento_id]);
        foreach ($st->fetchAll() as $f) {
            $item_id = intval($f['item_id']);
            $piezas = intval($f['piezas']);
            if ($piezas <= 0) continue;
            $propia = !$pdo->inTransaction();
            try {
                if ($propia) $pdo->beginTransaction();
                inventario_asegurar($pdo, $escuela_id, $tipo, $item_id);
                inventario_bloquear($pdo, $tipo, $item_id);
                $m = inventario_mover($pdo, $escuela_id, $tipo, $item_id, 'devolucion', $piezas,
                    inventario_idem_documento('devolucion', $tipo, $documento_id, $item_id),
                    [$col => $documento_id, 'usuario_id' => $usuario_id,
                     'motivo' => ($tipo === 'tienda' ? 'Cancelación de la venta #' : 'Cancelación del cobro #') . $documento_id
                                 . ($motivo !== '' ? ': ' . $motivo : '')]);
                if ($propia) $pdo->commit();
                if (!$m['duplicado']) { $res['piezas'] += $piezas; $res['productos']++; }
            } catch (\Throwable $e) {
                if ($propia && $pdo->inTransaction()) $pdo->rollBack();
                $res['errores']++;
                inventario_log("devolucion {$tipo} doc={$documento_id} item={$item_id}: " . get_class($e) . ' ' . $e->getMessage());
            }
        }
    } catch (\Throwable $e) {
        $res['errores']++;
        inventario_log("devolver_documento {$tipo} doc={$documento_id}: " . get_class($e) . ' ' . $e->getMessage());
    }
    return $res;
}

// ═══════════════════════════ GASTO DE UNA ENTRADA ═════════════════════════

/**
 * Inserta el gasto de una compra de mercancía. Es EL MISMO INSERT que
 * acciones/crear_gasto.php (tabla gastos: escuela, proveedor, concepto, monto,
 * fecha, forma de pago, usuario) — esa acción es un script de acciones/ sin
 * función que reutilizar, así que se repite la sentencia, no la lógica de
 * validación (que aquí la hace inventario_entrada con las mismas reglas:
 * monto > 0, forma de pago de la lista, proveedor de ESTE colegio, fecha Y-m-d).
 * Si cambias las columnas de gastos, cambia las dos.
 */
function inventario_insertar_gasto(PDO $pdo, int $escuela_id, ?int $proveedor_id, string $concepto, float $monto, string $fecha, string $forma_pago, ?int $usuario_id): int
{
    $pdo->prepare(
        "INSERT INTO gastos (escuela_id, proveedor_id, concepto, monto, fecha, forma_pago, usuario_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)"
    )->execute([$escuela_id, $proveedor_id, mb_substr($concepto, 0, 190), $monto, $fecha, $forma_pago, $usuario_id]);
    return intval($pdo->lastInsertId());
}

// ═══════════════════════════ ACCESO (solo api.php) ════════════════════════

/**
 * Valida rol + escuela + migración (+ sección 'inventario' si es escritura),
 * igual que monedero_ctx(). Devuelve ['rol','escuela_id','user_id'].
 * superadmin manda escuela_id en el input; los demás roles la sacan de la sesión.
 */
function inventario_ctx(PDO $pdo, array $usuario_actual, array $input, array $roles, bool $escritura = false): array
{
    $rol = $usuario_actual['rol'] ?? '';
    requerir_rol($rol, $roles, 'No tienes permiso para el inventario.');

    if ($rol === 'superadmin') {
        $escuela_id = intval($input['escuela_id'] ?? $_GET['escuela_id'] ?? 0);
        if (!$escuela_id) respond(['success' => false, 'error' => 'Selecciona un colegio primero.']);
    } else {
        // NUNCA del input: la escuela sale de la sesión.
        $escuela_id = intval($usuario_actual['escuela_id'] ?? 0);
        if (!$escuela_id) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'Tu cuenta no está ligada a ningún colegio.']);
        }
    }

    if (!inventario_listo($pdo)) {
        inventario_log('tablas no encontradas (¿falta la migración OF-6? php herramientas/migrar.php --aplicar)');
        respond(['success' => false, 'error' => 'El inventario aún no está instalado en la base de datos. Pide al administrador de la plataforma que aplique las migraciones pendientes (migracion_2026_11_20_of6_inventario.sql).']);
    }
    if ($escritura && function_exists('requerir_seccion_habilitada')) {
        requerir_seccion_habilitada($pdo, $rol, $escuela_id, ['inventario'], 'El inventario no está habilitado para este colegio.');
    }
    return ['rol' => $rol, 'escuela_id' => $escuela_id, 'user_id' => intval($usuario_actual['user_id'] ?? 0)];
}

/**
 * Responde al navegador con el error de una operación del inventario.
 * InventarioError trae un mensaje pensado para el usuario y se muestra tal cual;
 * cualquier otra excepción se registra y se responde algo genérico (sin
 * nombres de tablas). Quien llama ya debe haber hecho rollBack().
 */
function inventario_fallo(\Throwable $e, string $contexto): void
{
    if ($e instanceof InventarioError) {
        respond(['success' => false, 'error' => $e->getMessage()]);
    }
    inventario_log("{$contexto}: " . get_class($e) . ' ' . $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine());
    respond(['success' => false, 'error' => 'No se pudo completar la operación del inventario. Intenta de nuevo; si el problema sigue, avisa a soporte.']);
}

/** Carga el producto y comprueba que sea del colegio del contexto (nunca confiar en el input). */
function inventario_item_propio(PDO $pdo, array $ctx, string $tipo, int $item_id): array
{
    if (!in_array($tipo, INVENTARIO_TIPOS, true)) respond(['success' => false, 'error' => 'Tipo de producto inválido.']);
    $item = $item_id > 0 ? inventario_item($pdo, $tipo, $item_id) : null;
    if (!$item) respond(['success' => false, 'error' => 'Producto no encontrado.']);
    if (intval($item['escuela_id']) !== intval($ctx['escuela_id'])) {
        http_response_code(403);
        respond(['success' => false, 'error' => 'Ese producto no pertenece a tu colegio.']);
    }
    return $item;
}
