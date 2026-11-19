<?php
// herramientas/revisar-acciones.php — ¿cada acción declara quién puede usarla? (solo CLI)
//
//   php herramientas/revisar-acciones.php             lista las que NO cumplen (código 0)
//   php herramientas/revisar-acciones.php --estricto  igual, pero sale con código 1 si hay alguna
//   php herramientas/revisar-acciones.php --todo      además lista las que sí cumplen y cómo
//
// ES DIAGNÓSTICO, NO CORRIGE NADA.
//
// POR QUÉ EXISTE: requerir_rol() NO es "default-deny" global. Solo protege a las
// acciones que LA LLAMAN; una acción que escribe en la base y no la llama queda
// abierta a cualquier rol con sesión (ver el comentario de api.php sobre el
// candado de roles de plataforma). Esta lista es el mapa de ese hueco.
//
// QUÉ CUENTA COMO "CUMPLE" (por análisis de tokens de PHP, así que ignora
// comentarios y textos):
//   1. La acción llama directamente a requerir_rol(...), o
//   2. llama a una función "puerta" que a su vez llama a requerir_rol. Se
//      DESCUBREN solas leyendo api.php y lib/*.php (hoy: escolar_ctx, monedero_ctx,
//      expediente_alumno y las que aparezcan), o
//   3. está en la lista documentada de EXCEPCIONES de abajo.
//
// Para las que no cumplen se anota (a) si ESCRIBE en la base (INSERT / UPDATE /
// DELETE / REPLACE en sus textos SQL) y (b) qué otras guardas tiene
// (requerir_escuela_propia, requerir_familia_propia, requerir_alumno_propio,
// requerir_seccion_habilitada, validar_*, o si compara $usuario_actual['rol']
// a mano). Que tenga otras guardas NO significa que esté bien: significa que
// hay que leerla para decidir. Las que escriben y no tienen ninguna van primero.

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$RAIZ = dirname(__DIR__);
$estricto = in_array('--estricto', $argv, true);
$todo = in_array('--todo', $argv, true);

// ── Excepciones documentadas ─────────────────────────────────────────────
// 1) Públicas: las toma de $acciones_publicas en api.php (siempre al día). Si no
//    se pudiera leer, esta copia es el respaldo.
$PUBLICAS_RESPALDO = ['login', 'invitacion_ver', 'invitacion_enviar', 'invitacion_generar_pago',
    'activar_cuenta_ver', 'activar_cuenta_confirmar', 'recuperar_password_solicitar'];
// 2) Autoservicio: acciones donde CUALQUIER usuario con sesión actúa sobre SÍ
//    MISMO; pedir un rol ahí dejaría a alguien sin poder usarlas.
$AUTOSERVICIO = [
    'cambiar_password_propio' => 'cualquier usuario con sesión cambia SU propia contraseña',
    'guia_marcar_vista'       => 'marca la guía de SU propia sesión; no recibe usuario_id (ver su cabecera)',
];

// ── Lectura de tokens ────────────────────────────────────────────────────

/** Nombres de funciones llamadas en el código (T_STRING seguido de "("), sin comentarios. */
function acciones_llamadas(string $codigo): array
{
    $tokens = token_get_all($codigo);
    $n = count($tokens);
    $llamadas = [];
    for ($i = 0; $i < $n; $i++) {
        if (!is_array($tokens[$i]) || $tokens[$i][0] !== T_STRING) continue;
        // ¿lo que sigue (saltando espacios) es "("?
        $j = $i + 1;
        while ($j < $n && is_array($tokens[$j]) && $tokens[$j][0] === T_WHITESPACE) $j++;
        if ($j >= $n || $tokens[$j] !== '(') continue;
        // Descartar definiciones (function nombre() y llamadas a métodos ->nombre()).
        $k = $i - 1;
        while ($k >= 0 && is_array($tokens[$k]) && $tokens[$k][0] === T_WHITESPACE) $k--;
        if ($k >= 0 && is_array($tokens[$k]) && in_array($tokens[$k][0], [T_FUNCTION, T_OBJECT_OPERATOR, T_NULLSAFE_OBJECT_OPERATOR, T_DOUBLE_COLON], true)) continue;
        $llamadas[strtolower($tokens[$i][1])] = true;
    }
    return array_keys($llamadas);
}

/** Textos (strings y heredocs) del código, para buscar SQL. */
function acciones_textos(string $codigo): string
{
    $out = '';
    foreach (token_get_all($codigo) as $t) {
        if (is_array($t) && in_array($t[0], [T_CONSTANT_ENCAPSED_STRING, T_ENCAPSED_AND_WHITESPACE], true)) $out .= $t[1] . "\n";
    }
    return $out;
}

/**
 * Funciones de api.php y lib/*.php que llaman a requerir_rol directamente.
 * @return array<string,string> nombre => archivo
 */
