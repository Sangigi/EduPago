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
require_once $RAIZ . '/lib/helpers_soporte.php'; // [OF-7a] reglas puras de tickets y ayuda

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
// [OF-7a] Soporte: reglas puras (sin base de datos)
// ════════════════════════════════════════════════════════════════════════

prueba('soporte: las notas internas se filtran en SQL para el colegio y no para la plataforma', function () {
    igual(' AND m.interno = 0', soporte_condicion_interno('admin'));
    igual(' AND x.interno = 0', soporte_condicion_interno('cajero', 'x'));
    igual(' AND m.interno = 0', soporte_condicion_interno('familia'), 'cualquier rol que no sea plataforma');
    igual('', soporte_condicion_interno('soporte'));
    igual('', soporte_condicion_interno('superadmin'));
});

prueba('soporte: estado tras un mensaje (colegio reabre, soporte espera al colegio)', function () {
    igual('abierto', soporte_estado_tras_mensaje('resuelto', 'colegio'));
    igual('en_proceso', soporte_estado_tras_mensaje('esperando_cliente', 'colegio'));
    igual('en_proceso', soporte_estado_tras_mensaje('en_proceso', 'colegio'));
    igual('abierto', soporte_estado_tras_mensaje('abierto', 'colegio'));
    igual('esperando_cliente', soporte_estado_tras_mensaje('abierto', 'soporte'));
    igual('en_proceso', soporte_estado_tras_mensaje('abierto', 'soporte', 'en_proceso'));
    igual('resuelto', soporte_estado_tras_mensaje('en_proceso', 'soporte', 'resuelto'));
    igual('resuelto', soporte_estado_tras_mensaje('resuelto', 'soporte'), 'una aclaración no reabre');
    igual('esperando_cliente', soporte_estado_tras_mensaje('abierto', 'soporte', 'inventado'), 'estado inválido se ignora');
});

prueba('soporte: transiciones permitidas por lado', function () {
    afirmar(soporte_transicion_permitida('soporte', 'abierto', 'esperando_cliente'));
    afirmar(!soporte_transicion_permitida('soporte', 'abierto', 'inventado'));
    afirmar(soporte_transicion_permitida('colegio', 'abierto', 'resuelto'));
    afirmar(soporte_transicion_permitida('colegio', 'resuelto', 'abierto'), 'reabrir');
    afirmar(!soporte_transicion_permitida('colegio', 'abierto', 'en_proceso'));
    afirmar(!soporte_transicion_permitida('colegio', 'en_proceso', 'esperando_cliente'));
    afirmar(!soporte_transicion_permitida('colegio', 'en_proceso', 'abierto'), 'solo se reabre un resuelto');
});

prueba('soporte: tipo de adjunto por firma de bytes, no por nombre', function () {
    igual('jpg', soporte_extension_por_firma('', "\xFF\xD8\xFF\xE0\x00\x10JFIF"));
    igual('png', soporte_extension_por_firma('', "\x89PNG\r\n\x1A\n\x00\x00\x00\x0D"));
    igual('pdf', soporte_extension_por_firma('', "%PDF-1.7\n"));
    igual('webp', soporte_extension_por_firma('', "RIFF\x24\x00\x00\x00WEBPVP8 "));
    igual(null, soporte_extension_por_firma('', '<' . '?php system(1);'), 'un script no es imagen');
    igual(null, soporte_extension_por_firma('', "GIF89a......."), 'gif no se acepta');
    igual(null, soporte_extension_por_firma('', 'RIFF....WAVEfmt '), 'RIFF que no es webp');
    igual(null, soporte_extension_por_firma('', ''));
});

prueba('ayuda: roles visibles (JSON o texto) y visibilidad por rol', function () {
    igual(['admin', 'cajero'], ayuda_roles_normalizar('["admin","cajero"]'));
    igual(['admin', 'cajero'], ayuda_roles_normalizar('admin, cajero'));
    igual(['admin'], ayuda_roles_normalizar(['admin', 'familia', 'ADMIN', 'superadmin']), 'solo roles con menú Ayuda, sin repetidos');
    igual([], ayuda_roles_normalizar(null));
    igual([], ayuda_roles_normalizar('basura {'));
    afirmar(ayuda_visible_para(['publicado' => 1, 'roles_visibles' => '["admin"]'], 'admin'));
    afirmar(!ayuda_visible_para(['publicado' => 1, 'roles_visibles' => '["admin"]'], 'cajero'));
    afirmar(!ayuda_visible_para(['publicado' => 0, 'roles_visibles' => '["admin","cajero"]'], 'admin'), 'borrador');
    afirmar(!ayuda_visible_para(['publicado' => 1, 'roles_visibles' => '["admin","cajero"]'], 'familia'));
});

