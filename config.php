<?php
/**
 * EduPago — Configuración Central
 * Edita este archivo al subir a Hostinger.
 */

// ─── Credenciales Pagadetodo ──────────────────────────────────────────────────
// PENDIENTE (2026-09-08): reemplaza estos dos valores con el User/Password
// PRODUCTIVOS reales que mandó Cobroscontarjeta.com (son compartidos para
// Pagadetodo Y Pagalaescuela — ver PLE_USER/PLE_PASS más abajo, que usan
// estos mismos valores). Los de aquí abajo son placeholders, NO funcionan.
define('PDT_USER',         'PENDIENTE_USER_PRODUCCION');
define('PDT_PASS',         'PENDIENTE_PASSWORD_PRODUCCION');
define('PDT_INT_ID',       '125');
define('PDT_BUS_ID_SPEI',  '000067');
define('PDT_BUS_ID_TC',    '000067');

define('DB_HOST', 'test.grupoideasmx.com');
define('DB_NAME', 'grupoide_pagalaescuela');
define('DB_USER', 'grupoide_leonel');
define('DB_PASS', 'M4imvdG#O&NQ');

// ─── URLs de Pagadetodo (SPEI + Efectivo/Referencias) ─────────────────────────
define('PDT_URL_CLABE',      'https://pagadetodo.mx/Pagadetodo/Service/GenerarClabeIndi');
define('PDT_URL_REFERENCIA', 'https://pagadetodo.mx/Pagadetodo/Service/GenerarReferenciaIndi');

// ─── Credenciales/URLs Pagalaescuela (Pagos en línea + CAI) ──────────────────
// IMPORTANTE: mismo User/Password que Pagadetodo (el correo dice que las
// credenciales son las mismas para ambas plataformas), pero IntegrationID y
// SchoolID son los que Cobroscontarjeta.com asignó específicamente para
// Pagalaescuela — normalmente NO son el mismo valor que PDT_INT_ID/BUS_ID.
define('PLE_USER',     PDT_USER);
define('PLE_PASS',     PDT_PASS);
define('PLE_INT_ID',   '106');
define('PLE_SCHOOL_ID','000041');

// ── PRODUCCIÓN (activada 2026-09-08): Cobroscontarjeta.com certificó las
// URLs productivas y entregó credenciales reales para ambas plataformas.
// Pagalaescuela ya tiene su propia cuenta de producción (IntegrationID 106,
// BusinessID 000041) — ya NO corre sobre el Sandbox de Pagadetodo como
// workaround temporal (ver historial: aviso de Cobroscontarjeta.com
// 18-ago-2026 sobre el Sandbox de Pagalaescuela mal configurado).
define('PLE_HOST_BASE', 'https://pagalaescuela.mx/Pagalaescuela');

// PLE_INT_ID_ACTIVO/PLE_SCHOOL_ID_ACTIVO eligen automáticamente entre las
// credenciales de Pagadetodo o Pagalaescuela según el host activo — se
// conservan por si algún día hay que volver a usar el workaround de
// Pagadetodo como fallback (ver PLE_URL_LIGA_SIMPLE más abajo).
define('PLE_INT_ID_ACTIVO',    strpos(PLE_HOST_BASE, 'pagadetodo.mx') !== false ? PDT_INT_ID      : PLE_INT_ID);
define('PLE_SCHOOL_ID_ACTIVO', strpos(PLE_HOST_BASE, 'pagadetodo.mx') !== false ? PDT_BUS_ID_TC    : PLE_SCHOOL_ID);

// Liga con token: sirve para pago simple en línea Y deja el número de
// tarjeta tokenizado, habilitando después los Cargos Automáticos (CAI) sin
// pedirle tarjeta de nuevo al padre de familia.
define('PLE_URL_LIGA_TOKEN',        PLE_HOST_BASE . '/Service/GenerarLigaDomiciliacionIndi');
// Fallback SIN tokenización/CAI (IntegracionesLigas_V1_2). Si el servicio de
// Domiciliación no está bien aprovisionado en Cobroscontarjeta.com para esta
// cuenta (error 500 recurrente), este endpoint simple permite que el cobro
// con tarjeta funcione igual, solo que sin dejar la tarjeta tokenizada.
define('PLE_URL_LIGA_SIMPLE',       PLE_HOST_BASE . '/Service/GenerarLigaIndi');
define('PLE_URL_DOMICILIACION_PAGAR',    PLE_HOST_BASE . '/Service/PagarDomiciliacionIndi');
define('PLE_URL_DOMICILIACION_CANCELAR', PLE_HOST_BASE . '/Service/CancelarDomiciliacionIndi');