function acciones_descubrir_puertas(string $raiz): array
{
    $archivos = array_merge([$raiz . '/api.php'], glob($raiz . '/lib/*.php') ?: []);
    $puertas = [];
    foreach ($archivos as $f) {
        $codigo = @file_get_contents($f);
        if ($codigo === false) continue;
        $tokens = token_get_all($codigo);
        $n = count($tokens);
        for ($i = 0; $i < $n; $i++) {
            if (!is_array($tokens[$i]) || $tokens[$i][0] !== T_FUNCTION) continue;
            // nombre de la función
            $j = $i + 1;
            while ($j < $n && is_array($tokens[$j]) && $tokens[$j][0] === T_WHITESPACE) $j++;
            if ($j < $n && $tokens[$j] === '&') { $j++; while ($j < $n && is_array($tokens[$j]) && $tokens[$j][0] === T_WHITESPACE) $j++; }
            if ($j >= $n || !is_array($tokens[$j]) || $tokens[$j][0] !== T_STRING) continue; // función anónima
            $nombre = strtolower($tokens[$j][1]);
            // cuerpo: desde la primera "{" hasta su cierre
            while ($j < $n && $tokens[$j] !== '{') $j++;
            $prof = 0; $cuerpo = '';
            for (; $j < $n; $j++) {
                $t = $tokens[$j];
                if ($t === '{' || (is_array($t) && in_array($t[0], [T_CURLY_OPEN, T_DOLLAR_OPEN_CURLY_BRACES], true))) $prof++;
                elseif ($t === '}') { $prof--; if ($prof === 0) break; }
                $cuerpo .= is_array($t) ? $t[1] : $t;
            }
            if ($nombre !== 'requerir_rol' && in_array('requerir_rol', acciones_llamadas('<?php ' . $cuerpo), true)) {
                $puertas[$nombre] = basename($f);
            }
        }
    }
    return $puertas;
}

// ── Públicas desde api.php ───────────────────────────────────────────────
$publicas = $PUBLICAS_RESPALDO;
$api = @file_get_contents($RAIZ . '/api.php');
if ($api !== false && preg_match('/\$acciones_publicas\s*=\s*\[(.*?)\]\s*;/s', $api, $m)
    && preg_match_all("/'([a-z_]+)'/", $m[1], $mm) && $mm[1]) {
    $publicas = $mm[1];
}

$puertas = acciones_descubrir_puertas($RAIZ);
$guardas_sueltas = ['requerir_escuela_propia', 'requerir_familia_propia', 'requerir_alumno_propio',
    'requerir_seccion_habilitada', 'validar_admin_sobre_usuario', 'validar_control_escolar_sobre_usuario',
    'rol_alcance_global', 'rol_sin_finanzas'];

$archivos = glob($RAIZ . '/acciones/*.php') ?: [];
sort($archivos);

$cumplen = []; $excepciones = []; $incumplen = [];
foreach ($archivos as $f) {
    $accion = basename($f, '.php');
    $codigo = file_get_contents($f);
    if (in_array($accion, $publicas, true)) { $excepciones[$accion] = 'pública (sin sesión; $acciones_publicas de api.php)'; continue; }
    if (isset($AUTOSERVICIO[$accion])) { $excepciones[$accion] = 'autoservicio: ' . $AUTOSERVICIO[$accion]; continue; }

    $llamadas = acciones_llamadas($codigo);
    if (in_array('requerir_rol', $llamadas, true)) { $cumplen[$accion] = 'requerir_rol directo'; continue; }
    $via = array_values(array_filter($llamadas, fn($c) => isset($puertas[$c])));
    if ($via) { $cumplen[$accion] = 'vía ' . implode(', ', $via); continue; }

    $textos = acciones_textos($codigo);
    $escribe = (bool) preg_match('/\b(INSERT\s+(IGNORE\s+)?INTO|UPDATE\s+[`\w]+\s+SET|DELETE\s+FROM|REPLACE\s+INTO)\b/i', $textos);
    $otras = array_values(array_intersect($llamadas, $guardas_sueltas));
    // ¿Compara el rol a mano? ($usuario_actual['rol'] o una variable que lo copia)
    $comparaRol = (bool) preg_match('/\[\s*[\'"]rol[\'"]\s*\]/', $codigo);
    $incumplen[$accion] = ['escribe' => $escribe, 'otras' => $otras, 'rol_a_mano' => $comparaRol];
}

// ── Informe ──────────────────────────────────────────────────────────────
echo 'Acciones revisadas: ' . count($archivos) . "\n";
echo 'Puertas descubiertas (llaman a requerir_rol): ' . ($puertas ? implode(', ', array_map(fn($k) => $k . ' (' . $puertas[$k] . ')', array_keys($puertas))) : 'ninguna') . "\n";
echo 'Excepciones documentadas: ' . count($excepciones) . "\n";
foreach ($excepciones as $a => $por) echo "   - $a  [$por]\n";
echo 'Cumplen: ' . count($cumplen) . "\n";
if ($todo) foreach ($cumplen as $a => $como) echo "   - $a  [$como]\n";

uasort($incumplen, function ($a, $b) {
    // primero las que escriben sin ninguna otra guarda, luego las que escriben, luego el resto
    $pa = ($a['escribe'] ? 0 : 2) + (($a['otras'] || $a['rol_a_mano']) ? 1 : 0);
    $pb = ($b['escribe'] ? 0 : 2) + (($b['otras'] || $b['rol_a_mano']) ? 1 : 0);
    return $pa <=> $pb;
});

echo "\nNO llaman a requerir_rol (ni a una puerta) y no son excepción: " . count($incumplen) . "\n";
if ($incumplen) {
    echo "  (E = escribe en la base · guardas = lo que sí valida por su cuenta)\n\n";
    foreach ($incumplen as $a => $d) {
        $g = $d['otras'] ? implode(', ', $d['otras']) : '';
        if ($d['rol_a_mano']) $g .= ($g ? ', ' : '') . 'compara el rol a mano';
        printf("  %s %-38s %s\n", $d['escribe'] ? 'E' : ' ', $a, $g !== '' ? $g : 'NINGUNA guarda visible');
    }
    echo "\nLeer cada una antes de concluir: que no llame a requerir_rol no prueba que esté abierta\n";
    echo "(puede validar a mano), y que llame no prueba que el filtro de escuela sea correcto.\n";
}
exit($estricto && $incumplen ? 1 : 0);
