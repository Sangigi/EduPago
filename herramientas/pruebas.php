<?php
// herramientas/pruebas.php — pruebas de la lógica de dinero (solo CLI, SIN base de datos).
//
//   php herramientas/pruebas.php                 corre todo
//   php herramientas/pruebas.php impuestos       solo las pruebas cuyo nombre contenga "impuestos"
//   php herramientas/pruebas.php --lista         lista los nombres sin correrlos
//
// Sale con código 0 si todo pasa y 1 si alguna falla.
//
// EduPago no tiene Composer ni PHPUnit (el servidor recibe archivos por git, no
// corre `composer install`), así que este es un corredor mínimo: prueba('nombre',
// fn) + aserciones. Prueba funciones PURAS ya existentes (centavos, reparto de
// IVA, becas, folios, origen de webhooks); no toca la base ni la red, y no
// modifica ninguna de esas funciones.
//
// Si una prueba falla, NO es automáticamente un error del sistema: puede estar
// mal el supuesto de la prueba. Léela con el código al lado. Un fallo real se
// reporta con el caso exacto; no se "arregla" aquí.
//
// Ver herramientas/LEEME.md.

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$RAIZ = dirname(__DIR__);
// Los helpers escriben en logs con rutas relativas a su carpeta (webhooks) o
// consultan constantes de config.php solo cuando se LLAMAN. Aquí se cargan solo
// los archivos de funciones; config.php NO se carga (trae credenciales).
require_once $RAIZ . '/lib/helpers_impuestos.php';
require_once $RAIZ . '/lib/helpers_becas.php';
require_once $RAIZ . '/lib/helpers_pagos.php';
require_once $RAIZ . '/lib/helpers_monedero.php';
require_once $RAIZ . '/lib/helpers_importar_saldos.php'; // [OF-5]
require_once $RAIZ . '/lib/helpers_inventario.php'; // [OF-6]

// ════════════════════════════════════════════════════════════════════════
// Mini corredor
// ════════════════════════════════════════════════════════════════════════

class PruebaFallo extends Exception {}

$GLOBALS['__pruebas'] = [];

function prueba(string $nombre, callable $fn): void { $GLOBALS['__pruebas'][] = [$nombre, $fn]; }

function afirmar($cond, string $msg = 'la condición es falsa'): void
{
    if (!$cond) throw new PruebaFallo($msg);
}

function _ver($v): string
{
    $s = json_encode($v, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
    return $s === false ? var_export($v, true) : $s;
}

/** Igualdad estricta (mismo valor Y mismo tipo). */
function igual($esperado, $real, string $msg = ''): void
{
    if ($esperado !== $real) {
        throw new PruebaFallo(($msg !== '' ? $msg . ': ' : '') . 'esperado ' . _ver($esperado) . ' pero salió ' . _ver($real));
    }
}

/** Igualdad de números con tolerancia (para pesos con 2 decimales). */
function cerca(float $esperado, $real, string $msg = '', float $tol = 0.0001): void
{
    if (!is_numeric($real) || abs($esperado - floatval($real)) > $tol) {
        throw new PruebaFallo(($msg !== '' ? $msg . ': ' : '') . 'esperado ~' . _ver($esperado) . ' pero salió ' . _ver($real));
    }
}

/** Ejecuta un PHP en un proceso aparte (para lo que usa `static`). Devuelve [salida, código]. */
function php_aparte(string $codigo): array
{
    $tmp = tempnam(sys_get_temp_dir(), 'edupago_t_') . '.php';
    file_put_contents($tmp, "<?php\n" . $codigo);
    $salida = []; $cod = 0;
    exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($tmp) . ' 2>&1', $salida, $cod);
    @unlink($tmp);
    return [implode("\n", $salida), $cod];
}

// ════════════════════════════════════════════════════════════════════════
// Ayudas de datos
// ════════════════════════════════════════════════════════════════════════

/** Renglón de cobro_items como lo lee generar_cfdi.php (con productos.categoria). */
function renglon(string $nombre, int $cant, float $precio, string $tasa, string $categoria = 'otro', ?string $unidad = 'E48'): array
{
    return [
        'nombre' => $nombre, 'cantidad' => $cant, 'precio_unitario' => $precio,
        'subtotal' => round($cant * $precio, 2), 'iva_tasa' => $tasa,
        'clave_sat' => '86101800', 'clave_unidad' => $unidad, 'categoria' => $categoria,
    ];
}

function beca(array $extra = []): array
{
    return array_merge([
        'id' => 1, 'nombre' => 'Hermanos', 'tipo' => 'porcentaje', 'valor' => 30, 'alcance' => 'categorias',
        'alcance_ids' => '["colegiatura"]', 'vigente_desde' => null, 'vigente_hasta' => null, 'activo' => 1,
    ], $extra);
}
$CONCEPTO_COLEGIATURA = ['id' => 5, 'categoria' => 'colegiatura'];

// ════════════════════════════════════════════════════════════════════════
// lib/helpers_impuestos.php — cfdi_armar_renglones
// ════════════════════════════════════════════════════════════════════════

prueba('impuestos: un solo concepto exento (colegiatura)', function () {
    $r = cfdi_armar_renglones([renglon('Colegiatura', 1, 1000, 'exento', 'colegiatura')], 1000.0);
    afirmar($r['ok'], 'debería armarse');
    igual(1, count($r['items']));
    igual('Exento', $r['items'][0]['product']['taxes'][0]['factor']);
    cerca(1000, $r['subtotal']); cerca(0, $r['iva']); cerca(1000, $r['total']);
    igual(0, $r['desviacion_centavos']);
    igual(1, count($r['desglose']));
    igual('exento', $r['desglose'][0]['tasa']);
    cerca(1000, $r['desglose'][0]['base']); cerca(0, $r['desglose'][0]['iva']); cerca(1000, $r['desglose'][0]['total']);
});

prueba('impuestos: mixto exento + 16% (colegiatura y uniforme)', function () {
    $r = cfdi_armar_renglones([
        renglon('Colegiatura', 1, 1000, 'exento', 'colegiatura'),
        renglon('Uniforme', 1, 116, '16', 'uniforme', 'H87'),
    ], 1116.0);
    afirmar($r['ok']);
    cerca(1100, $r['subtotal'], 'subtotal'); cerca(16, $r['iva'], 'iva'); cerca(1116, $r['total'], 'total');
    igual(2, count($r['desglose']));
    cerca(100, $r['items'][1]['product']['price'], 'el 16% va en precio NETO');
    igual(false, $r['items'][1]['product']['tax_included']);
    igual('Pieza', $r['items'][1]['product']['unit_name']);
});

prueba('impuestos: tasa 0 no lleva IVA', function () {
    $r = cfdi_armar_renglones([renglon('Libro', 1, 250, '0')], 250.0);
    afirmar($r['ok']);
    cerca(0, $r['iva']); cerca(250, $r['total']);
    igual(0, $r['items'][0]['product']['taxes'][0]['rate']);
    igual('Tasa', $r['items'][0]['product']['taxes'][0]['factor']);
});

prueba('impuestos: mixto exento/0/16 en un mismo cobro', function () {
    $r = cfdi_armar_renglones([
        renglon('Colegiatura', 1, 1500, 'exento', 'colegiatura'),
        renglon('Libro', 1, 200, '0'),
        renglon('Uniforme', 2, 232, '16', 'uniforme'),
    ], 2164.0);
    afirmar($r['ok']);
    igual(3, count($r['desglose']));
    cerca(2164, $r['total'], 'total');
    cerca(64, $r['iva'], 'iva solo del 16% (464/1.16=400 -> 64)');
    cerca(2100, $r['subtotal'], 'subtotal');
    igual(2, $r['items'][2]['quantity']);
    cerca(200, $r['items'][2]['product']['price'], 'precio neto unitario del 16%');
});

prueba('impuestos: beca de una colegiatura exenta NO rebaja la base del uniforme al 16% (OF-3)', function () {
    $r = cfdi_armar_renglones([
        renglon('Colegiatura', 1, 1000, 'exento', 'colegiatura'),
        renglon('Uniforme', 1, 116, '16', 'uniforme'),
        renglon('Beca: Hermanos (20%)', 1, -200, 'exento', 'beca'),
    ], 916.0);
    afirmar($r['ok'], 'debería armarse: ' . ($r['motivo'] ?? ''));
    cerca(200, $r['items'][0]['discount'], 'el descuento cae en la colegiatura');
    afirmar(!isset($r['items'][1]['discount']), 'el uniforme no debe llevar descuento');
    cerca(200, $r['descuento']);
    cerca(916, $r['total']);
    $exento = array_values(array_filter($r['desglose'], fn($g) => $g['tasa'] === 'exento'))[0];
    cerca(800, $exento['base'], 'base exenta ya con la beca');
});

prueba('impuestos: recargo por mora va como renglón positivo y suma al desglose', function () {
    $r = cfdi_armar_renglones([
        renglon('Colegiatura', 1, 1000, 'exento', 'colegiatura'),
        renglon('Recargo por mora', 1, 50, 'exento', 'recargo'),
    ], 1050.0);
    afirmar($r['ok']);
    igual(2, count($r['items']));
    cerca(1050, $r['desglose'][0]['total']);
});

