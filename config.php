<?php
/**
 * EduPago — Configuración Central
 * Edita este archivo al subir a Hostinger.
 */

// ─── Credenciales Pagadetodo ──────────────────────────────────────────────────
// Estas son las credenciales del repo lb (sandbox/producción según tu cuenta)
define('PDT_USER',         'p9E5Vdu5Ya');
define('PDT_PASS',         'Ak63MKo#1/');
define('PDT_INT_ID',       '124');
define('PDT_BUS_ID_SPEI',  '000060');   // Para generar CLABE (transferencias SPEI)
define('PDT_BUS_ID_TC',    '000060');   // Para ligas de pago con tarjeta (mismo BusinessID)

// ─── URLs de Pagadetodo ───────────────────────────────────────────────────────
define('PDT_URL_CLABE',    'https://pagadetodo.mx/Pagadetodo/Service/GenerarClabeIndi');
define('PDT_URL_CONSULTA', 'https://pagadetodo.mx/Pagadetodo/Service/ConsultarClabe');
define('PDT_URL_LIGA',     'https://pagadetodo.mx/Pagadetodo/Service/GenerarLigaIndi');

// ─── Configuración de la escuela ─────────────────────────────────────────────
define('ESCUELA_NOMBRE',   'EduPago Escolar');
define('ESCUELA_RFC',      'ESC123456ABC');  // RFC de la escuela (para facturas)

// ─── Logging ──────────────────────────────────────────────────────────────────
// Cambia a false en producción si no quieres guardar logs
define('API_LOG_ENABLED', true);
define('API_LOG_FILE',    __DIR__ . '/api_log.txt');

// ─── Zona horaria ────────────────────────────────────────────────────────────
date_default_timezone_set('America/Mexico_City');
