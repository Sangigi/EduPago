<?php
/**
 * herramientas/inventario-permisos.php  (CLI)  -- OF-4b
 *
 * Genera docs/mejoras-of/of4-permisos-inventario.md: una fila por acción de
 * acciones/ con (1) qué roles la llaman HOY desde el frontend, (2) qué roles
 * admite por dentro y (3) notas. Es el insumo con el que se armaron las listas
 * de 'admin', 'cajero', 'contador' y 'distribuidor' en api.php.
 *
 *   php herramientas/inventario-permisos.php            -> escribe el .md
 *   php herramientas/inventario-permisos.php --stdout   -> lo imprime
 *   php herramientas/inventario-permisos.php --listas   -> imprime las listas propuestas
 *
 * HONESTIDAD SOBRE EL MÉTODO: "quién la llama" sale de buscar el nombre de la
 * acción como cadena en views/, controllers/ y assets/js/, y de asignarle a cada
 * archivo los roles que lo ven (tabla FILE_ROLES, armada leyendo NAV_ITEMS y el
 * ruteo de assets/js/app.js). Es una aproximación a nivel ARCHIVO: si una vista
 * la ven admin y cajero pero un botón concreto solo lo pinta admin, aquí
 * aparecen los dos. Para esos casos manda el requerir_rol de la acción (el
 * backend es el árbitro). Los controllers (controllers/*.js) ocultan quién los
 * usa, así que sus acciones se resuelven en CONTROLLER_CALLERS a mano.
 *
 * Las constantes de abajo son la "verdad de campo" revisada a mano; si cambia el
 * frontend (una vista nueva, un menú nuevo), actualízalas y vuelve a correrlo.
 */

$raiz = dirname(__DIR__);
$soloStdout = in_array('--stdout', $argv ?? [], true);
$soloListas = in_array('--listas', $argv ?? [], true);

const TODOS_LOS_ROLES = ['superadmin', 'admin', 'cajero', 'contador', 'distribuidor', 'soporte', 'provision',
    'promotor', 'tesoreria', 'docente', 'alumno', 'control_escolar', 'direccion', 'tienda', 'familia'];
const ROLES_CON_LISTA_NUEVA = ['admin', 'cajero', 'contador', 'distribuidor'];

// Constantes de roles definidas en lib/ (se resuelven por nombre).
$CONSTANTES_ROLES = [
    'ESCOLAR_ROLES_GESTOR'    => ['superadmin', 'admin', 'control_escolar'],
    'ESCOLAR_ROLES_LECTURA'   => ['superadmin', 'admin', 'control_escolar', 'direccion'],
    'EXPEDIENTE_ROLES_GESTION' => ['superadmin', 'admin', 'control_escolar'],
    'EXPEDIENTE_ROLES_LECTURA' => ['superadmin', 'admin', 'control_escolar', 'direccion'],
    'NOTA_ROLES'              => ['superadmin', 'admin', 'cajero'],
];

