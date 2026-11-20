<?php
/**
 * herramientas/revisar-permisos.php  (CLI)  -- OF-4b
 *
 * Comprobador estático de $ACCIONES_POR_ROL_PLATAFORMA (api.php). No toca la
 * base de datos ni el servidor: lee api.php y acciones/*.php.
 *
 *   php herramientas/revisar-permisos.php
 *   php herramientas/revisar-permisos.php --roles-estricta     simula ALLOWLIST_ROLES_ESTRICTA=true
 *   php herramientas/revisar-permisos.php --familia-estricta   simula ALLOWLIST_FAMILIA_ESTRICTA=true
 *
 * Qué revisa:
 *   1. DECLARADAS: toda acción de acciones/ está en al menos una lista, o en
 *      SOLO_SUPERADMIN (abajo), o es pública ($acciones_publicas de api.php).
 *      Si no, es una acción que nadie declaró: con las listas en modo estricto
 *      nadie podría llamarla, y en modo registro solo la verían 'superadmin'
 *      y los roles sin lista. => código de salida 1.
 *   2. ENTRADAS MUERTAS: toda entrada de las listas tiene su archivo (un nombre
 *      mal escrito deja al rol sin ese permiso y, en estricto, sin esa pantalla);
 *      un comodín 'prefijo_*' debe cubrir al menos un archivo. => código de salida 1.
 *   3. SIN requerir_rol: lista las acciones que no llaman requerir_rol() (ni un
 *      helper que lo llame) y qué roles las alcanzan HOY: los que la tienen en su
 *      lista (por diseño) y los que solo llegan porque su lista está en modo
 *      registro (se cerrarán al pasar a estricto). Es informativo: no cambia el
 *      código de salida. Ver docs/mejoras-of/of4-permisos.md.
 *   4. SOLO_SUPERADMIN: verifica que cada acción de esa lista exija de verdad
 *      'superadmin' por dentro (si no, está "declarada" pero abierta).
 *
 * Para que no se repita lo que ya salió mal una vez (afirmar que un rol no
 * puede algo sin verificarlo), las funciones de decisión NO se reimplementan:
 * se extraen del propio api.php y se evalúan aquí.
 */

$raiz = dirname(__DIR__);
// [OF-7c] Las listas de "Ver como" (solo lectura / nunca) viven en este archivo puro.
require_once $raiz . '/lib/helpers_suplantacion.php';
$roles_estricta   = in_array('--roles-estricta', $argv ?? [], true);
$familia_estricta = in_array('--familia-estricta', $argv ?? [], true);

// Acciones que SOLO puede llamar 'superadmin' (no están en ninguna lista porque
// superadmin no tiene lista). El comprobador verifica abajo que cada una lo exija
// por dentro. Si agregas una acción de superadmin, agrégala aquí.
const SOLO_SUPERADMIN = [
    'cambiar_plan_escuela', 'comisiones_cerrar_periodo', 'crear_escuela', 'crear_zona',
    'editar_escuela', 'editar_zona', 'eliminar_escuela', 'invitacion_resolver',
    'listar_clabes_pool', // [OF-4] ya exige superadmin por dentro
    'migraciones_aplicar', 'migraciones_estado', // [OF-4a]
    'mantenimiento_activar', 'mantenimiento_desactivar', 'mantenimiento_estado',
    'renovar_suscripcion', 'simular_spei',
    'superadmin_editar_referido', 'superadmin_listar_referidos',
    'superadmin_toggle_metodo_escuela', 'superadmin_toggle_metodo_global',
    'superadmin_toggle_modo_demo', 'superadmin_toggle_seccion_escuela',
    'superadmin_toggle_seccion_global', 'toggle_escuela',
];

// Acciones de superadmin que NO validan el rol por dentro (ni requerir_rol ni
// comparación inline): hoy solo las protege el allowlist. Quedan "declaradas"
// aquí a propósito y salen también en la sección 3, para no olvidarlas. Si
// alguna recibe un requerir_rol(['superadmin']), muévela a SOLO_SUPERADMIN.
const SUPERADMIN_POR_ALLOWLIST = [];

function fallar($msg) { fwrite(STDERR, "ERROR: $msg\n"); exit(2); }

// ── Cargar api.php: listas, públicas y funciones de decisión ────────────────
$api = @file_get_contents($raiz . '/api.php');
if ($api === false) fallar('no pude leer api.php');