// ─── DocuSign (firma electrónica de la autorización de Cargos Automáticos) ──
// Cobroscontarjeta.com/el banco emisor rechaza domiciliaciones autorizadas
// solo con un checkbox de "acepto términos y condiciones" — piden una
// autorización firmada de verdad. Ver lib/docusign_helper.php.
//
// Pasos para llenar esto (cuenta de desarrollador, gratis, en
// developers.docusign.com):
//   1. Crea una Integration Key (app de OAuth) en el Admin de esa cuenta.
//   2. Genera un par de llaves RSA (o sube tu propia llave pública) para esa
//      Integration Key — pega la llave PRIVADA completa abajo.
//   3. Copia tu User ID y tu Account ID (ambos son GUID, están en el Admin).
//   4. Da tu consentimiento UNA VEZ visitando (mientras estás logueado):
//      https://account-d.docusign.com/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=TU_INTEGRATION_KEY&redirect_uri=https://www.docusign.com
//      (usa account.docusign.com en vez de account-d.docusign.com si es
//      cuenta de producción, no de desarrollo/sandbox).
// Mientras estas 4 constantes no tengan un valor real, docusign_configurado()
// regresa false y las acciones que dependen de esto responden con un error
// claro en vez de tronar.
define('DOCUSIGN_INTEGRATION_KEY', ''); // <-- GUID de tu Integration Key
define('DOCUSIGN_USER_ID',         ''); // <-- GUID de tu usuario DocuSign
define('DOCUSIGN_ACCOUNT_ID',      ''); // <-- GUID de tu cuenta DocuSign
define('DOCUSIGN_PRIVATE_KEY', ''); // <-- Llave privada RSA completa, formato PEM (-----BEGIN RSA PRIVATE KEY-----...-----END RSA PRIVATE KEY-----)
// account-d.docusign.com = sandbox/desarrollo. Cambiar a account.docusign.com
// solo cuando se pase a una cuenta de producción real de DocuSign.
define('DOCUSIGN_AUTH_HOST', 'account-d.docusign.com');
// Opcional pero recomendado: en DocuSign Admin → Connect, al crear la
// configuración de este webhook, activa "HMAC Signature" y pon aquí ese
// mismo secreto compartido — sin esto, cualquiera que adivine la URL del
// webhook podría fingir que una firma ya se completó.
define('DOCUSIGN_CONNECT_HMAC_KEY', '');

// ─── CLABE FIJA (legado / fallback) ──────────────────────────────────────────
// Se mantiene como respaldo, pero el sistema ahora genera una CLABE INDIVIDUAL
// por cada alumno/familia vía PDT_URL_CLABE (GenerarClabeIndi).
define('SPEI_CLABE_FIJA',  '646180633010000055'); // <-- Reemplazar con la CLABE real de STP
define('SPEI_BANCO',       'STP — Sistema de Transferencias y Pagos');
define('SPEI_BENEFICIARIO','Paga la Escuela S.A. de C.V.');

// ─── CLABEs individuales (alta automática por alumno/familia) ────────────────
// Cada CLABE generada se asigna y permanece ligada al alumno hasta que
// se da de baja (deja la escuela), momento en que se libera/cancela.
define('SPEI_CLABE_EXPIRACION_DIAS', 365); // vigencia que se solicita a Pagadetodo

// ─── URL de tu webhook (darla a Pagadetodo para notificaciones SPEI) ─────────
// IMPORTANTE: genera un token aleatorio propio (ej. bin2hex(random_bytes(24)))
// y dale a Pagadetodo la URL con ?token=ESE_TOKEN. Sin esto, cualquiera podía
// forjar un pago SPEI llamando directo a este endpoint.
// ROTADO 2026-08-14: el valor anterior quedó expuesto públicamente en GitHub.
// Después de desplegar esto, hay que darle este mismo valor a Pagadetodo en su
// configuración de webhook (?token=...), si no, sus notificaciones dejarán de pasar.
define('WEBHOOK_SPEI_TOKEN', 'd415bc71bb74b30892b017848882bfa6897c8c2a0c8ca6519a432798955c0956');