// Qué roles ven cada archivo del frontend (ruteo de app.js, NAV_ITEMS y paneles).
$TODOS = TODOS_LOS_ROLES;
$FILE_ROLES = [
    'views/Alumnos.js'        => ['admin', 'cajero', 'control_escolar', 'direccion', 'superadmin'],
    'views/BusquedaGlobal.js' => ['superadmin', 'soporte'],
    'views/Caja.js'           => ['admin', 'cajero', 'superadmin'],
    'views/Cobros.js'         => ['admin', 'cajero', 'superadmin'],
    'views/Comisiones.js'     => ['superadmin'],
    'views/Contador.js'       => ['contador'],
    'views/ControlEscolar.js' => ['admin', 'control_escolar', 'direccion', 'superadmin'],
    'views/CorteCaja.js'      => ['admin', 'cajero', 'superadmin'],
    'views/Dashboard.js'      => ['admin', 'cajero', 'superadmin', 'soporte'],
    'views/Distribuidor.js'   => ['distribuidor'],
    'views/EscolarFamilia.js' => ['familia'],
    'views/Escuelas.js'       => ['superadmin'],
    'views/Facturacion.js'    => ['admin', 'superadmin'],
    'views/Familias.js'       => ['admin', 'control_escolar', 'superadmin'],
    'views/Gastos.js'         => ['admin', 'superadmin'],
    'views/Logs.js'           => ['superadmin', 'soporte'],
    'views/MiCuenta.js'       => ['admin'],
    'views/MiSuscripcion.js'  => ['admin'],
    'views/Monedero.js'       => ['admin', 'cajero'],
    'views/PortalAlumno.js'   => ['alumno'],
    'views/PortalDocente.js'  => ['docente'],
    'views/PortalFamilia.js'  => ['familia'],
    'views/Productos.js'      => ['admin', 'superadmin'],
    'views/Promotor.js'       => ['promotor'],
    'views/Proveedores.js'    => ['admin', 'superadmin'],
    'views/Provision.js'      => ['provision'],
    'views/Recordatorios.js'  => ['admin'],
    'views/Reportes.js'       => ['admin', 'superadmin'],
    'views/SoporteEscuela.js' => ['superadmin', 'soporte'],
    'views/SuperReportes.js'  => ['superadmin', 'soporte'],
    'views/Suscripciones.js'  => ['superadmin'],
    'views/Tesoreria.js'      => ['tesoreria'],
    'views/Tienda.js'         => ['tienda', 'admin'],
    'views/Usuarios.js'       => ['superadmin', 'admin', 'control_escolar'], // 'usuarios' y 'miequipo'
    'views/components/BecasAlumno.js'       => ['admin', 'cajero'],
    'views/components/ExpedienteAlumno.js'  => ['admin', 'control_escolar', 'direccion', 'familia'],
    'views/components/FichaTecnica.js'      => ['admin', 'control_escolar', 'familia'],
    'views/components/MenuPerfil.js'        => $TODOS, // perfil/contraseña de CUALQUIER rol
    'views/components/MonederoFamilia.js'   => ['familia'],
    'views/components/NotasCobranza.js'     => ['admin', 'cajero'],
    'views/components/PanelInvitaciones.js' => ['superadmin', 'distribuidor', 'promotor'],
    'assets/js/app.js'        => $TODOS, // arranque, guía de primer uso
    'assets/js/spei_poller.js' => ['admin', 'cajero', 'familia', 'superadmin', 'soporte'],
];
// Archivos de acceso público (sin sesión): sus acciones van en $acciones_publicas.
$FILE_PUBLICOS = ['assets/js/activar_cuenta.js', 'assets/js/registro.js'];