if (!preg_match('/^\$ACCIONES_POR_ROL_PLATAFORMA = \[.*?^\];/ms', $api, $m1)) fallar('no encontré $ACCIONES_POR_ROL_PLATAFORMA en api.php');
if (!preg_match('/^\$ACCIONES_POR_ROL_PLATAFORMA\[\'tienda\'\] = \[.*?^\];/ms', $api, $m2)) fallar("no encontré la lista de 'tienda' en api.php");
if (!preg_match('/^\$acciones_publicas = \[.*?\];/ms', $api, $m3)) fallar('no encontré $acciones_publicas en api.php');
foreach (['accion_en_allowlist', 'decision_allowlist_rol'] as $fn) {
    if (!preg_match('/^function ' . $fn . '\(.*?^}/ms', $api, $mf)) fallar("no encontré la función $fn() en api.php");
    eval($mf[0]);
}
eval($m1[0] . "\n" . $m2[0] . "\n" . $m3[0]);
/** @var array $ACCIONES_POR_ROL_PLATAFORMA */
/** @var array $acciones_publicas */

$acciones = [];
foreach (glob($raiz . '/acciones/*.php') as $f) $acciones[] = basename($f, '.php');
sort($acciones);
$existe = array_flip($acciones);

$errores = 0; $avisos = 0;

// ── 1. Declaradas ───────────────────────────────────────────────────────────
$sin_declarar = [];
foreach ($acciones as $a) {
    if (in_array($a, $acciones_publicas, true) || in_array($a, SOLO_SUPERADMIN, true)
        || in_array($a, SUPERADMIN_POR_ALLOWLIST, true)
        // [OF-7c] 'suplantar_terminar' no va en ninguna lista de rol: api.php la deja pasar con un
        // token de suplantación sea cual sea el rol del objetivo (ver el bloque [OF-7c] de api.php).
        || in_array($a, SUPLANTACION_ACCIONES_PROPIAS, true)) continue;
    $en = false;
    foreach ($ACCIONES_POR_ROL_PLATAFORMA as $lista) if (accion_en_allowlist($a, $lista)) { $en = true; break; }
    if (!$en) $sin_declarar[] = $a;
}
echo "== 1. Acciones sin declarar (en ninguna lista, ni solo-superadmin, ni públicas): " . count($sin_declarar) . "\n";
foreach ($sin_declarar as $a) echo "   SIN DECLARAR  $a\n";
$errores += count($sin_declarar);

// Públicas que no existen (typo en $acciones_publicas).
foreach ($acciones_publicas as $a) if (!isset($existe[$a])) { echo "   AVISO pública sin archivo: $a\n"; $avisos++; }

// ── 2. Entradas muertas ─────────────────────────────────────────────────────
$muertas = 0;
echo "\n== 2. Entradas de las listas sin archivo en acciones/\n";
foreach ($ACCIONES_POR_ROL_PLATAFORMA as $rol => $lista) {
    $vistas = [];
    foreach ($lista as $e) {
        if (isset($vistas[$e])) { echo "   REPETIDA      [$rol] $e\n"; $avisos++; }
        $vistas[$e] = true;
        if (strlen($e) > 2 && substr($e, -2) === '_*') {
            $pre = substr($e, 0, -1); $n = 0;
            foreach ($acciones as $a) if (strpos($a, $pre) === 0) $n++;
            if ($n === 0) { echo "   COMODIN VACIO [$rol] $e\n"; $muertas++; }
        } elseif (!isset($existe[$e])) {
            echo "   SIN ARCHIVO   [$rol] $e\n"; $muertas++;
        }
    }
}
if (!$muertas) echo "   (ninguna)\n";
$errores += $muertas;

// ── 4. SOLO_SUPERADMIN realmente lo exige ───────────────────────────────────
echo "\n== 4. Acciones 'solo superadmin' que no lo exigen por dentro\n";
$abiertas = 0;
foreach (SOLO_SUPERADMIN as $a) {
    if (!isset($existe[$a])) { echo "   SIN ARCHIVO   $a\n"; $abiertas++; continue; }
    $src = file_get_contents($raiz . '/acciones/' . $a . '.php');
    $ok = preg_match("/requerir_rol\([^;]*?\[\s*'superadmin'\s*\]/s", $src)
       || preg_match("/\['rol'\]\s*\?\?\s*''\)\s*!==\s*'superadmin'/", $src);
    if (!$ok) { echo "   NO LO EXIGE   $a\n"; $abiertas++; }
}
if (!$abiertas) echo "   (todas lo exigen)\n";
$errores += $abiertas;