prueba('impuestos: residuo del redondeo del descuento va al renglón MAYOR', function () {
    // Beca de $10 al 16% repartida entre $100 y $200: 333c + 666c = 999c, sobra 1c,
    // que va al de $200 (333 / 667). Netos: 333/1.16 -> 2.87 y 667/1.16 -> 5.75.
    // Si el residuo fuera al menor saldría 288 y 574.
    $r = cfdi_armar_renglones([
        renglon('Uniforme A', 1, 100, '16', 'uniforme'),
        renglon('Uniforme B', 1, 200, '16', 'uniforme'),
        renglon('Beca: Promo', 1, -10, '16', 'beca'),
    ], 290.0);
    afirmar($r['ok'], 'debería armarse: ' . ($r['motivo'] ?? ''));
    cerca(2.87, $r['items'][0]['discount'], 'descuento renglón menor');
    cerca(5.75, $r['items'][1]['discount'], 'descuento renglón mayor (lleva el residuo)');
    cerca(10, $r['descuento']);
    // El total armado difiere del cobro a lo sumo 1 centavo (nunca de más) y se informa.
    $dif = (int) round($r['total'] * 100) - 29000;
    igual($dif, $r['desviacion_centavos'], 'desviación informada');
    afirmar($dif <= 0 && $dif >= -1, 'desviación fuera de rango: ' . $dif);
});

prueba('impuestos: 1 de cada 7 importes al 16% queda 1 centavo por DEBAJO y se informa', function () {
    $con_desviacion = 0; $total = 0;
    for ($bruto = 100; $bruto <= 50000; $bruto++) {
        $r = impuestos_base_de_bruto16($bruto);
        afirmar($r !== null, "bruto $bruto sin base");
        [$base, $dev] = $r;
        igual($dev, $base + impuestos_iva16_de_base($base) - $bruto, "desviación de $bruto");
        afirmar($dev === 0 || $dev === -1, "desviación $dev para $bruto (nunca de más, máx. 1 centavo)");
        $total++; if ($dev === -1) $con_desviacion++;
    }
    $p = $con_desviacion / $total;
    afirmar($p > 0.10 && $p < 0.20, 'la proporción con desviación debería ser ~1/7, salió ' . round($p, 4));
});

prueba('impuestos: cobro de importe sin base exacta (p. ej. $0.58 total) informa desviación', function () {
    // Se busca el primer importe de la zona de $100 que tiene desviación -1.
    $bruto = null;
    for ($b = 10000; $b < 10100; $b++) { if (impuestos_base_de_bruto16($b)[1] === -1) { $bruto = $b; break; } }
    afirmar($bruto !== null);
    $r = cfdi_armar_renglones([renglon('Uniforme', 1, $bruto / 100, '16', 'uniforme')], $bruto / 100);
    afirmar($r['ok'], 'debería armarse: ' . ($r['motivo'] ?? ''));
    igual(-1, $r['desviacion_centavos']);
    cerca($bruto / 100 - 0.01, $r['total'], 'el CFDI queda 1 centavo por debajo');
});

prueba('impuestos: base_de_bruto16 casos borde', function () {
    igual([10000, 0], impuestos_base_de_bruto16(11600));
    igual([100, 0], impuestos_base_de_bruto16(116));
    igual(null, impuestos_base_de_bruto16(0), 'bruto 0');
    igual(null, impuestos_base_de_bruto16(-50), 'bruto negativo');
});

prueba('impuestos: cobros que NO se pueden armar caen al renglón único (ok=false con motivo)', function () {
    $casos = [
        'sin items'                => [[], 100.0, 'sin cobro_items'],
        'sin snapshot de tasa'     => [[['nombre' => 'x', 'cantidad' => 1, 'precio_unitario' => 100, 'subtotal' => 100, 'iva_tasa' => null, 'clave_sat' => '86101800', 'clave_unidad' => 'E48']], 100.0, 'sin snapshot'],
        'sin clave SAT'            => [[['nombre' => 'x', 'cantidad' => 1, 'precio_unitario' => 100, 'subtotal' => 100, 'iva_tasa' => '16', 'clave_sat' => '', 'clave_unidad' => 'E48']], 100.0, 'sin snapshot'],
        'la suma no es el total'   => [[renglon('A', 1, 100, 'exento')], 150.0, 'no coincide con el total'],
        'precio x cantidad'        => [[['nombre' => 'x', 'cantidad' => 2, 'precio_unitario' => 100, 'subtotal' => 150, 'iva_tasa' => '16', 'clave_sat' => '86101800', 'clave_unidad' => 'E48']], 150.0, 'no coincide con subtotal'],
        'beca con precio positivo' => [[renglon('Beca X', 1, 50, 'exento', 'beca')], 50.0, 'beca con precio positivo'],
        'solo descuentos'          => [[renglon('Beca X', 1, -50, 'exento', 'beca')], -50.0, 'sin renglones de precio positivo'],
        'descuento >= positivos'   => [[renglon('A', 1, 100, 'exento'), renglon('Beca', 1, -100, 'exento', 'beca')], 0.0, 'descuentos igualan'],
    ];
    foreach ($casos as $nombre => [$items, $total, $motivo]) {
        $r = cfdi_armar_renglones($items, $total);
        igual(false, $r['ok'], $nombre);
        afirmar(stripos($r['motivo'], $motivo) !== false, "$nombre: motivo '{$r['motivo']}' no contiene '$motivo'");
    }
});

prueba('impuestos: IEDU solo en conceptos educativos', function () {
    $iedu = ['type' => 'iedu', 'student_name' => 'Ana'];
    $r = cfdi_armar_renglones([
        renglon('Colegiatura', 1, 1000, 'exento', 'colegiatura'),
        renglon('Uniforme', 1, 116, '16', 'uniforme'),
    ], 1116.0, $iedu);
    afirmar($r['ok']);
    igual($iedu, $r['items'][0]['complement']);
    afirmar(!isset($r['items'][1]['complement']), 'el uniforme no lleva IEDU');
    igual(1, $r['iedu_renglones']);
});

prueba('impuestos: renglón de $0 no se factura; los demás sí', function () {
    $r = cfdi_armar_renglones([renglon('Cortesía', 1, 0, 'exento'), renglon('Colegiatura', 1, 500, 'exento', 'colegiatura')], 500.0);
    afirmar($r['ok']);
    igual(1, count($r['items']));
});

// ── cfdi_impuestos_pago / helpers menores ───────────────────────────────

prueba('impuestos: cfdi_impuestos_pago sin desglose = un renglón al 16% (comportamiento de siempre)', function () {
    $t = cfdi_impuestos_pago(null, 116.0, 116.0);
    igual(1, count($t));
    cerca(0.16, $t[0]['rate']); cerca(100, $t[0]['base']);
    $t = cfdi_impuestos_pago([['tasa' => 'exento', 'total' => 100]], 50.0, 0.0);
    cerca(0.16, $t[0]['rate'], 'total_factura <= 0 cae al 16%');
});

prueba('impuestos: cfdi_impuestos_pago reparte el abono entre exento y 16% en proporción', function () {
    $d = [['tasa' => 'exento', 'total' => 1000.0], ['tasa' => '16', 'total' => 116.0]];
    $t = cfdi_impuestos_pago($d, 558.0, 1116.0);   // la mitad de la factura
    igual(2, count($t));
    igual('Exento', $t[0]['factor']); cerca(500, $t[0]['base']);
    cerca(0.16, $t[1]['rate']);       cerca(50, $t[1]['base'], 'base del 16% = 58 / 1.16');
});

prueba('impuestos: cfdi_impuestos_pago el residuo de centavos no se pierde', function () {
    $d = [['tasa' => 'exento', 'total' => 100.0], ['tasa' => '0', 'total' => 100.0], ['tasa' => 'exento', 'total' => 100.0]];
    $t = cfdi_impuestos_pago($d, 100.0, 300.0);
    $suma = 0.0; foreach ($t as $x) $suma += $x['base'];
    cerca(100.0, $suma, 'las bases deben sumar el abono completo', 0.0001);
    cerca(33.34, $t[0]['base'], 'el residuo va al primer grupo mayor');
});

prueba('impuestos: cfdi_impuestos_pago con abono 0 no truena', function () {
    $t = cfdi_impuestos_pago([['tasa' => 'exento', 'total' => 100.0]], 0.0, 100.0);
    igual(1, count($t));
});

prueba('impuestos: normalizar tasa y validar formulario', function () {
    igual('16', impuestos_normalizar_tasa(16));
    igual('16', impuestos_normalizar_tasa('16%'));
    igual('0', impuestos_normalizar_tasa(0));
    igual('exento', impuestos_normalizar_tasa(' EXENTO '));
    igual(null, impuestos_normalizar_tasa('8'));
    igual(null, impuestos_normalizar_tasa(null));
    $ok = impuestos_validar_input(['iva_tasa' => '16%', 'clave_sat' => '86101800', 'clave_unidad' => 'h87']);
    igual(['iva_tasa' => '16', 'clave_sat' => '86101800', 'clave_unidad' => 'H87'], $ok['campos']);
    igual(false, impuestos_validar_input(['clave_sat' => '1234'])['ok'], 'clave SAT corta');
    igual(false, impuestos_validar_input(['clave_unidad' => 'ABCD'])['ok'], 'unidad larga');
    igual([], impuestos_validar_input([])['campos'], 'sin campos = no toca nada');
});

prueba('impuestos: sugerencia por categoría y desglose guardado', function () {
    igual('exento', impuestos_sugerencia_categoria('Colegiatura')['iva_tasa']);
    igual('16', impuestos_sugerencia_categoria('uniforme')['iva_tasa']);
    igual('H87', impuestos_sugerencia_categoria('uniforme')['clave_unidad']);
    igual('16', impuestos_sugerencia_categoria('papeleria')['iva_tasa']);
    igual(null, cfdi_desglose_decodificar(''));
    igual(null, cfdi_desglose_decodificar('{no es json'));
    igual(null, cfdi_desglose_decodificar('[{"tasa":"16"}]'), 'falta total');
    igual([['tasa' => '16', 'total' => 116]], cfdi_desglose_decodificar('[{"tasa":"16","total":116}]'));
});

// ════════════════════════════════════════════════════════════════════════
// lib/helpers_becas.php — cálculo del descuento
// ════════════════════════════════════════════════════════════════════════