// Acciones que viven en controllers/*.js (no dicen quién las usa): quién las llama
// de verdad, según qué vista usa qué método del controller (grep de
// CobroController./ClienteController./CajaController./... en views/).
$CONTROLLER_CALLERS = [
    'crear_cobro'                 => ['admin', 'cajero'],            // Caja.js iniciarCobro
    'verificar_spei'              => ['admin', 'cajero', 'familia'], // Caja.js + spei_poller + PortalFamilia
    'generar_liga'                => ['admin', 'cajero', 'familia'], // Caja.js iniciarTC, PortalFamilia, MonederoFamilia
    'cobrar_cai'                  => ['admin', 'cajero', 'familia'], // Caja.js cobrarCAI, PortalFamilia
    'cancelar_cai'                => ['familia'],                    // solo PortalFamilia (CobroController.cancelarCAI no la usa nadie)
    'generar_referencia_efectivo' => ['admin', 'cajero', 'familia'], // Caja.js, PortalFamilia, MonederoFamilia
    'confirmar_pago'              => ['admin', 'cajero', 'familia'], // Caja.js + spei_poller
    'cancelar_cobro'              => ['admin', 'cajero'],            // Cobros.js
    'marcar_cheque_rebotado'      => ['admin', 'cajero'],            // Cobros.js
    'generar_clabe_individual'    => ['admin', 'cajero'],            // literal en Alumnos.js / Familias.js
    'liberar_clabe_individual'    => [],                             // CobroController.liberarClabeIndividual: nadie la invoca
    'generar_cfdi'                => ['admin', 'cajero'],            // Caja.js generarCFDI (+ Facturacion.js)
    'enviar_factura_correo'       => ['admin', 'cajero'],            // Caja.js enviarFacturaCorreo
    'crear_gasto'                 => ['admin'], 'editar_gasto' => ['admin'], 'eliminar_gasto' => ['admin'],
    'subir_comprobante_gasto'     => ['admin'],                      // Gastos.js
    'crear_producto'              => ['admin'], 'editar_producto' => ['admin'], 'toggle_producto_activo' => ['admin'],
    'crear_proveedor'             => ['admin'], 'editar_proveedor' => ['admin'], 'toggle_proveedor_activo' => ['admin'],
    'crear_cliente'               => ['admin', 'cajero', 'control_escolar'], // ClienteController.agregar: Alumnos.js, Familias.js
    'editar_cliente'              => ['admin', 'control_escolar', 'familia'], // Alumnos.js, Familias.js, PortalFamilia
    'toggle_cliente_activo'       => ['admin', 'control_escolar'],   // Familias.js ClienteController.toggleActivo
    'crear_familia'               => ['admin', 'control_escolar'],   // Familias.js + Usuarios.js
    'editar_familia'              => ['admin', 'control_escolar', 'familia'],
    'caja_abrir'                  => ['admin', 'cajero'], 'caja_cerrar' => ['admin', 'cajero'],
    'caja_estado'                 => ['admin', 'cajero'], 'caja_historial' => ['admin', 'cajero'],
    'caja_movimiento'             => ['admin', 'cajero'], 'caja_resumen' => ['admin', 'cajero'],
    'caja_sucursales'             => ['admin', 'cajero'],            // Caja.js / CorteCaja.js
    'listar_usuarios'             => ['admin', 'control_escolar', 'superadmin'],
    'crear_usuario'               => ['admin', 'control_escolar', 'superadmin'],
    'editar_usuario'              => $TODOS,                         // autoservicio de perfil (MenuPerfil)
    'toggle_usuario'              => ['admin', 'control_escolar', 'superadmin'],
    'eliminar_usuario'            => ['admin', 'superadmin'],
    'cerrar_sesiones_usuario'     => ['admin', 'superadmin'],
    'toggle_escuela'              => ['superadmin'],
];
// Roles que el escaneo por archivo le atribuye a una acción pero cuya pantalla NO
// la pide de verdad (el botón está tras un `rol === ...` dentro de la vista).
$EXCLUIR_LLAMADOR = [
    'listar_usuarios' => ['cajero', 'direccion'], // Alumnos.js: solo con puedeAccesoAlumno (admin/superadmin/control_escolar)
];
// Públicas: no pasan por la allowlist (corren antes de que haya usuario).
$PUBLICAS_FUENTE = ['login', 'invitacion_ver', 'invitacion_enviar', 'invitacion_generar_pago',
    'activar_cuenta_ver', 'activar_cuenta_confirmar', 'recuperar_password_solicitar'];