// ─── BusinessID para Referencias en efectivo (OXXO/terceros) — Pagadetodo ───
// El correo no especifica un BusinessID distinto para efectivo; se usa el
// mismo que SPEI salvo que Cobroscontarjeta.com indique uno específico.
define('PDT_BUS_ID_EFECTIVO', PDT_BUS_ID_SPEI);

// Token compartido para los 3 endpoints EMISOR de Referencias
// (ConsultaReferencia / PagoReferencia / CancelaPago). Cobroscontarjeta.com
// no manda un token propio en este protocolo (a diferencia de SPEI, aquí
// nosotros SOMOS el emisor expuesto), así que este token es solo para que
// tú puedas probar manualmente sin exponer los endpoints a cualquiera;
// dale la URL sin token a Cobroscontarjeta.com tal como pide su doc
// (ellos llaman /Service/ConsultaReferencia/?r=REFERENCIA tal cual).
define('REFERENCIA_LOG_FILE', __DIR__ . '/referencias_log.txt');

// ─── IPs permitidas para los webhooks sin token (efectivo/tarjeta) ───────────
// pago_referencia.php, cancela_pago_referencia.php y webhook_liga.php NO
// pueden exigir un token compartido (el protocolo fijo de Cobroscontarjeta.com
// para estos servicios no lo soporta — ver comentario arriba). La única
// defensa real posible es restringir por IP de origen: pídele a
// Cobroscontarjeta.com/Pagadetodo la(s) IP(s) desde donde llaman estos 3
// endpoints y agrégalas aquí. Vacío = sin restricción (como está hoy, no
// se rompe nada mientras no la llenes).
define('IPS_PERMITIDAS_PAGOS_SIN_TOKEN', []); // ej. ['200.23.45.10', '200.23.45.11']

// Verifica la IP de origen contra IPS_PERMITIDAS_PAGOS_SIN_TOKEN. Devuelve
// true si la lista está vacía (sin restricción) o si la IP coincide.
function ip_permitida_pago_sin_token() {
    $lista = defined('IPS_PERMITIDAS_PAGOS_SIN_TOKEN') ? IPS_PERMITIDAS_PAGOS_SIN_TOKEN : [];
    if (empty($lista)) return true;
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    return in_array($ip, $lista, true);
}

// ─── Logging ──────────────────────────────────────────────────────────────────
define('API_LOG_ENABLED', true);
define('API_LOG_FILE',    __DIR__ . '/api_log.txt');

// ─── Clave secreta para firmar tokens de sesión (HMAC) ───────────────────────
// IMPORTANTE: en producción, cambia este valor por una cadena aleatoria larga
// y única, y no la subas a un repositorio público.
// ROTADO 2026-08-14: el valor anterior quedó expuesto públicamente en GitHub,
// lo que permitía forjar tokens de sesión válidos para cualquier usuario (incluido
// superadmin) sin necesidad de credenciales. Al desplegar esto, todas las sesiones
// activas (tokens ya emitidos) quedan invalidadas automáticamente.
define('APP_TOKEN_SECRET', 'be63ceed510fbe872bff19a84f8fca545bfddc244fde80ede1fc3338911d208d');
define('APP_TOKEN_TTL',    60 * 60 * 12); // 12 horas de vigencia

// ─── Zona horaria ────────────────────────────────────────────────────────────
date_default_timezone_set('America/Mexico_City');

// ─── Credenciales de Facturapi ───────────────────────────────────────────────
define('FACTURAPI_KEY', 'sk_test_oC5ZzoaR5Hvmig4maAfxbcevwPoMPNDbZHQg8s3zEr');

// ─── Correo saliente (SMTP) — recordatorios de vencimiento y cobros ──────────
// Usado por mailer.php / cron_recordatorios.php. Cuenta real de correo del
// panel de Hostinger (mail.pagalaescuela.com), puerto 465 con SSL/TLS implícito.
define('SMTP_HOST',       'mail.seguroslux.mx');
define('SMTP_PORT',       465);
define('SMTP_SECURE',     'ssl');
define('SMTP_USER',       'contacto@seguroslux.mx');
define('SMTP_PASS',       'S3gur0$2026');     // <-- Reemplazar con la contraseña real de contacto@pagalaescuela.com
define('SMTP_FROM_EMAIL', 'contacto@seguroslux.mx');  // debe ser igual a SMTP_USER: muchos servidores rechazan un From distinto al autenticado
define('SMTP_FROM_NAME',  'Pagalaescuela');
define('CORREOS_LOG_FILE', __DIR__ . '/correos_log.txt');