prueba('becas: 30% de 1000', function () use ($CONCEPTO_COLEGIATURA) {
    $r = becas_calcular_descuento([beca()], $CONCEPTO_COLEGIATURA, 100000, '2026-11-19');
    igual(30000, $r['descuento_c']); igual(70000, $r['final_c']); igual(3000, $r['porcentaje_bp']);
    igual(1, count($r['detalle']));
    igual('Beca: Hermanos (30%)', $r['detalle'][0]['etiqueta']);
});

prueba('becas: porcentajes se SUMAN y se topan en 100%', function () use ($CONCEPTO_COLEGIATURA) {
    $r = becas_calcular_descuento([beca(['id' => 1, 'valor' => 60]), beca(['id' => 2, 'valor' => 50])], $CONCEPTO_COLEGIATURA, 100000, '2026-11-19');
    igual(100000, $r['descuento_c']); igual(0, $r['final_c']); igual(10000, $r['porcentaje_bp']);
    igual(100000, array_sum(array_column($r['detalle'], 'monto_c')), 'el detalle suma el descuento');
});

prueba('becas: monto fijo va después de los porcentajes y no pasa del precio', function () use ($CONCEPTO_COLEGIATURA) {
    $r = becas_calcular_descuento([
        beca(['id' => 1, 'valor' => 50]),
        beca(['id' => 2, 'tipo' => 'monto', 'valor' => 100]),
    ], $CONCEPTO_COLEGIATURA, 15000, '2026-11-19');   // $150: 50% = 75, resta 75 -> el monto de 100 solo descuenta 75
    igual(15000, $r['descuento_c']); igual(0, $r['final_c']);
    igual(7500, $r['detalle'][1]['monto_c']);
});

prueba('becas: vigencia, activo y alcance', function () use ($CONCEPTO_COLEGIATURA) {
    $c = $CONCEPTO_COLEGIATURA;
    afirmar(becas_aplica(beca(), $c, '2026-11-19'));
    afirmar(!becas_aplica(beca(['activo' => 0]), $c, '2026-11-19'), 'inactiva');
    afirmar(!becas_aplica(beca(['vigente_desde' => '2026-12-01']), $c, '2026-11-19'), 'aún no empieza');
    afirmar(!becas_aplica(beca(['vigente_hasta' => '2026-11-18']), $c, '2026-11-19'), 'ya terminó');
    afirmar(becas_aplica(beca(['vigente_desde' => '2026-11-19', 'vigente_hasta' => '2026-11-19']), $c, '2026-11-19'), 'ambos extremos incluyen su día');
    afirmar(!becas_aplica(beca(['alcance_ids' => '["transporte"]']), $c, '2026-11-19'), 'otra categoría');
    afirmar(!becas_aplica(beca(['alcance_ids' => '[]']), $c, '2026-11-19'), 'sin alcance no aplica a nada');
    afirmar(becas_aplica(beca(['alcance' => 'productos', 'alcance_ids' => '[5, 9]']), $c, '2026-11-19'), 'por producto');
    afirmar(!becas_aplica(beca(['alcance' => 'productos', 'alcance_ids' => '[9]']), $c, '2026-11-19'), 'otro producto');
    afirmar(becas_aplica(beca(['alcance_ids' => '[" Colegiatura "]']), $c, '2026-11-19'), 'categoría normalizada');
});

prueba('becas: precio 0 o sin becas aplicables no descuenta', function () use ($CONCEPTO_COLEGIATURA) {
    igual(0, becas_calcular_descuento([beca()], $CONCEPTO_COLEGIATURA, 0, '2026-11-19')['descuento_c']);
    $r = becas_calcular_descuento([beca(['activo' => 0])], $CONCEPTO_COLEGIATURA, 5000, '2026-11-19');
    igual(5000, $r['final_c']); igual([], $r['detalle']);
});

prueba('becas: invariantes con 2000 casos aleatorios (semilla fija)', function () use ($CONCEPTO_COLEGIATURA) {
    mt_srand(20261119);
    for ($i = 0; $i < 2000; $i++) {
        $precio = mt_rand(1, 800000);
        $becas = [];
        $n = mt_rand(1, 5);
        for ($k = 1; $k <= $n; $k++) {
            $esPct = mt_rand(0, 1) === 1;
            $becas[] = beca([
                'id' => $k, 'tipo' => $esPct ? 'porcentaje' : 'monto',
                'valor' => $esPct ? mt_rand(1, 10000) / 100 : mt_rand(1, 500000) / 100,
            ]);
        }
        $r = becas_calcular_descuento($becas, $CONCEPTO_COLEGIATURA, $precio, '2026-11-19');
        $ctx = 'precio=' . $precio . ' becas=' . _ver($becas);
        afirmar($r['descuento_c'] >= 0 && $r['descuento_c'] <= $precio, 'descuento fuera de [0, precio] ' . $ctx);
        igual($precio - $r['descuento_c'], $r['final_c'], 'final ' . $ctx);
        igual($r['descuento_c'], array_sum(array_column($r['detalle'], 'monto_c')), 'detalle suma el descuento ' . $ctx);
        afirmar($r['porcentaje_bp'] <= 10000, 'porcentaje > 100% ' . $ctx);
        foreach ($r['detalle'] as $d) afirmar($d['monto_c'] > 0, 'línea de detalle sin monto ' . $ctx);
    }
});

prueba('becas: validar formulario', function () {
    $base = ['nombre' => 'SEP', 'tipo' => 'porcentaje', 'valor' => 50, 'alcance' => 'categorias', 'alcance_ids' => ['Colegiatura', 'colegiatura']];
    $v = becas_validar_input($base);
    afirmar($v['ok']);
    igual(['colegiatura'], $v['datos']['alcance_ids'], 'normaliza y deduplica');
    cerca(50.0, $v['datos']['valor']);
    igual(false, becas_validar_input(array_merge($base, ['nombre' => ' ']))['ok'], 'sin nombre');
    igual(false, becas_validar_input(array_merge($base, ['valor' => 100.01]))['ok'], '% > 100');
    igual(true,  becas_validar_input(array_merge($base, ['valor' => 100]))['ok'], '100% sí');
    igual(false, becas_validar_input(array_merge($base, ['valor' => 0]))['ok'], 'valor 0');
    igual(false, becas_validar_input(array_merge($base, ['valor' => 'abc']))['ok'], 'valor no numérico');
    igual(false, becas_validar_input(array_merge($base, ['tipo' => 'otro']))['ok'], 'tipo inválido');
    igual(false, becas_validar_input(array_merge($base, ['alcance_ids' => []]))['ok'], 'sin alcance');
    igual(false, becas_validar_input(array_merge($base, ['alcance_ids' => ['a;b']]))['ok'], 'categoría con caracteres raros');
    igual(false, becas_validar_input(array_merge($base, ['vigente_desde' => '2026-02-30']))['ok'], 'fecha imposible');
    igual(false, becas_validar_input(array_merge($base, ['vigente_desde' => '2026-05-02', 'vigente_hasta' => '2026-05-01']))['ok'], 'termina antes de empezar');
    igual(false, becas_validar_input(array_merge($base, ['tipo' => 'monto', 'valor' => 100000000]))['ok'], 'monto enorme');
});

prueba('becas: textos y fechas', function () {
    igual('30%', becas_valor_texto(beca()));
    igual('12.5%', becas_valor_texto(beca(['valor' => 12.5])));
    igual('$500.00', becas_valor_texto(beca(['tipo' => 'monto', 'valor' => 500])));
    igual('Beca: Descuento ($1,250.50)', becas_etiqueta(beca(['tipo' => 'monto', 'nombre' => '', 'valor' => 1250.5])));
    igual(100, mb_strlen(becas_etiqueta(beca(['nombre' => str_repeat('x', 200)]))), 'se recorta a 100');
    afirmar(becas_fecha_valida('2028-02-29') && !becas_fecha_valida('2027-02-29') && !becas_fecha_valida('2026-1-1'));
    igual([3, 7], becas_alcance_ids('["3", 7, 7, "x", -2]', 'productos'));
    igual(['colegiatura', 'transporte'], becas_alcance_ids(['Colegiatura ', 'transporte', ''], 'categorias'));
    igual([], becas_alcance_ids('no es json', 'categorias'));
});

// ════════════════════════════════════════════════════════════════════════
// lib/helpers_pagos.php — folio de abono
// ════════════════════════════════════════════════════════════════════════

prueba('pagos: abono_folio_texto', function () {
    igual('COL-0123-03', abono_folio_texto('COL-0123', 3));
    igual('COL-0123-01', abono_folio_texto('COL-0123', 1));
    igual('COL-0123-100', abono_folio_texto('COL-0123', 100), 'del 100 en adelante crece');
    igual('COL-0123-01', abono_folio_texto('COL-0123', 0), 'número 0 o negativo cuenta como 1');
    igual('COL-0123-01', abono_folio_texto('COL-0123', -4));
    igual('COB7-02', abono_folio_texto('', 2, 7), 'sin folio usa COB<id>');
    igual('COB7-02', abono_folio_texto('   ', 2, 7));
    igual('COB0-01', abono_folio_texto(null, 1));
    igual('A-01', abono_folio_texto('  A  ', 1), 'recorta espacios');
    $largo = abono_folio_texto(str_repeat('F', 60), 3);
    igual(40, strlen($largo), 'cabe en VARCHAR(40)');
    afirmar(substr($largo, -3) === '-03', 'se recorta el cobro, nunca el número');
    $largo = abono_folio_texto(str_repeat('F', 60), 123);
    igual(40, strlen($largo)); afirmar(substr($largo, -4) === '-123');
});

// ════════════════════════════════════════════════════════════════════════
// lib/helpers_monedero.php — centavos y validaciones puras
// ════════════════════════════════════════════════════════════════════════