// Notas manuales por acción (se agregan a las automáticas).
$NOTAS = [
    'asignar_id_externo'     => 'Contador.js todavía la invoca (guardarIdExterno) pero requerir_rol ya NO admite contador: llamada muerta que el backend rechaza.',
    'listar_pagos_no_aplicados' => 'requerir_rol admite contador pero su panel no la llama; solo Cobros.js (admin/cajero). DUDOSA para contador.',
    'resolver_pago_no_aplicado' => 'Igual que listar_pagos_no_aplicados: contador admitido en backend, sin pantalla. DUDOSA para contador.',
    'comisiones_historial_tasas' => 'Sin llamador en el frontend; el backend admite distribuidor. DUDOSA (se incluye en distribuidor).',
    'liberar_clabe_individual' => 'Solo la define CobroController y nadie la invoca. DUDOSA.',
    'cancelar_cai'           => 'Solo el portal de familia la llama; admin/cajero la admiten por dentro pero ninguna vista suya la pinta.',
    'iniciar_firma_cai'      => 'Sin llamador en el frontend (flujo de domiciliación en stand-by). DUDOSA.',
    'cargar_datos'           => 'No la piden los roles de plataforma (ROLES_SIN_CARGAR_DATOS en app.js).',
    'listar_clabes_pool'     => 'SIN guardia de rol y solo la usa Escuelas.js (superadmin): hueco que cierra el modo estricto para admin/cajero.',
    'listar_zonas'           => 'SIN guardia de rol; Usuarios.js (admin en "Mi equipo") la pide.',
    'familia_notas_listar'   => 'Su guardia vive en notas_familia_autorizada() (NOTA_ROLES).',
    'tendencia_cobranza'     => 'Sin requerir_rol: solo valida alcance por escuela.',
    'listar_cobros'          => 'Sin requerir_rol: solo valida alcance por escuela y sección.',
    'listar_gastos'          => 'Sin requerir_rol: solo valida alcance por escuela y sección.',
    'detalle_cobro'          => 'Sin requerir_rol: valida escuela y, para familia, que el cobro sea suyo.',
    'generar_liga'           => 'Sin requerir_rol: valida escuela; rama de familia comprueba propiedad.',
    'generar_referencia_efectivo' => 'Sin requerir_rol: valida escuela.',
    'iniciar_pago_agrupado'  => 'Sin requerir_rol: valida escuela; rama de familia comprueba propiedad.',
    'verificar_spei'         => 'Sin requerir_rol: valida escuela; rama de familia comprueba propiedad.',
    'verificar_saldo_alumno' => 'Sin requerir_rol: valida escuela; rama de familia comprueba propiedad.',
    'editar_logo_escuela'    => 'Guardia inline: superadmin o admin de esa escuela.',
    'editar_usuario'         => 'Autoservicio (cualquier rol sobre su propio perfil); admin/superadmin sobre otros.',
    'cambiar_password_propio' => 'Autoservicio: cualquier usuario autenticado, sobre sí mismo.',
    'guia_marcar_vista'      => 'Autoservicio: cualquier usuario autenticado.',
    'listar_usuarios'        => 'SIN guardia de rol: la rama final entrega el equipo del colegio a CUALQUIER rol con escuela_id (p. ej. cajero). Su UI solo la usan admin y control_escolar (Alumnos.js la pide con puedeAccesoAlumno). Hueco que cierra el modo estricto.',
    'invitacion_crear'       => 'Guardia inline: superadmin, admin, distribuidor, promotor. El admin no tiene pantalla para esto (PanelInvitaciones solo en Escuelas/Distribuidor/Promotor).',
    'invitacion_regenerar'   => 'Ídem invitacion_crear.',
    'invitaciones_listar'    => 'Ídem invitacion_crear.',
];

// Guardias "duras" de acciones SIN requerir_rol (inline o por helper), revisadas a mano.
// Sirve para saber a qué roles les abre la puerta de verdad la acción.
$GUARDIA_MANUAL = [
    'cancelar_cai'      => ['superadmin', 'admin', 'cajero', 'familia'],
    'iniciar_firma_cai' => ['superadmin', 'admin', 'cajero', 'familia'],
    'descargar_cfdi'    => ['superadmin', 'admin', 'cajero', 'familia'],
    'descargar_complemento_pago' => ['superadmin', 'admin', 'cajero', 'familia'],
    'enviar_factura_correo' => ['superadmin', 'admin', 'cajero', 'familia'],
    'editar_cliente'    => ['superadmin', 'admin', 'control_escolar', 'familia'],
    'editar_familia'    => ['superadmin', 'admin', 'control_escolar', 'familia'],
    'editar_logo_escuela' => ['superadmin', 'admin'],
    'invitacion_crear'  => ['superadmin', 'admin', 'distribuidor', 'promotor'],
    'invitacion_regenerar' => ['superadmin', 'admin', 'distribuidor', 'promotor'],
    'invitaciones_listar' => ['superadmin', 'admin', 'distribuidor', 'promotor'],
    'invitacion_resolver' => ['superadmin'],
    'editar_usuario'    => TODOS_LOS_ROLES,
    'cambiar_password_propio' => TODOS_LOS_ROLES,
    'guia_marcar_vista' => TODOS_LOS_ROLES,
    'cargar_datos'      => ['superadmin', 'admin', 'cajero', 'soporte', 'familia', 'control_escolar', 'direccion'],
    'alumno_resumen'    => ['alumno'],
];

