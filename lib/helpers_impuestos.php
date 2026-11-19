<?php
/**
 * lib/helpers_impuestos.php — [OF-2] IVA por concepto y factura con un renglón
 * por concepto (19-nov-2026).
 *
 * POR QUÉ EXISTE
 *
 * acciones/generar_cfdi.php armaba SIEMPRE un solo renglón con IVA 16% y la
 * clave SAT 86101800, fuera colegiatura, uniforme o libro. Cada concepto
 * (productos) ahora lleva su propio tratamiento de IVA, su clave SAT y su
 * unidad, y al crear el cobro se COPIA a cobro_items (snapshot) para que
 * editar el concepto después no cambie lo que se factura de cobros ya hechos.
 *
 * REGLA DE ORO: el precio capturado es SIEMPRE el precio final, con el
 * impuesto ya incluido. No existe un modo "sumar IVA": cambiaría lo que paga
 * la familia. Lo que cambia es cómo se DESGLOSA para el SAT:
 *
 *   'exento' → IVA Exento     (base = precio, sin impuesto)
 *   '0'      → IVA tasa 0%    (base = precio, impuesto 0.00)
 *   '16'     → IVA 16%        (base = precio / 1.16, impuesto = base * 0.16)
 *
 * NO ES ASESORÍA FISCAL: la tasa correcta de cada concepto la decide el
 * contador del colegio. El sistema solo permite configurarla.
 *
 * Ninguna función de aquí llama a respond(): el cron no incluye api.php. Las
 * que validan devuelven el error y quien las llama decide qué hacer con él.
 */

/** Valores válidos de productos.iva_tasa / cobro_items.iva_tasa. */
const IMPUESTO_TASAS = ['exento', '0', '16'];

/** Valores por defecto: idénticos a lo que se facturaba antes de OF-2. */
const IMPUESTO_CLAVE_SAT_DEFAULT = '86101800'; // Servicios educativos
const IMPUESTO_UNIDAD_DEFAULT    = 'E48';      // Unidad de servicio

/** Categorías de productos.categoria a las que aplica el complemento IEDU. */
const IMPUESTO_CATEGORIAS_IEDU = ['colegiatura', 'inscripcion', 'anualidad'];

/**
 * ¿Existe la columna $columna en $tabla? (migracion_2026_11_19_of2_impuestos.sql)
 * Se consulta una vez por petición y por tabla/columna. Si la consulta truena,
 * se asume que NO existe: el código cae al comportamiento de antes de OF-2.
 */
function impuestos_columna_existe(PDO $pdo, string $tabla, string $columna): bool
{
    static $cache = [];
    $k = $tabla . '.' . $columna;
    if (array_key_exists($k, $cache)) return $cache[$k];
    try {
        // Los nombres vienen de constantes del propio código, nunca del input.
        $st = $pdo->query("SHOW COLUMNS FROM `{$tabla}` LIKE " . $pdo->quote($columna));
        $cache[$k] = (bool) $st->fetch();
    } catch (\Throwable $e) {
        $cache[$k] = false;
    }
    return $cache[$k];
}

/** ¿productos ya tiene las 3 columnas de impuestos? */
function impuestos_productos_listos(PDO $pdo): bool
{
    return impuestos_columna_existe($pdo, 'productos', 'iva_tasa');
}

/** ¿cobro_items ya tiene las 3 columnas del snapshot? */
function impuestos_items_listos(PDO $pdo): bool
{
    return impuestos_columna_existe($pdo, 'cobro_items', 'iva_tasa');
}

/**
 * Sugerencia de tratamiento según la categoría del concepto. Solo es un
 * punto de partida al CREAR; el admin la cambia. Espejo en views/Productos.js.
 *   colegiatura, inscripción, anualidad, examen → exento
 *   uniforme → 16% + pieza (H87)
 *   lo demás → 16%
 */
