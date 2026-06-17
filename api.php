<?php
/**
 * EduPago — Backend API v4 (Segura con DB)
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

header('Content-Type: application/json; charset=UTF-8');
header('Access-Control-Allow-Origin: *'); // Cambiar a tu dominio en prod
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { 
    http_response_code(200); 
    exit(); 
}

function verificar_token_auth() {
    $headers = apache_request_headers();
    $authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
    
    if (empty($authHeader) || !preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'No autorizado. Token requerido.']);
        exit;
    }
    return ['user_id' => 1, 'rol' => 'admin']; 
}

$action = $_GET['action'] ?? '';
$acciones_publicas = ['login', 'descargar_cfdi', 'verificar_spei']; 

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
    $result = curl_exec($ch);
    $err    = curl_error($ch);
    curl_close($ch);
    return ['body' => $result, 'error' => $err];
}

$input = json_decode(file_get_contents('php://input'), true) ?? [];

switch ($action) {

    case 'login':
        $email = trim($input['email'] ?? '');
        $pass  = $input['password'] ?? '';

        if (!$email || !$pass) respond(['success' => false, 'error' => 'Faltan credenciales']);

        $stmt = $pdo->prepare("SELECT id, nombre, email, password_hash, rol, escuela_id FROM usuarios WHERE email = ? AND activo = 1");
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if ($user && $pass === $user['password_hash']) {
            $token = base64_encode(bin2hex(random_bytes(16)) . ':' . $user['id']);
            respond([
                'success' => true, 
                'user' => [
                    'id' => $user['id'],
                    'nombre' => $user['nombre'],
                    'email' => $user['email'],
                    'rol' => $user['rol'],
                    'escuela_id' => $user['escuela_id'],
                    'token' => $token
                ]
            ]);
        }
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
        if (!$referencia) respond(['success' => false, 'error' => 'Referencia requerida']);

        $stmt = $pdo->prepare("SELECT estado, total, auth_code, fecha FROM cobros WHERE referencia = ?");
        $stmt->execute([$referencia]);
        $cobro = $stmt->fetch();

        if ($cobro && $cobro['estado'] === 'pagado') {
            respond([
                'success'       => true,
                'pagado'        => true,
                'monto_pesos'   => $cobro['total'],
                'clave_rastreo' => $cobro['auth_code'],
            ]);
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
    // 4. GENERAR LIGA TARJETA (sin cambios)
    // ══════════════════════════════════════════════════════════════════════════
    case 'generar_liga':
        $folio       = $input['folio']       ?? 'COB-0000';
        $total       = floatval($input['total'] ?? 0);
        $descripcion = $input['descripcion'] ?? 'Pago escolar';

        if ($total < 10) respond(['success' => false, 'error' => 'Monto mínimo $10.00']);

        $ts      = intval(substr(time(), -6));
        $rand    = rand(100, 999);
        $base    = $ts . $rand;
        $id_pago = str_pad($base, 9,  '0', STR_PAD_LEFT);
        $ref     = str_pad($base, 15, '0', STR_PAD_LEFT);

        $payload = [
            'User'          => PDT_USER,
            'Password'      => PDT_PASS,
            'IntegrationID' => PDT_INT_ID,
            'BusinessID'    => PDT_BUS_ID_TC,
            'PaymentTypes'  => '401',
            'Id'            => $id_pago,
            'Description'   => substr($descripcion, 0, 40),
            'Amount'        => intval($total * 100),
            'Reference'     => $ref,
            'ExpirationDate'=> date('Y-m-d', strtotime('+1 day')),
        ];

        log_api("generar_liga -> folio={$folio} total={$total}");
        $res = curl_post(PDT_URL_LIGA, $payload);

        if ($res['error']) respond(['success' => false, 'error' => 'Error de red: ' . $res['error']]);

        $raw  = json_decode($res['body'], true) ?? [];
        $data_resp = [];
        foreach ($raw as $k => $v) { $data_resp[trim($k)] = $v; }

        $url_pago = $data_resp['url'] ?? $data_resp['Url'] ?? $data_resp['URL'] ?? null;
        if (!$url_pago) {
            respond(['success' => false, 'error' => 'Sin URL de pago', 'raw' => $data_resp]);
        }

        respond([
            'success'    => true,
            'url'        => $url_pago,
            'referencia' => $ref,
            'qr_url'     => 'https://api.qrserver.com/v2/create-qr-code/?size=300x300&margin=10&data=' . urlencode($url_pago),
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
        $descripcion = $input['descripcion'] ?? 'Servicios educativos';
        
        // CFDI 4.0 exige el Código Postal del receptor. 
        // Si no lo pides en el frontend, Facturapi arrojará error si no coincide con el RFC.
        $cp_receptor = $input['cp_receptor'] ?? '97000'; 

        if (!$rfc || !$razon || $total <= 0) {
            respond(['success' => false, 'error' => 'RFC, razón social y total son requeridos']);
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

        $payload_facturapi = [
            "customer" => [
                "legal_name" => $razon,
                "tax_id"     => $rfc,
                "tax_system" => $regimen,
                "address"    => $customer_address,
                "email"      => $email ?: null
            ],
            "items" => [
                [
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
                ]
            ],
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
                'qr_url'         => 'https://api.qrserver.com/v2/create-qr-code/?size=200x200&data=' . urlencode($response_data['verification_url'] ?? ''),
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
        $facturapi_id = trim($_GET['id'] ?? '');
        $tipo         = strtolower(trim($_GET['tipo'] ?? 'pdf'));

        if (!$facturapi_id) {
            respond(['success' => false, 'error' => 'ID de Facturapi requerido']);
        }
        if (!in_array($tipo, ['xml', 'pdf'])) {
            respond(['success' => false, 'error' => 'tipo debe ser xml o pdf']);
        }

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
            respond(['success' => false, 'error' => 'Error de red: ' . $err]);
        }

        if ($http_code !== 200) {
            // Facturapi devolvió un error JSON — lo relay como JSON
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
        // Carga el estado completo del usuario actual desde la DB
        // Respeta el scope: superadmin ve todo, admin/cajero/familia ven su escuela

        $rol       = $usuario_actual['rol']       ?? 'cajero';
        $user_id   = $usuario_actual['user_id']   ?? 0;
        $escuela_id_usuario = null;

        // Obtener escuela_id del usuario en la DB
        $su = $pdo->prepare("SELECT escuela_id, rol FROM usuarios WHERE id = ?");
        $su->execute([$user_id]);
        $urow = $su->fetch();
        if ($urow) {
            $escuela_id_usuario = $urow['escuela_id'];
            $rol = $urow['rol'];
        }

        // ── Escuelas ──
        if ($rol === 'superadmin') {
            $stmt = $pdo->query("SELECT * FROM escuelas ORDER BY id");
        } else {
            $stmt = $pdo->prepare("SELECT * FROM escuelas WHERE id = ?");
            $stmt->execute([$escuela_id_usuario]);
        }
        $escuelas = $stmt->fetchAll();

        // ── Clientes (alumnos) ──
        if ($rol === 'superadmin') {
            $stmt = $pdo->query("SELECT * FROM clientes ORDER BY escuela_id, nombre");
        } else {
            $stmt = $pdo->prepare("SELECT * FROM clientes WHERE escuela_id = ? ORDER BY nombre");
            $stmt->execute([$escuela_id_usuario]);
        }
        $clientes_raw = $stmt->fetchAll();
        $clientes = array_map(function($c) {
            $c['activo']          = (bool)$c['activo'];
            $c['saldo_pendiente'] = floatval($c['saldo_pendiente']);
            $c['familia_id']      = $c['familia_id'] ? intval($c['familia_id']) : null;
            return $c;
        }, $clientes_raw);

        // ── Familias ──
        if ($rol === 'superadmin') {
            $stmt = $pdo->query("SELECT * FROM familias ORDER BY escuela_id, nombre");
        } else {
            $stmt = $pdo->prepare("SELECT * FROM familias WHERE escuela_id = ? ORDER BY nombre");
            $stmt->execute([$escuela_id_usuario]);
        }
        $familias_raw = $stmt->fetchAll();
        $familias = array_map(function($f) {
            $f['activa'] = (bool)$f['activa'];
            return $f;
        }, $familias_raw);

        // ── Productos ──
        if ($rol === 'superadmin') {
            $stmt = $pdo->query("SELECT * FROM productos ORDER BY escuela_id, nombre");
        } else {
            $stmt = $pdo->prepare("SELECT * FROM productos WHERE escuela_id = ? ORDER BY nombre");
            $stmt->execute([$escuela_id_usuario]);
        }
        $productos_raw = $stmt->fetchAll();
        $productos = array_map(function($p) {
            $p['activo'] = (bool)$p['activo'];
            $p['precio'] = floatval($p['precio']);
            return $p;
        }, $productos_raw);

        // ── Cobros (últimos 90 días para no sobrecargar) ──
        // Se incluye LEFT JOIN con clientes para traer el nombre (alias "cliente"),
        // ya que el frontend (Dashboard.js, Cobros.js) espera c.cliente como string.
        if ($rol === 'superadmin') {
            $stmt = $pdo->query(
                "SELECT co.*, COALESCE(cl.nombre, 'Cliente general') AS cliente
                 FROM cobros co
                 LEFT JOIN clientes cl ON cl.id = co.cliente_id
                 WHERE co.fecha >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
                 ORDER BY co.id DESC"
            );
        } else {
            $stmt = $pdo->prepare(
                "SELECT co.*, COALESCE(cl.nombre, 'Cliente general') AS cliente
                 FROM cobros co
                 LEFT JOIN clientes cl ON cl.id = co.cliente_id
                 WHERE co.escuela_id = ? AND co.fecha >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
                 ORDER BY co.id DESC"
            );
            $stmt->execute([$escuela_id_usuario]);
        }
        $cobros_raw = $stmt->fetchAll();
        $cobros = array_map(function($c) {
            $c['total']   = floatval($c['total']);
            $c['factura'] = (bool)$c['factura'];
            $c['cliente'] = $c['cliente'] ?? 'Cliente general';
            return $c;
        }, $cobros_raw);

        respond([
            'success'   => true,
            'escuelas'  => $escuelas,
            'clientes'  => $clientes,
            'familias'  => $familias,
            'productos' => $productos,
            'cobros'    => $cobros,
        ]);
    break;



    // ══════════════════════════════════════════════════════════════════════════
    case 'crear_cobro':
        $escuela_id  = intval($input['escuela_id']  ?? 0);
        $cliente_id  = intval($input['cliente_id']  ?? 0) ?: null;
        $metodo      = trim($input['metodo']         ?? '');
        $referencia  = trim($input['referencia']     ?? '');
        $carrito     = $input['carrito']             ?? [];

        if (!$escuela_id || !$metodo || empty($carrito)) {
            respond(['success' => false, 'error' => 'Faltan datos del cobro']);
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
            "INSERT INTO cobros (escuela_id, cliente_id, folio, total, metodo, estado, fecha, referencia)
             VALUES (?, ?, ?, ?, ?, 'pendiente', CURDATE(), ?)"
        );
        $stmt->execute([$escuela_id, $cliente_id, $folio, $total, $metodo, $referencia]);
        $cobro_id = $pdo->lastInsertId();

        // Obtener nombre del cliente
        $cliente_nombre = 'Cliente general';
        if ($cliente_id) {
            $s2 = $pdo->prepare("SELECT nombre FROM clientes WHERE id = ?");
            $s2->execute([$cliente_id]);
            $cl = $s2->fetch();
            if ($cl) $cliente_nombre = $cl['nombre'];
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
            ]
        ]);
    break;

    // ══════════════════════════════════════════════════════════════════════════
    case 'confirmar_pago':
        $cobro_id  = intval($input['cobro_id']  ?? 0);
        $auth_code = trim($input['auth_code']   ?? '');
        $transaccion = trim($input['transaccion'] ?? '');

        if (!$cobro_id) respond(['success' => false, 'error' => 'cobro_id requerido']);

        $extra_auth = $auth_code ?: $transaccion ?: null;

        $stmt = $pdo->prepare(
            "UPDATE cobros SET estado = 'pagado', auth_code = COALESCE(?, auth_code) WHERE id = ?"
        );
        $stmt->execute([$extra_auth, $cobro_id]);

        respond(['success' => true, 'cobro_id' => $cobro_id, 'estado' => 'pagado']);
    break;

    // ══════════════════════════════════════════════════════════════════════════
    case 'cancelar_cobro':
        $cobro_id = intval($input['cobro_id'] ?? 0);
        if (!$cobro_id) respond(['success' => false, 'error' => 'cobro_id requerido']);

        $stmt = $pdo->prepare("UPDATE cobros SET estado = 'cancelado' WHERE id = ?");
        $stmt->execute([$cobro_id]);

        respond(['success' => true, 'cobro_id' => $cobro_id]);
    break;

    // ══════════════════════════════════════════════════════════════════════════
    case 'crear_cliente':
        $escuela_id = intval($input['escuela_id'] ?? 0);
        $nombre     = trim($input['nombre']       ?? '');
        $matricula  = trim($input['matricula']    ?? '') ?: null;
        $grado      = trim($input['grado']        ?? '') ?: null;
        $curp       = trim($input['curp']         ?? '') ?: null;
        $email      = trim($input['email']        ?? '') ?: null;
        $tel        = trim($input['tel']          ?? '') ?: null;
        $familia_id = intval($input['familia_id'] ?? 0) ?: null;
        $tipo       = in_array($input['tipo'] ?? '', ['alumno','general']) ? $input['tipo'] : 'alumno';

        if (!$escuela_id || !$nombre) respond(['success' => false, 'error' => 'escuela_id y nombre son requeridos']);

        $stmt = $pdo->prepare(
            "INSERT INTO clientes (escuela_id, familia_id, tipo, nombre, grado, matricula, curp, email, telefono, activo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)"
        );
        $stmt->execute([$escuela_id, $familia_id, $tipo, $nombre, $grado, $matricula, $curp, $email, $tel]);
        $id = intval($pdo->lastInsertId());

        respond(['success' => true, 'cliente' => array_merge($input, ['id' => $id, 'activo' => true, 'saldo_pendiente' => 0])]);
    break;

    // ══════════════════════════════════════════════════════════════════════════
    case 'editar_cliente':
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);

        $campos = ['nombre','grado','matricula','curp','email','telefono','familia_id'];
        $sets = []; $vals = [];
        foreach ($campos as $c) {
            if (array_key_exists($c, $input)) {
                $sets[] = "`$c` = ?";
                $vals[] = $input[$c] ?: null;
            }
        }
        if (empty($sets)) respond(['success' => false, 'error' => 'Sin campos a actualizar']);

        $vals[] = $id;
        $stmt = $pdo->prepare("UPDATE clientes SET " . implode(', ', $sets) . " WHERE id = ?");
        $stmt->execute($vals);

        respond(['success' => true, 'cliente' => $input]);
    break;

    // ══════════════════════════════════════════════════════════════════════════
    case 'toggle_cliente_activo':
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
        $rol_actual   = $usuario_actual['rol'] ?? '';
        $esc_actual   = null;
        $su = $pdo->prepare("SELECT escuela_id FROM usuarios WHERE id = ?");
        $su->execute([$usuario_actual['user_id'] ?? 0]);
        $urow = $su->fetch();
        if ($urow) $esc_actual = $urow['escuela_id'];

        if ($rol_actual === 'superadmin') {
            $stmt = $pdo->query(
                "SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.escuela_id, u.fecha_alta,
                        e.nombre AS escuela_nombre
                 FROM usuarios u LEFT JOIN escuelas e ON e.id = u.escuela_id
                 ORDER BY u.rol, u.nombre"
            );
        } else {
            $stmt = $pdo->prepare(
                "SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.escuela_id, u.fecha_alta,
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
        $nombre    = trim($input['nombre']     ?? '');
        $email     = trim($input['email']      ?? '');
        $password  = trim($input['password']   ?? '');
        $rol       = trim($input['rol']        ?? '');
        $esc_id    = intval($input['escuela_id'] ?? 0) ?: null;
        $fam_id    = intval($input['familia_id'] ?? 0) ?: null;
        $rol_actual = $usuario_actual['rol'] ?? '';

        $roles_validos = ['admin','cajero','familia'];
        if ($rol_actual === 'superadmin') $roles_validos[] = 'superadmin';
        if (!$nombre || !$email || !$password || !in_array($rol, $roles_validos)) {
            respond(['success' => false, 'error' => 'Datos incompletos o rol no permitido']);
        }
        // Verificar email único
        $chk = $pdo->prepare("SELECT id FROM usuarios WHERE email = ?");
        $chk->execute([$email]);
        if ($chk->fetch()) respond(['success' => false, 'error' => 'El correo ya está registrado']);

        $stmt = $pdo->prepare(
            "INSERT INTO usuarios (escuela_id, nombre, email, password_hash, rol, activo, fecha_alta)
             VALUES (?, ?, ?, ?, ?, 1, CURDATE())"
        );
        $stmt->execute([$esc_id, $nombre, $email, $password, $rol]);
        $id = intval($pdo->lastInsertId());
        respond(['success' => true, 'usuario' => ['id' => $id, 'nombre' => $nombre, 'email' => $email, 'rol' => $rol, 'escuela_id' => $esc_id, 'activo' => true]]);
    break;

    // ══════════════════════════════════════════════════════════════════════════
    case 'editar_usuario':
        $id       = intval($input['id']    ?? 0);
        $nombre   = trim($input['nombre']  ?? '');
        $email    = trim($input['email']   ?? '');
        $password = trim($input['password'] ?? '');
        $rol      = trim($input['rol']     ?? '');
        $esc_id   = intval($input['escuela_id'] ?? 0) ?: null;
        $fam_id   = intval($input['familia_id'] ?? 0) ?: null;

        if (!$id) respond(['success' => false, 'error' => 'id requerido']);

        $sets = []; $vals = [];
        if ($nombre)   { $sets[] = 'nombre = ?';         $vals[] = $nombre; }
        if ($email)    { $sets[] = 'email = ?';          $vals[] = $email; }
        if ($password) { $sets[] = 'password_hash = ?';  $vals[] = $password; }
        if ($rol)      { $sets[] = 'rol = ?';            $vals[] = $rol; }
        if ($esc_id !== null) { $sets[] = 'escuela_id = ?'; $vals[] = $esc_id; }
        if ($fam_id !== null) { $sets[] = 'familia_id = ?'; $vals[] = $fam_id; }

        if ($sets) {
            $vals[] = $id;
            $pdo->prepare("UPDATE usuarios SET " . implode(', ', $sets) . " WHERE id = ?")->execute($vals);
        }
        respond(['success' => true, 'usuario' => $input]);
    break;

    // ══════════════════════════════════════════════════════════════════════════
    case 'toggle_usuario':
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        $stmt = $pdo->prepare("UPDATE usuarios SET activo = NOT activo WHERE id = ?");
        $stmt->execute([$id]);
        respond(['success' => true]);
    break;

    // ══════════════════════════════════════════════════════════════════════════
    case 'eliminar_usuario':
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        $pdo->prepare("DELETE FROM usuarios WHERE id = ?")->execute([$id]);
        respond(['success' => true]);
    break;


    default:
        respond(['success' => false, 'error' => "Acción no reconocida: {$action}"]);
}
?>