// ── Utilidades ───────────────────────────────────────────────────────────────
function rolesEnTexto($txt, $constantes)
{
    $r = [];
    if (preg_match_all("/'([a-z_]+)'/", $txt, $m)) {
        foreach ($m[1] as $s) if (in_array($s, TODOS_LOS_ROLES, true)) $r[$s] = true;
    }
    foreach ($constantes as $nombre => $roles) {
        if (strpos($txt, $nombre) !== false) foreach ($roles as $x) $r[$x] = true;
    }
    return array_keys($r);
}
/** Texto de los argumentos de una llamada (balancea paréntesis). */
function argumentosLlamada($src, $posAbre)
{
    $n = strlen($src); $nivel = 0; $comilla = null;
    for ($i = $posAbre; $i < $n; $i++) {
        $c = $src[$i];
        if ($comilla) { if ($c === '\\') { $i++; } elseif ($c === $comilla) $comilla = null; continue; }
        if ($c === "'" || $c === '"') { $comilla = $c; continue; }
        if ($c === '(') $nivel++;
        if ($c === ')') { $nivel--; if ($nivel === 0) return substr($src, $posAbre + 1, $i - $posAbre - 1); }
    }
    return '';
}
/** Roles que los requerir_rol / helpers de contexto de la acción admiten (unión). */
function rolesDuros($src, $constantes)
{
    $roles = []; $hay = false;
    foreach (['requerir_rol', 'escolar_ctx', 'monedero_ctx', 'expediente_alumno'] as $fn) {
        $off = 0;
        while (($p = strpos($src, $fn . '(', $off)) !== false) {
            $off = $p + 1;
            // Salta menciones en comentarios de línea.
            $ini = strrpos(substr($src, 0, $p), "\n");
            $linea = substr($src, $ini === false ? 0 : $ini + 1, $p - ($ini === false ? 0 : $ini + 1));
            if (preg_match('~^\s*(//|\*|#)~', $linea)) continue;
            $args = argumentosLlamada($src, $p + strlen($fn));
            if ($fn === 'requerir_rol') {
                // 2.º argumento: la lista (hasta la coma de nivel 0 siguiente).
                $coma = null; $nivel = 0;
                for ($i = 0; $i < strlen($args); $i++) {
                    if ($args[$i] === '(' || $args[$i] === '[') $nivel++;
                    if ($args[$i] === ')' || $args[$i] === ']') $nivel--;
                    if ($args[$i] === ',' && $nivel === 0) { $coma = $i; break; }
                }
                $resto = $coma === null ? '' : substr($args, $coma + 1);
                $nivel = 0; $fin = strlen($resto);
                for ($i = 0; $i < strlen($resto); $i++) {
                    if ($resto[$i] === '(' || $resto[$i] === '[') $nivel++;
                    if ($resto[$i] === ')' || $resto[$i] === ']') $nivel--;
                    if ($resto[$i] === ',' && $nivel === 0) { $fin = $i; break; }
                }
                $lista = substr($resto, 0, $fin);
                $roles = array_merge($roles, rolesEnTexto($lista, $constantes));
                $hay = true;
            } elseif ($fn === 'escolar_ctx' || $fn === 'monedero_ctx') {
                // 4.º argumento: $pdo, $usuario_actual, $input, <roles>[, secciones]
                $partes = []; $nivel = 0; $act = '';
                for ($i = 0; $i < strlen($args); $i++) {
                    $c = $args[$i];
                    if ($c === '(' || $c === '[') $nivel++;
                    if ($c === ')' || $c === ']') $nivel--;
                    if ($c === ',' && $nivel === 0) { $partes[] = $act; $act = ''; } else $act .= $c;
                }
                $partes[] = $act;
                if (isset($partes[3])) { $roles = array_merge($roles, rolesEnTexto($partes[3], $constantes)); $hay = true; }
            } else { // expediente_alumno(..., $roles = EXPEDIENTE_ROLES_*)
                $roles = array_merge($roles, rolesEnTexto($args, $constantes));
                $hay = true;
            }
        }
    }
    if (strpos($src, 'notas_familia_autorizada(') !== false) { $roles = array_merge($roles, $constantes['NOTA_ROLES']); $hay = true; }
    return [$hay, array_values(array_unique($roles))];
}