function impuestos_sugerencia_categoria(string $categoria): array
{
    $c = strtolower(trim($categoria));
    if (in_array($c, ['colegiatura', 'inscripcion', 'anualidad', 'examen'], true)) {
        return ['iva_tasa' => 'exento', 'clave_sat' => IMPUESTO_CLAVE_SAT_DEFAULT, 'clave_unidad' => IMPUESTO_UNIDAD_DEFAULT];
    }
    if ($c === 'uniforme') {
        return ['iva_tasa' => '16', 'clave_sat' => IMPUESTO_CLAVE_SAT_DEFAULT, 'clave_unidad' => 'H87'];
    }
    return ['iva_tasa' => '16', 'clave_sat' => IMPUESTO_CLAVE_SAT_DEFAULT, 'clave_unidad' => IMPUESTO_UNIDAD_DEFAULT];
}

/**
 * Normaliza y valida la tasa de IVA. Acepta 16, '16', '16%', 0, '0', 'exento'
 * (cualquier capitalización). Devuelve null si no es una de IMPUESTO_TASAS.
 */
function impuestos_normalizar_tasa($valor): ?string
{
    if (is_int($valor) || is_float($valor)) $valor = (string) intval($valor);
    $v = strtolower(trim(str_replace('%', '', (string) $valor)));
    return in_array($v, IMPUESTO_TASAS, true) ? $v : null;
}

/**
 * Valida los tres campos de impuestos que manda el formulario de Productos.
 * Un campo AUSENTE del input se omite (no se toca); uno PRESENTE se valida.
 *
 * Devuelve ['ok' => true, 'campos' => ['iva_tasa' => .., 'clave_sat' => .., 'clave_unidad' => ..]]
 * (solo con las claves presentes) o ['ok' => false, 'error' => '...'].
 */
function impuestos_validar_input(array $input): array
{
    $campos = [];
    if (array_key_exists('iva_tasa', $input)) {
        $t = impuestos_normalizar_tasa($input['iva_tasa']);
        if ($t === null) return ['ok' => false, 'error' => 'IVA inválido: elige Exento, Tasa 0% o 16%.'];
        $campos['iva_tasa'] = $t;
    }
    if (array_key_exists('clave_sat', $input)) {
        $c = trim((string) $input['clave_sat']);
        if (!preg_match('/^[0-9]{8}$/', $c)) {
            return ['ok' => false, 'error' => 'La clave SAT debe tener exactamente 8 dígitos (catálogo c_ClaveProdServ). Ejemplo: 86101800.'];
        }
        $campos['clave_sat'] = $c;
    }
    if (array_key_exists('clave_unidad', $input)) {
        $u = strtoupper(trim((string) $input['clave_unidad']));
        if (!preg_match('/^[A-Z0-9]{2,3}$/', $u)) {
            return ['ok' => false, 'error' => 'La unidad debe ser una clave SAT de 2 o 3 caracteres (catálogo c_ClaveUnidad). Ejemplos: E48 (servicio), H87 (pieza).'];
        }
        $campos['clave_unidad'] = $u;
    }
    return ['ok' => true, 'campos' => $campos];
}

/**
 * Snapshot de impuestos de un concepto, para copiarlo a cobro_items.
 *
 * $escuela_id acota la búsqueda: producto_id viene de un carrito que manda el
 * navegador (incluida una familia), y copiar la clave SAT de un concepto de
 * OTRO colegio sería un dato ajeno. Si el concepto no es de esa escuela, no
 * hay snapshot (null) y el renglón se factura como antes.
 *
 * Devuelve ['iva_tasa', 'clave_sat', 'clave_unidad'] o null (sin producto,
 * producto ajeno, o migración sin correr).
 */