prueba('monedero: monedero_c / monedero_p', function () {
    igual(1010, monedero_c('10.1'));
    igual(30, monedero_c(0.1 + 0.2), '0.1 + 0.2 en float no es 0.3 exacto: en centavos sí');
    igual(0, monedero_c(null)); igual(0, monedero_c('abc')); igual(0, monedero_c(''));
    igual(-550, monedero_c(-5.5));
    igual(1000, array_sum(array_fill(0, 100, monedero_c(0.10))), 'cien monedas de 10c');
    igual(10.05, monedero_p(1005)); igual(0.0, monedero_p(0)); igual(-0.01, monedero_p(-1));
    igual(123.45, monedero_p(monedero_c('123.45')), 'ida y vuelta');
    for ($c = 0; $c <= 100000; $c += 7) igual($c, monedero_c(monedero_p($c)), "ida y vuelta de $c centavos");
});

prueba('monedero: monedero_monto_valido', function () {
    igual(null, monedero_monto_valido(null, 20, 5000));
    igual(null, monedero_monto_valido('', 20, 5000));
    igual(null, monedero_monto_valido('abc', 20, 5000));
    igual(null, monedero_monto_valido(19.99, 20, 5000), 'bajo el mínimo');
    igual(null, monedero_monto_valido(5000.01, 20, 5000), 'sobre el máximo');
    igual(20.0, monedero_monto_valido('20', 20, 5000), 'mínimo inclusive');
    igual(5000.0, monedero_monto_valido(5000, 20, 5000), 'máximo inclusive');
    igual(50.46, monedero_monto_valido('50.456', 20, 5000), 'redondea a 2 decimales');
    igual(null, monedero_monto_valido(-100, 20, 5000));
});

prueba('monedero: monedero_llave_cliente', function () {
    igual('abc12345', monedero_llave_cliente('abc12345'));
    igual('abc12345', monedero_llave_cliente('  abc12345 '), 'recorta espacios');
    igual(null, monedero_llave_cliente('corta'), '7 caracteres');
    igual(null, monedero_llave_cliente('con espacio 123'));
    igual(null, monedero_llave_cliente("abc1234'; DROP"));
    igual(str_repeat('a', 64), monedero_llave_cliente(str_repeat('a', 64)));
    igual(null, monedero_llave_cliente(str_repeat('a', 65)));
    igual(null, monedero_llave_cliente(null));
});

prueba('monedero: monedero_publico no filtra el hash del NIP; etiquetas de método', function () {
    $p = monedero_publico(['saldo' => '12.5', 'limite_diario' => null, 'nip_hash' => '$2y$secreto', 'bloqueado' => '0']);
    igual(['saldo' => 12.5, 'limite_diario' => null, 'tiene_nip' => true, 'bloqueado' => false], $p);
    afirmar(strpos(json_encode($p), 'secreto') === false, 'el hash no debe viajar');
    igual(['saldo' => 0.0, 'limite_diario' => null, 'tiene_nip' => false, 'bloqueado' => false], monedero_publico(null));
    igual(100.0, monedero_publico(['saldo' => 1, 'limite_diario' => '100', 'nip_hash' => null, 'bloqueado' => 1])['limite_diario']);
    igual('tarjeta', monedero_etiqueta_metodo('TC'));
    igual('efectivo en caja', monedero_etiqueta_metodo('Efectivo'));
    igual('otro', monedero_etiqueta_metodo(''));
    igual('SPEI', monedero_etiqueta_metodo('SPEI'));
});

// ════════════════════════════════════════════════════════════════════════
// lib/webhook_helpers.php — webhook_origen_permitido (proceso aparte: usa `static`)
// ════════════════════════════════════════════════════════════════════════

function borrar_carpeta(string $d): void
{
    foreach (glob($d . '/*') ?: [] as $f) { is_dir($f) ? borrar_carpeta($f) : @unlink($f); }
    @rmdir($d);
}

/**
 * Corre webhook_origen_permitido() en un proceso aparte, con config y stub de
 * ip_permitida_pago_sin_token() controlados. El archivo se COPIA a una carpeta
 * temporal /lib para que su bitácora (../ips_webhooks_log.txt) caiga ahí y no
 * ensucie la raíz del proyecto. Devuelve ['pasa' => bool, 'uri' => string].
 */
function origen_webhook(array $o): array
{
    global $RAIZ;
    $dir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'edupago_wh_' . bin2hex(random_bytes(4));
    mkdir($dir . DIRECTORY_SEPARATOR . 'lib', 0777, true);
    copy($RAIZ . '/lib/webhook_helpers.php', $dir . '/lib/webhook_helpers.php');
    $codigo = '';
    if (array_key_exists('secreto_config', $o)) $codigo .= 'define("WEBHOOK_SECRETO_RUTA", ' . var_export($o['secreto_config'], true) . ");\n";
    if (array_key_exists('exigir', $o))         $codigo .= 'define("WEBHOOKS_EXIGIR_SECRETO", ' . var_export($o['exigir'], true) . ");\n";
    $codigo .= 'function ip_permitida_pago_sin_token() { return $GLOBALS["ip_ok"]; }' . "\n";
    $codigo .= '$GLOBALS["ip_ok"] = ' . var_export($o['ip_ok'], true) . ";\n";
    $codigo .= '$_SERVER["REMOTE_ADDR"] = "203.0.113.9";' . "\n";
    if (isset($o['path_info']))      $codigo .= '$_SERVER["PATH_INFO"] = ' . var_export($o['path_info'], true) . ";\n";
    if (isset($o['orig_path_info'])) $codigo .= '$_SERVER["ORIG_PATH_INFO"] = ' . var_export($o['orig_path_info'], true) . ";\n";
    $codigo .= '$_SERVER["REQUEST_URI"] = ' . var_export($o['uri'] ?? '/webhooks/webhook_spei.php', true) . ";\n";
    $codigo .= 'require ' . var_export($dir . '/lib/webhook_helpers.php', true) . ";\n";
    $codigo .= '$r1 = webhook_origen_permitido();' . "\n";
    // Segunda llamada en el MISMO proceso con la IP al revés: demuestra el `static`.
    $codigo .= '$GLOBALS["ip_ok"] = ' . var_export(!$o['ip_ok'], true) . ";\n" . '$r2 = webhook_origen_permitido();' . "\n";
    $codigo .= 'echo json_encode(["pasa" => $r1, "segunda" => $r2, "uri" => $_SERVER["REQUEST_URI"]]);';
    [$salida, $cod] = php_aparte($codigo);
    borrar_carpeta($dir);
    $j = json_decode($salida, true);
    if (!is_array($j)) throw new PruebaFallo('el proceso aparte no devolvió JSON (código ' . $cod . '): ' . $salida);
    return $j;
}

$SECRETO = 'abcdefghijklmnopqrstuvwxyz012345';   // 32 caracteres

prueba('webhook: sin secreto configurado manda la lista de IPs', function () {
    igual(true,  origen_webhook(['ip_ok' => true])['pasa'], 'IP permitida');
    igual(false, origen_webhook(['ip_ok' => false])['pasa'], 'IP no permitida');
});

prueba('webhook: secreto correcto en la ruta pasa aunque la IP no esté permitida', function () use ($SECRETO) {
    igual(true, origen_webhook(['secreto_config' => $SECRETO, 'ip_ok' => false, 'path_info' => '/' . $SECRETO . '/x'])['pasa']);
    igual(true, origen_webhook(['secreto_config' => $SECRETO, 'ip_ok' => false, 'orig_path_info' => '/' . $SECRETO])['pasa'], 'vía ORIG_PATH_INFO');
});

prueba('webhook: secreto incorrecto NO da paso libre; manda la IP (si no se exige)', function () use ($SECRETO) {
    igual(false, origen_webhook(['secreto_config' => $SECRETO, 'ip_ok' => false, 'path_info' => '/' . strrev($SECRETO)])['pasa']);
    igual(true,  origen_webhook(['secreto_config' => $SECRETO, 'ip_ok' => true,  'path_info' => '/' . strrev($SECRETO)])['pasa'], 'IP permitida sigue sirviendo mientras no se exija');
});

prueba('webhook: con WEBHOOKS_EXIGIR_SECRETO = true solo pasa con secreto', function () use ($SECRETO) {
    igual(false, origen_webhook(['secreto_config' => $SECRETO, 'exigir' => true, 'ip_ok' => true])['pasa'], 'sin secreto, aunque la IP sea buena');
    igual(false, origen_webhook(['secreto_config' => $SECRETO, 'exigir' => true, 'ip_ok' => true, 'path_info' => '/incorrecto'])['pasa']);
    igual(true,  origen_webhook(['secreto_config' => $SECRETO, 'exigir' => true, 'ip_ok' => false, 'path_info' => '/' . $SECRETO])['pasa']);
});

prueba('webhook: un secreto configurado corto (<24) se trata como no configurado', function () {
    igual(false, origen_webhook(['secreto_config' => 'corto', 'ip_ok' => false, 'path_info' => '/corto'])['pasa']);
    igual(false, origen_webhook(['secreto_config' => '', 'ip_ok' => false, 'path_info' => '/'])['pasa']);
});

prueba('webhook: el secreto largo se borra de REQUEST_URI (no debe llegar a ninguna bitácora)', function () use ($SECRETO) {
    $r = origen_webhook(['secreto_config' => $SECRETO, 'ip_ok' => true, 'path_info' => '/' . $SECRETO,
        'uri' => '/webhooks/webhook_spei.php/' . $SECRETO . '?a=1']);
    afirmar(strpos($r['uri'], $SECRETO) === false, 'el secreto sigue en REQUEST_URI: ' . $r['uri']);
    afirmar(strpos($r['uri'], '***') !== false);
    // Un "secreto" corto de un curioso no debe tachar letras sueltas de la URL.
    $r = origen_webhook(['ip_ok' => true, 'path_info' => '/web', 'uri' => '/webhooks/webhook_spei.php']);
    igual('/webhooks/webhook_spei.php', $r['uri']);
});