// ── 5. [OF-7c] "Ver como": las listas de solo lectura y de nunca ────────────
// Las dos listas viven en lib/helpers_suplantacion.php. Aquí se valida que sean coherentes
// con el código real, para que una acción nueva o renombrada no deje un hueco:
//   a. toda acción nombrada en ellas existe en acciones/ (un nombre mal escrito en NUNCA
//      deja SIN bloquear justo la acción que se quería prohibir);
//   b. ninguna acción de solo lectura está también en NUNCA;
//   c. ninguna acción de solo lectura ESCRIBE en la base (INSERT/UPDATE/DELETE/REPLACE,
//      ->exec(, archivos, correo), salvo las excepciones documentadas abajo;
//   d. la lista de roles de plataforma de la suplantación es rol_sin_escuela() + 'superadmin';
//   e. 'suplantar_iniciar' y 'suplantar_terminar' existen.
echo "\n== 5. [OF-7c] \"Ver como\": listas de solo lectura y de nunca\n";
$fallas_sup = 0;
// Excepciones al punto c, cada una con su razón (y verificada abajo):
//   caja_sucursales: crea la sucursal "Principal" si el colegio no tiene ninguna; en modo lectura
//   esa rama se omite ([OF-7c] en el archivo, verificado con 'suplantacion_modo').
$excepciones_escritura = ['caja_sucursales' => 'suplantacion_modo'];
foreach (['SOLO_LECTURA' => SUPLANTACION_ACCIONES_SOLO_LECTURA, 'NUNCA' => SUPLANTACION_ACCIONES_NUNCA,
          'PROPIAS' => SUPLANTACION_ACCIONES_PROPIAS] as $nombre => $lista) {
    $vistas = [];
    foreach ($lista as $a) {
        if (isset($vistas[$a])) { echo "   REPETIDA      [$nombre] $a\n"; $avisos++; }
        $vistas[$a] = true;
        if (!isset($existe[$a])) { echo "   SIN ARCHIVO   [$nombre] $a\n"; $fallas_sup++; }
    }
}
foreach (array_intersect(SUPLANTACION_ACCIONES_SOLO_LECTURA, SUPLANTACION_ACCIONES_NUNCA) as $a) {
    echo "   EN LAS DOS    $a (solo lectura y nunca a la vez)\n"; $fallas_sup++;
}
$patron_escritura = '/\b(INSERT\s+INTO|UPDATE\s+[`\w]+\s+SET|DELETE\s+FROM|REPLACE\s+INTO)\b|->exec\s*\(|file_put_contents\s*\(|\bunlink\s*\(|move_uploaded_file|\benviar_correo\s*\(/i';
foreach (SUPLANTACION_ACCIONES_SOLO_LECTURA as $a) {
    if (!isset($existe[$a])) continue;
    $src = file_get_contents($raiz . '/acciones/' . $a . '.php');
    $limpio = preg_replace('~/\*.*?\*/~s', '', $src);
    $limpio = preg_replace('~^\s*(//|#).*$~m', '', $limpio);
    if (preg_match($patron_escritura, $limpio, $mm)) {
        if (isset($excepciones_escritura[$a]) && strpos($limpio, $excepciones_escritura[$a]) !== false) continue;
        echo "   ESCRIBE       $a (solo lectura, pero contiene: " . trim(preg_replace('/\s+/', ' ', $mm[0])) . ")\n"; $fallas_sup++;
    }
}
$fn_sin = null;
if (preg_match('/^function rol_sin_escuela\(.*?^}/ms', $api, $mf)) { eval($mf[0]); $fn_sin = true; }
if ($fn_sin) {
    $esperados = SUPLANTACION_ROLES_PLATAFORMA;
    $reales = array_merge(['superadmin'], array_values(array_filter(
        ['distribuidor', 'contador', 'soporte', 'provision', 'tesoreria', 'promotor', 'superadmin', 'admin', 'cajero', 'docente', 'familia', 'alumno', 'tienda', 'control_escolar', 'direccion'],
        function ($r) { return $r !== 'superadmin' && rol_sin_escuela($r); })));
    sort($esperados); sort($reales);
    if ($esperados !== $reales) { echo "   ROLES DE PLATAFORMA distintos de rol_sin_escuela(): suplantacion=" . implode(',', $esperados) . " api=" . implode(',', $reales) . "\n"; $fallas_sup++; }
}
foreach (SUPLANTACION_ACCIONES_PROPIAS as $a) if (!isset($existe[$a])) { echo "   FALTA acción propia: $a\n"; $fallas_sup++; }
if (!$fallas_sup) echo "   (todo coherente: " . count(SUPLANTACION_ACCIONES_SOLO_LECTURA) . " de solo lectura, " . count(SUPLANTACION_ACCIONES_NUNCA) . " prohibidas siempre)\n";
$errores += $fallas_sup;