function impuestos_snapshot_producto(PDO $pdo, $producto_id, $escuela_id): ?array
{
    $pid = intval($producto_id);
    if ($pid <= 0 || !impuestos_productos_listos($pdo)) return null;
    try {
        $st = $pdo->prepare("SELECT iva_tasa, clave_sat, clave_unidad FROM productos WHERE id = ? AND escuela_id = ?");
        $st->execute([$pid, intval($escuela_id)]);
        $r = $st->fetch(PDO::FETCH_ASSOC);
    } catch (\Throwable $e) {
        return null;
    }
    if (!$r) return null;
    $tasa = impuestos_normalizar_tasa($r['iva_tasa']);
    if ($tasa === null) return null;
    return [
        'iva_tasa'     => $tasa,
        'clave_sat'    => $r['clave_sat'] ?: IMPUESTO_CLAVE_SAT_DEFAULT,
        'clave_unidad' => $r['clave_unidad'] ?: IMPUESTO_UNIDAD_DEFAULT,
    ];
}

/**
 * INSERT de un renglón de cobro_items CON snapshot de impuestos cuando se
 * puede, y como siempre cuando no (migración sin correr, sin producto, o
 * producto de otra escuela). Lo usan crear_cobro y el cron de recurrentes.
 * Puede lanzar PDOException: quien llama ya lo tenía envuelto en try/catch
 * porque cobro_items es opcional.
 */
function impuestos_insertar_item(PDO $pdo, $escuela_id, $cobro_id, $producto_id, $nombre, $cantidad, $precio, $subtotal): void
{
    $snap = impuestos_items_listos($pdo) ? impuestos_snapshot_producto($pdo, $producto_id, $escuela_id) : null;
    if ($snap) {
        $pdo->prepare(
            "INSERT INTO cobro_items (cobro_id, producto_id, nombre, cantidad, precio_unitario, subtotal, iva_tasa, clave_sat, clave_unidad)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )->execute([$cobro_id, intval($producto_id) ?: null, $nombre, $cantidad, $precio, $subtotal,
                    $snap['iva_tasa'], $snap['clave_sat'], $snap['clave_unidad']]);
        return;
    }
    $pdo->prepare(
        "INSERT INTO cobro_items (cobro_id, producto_id, nombre, cantidad, precio_unitario, subtotal)
         VALUES (?, ?, ?, ?, ?, ?)"
    )->execute([$cobro_id, intval($producto_id) ?: null, $nombre, $cantidad, $precio, $subtotal]);
}

// ════════════════════════════════════════════════════════════════════════
//  FACTURA CON UN RENGLÓN POR CONCEPTO
// ════════════════════════════════════════════════════════════════════════

/** Centavos enteros desde un monto en pesos (evita errores de float). */
function impuestos_centavos($pesos): int
{
    return (int) round(floatval($pesos) * 100);
}

/** Impuesto de un renglón de tasa 16% a partir de su base, en centavos. */
function impuestos_iva16_de_base(int $base): int
{
    return (int) round($base * 0.16);
}

/**
 * Base neta (en centavos) de un renglón al 16% cuyo importe pagado, con IVA
 * incluido, es $bruto. CFDI calcula el impuesto por concepto como
 * round(base * 0.16), así que base + IVA solo alcanza ~6 de cada 7 importes
 * en centavos: en el séptimo no existe ninguna base exacta (el total salta de
 * 2 en 2). En ese caso se elige la base cuyo total queda a UN centavo POR
 * DEBAJO de lo pagado (nunca se factura de más) y se informa la desviación.
 *
 * Devuelve [base, desviacion] con desviacion = (base + IVA) - $bruto, en
 * centavos (0 o -1), o null si $bruto es demasiado chico para tener base.
 */
function impuestos_base_de_bruto16(int $bruto): ?array
{
    $centro = (int) round($bruto / 1.16);
    $mejor = null;
    for ($d = -3; $d <= 3; $d++) {
        $b = $centro + $d;
        if ($b <= 0) continue;
        $dev = $b + impuestos_iva16_de_base($b) - $bruto;
        if ($dev > 0 || $dev < -1) continue;
        if ($mejor === null || abs($dev) < abs($mejor[1])) $mejor = [$b, $dev];
    }
    return $mejor;
}