prueba('webhook: el resultado se memoriza por proceso (por eso las pruebas van en procesos aparte)', function () {
    // La segunda llamada del mismo proceso, con la IP al reves, repite la primera respuesta.
    $r = origen_webhook(['ip_ok' => true]);
    igual([true, true], [$r['pasa'], $r['segunda']]);
    $r = origen_webhook(['ip_ok' => false]);
    igual([false, false], [$r['pasa'], $r['segunda']]);
});

// ════════════════════════════════════════════════════════════════════════
// [OF-5] Importar adeudos y saldos iniciales (lib/helpers_importar_saldos.php)
// ════════════════════════════════════════════════════════════════════════

prueba('importar: codificación — UTF-8, UTF-8 con BOM, Windows-1252 y UTF-16', function () {
    [$t, $c] = importar_a_utf8("Matrícula;Monto\nA1;100");
    igual(['Matrícula;Monto' . "\n" . 'A1;100', 'UTF-8'], [$t, $c]);
    [$t, $c] = importar_a_utf8("\xEF\xBB\xBFMatrícula");
    igual(['Matrícula', 'UTF-8'], [$t, $c], 'el BOM se quita');
    // "Matrícula" y "Niño" guardados por Excel en Windows (Windows-1252): í = 0xED, ñ = 0xF1 — no es UTF-8 válido.
    [$t, $c] = importar_a_utf8("Matr\xEDcula Ni\xF1o");
    igual(['Matrícula Niño', 'Windows-1252'], [$t, $c]);
    [$t, $c] = importar_a_utf8("\xFF\xFE" . mb_convert_encoding("Año", 'UTF-16LE', 'UTF-8'));
    igual(['Año', 'UTF-16LE'], [$t, $c]);
});

prueba('importar: separador — coma, punto y coma, tabulador, e ignora lo que está entre comillas', function () {
    igual(',',  importar_detectar_separador("matricula,monto,concepto\nA1,100,Colegiatura"));
    igual(';',  importar_detectar_separador("matricula;monto;concepto\nA1;100,50;Colegiatura"), 'la coma decimal no debe ganar');
    igual("\t", importar_detectar_separador("matricula\tmonto\nA1\t100"));
    igual(',',  importar_detectar_separador("\"a;b;c\",monto\nx,1"), 'los ; entre comillas no cuentan');
    igual(',',  importar_detectar_separador("solo_una_columna\nA1"), 'sin separador: coma');
    igual(';',  importar_detectar_separador("\n\n  \nmatricula;monto"), 'salta líneas en blanco');
});

prueba('importar: CSV — comillas, saltos de línea dentro de una celda, filas en blanco conservadas', function () {
    [$f, $sep, $cod, $exc] = importar_parsear_csv("matricula;concepto;monto\r\nA1;\"Colegiatura; septiembre\";\"1,500.00\"\r\n\r\nA2;\"Uni\nforme\";200\r\n");
    igual(';', $sep); igual(false, $exc);
    igual(['matricula', 'concepto', 'monto'], $f[0]);
    igual(['A1', 'Colegiatura; septiembre', '1,500.00'], $f[1]);
    igual([], $f[2], 'la línea en blanco conserva su lugar');
    igual('Uni Forme', str_replace('Uni forme', 'Uni Forme', $f[3][1]), 'el salto dentro de comillas se vuelve espacio');
});

prueba('importar: encabezados — sin importar mayúsculas, acentos ni signos', function () {
    igual('matricula', importar_normalizar_encabezado('  MATRÍCULA  '));
    igual('fecha de emision', importar_normalizar_encabezado('Fecha_de-Emisión'));
    igual('matricula', importar_campo_de_encabezado('Matrícula'));
    igual('matricula', importar_campo_de_encabezado('NÚMERO DE MATRÍCULA'));
    igual('monto',   importar_campo_de_encabezado('Importe'));
    igual('abonado', importar_campo_de_encabezado('Pagado'));
    igual('vence',   importar_campo_de_encabezado('Fecha de vencimiento'));
    igual('folio',   importar_campo_de_encabezado('Folio externo'));
    igual(null,      importar_campo_de_encabezado('Teléfono'));
    igual(null,      importar_campo_de_encabezado(''));
});

prueba('importar: detectar columnas por nombre (no por posición) y una columna no sirve para dos campos', function () {
    $m = importar_detectar_columnas(['Folio', 'Fecha', 'Concepto', 'MONTO', 'Abonado', 'Matrícula', 'Vence', 'Teléfono']);
    igual(5, $m['matricula']); igual(2, $m['concepto']); igual(3, $m['monto']); igual(4, $m['abonado']);
    igual(1, $m['fecha']); igual(6, $m['vence']); igual(0, $m['folio']); igual(null, $m['alumno']);
    // "Total" gana sobre "Saldo" para el monto; "Saldo" queda sin mapear (el admin lo ajusta a mano).
    $m = importar_detectar_columnas(['Alumno', 'Saldo', 'Total']);
    igual(2, $m['monto']); igual(0, $m['alumno']);
    // El mapeo manual rechaza columnas fuera de rango y repetidas.
    [$mm, $e] = importar_limpiar_mapeo(['matricula' => 0, 'monto' => 9], 3);
    afirmar($e !== null, 'columna inexistente');
    [$mm, $e] = importar_limpiar_mapeo(['matricula' => 1, 'monto' => 1], 3);
    afirmar($e !== null, 'misma columna dos veces');
    [$mm, $e] = importar_limpiar_mapeo(['matricula' => '0', 'monto' => '2', 'abonado' => '', 'fecha' => '-1', 'falso' => 1], 3);
    igual(null, $e); igual([0, 2, null, null], [$mm['matricula'], $mm['monto'], $mm['abonado'], $mm['fecha']]);
});

prueba('importar: montos → centavos (formatos de miles y decimales, y lo que NO es dinero)', function () {
    foreach ([['1500', 150000], ['1500.5', 150050], ['$1,500.00', 150000], ['1,500', 150000], ['1.500', 150000],
              ['1.500,50', 150050], ['1,500.50', 150050], ['1500,50', 150050], ['0.50', 50], ['0,5', 50],
              ['1 500', 150000], ['MXN 2,000.00', 200000], ['12,345,678.90', 1234567890], ['  800 ', 80000], ['100.000', 10000000]] as [$txt, $c]) {
        igual($c, importar_monto_a_centavos($txt), "'$txt'");
    }
    foreach (['', 'abc', '-100', '1,2,3x', '12.3456', '$', '.', '1e5', '(100)'] as $mal) {
        igual(null, importar_monto_a_centavos($mal), "'$mal' no es un monto");
    }
    igual(150000, importar_monto_a_centavos(1500));
    igual(150050, importar_monto_a_centavos(1500.5));
    igual(null, importar_monto_a_centavos(-1.0));
    igual(null, importar_monto_a_centavos(12.345), 'un número de Excel con 3 decimales no se redondea en silencio');
    igual(1999, importar_monto_a_centavos(19.99), 'sin error de coma flotante');
});

prueba('importar: fechas — día primero, ISO, 2 dígitos de año y fecha-hora de XLSX', function () {
    igual('2026-09-05', importar_fecha_iso('05/09/2026'));
    igual('2026-09-05', importar_fecha_iso('5-9-26'));
    igual('2026-09-05', importar_fecha_iso('2026-09-05'));
    igual('2026-09-05', importar_fecha_iso('2026/9/5'));
    igual('2026-09-05', importar_fecha_iso('2026-09-05 00:00:00'));
    igual(null, importar_fecha_iso('31/02/2026'), '31 de febrero');
    igual(null, importar_fecha_iso('13/13/2026'));
    igual(null, importar_fecha_iso('septiembre'));
    igual(null, importar_fecha_iso(''));
});

prueba('importar: pendiente = monto − abonado, y sus casos límite', function () {
    igual([150000, null], importar_pendiente_centavos(150000, 0));
    igual([50000, null], importar_pendiente_centavos(150000, 100000));
    igual([0, null], importar_pendiente_centavos(150000, 150000), 'saldo 0: no es error, se omite');
    igual([0, 'abonado_mayor'], importar_pendiente_centavos(100000, 100001));
});

prueba('importar: huella — estable, sensible a cada dato, insensible a mayúsculas/acentos y a la fecha de "hoy"', function () {
    $h = importar_huella(7, 42, 'Colegiatura Septiembre', 150000, '2026-09-01', 'F-1');
    igual(40, strlen($h));
    igual($h, importar_huella(7, 42, '  colegiatura SEPTIEMBRE ', 150000, '2026-09-01', ' f-1 '), 'mismo renglón escrito distinto');
    afirmar($h !== importar_huella(8, 42, 'Colegiatura Septiembre', 150000, '2026-09-01', 'F-1'), 'otra escuela');
    afirmar($h !== importar_huella(7, 43, 'Colegiatura Septiembre', 150000, '2026-09-01', 'F-1'), 'otro alumno');
    afirmar($h !== importar_huella(7, 42, 'Colegiatura Octubre', 150000, '2026-09-01', 'F-1'), 'otro concepto');
    afirmar($h !== importar_huella(7, 42, 'Colegiatura Septiembre', 150001, '2026-09-01', 'F-1'), 'otro monto');
    afirmar($h !== importar_huella(7, 42, 'Colegiatura Septiembre', 150000, '2026-09-02', 'F-1'), 'otra fecha');
    afirmar($h !== importar_huella(7, 42, 'Colegiatura Septiembre', 150000, '2026-09-01', 'F-2'), 'otro folio');
});