// ── 3. Acciones sin requerir_rol y quién las alcanza ────────────────────────
// Un helper de contexto que llama requerir_rol() por dentro cuenta como guardia.
$helpers_con_guardia = ['requerir_rol(', 'escolar_ctx(', 'monedero_ctx(', 'expediente_alumno(', 'notas_familia_autorizada(',
    'inventario_ctx(' /* [OF-6] llama requerir_rol() como lo primero (lib/helpers_inventario.php) */,
    'agenda_ctx(' /* [OF-7c] llama requerir_rol() como lo primero (lib/helpers_agenda.php) */,
    'suplantacion_contexto(' /* [OF-7c] suplantar_terminar solo responde si la sesión ES una suplantación */];
$roles_con_registro = ['admin', 'cajero', 'contador', 'distribuidor'];
$sin_guardia = [];
foreach ($acciones as $a) {
    if (in_array($a, $acciones_publicas, true)) continue;
    $src = file_get_contents($raiz . '/acciones/' . $a . '.php');
    // Quita comentarios para no contar menciones en texto.
    $limpio = preg_replace('~/\*.*?\*/~s', '', $src);
    $limpio = preg_replace('~^\s*(//|#).*$~m', '', $limpio);
    $guardada = false;
    foreach ($helpers_con_guardia as $h) if (strpos($limpio, $h) !== false) { $guardada = true; break; }
    if ($guardada) continue;
    $inline = (bool) preg_match("/\\\$[A-Za-z_]*rol[A-Za-z_]*\s*(===|!==)\s*'/", $limpio)
           || (bool) preg_match("/in_array\(\s*\\\$[A-Za-z_]*rol/", $limpio)
           || (bool) preg_match("/\['rol'\]/", $limpio);
    $sin_guardia[$a] = $inline ? 'inline' : 'ninguna';
}
echo "\n== 3. Acciones que NO llaman requerir_rol() (ni helper que lo haga): " . count($sin_guardia) . "\n";
echo "   guardia: 'ninguna' = no hay ningún chequeo de rol; 'inline' = compara el rol a mano (revisar).\n";
echo "   en lista  = roles que la tienen declarada (llegan por diseño; 'superadmin' siempre llega).\n";
echo "   por REGISTRO = roles que hoy la alcanzan SOLO porque su lista está en modo registro:\n";
echo "                  con estricto recibirían 403.\n\n";
$roles_a_simular = array_merge($roles_con_registro, ['familia']);
$tabla = [];
foreach ($sin_guardia as $a => $tipo) {
    $enLista = []; $porRegistro = [];
    foreach ($ACCIONES_POR_ROL_PLATAFORMA as $rol => $lista) {
        if (accion_en_allowlist($a, $lista)) $enLista[] = $rol;
    }
    foreach ($roles_a_simular as $rol) {
        $d = decision_allowlist_rol($rol, $a, $ACCIONES_POR_ROL_PLATAFORMA, $familia_estricta, $roles_estricta);
        if ($d === 'registrar') $porRegistro[] = $rol;
    }
    $tabla[$a] = [$tipo, $enLista, $porRegistro];
}
$w = 0; foreach ($tabla as $a => $_) $w = max($w, strlen($a));
foreach ($tabla as $a => [$tipo, $enLista, $porRegistro]) {
    printf("   %-{$w}s  [%-7s] en lista: %s\n", $a, $tipo, $enLista ? implode(',', $enLista) : '(ninguna)');
    if ($porRegistro) printf("   %-{$w}s             por REGISTRO: %s\n", '', implode(',', $porRegistro));
}

// ── Resumen ─────────────────────────────────────────────────────────────────
echo "\n== Resumen\n";
echo "   Acciones en acciones/:      " . count($acciones) . "\n";
foreach ($ACCIONES_POR_ROL_PLATAFORMA as $rol => $lista) printf("   Lista %-16s %d entradas\n", $rol . ':', count($lista));
echo "   Públicas:                    " . count($acciones_publicas) . "\n";
echo "   Solo superadmin:             " . count(SOLO_SUPERADMIN) . "\n";
echo "   Sin declarar:                " . count($sin_declarar) . "\n";
echo "   Entradas muertas:            $muertas\n";
echo "   Solo-superadmin sin exigirlo: $abiertas\n";
echo "   Ver como (incoherencias):    $fallas_sup\n";
echo "   Sin requerir_rol:            " . count($sin_guardia) . " (informativo)\n";
echo "   Avisos:                      $avisos\n";
echo "   Modo simulado:               roles " . ($roles_estricta ? 'ESTRICTO' : 'registro') . ', familia ' . ($familia_estricta ? 'ESTRICTO' : 'registro') . "\n";
echo $errores ? "\nRESULTADO: FALLA ($errores problema(s))\n" : "\nRESULTADO: OK\n";
exit($errores ? 1 : 0);
