<?php
// lib/docusign_helper.php
//
// Integración con DocuSign (firma electrónica) para la carta de autorización
// de Cargos Automáticos (CAI) — Cobroscontarjeta.com/el banco emisor exige
// una autorización firmada de verdad, no solo un checkbox de "acepto
// términos y condiciones" (ver migracion_2026_08_28_autorizacion_firmada_cai
// y el candado en cobrar_via_token()).
//
// IMPORTANTE — esto NO se ha podido probar en vivo todavía: está escrito
// correctamente contra la documentación pública de la API REST v2.1 de
// DocuSign (autenticación JWT Grant + creación de sobres), pero hace falta
// una cuenta de desarrollador real (Integration Key, User ID, Account ID,
// llave privada RSA, y dar consentimiento una sola vez) antes de que esto
// pueda funcionar — ver el checklist que se le dio al usuario. En cuanto
// haya credenciales reales en config.php, probar de punta a punta antes de
// confiar en esto para autorizaciones reales.
//
// Todo aquí usa autenticación JWT Grant (servidor a servidor, sin que nadie
// tenga que iniciar sesión en DocuSign cada vez) — es el flujo recomendado
// por DocuSign para este tipo de integración desatendida.

require_once __DIR__ . '/curl_helper.php';

function docusign_configurado(): bool
{
    return defined('DOCUSIGN_INTEGRATION_KEY') && DOCUSIGN_INTEGRATION_KEY
        && defined('DOCUSIGN_USER_ID') && DOCUSIGN_USER_ID
        && defined('DOCUSIGN_PRIVATE_KEY') && DOCUSIGN_PRIVATE_KEY;
}