// Tabla de ejemplo: [numero_en_archivo, celdas...] con encabezados Matricula, Alumno, Concepto, Monto, Abonado, Fecha, Vence, Folio
function _of5_tabla(array $filas): array
{
    $t = ['encabezados' => ['Matrícula', 'Alumno', 'Concepto', 'Monto', 'Abonado', 'Fecha', 'Vence', 'Folio'], 'filas' => []];
    foreach ($filas as $i => $celdas) $t['filas'][] = [$i + 2, $celdas];
    return $t;
}
function _of5_plan(array $filas, array $opc = []): array
{
    $alumnos = $opc['alumnos'] ?? [
        ['id' => 1, 'nombre' => 'Ana López Pérez', 'matricula' => '0123', 'activo' => 1],
        ['id' => 2, 'nombre' => 'Beto Ruiz', 'matricula' => 'B-77', 'activo' => 0],
        ['id' => 3, 'nombre' => 'Carla Soto', 'matricula' => '', 'activo' => 1],
        ['id' => 4, 'nombre' => 'Dani Gil', 'matricula' => 'X1', 'activo' => 1],
        ['id' => 5, 'nombre' => 'Dani Gil', 'matricula' => 'X2', 'activo' => 1],
    ];
    $productos = $opc['productos'] ?? [
        ['id' => 10, 'nombre' => 'Colegiatura', 'categoria' => 'colegiatura', 'activo' => 1],
        ['id' => 11, 'nombre' => 'Uniforme deportivo', 'categoria' => 'uniforme', 'activo' => 1],
        ['id' => 12, 'nombre' => 'Inscripción', 'categoria' => 'inscripcion', 'activo' => 0],
    ];
    $tabla = _of5_tabla($filas);
    $mapeo = $opc['mapeo'] ?? importar_detectar_columnas($tabla['encabezados']);
    $ya = $opc['ya'] ?? [];
    return importar_construir_plan($tabla, $mapeo, 7, $alumnos, $productos, $opc['eleccion'] ?? [],
        function (array $hs) use ($ya) { $o = []; foreach ($hs as $h) if (isset($ya[$h])) $o[$h] = true; return $o; }, '2026-11-19');
}

prueba('importar: plan — renglón correcto (por matrícula sin ceros, abonado, fechas) y totales', function () {
    $p = _of5_plan([['123', '', 'Colegiatura septiembre', '1,500.00', '500', '01/09/2026', '10/09/2026', 'F-9']]);
    igual(null, $p['error']);
    $f = $p['filas'][0];
    igual('ok', $f['estado']);
    igual(1, $f['alumno_id'], 'la matrícula 0123 se encontró aunque Excel le quitó el cero');
    igual([150000, 50000, 100000], [$f['monto_original_c'], $f['abonado_c'], $f['pendiente_c']]);
    igual(['2026-09-01', '2026-09-10', 'F-9'], [$f['fecha_emision'], $f['vence'], $f['folio_externo']]);
    igual(1, $p['totales']['a_importar']); igual(100000, $p['totales']['monto_c']); igual(50000, $p['totales']['abonado_c']);
});

prueba('importar: plan — alumno por nombre, inactivo con advertencia, y alumno no encontrado', function () {
    $p = _of5_plan([
        ['', 'Carla Soto', 'Colegiatura', '800', '', '', '', ''],
        ['B-77', '', 'Colegiatura', '800', '', '', '', ''],
        ['ZZZ', '', 'Colegiatura', '800', '', '', '', ''],
        ['', 'Dani Gil', 'Colegiatura', '800', '', '', '', ''],
        ['', '', 'Colegiatura', '800', '', '', '', ''],
        ['0123', 'Otra Persona', 'Colegiatura', '800', '', '', '', ''],
        ['NOEXISTE', 'carla  SOTO', 'Colegiatura', '801', '', '', '', ''],
    ]);
    $f = $p['filas'];
    igual(['ok', 3], [$f[0]['estado'], $f[0]['alumno_id']]);
    igual('ok', $f[1]['estado']); igual(false, $f[1]['alumno_activo']);
    afirmar(strpos(implode(' ', $f[1]['advertencias']), 'inactivo') !== false, 'advertencia de inactivo');
    igual('error', $f[2]['estado']);
    afirmar(strpos($f[2]['errores'][0], 'no encontrado') !== false);
    igual('error', $f[3]['estado'], 'dos alumnos con el mismo nombre: ambiguo');
    igual('error', $f[4]['estado'], 'sin matrícula ni nombre');
    igual('ok', $f[5]['estado']); afirmar($f[5]['advertencias'] !== [], 'el nombre del archivo no coincide con el de la matrícula');
    igual(['ok', 3], [$f[6]['estado'], $f[6]['alumno_id']], 'matrícula inexistente: se ubica por nombre y avisa');
    afirmar($f[6]['advertencias'] !== []);
});