prueba('ayuda: artículos sembrados con formato válido y sin retornos de carro', function () {
    require_once dirname(__DIR__) . '/lib/migraciones.php';
    $a = migraciones_of7a_articulos_semilla();
    igual(4, count($a));
    foreach ($a as $art) {
        afirmar(strpos($art['cuerpo'], "\r") === false, 'sin \\r: ' . $art['titulo']);
        afirmar(mb_strlen($art['cuerpo'], 'UTF-8') < AYUDA_MAX_CUERPO && mb_strlen($art['titulo'], 'UTF-8') < AYUDA_MAX_TITULO);
        afirmar(ayuda_roles_normalizar($art['roles']) === $art['roles'] && $art['roles'], 'roles válidos');
    }
});

// ════════════════════════════════════════════════════════════════════════
// [OF-7b] Avisos push: lo puro (base64url, JWT de VAPID, endpoints, texto), sin base de datos ni red
// ════════════════════════════════════════════════════════════════════════

/** PEM de una llave PÚBLICA P-256 a partir de los 65 bytes sin comprimir (para openssl_verify). */
function push_prueba_pem_publica(string $punto65): string
{
    $spki = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $punto65;
    return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($spki), 64, "\n") . "-----END PUBLIC KEY-----\n";
}

prueba('push: base64url (vectores, ida y vuelta, entradas inválidas)', function () {
    igual('', push_b64url_encode(''));
    igual('Zg', push_b64url_encode('f'));
    igual('Zm9vYmFy', push_b64url_encode('foobar'));
    igual('-_8', push_b64url_encode("\xfb\xff"), 'usa - y _, sin relleno');
    for ($i = 0; $i < 200; $i++) {
        $bin = ($i % 70) > 0 ? random_bytes($i % 70) : '';
        $enc = push_b64url_encode($bin);
        afirmar(!preg_match('/[+\/=]/', $enc), 'sin + / =');
        if ($bin !== '') igual($bin, push_b64url_decode($enc), "ida y vuelta $i");
    }
    igual(null, push_b64url_decode('abc+def'), 'el + no es base64url');
    igual(null, push_b64url_decode(''));
    igual(null, push_b64url_decode('ab cd'));
});

prueba('push: endpoints válidos (HTTPS de servicios conocidos) y rechazo de SSRF', function () {
    $buenos = [
        'https://fcm.googleapis.com/fcm/send/dX1abc:APA91bE',
        'https://updates.push.services.mozilla.com/wpush/v2/gAAAAABk',
        'https://wns2-par02p.notify.windows.com/w/?token=BQYAAA',
        'https://web.push.apple.com/QGzK3hx',
        'https://fcm.googleapis.com:443/fcm/send/abc',
    ];
    foreach ($buenos as $e) afirmar(push_endpoint_valido($e), "debe valer: $e");
    $malos = [
        '', 'no es url', 'http://fcm.googleapis.com/fcm/send/x', 'ftp://fcm.googleapis.com/x',
        'https://evil.com/fcm.googleapis.com/x', 'https://fcm.googleapis.com.evil.com/x',
        'https://evilfcm.googleapis.com/x', 'https://notfcm.googleapis.com/x',
        'https://fcm.googleapis.com@evil.com/x', 'https://user:pw@fcm.googleapis.com/x',
        'https://evil.com#@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x',
        'https://fcm.googleapis.com/', 'https://fcm.googleapis.com',
        'https://localhost/x', 'https://127.0.0.1/x', 'https://169.254.169.254/latest/meta-data',
        'https://10.0.0.1/x', 'https://[::1]/x', 'https://fcm.googleapis.com\\@evil.com/x',
        "https://fcm.googleapis.com/x y", "https://fcm.googleapis.com/x\r\nHost: evil.com",
        'HTTPS://fcm.googleapis.com/fcm/send/x', 'https://notify.windows.com/x', 'https://.notify.windows.com/x',
        'https://fcm.googleapis.com./x', 'https://fcm.googleapis.com/x#frag',
        'https://' . str_repeat('a', 50) . '.notify.windows.com.evil.com/x',
        'https://fcm.googleapis.com/' . str_repeat('a', 2100),
    ];
    foreach ($malos as $e) afirmar(!push_endpoint_valido($e), 'debe rechazarse: ' . substr(json_encode($e), 0, 80));
    afirmar(!push_endpoint_valido(null) && !push_endpoint_valido(['x']) && !push_endpoint_valido(123), 'solo cadenas');
});