// ── Recolección ──────────────────────────────────────────────────────────────
$acciones = [];
foreach (glob($raiz . '/acciones/*.php') as $f) $acciones[] = basename($f, '.php');
sort($acciones);

// Qué acciones menciona cada archivo del frontend.
$contenidoJs = [];
foreach (array_keys($FILE_ROLES) as $rel) $contenidoJs[$rel] = file_get_contents($raiz . '/' . $rel);
foreach ($FILE_PUBLICOS as $rel) $contenidoJs[$rel] = file_get_contents($raiz . '/' . $rel);
foreach (glob($raiz . '/controllers/*.js') as $f) $contenidoJs['controllers/' . basename($f)] = file_get_contents($f);

$llamadores = []; // accion => [roles => true]
$fuentes    = []; // accion => [archivos]
foreach ($acciones as $a) {
    $llamadores[$a] = []; $fuentes[$a] = [];
    foreach ($contenidoJs as $rel => $c) {
        if (!preg_match('/[\'"`=]' . preg_quote($a, '/') . '[\'"`&?\s)]/', $c)) continue;
        $fuentes[$a][] = $rel;
        if (isset($FILE_ROLES[$rel])) foreach ($FILE_ROLES[$rel] as $r) $llamadores[$a][$r] = true;
    }
    if (isset($CONTROLLER_CALLERS[$a])) foreach ($CONTROLLER_CALLERS[$a] as $r) $llamadores[$a][$r] = true;
    foreach ($EXCLUIR_LLAMADOR[$a] ?? [] as $r) unset($llamadores[$a][$r]);
    $soloController = $fuentes[$a] && !array_filter($fuentes[$a], function ($x) { return strpos($x, 'controllers/') !== 0; });
    if ($soloController && !isset($CONTROLLER_CALLERS[$a]) && !in_array($a, $PUBLICAS_FUENTE, true)) fwrite(STDERR, "AVISO: $a solo aparece en controllers/ y no está en CONTROLLER_CALLERS\n");
}

$info = [];
foreach ($acciones as $a) {
    $src = file_get_contents($raiz . '/acciones/' . $a . '.php');
    [$hay, $duros] = rolesDuros($src, $CONSTANTES_ROLES);
    $publica = in_array($a, $PUBLICAS_FUENTE, true);
    $guardia = $hay ? $duros : ($GUARDIA_MANUAL[$a] ?? null);
    $info[$a] = [
        'llama'    => array_keys($llamadores[$a]),
        'duros'    => $hay ? $duros : null,   // roles de requerir_rol/ctx
        'guardia'  => $guardia,               // roles efectivos (requerir_rol o revisados a mano)
        'publica'  => $publica,
        'huerfana' => !$fuentes[$a] && !isset($CONTROLLER_CALLERS[$a]) && !$publica,
        'escuela'  => strpos($src, 'requerir_escuela_propia') !== false,
    ];
}

// ── Listas propuestas ────────────────────────────────────────────────────────
$propuesta = []; $dudosas = [];
foreach (ROLES_CON_LISTA_NUEVA as $R) { $propuesta[$R] = []; }
foreach ($acciones as $a) {
    $i = $info[$a];
    if ($i['publica']) continue;
    $llama = $i['llama']; $g = $i['guardia'];
    $pasaGuardia = function ($R) use ($g) { return $g === null || in_array($R, $g, true); };
    foreach (ROLES_CON_LISTA_NUEVA as $R) {
        $enCallers = in_array($R, $llama, true);
        $entra = false; $duda = false;
        if ($enCallers && $pasaGuardia($R)) $entra = true;
        if (!$entra && $R === 'admin') {
            // Ante la duda, admin la incluye: el backend la admite explícitamente
            // (requerir_rol / guardia revisada) aunque ninguna vista suya la llame...
            if ($g !== null && in_array('admin', $g, true) && !$enCallers) { $entra = true; $duda = true; }
            // ...o nadie en el frontend la llama y no hay guardia que la excluya.
            if ($i['huerfana'] && $pasaGuardia('admin')) { $entra = true; $duda = true; }
        }
        if (!$entra && $R !== 'admin' && $i['huerfana'] && $g !== null && in_array($R, $g, true)) {
            $entra = true; $duda = true; // huérfana y el backend nombra al rol
        }
        if ($entra) {
            $propuesta[$R][] = $a;
            if ($duda) $dudosas[$a][] = $R;
        }
    }
}

