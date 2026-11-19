<?php
// herramientas/revisar-migraciones.php — ¿la base conectada tiene lo que el código necesita? (solo CLI)
//
//   php herramientas/revisar-migraciones.php              las dos revisiones de abajo
//   php herramientas/revisar-migraciones.php --estricto   sale con código 1 también si la
//                                                         revisión APROXIMADA encuentra algo
//
// Se conecta a la base de config.php (o a la de EDUPAGO_DB_NAME, ver
// herramientas/_conexion.php). Solo lee.
//
// REVISIÓN 1 — CONFIABLE: pasos del registro (lib/migraciones.php).
//   Lista los pasos que no están aplicados (pendientes o bloqueados). Es lo que
//   hay que correr con `php herramientas/migrar.php --aplicar` ANTES de subir el
//   código nuevo. Sale con código 1 si hay alguno.
//
// REVISIÓN 2 — APROXIMADA: columnas que el código ESCRIBE y la base no tiene.
//   Lee los textos SQL de todos los .php y revisa dos formas, que se pueden
//   interpretar sin ambigüedad:
//       INSERT INTO tabla (col1, col2, ...)
//       UPDATE tabla SET col1 = ..., col2 = ...
//   contra information_schema de la base conectada.
//   LO QUE NO CUBRE (a propósito, para no dar falsas alarmas): los SELECT
//   (no se puede saber de qué tabla es una columna sin alias ni contexto), los
//   UPDATE con JOIN o alias, las tablas con nombre interpolado, las columnas
//   interpoladas, y el SQL armado con concatenaciones largas. Que algo aparezca
//   aquí NO siempre es un error: mucho código es TOLERANTE a propósito (revisa
//   si existe la columna y cae al comportamiento anterior). Es una lista para
//   leer, no un veredicto.

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

require_once __DIR__ . '/_conexion.php';
require_once __DIR__ . '/../lib/migraciones.php';

$RAIZ = dirname(__DIR__);
$estricto = in_array('--estricto', $argv, true);

try {
    $pdo = herramientas_conectar();
    $bd = (string) $pdo->query('SELECT DATABASE()')->fetchColumn();
} catch (Throwable $e) {
    fwrite(STDERR, "No se pudo conectar a la base de datos: " . $e->getMessage() . "\n");
    exit(1);
}
echo "Base de datos: $bd\n";
$codigo_salida = 0;

// ── Revisión 1: pasos del registro ───────────────────────────────────────
echo "\n=== 1. Pasos de migración (confiable) ===\n";
$est = migraciones_estado($pdo);
$sin_aplicar = array_filter($est['pasos'], fn($p) => in_array($p['estado'], ['pendiente', 'bloqueada'], true));
if (!$sin_aplicar) {
    echo "Todos los pasos están aplicados ({$est['total']}).\n";
    if ($est['por_registrar'] > 0) {
        echo "Nota: {$est['por_registrar']} paso(s) ya existen en la base pero no están anotados en schema_migraciones (corre migrar.php --aplicar una vez; no cambia nada).\n";
    }
} else {
    $codigo_salida = 1;
    echo count($sin_aplicar) . " paso(s) SIN aplicar:\n";
    foreach ($sin_aplicar as $p) {
        echo "  [" . strtoupper($p['estado']) . "] {$p['id']} — {$p['descripcion']}" . ($p['detalle'] ? "\n      >> {$p['detalle']}" : '') . "\n";
    }
    echo "Corre: php herramientas/migrar.php --aplicar\n";
}

// ── Revisión 2: columnas escritas por el código ─────────────────────────

/** Textos (strings y heredocs) del código. */
function revisar_textos(string $codigo): string
{
    $out = '';
    foreach (token_get_all($codigo) as $t) {
        if (is_array($t) && in_array($t[0], [T_CONSTANT_ENCAPSED_STRING, T_ENCAPSED_AND_WHITESPACE], true)) $out .= $t[1] . "\n";
    }
    return $out;
}

/** Parte "a, b(c, d), e" en elementos de primer nivel. */
function revisar_partir(string $s): array
{
    $out = []; $actual = ''; $prof = 0; $comilla = '';
    for ($i = 0, $n = strlen($s); $i < $n; $i++) {
        $c = $s[$i];
        if ($comilla !== '') { $actual .= $c; if ($c === $comilla) $comilla = ''; continue; }
        if ($c === "'" || $c === '"') { $comilla = $c; $actual .= $c; continue; }
        if ($c === '(') $prof++;
        if ($c === ')') $prof--;
        if ($c === ',' && $prof === 0) { $out[] = $actual; $actual = ''; continue; }
        $actual .= $c;
    }
    if (trim($actual) !== '') $out[] = $actual;
    return $out;
}