/** Nombre de unidad (unit_name) para las claves de unidad más comunes. */
function impuestos_nombre_unidad(string $clave): ?string
{
    $mapa = ['E48' => 'Unidad de servicio', 'H87' => 'Pieza', 'ACT' => 'Actividad'];
    return $mapa[strtoupper($clave)] ?? null;
}

/** Bloque `taxes` del producto en Facturapi, según la tasa del concepto. */
function impuestos_taxes_facturapi(string $tasa): array
{
    // Fuente: Facturapi API v2, TaxFactor = "Tasa" | "Cuota" | "Exento"
    // (https://docs.facturapi.io/api/ y SDK oficial facturapi-node, enum TaxFactor).
    if ($tasa === 'exento') return [['type' => 'IVA', 'factor' => 'Exento', 'rate' => 0]];
    if ($tasa === '0')      return [['type' => 'IVA', 'factor' => 'Tasa', 'rate' => 0]];
    return [['type' => 'IVA', 'factor' => 'Tasa', 'rate' => 0.16]];
}

/**
 * Arma los renglones de la factura a partir de cobro_items.
 *
 * $items: filas de cobro_items (nombre, cantidad, precio_unitario, subtotal,
 *   iva_tasa, clave_sat, clave_unidad) con la columna extra `categoria`
 *   (productos.categoria, puede ser null).
 * $total_cobro: cobros.total en pesos.
 * $iedu: arreglo del complemento IEDU ya armado, o null.
 *
 * Devuelve:
 *   ['ok' => true,
 *    'items'    => [...] renglones para el payload de Facturapi,
 *    'desglose' => [['tasa','base','iva','total'], ...] por tasa, en pesos,
 *    'subtotal' => base total (sin IVA), 'iva' => IVA total, 'total' => total,
 *    'descuento'=> descuento total (becas) repartido,
 *    'iedu_renglones' => cuántos renglones llevan IEDU,
 *    'desviacion_centavos' => cuánto quedó el total por debajo del cobro (≤ 0)]
 *  o ['ok' => false, 'motivo' => 'texto para log_api'] → quien llama usa el
 *  comportamiento de antes (un solo renglón).
 *
 * CÓMO SE EVITA QUE EL TOTAL SE DESCUADRE
 * Todo se calcula en centavos enteros. Antes de armar nada se exige que la
 * suma de los renglones sea EXACTAMENTE el total del cobro. Cada renglón de
 * 16% se arma al revés: se busca la base neta tal que base + round(base*0.16)
 * dé el importe pagado, y se envía a Facturapi con tax_included=false y
 * precios NETOS, así el PAC suma lo mismo que calculamos aquí (y el
 * `discount` tiene la semántica estándar del CFDI: antes de impuestos).
 * Limitación aritmética del CFDI: ~1 de cada 7 importes en centavos no tiene
 * base exacta al 16% (ver impuestos_base_de_bruto16); ahí el renglón queda a
 * 1 centavo POR DEBAJO de lo pagado y se informa en `desviacion_centavos`.
 * Cualquier otra incongruencia (suma que no cuadra, descuento que cubre un
 * renglón entero...) devuelve ok=false y quien llama usa un solo renglón.
 * * BECAS (renglones negativos): un renglón negativo no puede ir como concepto
 * en un CFDI de ingreso. Se convierten en `discount`, repartido entre los
 * renglones positivos en proporción a su importe, en centavos; el residuo del
 * redondeo va al renglón mayor.
 */
