<?php
// migracion_2026_09_24_comisiones_backfill.php
//
// Congela el devengado de comisiones de los meses YA TERMINADOS.
// Se corre UNA SOLA VEZ, después de migracion_2026_09_24_comisiones_devengo.sql.
//
// LA REGLA QUE GOBIERNA ESTE SCRIPT:
//   La migración no debe mover ni un peso.
// El día que lo corras, cada pantalla tiene que seguir mostrando exactamente
// los mismos números que mostraba el día anterior. Si algo cambia, es que algo
// está mal — no que "ahora calcula mejor".
//
// Por eso congela con la fórmula VIEJA ('legacy_total_cobro'): SUM(cobros.total)
// de los pagados, por cobros.fecha, con la tasa actual. La fórmula nueva
// (dinero real) entra sola a partir de COMISION_LEDGER_DESDE, por fecha y no
// por despliegue.
//
// DRY-RUN POR OMISIÓN. Sin argumentos imprime lo que haría y NO escribe nada:
//
//   php migracion_2026_09_24_comisiones_backfill.php              <- solo mira
//   php migracion_2026_09_24_comisiones_backfill.php --aplicar    <- escribe
//
// Compara el listado del dry-run contra lo que la pantalla de Comisiones
// muestra HOY, y contra lo que de verdad le pagaste al distribuidor. Solo si
// cuadra, córrelo con --aplicar.

// Igual que cron_recordatorios.php: esto NO se expone por web. Un backfill de
// dinero disparable por URL sería un problema, no una comodidad.
if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    exit("Este script solo corre por linea de comandos.\n");
}

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/helpers_pagos.php';
require_once __DIR__ . '/lib/helpers_comisiones.php';

$aplicar = in_array('--aplicar', $argv ?? [], true);

echo "\n";
echo "══════════════════════════════════════════════════════════════════\n";
echo $aplicar
    ? "  BACKFILL DE COMISIONES — MODO APLICAR (escribe en la base)\n"
    : "  BACKFILL DE COMISIONES — DRY-RUN (no escribe nada)\n";
echo "══════════════════════════════════════════════════════════════════\n\n";

// ── Preflight 1: las tablas tienen que existir ────────────────────────
try {
    $pdo->query("SELECT 1 FROM comision_devengos LIMIT 1");
    $pdo->query("SELECT 1 FROM distribuidor_comision_tasas LIMIT 1");
} catch (\PDOException $e) {
    exit("ABORTADO: faltan las tablas. Corre primero migracion_2026_09_24_comisiones_devengo.sql\n\n");
}

// ── Preflight 2: una vigencia por referido ────────────────────────────
$sinTasa = $pdo->query(
    "SELECT COUNT(*) FROM distribuidor_referidos r
      WHERE NOT EXISTS (SELECT 1 FROM distribuidor_comision_tasas t WHERE t.referido_id = r.id)"
)->fetchColumn();
if (intval($sinTasa) > 0) {
    exit("ABORTADO: hay $sinTasa referido(s) sin vigencia sembrada.\n"
       . "Corre el PASO 6 de migracion_2026_09_24_comisiones_devengo.sql.\n\n");
}

// ── Preflight 3: dos referidos sobre el mismo colegio ─────────────────
// Hoy eso ya duplica la comisión en vivo. Congelarlo la volvería deuda formal.
$dupes = $pdo->query(
    "SELECT escuela_id, COUNT(*) c FROM distribuidor_referidos
      WHERE escuela_id IS NOT NULL GROUP BY escuela_id HAVING c > 1"
)->fetchAll();
if ($dupes) {
    echo "ABORTADO: hay colegios con MÁS DE UN referido. Eso ya está duplicando\n";
    echo "la comisión hoy; congelarlo la convertiría en deuda escrita.\n\n";
    foreach ($dupes as $d) echo "   escuela_id {$d['escuela_id']}: {$d['c']} referidos\n";
    echo "\nResuelve eso primero.\n\n";
    exit(1);
}