// Codificación base64url (sin relleno) — la que usa JWT, distinta del
// base64 normal de PHP (que usa +/ y sí rellena con =).
function _docusign_b64url(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

// Arma y firma el JWT que se intercambia por un access_token. Vigencia de
// 1 hora (el máximo que acepta DocuSign) — se genera uno nuevo cada vez que
// se necesita, no se guarda/reusa entre peticiones (este proyecto no tiene
// ninguna caché persistente tipo Redis/APCu; para el volumen de firmas de
// autorización que se esperan, pedir un token nuevo en cada uso es más
// simple que manejar su expiración a mano, y el costo es mínimo).
function _docusign_jwt(): string
{
    $iat = time();
    $header  = ['alg' => 'RS256', 'typ' => 'JWT'];
    $payload = [
        'iss'   => DOCUSIGN_INTEGRATION_KEY,
        'sub'   => DOCUSIGN_USER_ID,
        'aud'   => defined('DOCUSIGN_AUTH_HOST') ? DOCUSIGN_AUTH_HOST : 'account-d.docusign.com',
        'iat'   => $iat,
        'exp'   => $iat + 3600,
        'scope' => 'signature impersonation',
    ];
    $firmable = _docusign_b64url(json_encode($header)) . '.' . _docusign_b64url(json_encode($payload));
    $llave = openssl_pkey_get_private(DOCUSIGN_PRIVATE_KEY);
    if ($llave === false) {
        throw new \RuntimeException('DOCUSIGN_PRIVATE_KEY no es una llave RSA válida: ' . openssl_error_string());
    }
    $firma = '';
    openssl_sign($firmable, $firma, $llave, OPENSSL_ALGO_SHA256);
    return $firmable . '.' . _docusign_b64url($firma);
}

// Intercambia el JWT por un access_token, y de paso resuelve el base_uri
// real de la cuenta (DocuSign reparte cuentas entre varios centros de datos
// regionales — no siempre es el mismo host que el de autenticación; pedirlo
// vía /oauth/userinfo es la forma correcta documentada por DocuSign de
// resolverlo, en vez de asumir uno fijo).
function docusign_access_token(): array
{
    if (!docusign_configurado()) {
        return ['success' => false, 'error' => 'DocuSign no está configurado todavía (faltan credenciales en config.php).'];
    }
    $authHost = defined('DOCUSIGN_AUTH_HOST') ? DOCUSIGN_AUTH_HOST : 'account-d.docusign.com';
    try {
        $jwt = _docusign_jwt();
    } catch (\Throwable $e) {
        return ['success' => false, 'error' => 'Error armando el JWT de DocuSign: ' . $e->getMessage()];
    }

    // El endpoint de token de OAuth exige application/x-www-form-urlencoded,
    // no JSON — por eso no se reutiliza curl_post() (que siempre manda JSON).
    $ch = curl_init("https://{$authHost}/oauth/token");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
        CURLOPT_POSTFIELDS     => http_build_query([
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion'  => $jwt,
        ]),
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $body = curl_exec($ch);
    $err  = curl_error($ch);
    curl_close($ch);
    if ($err) return ['success' => false, 'error' => 'Error de red con DocuSign: ' . $err];

    $data = json_decode($body, true);
    if (!is_array($data) || empty($data['access_token'])) {
        // consent_required: hace falta visitar la URL de consentimiento una
        // vez (ver checklist) — DocuSign lo regresa así de claro en el error.
        return ['success' => false, 'error' => 'DocuSign no regresó un access_token: ' . ($data['error'] ?? $body)];
    }
    $accessToken = $data['access_token'];

    // Resolver accountId + base_uri reales para esta cuenta.
    $ch2 = curl_init("https://{$authHost}/oauth/userinfo");
    curl_setopt_array($ch2, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $accessToken],
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $bodyInfo = curl_exec($ch2);
    $errInfo  = curl_error($ch2);
    curl_close($ch2);
    if ($errInfo) return ['success' => false, 'error' => 'Error de red consultando userinfo de DocuSign: ' . $errInfo];

    $info = json_decode($bodyInfo, true);
    $accountIdBuscado = defined('DOCUSIGN_ACCOUNT_ID') ? DOCUSIGN_ACCOUNT_ID : null;
    $cuenta = null;
    foreach (($info['accounts'] ?? []) as $acc) {
        if (!$accountIdBuscado || $acc['account_id'] === $accountIdBuscado) { $cuenta = $acc; break; }
    }
    if (!$cuenta) {
        return ['success' => false, 'error' => 'No se encontró la cuenta de DocuSign en la respuesta de userinfo.'];
    }

    return [
        'success'      => true,
        'access_token' => $accessToken,
        'account_id'   => $cuenta['account_id'],
        'base_uri'     => rtrim($cuenta['base_uri'], '/'), // ej. https://demo.docusign.net
    ];
}

// Envía la carta de autorización de Cargos Automáticos a firmar. El
// documento se manda como HTML — DocuSign lo convierte a PDF internamente
// (soporta HTML como formato de entrada para envelopes:create).
//
// IMPORTANTE — el texto de la carta (ver docusign_carta_autorizacion_html())
// es una redacción razonable, NO una revisión legal: antes de usar esto para
// autorizaciones reales, que alguien con criterio legal en México revise
// que el texto cumple lo que pide el banco/Cobroscontarjeta.com.
function docusign_enviar_autorizacion_cai(PDO $pdo, int $clienteId, string $nombreEscuela): array
{
    $tok = docusign_access_token();
    if (!$tok['success']) return $tok;

    $stmt = $pdo->prepare(
        "SELECT cl.nombre AS cliente_nombre, cl.email AS cliente_email, fa.email AS familia_email, fa.contacto AS familia_contacto,
                cl.token_tarjeta_mask, cl.token_tarjeta_tipo
           FROM clientes cl LEFT JOIN familias fa ON fa.id = cl.familia_id
          WHERE cl.id = ?"
    );
    $stmt->execute([$clienteId]);
    $cli = $stmt->fetch();
    if (!$cli) return ['success' => false, 'error' => 'Alumno no encontrado'];

    $emailFirmante  = $cli['cliente_email'] ?: $cli['familia_email'];
    $nombreFirmante = $cli['familia_contacto'] ?: $cli['cliente_nombre'];
    if (!$emailFirmante) return ['success' => false, 'error' => 'El alumno/familia no tiene un correo capturado para mandarle la firma.'];

    $html = docusign_carta_autorizacion_html($nombreFirmante, $cli['cliente_nombre'], $nombreEscuela, $cli['token_tarjeta_mask'], $cli['token_tarjeta_tipo']);

    $payload = [
        'emailSubject' => 'Firma tu autorización de cargos automáticos — ' . $nombreEscuela,
        'documents'    => [[
            'documentBase64' => base64_encode($html),
            'name'           => 'Autorizacion_Cargos_Automaticos',
            'fileExtension'  => 'html',
            'documentId'     => '1',
        ]],
        'recipients' => ['signers' => [[
            'email'        => $emailFirmante,
            'name'         => $nombreFirmante,
            'recipientId'  => '1',
            'routingOrder' => '1',
            'tabs' => ['signHereTabs' => [[
                'documentId' => '1',
                'pageNumber' => '1',
                'anchorString'    => '/firma/',
                'anchorUnits'     => 'pixels',
                'anchorYOffset'   => '-10',
                'anchorXOffset'   => '0',
            ]]],
        ]]],
        'status' => 'sent',
    ];

    $res = curl_post(
        $tok['base_uri'] . '/restapi/v2.1/accounts/' . $tok['account_id'] . '/envelopes',
        $payload,
        ['Authorization: Bearer ' . $tok['access_token']]
    );
    if ($res['error']) return ['success' => false, 'error' => 'Error de red creando el sobre en DocuSign: ' . $res['error']];
    $data = json_decode($res['body'], true);
    if (empty($data['envelopeId'])) {
        log_api('docusign_enviar_autorizacion_cai FALLÓ -> ' . $res['body']);
        return ['success' => false, 'error' => $data['message'] ?? ('DocuSign no regresó envelopeId: ' . $res['body'])];
    }

    $pdo->prepare(
        "UPDATE clientes SET autorizacion_cai_estado = 'enviada', autorizacion_cai_envelope_id = ?, autorizacion_cai_fecha_envio = NOW() WHERE id = ?"
    )->execute([$data['envelopeId'], $clienteId]);

    log_api("docusign_enviar_autorizacion_cai OK -> cliente={$clienteId} envelope={$data['envelopeId']}");
    return ['success' => true, 'envelope_id' => $data['envelopeId']];
}

// Texto de la carta — usa el ancla "/firma/" (texto invisible en blanco) para
// que DocuSign posicione el recuadro de firma ahí sin tener que calcular
// coordenadas absolutas de página (frágil si el HTML se re-formatea distinto
// entre firmas). Ver el aviso legal arriba: revisar con criterio legal antes
// de usarse para autorizaciones reales.
function docusign_carta_autorizacion_html(string $nombreFirmante, string $nombreAlumno, string $nombreEscuela, ?string $ccMask, ?string $ccTipo): string
{
    $esc = fn($t) => htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8');
    $tarjetaTxt = $ccMask ? "terminada en <strong>{$esc($ccMask)}</strong>" . ($ccTipo ? " ({$esc($ccTipo)})" : '') : 'que se registre al momento de firmar este documento';
    $hoy = date('d/m/Y');
    return "<!DOCTYPE html><html><head><meta charset=\"utf-8\"></head><body style=\"font-family:Arial,sans-serif;font-size:13px;color:#1e2430;line-height:1.6;padding:30px;\">
<h2>Autorización de Cargos Automáticos (Domiciliación)</h2>
<p>Fecha: {$esc($hoy)}</p>
<p>Yo, <strong>{$esc($nombreFirmante)}</strong>, autorizo a <strong>{$esc($nombreEscuela)}</strong>, a través de su proveedor de servicios de cobro Cobroscontarjeta.com, a realizar cargos automáticos recurrentes a la tarjeta bancaria {$tarjetaTxt}, correspondientes a los adeudos de colegiatura y demás cuotas escolares del alumno <strong>{$esc($nombreAlumno)}</strong>.</p>
<p>Entiendo que:</p>
<ul>
<li>Los cargos se aplicarán únicamente por conceptos y montos correspondientes a adeudos reales generados por {$esc($nombreEscuela)}.</li>
<li>Puedo revocar esta autorización en cualquier momento, notificando directamente a {$esc($nombreEscuela)}.</li>
<li>{$esc($nombreEscuela)} no tiene acceso al número completo de mi tarjeta ni a su código de seguridad — el cobro se procesa a través de Cobroscontarjeta.com mediante un token seguro.</li>
</ul>
<p>Firma de conformidad:</p>
<p style=\"color:#ffffff;\">/firma/</p>
</body></html>";
}
