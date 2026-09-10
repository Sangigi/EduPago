<?php
/**
 * EduPago — Backend API v4 (Segura con DB)
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/mailer.php';
require_once __DIR__ . '/lib/helpers_pagos.php';
require_once __DIR__ . '/lib/curl_helper.php';
require_once __DIR__ . '/lib/facturapi.php';
require_once __DIR__ . '/lib/uploads.php';
// ── Planes de suscripción — fuente única de verdad (mensual + IVA) ──
// Solo existen 3 planes reales: básico, avanzado, pro.
// max_alumnos / max_planteles = null significa "sin límite"
const PLANES_LIMITES = [
    'basico'   => ['precio' => 999.00,  'max_alumnos' => 400, 'max_planteles' => 1,    'label' => 'Básico'],
    'avanzado' => ['precio' => 1500.00, 'max_alumnos' => 800, 'max_planteles' => 1,    'label' => 'Avanzado'],
    'pro'      => ['precio' => 3000.00, 'max_alumnos' => null, 'max_planteles' => null, 'label' => 'Pro'],
];
// Plan de respaldo si `escuelas.plan` trae un valor no reconocido (typo,
// dato viejo tipo 'free' que ya no existe como plan real, etc.) — se usa el
// más restrictivo, NUNCA "sin límite".
const PLAN_FALLBACK = 'basico';
function limitesDelPlan($nombrePlan) {
    return PLANES_LIMITES[$nombrePlan] ?? PLANES_LIMITES[PLAN_FALLBACK];
}
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
    $stmt = $pdo->prepare("SELECT id, rol, escuela_id, familia_id, activo, sesion_valida_desde FROM usuarios WHERE id = ?");
    $stmt->execute([intval($user_id)]);
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
    return ['user_id' => intval($usuario['id']), 'rol' => $usuario['rol'], 'escuela_id' => $usuario['escuela_id'], 'familia_id' => $usuario['familia_id'] ? intval($usuario['familia_id']) : null];
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
function respond($data) {
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
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
    if ($rol_actual !== 'admin' && $rol_actual !== 'cajero') return;
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
function requerir_familia_propia($familia_id_fila, $usuario_actual, $mensaje) {
    if (intval($familia_id_fila ?? -1) !== intval($usuario_actual['familia_id'] ?? -2)) {
        http_response_code(403);
        respond(['success' => false, 'error' => $mensaje]);
    }
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
