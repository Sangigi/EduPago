<?php
/**
 * EduPago — Configuración Central
 * Edita este archivo al subir a Hostinger.
 */

// ─── Credenciales Pagadetodo ──────────────────────────────────────────────────
define('PDT_USER',         'p9E5Vdu5Ya');
define('PDT_PASS',         'Ak63MKo#1/');
define('PDT_INT_ID',       '124');
define('PDT_BUS_ID_SPEI',  '000060');
define('PDT_BUS_ID_TC',    '000060');

// ─── URLs de Pagadetodo ───────────────────────────────────────────────────────
define('PDT_URL_CLABE',    'https://pagadetodo.mx/Pagadetodo/Service/GenerarClabeIndi');
define('PDT_URL_LIGA',     'https://pagadetodo.mx/Pagadetodo/Service/GenerarLigaIndi');

// ─── CLABE FIJA (reemplaza la generación dinámica) ───────────────────────────
// Solicita esta CLABE a Pagadetodo/STP. Será la misma para todos los pagos SPEI.
// La referencia del concepto de transferencia identificará al alumno/familia.
define('SPEI_CLABE_FIJA',  '646180633010000055'); // <-- Reemplazar con la CLABE real de STP
define('SPEI_BANCO',       'STP — Sistema de Transferencias y Pagos');
define('SPEI_BENEFICIARIO','Paga la Escuela S.A. de C.V.');

// ─── URL de tu webhook (darla a Pagadetodo para notificaciones SPEI) ─────────
define('WEBHOOK_URL', 'https://test.grupoideasmx.com/webhook_spei.php');

// ─── Configuración del super-admin ───────────────────────────────────────────
define('ADMIN_EMAIL',    'admin@pagalaescuela.mx');
define('ADMIN_PASS',     'SuperAdmin2026!');  // Cambiar en producción

// ─── Logging ──────────────────────────────────────────────────────────────────
define('API_LOG_ENABLED', true);
define('API_LOG_FILE',    __DIR__ . '/api_log.txt');

// ─── Zona horaria ────────────────────────────────────────────────────────────
date_default_timezone_set('America/Mexico_City');

// ─── Credenciales del PAC (Ej. Facturama) ────────────────────────────────────
// Usa las credenciales de Sandbox para desarrollo y las reales para producción.
define('PAC_API_URL', 'https://apisandbox.facturama.mx/2/cfdis'); // URL de pruebas
define('PAC_USER',    'tu_usuario_pac');
define('PAC_PASS',    'tu_password_pac');