prueba('importar: plan — montos inválidos, abonado mayor, saldo 0 y renglones en blanco', function () {
    $p = _of5_plan([
        ['0123', '', 'A', 'mucho', '', '', '', ''],
        ['0123', '', 'B', '', '', '', '', ''],
        ['0123', '', 'C', '-50', '', '', '', ''],
        ['0123', '', 'D', '100', '150', '', '', ''],
        ['0123', '', 'E', '100', '100', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['0123', '', 'F', '100', 'x', '', '', ''],
        ['0123', '', 'G', '100', '', '31/02/2026', '', ''],
        ['0123', '', 'H', '100', '', '', 'no-fecha', ''],
    ]);
    $e = array_column($p['filas'], 'estado');
    igual(['error', 'error', 'error', 'error', 'omitida', 'error', 'error', 'ok'], $e, 'el renglón en blanco ni aparece');
    igual('saldo_cero', $p['filas'][4]['motivo']);
    igual(1, $p['totales']['saldo_cero']); igual(6, $p['totales']['errores']); igual(1, $p['totales']['a_importar']);
    igual(null, $p['filas'][7]['vence'], 'un vencimiento ilegible solo avisa');
    afirmar($p['filas'][7]['advertencias'] !== []);
});

prueba('importar: plan — repetidos del mismo archivo y "ya importado" por huella; el default de fecha no cambia la huella', function () {
    $fila = ['0123', '', 'Colegiatura', '1500', '', '', '', ''];
    $p = _of5_plan([$fila, $fila, ['0123', '', 'Colegiatura', '1500', '', '', '', 'F-2']]);
    igual(['ok', 'omitida', 'ok'], array_column($p['filas'], 'estado'));
    igual('repetida', $p['filas'][1]['motivo']); igual(2, $p['filas'][1]['duplicada_de'], 'apunta al renglón del archivo');
    igual(1, $p['totales']['repetidas']);
    // Con folio distinto ya no es repetido.
    // Ya importado: se simula con la huella del primer renglón.
    $h = $p['filas'][0]['huella'];
    $p2 = _of5_plan([$fila, ['0123', '', 'Otro', '10', '', '', '', '']], ['ya' => [$h => true]]);
    igual(['omitida', 'ok'], array_column($p2['filas'], 'estado'));
    igual('ya_importada', $p2['filas'][0]['motivo']); igual(1, $p2['totales']['ya_importadas']);
    // Subir el mismo archivo "mañana" (sin columna fecha) da la MISMA huella.
    $p3 = importar_construir_plan(_of5_tabla([$fila]), importar_detectar_columnas(_of5_tabla([])['encabezados']), 7,
        [['id' => 1, 'nombre' => 'Ana', 'matricula' => '0123', 'activo' => 1]], [], [], function () { return []; }, '2026-11-20');
    igual($h, $p3['filas'][0]['huella']);
});

prueba('importar: plan — faltan columnas obligatorias', function () {
    $t = ['encabezados' => ['Concepto', 'Algo'], 'filas' => [[2, ['x', 'y']]]];
    $p = importar_construir_plan($t, importar_detectar_columnas($t['encabezados']), 7, [], [], [], function () { return []; }, '2026-11-19');
    afirmar($p['error'] !== null); igual(['matricula', 'monto'], $p['columnas_faltantes']); igual([], $p['filas']);
});

prueba('importar: sugerencia de producto — nombre, parecido, categoría, activos y sin coincidencia', function () {
    $prods = [
        ['id' => 10, 'nombre' => 'Colegiatura', 'categoria' => 'colegiatura', 'activo' => 1],
        ['id' => 11, 'nombre' => 'Uniforme deportivo', 'categoria' => 'uniforme', 'activo' => 1],
        ['id' => 12, 'nombre' => 'Inscripción', 'categoria' => 'inscripcion', 'activo' => 0],
        ['id' => 13, 'nombre' => 'Material escolar', 'categoria' => 'material', 'activo' => 1],
    ];
    igual(10, importar_sugerir_producto('COLEGIATURA', $prods)['producto_id']);
    igual('mismo nombre', importar_sugerir_producto('colegiatura', $prods)['motivo']);
    igual(10, importar_sugerir_producto('Colegiatura septiembre 2026', $prods)['producto_id']);
    igual(11, importar_sugerir_producto('Uniforme', $prods)['producto_id']);
    igual(13, importar_sugerir_producto('Materiales', $prods)['producto_id'] ?? 13, 'palabra distinta no debe romper');
    igual(null, importar_sugerir_producto('Inscripción 2026', $prods), 'un concepto dado de baja no se sugiere');
    igual(null, importar_sugerir_producto('Excursión al museo', $prods));
    igual(null, importar_sugerir_producto('Saldo inicial', $prods), 'el concepto genérico no se liga solo');
    igual(null, importar_sugerir_producto('', $prods));
    // Por categoría con varios candidatos: avisa que revise.
    $dos = [['id' => 1, 'nombre' => 'Colegiatura Primaria', 'categoria' => 'colegiatura', 'activo' => 1],
            ['id' => 2, 'nombre' => 'Colegiatura Secundaria', 'categoria' => 'colegiatura', 'activo' => 1]];
    $s = importar_sugerir_producto('Pago de colegiatura sep', $dos);
    igual(1, $s['producto_id']); afirmar(strpos($s['motivo'], 'revisa') !== false, $s['motivo']);
});

prueba('importar: plan — conceptos distintos, sugerencia y elección (solo productos de la escuela; 0 = sin ligar)', function () {
    $filas = [
        ['0123', '', 'Colegiatura septiembre', '1000', '', '', '', ''],
        ['B-77', '', 'colegiatura  SEPTIEMBRE', '1000', '', '', '', ''],
        ['X1', '', 'Excursión', '300', '', '', '', ''],
    ];
    $p = _of5_plan($filas);
    igual(2, count($p['conceptos']));
    igual(2, $p['conceptos'][0]['filas']); igual(200000, $p['conceptos'][0]['monto_c']);
    igual(10, $p['conceptos'][0]['sugerencia']['producto_id']);
    igual(null, $p['conceptos'][0]['producto_id'], 'sin elección explícita no se liga solo');
    $clave = $p['conceptos'][0]['clave'];
    $p = _of5_plan($filas, ['eleccion' => [$clave => 10, 'excursion' => 999]]);
    igual([10, 10, null], array_column($p['filas'], 'producto_id'), 'el producto 999 no es de la escuela: se ignora');
    $p = _of5_plan($filas, ['eleccion' => [$clave => 0]]);
    igual([null, null, null], array_column($p['filas'], 'producto_id'));
});

prueba('importar: nota del cobro importado', function () {
    igual('Saldo inicial importado (original $1,500.00, abonado $500.00)', importar_nota_saldo_inicial(150000, 50000));
});

prueba('importar: archivo CSV completo (Windows-1252, punto y coma) hasta el plan', function () {
    $csv = "Matr\xEDcula;Concepto;Monto;Abonado;Fecha\r\n0123;Colegiatura;\"1,500.00\";500;01/09/2026\r\nB-77;Uniforme;800;;\r\n";
    $tmp = tempnam(sys_get_temp_dir(), 'of5');
    file_put_contents($tmp, $csv);
    $r = importar_leer_archivo($tmp, 'saldos.csv');
    unlink($tmp);
    igual(true, $r['ok'], (string) $r['error']);
    igual([';', 'Windows-1252', 'csv'], [$r['separador'], $r['codificacion'], $r['formato']]);
    igual('Matrícula', $r['tabla']['encabezados'][0]);
    igual(2, count($r['tabla']['filas'])); igual(2, $r['tabla']['filas'][0][0], 'el número de fila es el del archivo');
    $m = importar_detectar_columnas($r['tabla']['encabezados']);
    igual([0, 1, 2, 3, 4], [$m['matricula'], $m['concepto'], $m['monto'], $m['abonado'], $m['fecha']]);
});

prueba('importar: archivo — extensión, firma y límites', function () {
    $tmp = tempnam(sys_get_temp_dir(), 'of5');
    file_put_contents($tmp, "a,b\n1,2\n");
    $r = importar_leer_archivo($tmp, 'x.pdf'); igual(false, $r['ok']);
    $r = importar_leer_archivo($tmp, 'x.xls'); igual(false, $r['ok']); afirmar(strpos($r['error'], '.xlsx') !== false);
    $r = importar_leer_archivo($tmp, 'x.xlsx'); igual(false, $r['ok'], 'un CSV renombrado a xlsx no pasa');
    file_put_contents($tmp, "\x00\x01\x02binario");
    $r = importar_leer_archivo($tmp, 'x.csv'); igual(false, $r['ok'], 'binario con extensión csv');
    file_put_contents($tmp, '');
    $r = importar_leer_archivo($tmp, 'x.csv'); igual(false, $r['ok']);
    file_put_contents($tmp, "matricula,monto\n" . str_repeat("A,1\n", IMPORTAR_MAX_FILAS + 1));
    $r = importar_leer_archivo($tmp, 'x.csv'); igual(false, $r['ok'], 'más de 5,000 renglones'); afirmar(strpos($r['error'], '5,000') !== false);
    file_put_contents($tmp, "matricula,monto\n" . str_repeat("A,1\n", IMPORTAR_MAX_FILAS));
    $r = importar_leer_archivo($tmp, 'x.csv'); igual(true, $r['ok'], 'exactamente 5,000 renglones sí');
    file_put_contents($tmp, "\n\n,,\n");
    $r = importar_leer_archivo($tmp, 'x.csv'); igual(false, $r['ok'], 'sin datos');
    unlink($tmp);
});

prueba('importar: XLSX mínimo (solo si PHP trae zip): celdas vacías, texto compartido, fecha y número', function () {
    if (!importar_puede_xlsx()) return; // sin ZipArchive el servidor responde "guárdalo como CSV": ya lo prueba la de arriba
    $tmp = tempnam(sys_get_temp_dir(), 'of5') . '.xlsx';
    $z = new ZipArchive();
    $z->open($tmp, ZipArchive::CREATE);
    $z->addFromString('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
    $z->addFromString('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Datos" sheetId="1" r:id="rId1"/></sheets></workbook>');
    $z->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
    $z->addFromString('xl/sharedStrings.xml', '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Matrícula</t></si><si><t>Monto</t></si><si><t>Fecha</t></si><si><t>Colegiatura</t></si></sst>');
    $z->addFromString('xl/styles.xml', '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>');
    // Fila 1 encabezados; fila 3 (la 2 en blanco); la celda B3 vacía (Excel la omite); fecha serie 46266 = 2026-09-01.
    $z->addFromString('xl/worksheets/sheet1.xml', '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
        . '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>'
        . '<row r="3"><c r="A3"><v>20240001</v></c><c r="C3" s="1"><v>46266</v></c><c r="D3" t="s"><v>3</v></c></row>'
        . '<row r="4"><c r="A4" t="inlineStr"><is><t>B-77</t></is></c><c r="B4"><v>1500.5</v></c></row>'
        . '</sheetData></worksheet>');
    $z->close();
    $r = importar_leer_archivo($tmp, 'x.xlsx');
    unlink($tmp);
    igual(true, $r['ok'], (string) $r['error']);
    igual(['Matrícula', 'Monto', 'Fecha', 'Colegiatura'], $r['tabla']['encabezados']);
    igual(3, count($r['tabla']['filas']), 'la fila 2 en blanco conserva su lugar');
    igual([2, []], $r['tabla']['filas'][0]);
    igual(3, $r['tabla']['filas'][1][0], 'número de fila del archivo');
    igual('20240001', importar_celda_texto($r['tabla']['filas'][1][1][0]));
    igual('2026-09-01', importar_fecha_iso($r['tabla']['filas'][1][1][2]));
    igual(150050, importar_monto_a_centavos($r['tabla']['filas'][2][1][1]));
});

// ════════════════════════════════════════════════════════════════════════
// [OF-6] Inventario con existencias (lib/helpers_inventario.php) — funciones puras
// ════════════════════════════════════════════════════════════════════════

prueba('inventario: cantidad de entrada válida (entero positivo, con tope)', function () {
    igual(5, inventario_cantidad_valida(5));
    igual(5, inventario_cantidad_valida('5'));
    igual(12, inventario_cantidad_valida(' 12 '));
    igual(null, inventario_cantidad_valida(0), 'cero no es una entrada');
    igual(null, inventario_cantidad_valida(-3));
    igual(null, inventario_cantidad_valida('2.5'), 'sin decimales: son piezas');
    igual(null, inventario_cantidad_valida('abc'));
    igual(null, inventario_cantidad_valida(null));
    igual(null, inventario_cantidad_valida(INVENTARIO_CANTIDAD_MAX + 1));
    igual(INVENTARIO_CANTIDAD_MAX, inventario_cantidad_valida(INVENTARIO_CANTIDAD_MAX));
});

prueba('inventario: lo contado admite cero pero no negativos ni vacíos', function () {
    igual(0, inventario_contado_valido(0));
    igual(0, inventario_contado_valido('0'));
    igual(37, inventario_contado_valido('37'));
    igual(null, inventario_contado_valido(''), 'vacío = no se contó');
    igual(null, inventario_contado_valido(null));
    igual(null, inventario_contado_valido(-1));
    igual(null, inventario_contado_valido('1.5'));
    igual(null, inventario_contado_valido(INVENTARIO_CONTADO_MAX + 1));
});

prueba('inventario: el ajuste lleva signo y no puede ser cero', function () {
    igual(3, inventario_ajuste_valido(3));
    igual(-2, inventario_ajuste_valido('-2'));
    igual(null, inventario_ajuste_valido(0));
    igual(null, inventario_ajuste_valido('x'));
    igual(null, inventario_ajuste_valido(INVENTARIO_CANTIDAD_MAX + 1));
    igual(-INVENTARIO_CANTIDAD_MAX, inventario_ajuste_valido(-INVENTARIO_CANTIDAD_MAX));
});

prueba('inventario: costo unitario opcional, en centavos', function () {
    igual([true, null], inventario_costo_valido(null));
    igual([true, null], inventario_costo_valido(''));
    igual([true, 12050], inventario_costo_valido('120.50'));
    igual([true, 12050], inventario_costo_valido(120.5));
    igual([true, 0], inventario_costo_valido(0), 'costo cero es un costo (regalo, donación)');
    igual([true, 123456], inventario_costo_valido('1,234.56'));
    igual([false, null], inventario_costo_valido(-1));
    igual([false, null], inventario_costo_valido('mucho'));
    igual([false, null], inventario_costo_valido(1000000));
    igual([true, 1999], inventario_costo_valido('19.99'), 'sin error de float');
});

prueba('inventario: cambio de existencia con signo por tipo de movimiento', function () {
    igual(5, inventario_delta('entrada', 5));
    igual(-4, inventario_delta('venta', 4));
    igual(-4, inventario_delta('venta', -4), 'la venta siempre resta aunque llegue con signo');
    igual(3, inventario_delta('devolucion', 3));
    igual(-2, inventario_delta('ajuste', -2));
    igual(7, inventario_delta('ajuste', 7));
    igual(-9, inventario_delta('conteo', -9));
    $lanzo = false;
    try { inventario_delta('regalo', 1); } catch (InventarioError $e) { $lanzo = true; }
    afirmar($lanzo, 'un movimiento desconocido debe lanzar');
});

prueba('inventario: estado agotado / bajo / ok (los negativos cuentan como agotado)', function () {
    igual('agotado', inventario_estado(0, 5));
    igual('agotado', inventario_estado(-3, 0), 'negativo = agotado');
    igual('agotado', inventario_estado(0, 0));
    igual('bajo', inventario_estado(5, 5), 'igual al mínimo ya es poco');
    igual('bajo', inventario_estado(2, 5));
    igual('ok', inventario_estado(6, 5));
    igual('ok', inventario_estado(1, 0), 'sin mínimo (0) no avisa de poco');
});

prueba('inventario: el carrito de Caja se junta por producto', function () {
    igual([10 => 3, 11 => 1], inventario_agrupar_carrito([
        ['id' => 10, 'qty' => 2, 'nombre' => 'Playera T8'], ['id' => 11, 'qty' => 1], ['id' => 10, 'qty' => 1],
    ]));
    igual([], inventario_agrupar_carrito([['id' => 0, 'qty' => 2], ['id' => 5, 'qty' => 0], ['qty' => 3], 'basura']), 'renglones sin id o sin piezas se ignoran');
    igual([7 => 1], inventario_agrupar_carrito([['id' => '7']]), 'sin qty cuenta como una pieza (igual que crear_cobro)');
    igual([], inventario_agrupar_carrito(null));
    igual([], inventario_agrupar_carrito([['id' => 3, 'qty' => -2]]), 'cantidades negativas no suman piezas');
});

prueba('inventario: qué conceptos pueden manejar existencias', function () {
    igual(null, inventario_concepto_elegible('uniforme', 'unico', 450));
    igual(null, inventario_concepto_elegible('material', 'unico', 0));
    igual(null, inventario_concepto_elegible('otro', 'unico', 20));
    afirmar(inventario_concepto_elegible('colegiatura', 'unico', 1500) !== null, 'la colegiatura nunca');
    afirmar(inventario_concepto_elegible('inscripcion', 'unico', 800) !== null);
    afirmar(inventario_concepto_elegible('beca', 'unico', 100) !== null);
    afirmar(inventario_concepto_elegible('transporte', 'unico', 100) !== null);
    afirmar(inventario_concepto_elegible('uniforme', 'recurrente', 450) !== null, 'un recurrente no maneja existencias');
    afirmar(inventario_concepto_elegible('uniforme', 'unico', -50) !== null, 'un descuento no maneja existencias');
    afirmar(inventario_concepto_elegible('', 'unico', 5) !== null);
});

prueba('inventario: llaves de idempotencia determinísticas y dentro de 80 caracteres', function () {
    igual('venta_cobro:123:45', inventario_idem_documento('venta', 'concepto', 123, 45));
    igual('devol_cobro:123:45', inventario_idem_documento('devolucion', 'concepto', 123, 45));
    igual('venta_tienda:9:3', inventario_idem_documento('venta', 'tienda', 9, 3));
    igual('devol_tienda:9:3', inventario_idem_documento('devolucion', 'tienda', 9, 3));
    $lanzo = false;
    try { inventario_idem_documento('entrada', 'tienda', 1, 1); } catch (InventarioError $e) { $lanzo = true; }
    afirmar($lanzo, 'una entrada no es un movimiento de documento');
    $llave64 = str_repeat('a', 64);
    $k = inventario_idem_lote('entrada', 123456, $llave64, 29);
    afirmar(strlen($k) <= 80, 'cabe en idem_key (80): ' . strlen($k));
    igual($k, inventario_idem_lote('entrada', 123456, $llave64, 29), 'misma entrada, misma llave');
    afirmar($k !== inventario_idem_lote('entrada', 123456, $llave64, 28), 'distinto renglón, distinta llave');
    afirmar($k !== inventario_idem_lote('entrada', 7, $llave64, 29), 'otro colegio, otra llave');
    afirmar(inventario_idem_lote('entrada', 1, 'abcdefgh', 0) !== inventario_idem_lote('conteo', 1, 'abcdefgh', 0), 'otra operación, otra llave');
});

prueba('inventario: el plan de conteo solo trae las diferencias, con signo', function () {
    $plan = inventario_conteo_plan(
        ['concepto:1' => 10, 'concepto:2' => 4, 'tienda:3' => 0, 'tienda:4' => -2],
        ['concepto:1' => 10, 'concepto:2' => 7, 'tienda:3' => 5, 'tienda:4' => 0]
    );
    igual(3, count($plan), 'el que coincide no genera movimiento');
    igual(['clave' => 'concepto:2', 'actual' => 4, 'contado' => 7, 'diferencia' => 3], $plan[0]);
    igual(5, $plan[1]['diferencia']);
    igual(2, $plan[2]['diferencia'], 'de -2 a 0 es +2: el negativo se corrige');
    igual([], inventario_conteo_plan(['a' => 3], ['a' => null]), 'lo no contado no se toca');
    igual([], inventario_conteo_plan(['a' => 3], ['b' => 9]), 'un producto sin renglón no se inventa');
    igual(-3, inventario_conteo_plan(['a' => 3], ['a' => 0])[0]['diferencia'], 'contar cero cuando había 3');
});

prueba('inventario: la existencia después de una secuencia de movimientos sale del libro', function () {
    $e = 0;
    $e += inventario_delta('entrada', 20);      // 20
    $e += inventario_delta('venta', 3);         // 17
    $e += inventario_delta('venta', 2);         // 15
    $e += inventario_delta('devolucion', 3);    // 18  (se canceló el cobro de 3)
    $e += inventario_delta('ajuste', -1);       // 17  (se rompió una)
    $plan = inventario_conteo_plan(['p' => $e], ['p' => 15]);
    $e += $plan[0]['diferencia'];               // 15  (el conteo encontró 15)
    igual(15, $e);
    // Vender de más: puede quedar negativa y se muestra como agotado, sin lanzar.
    $e += inventario_delta('venta', 20);
    igual(-5, $e);
    igual('agotado', inventario_estado($e, 3));
});

prueba('inventario: el total de una entrada exige costo en todos los renglones', function () {
    igual(12050 * 3 + 500 * 10, inventario_total_entrada_c([
        ['cantidad' => 3, 'costo_c' => 12050], ['cantidad' => 10, 'costo_c' => 500],
    ]));
    igual(null, inventario_total_entrada_c([['cantidad' => 3, 'costo_c' => 12050], ['cantidad' => 1, 'costo_c' => null]]));
    igual(0, inventario_total_entrada_c([]));
});

prueba('inventario: los tipos y movimientos del brief siguen siendo esos', function () {
    igual(['concepto', 'tienda'], INVENTARIO_TIPOS);
    igual(['entrada', 'venta', 'devolucion', 'ajuste', 'conteo'], INVENTARIO_MOVIMIENTOS);
    igual('productos', inventario_tabla_item('concepto'));
    igual('tienda_productos', inventario_tabla_item('tienda'));
});

prueba('inventario: los enganches de venta son no-op sin la migración (la base falla en todo)', function () {
    // PDO que lanza en todo: simula la base sin las tablas de inventario.
    $pdo = (new ReflectionClass('PDO'))->newInstanceWithoutConstructor();
    $r = @inventario_registrar_ventas($pdo, 1, 'concepto', [10 => 2], ['cobro_id' => 5], 1);
    afirmar($r['piezas'] === 0 && $r['productos'] === 0, 'no descontó nada');
    igual(null, @inventario_alertas_contar($pdo, 1), 'sin migración no hay avisos');
    igual([], @inventario_existencias_de($pdo, 1, 'concepto'));
    $r = @inventario_registrar_ventas($pdo, 1, 'concepto', [], ['cobro_id' => 5], 1);
    igual(['piezas' => 0, 'productos' => 0, 'errores' => 0], $r, 'sin pedidos no hace nada');
});

// ════════════════════════════════════════════════════════════════════════
// Corredor
// ════════════════════════════════════════════════════════════════════════

$filtro = null;
foreach (array_slice($argv, 1) as $a) { if ($a === '--lista') $filtro = '--lista'; elseif ($a[0] !== '-') $filtro = $a; }
if ($filtro === '--lista') {
    foreach ($GLOBALS['__pruebas'] as [$n]) echo $n . "\n";
    exit(0);
}

$ok = 0; $fallos = [];
$t0 = microtime(true);
foreach ($GLOBALS['__pruebas'] as [$nombre, $fn]) {
    if ($filtro !== null && stripos($nombre, $filtro) === false) continue;
    try {
        $fn();
        $ok++;
        echo "  ok     $nombre\n";
    } catch (Throwable $e) {
        $fallos[] = [$nombre, $e];
        echo "  FALLA  $nombre\n";
        echo "         " . ($e instanceof PruebaFallo ? '' : get_class($e) . ': ') . $e->getMessage() . "\n";
    }
}
$total = $ok + count($fallos);
printf("\n%d prueba(s): %d ok, %d con falla  (%d ms)\n", $total, $ok, count($fallos), round((microtime(true) - $t0) * 1000));
if ($total === 0) { echo "Ninguna prueba coincide con el filtro.\n"; exit(1); }
exit($fallos ? 1 : 0);
