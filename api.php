<?php
/**
 * EduPago — Backend API v4 (Segura con DB)
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
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
// ── Vencimiento de suscripción: ciclo de calendario mensual ────────────────
// El primer periodo de un colegio nuevo se prorratea (vence a fin del mes en
// curso); de ahí en adelante cada renovación cubre un mes calendario completo
// (vence a fin del mes siguiente al de la fecha base). Ver Suscripciones.js.
function fin_de_mes_actual() {
    return date('Y-m-t');
}
function siguiente_vencimiento_mensual($fechaBase) {
    // Normaliza al día 1 antes de sumar un mes: evita que "31 de enero + 1 mes"
    // salte a marzo en vez de febrero.
    $primerDiaSiguiente = date('Y-m-01', strtotime($fechaBase . ' +1 month'));
    return date('Y-m-t', strtotime($primerDiaSiguiente));
}
// Registra una acción sensible en logs_sistema. Nunca debe tumbar la
// petición si la tabla aún no existe (falta correr la migración) — se
// degrada a silencio + nota en api_log.txt, igual que hicimos con
// recordatorios.
function registrar_log($pdo, $usuario_actual, $accion, $detalle = null, $escuela_id = null) {
    try {
        $stmt = $pdo->prepare(
            "INSERT INTO logs_sistema (usuario_id, usuario_nombre, escuela_id, accion, detalle, ip)
             VALUES (?, ?, ?, ?, ?, ?)"
        );
        $stmt->execute([
            $usuario_actual['user_id'] ?? null,
            $usuario_actual['nombre'] ?? ($usuario_actual['email'] ?? null),
            $escuela_id ?? ($usuario_actual['escuela_id'] ?? null),
            $accion,
            $detalle,
            $_SERVER['REMOTE_ADDR'] ?? null,
        ]);
    } catch (\PDOException $e) {
        file_put_contents(__DIR__ . '/api_log.txt', date('Y-m-d H:i:s') . " | registrar_log falló (¿falta migrar logs_sistema?): " . $e->getMessage() . "\n", FILE_APPEND);
    }
}
header('Content-Type: application/json; charset=UTF-8');
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
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'No autorizado. Token requerido.']);
        exit;
    }
    $decoded = base64_decode($matches[1], true);
    $partes  = $decoded !== false ? explode('.', $decoded) : [];
    if (count($partes) !== 3) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Token inválido.']);
        exit;
    }
    [$user_id, $exp, $firma] = $partes;
    $firma_esperada = hash_hmac('sha256', $user_id . '.' . $exp, APP_TOKEN_SECRET);
    if (!hash_equals($firma_esperada, $firma) || intval($exp) < time()) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Token inválido o expirado.']);
        exit;
    }
    // El rol y estado se leen siempre frescos de la BD (no del token),
    // así reflejan cualquier cambio (ej. desactivación) inmediatamente.
    $stmt = $pdo->prepare("SELECT id, rol, escuela_id, familia_id, activo FROM usuarios WHERE id = ?");
    $stmt->execute([intval($user_id)]);
    $usuario = $stmt->fetch();
    if (!$usuario || !$usuario['activo']) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Usuario no encontrado o inactivo.']);
        exit;
    }
    // Igual que con el usuario: si su escuela fue desactivada a media sesión, se corta el acceso.
    if ($usuario['escuela_id']) {
        $esc = $pdo->prepare("SELECT activa FROM escuelas WHERE id = ?");
        $esc->execute([$usuario['escuela_id']]);
        $escuela = $esc->fetch();
        if ($escuela && !$escuela['activa']) {
            http_response_code(401);
            echo json_encode(['success' => false, 'error' => 'Esta escuela está inactiva.']);
            exit;
        }
    }
    return ['user_id' => intval($usuario['id']), 'rol' => $usuario['rol'], 'escuela_id' => $usuario['escuela_id'], 'familia_id' => $usuario['familia_id'] ? intval($usuario['familia_id']) : null];
}
$action = $_GET['action'] ?? '';
$acciones_publicas = ['login', 'verificar_spei'];
if (!in_array($action, $acciones_publicas)) {
    $usuario_actual = verificar_token_auth();
}
function respond($data) {
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}
function log_api($msg) {
    if (!API_LOG_ENABLED) return;
    file_put_contents(API_LOG_FILE, date('Y-m-d H:i:s') . ' | ' . $msg . "\n", FILE_APPEND);
}
function curl_post($url, $payload, $headers = []) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => array_merge(['Content-Type: application/json'], $headers),
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $result    = curl_exec($ch);
    $err       = curl_error($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['body' => $result, 'error' => $err, 'http_code' => $http_code];
}
$input = json_decode(file_get_contents('php://input'), true) ?? [];
switch ($action) {
    case 'login':
        $email = trim($input['email'] ?? '');
        $pass  = $input['password'] ?? '';
        if (!$email || !$pass) respond(['success' => false, 'error' => 'Faltan credenciales']);
        $stmt = $pdo->prepare("SELECT id, nombre, email, password_hash, rol, escuela_id, familia_id FROM usuarios WHERE email = ? AND activo = 1");
        $stmt->execute([$email]);
        $user = $stmt->fetch();
        $credenciales_ok = false;
        if ($user) {
            $hash_guardado = $user['password_hash'];
            $es_hash_real  = strlen($hash_guardado) > 0 && (substr($hash_guardado, 0, 4) === '$2y$' || substr($hash_guardado, 0, 4) === '$2a$');
            if ($es_hash_real) {
                // Caso normal: contraseña ya migrada a hash bcrypt
                $credenciales_ok = password_verify($pass, $hash_guardado);
            } elseif ($pass === $hash_guardado) {
                // Compatibilidad con cuentas viejas en texto plano:
                // si coincide, se acepta UNA vez y de inmediato se migra a hash real.
                $credenciales_ok = true;
                $nuevo_hash = password_hash($pass, PASSWORD_BCRYPT);
                $pdo->prepare("UPDATE usuarios SET password_hash = ? WHERE id = ?")->execute([$nuevo_hash, $user['id']]);
            }
        }
        if ($credenciales_ok) {
            // Si el usuario pertenece a una escuela, verificar que esté activa.
            // (superadmin no tiene escuela_id, así que nunca se bloquea por esto)
            if ($user['escuela_id']) {
                $esc = $pdo->prepare("SELECT activa FROM escuelas WHERE id = ?");
                $esc->execute([$user['escuela_id']]);
                $escuela = $esc->fetch();
                if ($escuela && !$escuela['activa']) {
                    respond(['success' => false, 'error' => 'Esta escuela está inactiva. Contacta al administrador.']);
                }
            }
            $token = generar_token($user['id']);
            registrar_log($pdo, ['user_id' => $user['id'], 'nombre' => $user['nombre']], 'login_exitoso', null, $user['escuela_id']);
            respond([
                'success' => true, 
                'user' => [
                    'id'         => $user['id'],
                    'nombre'     => $user['nombre'],
                    'email'      => $user['email'],
                    'rol'        => $user['rol'],
                    'escuela_id' => $user['escuela_id'],
                    'familia_id' => $user['familia_id'] ? intval($user['familia_id']) : null,
                    'token'      => $token
                ]
            ]);
        }
        registrar_log($pdo, ['user_id' => $user['id'] ?? null, 'nombre' => $email], 'login_fallido', "Intento con correo: $email", $user['escuela_id'] ?? null);
        respond(['success' => false, 'error' => 'Credenciales incorrectas']);
    break;
    case 'generar_clabe_individual':
        $alumno_id  = trim($input['alumno_id']  ?? '');
        $matricula  = trim($input['matricula']  ?? '');
        $nombre     = trim($input['nombre']     ?? '');
        $email      = trim($input['email']      ?? '');
        if (!$alumno_id || !$nombre) respond(['success' => false, 'error' => 'alumno_id y nombre son requeridos']);
        $account = $matricula !== '' ? $matricula : ('AL-' . str_pad($alumno_id, 9, '0', STR_PAD_LEFT));
        $payload = [
            'User'           => PDT_USER,
            'Password'       => PDT_PASS,
            'IntegrationID'  => PDT_INT_ID,
            'BusinessID'     => PDT_BUS_ID_SPEI,
            'Description'    => substr("EduPago - {$nombre}", 0, 40),
            'Account'        => $account,
            'CustomerEmail'  => $email ?: 'sin-correo@edupago.mx',
            'CustomerName'   => substr($nombre, 0, 60),
            'ExpirationDate' => date('Y-m-d', strtotime('+' . SPEI_CLABE_EXPIRACION_DIAS . ' days')),
        ];
        $res = curl_post(PDT_URL_CLABE, $payload);
        if ($res['error']) respond(['success' => false, 'error' => 'Error de red: ' . $res['error']]);
        $raw = json_decode($res['body'], true) ?? [];
        $clabe = $raw['Clabe'] ?? $raw['clabe'] ?? null;
        if (!$clabe) respond(['success' => false, 'error' => 'Pagadetodo no devolvió una CLABE']);
        // ── Guardar CLABE en Base de Datos ──
        try {
            $stmt = $pdo->prepare("UPDATE clientes SET clabe_individual = ?, clabe_individual_estado = 'activa', clabe_individual_fecha = CURRENT_DATE WHERE id = ?");
            $stmt->execute([$clabe, $alumno_id]);
        } catch (\PDOException $e) {
            log_api("ERROR DB GenerarClabe: " . $e->getMessage());
        }
        respond([
            'success'      => true,
            'clabe'        => $clabe,
            'banco'        => SPEI_BANCO,
            'beneficiario' => SPEI_BENEFICIARIO,
            'account'      => $account,
        ]);
    break;
    case 'liberar_clabe_individual':
        $clabe     = trim($input['clabe']     ?? '');
        $alumno_id = trim($input['alumno_id'] ?? '');
        if (!$clabe) respond(['success' => false, 'error' => 'clabe requerida']);
        // ── Liberar CLABE en Base de Datos ──
        try {
            $stmt = $pdo->prepare("UPDATE clientes SET clabe_individual_estado = 'liberada' WHERE clabe_individual = ? AND id = ?");
            $stmt->execute([$clabe, $alumno_id]);
        } catch (\PDOException $e) {
            respond(['success' => false, 'error' => 'Error de BD al liberar CLABE']);
        }
        respond(['success' => true, 'mensaje' => 'CLABE liberada']);
    break;
    case 'verificar_spei':
        $referencia = strtoupper(trim($input['referencia'] ?? ''));
        $cobro_id   = intval($input['cobro_id'] ?? 0);
        if (!$referencia && !$cobro_id) respond(['success' => false, 'error' => 'Referencia o cobro_id requerido']);
        // ── Fuente de verdad: cobros.estado ─────────────────────────────
        // pago_clabe.php (el servicio real que llama Cobroscontarjeta.com al
        // confirmar un SPEI) marca directamente cobros.estado='pagado'. Antes
        // este endpoint SOLO revisaba pagos_spei.json (usado nada más por el
        // botón de "Simular pago" de pruebas), así que un pago SPEI real
        // nunca se reflejaba en pantalla aunque sí se hubiera cobrado.
        if ($cobro_id) {
            $stmt = $pdo->prepare("SELECT id, estado, total, auth_code FROM cobros WHERE id = ?");
            $stmt->execute([$cobro_id]);
        } else {
            $stmt = $pdo->prepare("SELECT id, estado, total, auth_code FROM cobros WHERE referencia = ? ORDER BY id DESC LIMIT 1");
            $stmt->execute([$referencia]);
        }
        $cobro = $stmt->fetch();
        if ($cobro && $cobro['estado'] === 'pagado') {
            respond([
                'success'      => true,
                'pagado'       => true,
                'monto_pesos'  => $cobro['total'],
                'autorizacion' => $cobro['auth_code'],
            ]);
        }
        // ── Fallback: pagos_spei.json (solo para el botón "Simular pago SPEI") ──
        // IMPORTANTE: solo se usa cuando NO se mandó cobro_id. `referencia` es la
        // matrícula del alumno — NO es única por cobro (un alumno puede tener
        // varios cobros con la misma referencia). Si se permite este fallback
        // también en el path por cobro_id, un pago simulado (o cualquier otro
        // cobro ya pagado que comparta la misma matrícula) confirma por error
        // OTRO cobro pendiente distinto del que se está verificando — nunca se
        // pagó, pero el sistema lo marcaba como pagado igual. Por eso este
        // fallback queda restringido exclusivamente al path sin cobro_id.
        if (!$cobro_id && $cobro && $cobro['estado'] === 'pendiente') {
            $archivo = __DIR__ . '/pagos_spei.json';
            $pagos   = file_exists($archivo) ? (json_decode(file_get_contents($archivo), true) ?? []) : [];
            $pago    = $pagos[strtoupper($referencia)] ?? null;
            if ($pago && !empty($pago['pagado'])) {
                respond([
                    'success'       => true,
                    'pagado'        => true,
                    'monto_pesos'   => $pago['monto_pesos'] ?? $cobro['total'],
                    'clave_rastreo' => $pago['clave_rastreo'] ?? null,
                    'autorizacion'  => $pago['autorizacion']  ?? null,
                ]);
            }
        }
        respond(['success' => true, 'pagado' => false]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    // 3. SIMULAR PAGO SPEI (para testing sin webhook real)
    //    Acepta clabe_destino opcional para simular un depósito a la CLABE
    //    individual del alumno (si no se manda, usa la CLABE fija legado).
    // ══════════════════════════════════════════════════════════════════════════
    case 'simular_spei':
        $referencia    = strtoupper(trim($input['referencia'] ?? ''));
        $monto         = intval(floatval($input['monto'] ?? 0) * 100);
        $emisor        = $input['emisor'] ?? 'PADRE DE FAMILIA DEMO';
        $clabe_destino = trim($input['clabe_destino'] ?? '') ?: SPEI_CLABE_FIJA;
        if (!$referencia || $monto <= 0) {
            respond(['success' => false, 'error' => 'referencia y monto requeridos']);
        }
        $archivo  = __DIR__ . '/pagos_spei.json';
        $fp       = fopen($archivo, 'c+');
        flock($fp, LOCK_EX);
        $contenido = stream_get_contents($fp);
        $pagos     = $contenido ? (json_decode($contenido, true) ?? []) : [];
        $autorizacion = rand(10000000, 99999999);
        $pagos[$referencia] = [
            'concepto'       => $referencia,
            'concepto_raw'   => $referencia,
            'clabe_destino'  => $clabe_destino,
            'monto'          => $monto,
            'monto_pesos'    => number_format($monto / 100, 2),
            'clave_rastreo'  => 'SIM-' . date('YmdHis'),
            'autorizacion'   => $autorizacion,
            'nombre_emisor'  => $emisor,
            'fecha'          => date('Y-m-d'),
            'recibido_en'    => date('Y-m-d H:i:s'),
            'pagado'         => true,
            'simulado'       => true,
        ];
        rewind($fp);
        ftruncate($fp, 0);
        fwrite($fp, json_encode($pagos, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        flock($fp, LOCK_UN);
        fclose($fp);
        log_api("simular_spei -> ref={$referencia} clabe={$clabe_destino} monto=" . number_format($monto/100,2));
        respond(['success' => true, 'autorizacion' => $autorizacion, 'mensaje' => 'Pago simulado OK']);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    // 4. GENERAR LIGA TARJETA — Pagalaescuela (Pagos en línea + CAI)
    //    Usa GenerarLigaDomiciliacionIndi: paga en línea Y de paso deja el
    //    número de tarjeta tokenizado (number_tkn) en la respuesta del
    //    webhook, para poder hacer Cargos Automáticos después sin volver a
    //    pedir tarjeta. La Reference se guarda en cobros.referencia (match
    //    por folio) para que webhook_liga.php sepa qué cobro confirmar.
    // ══════════════════════════════════════════════════════════════════════════
    case 'generar_liga':
        $folio       = trim($input['folio'] ?? '');
        $total       = floatval($input['total'] ?? 0);
        $descripcion = $input['descripcion'] ?? 'Pago escolar';
        $cliente_id  = intval($input['cliente_id'] ?? 0) ?: null;
        if (!$folio) respond(['success' => false, 'error' => 'folio requerido']);
        if ($total < 50) respond(['success' => false, 'error' => 'Monto mínimo $50.00 (mínimo de Cobroscontarjeta.com)']);
        if ($total > 15000) respond(['success' => false, 'error' => 'Monto máximo $15,000.00 (máximo de Cobroscontarjeta.com)']);
        // Confirmar que el folio corresponde a un cobro real pendiente antes
        // de gastar una llamada al proveedor — evita generar ligas huérfanas.
        $stmtCob = $pdo->prepare("SELECT id, cliente_id FROM cobros WHERE folio = ? AND estado = 'pendiente'");
        $stmtCob->execute([$folio]);
        $cobroRow = $stmtCob->fetch();
        if (!$cobroRow) respond(['success' => false, 'error' => 'No existe un cobro pendiente con ese folio']);
        if (!$cliente_id) $cliente_id = $cobroRow['cliente_id'] ? intval($cobroRow['cliente_id']) : null;
        // Id/Reference: formato confirmado contra el ÚNICO caso que alguna vez
        // devolvió "code":"success" en este proyecto (ver api_log.txt / historial
        // git de generar_liga, junio-2026): Id de 9 dígitos y Reference de 15
        // dígitos, ambos con ceros a la izquierda y enviados como STRING (no como
        // número JSON). Los intentos con Reference numérico sin ceros (10 o 13
        // dígitos, con o sin comillas) fallaron todos con code 22 "El formato de
        // la referencia es incorrecto".
        $base    = intval(substr(strval(time()), -6)) . mt_rand(100, 999);
        $id_pago = str_pad($base, 9,  '0', STR_PAD_LEFT);
        $ref     = str_pad($base, 15, '0', STR_PAD_LEFT);
        $payload = [
            'User'           => PLE_USER,
            'Password'       => PLE_PASS,
            'IntegrationID'  => intval(PLE_INT_ID_ACTIVO),
            'SchoolID'       => PLE_SCHOOL_ID_ACTIVO,
            // BusinessID: mientras el sandbox de Pago en Línea/CAI corre
            // temporalmente en pagadetodo.mx (aviso de Cobroscontarjeta.com
            // 18-ago-2026), su validador puede esperar el campo con el
            // vocabulario de "comercio" (BusinessID) en vez de "escuela"
            // (SchoolID). Se mandan ambos con el mismo valor para cubrir
            // los dos casos sin romper nada cuando regrese a pagalaescuela.mx.
            'BusinessID'     => PLE_SCHOOL_ID_ACTIVO,
            'PaymentTypes'   => '401', // Contado (único código válido en Sandbox)
            'Id'             => $id_pago,
            'Description'    => substr($descripcion, 0, 50),
            'Amount'         => intval(round($total * 100)),
            'Reference'      => $ref,
            'ExpirationDate' => date('Y-m-d', strtotime('+1 day')),
        ];
        log_api("generar_liga -> folio={$folio} total={$total} ref={$ref}");
        // PLE_URL_LIGA_SIMPLE (GenerarLigaIndi) en vez de PLE_URL_LIGA_TOKEN
        // (GenerarLigaDomiciliacionIndi): el endpoint de domiciliación/CAI nunca
        // devolvió un solo "code":"success" pese a probar todos los formatos de
        // Reference documentados; el simple es el único con éxito comprobado.
        // Efecto secundario: no se tokeniza la tarjeta, así que "Cargo Automático"
        // (cobrar_cai) no tendrá tarjetas nuevas que cobrar hasta que
        // Cobroscontarjeta.com aprovisione bien la Domiciliación para esta cuenta.
        $res = curl_post(PLE_URL_LIGA_SIMPLE, $payload);
        if ($res['error']) respond(['success' => false, 'error' => 'Error de red: ' . $res['error']]);
        $raw = json_decode($res['body'], true) ?? [];
        $data_resp = [];
        foreach ($raw as $k => $v) { $data_resp[trim($k)] = $v; }
        $codigo_resp = $data_resp['code'] ?? null;
        $url_pago    = $data_resp['url'] ?? $data_resp['Url'] ?? $data_resp['URL'] ?? null;
        if ($codigo_resp !== 'success' || !$url_pago) {
            $payload_log = $payload; $payload_log['Password'] = '***';
            log_api("generar_liga FALLÓ -> respuesta: " . json_encode($data_resp, JSON_UNESCAPED_UNICODE) . " | http_code: " . ($res['http_code'] ?? '?') . " | payload_enviado: " . json_encode($payload_log, JSON_UNESCAPED_UNICODE));
            respond(['success' => false, 'error' => $data_resp['message'] ?? ($data_resp['Message'] ?? 'Sin URL de pago'), 'raw' => $data_resp]);
        }
        // Guardar la Reference en el cobro para poder casarla con el webhook.
        $pdo->prepare("UPDATE cobros SET referencia = ? WHERE id = ?")->execute([$ref, $cobroRow['id']]);
        respond([
            'success'    => true,
            'url'        => $url_pago,
            'referencia' => $ref,
            'cobro_id'   => intval($cobroRow['id']),
            'qr_url'     => 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=' . urlencode($url_pago),
        ]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    // 4b. CAI — Cargo Automático Individual (cobro con tarjeta ya tokenizada)
    //     Requiere que el cliente ya tenga token_tarjeta activo (se guarda
    //     automáticamente en webhook_liga.php tras un primer pago exitoso).
    // ══════════════════════════════════════════════════════════════════════════
    case 'cobrar_cai':
        $cliente_id = intval($input['cliente_id'] ?? 0);
        $folio      = trim($input['folio'] ?? '');
        $total      = floatval($input['total'] ?? 0);
        if (!$cliente_id || !$folio) respond(['success' => false, 'error' => 'cliente_id y folio son requeridos']);
        if ($total < 50 || $total > 15000) respond(['success' => false, 'error' => 'Monto fuera de rango ($50.00 - $15,000.00)']);
        $stmtCli = $pdo->prepare("SELECT token_tarjeta, token_tarjeta_expmes, token_tarjeta_expanio, token_tarjeta_estado FROM clientes WHERE id = ?");
        $stmtCli->execute([$cliente_id]);
        $cli = $stmtCli->fetch();
        if (!$cli || $cli['token_tarjeta_estado'] !== 'activo' || !$cli['token_tarjeta']) {
            respond(['success' => false, 'error' => 'El alumno no tiene una tarjeta domiciliada activa. Debe pagar una liga primero para tokenizar.']);
        }
        $stmtCob = $pdo->prepare("SELECT id FROM cobros WHERE folio = ? AND estado = 'pendiente'");
        $stmtCob->execute([$folio]);
        $cobroRow = $stmtCob->fetch();
        if (!$cobroRow) respond(['success' => false, 'error' => 'No existe un cobro pendiente con ese folio']);
        // Reference acotada a rango int32 (ver nota en generar_liga) para evitar
        // "El formato de la referencia es incorrecto" (code 22).
        $ref  = strval(mt_rand(1000000000, 2147483647));
        $payload = [
            'User'          => PLE_USER,
            'Password'      => PLE_PASS,
            'IntegrationID' => intval(PLE_INT_ID_ACTIVO),
            'SchoolID'      => PLE_SCHOOL_ID_ACTIVO,
            'BusinessID'    => PLE_SCHOOL_ID_ACTIVO,
            'Token'         => $cli['token_tarjeta'],
            'Reference'     => intval($ref), // numérico sin comillas — mismo patrón que Id/IntegrationID
            'Amount'        => intval(round($total * 100)),
            'ExpMonth'      => $cli['token_tarjeta_expmes'],
            'ExpYear'       => $cli['token_tarjeta_expanio'],
        ];
        log_api("cobrar_cai -> cliente={$cliente_id} folio={$folio} total={$total} ref={$ref}");
        $res = curl_post(PLE_URL_DOMICILIACION_PAGAR, $payload);
        if ($res['error']) respond(['success' => false, 'error' => 'Error de red: ' . $res['error']]);
        $raw = json_decode($res['body'], true) ?? [];
        $tx  = $raw['txResponse'] ?? [];
        if (($raw['code'] ?? '') !== '00' || ($tx['response'] ?? '') !== 'approved') {
            log_api("cobrar_cai FALLÓ -> " . json_encode($raw, JSON_UNESCAPED_UNICODE));
            respond(['success' => false, 'error' => $raw['message'] ?? ($tx['nb_error'] ?? 'Cargo automático rechazado'), 'raw' => $raw]);
        }
        $pdo->prepare("UPDATE cobros SET estado = 'pagado', metodo = 'TC', referencia = ?, auth_code = ? WHERE id = ?")
            ->execute([$ref, $tx['auth'] ?? null, $cobroRow['id']]);
        respond(['success' => true, 'cobro_id' => intval($cobroRow['id']), 'autorizacion' => $tx['auth'] ?? null]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    // 4c. Cancelar tokenización de tarjeta (baja de CAI de un alumno)
    // ══════════════════════════════════════════════════════════════════════════
    case 'cancelar_cai':
        $cliente_id = intval($input['cliente_id'] ?? 0);
        if (!$cliente_id) respond(['success' => false, 'error' => 'cliente_id requerido']);
        $stmtCli = $pdo->prepare("SELECT token_tarjeta FROM clientes WHERE id = ?");
        $stmtCli->execute([$cliente_id]);
        $cli = $stmtCli->fetch();
        if (!$cli || !$cli['token_tarjeta']) respond(['success' => true, 'mensaje' => 'Sin tarjeta domiciliada']);
        $payload = [
            'User'          => PLE_USER,
            'Password'      => PLE_PASS,
            'IntegrationID' => intval(PLE_INT_ID_ACTIVO),
            'SchoolID'      => PLE_SCHOOL_ID_ACTIVO,
            'BusinessID'    => PLE_SCHOOL_ID_ACTIVO,
            'Token'         => $cli['token_tarjeta'],
            'Tkn_reference' => str_pad(strval($cliente_id), 13, '0', STR_PAD_LEFT),
        ];
        $res = curl_post(PLE_URL_DOMICILIACION_CANCELAR, $payload);
        if ($res['error']) respond(['success' => false, 'error' => 'Error de red: ' . $res['error']]);
        $raw = json_decode($res['body'], true) ?? [];
        $pdo->prepare("UPDATE clientes SET token_tarjeta_estado = 'cancelado' WHERE id = ?")->execute([$cliente_id]);
        respond(['success' => true, 'mensaje' => $raw['message'] ?? 'Tarjeta desvinculada']);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    // 4d. PAGO EN EFECTIVO POR REFERENCIA (OXXO / terceros) — Pagadetodo
    //     El EMISOR (nosotros) genera la referencia; los 3 servicios que
    //     Cobroscontarjeta.com llama de vuelta viven en archivos aparte:
    //     consulta_referencia.php / pago_referencia.php / cancela_pago_referencia.php
    // ══════════════════════════════════════════════════════════════════════════
    case 'generar_referencia_efectivo':
        $folio       = trim($input['folio'] ?? '');
        $total       = floatval($input['total'] ?? 0);
        $descripcion = $input['descripcion'] ?? 'Pago escolar';
        if (!$folio) respond(['success' => false, 'error' => 'folio requerido']);
        if ($total < 50 || $total > 15000) respond(['success' => false, 'error' => 'Monto fuera de rango ($50.00 - $15,000.00)']);
        $stmtCob = $pdo->prepare("SELECT id, cliente_id FROM cobros WHERE folio = ? AND estado = 'pendiente'");
        $stmtCob->execute([$folio]);
        $cobroRow = $stmtCob->fetch();
        if (!$cobroRow) respond(['success' => false, 'error' => 'No existe un cobro pendiente con ese folio']);
        // Reference: numérico(15), única e irrepetible.
        $ref = str_pad(strval($cobroRow['id']) . substr(strval(time()), -8), 15, '0', STR_PAD_LEFT);
        $payload = [
            'User'           => PDT_USER,
            'Password'       => PDT_PASS,
            'IntegrationID'  => PDT_INT_ID,
            'BusinessID'     => PDT_BUS_ID_EFECTIVO,
            'Description'    => substr($descripcion, 0, 50),
            'Amount'         => intval(round($total * 100)),
            'Reference'      => $ref,
            'CustomerEmail'  => '',
            'CustomerName'   => '',
            'ExpirationDate' => date('Y-m-d', strtotime('+3 days')),
        ];
        log_api("generar_referencia_efectivo -> folio={$folio} total={$total} ref={$ref}");
        $res = curl_post(PDT_URL_REFERENCIA, $payload);
        if ($res['error']) respond(['success' => false, 'error' => 'Error de red: ' . $res['error']]);
        $raw = json_decode($res['body'], true) ?? [];
        $referencia_cct = $raw['Reference'] ?? null;
        if (!$referencia_cct || !empty($raw['Error'])) {
            log_api("generar_referencia_efectivo FALLÓ -> " . json_encode($raw, JSON_UNESCAPED_UNICODE));
            respond(['success' => false, 'error' => $raw['Error'] ?? ($raw['Message'] ?? 'No se pudo generar la referencia')]);
        }
        if (empty($raw['PayFormat'])) {
            log_api("generar_referencia_efectivo OK sin PayFormat -> " . json_encode($raw, JSON_UNESCAPED_UNICODE));
        }
        $pdo->prepare(
            "UPDATE cobros SET metodo = 'EfectivoRef', referencia = ?, ref_barcode_url = ?, ref_payformat_url = ?, ref_vencimiento = ? WHERE id = ?"
        )->execute([
            $referencia_cct,
            $raw['BarCode'] ?? null,
            $raw['PayFormat'] ?? null,
            date('Y-m-d', strtotime('+3 days')),
            $cobroRow['id'],
        ]);
        respond([
            'success'      => true,
            'cobro_id'     => intval($cobroRow['id']),
            'referencia'   => $referencia_cct,
            'barcode_url'  => $raw['BarCode'] ?? null,
            'payformat_url'=> $raw['PayFormat'] ?? null,
            'vencimiento'  => date('Y-m-d', strtotime('+3 days')),
        ]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    // 5. GENERAR CFDI (mock — conectar a PAC real en producción)
    //    Estructura real de CFDI 4.0. Listo para Facturama / SW SAPiens / etc.
    // ══════════════════════════════════════════════════════════════════════════
    case 'generar_cfdi':
        $cobro_id    = $input['cobro_id']    ?? '';
        $rfc         = strtoupper(trim($input['rfc'] ?? ''));
        $razon       = strtoupper(trim($input['razon_social'] ?? ''));
        $uso         = $input['uso_cfdi']    ?? 'D10';
        $regimen     = $input['regimen']     ?? '616';
        $email       = $input['email']       ?? '';
        $total       = floatval($input['total']   ?? 0);
        // OJO: usar ?? no basta, porque si el frontend manda "" (cadena vacía),
        // ?? NO la reemplaza (solo actúa cuando es null/no existe), y Facturapi
        // rechaza con "items[0].product.description is not allowed to be empty".
        $descripcion = trim($input['descripcion'] ?? '');
        if ($descripcion === '') {
            $descripcion = 'Servicios educativos';
        }
        // CFDI 4.0 exige el Código Postal del receptor. 
        // Si no lo pides en el frontend, Facturapi arrojará error si no coincide con el RFC.
        $cp_receptor = $input['cp_receptor'] ?? '97000'; 
        if (!$rfc || !$razon || $total <= 0) {
            respond(['success' => false, 'error' => 'RFC, razón social y total son requeridos']);
        }
        // ── Complemento IEDU (Instituciones Educativas Privadas) ───────────
        // Facturapi lo exige para escuelas: nombreAlumno, CURP, nivelEducativo
        // y autRVOE. Se arma con datos del alumno (cliente) + de la escuela.
        // Si al cobro no se le puede asociar un alumno con estos 3 datos
        // completos, se omite el complemento (ej. "cliente general" sin CURP)
        // para no bloquear el timbrado por un campo que Facturapi solo exige
        // cuando SÍ envías el complemento.
        $iedu_complement = null;
        if ($cobro_id) {
            $stmtAl = $pdo->prepare(
                "SELECT c.nombre AS alumno_nombre, c.curp, c.nivel_educativo_sat,
                        e.rvoe AS escuela_rvoe, e.id AS escuela_id, e.es_plantel
                 FROM cobros cb
                 JOIN clientes c ON c.id = cb.cliente_id
                 JOIN escuelas e ON e.id = c.escuela_id
                 WHERE cb.id = ?"
            );
            $stmtAl->execute([$cobro_id]);
            $al = $stmtAl->fetch();
            if ($al) {
                $rvoe = $al['escuela_rvoe'];
                // Si el alumno pertenece a un plantel (escuelas.es_plantel=1),
                // preferimos el RVOE registrado en `planteles`, que vincula a
                // esa escuela-plantel por escuela_plantel_id.
                if (!empty($al['es_plantel'])) {
                    $stmtPl = $pdo->prepare("SELECT rvoe FROM planteles WHERE escuela_plantel_id = ? LIMIT 1");
                    $stmtPl->execute([$al['escuela_id']]);
                    $pl = $stmtPl->fetch();
                    if ($pl && !empty($pl['rvoe'])) $rvoe = $pl['rvoe'];
                }
                // Permitir que el frontend mande overrides puntuales (ej. si
                // el usuario corrigió el nivel educativo en el modal de CFDI).
                $nivel_educativo = trim($input['nivel_educativo'] ?? '') ?: $al['nivel_educativo_sat'];
                $curp_alumno     = trim($input['curp_alumno'] ?? '') ?: $al['curp'];
                $rvoe            = trim($input['rvoe'] ?? '') ?: $rvoe;
                $nombre_alumno   = trim($input['nombre_alumno'] ?? '') ?: $al['alumno_nombre'];
                if ($curp_alumno && $nivel_educativo && $rvoe && $nombre_alumno) {
                    $iedu_complement = [
                        'nombreAlumno'   => $nombre_alumno,
                        'CURP'           => strtoupper($curp_alumno),
                        'nivelEducativo' => $nivel_educativo,
                        'autRVOE'        => $rvoe,
                    ];
                    // rfcPago: solo si quien paga (el RFC de la factura) es
                    // distinto del alumno/tutor dado de alta — típico cuando
                    // la abuela o la empresa paga la colegiatura.
                    if (!empty($input['rfc_pago']) && strtoupper(trim($input['rfc_pago'])) !== $rfc) {
                        $iedu_complement['rfcPago'] = strtoupper(trim($input['rfc_pago']));
                    }
                } else {
                    log_api("generar_cfdi -> IEDU omitido por datos incompletos (cobro:{$cobro_id}) curp:" . ($curp_alumno ? 'ok' : 'falta') . " nivel:" . ($nivel_educativo ? 'ok' : 'falta') . " rvoe:" . ($rvoe ? 'ok' : 'falta'));
                }
            }
        }
        // 1. Estructuramos el payload para Facturapi
        // Facturapi calcula automáticamente el subtotal e IVA a partir del precio final
        // si le indicas que el precio incluye impuestos, o puedes enviarlo desglosado.
        // Aquí enviamos el subtotal y le decimos que agregue el IVA del 16%.
        $subtotal = round($total / 1.16, 2);
        // Domicilio fiscal: Facturapi CFDI 4.0 requiere customer.address.zip
        // Poner "zip" en el root del customer produce "customer.address is required"
        $domicilio = $input['domicilio'] ?? '';
        $customer_address = [
            "zip"     => $cp_receptor,
            "country" => "MEX"
        ];
        if ($domicilio) {
            $customer_address["street"] = $domicilio;
        }
        $item_producto = [
            "quantity" => 1,
            "product" => [
                "description" => $descripcion,
                "product_key" => "86101800", // Servicios educativos
                "price"       => $subtotal,
                "taxes"       => [
                    [
                        "type" => "IVA",
                        "rate" => 0.16
                    ]
                ]
            ]
        ];
        if ($iedu_complement) {
            $item_producto['complement'] = $iedu_complement;
        }
        $payload_facturapi = [
            "customer" => [
                "legal_name" => $razon,
                "tax_id"     => $rfc,
                "tax_system" => $regimen,
                "address"    => $customer_address,
                "email"      => $email ?: null
            ],
            "items" => [$item_producto],
            "use"          => $uso,
            "payment_form" => "03", // Transferencia electrónica
            "payment_method" => "PUE"
        ];
        // 2. Ejecutamos la petición cURL a Facturapi
        $ch = curl_init('https://www.facturapi.io/v2/invoices');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . FACTURAPI_KEY
            ],
            CURLOPT_POSTFIELDS     => json_encode($payload_facturapi),
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_SSL_VERIFYPEER => false, // Cambiar a true en producción estricta
        ]);
        $result = curl_exec($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($err) {
            log_api("ERROR cURL Facturapi: " . $err);
            respond(['success' => false, 'error' => 'Error de red al contactar al PAC.']);
        }
        $response_data = json_decode($result, true);
        // 3. Manejo de la respuesta
        if ($http_code >= 200 && $http_code < 300 && isset($response_data['id'])) {
            $uuid = $response_data['uuid'] ?? 'PENDIENTE';
            // Guardar datos fiscales en el cliente para pre-rellenar en futuros CFDIs
            if ($cobro_id) {
                $cobro_row = $pdo->prepare("SELECT cliente_id FROM cobros WHERE id = ?");
                $cobro_row->execute([$cobro_id]);
                $cr = $cobro_row->fetch();
                if ($cr && $cr['cliente_id']) {
                    $pdo->prepare(
                        "UPDATE clientes SET
                            rfc_factura           = ?,
                            razon_social_factura  = ?,
                            cp_factura            = ?,
                            domicilio_factura     = ?,
                            regimen_factura       = ?,
                            uso_cfdi_defecto      = ?
                         WHERE id = ?"
                    )->execute([$rfc, $razon, $cp_receptor, $domicilio, $regimen, $uso, $cr['cliente_id']]);
                }
                // Marcar cobro como facturado y guardar el facturapi_id — sin
                // esto no había forma de volver a descargar la factura después.
                $pdo->prepare("UPDATE cobros SET factura = 1, facturapi_id = ? WHERE id = ?")->execute([$response_data['id'], $cobro_id]);
            }
            log_api("generar_cfdi -> EXITOSO cobro:{$cobro_id} uuid:{$uuid}");
            respond([
                'success'        => true,
                'facturapi_id'   => $response_data['id'],
                'uuid'           => $uuid,
                'folio_fiscal'   => $uuid,
                'serie'          => 'F',
                'folio'          => $response_data['folio_number'] ?? '',
                'fecha_timbrado' => $response_data['created_at'] ?? date('Y-m-d\TH:i:s'),
                'subtotal'       => $subtotal,
                'iva'            => round($total - $subtotal, 2),
                'total'          => $total,
                // Facturapi permite descargar el XML con una URL pública si configuras tu cuenta,
                // o haciendo un GET a https://www.facturapi.io/v2/invoices/{id}/xml
                'xml'            => '',
                'qr_url'         => 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' . urlencode($response_data['verification_url'] ?? ''),
                'nota'           => 'Timbrado exitoso con Facturapi.',
            ]);
        } else {
            // Error devuelto por Facturapi (ej. CP no coincide con RFC)
            $mensaje_error = $response_data['message'] ?? 'Error desconocido al timbrar';
            log_api("ERROR Facturapi: " . $result);
            respond(['success' => false, 'error' => $mensaje_error]);
        }
    break;
    // ══════════════════════════════════════════════════════════════════════════
    // 6. DESCARGAR CFDI (XML o PDF) DESDE FACTURAPI
    //    Hace proxy del binario para que el navegador lo descargue directamente.
    //    Uso: GET api.php?action=descargar_cfdi&id={facturapi_id}&tipo=xml|pdf
    // ══════════════════════════════════════════════════════════════════════════
    case 'descargar_cfdi':
        // Ahora requiere login (ya no está en $acciones_publicas) y recibe
        // cobro_id en vez de facturapi_id crudo — antes cualquiera con el ID
        // de Facturapi (que ni siquiera se guardaba en BD) podía descargar
        // el CFDI de cualquier escuela sin autenticarse.
        $cobro_id_cfdi = intval($_GET['cobro_id'] ?? $input['cobro_id'] ?? 0);
        $tipo          = strtolower(trim($_GET['tipo'] ?? $input['tipo'] ?? 'pdf'));
        if (!$cobro_id_cfdi) {
            respond(['success' => false, 'error' => 'cobro_id requerido']);
        }
        if (!in_array($tipo, ['xml', 'pdf'])) {
            respond(['success' => false, 'error' => 'tipo debe ser xml o pdf']);
        }
        $chkCfdi = $pdo->prepare(
            "SELECT co.facturapi_id, co.escuela_id, cl.familia_id
             FROM cobros co LEFT JOIN clientes cl ON cl.id = co.cliente_id
             WHERE co.id = ?"
        );
        $chkCfdi->execute([$cobro_id_cfdi]);
        $cobroCfdi = $chkCfdi->fetch();
        if (!$cobroCfdi) { http_response_code(404); respond(['success' => false, 'error' => 'Cobro no encontrado']); }
        if (!$cobroCfdi['facturapi_id']) { http_response_code(400); respond(['success' => false, 'error' => 'Este cobro no tiene factura generada.']); }
        $rolCfdi = $usuario_actual['rol'] ?? '';
        $autorizado = false;
        if ($rolCfdi === 'superadmin') {
            $autorizado = true;
        } elseif (in_array($rolCfdi, ['admin', 'cajero'])) {
            $autorizado = intval($cobroCfdi['escuela_id']) === intval($usuario_actual['escuela_id'] ?? -1);
        } elseif ($rolCfdi === 'familia') {
            $autorizado = $cobroCfdi['familia_id'] !== null && intval($cobroCfdi['familia_id']) === intval($usuario_actual['familia_id'] ?? -1);
        }
        if (!$autorizado) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'No tienes permiso para descargar esta factura.']);
        }
        $facturapi_id = $cobroCfdi['facturapi_id'];
        $url_facturapi = "https://www.facturapi.io/v2/invoices/{$facturapi_id}/{$tipo}";
        $ch = curl_init($url_facturapi);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer ' . FACTURAPI_KEY
            ],
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_FOLLOWLOCATION => true,
        ]);
        $binary   = curl_exec($ch);
        $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err       = curl_error($ch);
        curl_close($ch);
        if ($err) {
            http_response_code(502);
            respond(['success' => false, 'error' => 'Error de red: ' . $err]);
        }
        if ($http_code !== 200) {
            // Facturapi devolvió un error JSON — lo relay como JSON, con el
            // mismo código de estado para que el frontend no lo confunda
            // con una descarga exitosa (antes siempre regresaba HTTP 200
            // aunque el cuerpo fuera un error, y el navegador intentaba
            // "abrir" ese JSON como si fuera el PDF).
            http_response_code($http_code >= 400 && $http_code < 600 ? $http_code : 502);
            header('Content-Type: application/json; charset=UTF-8');
            $decoded = json_decode($binary, true);
            $msg = $decoded['message'] ?? "Facturapi respondió HTTP {$http_code}";
            respond(['success' => false, 'error' => $msg]);
        }
        // Éxito: stream the file to the browser
        // Reemplaza el Content-Type JSON que se mandó al inicio del archivo
        header_remove('Content-Type');
        $mime     = ($tipo === 'pdf') ? 'application/pdf' : 'application/xml; charset=UTF-8';
        $filename = "cfdi-{$facturapi_id}.{$tipo}";
        header("Content-Type: {$mime}");
        header("Content-Disposition: attachment; filename=\"{$filename}\"");
        header('Content-Length: ' . strlen($binary));
        header('Cache-Control: no-cache, must-revalidate');
        log_api("descargar_cfdi -> id={$facturapi_id} tipo={$tipo} http={$http_code}");
        echo $binary;
        exit;
    // ══════════════════════════════════════════════════════════════════════════
    case 'cargar_datos':
        // Carga el estado del usuario actual desde la DB.
        // Respeta el scope: superadmin ve todo lo "ligero" (escuelas + conteos);
        // admin/cajero/familia ven el detalle completo de SU escuela.
        // Para no reventar con cuentas grandes: clientes y cobros van paginados
        // con un tope duro (MAX_FILA), y el superadmin solo trae detalle
        // completo (clientes/familias/productos/cobros) si manda escuela_id_ver.
        $MAX_FILA = 1000; // tope duro por página, sin importar lo que pida el cliente
        $rol       = $usuario_actual['rol']       ?? 'cajero';
        $user_id   = $usuario_actual['user_id']   ?? 0;
        $escuela_id_usuario = null;
        $su = $pdo->prepare("SELECT escuela_id, rol FROM usuarios WHERE id = ?");
        $su->execute([$user_id]);
        $urow = $su->fetch();
        if ($urow) {
            $escuela_id_usuario = $urow['escuela_id'];
            $rol = $urow['rol'];
        }
        // Paginación de clientes (alumnos)
        $pagina_clientes    = max(1, intval($input['pagina_clientes'] ?? $_GET['pagina_clientes'] ?? 1));
        $por_pagina_clientes = intval($input['por_pagina_clientes'] ?? $_GET['por_pagina_clientes'] ?? 25);
        $por_pagina_clientes = max(1, min($por_pagina_clientes, $MAX_FILA));
        $offset_clientes    = ($pagina_clientes - 1) * $por_pagina_clientes;
        $busqueda_clientes  = trim($input['buscar_clientes'] ?? $_GET['buscar_clientes'] ?? '');
        // Superadmin: si no especifica una escuela concreta, solo recibe el
        // catálogo de escuelas + conteos por escuela (resumen liviano), no el
        // detalle de alumnos/familias/productos/cobros de TODAS las escuelas.
        $escuela_id_ver = $rol === 'superadmin'
            ? (intval($input['escuela_id_ver'] ?? $_GET['escuela_id_ver'] ?? 0) ?: null)
            : $escuela_id_usuario;
        // ── Escuelas ──
        if ($rol === 'superadmin') {
            $stmt = $pdo->query("SELECT * FROM escuelas ORDER BY id");
        } else {
            $stmt = $pdo->prepare("SELECT * FROM escuelas WHERE id = ? OR escuela_padre_id = ?");
            $stmt->execute([$escuela_id_usuario, $escuela_id_usuario]);
        }
        $escuelas = $stmt->fetchAll();
        // ── Resumen liviano por escuela (siempre se manda, sirve para el dashboard
        //    de superadmin y para el desglose por plantel sin cargar el detalle
        //    completo de cada escuela) ──
        $resumen_escuelas = [];
        if ($rol === 'superadmin') {
            $rs = $pdo->query(
                "SELECT escuela_id, COUNT(*) AS total_alumnos, SUM(saldo_pendiente) AS saldo_total
                 FROM clientes GROUP BY escuela_id"
            );
            foreach ($rs->fetchAll() as $row) {
                $resumen_escuelas[intval($row['escuela_id'])] = [
                    'total_alumnos' => intval($row['total_alumnos']),
                    'saldo_total'   => floatval($row['saldo_total']),
                    'cobrado_90d'   => 0,
                    'pendiente_90d' => 0,
                    'num_cobros_90d' => 0,
                ];
            }
            // Cobrado/pendiente por escuela en los últimos 90 días (para desglosar
            // por plantel en SuperReportes/Dashboard sin otro roundtrip por escuela)
            $rs2 = $pdo->query(
                "SELECT escuela_id, estado, COUNT(*) AS n, COALESCE(SUM(total),0) AS suma
                 FROM cobros WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
                 GROUP BY escuela_id, estado"
            );
            foreach ($rs2->fetchAll() as $row) {
                $eid = intval($row['escuela_id']);
                if (!isset($resumen_escuelas[$eid])) {
                    $resumen_escuelas[$eid] = ['total_alumnos' => 0, 'saldo_total' => 0, 'cobrado_90d' => 0, 'pendiente_90d' => 0, 'num_cobros_90d' => 0];
                }
                if ($row['estado'] === 'pagado') {
                    $resumen_escuelas[$eid]['cobrado_90d'] += floatval($row['suma']);
                } elseif ($row['estado'] === 'pendiente') {
                    $resumen_escuelas[$eid]['pendiente_90d'] += floatval($row['suma']);
                }
                $resumen_escuelas[$eid]['num_cobros_90d'] += intval($row['n']);
            }
        }
        if ($escuela_id_ver === null && $rol === 'superadmin') {
            // Superadmin sin escuela seleccionada: responde solo lo liviano.
            respond([
                'success'          => true,
                'escuelas'         => $escuelas,
                'resumen_escuelas' => $resumen_escuelas,
                'clientes'         => [],
                'planteles'        => [],
                'familias'         => [],
                'productos'        => [],
                'cobros'           => [],
                'requiere_escuela_id_ver' => true,
            ]);
        }
        // ── Clientes (alumnos) — paginado y con búsqueda opcional ──
        $where_cli = 'escuela_id = ?';
        $params_cli = [$escuela_id_ver];
        if ($busqueda_clientes !== '') {
            $where_cli .= ' AND (nombre LIKE ? OR email LIKE ?)';
            $params_cli[] = "%$busqueda_clientes%";
            $params_cli[] = "%$busqueda_clientes%";
        }
        $cnt = $pdo->prepare("SELECT COUNT(*) AS n FROM clientes WHERE $where_cli");
        $cnt->execute($params_cli);
        $clientes_total = intval($cnt->fetch()['n'] ?? 0);
        $stmt = $pdo->prepare(
            "SELECT * FROM clientes WHERE $where_cli ORDER BY nombre LIMIT $por_pagina_clientes OFFSET $offset_clientes"
        );
        $stmt->execute($params_cli);
        $clientes_raw = $stmt->fetchAll();
        $clientes = array_map(function($c) {
            $c['activo']          = (bool)$c['activo'];
            $c['saldo_pendiente'] = floatval($c['saldo_pendiente']);
            $c['familia_id']      = $c['familia_id'] ? intval($c['familia_id']) : null;
            // El frontend (Alumnos.js, Familias.js, PortalFamilia.js) siempre
            // lee `tel`, pero la columna real es `telefono` — sin este alias
            // el teléfono del alumno se mostraba vacío en todas las vistas.
            $c['tel'] = $c['telefono'] ?? null;
            return $c;
        }, $clientes_raw);
        // ── Planteles (sub escuelas) ──
        $stmt = $pdo->prepare("SELECT * FROM planteles WHERE escuela_id = ? ORDER BY id");
        $stmt->execute([$escuela_id_ver]);
        $planteles_raw = $stmt->fetchAll();
        $planteles = array_map(function($p) {
            $p['activo'] = (bool)$p['activo'];
            return $p;
        }, $planteles_raw);
        // ── Métricas por plantel (alumnos + cobros 90 días de su escuela-cuenta
        //    hija). Disponible para admin/superadmin, no solo superadmin, para
        //    que el dashboard de cada escuela vea sus propios planteles. ──
        $resumen_planteles = [];
        if (!empty($planteles)) {
            $ids_hijos = array_column($planteles, 'escuela_plantel_id');
            $ids_hijos = array_values(array_unique(array_filter($ids_hijos)));
            if (!empty($ids_hijos)) {
                $in = implode(',', array_fill(0, count($ids_hijos), '?'));
                $rp1 = $pdo->prepare("SELECT escuela_id, COUNT(*) AS n FROM clientes WHERE escuela_id IN ($in) GROUP BY escuela_id");
                $rp1->execute($ids_hijos);
                foreach ($rp1->fetchAll() as $row) {
                    $resumen_planteles[intval($row['escuela_id'])]['num_alumnos'] = intval($row['n']);
                }
                $rp2 = $pdo->prepare(
                    "SELECT escuela_id, estado, COUNT(*) AS n, COALESCE(SUM(total),0) AS suma
                     FROM cobros WHERE escuela_id IN ($in) AND fecha >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
                     GROUP BY escuela_id, estado"
                );
                $rp2->execute($ids_hijos);
                foreach ($rp2->fetchAll() as $row) {
                    $eid = intval($row['escuela_id']);
                    if (!isset($resumen_planteles[$eid]['cobrado_90d'])) $resumen_planteles[$eid]['cobrado_90d'] = 0;
                    if (!isset($resumen_planteles[$eid]['pendiente_90d'])) $resumen_planteles[$eid]['pendiente_90d'] = 0;
                    if ($row['estado'] === 'pagado') $resumen_planteles[$eid]['cobrado_90d'] += floatval($row['suma']);
                    if ($row['estado'] === 'pendiente') $resumen_planteles[$eid]['pendiente_90d'] += floatval($row['suma']);
                }
            }
            // Rellenar defaults para los que no tuvieron ni alumnos ni cobros
            foreach ($ids_hijos as $eid) {
                $resumen_planteles[$eid] = array_merge(
                    ['num_alumnos' => 0, 'cobrado_90d' => 0, 'pendiente_90d' => 0],
                    $resumen_planteles[$eid] ?? []
                );
            }
        }
        // ── Familias ──
        $stmt = $pdo->prepare("SELECT * FROM familias WHERE escuela_id = ? ORDER BY nombre LIMIT $MAX_FILA");
        $stmt->execute([$escuela_id_ver]);
        $familias_raw = $stmt->fetchAll();
        $familias = array_map(function($f) {
            $f['activa'] = (bool)$f['activa'];
            return $f;
        }, $familias_raw);
        // ── Productos ──
        $stmt = $pdo->prepare("SELECT * FROM productos WHERE escuela_id = ? ORDER BY nombre LIMIT $MAX_FILA");
        $stmt->execute([$escuela_id_ver]);
        $productos_raw = $stmt->fetchAll();
        $productos = array_map(function($p) {
            $p['activo'] = (bool)$p['activo'];
            $p['precio'] = floatval($p['precio']);
            return $p;
        }, $productos_raw);
        // ── Cobros (últimos 90 días, con tope duro adicional) ──
        // Nota: este campo alimenta también Dashboard.js y el badge de
        // "pendientes" en app.js, que necesitan el conjunto agregado, no una
        // página. La tabla paginada de Cobros.js usa el endpoint aparte
        // 'listar_cobros' (ver más abajo en el switch).
        $stmt = $pdo->prepare(
            "SELECT co.*, COALESCE(cl.nombre, 'Cliente general') AS cliente
             FROM cobros co
             LEFT JOIN clientes cl ON cl.id = co.cliente_id
             WHERE co.escuela_id = ? AND co.fecha >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
             ORDER BY co.id DESC LIMIT $MAX_FILA"
        );
        $stmt->execute([$escuela_id_ver]);
        $cobros_raw = $stmt->fetchAll();
        $cobros = array_map(function($c) {
            $c['total']   = floatval($c['total']);
            $c['factura'] = (bool)$c['factura'];
            $c['cliente'] = $c['cliente'] ?? 'Cliente general';
            return $c;
        }, $cobros_raw);
        // Adjuntar los conceptos (cobro_items) de cada cobro en UNA sola query
        // extra (no una por fila), para que el portal de familia y los
        // reportes puedan mostrar "qué se compró" sin otro roundtrip.
        // Try/catch: si la tabla aún no existe (falta migrar), simplemente no
        // se adjuntan items — no debe tumbar cargar_datos.
        if (!empty($cobros)) {
            try {
                $ids_cobros = array_column($cobros, 'id');
                $in = implode(',', array_fill(0, count($ids_cobros), '?'));
                $stmtIt = $pdo->prepare("SELECT * FROM cobro_items WHERE cobro_id IN ($in) ORDER BY id");
                $stmtIt->execute($ids_cobros);
                $itemsPorCobro = [];
                foreach ($stmtIt->fetchAll() as $it) {
                    $it['cantidad']        = intval($it['cantidad']);
                    $it['precio_unitario'] = floatval($it['precio_unitario']);
                    $it['subtotal']        = floatval($it['subtotal']);
                    $itemsPorCobro[intval($it['cobro_id'])][] = $it;
                }
                foreach ($cobros as &$c) {
                    $c['items'] = $itemsPorCobro[intval($c['id'])] ?? [];
                }
                unset($c);
            } catch (\PDOException $e) {
                // Tabla cobro_items aún no migrada — se omite silenciosamente
            }
        }
        // Resumen agregado exacto (no depende del tope $MAX_FILA de arriba,
        // así el badge de "pendientes" y los totales del dashboard son
        // correctos aunque la escuela tenga más de $MAX_FILA cobros en 90 días).
        $res_co = $pdo->prepare(
            "SELECT estado, COUNT(*) AS n, COALESCE(SUM(total),0) AS suma
             FROM cobros WHERE escuela_id = ? AND fecha >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
             GROUP BY estado"
        );
        $res_co->execute([$escuela_id_ver]);
        $cobros_resumen = ['pagado' => ['n'=>0,'suma'=>0], 'pendiente' => ['n'=>0,'suma'=>0], 'cancelado' => ['n'=>0,'suma'=>0]];
        foreach ($res_co->fetchAll() as $row) {
            $cobros_resumen[$row['estado']] = ['n' => intval($row['n']), 'suma' => floatval($row['suma'])];
        }
        // ── Recordatorios (últimos 60 días, ya reales desde la BD) ──
        // Envuelto en try/catch: si la tabla `recordatorios` (ver
        // optimizacion_bd.sql, Bloque 0) todavía no se migró, cargar_datos
        // no se debe caer completo por eso.
        $recordatorios = [];
        try {
            $stmt = $pdo->prepare(
                "SELECT id, escuela_id, cobro_id, cliente, fecha, canal, usuario_id
                 FROM recordatorios WHERE escuela_id = ? AND fecha >= DATE_SUB(CURDATE(), INTERVAL 60 DAY)
                 ORDER BY fecha DESC LIMIT $MAX_FILA"
            );
            $stmt->execute([$escuela_id_ver]);
            $recordatorios = $stmt->fetchAll();
        } catch (\PDOException $e) {
            file_put_contents(__DIR__ . '/api_log.txt', date('Y-m-d H:i:s') . " | recordatorios no disponible (¿falta migrar tabla?): " . $e->getMessage() . "\n", FILE_APPEND);
        }
        respond([
            'success'           => true,
            'escuelas'          => $escuelas,
            'resumen_escuelas'  => $resumen_escuelas,
            'clientes'          => $clientes,
            'clientes_total'    => $clientes_total,
            'clientes_pagina'   => $pagina_clientes,
            'clientes_por_pagina' => $por_pagina_clientes,
            'planteles'         => $planteles,
            'resumen_planteles' => $resumen_planteles,
            'familias'          => $familias,
            'productos'         => $productos,
            'cobros'            => $cobros,
            'cobros_resumen'    => $cobros_resumen,
            'recordatorios'     => $recordatorios,
            'escuela_id_ver'    => $escuela_id_ver,
        ]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'marcar_recordatorio':
        $cobro_id = intval($input['cobro_id'] ?? 0);
        if (!$cobro_id) respond(['success' => false, 'error' => 'cobro_id requerido']);
        // El cobro debe pertenecer a la escuela del usuario (o cualquiera si superadmin)
        $chk = $pdo->prepare("SELECT co.escuela_id, COALESCE(cl.nombre,'Cliente general') AS cliente FROM cobros co LEFT JOIN clientes cl ON cl.id = co.cliente_id WHERE co.id = ?");
        $chk->execute([$cobro_id]);
        $cobro = $chk->fetch();
        if (!$cobro) respond(['success' => false, 'error' => 'Cobro no encontrado']);
        if ($usuario_actual['rol'] !== 'superadmin' && $cobro['escuela_id'] != ($usuario_actual['escuela_id'] ?? null)) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'No tienes permiso sobre este cobro.']);
        }
        $hoy = date('Y-m-d');
        // Idempotente: un recordatorio por cobro por día (uq_recordatorio_dia)
        try {
            $stmt = $pdo->prepare(
                "INSERT INTO recordatorios (escuela_id, cobro_id, cliente, fecha, canal, usuario_id)
                 VALUES (?, ?, ?, ?, 'manual', ?)
                 ON DUPLICATE KEY UPDATE canal = canal"
            );
            $stmt->execute([$cobro['escuela_id'], $cobro_id, $cobro['cliente'], $hoy, $usuario_actual['user_id'] ?? null]);
        } catch (\PDOException $e) {
            file_put_contents(__DIR__ . '/api_log.txt', date('Y-m-d H:i:s') . " | marcar_recordatorio error (¿falta migrar tabla?): " . $e->getMessage() . "\n", FILE_APPEND);
            respond(['success' => false, 'error' => 'No se pudo guardar el recordatorio. Contacta al administrador (falta migración de BD).']);
        }
        respond(['success' => true]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'listar_logs':
        if (($usuario_actual['rol'] ?? '') !== 'superadmin') {
            http_response_code(403);
            respond(['success' => false, 'error' => 'Solo el superadmin puede ver los logs del sistema.']);
        }
        $pagina_lg    = max(1, intval($input['pagina'] ?? $_GET['pagina'] ?? 1));
        $por_pagina_lg = max(1, min(intval($input['por_pagina'] ?? $_GET['por_pagina'] ?? 25), 200));
        $offset_lg    = ($pagina_lg - 1) * $por_pagina_lg;
        $accion_lg    = trim($input['accion'] ?? $_GET['accion'] ?? '');
        $escuela_lg   = intval($input['escuela_id'] ?? $_GET['escuela_id'] ?? 0);
        $where = '1=1'; $params = [];
        if ($accion_lg !== '') { $where .= ' AND accion = ?'; $params[] = $accion_lg; }
        if ($escuela_lg) { $where .= ' AND escuela_id = ?'; $params[] = $escuela_lg; }
        try {
            $cnt = $pdo->prepare("SELECT COUNT(*) AS n FROM logs_sistema WHERE $where");
            $cnt->execute($params);
            $total_lg = intval($cnt->fetch()['n'] ?? 0);
            $stmt = $pdo->prepare("SELECT * FROM logs_sistema WHERE $where ORDER BY id DESC LIMIT $por_pagina_lg OFFSET $offset_lg");
            $stmt->execute($params);
            $logs = $stmt->fetchAll();
        } catch (\PDOException $e) {
            respond(['success' => false, 'error' => 'La tabla logs_sistema aún no existe. Corre la migración (optimizacion_bd.sql, Bloque 0b).']);
        }
        respond(['success' => true, 'logs' => $logs, 'total' => $total_lg, 'pagina' => $pagina_lg, 'por_pagina' => $por_pagina_lg]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'detalle_cobro':
        $cobro_id_det = intval($input['cobro_id'] ?? $_GET['cobro_id'] ?? 0);
        if (!$cobro_id_det) respond(['success' => false, 'error' => 'cobro_id requerido']);
        $chk = $pdo->prepare("SELECT escuela_id FROM cobros WHERE id = ?");
        $chk->execute([$cobro_id_det]);
        $cobroRow = $chk->fetch();
        if (!$cobroRow) respond(['success' => false, 'error' => 'Cobro no encontrado']);
        if (($usuario_actual['rol'] ?? '') !== 'superadmin' && $cobroRow['escuela_id'] != ($usuario_actual['escuela_id'] ?? null)) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'No tienes permiso para ver este cobro.']);
        }
        try {
            $stmt = $pdo->prepare("SELECT * FROM cobro_items WHERE cobro_id = ? ORDER BY id");
            $stmt->execute([$cobro_id_det]);
            $items = $stmt->fetchAll();
        } catch (\PDOException $e) {
            $items = [];
        }
        respond(['success' => true, 'items' => $items]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'listar_cobros':
        // Endpoint paginado dedicado para la tabla de Cobros.js — independiente
        // del resumen agregado que trae cargar_datos (para no mezclar "página
        // actual" con "totales para el dashboard").
        $escuela_id_lc = intval($input['escuela_id'] ?? $_GET['escuela_id'] ?? 0);
        if (!$escuela_id_lc) respond(['success' => false, 'error' => 'escuela_id requerido']);
        if ($usuario_actual['rol'] !== 'superadmin' && $escuela_id_lc != ($usuario_actual['escuela_id'] ?? null)) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'No tienes permiso para ver los cobros de esa escuela.']);
        }
        $pagina_lc    = max(1, intval($input['pagina'] ?? $_GET['pagina'] ?? 1));
        $por_pagina_lc = max(1, min(intval($input['por_pagina'] ?? $_GET['por_pagina'] ?? 25), 200));
        $offset_lc    = ($pagina_lc - 1) * $por_pagina_lc;
        $estado_lc    = trim($input['estado'] ?? $_GET['estado'] ?? '');
        $buscar_lc    = trim($input['buscar'] ?? $_GET['buscar'] ?? '');
        $where = 'co.escuela_id = ?';
        $params = [$escuela_id_lc];
        if (in_array($estado_lc, ['pagado', 'pendiente', 'cancelado'])) {
            $where .= ' AND co.estado = ?';
            $params[] = $estado_lc;
        }
        if ($buscar_lc !== '') {
            $where .= ' AND (co.folio LIKE ? OR cl.nombre LIKE ? OR co.referencia LIKE ?)';
            $params[] = "%$buscar_lc%"; $params[] = "%$buscar_lc%"; $params[] = "%$buscar_lc%";
        }
        $cnt = $pdo->prepare("SELECT COUNT(*) AS n FROM cobros co LEFT JOIN clientes cl ON cl.id = co.cliente_id WHERE $where");
        $cnt->execute($params);
        $total_lc = intval($cnt->fetch()['n'] ?? 0);
        $stmt = $pdo->prepare(
            "SELECT co.*, COALESCE(cl.nombre, 'Cliente general') AS cliente
             FROM cobros co LEFT JOIN clientes cl ON cl.id = co.cliente_id
             WHERE $where ORDER BY co.id DESC LIMIT $por_pagina_lc OFFSET $offset_lc"
        );
        $stmt->execute($params);
        $lista_lc = array_map(function($c) {
            $c['total']   = floatval($c['total']);
            $c['factura'] = (bool)$c['factura'];
            $c['cliente'] = $c['cliente'] ?? 'Cliente general';
            return $c;
        }, $stmt->fetchAll());
        respond([
            'success'   => true,
            'cobros'    => $lista_lc,
            'total'     => $total_lc,
            'pagina'    => $pagina_lc,
            'por_pagina' => $por_pagina_lc,
        ]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'crear_cobro':
        $escuela_id  = intval($input['escuela_id']  ?? 0);
        $cliente_id  = intval($input['cliente_id']  ?? 0) ?: null;
        $metodo      = trim($input['metodo']         ?? '');
        $referencia  = trim($input['referencia']     ?? '');
        $carrito     = $input['carrito']             ?? [];
        $sucursal_id = intval($input['sucursal_id']  ?? 0) ?: null;
        $caja_id_pos = intval($input['caja_id']      ?? 0) ?: null;
        if (!$escuela_id || !$metodo || empty($carrito)) {
            respond(['success' => false, 'error' => 'Faltan datos del cobro']);
        }
        // Validar contra el enum real de la columna `cobros.metodo` — sin esto,
        // un typo o un cliente mal formado inserta basura silenciosa (así se
        // coló el cobro con metodo='' que encontramos en el dump).
        $metodos_validos = ['Efectivo', 'EfectivoRef', 'TC', 'SPEI', 'CoDi', 'Cheque'];
        if (!in_array($metodo, $metodos_validos, true)) {
            respond(['success' => false, 'error' => 'Método de pago inválido']);
        }
        // Calcular total desde el carrito
        $total = 0;
        foreach ($carrito as $item) {
            $total += floatval($item['precio'] ?? 0) * intval($item['qty'] ?? 1);
        }
        // Generar folio: CLA-ESC{esc_id}-{timestamp}
        $stmt = $pdo->prepare("SELECT clave FROM escuelas WHERE id = ?");
        $stmt->execute([$escuela_id]);
        $esc = $stmt->fetch();
        $clave = $esc ? $esc['clave'] : 'ESC';
        $stmt = $pdo->prepare("SELECT COUNT(*) as n FROM cobros WHERE escuela_id = ?");
        $stmt->execute([$escuela_id]);
        $row = $stmt->fetch();
        $n = intval($row['n'] ?? 0) + 1;
        $folio = $clave . '-' . str_pad($n, 4, '0', STR_PAD_LEFT);
        $stmt = $pdo->prepare(
            "INSERT INTO cobros (escuela_id, cliente_id, folio, total, metodo, estado, fecha, referencia, sucursal_id, caja_id)
             VALUES (?, ?, ?, ?, ?, 'pendiente', CURDATE(), ?, ?, ?)"
        );
        $stmt->execute([$escuela_id, $cliente_id, $folio, $total, $metodo, $referencia, $sucursal_id, $caja_id_pos]);
        $cobro_id = $pdo->lastInsertId();
        // Guardar el detalle línea por línea (qué se compró) — snapshot del
        // nombre/precio al momento de la venta, no una referencia viva al
        // catálogo, para que el historial no cambie si editas productos después.
        // Envuelto en try/catch: si `cobro_items` aún no existe (falta migrar),
        // el cobro en sí NO debe fallar — es lo crítico.
        try {
            $stmtItem = $pdo->prepare(
                "INSERT INTO cobro_items (cobro_id, producto_id, nombre, cantidad, precio_unitario, subtotal)
                 VALUES (?, ?, ?, ?, ?, ?)"
            );
            foreach ($carrito as $item) {
                $precio = floatval($item['precio'] ?? 0);
                $qty    = intval($item['qty'] ?? 1);
                $stmtItem->execute([
                    $cobro_id,
                    intval($item['id'] ?? 0) ?: null,
                    trim($item['nombre'] ?? 'Concepto'),
                    $qty,
                    $precio,
                    $precio * $qty,
                ]);
            }
        } catch (\PDOException $e) {
            file_put_contents(__DIR__ . '/api_log.txt', date('Y-m-d H:i:s') . " | cobro_items no disponible (¿falta migrar tabla?): " . $e->getMessage() . "\n", FILE_APPEND);
        }
        // Obtener nombre del cliente y recalcular su saldo_pendiente
        $cliente_nombre = 'Cliente general';
        if ($cliente_id) {
            $s2 = $pdo->prepare("SELECT nombre FROM clientes WHERE id = ?");
            $s2->execute([$cliente_id]);
            $cl = $s2->fetch();
            if ($cl) $cliente_nombre = $cl['nombre'];
            // Recalcular saldo_pendiente desde cobros (fuente de verdad)
            $pdo->prepare(
                "UPDATE clientes SET saldo_pendiente = (
                    SELECT COALESCE(SUM(total), 0) FROM cobros
                    WHERE cliente_id = ? AND estado = 'pendiente'
                ) WHERE id = ?"
            )->execute([$cliente_id, $cliente_id]);
        }
        $nuevo_saldo_crear = 0;
        if ($cliente_id) {
            $rs = $pdo->prepare("SELECT saldo_pendiente FROM clientes WHERE id = ?");
            $rs->execute([$cliente_id]);
            $nuevo_saldo_crear = floatval($rs->fetchColumn());
        }
        respond([
            'success' => true,
            'cobro' => [
                'id'         => intval($cobro_id),
                'folio'      => $folio,
                'escuela_id' => $escuela_id,
                'cliente_id' => $cliente_id,
                'cliente'    => $cliente_nombre,
                'total'      => $total,
                'metodo'     => $metodo,
                'estado'     => 'pendiente',
                'referencia' => $referencia,
                'fecha'      => date('Y-m-d'),
                'items'      => $carrito,
            ],
            'cliente_id'  => $cliente_id,
            'nuevo_saldo' => $nuevo_saldo_crear,
        ]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'confirmar_pago':
        $cobro_id  = intval($input['cobro_id']  ?? 0);
        $auth_code = trim($input['auth_code']   ?? '');
        $transaccion = trim($input['transaccion'] ?? '');
        // Datos del cheque (si el cobro se está confirmando como pago con
        // cheque). Antes se recibían del frontend pero se descartaban por
        // completo: no había columnas donde guardarlos.
        $banco_cheque      = trim($input['banco_cheque']      ?? '') ?: null;
        $num_cuenta_cheque = trim($input['num_cuenta_cheque'] ?? '') ?: null;
        $num_cheque        = trim($input['num_cheque']        ?? '') ?: null;
        $fecha_cheque      = trim($input['fecha_cheque']      ?? '') ?: null;
        $titular_cheque    = trim($input['titular_cheque']    ?? '') ?: null;
        if (!$cobro_id) respond(['success' => false, 'error' => 'cobro_id requerido']);
        $extra_auth = $auth_code ?: $transaccion ?: null;
        if ($banco_cheque !== null) {
            $stmt = $pdo->prepare(
                "UPDATE cobros SET estado = 'pagado', auth_code = COALESCE(?, auth_code),
                                    banco_cheque = ?, num_cuenta_cheque = ?, num_cheque = ?,
                                    fecha_cheque = ?, titular_cheque = ?, estatus_cheque = 'recibido'
                 WHERE id = ?"
            );
            $stmt->execute([$extra_auth, $banco_cheque, $num_cuenta_cheque, $num_cheque, $fecha_cheque, $titular_cheque, $cobro_id]);
        } else {
            $stmt = $pdo->prepare(
                "UPDATE cobros SET estado = 'pagado', auth_code = COALESCE(?, auth_code) WHERE id = ?"
            );
            $stmt->execute([$extra_auth, $cobro_id]);
        }
        // Recalcular saldo_pendiente del cliente vinculado
        $cob = $pdo->prepare("SELECT cliente_id FROM cobros WHERE id = ?");
        $cob->execute([$cobro_id]);
        $cob_row = $cob->fetch();
        $nuevo_saldo = 0; $cliente_id_afectado = null;
        if (!empty($cob_row['cliente_id'])) {
            $cliente_id_afectado = intval($cob_row['cliente_id']);
            $pdo->prepare(
                "UPDATE clientes SET saldo_pendiente = (
                    SELECT COALESCE(SUM(total), 0) FROM cobros
                    WHERE cliente_id = ? AND estado = 'pendiente'
                ) WHERE id = ?"
            )->execute([$cliente_id_afectado, $cliente_id_afectado]);
            $rs = $pdo->prepare("SELECT saldo_pendiente FROM clientes WHERE id = ?");
            $rs->execute([$cliente_id_afectado]);
            $nuevo_saldo = floatval($rs->fetchColumn());
        }
        respond(['success' => true, 'cobro_id' => $cobro_id, 'estado' => 'pagado',
                 'cliente_id' => $cliente_id_afectado, 'nuevo_saldo' => $nuevo_saldo]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'cancelar_cobro':
        $cobro_id = intval($input['cobro_id'] ?? 0);
        if (!$cobro_id) respond(['success' => false, 'error' => 'cobro_id requerido']);
        $stmt = $pdo->prepare("UPDATE cobros SET estado = 'cancelado' WHERE id = ?");
        $stmt->execute([$cobro_id]);
        // Recalcular saldo_pendiente del cliente vinculado
        $cob = $pdo->prepare("SELECT cliente_id FROM cobros WHERE id = ?");
        $cob->execute([$cobro_id]);
        $cob_row = $cob->fetch();
        $nuevo_saldo = 0; $cliente_id_afectado = null;
        if (!empty($cob_row['cliente_id'])) {
            $cliente_id_afectado = intval($cob_row['cliente_id']);
            $pdo->prepare(
                "UPDATE clientes SET saldo_pendiente = (
                    SELECT COALESCE(SUM(total), 0) FROM cobros
                    WHERE cliente_id = ? AND estado = 'pendiente'
                ) WHERE id = ?"
            )->execute([$cliente_id_afectado, $cliente_id_afectado]);
            $rs = $pdo->prepare("SELECT saldo_pendiente FROM clientes WHERE id = ?");
            $rs->execute([$cliente_id_afectado]);
            $nuevo_saldo = floatval($rs->fetchColumn());
        }
        respond(['success' => true, 'cobro_id' => $cobro_id,
                 'cliente_id' => $cliente_id_afectado, 'nuevo_saldo' => $nuevo_saldo]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    // MARCAR CHEQUE REBOTADO
    //     Un cheque se registra como 'pagado' de inmediato (estatus_cheque =
    //     'recibido'), pero puede rebotar días después por fondos
    //     insuficientes. Esta acción regresa el cobro a 'pendiente' (para
    //     que se vuelva a cobrar por otro medio) sin perder el historial de
    //     los datos del cheque ni la razón (queda estatus_cheque='rebotado').
    // ══════════════════════════════════════════════════════════════════════════
    case 'marcar_cheque_rebotado':
        $cobro_id = intval($input['cobro_id'] ?? 0);
        if (!$cobro_id) respond(['success' => false, 'error' => 'cobro_id requerido']);
        $stmt = $pdo->prepare("SELECT cliente_id, metodo, estatus_cheque FROM cobros WHERE id = ?");
        $stmt->execute([$cobro_id]);
        $cob_row = $stmt->fetch();
        if (!$cob_row) respond(['success' => false, 'error' => 'Cobro no encontrado']);
        if ($cob_row['metodo'] !== 'Cheque') respond(['success' => false, 'error' => 'Este cobro no fue pagado con cheque']);
        if ($cob_row['estatus_cheque'] === 'rebotado') respond(['success' => false, 'error' => 'Este cheque ya estaba marcado como rebotado']);
        $pdo->prepare("UPDATE cobros SET estado = 'pendiente', estatus_cheque = 'rebotado' WHERE id = ?")
            ->execute([$cobro_id]);
        $nuevo_saldo = 0; $cliente_id_afectado = null;
        if (!empty($cob_row['cliente_id'])) {
            $cliente_id_afectado = intval($cob_row['cliente_id']);
            $pdo->prepare(
                "UPDATE clientes SET saldo_pendiente = (
                    SELECT COALESCE(SUM(total), 0) FROM cobros
                    WHERE cliente_id = ? AND estado = 'pendiente'
                ) WHERE id = ?"
            )->execute([$cliente_id_afectado, $cliente_id_afectado]);
            $rs = $pdo->prepare("SELECT saldo_pendiente FROM clientes WHERE id = ?");
            $rs->execute([$cliente_id_afectado]);
            $nuevo_saldo = floatval($rs->fetchColumn());
        }
        registrar_log($pdo, $usuario_actual, 'cheque_rebotado', "Cheque del cobro #{$cobro_id} marcado como rebotado");
        respond(['success' => true, 'cobro_id' => $cobro_id,
                 'cliente_id' => $cliente_id_afectado, 'nuevo_saldo' => $nuevo_saldo]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'crear_cliente':
        // El cajero SÍ puede dar de alta alumnos (para poder cobrarles el mismo
        // día que llegan), pero no editarlos ni desactivarlos — eso sigue
        // restringido a admin/superadmin más abajo en editar_cliente y
        // toggle_cliente_activo.
        $rol_actual = $usuario_actual['rol'] ?? '';
        if (!in_array($rol_actual, ['superadmin', 'admin', 'cajero'])) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'No tienes permiso para dar de alta alumnos.']);
        }
        $escuela_id = intval($input['escuela_id'] ?? 0);
        $nombre     = trim($input['nombre']       ?? '');
        $matricula  = trim($input['matricula']    ?? '') ?: null;
        $grado      = trim($input['grado']        ?? '') ?: null;
        $curp       = trim($input['curp']         ?? '') ?: null;
        $email      = trim($input['email']        ?? '') ?: null;
        $tel        = trim($input['tel']          ?? '') ?: null;
        $familia_id = intval($input['familia_id'] ?? 0) ?: null;
        $tipo       = in_array($input['tipo'] ?? '', ['alumno','general']) ? $input['tipo'] : 'alumno';
        $direccion           = trim($input['direccion']           ?? '') ?: null;
        $contacto_emergencia = trim($input['contacto_emergencia'] ?? '') ?: null;
        $tel_emergencia      = trim($input['tel_emergencia']      ?? '') ?: null;
        $doc_curp_url        = trim($input['doc_curp_url']        ?? '') ?: null;
        $doc_acta_url        = trim($input['doc_acta_url']        ?? '') ?: null;
        $doc_ine_tutor_url   = trim($input['doc_ine_tutor_url']   ?? '') ?: null;
        $nivel_educativo_sat = trim($input['nivel_educativo_sat'] ?? '') ?: null;
        if (!$escuela_id || !$nombre) respond(['success' => false, 'error' => 'escuela_id y nombre son requeridos']);
        // Límite de alumnos según el plan contratado (ver PLANES_LIMITES arriba)
        $plan_esc = $pdo->prepare("SELECT plan FROM escuelas WHERE id = ?");
        $plan_esc->execute([$escuela_id]);
        $plan_nombre = $plan_esc->fetch()['plan'] ?? PLAN_FALLBACK;
        $limite = limitesDelPlan($plan_nombre)['max_alumnos'];
        if ($limite !== null) {
            $cnt = $pdo->prepare("SELECT COUNT(*) AS n FROM clientes WHERE escuela_id = ? AND activo = 1");
            $cnt->execute([$escuela_id]);
            $actuales = intval($cnt->fetch()['n'] ?? 0);
            if ($actuales >= $limite) {
                respond(['success' => false, 'error' => "Llegaste al límite de $limite alumnos activos de tu plan ($plan_nombre). Actualiza tu plan para dar de alta a más alumnos."]);
            }
        }
        $stmt = $pdo->prepare(
            "INSERT INTO clientes (escuela_id, familia_id, tipo, nombre, grado, matricula, curp, email, telefono,
                                    direccion, contacto_emergencia, tel_emergencia, doc_curp_url, doc_acta_url, doc_ine_tutor_url,
                                    nivel_educativo_sat, activo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)"
        );
        $stmt->execute([$escuela_id, $familia_id, $tipo, $nombre, $grado, $matricula, $curp, $email, $tel,
                         $direccion, $contacto_emergencia, $tel_emergencia, $doc_curp_url, $doc_acta_url, $doc_ine_tutor_url,
                         $nivel_educativo_sat]);
        $id = intval($pdo->lastInsertId());
        respond(['success' => true, 'cliente' => array_merge($input, ['id' => $id, 'activo' => true, 'saldo_pendiente' => 0])]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'eliminar_tarjeta_guardada':
        // Familia elimina la tarjeta guardada de SU hijo; admin/superadmin
        // pueden hacerlo por cualquier alumno de su escuela.
        $id_tarj = intval($input['cliente_id'] ?? 0);
        if (!$id_tarj) respond(['success' => false, 'error' => 'cliente_id requerido']);
        $rolTarj = $usuario_actual['rol'] ?? '';
        $chkT = $pdo->prepare("SELECT familia_id, escuela_id FROM clientes WHERE id = ?");
        $chkT->execute([$id_tarj]);
        $cliTarj = $chkT->fetch();
        if (!$cliTarj) respond(['success' => false, 'error' => 'Alumno no encontrado']);
        $autorizadoTarj = false;
        if ($rolTarj === 'superadmin') {
            $autorizadoTarj = true;
        } elseif (in_array($rolTarj, ['admin'])) {
            $autorizadoTarj = intval($cliTarj['escuela_id']) === intval($usuario_actual['escuela_id'] ?? -1);
        } elseif ($rolTarj === 'familia') {
            $autorizadoTarj = $cliTarj['familia_id'] !== null && intval($cliTarj['familia_id']) === intval($usuario_actual['familia_id'] ?? -1);
        }
        if (!$autorizadoTarj) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'No tienes permiso para eliminar esta tarjeta.']);
        }
        $pdo->prepare(
            "UPDATE clientes SET token_tarjeta = NULL, token_tarjeta_expmes = NULL,
             token_tarjeta_expanio = NULL, token_tarjeta_estado = 'cancelado' WHERE id = ?"
        )->execute([$id_tarj]);
        respond(['success' => true]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'cambiar_password_propio':
        // Cualquier usuario autenticado cambia SU PROPIA contraseña,
        // verificando la actual — no requiere ser admin.
        $actual = trim($input['password_actual'] ?? '');
        $nueva  = trim($input['password_nueva']  ?? '');
        if (!$actual || !$nueva) respond(['success' => false, 'error' => 'Faltan datos']);
        if (strlen($nueva) < 8) respond(['success' => false, 'error' => 'La nueva contraseña debe tener al menos 8 caracteres']);
        $stmtPw = $pdo->prepare("SELECT password_hash FROM usuarios WHERE id = ?");
        $stmtPw->execute([$usuario_actual['user_id'] ?? 0]);
        $rowPw = $stmtPw->fetch();
        if (!$rowPw || !password_verify($actual, $rowPw['password_hash'])) {
            respond(['success' => false, 'error' => 'La contraseña actual no es correcta']);
        }
        $pdo->prepare("UPDATE usuarios SET password_hash = ? WHERE id = ?")
            ->execute([password_hash($nueva, PASSWORD_BCRYPT), $usuario_actual['user_id'] ?? 0]);
        registrar_log($pdo, $usuario_actual, 'usuario_cambio_password_propio', 'El usuario cambió su propia contraseña');
        respond(['success' => true]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'editar_cliente':
        $rol_actual = $usuario_actual['rol'] ?? '';
        $es_familia = $rol_actual === 'familia';
        if (!in_array($rol_actual, ['superadmin', 'admin']) && !$es_familia) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'El cajero no puede editar alumnos, solo consultarlos.']);
        }
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        // Familia: solo puede editar a SUS propios hijos, y solo datos de
        // contacto básicos — nunca CLABE, saldo, matrícula, CURP, grado,
        // familia_id, ni activar/desactivar (eso sigue siendo admin/superadmin).
        if ($es_familia) {
            $chk = $pdo->prepare("SELECT familia_id FROM clientes WHERE id = ?");
            $chk->execute([$id]);
            $objetivo = $chk->fetch();
            if (!$objetivo || $objetivo['familia_id'] === null || intval($objetivo['familia_id']) !== intval($usuario_actual['familia_id'] ?? -1)) {
                http_response_code(403);
                respond(['success' => false, 'error' => 'No puedes editar la información de este alumno.']);
            }
            $campos = ['direccion', 'contacto_emergencia', 'tel_emergencia', 'telefono', 'email',
                       'rfc_factura', 'razon_social_factura', 'cp_factura', 'domicilio_factura',
                       'regimen_factura', 'uso_cfdi_defecto'];
        } else {
            $campos = ['nombre','grado','matricula','curp','email','telefono','familia_id',
                       'direccion','contacto_emergencia','tel_emergencia',
                       'doc_curp_url','doc_acta_url','doc_ine_tutor_url','nivel_educativo_sat'];
        }
        $sets = []; $vals = [];
        foreach ($campos as $c) {
            if (array_key_exists($c, $input)) {
                $sets[] = "`$c` = ?";
                // Usar array_key_exists + isset para respetar null explícito
                // (ej: familia_id: null al desvincular un alumno)
                $vals[] = isset($input[$c]) ? $input[$c] : null;
            }
        }
        if (empty($sets)) respond(['success' => false, 'error' => 'Sin campos a actualizar']);
        $vals[] = $id;
        $stmt = $pdo->prepare("UPDATE clientes SET " . implode(', ', $sets) . " WHERE id = ?");
        $stmt->execute($vals);
        // Regresar el registro actualizado real de la DB (no $input parcial)
        $stmt2 = $pdo->prepare("SELECT * FROM clientes WHERE id = ?");
        $stmt2->execute([$id]);
        $clienteActualizado = $stmt2->fetch(PDO::FETCH_ASSOC);
        $clienteActualizado['familia_id'] = $clienteActualizado['familia_id'] ? intval($clienteActualizado['familia_id']) : null;
        $clienteActualizado['activo']     = (bool)$clienteActualizado['activo'];
        $clienteActualizado['tel']        = $clienteActualizado['telefono'] ?? null;
        respond(['success' => true, 'cliente' => $clienteActualizado]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'toggle_cliente_activo':
        if (!in_array($usuario_actual['rol'] ?? '', ['superadmin', 'admin'])) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'El cajero no puede activar/desactivar alumnos.']);
        }
        $id     = intval($input['id']     ?? 0);
        $activo = $input['activar'] ? 1 : 0;
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        $stmt = $pdo->prepare("UPDATE clientes SET activo = ? WHERE id = ?");
        $stmt->execute([$activo, $id]);
        respond(['success' => true, 'cliente' => ['id' => $id, 'activo' => (bool)$activo]]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'crear_familia':
        $escuela_id = intval($input['escuela_id'] ?? 0);
        $nombre     = trim($input['nombre']       ?? '');
        $contacto   = trim($input['contacto']     ?? '') ?: null;
        $email      = trim($input['email']        ?? '') ?: null;
        $tel        = trim($input['telefono']     ?? '') ?: null;
        if (!$escuela_id || !$nombre) respond(['success' => false, 'error' => 'escuela_id y nombre son requeridos']);
        $stmt = $pdo->prepare(
            "INSERT INTO familias (escuela_id, nombre, contacto, email, telefono, activa) VALUES (?,?,?,?,?,1)"
        );
        $stmt->execute([$escuela_id, $nombre, $contacto, $email, $tel]);
        $id = intval($pdo->lastInsertId());
        respond(['success' => true, 'familia' => array_merge($input, ['id' => $id, 'activa' => true])]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'editar_familia':
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        $campos = ['nombre','contacto','email','telefono'];
        $sets = []; $vals = [];
        foreach ($campos as $c) {
            if (array_key_exists($c, $input)) {
                $sets[] = "`$c` = ?";
                $vals[] = $input[$c] ?: null;
            }
        }
        if (empty($sets)) respond(['success' => false, 'error' => 'Sin campos a actualizar']);
        $vals[] = $id;
        $stmt = $pdo->prepare("UPDATE familias SET " . implode(', ', $sets) . " WHERE id = ?");
        $stmt->execute($vals);
        respond(['success' => true, 'familia' => $input]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'listar_usuarios':
        $rol_actual = $usuario_actual['rol']       ?? '';
        $esc_actual = $usuario_actual['escuela_id'] ?? null;
        if ($rol_actual === 'superadmin') {
            $stmt = $pdo->query(
                "SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.escuela_id, u.fecha_alta,
                        u.familia_id, u.creado_por, u.zona,
                        e.nombre AS escuela_nombre
                 FROM usuarios u LEFT JOIN escuelas e ON e.id = u.escuela_id
                 ORDER BY u.rol, u.nombre"
            );
        } else {
            $stmt = $pdo->prepare(
                "SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.escuela_id, u.fecha_alta,
                        u.familia_id, u.creado_por, u.zona,
                        e.nombre AS escuela_nombre
                 FROM usuarios u LEFT JOIN escuelas e ON e.id = u.escuela_id
                 WHERE u.escuela_id = ? AND u.rol != 'superadmin'
                 ORDER BY u.rol, u.nombre"
            );
            $stmt->execute([$esc_actual]);
        }
        $usuarios = $stmt->fetchAll();
        respond(['success' => true, 'usuarios' => $usuarios]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'crear_usuario':
        $rol_actual = $usuario_actual['rol'] ?? '';
        if (!in_array($rol_actual, ['superadmin', 'admin'])) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'No tienes permiso para crear usuarios.']);
        }
        $nombre    = trim($input['nombre']     ?? '');
        $email     = trim($input['email']      ?? '');
        $password  = trim($input['password']   ?? '');
        $rol       = trim($input['rol']        ?? '');
        $esc_id    = intval($input['escuela_id'] ?? 0) ?: null;
        $fam_id    = intval($input['familia_id'] ?? 0) ?: null;
        $roles_validos = ['admin','cajero','familia'];
        if ($rol_actual === 'superadmin') { $roles_validos[] = 'superadmin'; $roles_validos[] = 'distribuidor'; }
        if (!$nombre || !$email || !$password || !in_array($rol, $roles_validos)) {
            respond(['success' => false, 'error' => 'Datos incompletos o rol no permitido']);
        }
        // Un admin solo puede crear usuarios dentro de su propia escuela
        if ($rol_actual === 'admin') {
            $esc_id = $usuario_actual['escuela_id'] ?? null;
        }
        // Un distribuidor no pertenece a ninguna escuela; su "zona" es informativa
        $zona = trim($input['zona'] ?? '') ?: null;
        if ($rol === 'distribuidor') { $esc_id = null; $fam_id = null; }
        // Verificar email único
        $chk = $pdo->prepare("SELECT id FROM usuarios WHERE email = ?");
        $chk->execute([$email]);
        if ($chk->fetch()) respond(['success' => false, 'error' => 'El correo ya está registrado']);
        $creado_por = $usuario_actual["user_id"] ?? null;
        $stmt = $pdo->prepare(
            "INSERT INTO usuarios (escuela_id, nombre, email, password_hash, rol, zona, activo, fecha_alta, familia_id, creado_por)"
            . " VALUES (?, ?, ?, ?, ?, ?, 1, CURDATE(), ?, ?)"
        );
        $stmt->execute([$esc_id, $nombre, $email, password_hash($password, PASSWORD_BCRYPT), $rol, $zona, $fam_id, $creado_por]);
        $id = intval($pdo->lastInsertId());
        registrar_log($pdo, $usuario_actual, 'usuario_creado', "Nuevo usuario '$nombre' ($email) con rol '$rol'", $esc_id);
        respond(["success" => true, "usuario" => ["id" => $id, "nombre" => $nombre, "email" => $email, "rol" => $rol, "escuela_id" => $esc_id, "zona" => $zona, "activo" => true, "familia_id" => $fam_id, "creado_por" => $creado_por]]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'editar_usuario':
        $rol_actual = $usuario_actual['rol'] ?? '';
        $id       = intval($input['id']    ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        // Solo admin/superadmin editan usuarios ajenos; cualquier usuario puede editar su propio perfil
        // (pero sin poder tocar su propio rol/escuela, eso se filtra abajo).
        // OJO: verificar_token_auth() sólo pone 'user_id' en $usuario_actual (nunca 'id') —
        // comparar contra 'id' aquí hacía que $es_propio_perfil fuera SIEMPRE false.
        $es_propio_perfil = ($id === intval($usuario_actual['user_id'] ?? 0));
        if (!in_array($rol_actual, ['superadmin', 'admin']) && !$es_propio_perfil) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'No tienes permiso para editar este usuario.']);
        }
        // Un admin solo puede tocar usuarios de su propia escuela (y nunca a un superadmin)
        if ($rol_actual === 'admin') {
            $chk = $pdo->prepare("SELECT escuela_id, rol FROM usuarios WHERE id = ?");
            $chk->execute([$id]);
            $objetivo = $chk->fetch();
            if (!$objetivo || $objetivo['rol'] === 'superadmin' || $objetivo['escuela_id'] != ($usuario_actual['escuela_id'] ?? null)) {
                http_response_code(403);
                respond(['success' => false, 'error' => 'No tienes permiso para editar este usuario.']);
            }
        }
        $nombre   = trim($input['nombre']  ?? '');
        $email    = trim($input['email']   ?? '');
        $password = trim($input['password'] ?? '');
        $rol      = trim($input['rol']     ?? '');
        $esc_id   = intval($input['escuela_id'] ?? 0) ?: null;
        // familia_id puede enviarse como null explícitamente (limpiar vínculo) o como entero
        $fam_id_raw = $input['familia_id'] ?? '__NO_ENVIADO__';
        $fam_id   = ($fam_id_raw === '__NO_ENVIADO__') ? '__NO_ENVIADO__' : (intval($fam_id_raw) ?: null);
        // zona puede enviarse como null/vacío explícito (limpiar) o como texto
        $zona_raw = $input['zona'] ?? '__NO_ENVIADO__';
        $zona     = ($zona_raw === '__NO_ENVIADO__') ? '__NO_ENVIADO__' : (trim($zona_raw) ?: null);
        // Nadie edita su propio rol/escuela/zona (evita auto-ascenso a superadmin), y solo
        // superadmin puede reasignar rol/escuela/zona de terceros.
        if ($es_propio_perfil || $rol_actual !== 'superadmin') {
            $rol    = '';
            $esc_id = null;
            $zona   = '__NO_ENVIADO__';
        }
        // Si te editas a ti mismo y cambias tu contraseña o tu correo, debes confirmar
        // tu contraseña actual (el frontend ya lo exige, pero antes no se validaba aquí:
        // con solo el token, cualquiera podía cambiarse el password sin saber el actual).
        if ($es_propio_perfil && ($password !== '' || $email !== '')) {
            $password_actual_in = trim($input['password_actual'] ?? '');
            if ($password_actual_in === '') {
                respond(['success' => false, 'error' => 'Ingresa tu contraseña actual para guardar estos cambios.']);
            }
            $stmtPwChk = $pdo->prepare("SELECT password_hash FROM usuarios WHERE id = ?");
            $stmtPwChk->execute([$usuario_actual['user_id'] ?? 0]);
            $rowPwChk = $stmtPwChk->fetch();
            if (!$rowPwChk || !password_verify($password_actual_in, $rowPwChk['password_hash'])) {
                respond(['success' => false, 'error' => 'La contraseña actual no es correcta.']);
            }
        }
        $sets = []; $vals = [];
        if ($nombre)   { $sets[] = 'nombre = ?';         $vals[] = $nombre; }
        if ($email)    { $sets[] = 'email = ?';          $vals[] = $email; }
        if ($password) { $sets[] = 'password_hash = ?';  $vals[] = password_hash($password, PASSWORD_BCRYPT); }
        if ($rol)      { $sets[] = 'rol = ?';            $vals[] = $rol; }
        if ($esc_id !== null) { $sets[] = 'escuela_id = ?'; $vals[] = $esc_id; }
        if ($fam_id !== '__NO_ENVIADO__') { $sets[] = 'familia_id = ?'; $vals[] = $fam_id; }
        if ($zona !== '__NO_ENVIADO__') { $sets[] = 'zona = ?'; $vals[] = $zona; }
        if ($sets) {
            $vals[] = $id;
            $pdo->prepare("UPDATE usuarios SET " . implode(', ', $sets) . " WHERE id = ?")->execute($vals);
            if ($rol || $esc_id !== null || $password) {
                $cambios = array_filter([
                    $rol ? "rol → '$rol'" : null,
                    $esc_id !== null ? "escuela_id → $esc_id" : null,
                    $password ? 'contraseña restablecida' : null,
                ]);
                registrar_log($pdo, $usuario_actual, 'usuario_editado_sensible', "Usuario #$id: " . implode(', ', $cambios));
            }
        }
        // Re-leer el usuario actualizado para devolverlo completo
        $stmt = $pdo->prepare("SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.escuela_id, u.fecha_alta, u.familia_id, u.creado_por, u.zona FROM usuarios u WHERE u.id = ?");
        $stmt->execute([$id]);
        $usuarioActualizado = $stmt->fetch();
        respond(['success' => true, 'usuario' => $usuarioActualizado]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'toggle_usuario':
        $rol_actual = $usuario_actual['rol'] ?? '';
        if (!in_array($rol_actual, ['superadmin', 'admin'])) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'No tienes permiso para esta acción.']);
        }
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        if ($id === intval($usuario_actual['user_id'] ?? 0)) {
            respond(['success' => false, 'error' => 'No puedes desactivarte a ti mismo.']);
        }
        if ($rol_actual === 'admin') {
            $chk = $pdo->prepare("SELECT escuela_id, rol FROM usuarios WHERE id = ?");
            $chk->execute([$id]);
            $objetivo = $chk->fetch();
            if (!$objetivo || $objetivo['rol'] === 'superadmin' || $objetivo['escuela_id'] != ($usuario_actual['escuela_id'] ?? null)) {
                http_response_code(403);
                respond(['success' => false, 'error' => 'No tienes permiso para esta acción.']);
            }
        }
        $stmt = $pdo->prepare("UPDATE usuarios SET activo = NOT activo WHERE id = ?");
        $stmt->execute([$id]);
        registrar_log($pdo, $usuario_actual, 'usuario_activo_toggle', "Usuario #$id");
        respond(['success' => true]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'eliminar_usuario':
        $rol_actual = $usuario_actual['rol'] ?? '';
        if (!in_array($rol_actual, ['superadmin', 'admin'])) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'No tienes permiso para esta acción.']);
        }
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        if ($id === intval($usuario_actual['user_id'] ?? 0)) {
            respond(['success' => false, 'error' => 'No puedes eliminarte a ti mismo.']);
        }
        if ($rol_actual === 'admin') {
            $chk = $pdo->prepare("SELECT escuela_id, rol FROM usuarios WHERE id = ?");
            $chk->execute([$id]);
            $objetivo = $chk->fetch();
            if (!$objetivo || $objetivo['rol'] === 'superadmin' || $objetivo['escuela_id'] != ($usuario_actual['escuela_id'] ?? null)) {
                http_response_code(403);
                respond(['success' => false, 'error' => 'No tienes permiso para esta acción.']);
            }
        }
        $chkNombre = $pdo->prepare("SELECT nombre, email FROM usuarios WHERE id = ?");
        $chkNombre->execute([$id]);
        $objetivoInfo = $chkNombre->fetch();
        $pdo->prepare("DELETE FROM usuarios WHERE id = ?")->execute([$id]);
        registrar_log($pdo, $usuario_actual, 'usuario_eliminado', "Usuario #$id eliminado: " . ($objetivoInfo['nombre'] ?? '') . ' (' . ($objetivoInfo['email'] ?? '') . ')');
        respond(['success' => true]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    // ══════════════════════════════════════════════════════════════════════════
    case 'planteles_de_escuela':
        // Independiente de escuela_id_ver / cargar_datos: el panel "Ver
        // planteles" en Escuelas.js puede abrirse para cualquier escuela sin
        // importar cuál esté seleccionada en el nav global.
        $escuela_id_pe = intval($input['escuela_id'] ?? $_GET['escuela_id'] ?? 0);
        if (!$escuela_id_pe) respond(['success' => false, 'error' => 'escuela_id requerido']);
        if (!in_array($usuario_actual['rol'] ?? '', ['superadmin', 'admin'])) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'No tienes permiso para ver planteles.']);
        }
        if (($usuario_actual['rol'] ?? '') === 'admin' && $escuela_id_pe != ($usuario_actual['escuela_id'] ?? null)) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'No tienes permiso para ver planteles de esa escuela.']);
        }
        $stmt = $pdo->prepare("SELECT * FROM planteles WHERE escuela_id = ? ORDER BY id");
        $stmt->execute([$escuela_id_pe]);
        $planteles_pe = array_map(function($p) {
            $p['activo'] = (bool)$p['activo'];
            return $p;
        }, $stmt->fetchAll());
        respond(['success' => true, 'planteles' => $planteles_pe, 'escuela_id' => $escuela_id_pe]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'crear_plantel':
        // Validación de permisos
        $rol_actual = $usuario_actual['rol'] ?? '';
        if (!in_array($rol_actual, ['superadmin', 'admin'])) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'No tienes permiso para crear planteles.']);
        }
        $escuela_padre_id = intval($input['escuela_id'] ?? 0);
        $nombre           = trim($input['nombre']      ?? '');
        $direccion        = trim($input['direccion']   ?? '');
        $responsable      = trim($input['responsable'] ?? '');
        $tel              = trim($input['tel']         ?? '');
        $email            = trim($input['email']       ?? '');
        $nivel_educativo  = trim($input['nivel_educativo'] ?? '') ?: null;
        $zona             = trim($input['zona']        ?? '') ?: null;
        $rvoe             = trim($input['rvoe']        ?? '') ?: null;
        $niveles_validos  = ['preescolar', 'primaria', 'secundaria', 'preparatoria', 'universidad', 'mixto'];
        if ($nivel_educativo !== null && !in_array($nivel_educativo, $niveles_validos, true)) {
            respond(['success' => false, 'error' => 'Nivel educativo inválido']);
        }
        if (!$escuela_padre_id || !$nombre || !$email) {
            respond(['success' => false, 'error' => 'Faltan datos: escuela_id, nombre y email son obligatorios']);
        }
        // Límite de planteles según el plan contratado
        $plan_esc = $pdo->prepare("SELECT plan FROM escuelas WHERE id = ?");
        $plan_esc->execute([$escuela_padre_id]);
        $plan_nombre = $plan_esc->fetch()['plan'] ?? PLAN_FALLBACK;
        $limite_plt = limitesDelPlan($plan_nombre)['max_planteles'];
        if ($limite_plt !== null) {
            $cnt = $pdo->prepare("SELECT COUNT(*) AS n FROM planteles WHERE escuela_id = ?");
            $cnt->execute([$escuela_padre_id]);
            $actuales = intval($cnt->fetch()['n'] ?? 0);
            if ($actuales >= $limite_plt) {
                respond(['success' => false, 'error' => "Tu plan ($plan_nombre) permite máximo $limite_plt plantel(es). Actualiza a Pro para multi-plantel."]);
            }
        }
        // Validación de scope para administradores
        if ($rol_actual === 'admin' && intval($usuario_actual['escuela_id'] ?? 0) !== $escuela_padre_id) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'Solo puedes crear planteles de tu propia escuela.']);
        }
        $padre = $pdo->prepare("SELECT * FROM escuelas WHERE id = ? AND es_plantel = 0");
        $padre->execute([$escuela_padre_id]);
        $escuelaPadre = $padre->fetch();
        if (!$escuelaPadre) respond(['success' => false, 'error' => 'Escuela principal no encontrada']);
        $chk = $pdo->prepare("SELECT id FROM usuarios WHERE email = ?");
        $chk->execute([$email]);
        if ($chk->fetch()) respond(['success' => false, 'error' => 'El correo ya está registrado']);
        try {
            $pdo->beginTransaction();
            // 1. Insertar en escuelas (para que funcione como entidad de cobro)
            $clave = $escuelaPadre['clave'] . '-' . strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $nombre), 0, 4));
            $stmt = $pdo->prepare(
                "INSERT INTO escuelas (nombre, clave, rfc, telefono, email, direccion, logo_emoji, activa, es_plantel, escuela_padre_id, plan, fecha_alta)
                 VALUES (?, ?, '', ?, ?, ?, '', 1, 1, ?, 'pro', CURDATE())"
            );
            $stmt->execute([$nombre, $clave, $tel, $email, $direccion, $escuela_padre_id]);
            $nueva_escuela_id = intval($pdo->lastInsertId());
            // 2. Insertar en planteles (para la UI de administración)
            $stmt2 = $pdo->prepare(
                "INSERT INTO planteles (escuela_id, escuela_plantel_id, nombre, direccion, nivel_educativo, rvoe, zona, responsable, tel, activo)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)"
            );
            $stmt2->execute([$escuela_padre_id, $nueva_escuela_id, $nombre, $direccion, $nivel_educativo, $rvoe, $zona, $responsable, $tel]);
            $plantel_id = intval($pdo->lastInsertId());
            // 3. Crear la cuenta de usuario (Admin del plantel)
            $password_temporal = substr(str_shuffle('abcdefghijklmnopqrstuvwxyz0123456789'), 0, 8);
            $hash = password_hash($password_temporal, PASSWORD_BCRYPT);
            $stmt3 = $pdo->prepare(
                "INSERT INTO usuarios (escuela_id, nombre, email, password_hash, rol, activo, fecha_alta, creado_por)
                 VALUES (?, ?, ?, ?, 'admin', 1, CURDATE(), ?)"
            );
            $nombre_admin = 'Admin ' . $nombre;
            $stmt3->execute([$nueva_escuela_id, $nombre_admin, $email, $hash, $usuario_actual['user_id'] ?? null]);
            $pdo->commit();
            registrar_log($pdo, $usuario_actual, 'plantel_creado', "Plantel '$nombre' creado bajo escuela #$escuela_padre_id (cuenta: $email)", $escuela_padre_id);
            // Retornar los objetos exactos que espera el frontend
            respond([
                'success' => true,
                'escuela_plantel' => [
                    'id'               => $nueva_escuela_id,
                    'nombre'           => $nombre,
                    'clave'            => $clave,
                    'es_plantel'       => 1,
                    'escuela_padre_id' => $escuela_padre_id
                ],
                'plantel' => [
                    'id'                 => $plantel_id,
                    'escuela_id'         => $escuela_padre_id,
                    'escuela_plantel_id' => $nueva_escuela_id,
                    'nombre'             => $nombre,
                    'direccion'          => $direccion,
                    'nivel_educativo'    => $nivel_educativo,
                    'rvoe'               => $rvoe,
                    'zona'               => $zona,
                    'responsable'        => $responsable,
                    'tel'                => $tel,
                    'activo'             => true
                ],
                'cuenta' => [
                    'email'             => $email,
                    'password_temporal' => $password_temporal
                ]
            ]);
        } catch (Exception $e) {
            $pdo->rollBack();
            respond(['success' => false, 'error' => 'Error de BD: ' . $e->getMessage()]);
        }
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'editar_plantel':
        // Edita un plantel existente: actualiza la fila en `planteles`, la
        // escuela-cuenta asociada (nombre/dirección/teléfono/correo) y, si el
        // correo cambió, también el correo de acceso del usuario admin de esa
        // cuenta (así puede seguir iniciando sesión con el nuevo correo).
        $rol_actual = $usuario_actual['rol'] ?? '';
        if (!in_array($rol_actual, ['superadmin', 'admin'])) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'No tienes permiso para editar planteles.']);
        }
        $id          = intval($input['id']          ?? 0);
        $nombre      = trim($input['nombre']         ?? '');
        $direccion   = trim($input['direccion']      ?? '');
        $responsable = trim($input['responsable']    ?? '');
        $tel         = trim($input['tel']            ?? '');
        $email       = trim($input['email']          ?? '');
        $nivel_educativo = trim($input['nivel_educativo'] ?? '') ?: null;
        $zona            = trim($input['zona']        ?? '') ?: null;
        $rvoe            = trim($input['rvoe']        ?? '') ?: null;
        $niveles_validos = ['preescolar', 'primaria', 'secundaria', 'preparatoria', 'universidad', 'mixto'];
        if ($nivel_educativo !== null && !in_array($nivel_educativo, $niveles_validos, true)) {
            respond(['success' => false, 'error' => 'Nivel educativo inválido']);
        }
        if (!$id || !$nombre) {
            respond(['success' => false, 'error' => 'Faltan datos: id y nombre son obligatorios']);
        }
        $stmt = $pdo->prepare("SELECT * FROM planteles WHERE id = ?");
        $stmt->execute([$id]);
        $plantel = $stmt->fetch();
        if (!$plantel) respond(['success' => false, 'error' => 'Plantel no encontrado']);
        // Scope: un admin solo puede editar planteles de su propia escuela
        if ($rol_actual === 'admin' && intval($usuario_actual['escuela_id'] ?? 0) !== intval($plantel['escuela_id'])) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'Solo puedes editar planteles de tu propia escuela.']);
        }
        $escuela_plantel_id = intval($plantel['escuela_plantel_id']);
        // Si se envía correo, validar que no esté en uso por otra cuenta
        if ($email) {
            $chk = $pdo->prepare("SELECT id FROM usuarios WHERE email = ? AND escuela_id != ?");
            $chk->execute([$email, $escuela_plantel_id]);
            if ($chk->fetch()) respond(['success' => false, 'error' => 'El correo ya está registrado en otra cuenta']);
        }
        try {
            $pdo->beginTransaction();
            // 1. Tabla planteles
            $pdo->prepare(
                "UPDATE planteles SET nombre = ?, direccion = ?, nivel_educativo = ?, rvoe = ?, zona = ?, responsable = ?, tel = ? WHERE id = ?"
            )->execute([$nombre, $direccion, $nivel_educativo, $rvoe, $zona, $responsable, $tel, $id]);
            // 2. Escuela-cuenta del plantel
            $sets = ['nombre = ?', 'direccion = ?', 'telefono = ?'];
            $vals = [$nombre, $direccion, $tel];
            if ($email) { $sets[] = 'email = ?'; $vals[] = $email; }
            $vals[] = $escuela_plantel_id;
            $pdo->prepare("UPDATE escuelas SET " . implode(', ', $sets) . " WHERE id = ?")->execute($vals);
            // 3. Correo de acceso del usuario admin de esa escuela-cuenta
            if ($email) {
                $pdo->prepare(
                    "UPDATE usuarios SET email = ? WHERE escuela_id = ? AND rol = 'admin'"
                )->execute([$email, $escuela_plantel_id]);
            }
            $pdo->commit();
            registrar_log($pdo, $usuario_actual, 'plantel_editado', "Plantel #$id '$nombre' editado");
            respond([
                'success'  => true,
                'plantel'  => [
                    'id'                 => $id,
                    'escuela_id'         => intval($plantel['escuela_id']),
                    'escuela_plantel_id' => $escuela_plantel_id,
                    'nombre'             => $nombre,
                    'direccion'          => $direccion,
                    'nivel_educativo'    => $nivel_educativo,
                    'rvoe'               => $rvoe,
                    'zona'               => $zona,
                    'responsable'        => $responsable,
                    'tel'                => $tel,
                    'activo'             => (bool)$plantel['activo'],
                ],
                'escuela_plantel' => [
                    'id'        => $escuela_plantel_id,
                    'nombre'    => $nombre,
                    'direccion' => $direccion,
                    'telefono'  => $tel,
                    'email'     => $email ?: null,
                ],
            ]);
        } catch (Exception $e) {
            $pdo->rollBack();
            respond(['success' => false, 'error' => 'Error de BD: ' . $e->getMessage()]);
        }
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'toggle_plantel':
        $rol_actual = $usuario_actual['rol'] ?? '';
        if (!in_array($rol_actual, ['superadmin', 'admin'])) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'No tienes permiso para activar/desactivar planteles.']);
        }
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        $stmt = $pdo->prepare("SELECT escuela_plantel_id, activo FROM planteles WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) respond(['success' => false, 'error' => 'Plantel no encontrado']);
        $nuevoEstado = $row['activo'] ? 0 : 1;
        $pdo->prepare("UPDATE planteles SET activo = ? WHERE id = ?")->execute([$nuevoEstado, $id]);
        // La escuela-cuenta del plantel también se activa/desactiva junto con él,
        // para que no pueda iniciar sesión si el plantel está dado de baja.
        $pdo->prepare("UPDATE escuelas SET activa = ? WHERE id = ?")->execute([$nuevoEstado, $row['escuela_plantel_id']]);
        respond(['success' => true, 'activo' => (bool) $nuevoEstado]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'toggle_escuela':
        $rol_actual = $usuario_actual['rol'] ?? '';
        if ($rol_actual !== 'superadmin') {
            http_response_code(403);
            respond(['success' => false, 'error' => 'Solo el super admin puede activar/desactivar escuelas.']);
        }
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        $stmt = $pdo->prepare("UPDATE escuelas SET activa = NOT activa WHERE id = ?");
        $stmt->execute([$id]);
        registrar_log($pdo, $usuario_actual, 'escuela_activa_toggle', "Escuela #$id", $id);
        $stmt = $pdo->prepare("SELECT activa FROM escuelas WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) respond(['success' => false, 'error' => 'Escuela no encontrada']);
        respond(['success' => true, 'activa' => (bool) $row['activa']]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'cambiar_plan_escuela':
        // Endpoint ligero para cambiar SOLO el plan (usado desde el <select>
        // inline en Suscripciones.js) — no exige nombre/clave como editar_escuela.
        if (($usuario_actual['rol'] ?? '') !== 'superadmin') {
            http_response_code(403);
            respond(['success' => false, 'error' => 'Solo el super admin puede cambiar el plan de un colegio.']);
        }
        $id   = intval($input['id'] ?? 0);
        $plan = trim($input['plan'] ?? '');
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        if (!in_array($plan, array_keys(PLANES_LIMITES), true)) {
            respond(['success' => false, 'error' => 'Plan inválido']);
        }
        $chk = $pdo->prepare("SELECT nombre, plan FROM escuelas WHERE id = ?");
        $chk->execute([$id]);
        $esc = $chk->fetch();
        if (!$esc) respond(['success' => false, 'error' => 'Colegio no encontrado']);
        $pdo->prepare("UPDATE escuelas SET plan = ? WHERE id = ?")->execute([$plan, $id]);
        registrar_log($pdo, $usuario_actual, 'escuela_plan_cambiado', "Colegio '{$esc['nombre']}' #$id: plan {$esc['plan']} → $plan", $id);
        respond(['success' => true, 'id' => $id, 'plan' => $plan]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'renovar_suscripcion':
        // El superadmin marca la suscripción de un colegio como pagada/renovada.
        // No hay cobro automático de la mensualidad SaaS en este sistema (se
        // factura/cobra aparte); esto solo mueve la fecha de vencimiento un mes
        // calendario hacia adelante y reactiva los recordatorios para el próximo ciclo.
        if (($usuario_actual['rol'] ?? '') !== 'superadmin') {
            http_response_code(403);
            respond(['success' => false, 'error' => 'Solo el super admin puede renovar una suscripción.']);
        }
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        $chk = $pdo->prepare("SELECT nombre, fecha_vencimiento_plan FROM escuelas WHERE id = ? AND es_plantel = 0");
        $chk->execute([$id]);
        $esc = $chk->fetch();
        if (!$esc) respond(['success' => false, 'error' => 'Colegio no encontrado']);
        // Si ya vencía desde hace tiempo, no se acumulan meses atrasados: se
        // renueva un mes completo a partir de hoy, no desde la fecha vieja.
        $base = $esc['fecha_vencimiento_plan'];
        if (!$base || strtotime($base) < strtotime(date('Y-m-d'))) $base = date('Y-m-d');
        $nuevo_vencimiento = siguiente_vencimiento_mensual($base);
        $pdo->prepare("UPDATE escuelas SET fecha_vencimiento_plan = ?, ultimo_recordatorio_plan = NULL WHERE id = ?")
            ->execute([$nuevo_vencimiento, $id]);
        registrar_log($pdo, $usuario_actual, 'suscripcion_renovada', "Colegio '{$esc['nombre']}' #$id: vencimiento → $nuevo_vencimiento", $id);
        respond(['success' => true, 'id' => $id, 'fecha_vencimiento_plan' => $nuevo_vencimiento]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'buscar_global':
        // Búsqueda cruzando TODAS las escuelas — solo superadmin. Sirve para
        // soporte: "no encuentro a mi hijo/mi cuenta" sin adivinar en qué
        // colegio está.
        if (($usuario_actual['rol'] ?? '') !== 'superadmin') {
            http_response_code(403);
            respond(['success' => false, 'error' => 'Solo el super admin puede usar la búsqueda global.']);
        }
        $q = trim($input['q'] ?? $_GET['q'] ?? '');
        if (mb_strlen($q) < 3) {
            respond(['success' => false, 'error' => 'Escribe al menos 3 caracteres para buscar.']);
        }
        $like = "%$q%";
        $stmtCli = $pdo->prepare(
            "SELECT cl.id, cl.nombre, cl.matricula, cl.email, cl.escuela_id, es.nombre AS escuela_nombre
             FROM clientes cl JOIN escuelas es ON es.id = cl.escuela_id
             WHERE cl.nombre LIKE ? OR cl.matricula LIKE ? OR cl.email LIKE ? OR cl.curp LIKE ?
             LIMIT 20"
        );
        $stmtCli->execute([$like, $like, $like, $like]);
        $alumnos = $stmtCli->fetchAll();
        $stmtUsu = $pdo->prepare(
            "SELECT u.id, u.nombre, u.email, u.rol, u.escuela_id, u.activo, es.nombre AS escuela_nombre
             FROM usuarios u LEFT JOIN escuelas es ON es.id = u.escuela_id
             WHERE u.nombre LIKE ? OR u.email LIKE ?
             LIMIT 20"
        );
        $stmtUsu->execute([$like, $like]);
        $usuarios = $stmtUsu->fetchAll();
        respond(['success' => true, 'alumnos' => $alumnos, 'usuarios' => $usuarios]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'crear_escuela':
        if (($usuario_actual['rol'] ?? '') !== 'superadmin') {
            http_response_code(403);
            respond(['success' => false, 'error' => 'Solo el super admin puede crear colegios.']);
        }
        $nombre     = trim($input['nombre']     ?? '');
        $clave      = trim($input['clave']      ?? '');
        $rfc        = trim($input['rfc']        ?? '') ?: null;
        $telefono   = trim($input['telefono']   ?? '') ?: null;
        $email      = trim($input['email']      ?? '') ?: null;
        $direccion  = trim($input['direccion']  ?? '') ?: null;
        $logo_emoji = trim($input['logo_emoji'] ?? '') ?: '🏫';
        $rvoe       = trim($input['rvoe']       ?? '') ?: null;
        $plan       = trim($input['plan']       ?? 'basico');
        if (!in_array($plan, array_keys(PLANES_LIMITES), true)) $plan = PLAN_FALLBACK;
        if (!$nombre || !$clave) respond(['success' => false, 'error' => 'Nombre y clave son obligatorios']);
        $chk = $pdo->prepare("SELECT id FROM escuelas WHERE clave = ?");
        $chk->execute([$clave]);
        if ($chk->fetch()) respond(['success' => false, 'error' => 'Ya existe un colegio con esa clave']);
        // Primer periodo de la suscripción: prorrateado, vence a fin del mes en
        // curso (a partir de ahí, cada renovación cubre un mes calendario completo).
        $fecha_vencimiento_plan = fin_de_mes_actual();
        $stmt = $pdo->prepare(
            "INSERT INTO escuelas (nombre, clave, rfc, rvoe, telefono, email, direccion, logo_emoji, activa, es_plantel, plan, fecha_alta, fecha_vencimiento_plan)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, CURDATE(), ?)"
        );
        $stmt->execute([$nombre, $clave, $rfc, $rvoe, $telefono, $email, $direccion, $logo_emoji, $plan, $fecha_vencimiento_plan]);
        $nuevo_id = intval($pdo->lastInsertId());
        registrar_log($pdo, $usuario_actual, 'escuela_creada', "Colegio '$nombre' ($clave)", $nuevo_id);
        respond(['success' => true, 'escuela' => [
            'id' => $nuevo_id, 'nombre' => $nombre, 'clave' => $clave, 'rfc' => $rfc, 'rvoe' => $rvoe,
            'telefono' => $telefono, 'email' => $email, 'direccion' => $direccion,
            'logo_emoji' => $logo_emoji, 'activa' => true, 'es_plantel' => false,
            'escuela_padre_id' => null, 'plan' => $plan, 'fecha_alta' => date('Y-m-d'),
            'fecha_vencimiento_plan' => $fecha_vencimiento_plan,
        ]]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'editar_escuela':
        if (($usuario_actual['rol'] ?? '') !== 'superadmin') {
            http_response_code(403);
            respond(['success' => false, 'error' => 'Solo el super admin puede editar colegios.']);
        }
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        $nombre     = trim($input['nombre']     ?? '');
        $clave      = trim($input['clave']      ?? '');
        $rfc        = trim($input['rfc']        ?? '') ?: null;
        $telefono   = trim($input['telefono']   ?? '') ?: null;
        $email      = trim($input['email']      ?? '') ?: null;
        $direccion  = trim($input['direccion']  ?? '') ?: null;
        $logo_emoji = trim($input['logo_emoji'] ?? '') ?: '🏫';
        $rvoe       = trim($input['rvoe']       ?? '') ?: null;
        $plan       = trim($input['plan']       ?? '');
        if (!$nombre || !$clave) respond(['success' => false, 'error' => 'Nombre y clave son obligatorios']);
        if ($plan !== '' && !in_array($plan, array_keys(PLANES_LIMITES), true)) {
            respond(['success' => false, 'error' => 'Plan inválido']);
        }
        $chk = $pdo->prepare("SELECT id FROM escuelas WHERE clave = ? AND id != ?");
        $chk->execute([$clave, $id]);
        if ($chk->fetch()) respond(['success' => false, 'error' => 'Ya existe otro colegio con esa clave']);
        $sets = ["nombre = ?", "clave = ?", "rfc = ?", "rvoe = ?", "telefono = ?", "email = ?", "direccion = ?", "logo_emoji = ?"];
        $vals = [$nombre, $clave, $rfc, $rvoe, $telefono, $email, $direccion, $logo_emoji];
        if ($plan !== '') { $sets[] = "plan = ?"; $vals[] = $plan; }
        $vals[] = $id;
        $pdo->prepare("UPDATE escuelas SET " . implode(', ', $sets) . " WHERE id = ?")->execute($vals);
        registrar_log($pdo, $usuario_actual, 'escuela_editada', "Colegio #$id: '$nombre'" . ($plan !== '' ? " (plan → $plan)" : ''), $id);
        $stmt = $pdo->prepare("SELECT * FROM escuelas WHERE id = ?");
        $stmt->execute([$id]);
        $esc = $stmt->fetch();
        $esc['activa'] = (bool) $esc['activa'];
        $esc['es_plantel'] = (bool) $esc['es_plantel'];
        respond(['success' => true, 'escuela' => $esc]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    // POOL DE CLABEs SPEI
    // ══════════════════════════════════════════════════════════════════════════
    case 'importar_clabes':
        // Recibe: { escuela_id, clabes: ["646180...", "646180...", ...] }
        $rol_actual = $usuario_actual['rol'] ?? '';
        if (!in_array($rol_actual, ['superadmin', 'admin'])) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'No tienes permiso para importar CLABEs.']);
        }
        $escuela_id = intval($input['escuela_id'] ?? 0);
        $clabes     = $input['clabes'] ?? [];
        if (!$escuela_id || empty($clabes)) {
            respond(['success' => false, 'error' => 'escuela_id y clabes[] son requeridos']);
        }
        // Verificar que la escuela existe
        $chk = $pdo->prepare("SELECT id FROM escuelas WHERE id = ?");
        $chk->execute([$escuela_id]);
        if (!$chk->fetch()) respond(['success' => false, 'error' => 'Escuela no encontrada']);
        $insertadas = 0;
        $duplicadas = 0;
        $stmt = $pdo->prepare(
            "INSERT IGNORE INTO clabe_pool (escuela_id, clabe, estado, fecha_alta)
             VALUES (?, ?, 'libre', CURDATE())"
        );
        foreach ($clabes as $clabe) {
            $clabe = preg_replace('/\s+/', '', trim($clabe)); // quitar espacios
            if (!preg_match('/^\d{18}$/', $clabe)) continue;  // validar 18 dígitos
            $stmt->execute([$escuela_id, $clabe]);
            if ($stmt->rowCount() > 0) $insertadas++;
            else $duplicadas++;
        }
        registrar_log($pdo, $usuario_actual, 'clabes_importadas', "$insertadas importadas, $duplicadas duplicadas ignoradas", $escuela_id);
        respond(['success' => true, 'insertadas' => $insertadas, 'duplicadas' => $duplicadas]);
    break;
    case 'listar_clabes_pool':
        // Recibe: { escuela_id }
        $escuela_id = intval($input['escuela_id'] ?? 0);
        if (!$escuela_id) respond(['success' => false, 'error' => 'escuela_id requerido']);
        $stmt = $pdo->prepare(
            "SELECT cp.id, cp.clabe, cp.estado, cp.fecha_alta, cp.fecha_asign,
                    c.nombre AS alumno, c.matricula
             FROM clabe_pool cp
             LEFT JOIN clientes c ON c.id = cp.cliente_id
             WHERE cp.escuela_id = ?
             ORDER BY cp.estado ASC, cp.id ASC"
        );
        $stmt->execute([$escuela_id]);
        $pool = $stmt->fetchAll();
        // Contadores
        $stmt2 = $pdo->prepare(
            "SELECT estado, COUNT(*) as n FROM clabe_pool WHERE escuela_id = ? GROUP BY estado"
        );
        $stmt2->execute([$escuela_id]);
        $conteos = [];
        foreach ($stmt2->fetchAll() as $row) $conteos[$row['estado']] = intval($row['n']);
        respond([
            'success' => true,
            'pool'    => $pool,
            'totales' => [
                'libre'    => $conteos['libre']    ?? 0,
                'asignada' => $conteos['asignada'] ?? 0,
                'liberada' => $conteos['liberada'] ?? 0,
            ],
        ]);
    break;
    case 'asignar_clabe_pool':
        // Toma la primera CLABE libre del pool de la escuela y la asigna al alumno
        // Recibe: { escuela_id, cliente_id }
        $escuela_id = intval($input['escuela_id'] ?? 0);
        $cliente_id = intval($input['cliente_id'] ?? 0);
        if (!$escuela_id || !$cliente_id) {
            respond(['success' => false, 'error' => 'escuela_id y cliente_id son requeridos']);
        }
        // Verificar que el alumno no tenga ya CLABE asignada del pool
        $chk = $pdo->prepare(
            "SELECT clabe FROM clabe_pool WHERE cliente_id = ? AND estado = 'asignada'"
        );
        $chk->execute([$cliente_id]);
        if ($row = $chk->fetch()) {
            respond(['success' => true, 'clabe' => $row['clabe'], 'ya_tenia' => true]);
        }
        // Tomar la primera CLABE libre (FOR UPDATE para evitar race conditions)
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare(
                "SELECT id, clabe FROM clabe_pool
                 WHERE escuela_id = ? AND estado IN ('libre', 'liberada')
                 ORDER BY id ASC LIMIT 1 FOR UPDATE"
            );
            $stmt->execute([$escuela_id]);
            $clabeRow = $stmt->fetch();
            if (!$clabeRow) {
                $pdo->rollBack();
                respond(['success' => false, 'error' => 'No hay CLABEs SPEI disponibles. Importa más CLABEs al pool.']);
            }
            // Marcar como asignada en el pool
            $upd = $pdo->prepare(
                "UPDATE clabe_pool SET estado='asignada', cliente_id=?, fecha_asign=CURDATE()
                 WHERE id = ?"
            );
            $upd->execute([$cliente_id, $clabeRow['id']]);
            // Actualizar el alumno en la tabla clientes
            $upd2 = $pdo->prepare(
                "UPDATE clientes SET clabe_individual=?, clabe_individual_estado='activa',
                 clabe_individual_fecha=CURDATE() WHERE id=?"
            );
            $upd2->execute([$clabeRow['clabe'], $cliente_id]);
            $pdo->commit();
            respond(['success' => true, 'clabe' => $clabeRow['clabe']]);
        } catch (Exception $e) {
            $pdo->rollBack();
            respond(['success' => false, 'error' => 'Error al asignar CLABE: ' . $e->getMessage()]);
        }
    break;
    case 'liberar_clabe_pool':
        // Libera la CLABE de un alumno y la devuelve al pool como 'liberada'
        // Recibe: { cliente_id }
        $cliente_id = intval($input['cliente_id'] ?? 0);
        if (!$cliente_id) respond(['success' => false, 'error' => 'cliente_id requerido']);
        $pdo->beginTransaction();
        try {
            $upd = $pdo->prepare(
                "UPDATE clabe_pool SET estado='liberada', cliente_id=NULL, fecha_asign=NULL
                 WHERE cliente_id=? AND estado='asignada'"
            );
            $upd->execute([$cliente_id]);
            $upd2 = $pdo->prepare(
                "UPDATE clientes SET clabe_individual=NULL, clabe_individual_estado='liberada'
                 WHERE id=?"
            );
            $upd2->execute([$cliente_id]);
            $pdo->commit();
            respond(['success' => true]);
        } catch (Exception $e) {
            $pdo->rollBack();
            respond(['success' => false, 'error' => $e->getMessage()]);
        }
    break;
    case 'eliminar_clabes_pool':
        // Elimina CLABEs libres/liberadas del pool (no asignadas)
        // Recibe: { escuela_id, ids: [1,2,3] }
        $rol_actual = $usuario_actual['rol'] ?? '';
        if (!in_array($rol_actual, ['superadmin', 'admin'])) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'No tienes permiso para eliminar CLABEs del pool.']);
        }
        $escuela_id = intval($input['escuela_id'] ?? 0);
        $ids = array_filter(array_map('intval', $input['ids'] ?? []), fn($i) => $i > 0);
        if (!$escuela_id || empty($ids)) respond(['success' => false, 'error' => 'Datos insuficientes']);
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare(
            "DELETE FROM clabe_pool WHERE escuela_id=? AND id IN ($placeholders) AND estado != 'asignada'"
        );
        $stmt->execute(array_merge([$escuela_id], $ids));
        registrar_log($pdo, $usuario_actual, 'clabes_eliminadas', $stmt->rowCount() . ' CLABE(s) eliminadas del pool', $escuela_id);
        respond(['success' => true, 'eliminadas' => $stmt->rowCount()]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    // MÓDULO DE CAJA — apertura / cierre / historial / resumen / movimientos
    // Pegar este bloque en api.php, dentro del switch($action), junto a los
    // demás "case". El orden no importa, PHP resuelve por coincidencia del case.
    // ══════════════════════════════════════════════════════════════════════════
    case 'caja_sucursales':
        // Lista sucursales de la escuela del usuario (o todas si es superadmin y manda escuela_id)
        $escuela_id = intval($input['escuela_id'] ?? $_GET['escuela_id'] ?? $usuario_actual['escuela_id'] ?? 0);
        if (!$escuela_id) respond(['success' => false, 'error' => 'escuela_id requerido']);
        $stmt = $pdo->prepare("SELECT id, nombre, activa FROM sucursales WHERE escuela_id = ? AND activa = 1 ORDER BY nombre");
        $stmt->execute([$escuela_id]);
        respond(['success' => true, 'sucursales' => $stmt->fetchAll()]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'caja_estado':
        // Devuelve la caja abierta del usuario actual en esa sucursal (o null)
        $sucursal_id = intval($input['sucursal_id'] ?? $_GET['sucursal_id'] ?? 0);
        $usuario_id  = intval($usuario_actual['user_id']);
        if (!$sucursal_id) respond(['success' => false, 'error' => 'sucursal_id requerido']);
        $stmt = $pdo->prepare(
            "SELECT * FROM caja WHERE sucursal_id = ? AND usuario_id = ? AND estado = 'abierta'
             ORDER BY id DESC LIMIT 1"
        );
        $stmt->execute([$sucursal_id, $usuario_id]);
        $caja = $stmt->fetch();
        respond(['success' => true, 'caja' => $caja ?: null]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'caja_abrir':
        $sucursal_id    = intval($input['sucursal_id'] ?? 0);
        $monto_apertura = floatval($input['monto_apertura'] ?? -1);
        $observaciones  = trim($input['observaciones'] ?? '');
        $usuario_id     = intval($usuario_actual['user_id']);
        if (!$sucursal_id) respond(['success' => false, 'error' => 'sucursal_id requerido']);
        if ($monto_apertura < 0) respond(['success' => false, 'error' => 'Monto de apertura inválido']);
        // No permitir dos cajas abiertas simultáneas del mismo usuario en la misma sucursal
        $chk = $pdo->prepare("SELECT id FROM caja WHERE sucursal_id = ? AND usuario_id = ? AND estado = 'abierta'");
        $chk->execute([$sucursal_id, $usuario_id]);
        if ($chk->fetch()) {
            respond(['success' => false, 'error' => 'Ya tienes una caja abierta en esta sucursal. Ciérrala antes de abrir otra.']);
        }
        $stmt = $pdo->prepare(
            "INSERT INTO caja (sucursal_id, usuario_id, monto_apertura, observaciones, estado, fecha_apertura)
             VALUES (?, ?, ?, ?, 'abierta', NOW())"
        );
        $stmt->execute([$sucursal_id, $usuario_id, $monto_apertura, $observaciones]);
        $caja_id = $pdo->lastInsertId();
        log_api("caja_abrir -> caja_id={$caja_id} sucursal={$sucursal_id} usuario={$usuario_id} monto={$monto_apertura}");
        $s2 = $pdo->prepare("SELECT * FROM caja WHERE id = ?");
        $s2->execute([$caja_id]);
        respond(['success' => true, 'caja' => $s2->fetch()]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'caja_movimiento':
        // Ingreso/egreso manual (ej. "retiro de efectivo", "préstamo a caja chica")
        $caja_id  = intval($input['caja_id'] ?? 0);
        $tipo     = trim($input['tipo']      ?? '');
        $concepto = trim($input['concepto']  ?? '');
        $total    = floatval($input['total'] ?? 0);
        if (!$caja_id || !in_array($tipo, ['ingreso', 'egreso']) || $total <= 0) {
            respond(['success' => false, 'error' => 'Datos de movimiento inválidos']);
        }
        $chk = $pdo->prepare("SELECT id FROM caja WHERE id = ? AND estado = 'abierta'");
        $chk->execute([$caja_id]);
        if (!$chk->fetch()) respond(['success' => false, 'error' => 'La caja no está abierta']);
        $stmt = $pdo->prepare(
            "INSERT INTO movimientos_caja (caja_id, tipo, concepto, total, fecha) VALUES (?, ?, ?, ?, NOW())"
        );
        $stmt->execute([$caja_id, $tipo, $concepto, $total]);
        respond(['success' => true, 'movimiento_id' => intval($pdo->lastInsertId())]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'caja_cerrar':
        $caja_id       = intval($input['caja_id']       ?? 0);
        $monto_cierre  = floatval($input['monto_cierre'] ?? -1);
        $observaciones = trim($input['observaciones']    ?? '');
        if (!$caja_id) respond(['success' => false, 'error' => 'caja_id requerido']);
        if ($monto_cierre < 0) respond(['success' => false, 'error' => 'Monto de cierre inválido']);
        $stmt = $pdo->prepare("SELECT * FROM caja WHERE id = ? AND estado = 'abierta'");
        $stmt->execute([$caja_id]);
        $caja_actual = $stmt->fetch();
        if (!$caja_actual) respond(['success' => false, 'error' => 'Caja no encontrada o ya cerrada']);
        // Ventas del POS asociadas a esta caja, agrupadas por método (solo pagadas)
        $vstmt = $pdo->prepare(
            "SELECT metodo, COALESCE(SUM(total),0) as total FROM cobros
             WHERE caja_id = ? AND estado = 'pagado' GROUP BY metodo"
        );
        $vstmt->execute([$caja_id]);
        $ventas_por_metodo = ['Efectivo' => 0, 'TC' => 0, 'SPEI' => 0, 'CoDi' => 0];
        foreach ($vstmt->fetchAll() as $row) {
            if (isset($ventas_por_metodo[$row['metodo']])) $ventas_por_metodo[$row['metodo']] = floatval($row['total']);
        }
        $ventas_efectivo      = $ventas_por_metodo['Efectivo'];
        $ventas_tarjeta       = $ventas_por_metodo['TC'];
        $ventas_transferencia = $ventas_por_metodo['SPEI'] + $ventas_por_metodo['CoDi'];
        $total_ventas         = $ventas_efectivo + $ventas_tarjeta + $ventas_transferencia;
        // Movimientos manuales (ingresos/egresos de efectivo, no ventas del POS)
        $mstmt = $pdo->prepare(
            "SELECT tipo, COALESCE(SUM(total),0) as total FROM movimientos_caja WHERE caja_id = ? GROUP BY tipo"
        );
        $mstmt->execute([$caja_id]);
        $otros_ingresos = 0; $otros_egresos = 0;
        foreach ($mstmt->fetchAll() as $row) {
            if ($row['tipo'] === 'ingreso') $otros_ingresos = floatval($row['total']);
            if ($row['tipo'] === 'egreso')  $otros_egresos  = floatval($row['total']);
        }
        // Monto esperado en efectivo = apertura + ventas en efectivo + otros ingresos - otros egresos
        $monto_esperado = floatval($caja_actual['monto_apertura']) + $ventas_efectivo + $otros_ingresos - $otros_egresos;
        $diferencia     = $monto_cierre - $monto_esperado;
        $upd = $pdo->prepare(
            "UPDATE caja SET
                fecha_cierre = NOW(), monto_cierre = ?, monto_esperado = ?, diferencia = ?,
                ventas_efectivo = ?, ventas_tarjeta = ?, ventas_transferencia = ?, total_ventas = ?,
                otros_ingresos = ?, otros_egresos = ?, observaciones = ?, estado = 'cerrada'
             WHERE id = ?"
        );
        $upd->execute([
            $monto_cierre, $monto_esperado, $diferencia,
            $ventas_efectivo, $ventas_tarjeta, $ventas_transferencia, $total_ventas,
            $otros_ingresos, $otros_egresos, $observaciones, $caja_id
        ]);
        log_api("caja_cerrar -> caja_id={$caja_id} esperado={$monto_esperado} cierre={$monto_cierre} diff={$diferencia}");
        $s2 = $pdo->prepare("SELECT * FROM caja WHERE id = ?");
        $s2->execute([$caja_id]);
        respond(['success' => true, 'caja' => $s2->fetch()]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'caja_historial':
        $sucursal_id = intval($input['sucursal_id'] ?? $_GET['sucursal_id'] ?? 0);
        $escuela_id  = intval($input['escuela_id']  ?? $_GET['escuela_id']  ?? $usuario_actual['escuela_id'] ?? 0);
        // Un cajero solo debe ver su propio historial de cortes, no el de sus
        // compañeros (admin/superadmin sí ven el de toda la sucursal/escuela).
        $solo_propio = ($usuario_actual['rol'] ?? '') === 'cajero';
        $filtro_usuario = $solo_propio ? " AND c.usuario_id = " . intval($usuario_actual['user_id'] ?? 0) : "";
        if ($sucursal_id) {
            $stmt = $pdo->prepare(
                "SELECT c.*, u.nombre AS usuario_nombre, s.nombre AS sucursal_nombre
                 FROM caja c
                 JOIN usuarios u ON c.usuario_id = u.id
                 JOIN sucursales s ON c.sucursal_id = s.id
                 WHERE c.sucursal_id = ? $filtro_usuario ORDER BY c.id DESC LIMIT 200"
            );
            $stmt->execute([$sucursal_id]);
        } elseif ($escuela_id) {
            $stmt = $pdo->prepare(
                "SELECT c.*, u.nombre AS usuario_nombre, s.nombre AS sucursal_nombre
                 FROM caja c
                 JOIN usuarios u ON c.usuario_id = u.id
                 JOIN sucursales s ON c.sucursal_id = s.id
                 WHERE s.escuela_id = ? $filtro_usuario ORDER BY c.id DESC LIMIT 200"
            );
            $stmt->execute([$escuela_id]);
        } else {
            respond(['success' => false, 'error' => 'sucursal_id o escuela_id requerido']);
        }
        respond(['success' => true, 'historial' => $stmt->fetchAll()]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'caja_resumen':
        $caja_id = intval($input['caja_id'] ?? $_GET['caja_id'] ?? 0);
        if (!$caja_id) respond(['success' => false, 'error' => 'caja_id requerido']);
        $stmt = $pdo->prepare(
            "SELECT c.*, u.nombre AS usuario_nombre, s.nombre AS sucursal_nombre
             FROM caja c
             JOIN usuarios u ON c.usuario_id = u.id
             JOIN sucursales s ON c.sucursal_id = s.id
             WHERE c.id = ?"
        );
        $stmt->execute([$caja_id]);
        $caja = $stmt->fetch();
        if (!$caja) respond(['success' => false, 'error' => 'Corte de caja no encontrado']);
        $vstmt = $pdo->prepare(
            "SELECT id, folio, cliente_id, total, metodo, estado, fecha FROM cobros
             WHERE caja_id = ? ORDER BY id DESC"
        );
        $vstmt->execute([$caja_id]);
        $mstmt = $pdo->prepare(
            "SELECT * FROM movimientos_caja WHERE caja_id = ? ORDER BY fecha DESC"
        );
        $mstmt->execute([$caja_id]);
        respond([
            'success'      => true,
            'caja'         => $caja,
            'ventas'       => $vstmt->fetchAll(),
            'movimientos'  => $mstmt->fetchAll(),
        ]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'distribuidor_datos':
        if (($usuario_actual['rol'] ?? '') !== 'distribuidor') {
            http_response_code(403);
            respond(['success' => false, 'error' => 'Solo distribuidores pueden ver este panel.']);
        }
        $dist_id = intval($usuario_actual['user_id'] ?? 0);
        $du = $pdo->prepare("SELECT nombre, zona FROM usuarios WHERE id = ?");
        $du->execute([$dist_id]);
        $distribuidor_row = $du->fetch() ?: ['nombre' => '', 'zona' => null];
        $rstmt = $pdo->prepare(
            "SELECT r.id, r.escuela_id, r.nombre_colegio, r.num_alumnos, r.estado, r.comision_pct, r.fecha_alta, r.notas,
                    e.nombre AS escuela_nombre
             FROM distribuidor_referidos r
             LEFT JOIN escuelas e ON e.id = r.escuela_id
             WHERE r.distribuidor_id = ?
             ORDER BY r.fecha_alta DESC, r.id DESC"
        );
        $rstmt->execute([$dist_id]);
        $referidos = $rstmt->fetchAll();
        // Alumnos reales de colegios ya vinculados (si no se guardó num_alumnos manual)
        $escuela_ids = array_values(array_filter(array_map(fn($r) => $r['escuela_id'], $referidos)));
        $alumnos_por_escuela = [];
        if ($escuela_ids) {
            $in = implode(',', array_fill(0, count($escuela_ids), '?'));
            $astmt = $pdo->prepare("SELECT escuela_id, COUNT(*) AS n FROM clientes WHERE escuela_id IN ($in) GROUP BY escuela_id");
            $astmt->execute($escuela_ids);
            foreach ($astmt->fetchAll() as $row) $alumnos_por_escuela[intval($row['escuela_id'])] = intval($row['n']);
        }
        // Comisión: sobre cobros 'pagado' de colegios en estado 'activo' y con escuela ya vinculada
        $activos_escuela_ids = array_values(array_filter(array_map(
            fn($r) => $r['estado'] === 'activo' ? $r['escuela_id'] : null, $referidos
        )));
        $comision_mes = 0.0;
        $comision_acumulada = 0.0;
        $colegios_facturando = 0;
        if ($activos_escuela_ids) {
            $in2 = implode(',', array_fill(0, count($activos_escuela_ids), '?'));
            // Cobrado del mes en curso, por escuela
            $cmstmt = $pdo->prepare(
                "SELECT escuela_id, SUM(total) AS cobrado FROM cobros
                 WHERE estado = 'pagado' AND escuela_id IN ($in2)
                   AND YEAR(fecha) = YEAR(CURDATE()) AND MONTH(fecha) = MONTH(CURDATE())
                 GROUP BY escuela_id"
            );
            $cmstmt->execute($activos_escuela_ids);
            $cobrado_mes_por_escuela = [];
            foreach ($cmstmt->fetchAll() as $row) $cobrado_mes_por_escuela[intval($row['escuela_id'])] = floatval($row['cobrado']);
            // Cobrado acumulado del año, por escuela
            $castmt = $pdo->prepare(
                "SELECT escuela_id, SUM(total) AS cobrado FROM cobros
                 WHERE estado = 'pagado' AND escuela_id IN ($in2) AND YEAR(fecha) = YEAR(CURDATE())
                 GROUP BY escuela_id"
            );
            $castmt->execute($activos_escuela_ids);
            $cobrado_anio_por_escuela = [];
            foreach ($castmt->fetchAll() as $row) $cobrado_anio_por_escuela[intval($row['escuela_id'])] = floatval($row['cobrado']);
            foreach ($referidos as $r) {
                if ($r['estado'] !== 'activo' || !$r['escuela_id']) continue;
                $eid = intval($r['escuela_id']);
                $pct = floatval($r['comision_pct']) / 100;
                $cobradoMes = $cobrado_mes_por_escuela[$eid] ?? 0;
                $cobradoAnio = $cobrado_anio_por_escuela[$eid] ?? 0;
                if ($cobradoMes > 0) $colegios_facturando++;
                $comision_mes += $cobradoMes * $pct;
                $comision_acumulada += $cobradoAnio * $pct;
            }
        }
        $colegios = array_map(function($r) use ($alumnos_por_escuela) {
            $eid = $r['escuela_id'] ? intval($r['escuela_id']) : null;
            return [
                'id'             => intval($r['id']),
                'escuela_id'     => $eid,
                'nombre'         => $r['escuela_nombre'] ?: $r['nombre_colegio'],
                'num_alumnos'    => $eid && isset($alumnos_por_escuela[$eid]) ? $alumnos_por_escuela[$eid] : ($r['num_alumnos'] ? intval($r['num_alumnos']) : null),
                'estado'         => $r['estado'],
                'comision_pct'   => floatval($r['comision_pct']),
                'fecha_alta'     => $r['fecha_alta'],
                'notas'          => $r['notas'],
            ];
        }, $referidos);
        $conteo_estados = ['activo' => 0, 'implementacion' => 0, 'demo_agendada' => 0, 'prospecto' => 0];
        foreach ($referidos as $r) {
            if (isset($conteo_estados[$r['estado']])) $conteo_estados[$r['estado']]++;
        }
        respond([
            'success'  => true,
            'distribuidor' => ['nombre' => $distribuidor_row['nombre'], 'zona' => $distribuidor_row['zona']],
            'colegios' => $colegios,
            'stats' => [
                'comision_mes'         => round($comision_mes, 2),
                'colegios_activos'     => $conteo_estados['activo'],
                'colegios_totales'     => count($referidos),
                'colegios_facturando'  => $colegios_facturando,
                'en_implementacion'    => $conteo_estados['implementacion'],
                'comision_acumulada'   => round($comision_acumulada, 2),
                'anio'                 => intval(date('Y')),
            ],
            'embudo' => $conteo_estados,
        ]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'distribuidor_invitar_colegio':
        if (($usuario_actual['rol'] ?? '') !== 'distribuidor') {
            http_response_code(403);
            respond(['success' => false, 'error' => 'Solo distribuidores pueden invitar colegios.']);
        }
        $dist_id = intval($usuario_actual['user_id'] ?? 0);
        $nombre_colegio = trim($input['nombre_colegio'] ?? '');
        $num_alumnos = intval($input['num_alumnos'] ?? 0) ?: null;
        $notas = trim($input['notas'] ?? '') ?: null;
        if (!$nombre_colegio) {
            respond(['success' => false, 'error' => 'El nombre del colegio es obligatorio']);
        }
        $stmt = $pdo->prepare(
            "INSERT INTO distribuidor_referidos (distribuidor_id, nombre_colegio, num_alumnos, estado, comision_pct, fecha_alta, notas)
             VALUES (?, ?, ?, 'prospecto', 5.00, CURDATE(), ?)"
        );
        $stmt->execute([$dist_id, $nombre_colegio, $num_alumnos, $notas]);
        $nuevo_id = intval($pdo->lastInsertId());
        registrar_log($pdo, $usuario_actual, 'colegio_referido', "Distribuidor invitó a '$nombre_colegio'", null);
        respond(['success' => true, 'referido' => [
            'id' => $nuevo_id, 'escuela_id' => null, 'nombre' => $nombre_colegio,
            'num_alumnos' => $num_alumnos, 'estado' => 'prospecto', 'comision_pct' => 5.00,
            'fecha_alta' => date('Y-m-d'), 'notas' => $notas,
        ]]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'distribuidor_comisiones':
        if (($usuario_actual['rol'] ?? '') !== 'distribuidor') {
            http_response_code(403);
            respond(['success' => false, 'error' => 'Solo distribuidores pueden ver este panel.']);
        }
        $dist_id = intval($usuario_actual['user_id'] ?? 0);
        $rstmt = $pdo->prepare(
            "SELECT r.id, r.escuela_id, r.nombre_colegio, r.comision_pct,
                    e.nombre AS escuela_nombre
             FROM distribuidor_referidos r
             LEFT JOIN escuelas e ON e.id = r.escuela_id
             WHERE r.distribuidor_id = ? AND r.estado = 'activo' AND r.escuela_id IS NOT NULL"
        );
        $rstmt->execute([$dist_id]);
        $activos = $rstmt->fetchAll();
        $escuela_ids = array_values(array_unique(array_map(fn($r) => intval($r['escuela_id']), $activos)));

        // Historial de los últimos 12 meses (cobrado * % por escuela, sumado)
        $meses_es = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        $meses = [];
        for ($i = 11; $i >= 0; $i--) {
            $ts = strtotime("-$i months");
            $meses[] = ['anio' => intval(date('Y', $ts)), 'mes' => intval(date('n', $ts)), 'label' => $meses_es[intval(date('n', $ts)) - 1]];
        }
        $cobrado_por_mes_escuela = [];
        if ($escuela_ids) {
            $in = implode(',', array_fill(0, count($escuela_ids), '?'));
            $hstmt = $pdo->prepare(
                "SELECT escuela_id, YEAR(fecha) AS anio, MONTH(fecha) AS mes, SUM(total) AS cobrado
                 FROM cobros
                 WHERE estado = 'pagado' AND escuela_id IN ($in) AND fecha >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
                 GROUP BY escuela_id, YEAR(fecha), MONTH(fecha)"
            );
            $hstmt->execute($escuela_ids);
            foreach ($hstmt->fetchAll() as $row) {
                $cobrado_por_mes_escuela[$row['anio'] . '-' . $row['mes']][intval($row['escuela_id'])] = floatval($row['cobrado']);
            }
        }
        $pct_por_escuela = [];
        foreach ($activos as $r) $pct_por_escuela[intval($r['escuela_id'])] = floatval($r['comision_pct']) / 100;

        $historial = array_map(function($m) use ($cobrado_por_mes_escuela, $pct_por_escuela) {
            $clave = $m['anio'] . '-' . $m['mes'];
            $cobradoMes = $cobrado_por_mes_escuela[$clave] ?? [];
            $comision = 0.0;
            foreach ($cobradoMes as $eid => $cobrado) $comision += $cobrado * ($pct_por_escuela[$eid] ?? 0);
            return ['mes' => $clave, 'label' => $m['label'], 'comision' => round($comision, 2)];
        }, $meses);

        // Detalle por colegio activo: mes en curso y acumulado del año
        $mesClave = date('Y') . '-' . date('n');
        $colegios = [];
        foreach ($activos as $r) {
            $eid = intval($r['escuela_id']);
            $pct = $pct_por_escuela[$eid];
            $cobradoMes = $cobrado_por_mes_escuela[$mesClave][$eid] ?? 0;
            $cobradoAnio = 0.0;
            foreach ($cobrado_por_mes_escuela as $clave => $porEscuela) {
                if (str_starts_with($clave, date('Y') . '-')) $cobradoAnio += $porEscuela[$eid] ?? 0;
            }
            $colegios[] = [
                'id'             => intval($r['id']),
                'nombre'         => $r['escuela_nombre'] ?: $r['nombre_colegio'],
                'comision_pct'   => floatval($r['comision_pct']),
                'cobrado_mes'    => round($cobradoMes, 2),
                'comision_mes'   => round($cobradoMes * $pct, 2),
                'comision_anio'  => round($cobradoAnio * $pct, 2),
            ];
        }
        respond(['success' => true, 'historial' => $historial, 'colegios' => $colegios]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'distribuidor_datos_pago':
        if (($usuario_actual['rol'] ?? '') !== 'distribuidor') {
            http_response_code(403);
            respond(['success' => false, 'error' => 'Solo distribuidores pueden ver este panel.']);
        }
        $dist_id = intval($usuario_actual['user_id'] ?? 0);
        $stmt = $pdo->prepare("SELECT pago_banco AS banco, pago_clabe AS clabe, pago_titular AS titular FROM usuarios WHERE id = ?");
        $stmt->execute([$dist_id]);
        $datos = $stmt->fetch() ?: ['banco' => '', 'clabe' => '', 'titular' => ''];
        respond(['success' => true, 'datos_pago' => [
            'banco'   => $datos['banco'] ?? '',
            'clabe'   => $datos['clabe'] ?? '',
            'titular' => $datos['titular'] ?? '',
        ]]);
    break;
    // ══════════════════════════════════════════════════════════════════════════
    case 'distribuidor_guardar_datos_pago':
        if (($usuario_actual['rol'] ?? '') !== 'distribuidor') {
            http_response_code(403);
            respond(['success' => false, 'error' => 'Solo distribuidores pueden editar este panel.']);
        }
        $dist_id = intval($usuario_actual['user_id'] ?? 0);
        $banco   = trim($input['banco'] ?? '') ?: null;
        $clabe   = trim($input['clabe'] ?? '') ?: null;
        $titular = trim($input['titular'] ?? '') ?: null;
        if ($clabe && !preg_match('/^\d{18}$/', $clabe)) {
            respond(['success' => false, 'error' => 'La CLABE debe tener exactamente 18 dígitos.']);
        }
        $pdo->prepare("UPDATE usuarios SET pago_banco = ?, pago_clabe = ?, pago_titular = ? WHERE id = ?")
            ->execute([$banco, $clabe, $titular, $dist_id]);
        registrar_log($pdo, $usuario_actual, 'distribuidor_datos_pago_actualizados', 'Distribuidor actualizó sus datos de pago');
        respond(['success' => true]);
    break;
    default:
        respond(['success' => false, 'error' => "Acción no reconocida: {$action}"]);
}
?>