function cfdi_armar_renglones(array $items, float $total_cobro, ?array $iedu = null): array
{
    if (!$items) return ['ok' => false, 'motivo' => 'cobro sin cobro_items'];

    $pos = [];       // renglones positivos
    $negativo = 0;   // centavos de descuento (positivo)
    $neg_por_tasa = []; // [OF-3] descuento agrupado por la tasa del renglón negativo
    $suma_bruta = 0;
    foreach ($items as $i => $it) {
        $tasa = impuestos_normalizar_tasa($it['iva_tasa'] ?? null);
        if ($tasa === null || empty($it['clave_sat']) || empty($it['clave_unidad'])) {
            return ['ok' => false, 'motivo' => "renglón #{$i} sin snapshot de impuestos (cobro anterior a OF-2)"];
        }
        $cant = max(1, intval($it['cantidad'] ?? 1));
        $unit = impuestos_centavos($it['precio_unitario'] ?? 0);
        $linea = impuestos_centavos($it['subtotal'] ?? 0);
        if ($unit * $cant !== $linea) {
            return ['ok' => false, 'motivo' => "renglón #{$i}: precio_unitario x cantidad no coincide con subtotal"];
        }
        $suma_bruta += $linea;
        $cat = strtolower(trim((string) ($it['categoria'] ?? '')));
        if ($linea < 0) {
            $negativo += -$linea;
            $neg_por_tasa[$tasa] = ($neg_por_tasa[$tasa] ?? 0) + (-$linea);
            continue;
        }
        if ($cat === 'beca' && $linea > 0) {
            // Una "beca" con precio positivo SUMA al total del cobro: no es un descuento.
            return ['ok' => false, 'motivo' => "renglón #{$i}: categoría beca con precio positivo"];
        }
        if ($linea === 0) continue; // renglón de $0: no se factura
        $pos[] = [
            'nombre' => trim((string) ($it['nombre'] ?? '')) ?: 'Concepto',
            'cant' => $cant, 'linea' => $linea, 'tasa' => $tasa,
            'clave_sat' => (string) $it['clave_sat'], 'clave_unidad' => strtoupper((string) $it['clave_unidad']),
            'educativo' => in_array($cat, IMPUESTO_CATEGORIAS_IEDU, true),
            'desc' => 0,
        ];
    }
    $total_c = impuestos_centavos($total_cobro);
    if ($suma_bruta !== $total_c) {
        return ['ok' => false, 'motivo' => "la suma de los renglones ({$suma_bruta}c) no coincide con el total del cobro ({$total_c}c)"];
    }
    if (!$pos) return ['ok' => false, 'motivo' => 'sin renglones de precio positivo'];

    // ── Reparto del descuento entre los renglones positivos ──
    $suma_pos = array_sum(array_column($pos, 'linea'));
    if ($negativo >= $suma_pos) return ['ok' => false, 'motivo' => 'los descuentos igualan o superan los renglones positivos'];
    if ($negativo > 0) {
        // [OF-3] Cada descuento se reparte SOLO entre los renglones de su misma
        // tasa de IVA (el renglón de beca copia el snapshot del concepto al que
        // se aplica). Así la beca de una colegiatura exenta rebaja la base
        // exenta y no la del uniforme al 16% que viaja en el mismo cobro. Si
        // no hay ningún renglón positivo con esa tasa (p. ej. un concepto
        // "beca" viejo capturado al 16% sobre una colegiatura exenta), se
        // reparte entre todos, como antes.
        foreach ($neg_por_tasa as $tasa_neg => $monto_neg) {
            $destino = [];
            foreach ($pos as $k => $p) {
                if ($p['tasa'] === $tasa_neg) $destino[] = $k;
            }
            if (!$destino) $destino = array_keys($pos);
            $suma_destino = 0;
            foreach ($destino as $k) $suma_destino += $pos[$k]['linea'];
            $repartido = 0;
            $mayor = $destino[0];
            foreach ($destino as $k) {
                $parte = intdiv($monto_neg * $pos[$k]['linea'], $suma_destino);
                $pos[$k]['desc'] += $parte;
                $repartido += $parte;
                if ($pos[$k]['linea'] > $pos[$mayor]['linea']) $mayor = $k;
            }
            $pos[$mayor]['desc'] += $monto_neg - $repartido; // residuo al renglón mayor del grupo
        }
        foreach ($pos as $k => $p) {
            if ($p['desc'] >= $p['linea']) return ['ok' => false, 'motivo' => 'un descuento repartido cubre todo un renglón'];
        }
    }

    // ── Un renglón de Facturapi por cada positivo ──
    $out = [];
    $grupos = [];
    $iedu_n = 0;
    $desv_total = 0;
    foreach ($pos as $k => $p) {
        $neto_pagado = $p['linea'] - $p['desc']; // importe final con impuesto, centavos
        if ($p['tasa'] === '16') {
            $r16 = impuestos_base_de_bruto16($neto_pagado);
            if ($r16 === null) {
                return ['ok' => false, 'motivo' => "renglón '{$p['nombre']}': el importe {$neto_pagado}c no admite base al 16%"];
            }
            [$base, $dev] = $r16;
            $iva = impuestos_iva16_de_base($base);
            $desv_total += $dev;
            $desc_neto = $p['desc'] > 0 ? (int) round($p['desc'] / 1.16) : 0;
        } else {
            $base = $neto_pagado;
            $iva = 0;
            $desc_neto = $p['desc'];
        }
        // Facturapi calcula base = price * quantity - discount. Precio unitario
        // neto = lo que redondee hacia arriba a centavos exactos y el descuento
        // absorbe la diferencia (con cantidad 1 es exactamente base + descuento).
        $precio_unit = intdiv($base + $desc_neto + $p['cant'] - 1, $p['cant']);
        $desc_final = $precio_unit * $p['cant'] - $base;

        $producto = [
            'description'  => $p['nombre'],
            'product_key'  => $p['clave_sat'],
            'unit_key'     => $p['clave_unidad'],
            'price'        => $precio_unit / 100,
            // Precio NETO + tax_included=false: ver "CÓMO SE EVITA..." arriba.
            'tax_included' => false,
            'taxability'   => '02',
            'taxes'        => impuestos_taxes_facturapi($p['tasa']),
        ];
        $un = impuestos_nombre_unidad($p['clave_unidad']);
        if ($un) $producto['unit_name'] = $un;
        $renglon = ['quantity' => $p['cant'], 'product' => $producto];
        if ($desc_final > 0) $renglon['discount'] = $desc_final / 100;
        if ($iedu && $p['educativo']) {
            $renglon['complement'] = $iedu; // el complemento va en el CONCEPTO (item), como siempre
            $iedu_n++;
        }
        $out[] = $renglon;

        if (!isset($grupos[$p['tasa']])) $grupos[$p['tasa']] = ['tasa' => $p['tasa'], 'base' => 0, 'iva' => 0, 'total' => 0];
        $grupos[$p['tasa']]['base'] += $base;
        $grupos[$p['tasa']]['iva'] += $iva;
        $grupos[$p['tasa']]['total'] += $base + $iva;
    }

    $desglose = [];
    $sub = 0; $iva_t = 0; $tot = 0;
    foreach ($grupos as $g) {
        $sub += $g['base']; $iva_t += $g['iva']; $tot += $g['total'];
        $desglose[] = ['tasa' => $g['tasa'], 'base' => $g['base'] / 100, 'iva' => $g['iva'] / 100, 'total' => $g['total'] / 100];
    }
    if ($tot - $desv_total !== $total_c) {
        return ['ok' => false, 'motivo' => "el total armado ({$tot}c, desviación {$desv_total}c) no coincide con el total del cobro ({$total_c}c)"];
    }
    return [
        'ok' => true, 'items' => $out, 'desglose' => $desglose,
        'subtotal' => $sub / 100, 'iva' => $iva_t / 100, 'total' => $tot / 100,
        'descuento' => $negativo / 100, 'iedu_renglones' => $iedu_n,
        'desviacion_centavos' => $desv_total,
    ];
}

