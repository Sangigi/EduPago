<?php
// herramientas/revisar-sintaxis.php — revisa la sintaxis de TODO el código (solo CLI).
//
//   php herramientas/revisar-sintaxis.php
//   php herramientas/revisar-sintaxis.php --node="C:\Program Files\nodejs\node.exe"
//   php herramientas/revisar-sintaxis.php --sin-js
//
// · Todos los .php del repositorio con `php -l` (el mismo PHP que corre este script).
// · Todos los .js con `node --check`, si encuentra node: en --node=RUTA, en la
//   variable de entorno NODE, en el PATH o en las rutas comunes de Windows. Si no
//   hay node, los .js se OMITEN con un aviso (no es un fallo).
//
// Sale con código 1 si algún archivo tiene un error de sintaxis, 0 si todo bien.
//
// POR QUÉ: el frontend es JavaScript precompilado, sin build; un paréntesis de
// más no se nota hasta que alguien abre esa pantalla. Un archivo PHP con error
// de sintaxis deja una acción entera dando 500. Esto lo atrapa ANTES de subir.

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$RAIZ = dirname(__DIR__);
$sin_js = in_array('--sin-js', $argv, true);
$node = null;
foreach ($argv as $a) {
    if (strpos($a, '--node=') === 0) $node = trim(substr($a, 7), "\"'");
}

/** Carpetas que no son código nuestro ni se versionan. */
const SINTAXIS_OMITIR = ['.git', 'node_modules', 'vendor', 'uploads', 'uploads_privados', 'mnt', 'logs'];

function sintaxis_archivos(string $dir, array &$php, array &$js): void
{
    foreach (scandir($dir) ?: [] as $n) {
        if ($n === '.' || $n === '..') continue;
        $ruta = $dir . DIRECTORY_SEPARATOR . $n;
        if (is_dir($ruta)) {
            if (in_array($n, SINTAXIS_OMITIR, true)) continue;
            sintaxis_archivos($ruta, $php, $js);
        } elseif (preg_match('/\.php$/i', $n)) {
            $php[] = $ruta;
        } elseif (preg_match('/\.js$/i', $n)) {
            $js[] = $ruta;
        }
    }
}

function sintaxis_buscar_node(?string $explicito): ?string
{
    $candidatos = [];
    if ($explicito) $candidatos[] = $explicito;
    $env = getenv('NODE');
    if ($env) $candidatos[] = $env;
    $candidatos[] = 'C:/Program Files/nodejs/node.exe';
    $candidatos[] = 'C:/Program Files (x86)/nodejs/node.exe';
    foreach ($candidatos as $c) if (is_file($c)) return $c;
    // En el PATH.
    $cmd = (stripos(PHP_OS, 'WIN') === 0) ? 'where node 2>NUL' : 'command -v node 2>/dev/null';
    $salida = [];
    @exec($cmd, $salida);
    foreach ($salida as $l) { $l = trim($l); if ($l !== '' && is_file($l)) return $l; }
    return null;
}

function sintaxis_correr(string $comando): array
{
    $salida = [];
    $cod = 0;
    exec($comando . ' 2>&1', $salida, $cod);
    return [$cod, trim(implode("\n", $salida))];
}

$php = []; $js = [];
sintaxis_archivos($RAIZ, $php, $js);
sort($php); sort($js);

$fallos = [];
$rel = function (string $p) use ($RAIZ) { return ltrim(str_replace(DIRECTORY_SEPARATOR, '/', substr($p, strlen($RAIZ))), '/'); };

echo "PHP: revisando " . count($php) . " archivo(s) con " . PHP_BINARY . "\n";
foreach ($php as $f) {
    [$cod, $txt] = sintaxis_correr(escapeshellarg(PHP_BINARY) . ' -l ' . escapeshellarg($f));
    if ($cod !== 0) { $fallos[] = [$rel($f), $txt]; echo "  FALLA  " . $rel($f) . "\n"; }
}
echo "  " . (count($php) - count(array_filter($fallos, fn($x) => substr($x[0], -4) === '.php'))) . " sin error.\n";

if (!$sin_js) {
    $n = sintaxis_buscar_node($node);
    if ($n === null) {
        echo "\nJS: no se encontró node: se OMITEN " . count($js) . " archivo(s) .js. Indica la ruta con --node=RUTA o la variable NODE.\n";
    } else {
        echo "\nJS: revisando " . count($js) . " archivo(s) con $n\n";
        $malos_js = 0;
        foreach ($js as $f) {
            [$cod, $txt] = sintaxis_correr(escapeshellarg($n) . ' --check ' . escapeshellarg($f));
            if ($cod !== 0) { $fallos[] = [$rel($f), $txt]; $malos_js++; echo "  FALLA  " . $rel($f) . "\n"; }
        }
        echo "  " . (count($js) - $malos_js) . " sin error.\n";
    }
}

if ($fallos) {
    echo "\n=== " . count($fallos) . " archivo(s) con error de sintaxis ===\n";
    foreach ($fallos as [$archivo, $txt]) echo "\n-- $archivo\n$txt\n";
    exit(1);
}
echo "\nTodo en orden.\n";
exit(0);