// ── Qué meses se congelan ─────────────────────────────────────────────
// Desde el primer cobro pagado que exista, hasta el último mes COMPLETO.
// El mes en curso NO se toca: todavía puede entrar dinero.
$primero = $pdo->query("SELECT MIN(fecha) FROM cobros WHERE estado = 'pagado'")->fetchColumn();
if (!$primero) exit("No hay cobros pagados. Nada que congelar.\n\n");

$p    = date('Y-m', strtotime($primero));
$tope = date('Y-m');   // el mes en curso queda FUERA

printf("Primer cobro pagado: %s\n", $primero);
printf("Se congelarán los meses de %s a %s (el mes en curso %s NO se toca).\n\n",
       $p, date('Y-m', strtotime($tope . '-01 -1 month')), $tope);

$granTotal = 0.0;
$granRenglones = 0;
$periodosHechos = [];

while ($p < $tope) {
    $regla = comision_regla_de_periodo($p);

    $yaCerrado = $pdo->prepare("SELECT id FROM comision_cierres WHERE periodo = ?");
    $yaCerrado->execute([$p]);
    if ($yaCerrado->fetch()) {
        printf("── %s · YA CERRADO, se salta\n", $p);
        $p = date('Y-m', strtotime($p . '-01 +1 month'));
        continue;
    }

    $renglones = comision_calcular_periodo($pdo, $p);
    $totalMes = 0.0;
    foreach ($renglones as $r) $totalMes += $r['comision'];

    printf("── %s · regla=%s · %d renglon(es) · total $%s\n",
           $p, $regla, count($renglones), number_format($totalMes, 2));

    foreach ($renglones as $r) {
        printf("     %-34s  base $%12s  %5.2f%%  ->  $%10s\n",
               mb_substr((string) $r['nombre_colegio'], 0, 34),
               number_format($r['base_cobrada'], 2),
               $r['comision_pct'],
               number_format($r['comision'], 2));
    }

    if ($aplicar) {
        // Se reusa la MISMA función que usa el cierre diario, para que el
        // backfill y el cron no puedan divergir.
        $res = comision_cerrar_periodo($pdo, $p, null, 'migracion_historica');
        if (!$res['ok']) {
            echo "\n   ERROR al congelar $p: {$res['error']}\n";
            echo "   Se detiene aquí. Los meses anteriores ya quedaron escritos.\n\n";
            exit(1);
        }
        echo "     -> congelado\n";
    }

    $granTotal += $totalMes;
    $granRenglones += count($renglones);
    $periodosHechos[] = $p;
    echo "\n";
    $p = date('Y-m', strtotime($p . '-01 +1 month'));
}

echo "══════════════════════════════════════════════════════════════════\n";
printf("  %d mes(es) · %d renglon(es) · TOTAL DEVENGADO $%s\n",
       count($periodosHechos), $granRenglones, number_format($granTotal, 2));
echo "══════════════════════════════════════════════════════════════════\n\n";

if (!$aplicar) {
    echo "Esto fue un DRY-RUN: no se escribió nada.\n\n";
    echo "Antes de aplicar, compara los totales de arriba contra lo que la\n";
    echo "pantalla de Comisiones muestra HOY. Tienen que coincidir. Si no\n";
    echo "coinciden, hay algo que entender antes de congelar nada.\n\n";
    echo "Cuando cuadre:\n";
    echo "   php migracion_2026_09_24_comisiones_backfill.php --aplicar\n\n";
} else {
    echo "Listo. Esos meses ya no cambian aunque edites el porcentaje.\n\n";
    echo "OJO: de lo que YA le pagaste al distribuidor no hay registro en\n";
    echo "ningún lado (se buscó en todo el repo y no existe). Las tablas\n";
    echo "comision_liquidaciones y comision_liquidacion_detalle nacen vacías.\n";
    echo "El listado de arriba es la hoja para capturar esos pagos a mano.\n";
    echo "No se rellenaron solas a propósito: dar por pagado lo que no se\n";
    echo "puede verificar haría desaparecer una deuda real.\n\n";
}
