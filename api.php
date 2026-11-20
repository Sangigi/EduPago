<?php
/**
 * EduPago — Backend API v4 (Segura con DB)
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/mailer.php';
require_once __DIR__ . '/lib/helpers_pagos.php';
require_once __DIR__ . '/lib/helpers_comisiones.php';
require_once __DIR__ . '/lib/curl_helper.php';
require_once __DIR__ . '/lib/facturapi.php';
require_once __DIR__ . '/lib/uploads.php';
// Control escolar (13-nov-2026): reglas de acceso del módulo académico.
require_once __DIR__ . '/lib/helpers_escolar.php';
// [F1] Ciclo de vida del alumno (18-nov-2026): estatus (baja temporal/
// definitiva, egreso, traslado, reactivación) y bitácora alumno_movimientos.
require_once __DIR__ . '/lib/helpers_alumnos.php';
// ── Planes de suscripción ───────────────────────────────────────────────
// La tabla (precios, límites, etiquetas) vivía AQUÍ y estaba copiada a mano
// en cron_recordatorios.php, views/MiSuscripcion.js y assets/js/registro.js.
// Las copias se desincronizaron —el cron acabó con los tres planes a $50 y
// el correo real decía $3,000— así que ahora hay una sola fuente:
// lib/planes.php. Sigue exponiendo PLANES_LIMITES, PLAN_FALLBACK y
// limitesDelPlan() con la misma forma de siempre.
require_once __DIR__ . '/lib/planes.php';
// [F6] Monedero del alumno y tiendita (18-nov-2026). Libro mayor, acceso y
// barrido de recargas pagadas: ver la cabecera de ese archivo.
require_once __DIR__ . '/lib/helpers_monedero.php';
// ── Secciones del menú que el super admin puede habilitar/deshabilitar por
// colegio — fuente única de verdad (debe reflejar el mismo listado de ids
// que NAV_ITEMS en assets/js/app.js para las secciones de admin/cajero).
// No incluye las secciones exclusivas de superadmin (escuelas, suscripciones,
// usuarios, logs, comisiones, superreportes, busqueda_global): esas son
// herramientas del operador de la plataforma, no del colegio.
const SECCIONES_DISPONIBLES = [
    'dashboard'     => 'Dashboard',
    'caja'          => 'Ingresos',
    'corte_caja'    => 'Corte de caja',
    'cobros'        => 'Historial de cobros',
    'gastos'        => 'Gastos',
    'alumnos'       => 'Alumnos',
    'familias'      => 'Familias',
    'productos'     => 'Conceptos de pago',
    'proveedores'   => 'Proveedores',
    'facturacion'   => 'Facturación',
    'recordatorios' => 'Recordatorios',
    'reportes'      => 'Reportes',
    'miequipo'      => 'Mi equipo',
    // [F6] Monedero y tiendita. Apagarlo esconde el menú del admin/cajero y la
    // pestaña del portal de familia, y bloquea recargas y ventas (no las
    // consultas de saldo: apagar el módulo no le esconde a nadie su dinero).
    'monedero'      => 'Monedero y tiendita',
    // Control escolar (13-nov-2026). Ver lib/helpers_escolar.php.
    'escolar_grupos'         => 'Grupos y horarios',
    'escolar_asistencias'    => 'Asistencias',
    'escolar_calificaciones' => 'Calificaciones',
    'escolar_config'         => 'Ciclos, materias y aulas',
];
// ── Vencimiento de suscripción: ciclo de calendario mensual ────────────────
// El primer periodo de un colegio nuevo se prorratea (vence a fin del mes en
// curso); de ahí en adelante cada renovación cubre un mes calendario completo
// (vence a fin del mes siguiente al de la fecha base). Ver Suscripciones.js.
function fin_de_mes_actual() {
    return date('Y-m-t');
}
// siguiente_vencimiento_mensual() se movio a lib/helpers_pagos.php: la
// necesitan tambien cron_recordatorios.php y webhooks/webhook_liga.php
// para la renovacion automatica, y esos archivos no incluyen api.php.
// ── Conceptos de pago recurrentes (colegiatura mensual/semestral/anual) ────
// Valida y normaliza los campos de recurrencia de un producto; usado tanto
// por crear_producto como editar_producto para no duplicar las reglas.
// Llama a respond() (termina la petición) si algo es inválido.
function validar_datos_recurrente($input) {
    $tipo = trim($input['tipo'] ?? 'unico');
    if (!in_array($tipo, ['unico', 'recurrente'], true)) $tipo = 'unico';
    if ($tipo !== 'recurrente') {
        return [
            'tipo' => 'unico', 'periodicidad_meses' => null, 'fecha_inicio' => null,
            'dia_ventana_inicio' => 1, 'dia_ventana_fin' => 5,
            'penalizacion_tipo' => null, 'penalizacion_valor' => null,
        ];
    }
    $periodicidad = intval($input['periodicidad_meses'] ?? 0);
    if (!in_array($periodicidad, [1, 6, 12], true)) {
        respond(['success' => false, 'error' => 'Periodicidad inválida: debe ser mensual (1), semestral (6) o anual (12).']);
    }
    $fecha_inicio = trim($input['fecha_inicio'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha_inicio)) {
        respond(['success' => false, 'error' => 'Fecha de inicio inválida para el concepto recurrente.']);
    }
    // El día en que abre la ventana de pago sin recargo NO se captura aparte:
    // es el mismo día-del-mes que elegiste en "Empieza a cobrarse", para no
    // pedir dos veces la misma información. Solo se captura el día de cierre.
    $dia_ini = intval(date('j', strtotime($fecha_inicio)));
    if ($dia_ini > 28) {
        respond(['success' => false, 'error' => 'Elige un día 1-28 en "Empieza a cobrarse" (los días 29-31 no existen en todos los meses, y este concepto se repite mes con mes).']);
    }
    $dia_fin = intval($input['dia_ventana_fin'] ?? 5);
    if ($dia_fin < 1 || $dia_fin > 28 || $dia_fin < $dia_ini) {
        respond(['success' => false, 'error' => 'El día de cierre de la ventana debe ser del 1 al 28, e igual o posterior al día en que empieza a cobrarse (día ' . $dia_ini . ').']);
    }
    $pen_tipo = trim($input['penalizacion_tipo'] ?? '') ?: null;
    $pen_valor = null;
    if ($pen_tipo !== null) {
        if (!in_array($pen_tipo, ['porcentaje', 'monto_fijo'], true)) {
            respond(['success' => false, 'error' => 'Tipo de penalización inválido.']);
        }
        $pen_valor = floatval($input['penalizacion_valor'] ?? 0);
        if ($pen_valor <= 0) {
            respond(['success' => false, 'error' => 'Define un valor de penalización mayor a cero, o deja el tipo de penalización vacío para no penalizar.']);
        }
        if ($pen_tipo === 'porcentaje' && $pen_valor > 100) {
            respond(['success' => false, 'error' => 'El porcentaje de penalización no puede ser mayor a 100.']);
        }
    }
    return [
        'tipo' => 'recurrente', 'periodicidad_meses' => $periodicidad, 'fecha_inicio' => $fecha_inicio,
        'dia_ventana_inicio' => $dia_ini, 'dia_ventana_fin' => $dia_fin,
        'penalizacion_tipo' => $pen_tipo, 'penalizacion_valor' => $pen_valor,
    ];
}
// Registra una acción sensible en logs_sistema. Nunca debe tumbar la
// petición si la tabla aún no existe (falta correr la migración) — se
// degrada a silencio + nota en api_log.txt, igual que hicimos con
// recordatorios.
// Lista blanca de parentescos. Se valida aqui y no con un ENUM en la tabla
// para poder agregar valores sin otra migracion. Cualquier valor no previsto
// cae en 'otro' en lugar de guardarse tal cual.
function normalizar_parentesco($valor) {
    $v = strtolower(trim((string)$valor));
    if ($v === '') return null;
    $permitidos = ['hijo','hija','hijastro','hijastra','sobrino','sobrina',
                   'nieto','nieta','ahijado','ahijada','hermano','hermana',
                   'tutorado','otro'];
    return in_array($v, $permitidos, true) ? $v : 'otro';
}

// Valida un enlace que terminara como src de un <img>.
// Solo http(s): sin esto se podria guardar javascript: o data: con contenido
// arbitrario. El frontend tambien valida, pero esta es la validacion que cuenta.
function validar_url_imagen($valor, $etiqueta = 'enlace') {
    $u = trim((string)$valor);
    if ($u === '') return null;
    if (preg_match('#^https?://#i', $u)) return mb_substr($u, 0, 512);
    // Ruta generada por guardar_archivo_subido() (lib/uploads.php) — permite
    // que un formulario que reenvía sin cambios el foto_url ya guardado (ej.
    // Alumnos.js -> editar_cliente al editar otro campo del alumno) no la
    // rechace solo porque ahora es un archivo subido y no un enlace externo.
    if (preg_match('#^uploads/[a-z0-9_]+/[A-Za-z0-9_.-]+$#', $u)) return $u;
    respond(['success' => false, 'error' => 'El ' . $etiqueta . ' debe empezar con http:// o https://']);
}

// registrar_log() se movio a lib/helpers_pagos.php por el mismo motivo:
// cron_recordatorios.php y webhooks/webhook_liga.php tambien la usan y
// no incluyen este archivo. Sigue disponible aqui via el require de
// arriba.
header('Content-Type: application/json; charset=UTF-8');
// Todas las respuestas son dinámicas (dependen del usuario/rol/momento): sin
// esto, algunos navegadores/proxies pueden servir una respuesta GET vieja de
// cargar_datos cacheada en disco en vez de pedir una fresca — un alumno recién
// importado o un total actualizado se ve "atorado" hasta que expire el caché.
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
// APP_ALLOWED_ORIGIN debe definirse en config.php (ej. 'https://tudominio.com')
header('Access-Control-Allow-Origin: ' . (defined('APP_ALLOWED_ORIGIN') ? APP_ALLOWED_ORIGIN : '*'));
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { 
    http_response_code(200); 
    exit(); 
}
function generar_token($user_id) {
    $exp = time() + APP_TOKEN_TTL;
    $payload = $user_id . '.' . $exp;
    $firma = hash_hmac('sha256', $payload, APP_TOKEN_SECRET);
    return base64_encode($payload . '.' . $firma);
}
function verificar_token_auth() {
    global $pdo;
    // Blindaje (10-sep-2026): CADA salida 401 de esta función usaba
    // echo+exit directo, nunca log_api() — así que cualquier problema de
    // login/sesión (header ausente, token vencido, sesión revocada, escuela
    // desactivada) fallaba en completo silencio, sin dejar rastro en
    // api_log.txt. Esta función corre ANTES del despacho a acciones/, así
    // que ni siquiera el try/catch de más abajo la cubre. Se agrega
    // log_api() en cada salida para poder ver la causa real la próxima vez
    // que alguien no pueda entrar/operar en el portal familia (o cualquier
    // otro rol).
    $accionLog = $_GET['action'] ?? '(sin action)';
    // apache_request_headers() no funciona en PHP-FPM/CGI (Hostinger).
    // Usamos múltiples fuentes para obtener el Authorization header.
    $authHeader = '';
    if (function_exists('apache_request_headers')) {
        $headers    = apache_request_headers();
        $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    }
    if (empty($authHeader)) {
        // Fallback para CGI/FPM — requiere RewriteRule en .htaccess
        $authHeader = $_SERVER['HTTP_AUTHORIZATION']
                   ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
                   ?? '';
    }
    if (empty($authHeader) || !preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
        log_api("AUTH FALLÓ ({$accionLog}) -> sin header Authorization. apache_request_headers()=" . (function_exists('apache_request_headers') ? 'sí' : 'no') . " HTTP_AUTHORIZATION=" . (isset($_SERVER['HTTP_AUTHORIZATION']) ? 'sí' : 'no') . " REDIRECT_HTTP_AUTHORIZATION=" . (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION']) ? 'sí' : 'no'));
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'No autorizado. Token requerido.']);
        exit;
    }
    $decoded = base64_decode($matches[1], true);
    $partes  = $decoded !== false ? explode('.', $decoded) : [];
    if (count($partes) !== 3) {
        log_api("AUTH FALLÓ ({$accionLog}) -> token con formato inválido (no son 3 partes tras decodificar)");
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Token inválido.']);
        exit;
    }
    [$user_id, $exp, $firma] = $partes;
    $firma_esperada = hash_hmac('sha256', $user_id . '.' . $exp, APP_TOKEN_SECRET);
    if (!hash_equals($firma_esperada, $firma) || intval($exp) < time()) {
        log_api("AUTH FALLÓ ({$accionLog}) -> user_id={$user_id} firma_valida=" . (hash_equals($firma_esperada, $firma) ? 'sí' : 'no') . " expirado=" . (intval($exp) < time() ? 'sí' : 'no') . " exp={$exp} now=" . time());
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Token inválido o expirado.']);
        exit;
    }
    // El rol y estado se leen siempre frescos de la BD (no del token),
    // así reflejan cualquier cambio (ej. desactivación) inmediatamente.
    // [F4] cliente_id liga una cuenta 'alumno' con su fila de clientes. Se lee
    // fresco aquí (como el rol) para que requerir_alumno_propio() nunca confíe
    // en lo que mande el navegador. Si la migración
    // migracion_2026_11_18_f4_roles.sql todavía no corrió, la columna no existe
    // y el SELECT truena: se reintenta SIN ella. Tumbar el login de TODOS los
    // roles por una columna nueva sería mucho peor que no poder usar el rol
    // alumno unos minutos (sin la columna cliente_id queda null y
    // requerir_alumno_propio() rechaza a las cuentas de alumno: fail-closed).
    try {
        $stmt = $pdo->prepare("SELECT id, rol, escuela_id, familia_id, cliente_id, activo, sesion_valida_desde FROM usuarios WHERE id = ?");
        $stmt->execute([intval($user_id)]);
    } catch (\PDOException $e) {
        // Sin log_api() a propósito: corre en CADA petición autenticada y llenaría
        // api_log.txt de líneas iguales hasta que se corra la migración.
        $stmt = $pdo->prepare("SELECT id, rol, escuela_id, familia_id, activo, sesion_valida_desde FROM usuarios WHERE id = ?");
        $stmt->execute([intval($user_id)]);
    }
    $usuario = $stmt->fetch();
    if (!$usuario || !$usuario['activo']) {
        log_api("AUTH FALLÓ ({$accionLog}) -> user_id={$user_id} " . (!$usuario ? 'no existe en usuarios' : 'activo=0'));
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Usuario no encontrado o inactivo.']);
        exit;
    }
    // Revocación de sesión: si cambiaste tu contraseña o un admin forzó el
    // cierre de sesión DESPUÉS de que se emitió este token, se rechaza aunque
    // la firma/expiración sigan siendo válidas — antes no había ninguna forma
    // de invalidar un token robado antes de que expirara solo (hasta 12h).
    if (!empty($usuario['sesion_valida_desde'])) {
        $emitido_en = intval($exp) - APP_TOKEN_TTL;
        if ($emitido_en < strtotime($usuario['sesion_valida_desde'])) {
            log_api("AUTH FALLÓ ({$accionLog}) -> user_id={$user_id} sesión revocada: emitido_en=" . date('Y-m-d H:i:s', $emitido_en) . " sesion_valida_desde={$usuario['sesion_valida_desde']}");
            http_response_code(401);
            echo json_encode(['success' => false, 'error' => 'Tu sesión fue cerrada. Inicia sesión de nuevo.']);
            exit;
        }
    }
    // Igual que con el usuario: si su escuela fue desactivada a media sesión, se corta el acceso.
    if ($usuario['escuela_id']) {
        $esc = $pdo->prepare("SELECT activa FROM escuelas WHERE id = ?");
        $esc->execute([$usuario['escuela_id']]);
        $escuela = $esc->fetch();
        if ($escuela && !$escuela['activa']) {
            log_api("AUTH FALLÓ ({$accionLog}) -> user_id={$user_id} escuela_id={$usuario['escuela_id']} inactiva");
            http_response_code(401);
            echo json_encode(['success' => false, 'error' => 'Esta escuela está inactiva.']);
            exit;
        }
    }
    return ['user_id' => intval($usuario['id']), 'rol' => $usuario['rol'], 'escuela_id' => $usuario['escuela_id'], 'familia_id' => $usuario['familia_id'] ? intval($usuario['familia_id']) : null,
        // [F4] Solo las cuentas 'alumno' lo traen lleno. Ver requerir_alumno_propio().
        'cliente_id' => !empty($usuario['cliente_id']) ? intval($usuario['cliente_id']) : null];
}

$action = $_GET['action'] ?? '';
// 'verificar_spei' ya NO es pública: sin esto, cualquiera sin sesión podía
// enumerar cobro_id secuenciales y leer estado/monto/autorización de
// cualquier cobro del sistema, de cualquier escuela.
// Acciones que NO requieren sesion. Se mantiene al minimo a proposito:
// 'invitacion_ver' e 'invitacion_enviar' son el formulario de alta de colegios,
// y su unica llave es el token de un solo uso que viaja en la liga.
$acciones_publicas = ['login', 'invitacion_ver', 'invitacion_enviar', 'invitacion_generar_pago', 'activar_cuenta_ver', 'activar_cuenta_confirmar', 'recuperar_password_solicitar'];
if (!in_array($action, $acciones_publicas)) {
    $usuario_actual = verificar_token_auth();
}

// ── CANDADO POR SUSCRIPCIÓN VENCIDA (25-sep-2026) ────────────────────────
//
// Hasta hoy el vencimiento NO SE VALIDABA EN NINGÚN LADO: `fecha_vencimiento_plan`
// y `fecha_fin_prueba` solo se escribían y se mostraban. Un colegio cuya
// suscripción caducó —o cuya prueba terminó— seguía usando el sistema
// completo, indefinidamente y gratis.
//
// La REGLA vive en suscripcion_estado() (lib/planes.php), no aquí: cargar_datos
// manda ese mismo resultado al navegador para que la pantalla de bloqueo y
// este candado no puedan discrepar.
//
// QUÉ SE BLOQUEA. Solo al personal del colegio: 'admin' y 'cajero'. Son ellos
// quienes contratan. Los roles de plataforma no tienen escuela_id, así que ni
// entran a este bloque. El portal de FAMILIAS se deja abierto a propósito
// (decisión del 25-sep-2026): el tutor es cliente del colegio, no nuestro, y
// dejarlo fuera dañaría esa relación por una deuda que él no tiene.
//
// QUÉ NO SE BLOQUEA, Y POR QUÉ IMPORTA. La lista blanca deja pasar justo el
// camino para PAGAR. Bloquear también eso sería el peor error posible: dejar
// al cliente encerrado fuera de la pantalla donde nos daría su dinero.
// cargar_datos entra porque sin él la aplicación no monta y el admin vería
// una pantalla en blanco en vez del aviso de que debe renovar.
$ACCIONES_PERMITIDAS_VENCIDO = [
    // Sin esto la SPA no arranca y no hay dónde enseñar el aviso.
    'cargar_datos',
    // El camino para pagar y volver a la normalidad.
    'escuela_generar_pago_renovacion', 'suscripcion_pagos_listar',
    'escuela_obtener_datos_pago',
    // Cuenta propia: que pueda entrar, cambiar su contraseña y salir.
    'cambiar_password_propio', 'editar_usuario', 'guia_marcar_vista',
];

if (isset($usuario_actual) && $usuario_actual && !empty($usuario_actual['escuela_id'])
    // 'docente' (13-nov-2026) es personal del colegio igual que admin/cajero.
    && in_array($usuario_actual['rol'] ?? '', ['admin', 'cajero', 'docente',
        // [F4] Coordinación académica y dirección también son personal del
        // colegio. 'alumno' NO va aquí: es como 'familia' (cliente del colegio,
        // no nuestro), así que su portal sigue abierto aunque el colegio venza.
        'control_escolar', 'direccion',
        // [F6] La tiendita también es personal del colegio.
        'tienda'], true)
    && !in_array($action, $ACCIONES_PERMITIDAS_VENCIDO, true)) {
    $estadoSus = suscripcion_estado($pdo, $usuario_actual['escuela_id']);
    if ($estadoSus['vencida']) {
        log_api("SUSCRIPCION VENCIDA -> escuela_id={$usuario_actual['escuela_id']} rol={$usuario_actual['rol']} accion={$action} limite={$estadoSus['limite']}");
        http_response_code(402); // Payment Required
        echo json_encode([
            'success' => false,
            'codigo'  => $estadoSus['en_demo'] ? 'prueba_terminada' : 'suscripcion_vencida',
            'limite'  => $estadoSus['limite'],
            'error'   => $estadoSus['en_demo']
                ? 'Tu periodo de prueba terminó. Activa tu suscripción para seguir usando el sistema.'
                : 'Tu suscripción venció. Renuévala para volver a usar el sistema.',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
}
// JSON_PRETTY_PRINT se quitó el 25-sep-2026. Servía para leer las respuestas a
// mano, pero lo pagaba el usuario en CADA petición: con sangría de 4 espacios
// por nivel, una respuesta de cargar_datos viaja ~78% más grande. Y hasta hoy
// el .htaccess no comprimía nada, así que ese relleno viajaba tal cual por la
// red. Para depurar a mano no hace falta: el navegador ya formatea el JSON en
// su pestaña de Red.
function respond($data) {
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}
// Valida un email opcional (puede venir vacío) antes de guardarlo en BD. Sin
// esto, cualquiera podía poner \r\n en su propio correo (clientes/familias) y
// usarlo después para inyectar cabeceras/comandos SMTP cuando cron_recordatorios.php
// le manda un correo (ver mailer.php) — con las credenciales SMTP reales de producción.
function validar_email_opcional($valor) {
    $valor = trim($valor ?? '');
    if ($valor === '') return null;
    if (strpbrk($valor, "\r\n") !== false || !filter_var($valor, FILTER_VALIDATE_EMAIL)) {
        respond(['success' => false, 'error' => 'El correo electrónico no es válido.']);
    }
    return $valor;
}
// Un admin (no superadmin) solo puede administrar usuarios de su propia
// escuela, y nunca a un superadmin — este check estaba copiado casi
// idéntico en 4 sitios (editar_usuario, toggle_usuario,
// cerrar_sesiones_usuario, eliminar_usuario). No hace nada si $rol_actual
// no es 'admin' (superadmin ya pasó el check de rol antes de llegar aquí).
function validar_admin_sobre_usuario($pdo, $rol_actual, $usuario_actual, $id, $mensaje = 'No tienes permiso para esta acción.') {
    if ($rol_actual !== 'admin') return;
    $chk = $pdo->prepare("SELECT escuela_id, rol FROM usuarios WHERE id = ?");
    $chk->execute([$id]);
    $objetivo = $chk->fetch();
    if (!$objetivo || $objetivo['rol'] === 'superadmin' || $objetivo['escuela_id'] != ($usuario_actual['escuela_id'] ?? null)) {
        http_response_code(403);
        respond(['success' => false, 'error' => $mensaje]);
    }
}
// Requiere que $rol_actual esté en la lista de roles permitidos; si no,
// corta con 403 y el mensaje dado. Reemplaza el patrón
// "if (!in_array($rolX, [...])) { http_response_code(403); respond([...]); }"
// que se repetía ~36 veces con distintas combinaciones de roles y mensajes,
// pero con el mismo cuerpo exacto cada vez.
function requerir_rol($rol_actual, array $roles_permitidos, $mensaje = 'No tienes permiso para esta acción.') {
    if (!in_array($rol_actual, $roles_permitidos, true)) {
        http_response_code(403);
        respond(['success' => false, 'error' => $mensaje]);
    }
}
// Roles de PLATAFORMA que ven TODAS las escuelas, no una sola (22-sep-2026).
//
// Es una pregunta de ALCANCE de lectura, no de permiso para actuar: responde
// "¿qué escuelas puede ver este usuario?", nunca "¿puede modificarlas?". Cada
// acción sigue decidiendo lo suyo con requerir_rol(), que es default-deny —
// un rol que no esté en su lista queda bloqueado aunque vea los datos.
//
// Existe para no repetir `$rol === 'superadmin'` en las ramas de alcance de
// cargar_datos.php: ese patrón hacía que agregar un rol de plataforma
// obligara a cazar cada comparación suelta, y olvidar una dejaba al rol
// nuevo viendo una lista de escuelas vacía sin ningún error visible.
//
// 'soporte' entra aquí porque su trabajo es justamente mirar cualquier
// colegio para responderle a quien llama. Lo que NO puede es escribir nada —
// pero OJO con el porqué:
//
// CORREGIDO 23-sep-2026. Aquí decía que eso lo garantizaba "su ausencia de
// las listas de requerir_rol()". Era FALSO y conviene dejarlo escrito para
// que nadie vuelva a creerlo: requerir_rol() es default-deny solo para las
// acciones que LA LLAMAN, y hay ~25 acciones que escriben en la base y nunca
// la llaman (crear_cobro.php entre ellas). Con esa premisa equivocada,
// 'soporte' podía insertar cobros reales en cualquier colegio.
//
// Lo que de verdad lo garantiza hoy es el allowlist explícito por rol de
// plataforma que corre ANTES del despacho, al final de este archivo. Si
// agregas un rol de plataforma, su seguridad viene de estar en ese allowlist,
// no de omitirlo en las listas de requerir_rol().
// [F4] Los roles nuevos ('control_escolar', 'direccion', 'alumno', y 'tienda' de
// la F6) NO van aquí: todos tienen escuela_id y solo ven la suya. Revisado el
// 18-nov-2026; no hace falta tocar esta función para ellos.
function rol_alcance_global($rol_actual) {
    return in_array($rol_actual, ['superadmin', 'soporte'], true);
}
// Roles de PLATAFORMA: no pertenecen a NINGÚN colegio. Su escuela_id debe
// quedar siempre en NULL — dejarles una los encierra en ese colegio y les vacía
// su propia pantalla, porque sus consultas asumen alcance global.
//
// Vive aquí, en una sola función, porque la misma lista se necesita al DAR DE
// ALTA (crear_usuario.php) y al EDITAR (editar_usuario.php), y tenerla escrita a
// mano en los dos lados ya falló: el rol 'promotor' se agregó al alta pero no a
// la edición, así que editarlo le grababa una escuela. Agregar un rol de
// plataforma nuevo es tocar ESTA función y nada más del lado del servidor.
// El espejo en el navegador es ROL_INFO (views/Usuarios.js), donde el campo
// equivalente se llama `sinEscuela`.
// [F4] Tampoco los roles nuevos: control_escolar, direccion y alumno pertenecen
// a un colegio (crear_usuario les exige escuela_id).
function rol_sin_escuela($rol) {
    return in_array($rol, ['distribuidor', 'contador', 'soporte', 'provision', 'tesoreria', 'promotor'], true);
}
// Requiere que $rol_actual sea 'superadmin' O que $escuela_id_fila coincida
// con la escuela del usuario — el patrón "superadmin ve todo, los demás solo
// lo de su propia escuela" repetido en checks de pertenencia sobre cobros,
// clientes, planteles, etc. Si $rol_actual ya viene pre-filtrado a un rol que
// nunca es 'superadmin' (ej. dentro de un if que ya separó admin/cajero),
// el resultado es el mismo: solo importa el match de escuela_id.
function requerir_escuela_propia($rol_actual, $escuela_id_fila, $usuario_actual, $mensaje) {
    if ($rol_actual !== 'superadmin' && intval($escuela_id_fila) !== intval($usuario_actual['escuela_id'] ?? -1)) {
        http_response_code(403);
        respond(['success' => false, 'error' => $mensaje]);
    }
}
// Defensa en profundidad para el toggle de secciones por escuela
// (superadmin_toggle_seccion_escuela.php / escuelas.secciones_deshabilitadas):
// hasta ahora ese campo solo se usaba para ocultar el ítem de menú en el
// frontend (assets/js/app.js), así que un admin/cajero con la sección oculta
// podía seguir llamando el endpoint directo por API. Este helper bloquea eso.
//
// Solo aplica a roles 'admin'/'cajero' — el toggle es sobre EL MENÚ admin/
// cajero de una escuela: superadmin (dueño del toggle) y los portales de
// autoservicio (familia, distribuidor) nunca deben verse afectados por él.
// $secciones acepta una o varias secciones "dueñas" de la acción: si CUALQUIERA
// de ellas sigue habilitada, se permite — solo bloquea cuando TODAS las
// secciones que legítimamente usan este endpoint están deshabilitadas para
// esa escuela. Esto evita romper flujos compartidos entre dos secciones
// (ej. generar_cfdi lo usan tanto 'caja' como 'facturacion') con solo
// apagar una de las dos.
function requerir_seccion_habilitada($pdo, $rol_actual, $escuela_id, $secciones, $mensaje = 'Esta sección no está disponible para tu cuenta.') {
    // [F4] control_escolar y direccion son personal del colegio igual que admin y
    // cajero: si el super admin apagó una sección para el colegio, también se les corta.
    if (!in_array($rol_actual, ['admin', 'cajero', 'control_escolar', 'direccion'], true)) return;
    // Mantenimiento GLOBAL primero: afecta a todas las escuelas sin importar
    // su propio secciones_deshabilitadas. Vive en lib/helpers_pagos.php
    // porque cron_recordatorios.php y webhooks/webhook_liga.php tambien lo
    // necesitan y no incluyen este archivo.
    requerir_seccion_sin_mantenimiento($pdo, $rol_actual, $secciones);
    // Apagado GLOBAL simple (10-sep-2026), sin ser "mantenimiento": el de
    // arriba (requerir_seccion_sin_mantenimiento) exige motivo + se muestra
    // como aviso de mantenimiento temporal. Esto es solo un interruptor
    // permanente para todas las escuelas a la vez, igual de simple que el
    // apagado por escuela -- ver superadmin_toggle_seccion_global.php.
    $deshabilitadasGlobal = [];
    try {
        $stmtGlobal = $pdo->prepare("SELECT valor FROM config_sistema WHERE clave = 'secciones_deshabilitadas_global' LIMIT 1");
        $stmtGlobal->execute();
        $rowGlobal = $stmtGlobal->fetch();
        if ($rowGlobal && $rowGlobal['valor']) {
            $tmpGlobal = json_decode($rowGlobal['valor'], true);
            if (is_array($tmpGlobal) && !empty($tmpGlobal['deshabilitadas'])) $deshabilitadasGlobal = $tmpGlobal['deshabilitadas'];
        }
    } catch (\PDOException $e) {
        // config_sistema todavía no migrada: se comporta como "nada apagado".
    }
    $deshabilitadas = $deshabilitadasGlobal;
    if ($escuela_id) {
        $stmt = $pdo->prepare("SELECT secciones_deshabilitadas FROM escuelas WHERE id = ?");
        $stmt->execute([$escuela_id]);
        $row = $stmt->fetch();
        $propias = $row ? json_decode($row['secciones_deshabilitadas'] ?? '', true) : null;
        if (is_array($propias)) $deshabilitadas = array_merge($deshabilitadas, $propias);
    }
    foreach ((array) $secciones as $s) {
        if (!in_array($s, $deshabilitadas, true)) return; // al menos una sección dueña sigue habilitada
    }
    http_response_code(403);
    respond(['success' => false, 'error' => $mensaje]);
}
// Requiere que $familia_id_fila coincida con la familia del usuario actual.
// El llamador resuelve aparte si este check aplica (ej. dentro de un
// if ($rol === 'familia')) y qué pasar como $familia_id_fila cuando la fila
// no existe (normalmente null, vía "$fila['familia_id'] ?? null" — nunca
// coincide con un familia_id real, así que se deniega igual que antes).
//
// [F0] $escuela_id_fila (opcional, 18-nov-2026): si el llamador ya tiene a la
// mano la escuela de la fila (cobro/alumno), se exige además que sea la
// escuela del usuario. Coincidir solo en familia_id no basta: si un alumno
// quedó ligado por error a una familia de OTRO colegio (dato cruzado), la
// familia podía operar sobre él en una escuela que no es la suya. Se deja
// opcional para no romper las llamadas que no la pasan (siguen igual que antes).
function requerir_familia_propia($familia_id_fila, $usuario_actual, $mensaje, $escuela_id_fila = null) {
    if (intval($familia_id_fila ?? -1) !== intval($usuario_actual['familia_id'] ?? -2)) {
        http_response_code(403);
        respond(['success' => false, 'error' => $mensaje]);
    }
    // [F0] Pertenencia por escuela, solo si el llamador la mandó.
    if ($escuela_id_fila !== null && intval($escuela_id_fila) !== intval($usuario_actual['escuela_id'] ?? -1)) {
        http_response_code(403);
        respond(['success' => false, 'error' => $mensaje]);
    }
}
// [F4] Equivalente de requerir_familia_propia() para el rol 'alumno': la fila
// (un clientes.id) tiene que ser la del propio alumno. Compara contra
// usuarios.cliente_id, que verificar_token_auth() lee FRESCO de la base en
// cada petición, nunca contra algo que mande el navegador.
//
// Una cuenta sin cliente_id (migración pendiente o cuenta mal creada) se
// rechaza siempre: sin vínculo no hay "propio".
function requerir_alumno_propio($cliente_id_fila, $usuario_actual, $mensaje = 'Solo puedes consultar tu propia información.') {
    $propio = intval($usuario_actual['cliente_id'] ?? 0);
    if ($propio <= 0 || intval($cliente_id_fila ?? -1) !== $propio) {
        http_response_code(403);
        respond(['success' => false, 'error' => $mensaje]);
    }
}
// [F4] ¿La acción está en el allowlist de un rol? Una entrada con forma
// 'prefijo_*' admite cualquier acción que empiece con 'prefijo_' (ej.
// 'escolar_*' cubre escolar_boleta, escolar_promover...). Las entradas sin '*'
// se comparan EXACTO, igual que antes, así que las listas que ya existían no
// cambian de comportamiento.
//
// OJO: un comodín también abre las acciones FUTURAS con ese prefijo. Solo se
// usa para roles cuyo módulo completo es suyo (control_escolar con escolar_* y
// alumno_*); esas acciones validan rol y escuela por dentro. Para roles que no
// deben heredar nada nuevo ('alumno', 'direccion') la lista es explícita.
function accion_en_allowlist($accion, array $lista) {
    if (in_array($accion, $lista, true)) return true;
    foreach ($lista as $entrada) {
        if (strlen($entrada) > 2 && substr($entrada, -2) === '_*'
            && strpos($accion, substr($entrada, 0, -1)) === 0) {
            return true;
        }
    }
    return false;
}
// [OF-4b] Decisión del candado por allowlist, como función PURA (sin log, sin
// respond(), sin tocar globales) para poder probarla fuera de api.php.
// Devuelve:
//   'permitir'  el rol no tiene lista, o la acción está en ella;
//   'registrar' la acción está FUERA de la lista pero el rol está en modo
//               registro (el llamador la deja pasar y la anota en api_log.txt);
//   'bloquear'  fuera de la lista y sin modo registro: 403.
// Modo registro: 'familia' mientras ALLOWLIST_FAMILIA_ESTRICTA sea false, y
// 'admin', 'cajero', 'contador' y 'distribuidor' mientras ALLOWLIST_ROLES_ESTRICTA
// sea false. Todos los demás roles con lista (soporte, provision, promotor,
// tesoreria, docente, alumno, control_escolar, direccion, tienda) son siempre
// estrictos. 'superadmin' no tiene lista: siempre 'permitir'.
function decision_allowlist_rol($rol, $accion, array $listas, $familia_estricta, $roles_estricta) {
    if (!isset($listas[$rol])) return 'permitir';
    if (accion_en_allowlist($accion, $listas[$rol])) return 'permitir';
    if ($rol === 'familia') return $familia_estricta ? 'bloquear' : 'registrar';
    if (in_array($rol, ['admin', 'cajero', 'contador', 'distribuidor'], true)) {
        return $roles_estricta ? 'bloquear' : 'registrar';
    }
    return 'bloquear';
}
// [F4] Equivalente de validar_admin_sobre_usuario() para 'control_escolar': su
// "Mi equipo" se limita a docentes y cuentas de alumno de SU escuela. Una cuenta
// de admin, cajero, dirección u otra coordinación no se toca (y un id de otro
// colegio responde igual que uno inexistente). No hace nada para otros roles.
function validar_control_escolar_sobre_usuario($pdo, $rol_actual, $usuario_actual, $id, $mensaje = 'No tienes permiso para esta acción.') {
    if ($rol_actual !== 'control_escolar') return;
    $chk = $pdo->prepare("SELECT escuela_id, rol FROM usuarios WHERE id = ?");
    $chk->execute([$id]);
    $objetivo = $chk->fetch();
    if (!$objetivo || !in_array($objetivo['rol'], ['docente', 'alumno'], true)
        || intval($objetivo['escuela_id']) !== intval($usuario_actual['escuela_id'] ?? -1)) {
        http_response_code(403);
        respond(['success' => false, 'error' => $mensaje]);
    }
}
// [F4] Roles del colegio que operan alumnos/familias/control escolar pero NO ven
// dinero: coordinación académica y dirección. cargar_datos y las respuestas de
// editar_cliente/editar_familia/alumno_fila_para_respuesta los usan para no
// mandarles cobros, CLABEs, tokens de tarjeta, saldos ni datos fiscales.
function rol_sin_finanzas($rol) {
    return in_array($rol, ['control_escolar', 'direccion'], true);
}
// [F4] Quita de una fila (alumno, familia, plantel) las columnas financieras.
// Es una lista NEGRA por nombre de columna, a propósito: las filas vienen de
// SELECT * y aquí no se conoce el esquema completo; cualquier columna que huela
// a dinero o a datos fiscales (CLABE, token de tarjeta, CAI/domiciliación,
// saldo, RFC, razón social, régimen, factura/CFDI, cobros, pagos, bancos) sale.
// Una columna financiera nueva con un nombre que no encaje aquí SÍ se filtraría:
// al agregar una a clientes/familias, revisa este patrón.
function quitar_campos_financieros(array $fila) {
    foreach (array_keys($fila) as $k) {
        if (preg_match('/clabe|token|tarjeta|(^|_)cai(_|$)|saldo|rfc|razon_social|regimen|factura|cfdi|cobro|pago|banco|comision|colegiatura/i', (string) $k)) {
            unset($fila[$k]);
        }
    }
    return $fila;
}
$input = json_decode(file_get_contents('php://input'), true) ?? [];
// El switch gigante de 79 casos se reemplazó por un despacho a archivos
// individuales en acciones/ (uno por acción, mismo contenido que tenía cada
// case). Whitelist estricta de $action ANTES de tocar el filesystem — sin
// esto, $action (viene de $_GET, controlado por quien llama) podría
// construir una ruta con ../ y forzar la inclusión de un archivo arbitrario.
if (!preg_match('/^[a-z_]+$/', $action)) {
    respond(['success' => false, 'error' => "Acción no reconocida: {$action}"]);
}
// ── CANDADO DE ROLES DE PLATAFORMA (23-sep-2026) ────────────────────────
//
// Esto corrige una afirmación FALSA que estuvo escrita en este mismo archivo:
// que a 'soporte' le bastaba con no aparecer en las listas de requerir_rol()
// para no poder escribir nada. No es cierto. El default-deny de
// requerir_rol() solo protege a las acciones que LA LLAMAN, y hay ~25
// acciones que escriben en la base y nunca la llaman.
//
// El caso más grave, verificado: acciones/crear_cobro.php no llama a
// requerir_rol() en ninguna línea. Sus otros filtros no cubren a un rol de
// plataforma — requerir_seccion_habilitada() abre con
// `if ($rol !== 'admin' && $rol !== 'cajero') return;` (no-op), el chequeo de
// familia vive dentro de `if ($rol === 'familia')`, y el de caja abierta
// dentro de `if (in_array($rol, ['cajero','admin']))`. Como $escuela_id sale
// de $input sin comparar contra el usuario, cualquier cuenta de plataforma
// podía insertar cobros reales en CUALQUIER colegio.
//
// En vez de parchar acción por acción (frágil: la próxima acción que alguien
// escriba nace insegura otra vez), estos tres roles pasan a un allowlist
// EXPLÍCITO aquí, antes del despacho. Lo que no esté en su lista, se niega.
//
// Deliberadamente NO cambió el comportamiento de los roles que ya existían
// (admin, cajero, familia, contador, distribuidor): ese hueco es anterior a
// estos roles y arreglarlo a ciegas rompería endpoints en producción. Queda
// documentado en PRODUCCION.md como trabajo aparte.
// [F0] Excepción desde el 18-nov-2026: 'familia' ya tiene lista propia, en
// modo registro (ver la entrada 'familia' y ALLOWLIST_FAMILIA_ESTRICTA).
// [OF-4b] Excepción desde el 19-nov-2026: 'admin', 'cajero', 'contador' y
// 'distribuidor' también tienen lista, en MODO REGISTRO (ver las entradas
// de esos roles y ALLOWLIST_ROLES_ESTRICTA). Solo 'superadmin' queda SIN lista,
// a propósito: puede todo.
$ACCIONES_POR_ROL_PLATAFORMA = [
    // Solo lectura. Su trabajo es mirar cualquier colegio para poder atender.
    'soporte' => [
        'cargar_datos', 'buscar_global', 'listar_logs', 'listar_cobros',
        'detalle_cobro', 'listar_usuarios', 'listar_gastos',
        'listar_pagos_no_aplicados', 'planteles_de_escuela', 'listar_zonas',
        'cambiar_password_propio', 'editar_usuario', 'guia_marcar_vista',
        // [OF-4a] Detector de incoherencias (solo lectura; exige superadmin o
        // soporte por dentro). Pantalla views/Diagnostico.js.
        'diagnostico_incoherencias',
        // Para poder aclarar con el cliente AL MOMENTO (25-sep-2026). Sin
        // estas tres, soporte tenía que pedirle al superadmin que mirara por
        // él justo las tres preguntas más frecuentes: "¿qué pagué de mi
        // suscripción?", "¿en qué va mi documentación?" y "¿qué datos de
        // cobro tengo registrados?".
        //
        // Las tres son de SOLO LECTURA y validan por dentro. Ojo con el
        // patrón de tres capas: poner el rol en el requerir_rol de la acción
        // NO basta, porque este allowlist corre ANTES del despacho.
        //
        // 'descargar_documento_escuela' NO se agrega a propósito: soporte
        // necesita el ESTADO de un documento, no ver el INE escaneado del
        // representante legal. listar_documentos_escuela le da el estado sin
        // exponer el archivo.
        'suscripcion_pagos_listar', 'listar_documentos_escuela',
        'escuela_obtener_datos_pago',
        // [OF-7a] Tickets de soporte y Ayuda. Aquí soporte SÍ escribe (responde, nota
        // interna, asigna, edita artículos), pero solo en estas acciones, que validan
        // rol por dentro (soporte_* / ayuda_*). Lista explícita, sin comodines.
        'soporte_tickets_listar', 'soporte_ticket_ver', 'soporte_ticket_responder',
        'soporte_ticket_actualizar', 'soporte_adjunto_descargar', 'soporte_resumen',
        'ayuda_listar', 'ayuda_guardar',
    ],
    // Captura el identificador del proveedor tras la aprobación del contador.
    //
    // 23-sep-2026: se le suma REVISAR documentos y asignar el ID externo.
    //   · 'revisar_documento_escuela' — provisión es quien hace el trámite con
    //     el proveedor, así que es quien descubre que un documento no sirve
    //     para ese trámite aunque el contador ya lo hubiera dado por bueno.
    //     Sin esto, la única salida era pedirle al contador que lo rechazara.
    //   · 'asignar_id_externo' — es el "ID Escuela" que genera Savala. Antes
    //     lo capturaba el contador (ver views/Contador.js); ahora es trabajo de
    //     provisión, que es quien lo recibe del proveedor.
    //
    // OJO: este allowlist corre ANTES del despacho. Agregar el rol al
    // requerir_rol de la acción y olvidarlo aquí da un 403 que solo deja
    // rastro en api_log.txt y se diagnostica mal como problema de frontend.
    'provision' => [
        'provision_listar_pendientes', 'provision_asignar_id', 'escuela_set_contrato_estado', 'enviar_contrato_escuela', 'descargar_contrato_firmado',
        'listar_documentos_escuela', 'descargar_documento_escuela',
        'revisar_documento_escuela', 'asignar_id_externo',
        'escuela_obtener_datos_pago',
        'cambiar_password_propio', 'editar_usuario', 'guia_marcar_vista',
    ],
    // Invita colegios como un distribuidor, pero sin comisiones. La ausencia
    // de comisión NO se configura aquí: sale de que invitacion_crear.php solo
    // llena distribuidor_id cuando el rol es exactamente 'distribuidor', y sin
    // esa columna nunca se crea la fila de distribuidor_referidos.
    'promotor' => [
        'invitacion_crear', 'invitaciones_listar', 'invitacion_regenerar',
        'cambiar_password_propio', 'editar_usuario', 'guia_marcar_vista',
    ],
    // Cuentas por pagar a proveedores.
    'tesoreria' => [
        'tesoreria_cuentas_por_pagar', 'tesoreria_marcar_pagado',
        // Pagarle al distribuidor es trabajo de tesorería (24-sep-2026).
        // OJO: este allowlist corre ANTES del despacho. Si se olvida una
        // acción aquí, el 403 solo deja rastro en api_log.txt.
        'comisiones_estado_cuenta', 'comisiones_registrar_pago',
        'listar_gastos', 'cambiar_password_propio', 'editar_usuario', 'guia_marcar_vista',
    ],
    // Docente (13-nov-2026). NO es rol de plataforma —pertenece a un colegio—
    // pero va en este allowlist por la misma razón de fondo: es un rol nuevo y
    // no debe heredar el hueco histórico de las ~25 acciones sin
    // requerir_rol(). Lo más delicado que queda fuera es cargar_datos, que le
    // mandaría saldos, cobros y datos de contacto de toda la escuela. Su panel
    // (views/PortalDocente.js) trae todo con estas acciones, que además
    // validan por dentro que el grupo/materia sea suyo (lib/helpers_escolar.php).
    'docente' => [
        'escolar_catalogos', 'escolar_grupo_detalle', 'escolar_horario_docente',
        'escolar_asistencia_obtener', 'escolar_asistencia_guardar', 'escolar_asistencia_reporte',
        'escolar_calificaciones_obtener', 'escolar_calificaciones_guardar',
        'escolar_resumen_grupo', 'escolar_boleta',
        'cambiar_password_propio', 'editar_usuario', 'guia_marcar_vista',
    ],
    // [F0] Familia (18-nov-2026). Rol que ya existía y que heredaba el hueco de
    // las acciones sin requerir_rol(): con su token podía llamar caja_movimiento,
    // crear_familia, liberar_clabe_pool, etc. de su propio colegio (y algunas
    // de cualquier colegio). Esta es la lista EXACTA de lo que su portal llama
    // hoy (grep de views/PortalFamilia.js, views/EscolarFamilia.js,
    // views/components/FichaTecnica.js, assets/js/spei_poller.js, app.js y los
    // controllers que esas vistas usan) más las acciones nuevas que el
    // proyecto de estudiantes le va a dar. Cada una valida por dentro que el
    // alumno/cobro sea de SU familia; esta lista solo corta lo que su portal
    // nunca debería llamar.
    //
    // Arranca en MODO REGISTRO (ver ALLOWLIST_FAMILIA_ESTRICTA más abajo): lo
    // que quede fuera se deja pasar pero se anota en api_log.txt.
    'familia' => [
        // Arranque y cuenta propia.
        'cargar_datos', 'guia_marcar_vista', 'cambiar_password_propio', 'editar_usuario',
        // Datos de su familia y de sus hijos (campos limitados por dentro).
        'editar_familia', 'editar_cliente', 'subir_foto_cliente',
        // Consulta de cobros, comprobantes fiscales y saldo.
        // confirmar_pago: hoy el portal ya no la llama (el poller usa
        // verificar_spei), pero la acción conserva su rama de familia, que
        // solo refresca un cobro YA pagado por el webhook; se deja para no
        // cortar una pestaña vieja con JS en caché.
        'detalle_cobro', 'descargar_cfdi', 'descargar_complemento_pago',
        'verificar_saldo_alumno', 'verificar_spei', 'confirmar_pago',
        // Pagar: tarjeta (liga), efectivo en tienda, pago agrupado.
        'generar_liga', 'generar_referencia_efectivo', 'iniciar_pago_agrupado',
        // Domiciliación (en pausa, pero el portal todavía tiene los botones).
        'cobrar_cai', 'cancelar_cai',
        // Control escolar de sus hijos. escolar_boleta ya trae su rama de
        // familia (requerir_familia_propia) aunque hoy el portal no la llama.
        'escolar_familia_resumen', 'escolar_boleta',
        // Nuevas del proyecto de estudiantes (F2, F3, F6). Si esa fase aún no
        // se integra, el archivo no existe y api.php responde "Acción no
        // reconocida" igual que hoy.
        'alumno_aviso_privacidad_aceptar', 'escolar_kardex',
        'monedero_saldo', 'monedero_movimientos', 'monedero_recargar', 'monedero_config_guardar',
    ],
    // [OF-4b] admin, cajero, contador y distribuidor (19-nov-2026). Son los roles
    // más viejos y los que más pegan al hueco de las ~25 acciones sin
    // requerir_rol(): hasta hoy un cajero con su token podía llamar, p. ej.,
    // listar_usuarios (que le devuelve el equipo del colegio) o cualquier acción
    // futura que se escriba sin guardia. Estas listas son lo que cada rol usa
    // HOY desde su pantalla (inventario y método en
    // docs/mejoras-of/of4-permisos-inventario.md, generado con
    // herramientas/inventario-permisos.php).
    //
    // Arrancan en MODO REGISTRO (ver ALLOWLIST_ROLES_ESTRICTA más abajo): lo que
    // quede fuera se deja pasar pero se anota "ROL_FUERA_ALLOWLIST" en
    // api_log.txt. Lo marcado DUDOSA entró por el criterio "ante la duda, se
    // incluye": el backend admite al rol pero ninguna pantalla suya la llama hoy;
    // si tras una semana de log nadie la usa, se puede quitar.
    //
    // OJO: este allowlist corre ANTES del despacho. Un rol nuevo en el
    // requerir_rol de una acción NO basta: hay que agregarla aquí también.
    // Los comodines 'prefijo_*' solo se usan donde TODO el prefijo es del rol
    // (caja_*, distribuidor_*): abren también las acciones futuras con ese prefijo.
    //
    // Admin: todo el colegio (caja, cobranza, facturación, alumnos, control
    // escolar, equipo, gastos, catálogos, suscripción, monedero y tiendita).
    'admin' => [
        // Arranque y cuenta propia.
        'cargar_datos', 'cambiar_password_propio', 'editar_usuario', 'guia_marcar_vista',
        'editar_logo_escuela',
        // Caja y corte (todas las caja_* son de admin/cajero).
        'caja_*',
        // Cobros: crear, cobrar por cada método, seguimiento y cancelación.
        'crear_cobro', 'cancelar_cobro', 'marcar_cheque_rebotado', 'confirmar_pago',
        'verificar_spei', 'detalle_cobro', 'listar_cobros', 'tendencia_cobranza',
        'generar_liga', 'generar_referencia_efectivo', 'cobrar_cai',
        'listar_pagos_no_aplicados', 'resolver_pago_no_aplicado',
        // Domiciliación (en pausa). DUDOSA: ninguna pantalla de admin las llama;
        // el backend sí lo admite (las pinta el portal de familia).
        'cancelar_cai', 'iniciar_firma_cai',
        // Facturación.
        'generar_cfdi', 'enviar_factura_correo', 'descargar_cfdi', 'descargar_complemento_pago',
        'generar_complemento_pago', 'abonos_sin_complemento_listar',
        'cancelar_cfdi', 'cancelar_cfdi_actualizar', 'cfdi_cancelaciones_listar',
        // CLABEs. DUDOSAS: asignar_clabe_pool, asignar_clabe_pool_masivo,
        // liberar_clabe_individual (sin llamador) e importar_clabes /
        // eliminar_clabes_pool (solo las pinta Escuelas.js, de superadmin).
        'generar_clabe_individual', 'generar_clabes_individual_masivo', 'liberar_clabe_pool',
        'liberar_clabe_individual', 'asignar_clabe_pool', 'asignar_clabe_pool_masivo',
        'importar_clabes', 'eliminar_clabes_pool',
        // Cobranza: notas, compromisos de pago y recordatorios.
        'compromisos_pago_listar', 'familia_nota_cumplida', 'familia_nota_eliminar',
        'familia_nota_guardar', 'familia_notas_listar',
        'enviar_recordatorio_correo', 'marcar_recordatorio',
        // Alumnos y familias.
        'crear_cliente', 'editar_cliente', 'toggle_cliente_activo', 'importar_alumnos', 'subir_foto_cliente',
        'crear_familia', 'editar_familia',
        // Ciclo de vida del alumno, becas y expediente.
        'alumno_cambiar_estatus', 'alumno_cobros_pendientes', 'alumno_movimientos_listar',
        'alumno_beca_desactivar', 'alumno_beca_guardar', 'alumno_becas_listar',
        'alumno_expediente_guardar', 'alumno_expediente_obtener',
        'alumno_tutor_eliminar', 'alumno_tutor_guardar', 'alumno_tutores_listar',
        'alumno_documento_descargar', 'alumno_documento_eliminar', 'alumno_documento_subir',
        'alumno_documentos_listar',
        // Control escolar (lista explícita: un 'escolar_*' abriría también las futuras).
        'escolar_asistencia_guardar', 'escolar_asistencia_obtener', 'escolar_asistencia_reporte',
        'escolar_baja_alumno_grupo', 'escolar_boleta', 'escolar_buscar_alumnos',
        'escolar_calificaciones_guardar', 'escolar_calificaciones_obtener',
        'escolar_cargar_catalogo_grados', 'escolar_catalogos', 'escolar_cerrar_ciclo',
        'escolar_cerrar_periodo', 'escolar_grupo_detalle', 'escolar_guardar_aula',
        'escolar_guardar_ciclo', 'escolar_guardar_grado', 'escolar_guardar_grupo',
        'escolar_guardar_grupo_materia', 'escolar_guardar_horario', 'escolar_guardar_materia',
        'escolar_horario_docente', 'escolar_inscribir_alumnos', 'escolar_kardex',
        'escolar_mapear_grados', 'escolar_promover', 'escolar_publicar_periodo',
        'escolar_resumen_grupo',
        // Mi equipo.
        'listar_usuarios', 'crear_usuario', 'toggle_usuario', 'eliminar_usuario',
        'cerrar_sesiones_usuario', 'reenviar_credenciales', 'listar_zonas',
        // Gastos, proveedores y conceptos de pago.
        'listar_gastos', 'crear_gasto', 'editar_gasto', 'eliminar_gasto', 'subir_comprobante_gasto',
        'crear_proveedor', 'editar_proveedor', 'toggle_proveedor_activo',
        'crear_producto', 'editar_producto', 'toggle_producto_activo', 'producto_alcance_vista_previa',
        // Mi colegio: datos, suscripción, documentos y contrato.
        'escuela_editar_propia', 'escuela_generar_pago_renovacion', 'escuela_guardar_datos_pago',
        'escuela_obtener_datos_pago', 'suscripcion_pagos_listar',
        'subir_documento_escuela', 'subir_contrato_firmado', 'listar_documentos_escuela',
        // DUDOSAS: el backend admite al admin pero su pantalla no las llama (las
        // usa provisión/contador o la ficha de colegio del superadmin).
        'descargar_documento_escuela', 'descargar_contrato_firmado',
        'planteles_de_escuela', 'crear_plantel', 'editar_plantel', 'eliminar_plantel', 'toggle_plantel',
        // DUDOSAS: invitar colegios (hoy solo Escuelas/Distribuidor/Promotor).
        'invitacion_crear', 'invitacion_regenerar', 'invitaciones_listar',
        // Monedero y tiendita. DUDOSAS: monedero_saldo / movimientos / recargar /
        // config_guardar (el backend admite al admin; su pantalla usa reporte y
        // ajustes, no estas).
        'monedero_activar', 'monedero_ajuste', 'monedero_recarga_caja', 'monedero_reporte',
        'monedero_saldo', 'monedero_movimientos', 'monedero_recargar', 'monedero_config_guardar',
        'tienda_buscar_alumno', 'tienda_cancelar_venta', 'tienda_producto_guardar',
        'tienda_productos_listar', 'tienda_vender', 'tienda_ventas_dia',
        // [OF-7a] Ayuda: tickets de soporte de SU colegio, artículos y novedades.
        'soporte_ticket_crear', 'soporte_tickets_listar', 'soporte_ticket_ver',
        'soporte_ticket_responder', 'soporte_ticket_actualizar', 'soporte_adjunto_descargar',
        'soporte_resumen', 'ayuda_listar', 'ayuda_novedades_vistas',
    ],
    // Cajero: caja y cobro del día, más consultar/dar de alta alumnos. NO ve
    // gastos, facturación en lote, catálogos, equipo ni configuración. Cada
    // acción valida por dentro (requerir_rol / escuela propia); esta lista solo
    // corta lo que su pantalla nunca llama. Sin listar_usuarios aunque la
    // acción no valida rol: Alumnos.js solo la pide con puedeAccesoAlumno.
    'cajero' => [
        'cargar_datos', 'cambiar_password_propio', 'editar_usuario', 'guia_marcar_vista',
        // Caja y corte.
        'caja_*',
        // Cobros.
        'crear_cobro', 'cancelar_cobro', 'marcar_cheque_rebotado', 'confirmar_pago',
        'verificar_spei', 'detalle_cobro', 'listar_cobros', 'tendencia_cobranza',
        'generar_liga', 'generar_referencia_efectivo', 'cobrar_cai',
        'generar_cfdi', 'enviar_factura_correo', 'generar_clabe_individual',
        // DUDOSAS: el backend nombra al cajero pero ninguna pantalla la llama.
        'iniciar_firma_cai', 'asignar_clabe_pool',
        // Alta de alumnos y becas (solo lectura).
        'crear_cliente', 'alumno_becas_listar',
        // Notas de cobranza.
        'compromisos_pago_listar', 'familia_nota_cumplida', 'familia_nota_eliminar',
        'familia_nota_guardar', 'familia_notas_listar',
        // Monedero: recarga en ventanilla y búsqueda de alumno.
        'monedero_recarga_caja', 'tienda_buscar_alumno',
        // [OF-7a] Ayuda: tickets de soporte de SU colegio, artículos y novedades.
        'soporte_ticket_crear', 'soporte_tickets_listar', 'soporte_ticket_ver',
        'soporte_ticket_responder', 'soporte_ticket_actualizar', 'soporte_adjunto_descargar',
        'soporte_resumen', 'ayuda_listar', 'ayuda_novedades_vistas',
    ],
    // Contador: revisa los documentos y datos de pago de CUALQUIER colegio
    // (views/Contador.js). Sin cargar_datos: su panel no lo pide (ROLES_SIN_CARGAR_DATOS).
    // DUDOSAS fuera de la lista: listar_pagos_no_aplicados y resolver_pago_no_aplicado
    // (requerir_rol admite al contador pero su panel no las llama) y
    // asignar_id_externo (Contador.js aún la invoca, pero ya la rechaza requerir_rol).
    'contador' => [
        'contador_listar_escuelas', 'listar_documentos_escuela', 'descargar_documento_escuela',
        'escuela_obtener_datos_pago',
        'cambiar_password_propio', 'editar_usuario', 'guia_marcar_vista',
    ],
    // Distribuidor: su portal de referidos (views/Distribuidor.js) y el panel de
    // invitaciones. Todas las distribuidor_* son suyas.
    'distribuidor' => [
        'distribuidor_*',
        'invitacion_crear', 'invitaciones_listar', 'invitacion_regenerar',
        // DUDOSA: el backend admite al distribuidor pero ninguna pantalla la llama.
        'comisiones_historial_tasas',
        'cambiar_password_propio', 'editar_usuario', 'guia_marcar_vista',
    ],
    // [F4] Roles nuevos del colegio (18-nov-2026). Ninguno es de plataforma
    // (todos tienen escuela_id) pero van en este allowlist por la misma razón que
    // 'docente': un rol nuevo no debe heredar el hueco de las ~25 acciones que
    // escriben sin llamar a requerir_rol(). Son listas CERRADAS: lo que no esté
    // aquí se niega con 403 antes de despachar. (La coincidencia por 'prefijo_*'
    // la resuelve accion_en_allowlist().)
    //
    // Alumno: su propio portal (views/PortalAlumno.js). Lista EXPLÍCITA, sin
    // comodines: cada acción valida por dentro que el alumno sea él mismo
    // (requerir_alumno_propio / escolar_requerir_alumno_visible). Sin cargar_datos
    // ni nada de cobranza: no ve adeudos de su familia.
    'alumno' => [
        'alumno_resumen', 'escolar_boleta', 'escolar_kardex',
        'monedero_saldo', 'monedero_movimientos', // F6: si esa fase aún no se integra, responde "Acción no reconocida"
        'cambiar_password_propio', 'editar_usuario', 'guia_marcar_vista',
    ],
    // Coordinación académica: alumnos, familias, expediente y control escolar.
    // NADA de cobranza, caja, facturación, gastos ni productos; cargar_datos le
    // llega sin información financiera (ver acciones/cargar_datos.php). Los
    // comodines cubren el módulo escolar y el expediente (F1/F2/F3), cuyas
    // acciones validan rol y escuela por dentro. Ojo: abren también las acciones
    // FUTURAS 'escolar_*' / 'alumno_*' -- si alguna es de cobranza, no la nombres así.
    // alumno_resumen cae en 'alumno_*' pero exige rol 'alumno' por dentro.
    'control_escolar' => [
        'escolar_*', 'alumno_*',
        'cargar_datos',
        'crear_cliente', 'editar_cliente', 'toggle_cliente_activo', 'importar_alumnos', 'subir_foto_cliente',
        'crear_familia', 'editar_familia',
        // Mi equipo, limitado a docentes y cuentas de alumno de su escuela (lo
        // validan crear_usuario / listar_usuarios / toggle_usuario /
        // reenviar_credenciales por dentro).
        'listar_usuarios', 'crear_usuario', 'toggle_usuario', 'reenviar_credenciales',
        'cambiar_password_propio', 'editar_usuario', 'guia_marcar_vista',
    ],
    // Dirección: SOLO LECTURA académica y de alumnos. Lista explícita a propósito
    // (sin comodines): un 'escolar_*' le abriría también las acciones que escriben.
    'direccion' => [
        'cargar_datos',
        'escolar_catalogos', 'escolar_grupo_detalle', 'escolar_asistencia_obtener',
        'escolar_asistencia_reporte', 'escolar_calificaciones_obtener',
        'escolar_resumen_grupo', 'escolar_boleta', 'escolar_kardex', 'escolar_horario_docente',
        'alumno_expediente_obtener', 'alumno_tutores_listar', 'alumno_documentos_listar',
        'alumno_documento_descargar', 'alumno_movimientos_listar',
        'cambiar_password_propio', 'editar_usuario', 'guia_marcar_vista',
    ],
];
// [F0] Modo registro de la allowlist de 'familia'. A diferencia de los roles
// nuevos, 'familia' lleva meses en producción y su lista se armó con grep, no
// con tráfico real: si se nos escapó una llamada, cortarla de golpe dejaría a
// los papás sin poder pagar. Por eso arranca en false: lo que esté fuera de
// la lista SE PERMITE pero deja la línea "FAMILIA_FUERA_ALLOWLIST" en
// api_log.txt.
//
// CÓMO PASAR A MODO ESTRICTO: después de ~1 semana en producción, revisar
// (api_log.txt vive en la raíz del proyecto, ver API_LOG_FILE en config.php)
//   grep FAMILIA_FUERA_ALLOWLIST api_log.txt
// Si aparece una acción legítima, agregarla a la lista de arriba. Cuando el
// log quede limpio, agregar en config.php del servidor:
//   define('ALLOWLIST_FAMILIA_ESTRICTA', true);
// y desde ese momento una familia que llame algo fuera de la lista recibe 403
// igual que los demás roles con allowlist. OJO: config.php hoy está
// versionado en git; si se edita a mano en el servidor, el siguiente git pull
// puede chocar con esa línea. Lo más limpio es hacerlo con un commit.
// Para volver al modo registro basta con quitar esa línea.
if (!defined('ALLOWLIST_FAMILIA_ESTRICTA')) define('ALLOWLIST_FAMILIA_ESTRICTA', false);
// [OF-4b] Modo registro de 'admin', 'cajero', 'contador' y 'distribuidor'. Misma
// mecánica y mismo motivo que el de familia: sus listas se armaron leyendo el
// código del frontend, no con tráfico real, y cortar de golpe una acción que se
// nos escapó dejaría a un colegio sin poder cobrar. Con false (el valor por
// omisión), un rol de estos que llame algo fuera de su lista PASA, pero se anota
//   ROL_FUERA_ALLOWLIST rol=<rol> accion=<accion> user_id=<id>
// en api_log.txt. Con true recibe 403, igual que los demás roles con allowlist.
// Se lee con defined() a propósito: NO hace falta tocar config.php para que
// arranque en registro, y quien lo active lo define allá.
//
// CÓMO PASAR A MODO ESTRICTO:
//   1. Dejar el sistema en uso normal ~1 semana (que pase un corte de caja, una
//      facturación, un cierre de ciclo: las acciones raras son las que se escapan).
//   2. Revisar el log (api_log.txt vive en la raíz del proyecto, ver API_LOG_FILE
//      en config.php):
//        grep ROL_FUERA_ALLOWLIST api_log.txt | sort | uniq -c
//   3. Cada línea es una acción que un rol llamó sin estar en su lista. Si es
//      legítima, agregarla a la lista de ese rol en $ACCIONES_POR_ROL_PLATAFORMA.
//      Si no lo es, es justo el hueco que el modo estricto va a cerrar.
//   4. Con el log limpio, agregar en el config.php del servidor:
//        define('ALLOWLIST_ROLES_ESTRICTA', true);
//      OJO: config.php está versionado en git; si se edita a mano en el
//      servidor, el siguiente git pull puede chocar con esa línea. Lo más
//      limpio es hacerlo con un commit. Para volver al modo registro basta con
//      quitar la línea. Una sola constante cubre los cuatro roles.
$allowlist_roles_estricta = defined('ALLOWLIST_ROLES_ESTRICTA') ? (bool) ALLOWLIST_ROLES_ESTRICTA : false;
// [F6] Tiendita/cafetería (18-nov-2026). Rol del colegio con allowlist
// OBLIGATORIA, igual que 'docente': fuera queda cargar_datos (saldos y
// cobros de toda la escuela) y cualquier acción de cobranza. Su panel
// (views/Tienda.js) trae todo con estas acciones, que además validan por
// dentro escuela, alumno activo, saldo, límite diario y NIP
// (lib/helpers_monedero.php).
$ACCIONES_POR_ROL_PLATAFORMA['tienda'] = [
    'tienda_buscar_alumno', 'tienda_productos_listar', 'tienda_vender',
    'tienda_ventas_dia', 'tienda_cancelar_venta',
    'cambiar_password_propio', 'editar_usuario', 'guia_marcar_vista',
];
// 'editar_usuario' y 'cambiar_password_propio' van en las tres listas porque
// son de autoservicio: editar_usuario ya se defiende solo por dentro (exige
// ser superadmin/admin O que la fila sea el propio perfil), así que aquí solo
// hace falta dejarlo pasar para que puedan cambiar su nombre y su contraseña.
$rol_plataforma_actual = $usuario_actual['rol'] ?? '';
// [F0] [OF-4b] Una sola decisión para todos los roles (ver
// decision_allowlist_rol() arriba): 'permitir', 'registrar' (modo registro:
// anota y deja pasar) o 'bloquear' (403). Familia se rige por
// ALLOWLIST_FAMILIA_ESTRICTA; admin/cajero/contador/distribuidor, por
// ALLOWLIST_ROLES_ESTRICTA. Las listas aceptan 'prefijo_*' (accion_en_allowlist).
$decision_allowlist = decision_allowlist_rol($rol_plataforma_actual, $action, $ACCIONES_POR_ROL_PLATAFORMA,
    ALLOWLIST_FAMILIA_ESTRICTA, $allowlist_roles_estricta);
if ($decision_allowlist === 'registrar') {
    $uid_allowlist = $usuario_actual['user_id'] ?? '?';
    if ($rol_plataforma_actual === 'familia') {
        log_api("FAMILIA_FUERA_ALLOWLIST accion={$action} user_id={$uid_allowlist}");
    } else {
        log_api("ROL_FUERA_ALLOWLIST rol={$rol_plataforma_actual} accion={$action} user_id={$uid_allowlist}");
    }
} elseif ($decision_allowlist === 'bloquear') {
    log_api("BLOQUEADO por allowlist de plataforma -> rol={$rol_plataforma_actual} accion={$action} user_id=" . ($usuario_actual['user_id'] ?? '?'));
    http_response_code(403);
    respond(['success' => false, 'error' => 'Tu rol no tiene acceso a esta acción.']);
}

$accion_file = __DIR__ . '/acciones/' . $action . '.php';
if (is_file($accion_file)) {
    // Blindaje (10-sep-2026): un error fatal (excepción de PDO sin capturar,
    // llamada a método/función inexistente, etc.) dentro de una acción moría
    // en silencio -- 500 en blanco, SIN pasar por log_api() (que vive más
    // abajo dentro de cada acción) y sin devolver JSON, así que el frontend
    // solo veía "falló" sin ningún rastro en api_log.txt para diagnosticar.
    // Se envuelve el require en try/catch para que CUALQUIER fatal futuro
    // quede registrado con su mensaje/archivo/línea reales antes de
    // responder, en vez de desaparecer.
    try {
        require $accion_file;
    } catch (\Throwable $e) {
        log_api("FATAL en acción '{$action}' -> " . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
        http_response_code(500);
        respond(['success' => false, 'error' => 'Error interno del servidor (ya quedó registrado en el log).']);
    }
} else {
    respond(['success' => false, 'error' => "Acción no reconocida: {$action}"]);
}
?>