prueba('push: dirección de suscripción en hexadecimal y hash del dispositivo', function () {
    $ep = 'https://fcm.googleapis.com/fcm/send/abc:def-ghi_jkl';
    igual($ep, push_decodificar_campo(bin2hex($ep)), 'hexadecimal');
    igual($ep, push_decodificar_campo('  ' . $ep . ' '), 'tal cual, recortada');
    igual('', push_decodificar_campo(null));
    igual('AbC_-9', push_decodificar_campo('AbC_-9'), 'una llave base64url no hexadecimal queda igual');
    igual(hash('sha256', $ep), push_endpoint_hash($ep));
    igual(64, strlen(push_endpoint_hash($ep)));
    igual('https://fcm.googleapis.com', push_aud_de_endpoint($ep));
});

prueba('push: firma ES256 DER <-> r||s (ida y vuelta y entradas inválidas)', function () {
    $pem = push_generar_pem();
    if ($pem === null) return;   // sin soporte de OpenSSL en esta máquina: no hay nada que probar
    for ($i = 0; $i < 40; $i++) {
        openssl_sign('mensaje ' . $i, $der, $pem, OPENSSL_ALGO_SHA256);
        $raw = push_der_a_raw($der);
        igual(64, strlen($raw), 'r||s de 64 bytes');
        igual($der, push_raw_a_der($raw), "ida y vuelta $i");
    }
    igual(null, push_der_a_raw(''));
    igual(null, push_der_a_raw("\x31\x06\x02\x01\x01\x02\x01\x01"));
    igual(null, push_der_a_raw("\x30\x06\x03\x01\x01\x02\x01\x01"));
    igual(null, push_raw_a_der('corto'));
});

prueba('push: JWT de VAPID verificado con openssl_verify (cabecera, claims y llave pública k)', function () {
    $pem = push_generar_pem();
    if ($pem === null) return;
    $pub = push_publica_de_pem($pem);
    igual(87, strlen($pub), '65 bytes en base64url');
    $punto = push_b64url_decode($pub);
    igual(65, strlen($punto));
    igual("\x04", $punto[0], 'punto sin comprimir');

    $aud = 'https://fcm.googleapis.com';
    $exp = time() + 12 * 3600;
    $jwt = push_jwt_vapid($aud, $pem, 'mailto:contacto@ejemplo.mx', $exp);
    afirmar(is_string($jwt), 'debe firmar');
    $partes = explode('.', $jwt);
    igual(3, count($partes), 'tres partes');
    $cab = json_decode(push_b64url_decode($partes[0]), true);
    $dat = json_decode(push_b64url_decode($partes[1]), true);
    igual(['typ' => 'JWT', 'alg' => 'ES256'], $cab);
    igual($aud, $dat['aud']);
    igual($exp, $dat['exp']);
    igual('mailto:contacto@ejemplo.mx', $dat['sub']);
    $firma = push_b64url_decode($partes[2]);
    igual(64, strlen($firma), 'firma r||s de 64 bytes');

    $der = push_raw_a_der($firma);
    igual(1, openssl_verify($partes[0] . '.' . $partes[1], $der, push_prueba_pem_publica($punto), OPENSSL_ALGO_SHA256), 'la firma verifica con la llave pública VAPID');
    // Cualquier cambio rompe la firma: otro mensaje, o otra llave.
    igual(0, openssl_verify($partes[0] . '.' . $partes[1] . 'x', $der, push_prueba_pem_publica($punto), OPENSSL_ALGO_SHA256), 'otro mensaje');
    $otra = push_publica_de_pem(push_generar_pem());
    igual(0, openssl_verify($partes[0] . '.' . $partes[1], $der, push_prueba_pem_publica(push_b64url_decode($otra)), OPENSSL_ALGO_SHA256), 'otra llave');
    igual(null, push_jwt_vapid($aud, 'esto no es una llave', 'mailto:x@y.mx'), 'sin llave válida no firma');
});