// ════════════════════════════════════════════════════════════════════════
//  COMPLEMENTO DE PAGO: desglose de impuestos proporcional al abono
// ════════════════════════════════════════════════════════════════════════

/**
 * Desglose del documento relacionado (ImpuestosDR de Pagos 2.0) para un abono.
 *
 * En un CFDI de pago el impuesto debe corresponder al de la factura original.
 * Si la factura mezcla renglones exentos, tasa 0 y 16%, el abono se reparte
 * entre esos grupos en proporción a lo que pesa cada uno en el total de la
 * factura, en centavos (residuo al grupo mayor), y cada porción lleva su
 * propio impuesto:
 *   '16'     → base = porción / 1.16, IVA tasa 0.16
 *   '0'      → base = porción, IVA tasa 0
 *   'exento' → base = porción, IVA factor Exento
 *
 * $desglose: el arreglo `desglose` que se guardó al facturar
 *   (cobros.factura_impuestos_json), o null/[] para una factura de antes de
 *   OF-2: se trata como un solo renglón al 16% (lo de siempre).
 * $monto_abono y $total_factura en pesos.
 *
 * Devuelve la lista `taxes` para related_documents[] de Facturapi
 * (https://docs.facturapi.io/api/ → complemento "pago" → related_documents[].taxes:
 *  {base, type, rate, factor, withholding}).
 */
