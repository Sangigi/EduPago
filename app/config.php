<?php
/**
 * EduPago — Configuración Central
 * Edita este archivo al subir a Hostinger.
 */

// ─── Credenciales Pagadetodo ──────────────────────────────────────────────────
define('PDT_USER',         'xxx');
define('PDT_PASS',         'xxx');
define('PDT_INT_ID',       'xxx');
define('PDT_BUS_ID_SPEI',  'xxx');
define('PDT_BUS_ID_TC',    'xxx');

define('DB_HOST', 'test.grupoideasmx.com');
define('DB_NAME', 'grupoide_pagalaescuela');
define('DB_USER', 'grupoide_leonel');
define('DB_PASS', 'xxx');

// ─── URLs de Pagadetodo ───────────────────────────────────────────────────────
define('PDT_URL_CLABE',    'https://pagadetodo.mx/Pagadetodo/Service/GenerarClabeIndi');
define('PDT_URL_LIGA',     'https://pagadetodo.mx/Pagadetodo/Service/GenerarLigaIndi');

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
define('SPEI_CLABES_FILE', __DIR__ . '/clabes_alumnos.json'); // bitácora local de respaldo

// ─── URL de tu webhook (darla a Pagadetodo para notificaciones SPEI) ─────────
// IMPORTANTE: genera un token aleatorio propio (ej. bin2hex(random_bytes(24)))
// y dale a Pagadetodo la URL con ?token=ESE_TOKEN. Sin esto, cualquiera podía
// forjar un pago SPEI llamando directo a este endpoint.
define('WEBHOOK_SPEI_TOKEN', 'xxx');
define('WEBHOOK_URL', 'https://test.grupoideasmx.com/webhook_spei.php?token=xxx');

// ─── Configuración del super-admin ───────────────────────────────────────────
define('ADMIN_EMAIL',    'admin@pagalaescuela.mx');
define('ADMIN_PASS',     'SuperAdmin2026!');  // Cambiar en producción

// ─── Logging ──────────────────────────────────────────────────────────────────
define('API_LOG_ENABLED', true);
define('API_LOG_FILE',    __DIR__ . '/api_log.txt');

// ─── Clave secreta para firmar tokens de sesión (HMAC) ───────────────────────
// IMPORTANTE: en producción, cambia este valor por una cadena aleatoria larga
// y única, y no la subas a un repositorio público.
define('APP_TOKEN_SECRET', 'xxx');
define('APP_TOKEN_TTL',    60 * 60 * 12); // 12 horas de vigencia

// ─── Zona horaria ────────────────────────────────────────────────────────────
date_default_timezone_set('America/Mexico_City');

// ─── Credenciales del PAC (Ej. Facturama) ────────────────────────────────────
// Usa las credenciales de Sandbox para desarrollo y las reales para producción.
define('PAC_API_URL', 'https://apisandbox.facturama.mx/2/cfdis'); // URL de pruebas
define('PAC_USER',    'xxx');
define('PAC_PASS',    'xxx');

// ─── Credenciales de Facturapi ───────────────────────────────────────────────
define('FACTURAPI_KEY', 'xxx');