function revisar_columna_limpia(string $c): ?string
{
    $c = trim(str_replace('`', '', $c));
    if ($c === '' || !preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $c)) return null;   // interpolada, con alias o expresión
    return strtolower($c);
}

$archivos = array_merge(
    glob($RAIZ . '/acciones/*.php') ?: [], glob($RAIZ . '/lib/*.php') ?: [], glob($RAIZ . '/webhooks/*.php') ?: [],
    glob($RAIZ . '/models/*.php') ?: [], glob($RAIZ . '/controllers/*.php') ?: [],
    [$RAIZ . '/api.php', $RAIZ . '/cron_recordatorios.php']
);
sort($archivos);

// uso[tabla][columna] = [archivos]
$uso = [];
foreach ($archivos as $f) {
    if (!is_file($f)) continue;
    $texto = revisar_textos((string) file_get_contents($f));
    $rel = ltrim(str_replace(DIRECTORY_SEPARATOR, '/', substr($f, strlen($RAIZ))), '/');

    if (preg_match_all('/INSERT\s+(?:IGNORE\s+)?INTO\s+`?([A-Za-z_][A-Za-z0-9_]*)`?\s*\(([^()]*)\)\s*(?:VALUES|SELECT)/i', $texto, $m, PREG_SET_ORDER)) {
        foreach ($m as $x) {
            foreach (explode(',', $x[2]) as $c) {
                $c = revisar_columna_limpia($c);
                if ($c !== null) $uso[strtolower($x[1])][$c][$rel] = true;
            }
        }
    }
    if (preg_match_all('/UPDATE\s+`?([A-Za-z_][A-Za-z0-9_]*)`?\s+SET\s+(.+?)(?:\s+WHERE\b|\s+ORDER\s+BY\b|\s+LIMIT\b|"|\'\s*\)|$)/is', $texto, $m, PREG_SET_ORDER)) {
        foreach ($m as $x) {
            foreach (revisar_partir($x[2]) as $asig) {
                if (!preg_match('/^\s*`?([A-Za-z_][A-Za-z0-9_]*)`?\s*=/', $asig, $mm)) continue;
                $uso[strtolower($x[1])][strtolower($mm[1])][$rel] = true;
            }
        }
    }
}

echo "\n=== 2. Columnas que el código escribe y la base no tiene (aproximado) ===\n";
try {
    $cols = [];
    $st = $pdo->query("SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()");
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $f) $cols[strtolower($f['t'])][strtolower($f['c'])] = true;
} catch (Throwable $e) {
    fwrite(STDERR, "No se pudo leer information_schema: " . $e->getMessage() . "\n");
    exit(1);
}

$tablas_faltan = []; $cols_faltan = [];
foreach ($uso as $tabla => $columnas) {
    if (!isset($cols[$tabla])) { $tablas_faltan[$tabla] = $columnas; continue; }
    foreach ($columnas as $col => $donde) {
        if (!isset($cols[$tabla][$col])) $cols_faltan[$tabla][$col] = $donde;
    }
}
ksort($tablas_faltan); ksort($cols_faltan);

$hay = false;
if ($tablas_faltan) {
    $hay = true;
    echo "\nTablas que el código escribe y NO existen:\n";
    foreach ($tablas_faltan as $t => $columnas) {
        $donde = [];
        foreach ($columnas as $d) foreach (array_keys($d) as $a) $donde[$a] = true;
        echo "  $t   (" . implode(', ', array_keys($donde)) . ")\n";
    }
}
if ($cols_faltan) {
    $hay = true;
    echo "\nColumnas que el código escribe y NO existen:\n";
    foreach ($cols_faltan as $t => $columnas) {
        foreach ($columnas as $c => $donde) echo "  $t.$c   (" . implode(', ', array_keys($donde)) . ")\n";
    }
}
if (!$hay) echo "Nada que reportar con las dos formas revisadas (INSERT con lista de columnas y UPDATE ... SET).\n";
else echo "\nOjo: puede ser intencional si el código es tolerante (revisa si la columna existe y cae al comportamiento anterior).\n";

if ($estricto && $hay) $codigo_salida = 1;
exit($codigo_salida);