function cfdi_impuestos_pago(?array $desglose, float $monto_abono, float $total_factura): array
{
    $m = impuestos_centavos($monto_abono);
    if (!$desglose || $total_factura <= 0) {
        // Factura de un solo renglón al 16% (la de siempre).
        return [['type' => 'IVA', 'rate' => 0.16, 'base' => round($monto_abono / 1.16, 2), 'withholding' => false]];
    }
    $pesos = [];
    foreach ($desglose as $k => $g) $pesos[$k] = max(0, impuestos_centavos($g['total'] ?? 0));
    $suma = array_sum($pesos);
    if ($suma <= 0) {
        return [['type' => 'IVA', 'rate' => 0.16, 'base' => round($monto_abono / 1.16, 2), 'withholding' => false]];
    }
    $partes = [];
    $asignado = 0;
    $mayor = array_key_first($pesos);
    foreach ($pesos as $k => $w) {
        $partes[$k] = intdiv($m * $w, $suma);
        $asignado += $partes[$k];
        if ($w > $pesos[$mayor]) $mayor = $k;
    }
    $partes[$mayor] += $m - $asignado;

    $taxes = [];
    foreach ($desglose as $k => $g) {
        $porcion = $partes[$k];
        if ($porcion <= 0) continue;
        $tasa = $g['tasa'] ?? '16';
        if ($tasa === 'exento') {
            $taxes[] = ['type' => 'IVA', 'factor' => 'Exento', 'rate' => 0, 'base' => $porcion / 100, 'withholding' => false];
        } elseif ($tasa === '0') {
            $taxes[] = ['type' => 'IVA', 'factor' => 'Tasa', 'rate' => 0, 'base' => $porcion / 100, 'withholding' => false];
        } else {
            $taxes[] = ['type' => 'IVA', 'factor' => 'Tasa', 'rate' => 0.16, 'base' => round(($porcion / 100) / 1.16, 2), 'withholding' => false];
        }
    }
    return $taxes ?: [['type' => 'IVA', 'rate' => 0.16, 'base' => round($monto_abono / 1.16, 2), 'withholding' => false]];
}

/** Decodifica cobros.factura_impuestos_json; null si no hay o es inválido. */
function cfdi_desglose_decodificar($json): ?array
{
    if (!is_string($json) || trim($json) === '') return null;
    $d = json_decode($json, true);
    if (!is_array($d) || !$d) return null;
    foreach ($d as $g) {
        if (!is_array($g) || !isset($g['tasa'], $g['total'])) return null;
    }
    return array_values($d);
}