if ($soloListas) {
    foreach ($propuesta as $R => $l) { echo "== $R (" . count($l) . ")\n" . implode(', ', $l) . "\n"; }
    echo "\n== dudosas\n"; foreach ($dudosas as $a => $rs) echo "$a: " . implode(',', $rs) . "\n";
    exit(0);
}

// ── Markdown ─────────────────────────────────────────────────────────────────
$md  = "# OF-4b: inventario de permisos por acción\n\n";
$md .= "> Generado por `herramientas/inventario-permisos.php`. NO editar a mano: se regenera.\n";
$md .= "> Método y límites: ver la cabecera de ese script y `of4-permisos.md`.\n\n";
$md .= "- **Roles que la llaman**: roles cuyas pantallas contienen la llamada (aproximación por archivo; el `requerir_rol` manda).\n";
$md .= "- **requerir_rol interno**: roles que la acción (o su helper de contexto) admite. `(sin guardia de rol)` = no valida rol; si valida alcance por escuela se anota.\n";
$md .= "- **Listas**: en qué allowlist nueva quedó (A=admin, C=cajero, T=contador, D=distribuidor). Marcada **dudosa** cuando entró por el criterio \"ante la duda, admin\".\n\n";
$md .= "| Acción | Roles que la llaman | requerir_rol interno | Listas | Notas |\n|---|---|---|---|---|\n";
$letra = ['admin' => 'A', 'cajero' => 'C', 'contador' => 'T', 'distribuidor' => 'D'];
foreach ($acciones as $a) {
    $i = $info[$a];
    $llama = $i['publica'] ? 'público (sin sesión)' : ($i['llama'] ? implode(', ', $i['llama']) : '(nadie en el frontend)');
    if (count($i['llama']) >= 15) $llama = 'todos los roles';
    if ($i['duros'] !== null) $int = implode(', ', $i['duros']);
    elseif ($i['publica']) $int = '—';
    elseif ($i['guardia'] !== null) $int = '(inline, revisado) ' . (count($i['guardia']) >= 15 ? 'cualquier rol autenticado' : implode(', ', $i['guardia']));
    else $int = '(sin guardia de rol)' . ($i['escuela'] ? ' · valida escuela' : '');
    $en = []; foreach (ROLES_CON_LISTA_NUEVA as $R) if (in_array($a, $propuesta[$R], true)) $en[] = $letra[$R];
    $listas = $i['publica'] ? 'pública' : ($en ? implode('', $en) : '—');
    if (isset($dudosas[$a])) $listas .= ' (dudosa: ' . implode('/', array_map(function ($r) use ($letra) { return $letra[$r]; }, $dudosas[$a])) . ')';
    $notas = [];
    if (!empty($NOTAS[$a])) $notas[] = $NOTAS[$a];
    if ($i['huerfana']) $notas[] = 'Sin llamador en el frontend.';
    $md .= '| `' . $a . '` | ' . $llama . ' | ' . $int . ' | ' . $listas . ' | ' . str_replace('|', '/', implode(' ', $notas)) . " |\n";
}
$md .= "\n_" . count($acciones) . " acciones._\n";

if ($soloStdout) { echo $md; exit(0); }
$destino = $raiz . '/docs/mejoras-of/of4-permisos-inventario.md';
file_put_contents($destino, str_replace("\n", "\r\n", $md));
echo "Escrito $destino (" . count($acciones) . " acciones)\n";
foreach ($propuesta as $R => $l) echo "  $R: " . count($l) . "\n";