prueba('push: llaves VAPID se generan una vez, con permisos y sin pisarse', function () {
    $dir = sys_get_temp_dir() . '/edupago_push_prueba_' . bin2hex(random_bytes(4));
    mkdir($dir, 0700, true);
    $ruta = $dir . '/push_vapid.pem';
    try {
        $a = push_llaves($ruta);
        if ($a === null) return;   // OpenSSL sin curvas elípticas aquí
        afirmar(is_file($ruta), 'se guardó el archivo');
        afirmar(strpos($a['privada'], 'PRIVATE KEY') !== false);
        igual(push_publica_de_pem($a['privada']), $a['publica']);
        if (DIRECTORY_SEPARATOR === '/') igual('0600', substr(sprintf('%o', fileperms($ruta)), -4), 'permisos 0600');
        // Con el archivo ya hecho, otra lectura (otra petición) devuelve la MISMA llave.
        $contenido = file_get_contents($ruta);
        $pub1 = $a['publica'];
        $leida = push_publica_de_pem($contenido);
        igual($pub1, $leida);
        // Un archivo dañado no se sobrescribe a escondidas: queda apagado hasta que se borre.
        $ruta2 = $dir . '/danada.pem';
        file_put_contents($ruta2, 'basura');
        igual(null, push_llaves($ruta2));
        igual('basura', file_get_contents($ruta2), 'no se pisó');
    } finally {
        foreach (glob($dir . '/*') ?: [] as $f) @unlink($f);
        @rmdir($dir);
    }
});

prueba('push: texto de los avisos es genérico (sin montos, nombres ni folios) y los tipos existen', function () {
    foreach (['pago_confirmado', 'recordatorio_pago', 'calificaciones', 'soporte_respuesta', 'soporte_nuevo', 'soporte_colegio', 'prueba'] as $tipo) {
        $t = push_texto_tipo($tipo);
        afirmar($t['titulo'] !== '' && $t['cuerpo'] !== '', "texto de $tipo");
        afirmar(!preg_match('/[0-9$#]/', $t['titulo'] . $t['cuerpo']), "$tipo no debe llevar cifras, $ ni #");
        afirmar(in_array($t['urgencia'], ['high', 'normal', 'low', 'very-low'], true), 'urgencia válida');
        afirmar($t['url'] === '' || preg_match('/^\?ir=[a-z_]+$/', $t['url']), "$tipo: liga relativa ?ir=");
        afirmar(strlen($t['titulo']) <= 120 && strlen($t['cuerpo']) <= 255, 'cabe en la tabla');
    }
    igual('Tu pago fue confirmado.', push_texto_tipo('pago_confirmado')['cuerpo']);
    igual('Se publicaron calificaciones.', push_texto_tipo('calificaciones')['cuerpo']);
    igual('Soporte respondió tu ticket.', push_texto_tipo('soporte_respuesta')['cuerpo']);
    igual('Tienes un recordatorio de pago.', push_texto_tipo('recordatorio_pago')['cuerpo']);
    igual(push_aviso_generico(), ['titulo' => 'EduPago', 'cuerpo' => 'Tienes un aviso nuevo.', 'url' => '', 'tag' => 'edupago-aviso']);
    igual('EduPago', push_texto_tipo('inventado')['titulo'], 'un tipo desconocido cae en el genérico');
});

prueba('push: nombre del dispositivo a partir del User-Agent', function () {
    igual('Chrome en Windows', push_dispositivo_desde_ua('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'));
    igual('Edge en Windows', push_dispositivo_desde_ua('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0'));
    igual('Chrome en Android', push_dispositivo_desde_ua('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'));
    igual('Safari en iOS', push_dispositivo_desde_ua('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'));
    igual('Firefox en Linux', push_dispositivo_desde_ua('Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0'));
    igual('Safari en macOS', push_dispositivo_desde_ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'));
    igual('Navegador', push_dispositivo_desde_ua(''));
    igual('Navegador', push_dispositivo_desde_ua(null));
});

prueba('push: límite de tasa por ventana (y no bloquea si no puede escribir)', function () {
    $dir = sys_get_temp_dir() . '/edupago_tasa_prueba_' . bin2hex(random_bytes(4));
    try {
        $t = 1000000;
        for ($i = 1; $i <= 5; $i++) afirmar(push_tasa_permitir('ip-a', 5, 60, $dir, $t), "intento $i cabe");
        afirmar(!push_tasa_permitir('ip-a', 5, 60, $dir, $t), 'el 6.º se corta');
        afirmar(push_tasa_permitir('ip-b', 5, 60, $dir, $t), 'otra clave no se afecta');
        afirmar(push_tasa_permitir('ip-a', 5, 60, $dir, $t + 60), 'la ventana siguiente empieza de cero');
        // Una carpeta imposible de crear: deja pasar (un fallo del límite no bloquea a nadie).
        afirmar(push_tasa_permitir('x', 1, 60, __FILE__ . '/no/se/puede', $t));
    } finally {
        foreach (glob($dir . '/*') ?: [] as $f) @unlink($f);
        @rmdir($dir);
    }
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
