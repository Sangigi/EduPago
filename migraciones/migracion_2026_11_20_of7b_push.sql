-- migracion_2026_11_20_of7b_push.sql  (OF-7b, 20-nov-2026)
-- Avisos push en el navegador o el celular (Web Push), que llegan aunque la plataforma esté cerrada.
--
-- DOCUMENTACIÓN. Desde OF-4a esto lo aplica solo lib/migraciones.php (ids 2026_11_20_of7b_01 y _02):
--     php herramientas/migrar.php --aplicar        o   Diagnóstico → Base de datos → Aplicar pendientes
-- Pegarlo a mano en phpMyAdmin también sirve y es seguro repetirlo: todo es CREATE TABLE IF NOT EXISTS.
--
-- MySQL 5.7+. Sin FOREIGN KEY, InnoDB utf8mb4, como el resto del esquema. config.php no se toca.
-- Sin estas tablas nada de push aparece (la opción "Avisos en este dispositivo" no se ofrece) y nada
-- falla: todos los puntos que encolan un aviso van en try/catch.
--
-- Las llaves VAPID del servidor NO están en la base: se generan solas la primera vez en
-- uploads_privados/push_vapid.pem (fuera de git y fuera del alcance web). Ver docs/mejoras-of/of7b-push.md.

SET NAMES utf8mb4;

-- Tabla push_suscripciones (un dispositivo con avisos activos por fila).
-- endpoint_hash = SHA-256 de la dirección de suscripción: es la identidad del dispositivo, con la que
-- el service worker pregunta qué mostrar. fallos = envíos fallidos seguidos; con 5 la suscripción
-- queda desactivada hasta que el usuario vuelve a activar los avisos. p256dh y auth se guardan por si
-- algún día se cifra el contenido; hoy el toque va vacío y no se usan.
CREATE TABLE IF NOT EXISTS push_suscripciones (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id    INT UNSIGNED NOT NULL,
  escuela_id    INT UNSIGNED NULL DEFAULT NULL,
  endpoint      TEXT         NOT NULL,
  endpoint_hash CHAR(64)     NOT NULL,
  p256dh        VARCHAR(255) NULL DEFAULT NULL,
  auth          VARCHAR(255) NULL DEFAULT NULL,
  dispositivo   VARCHAR(80)  NULL DEFAULT NULL,
  creado_en     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_ok     DATETIME     NULL DEFAULT NULL,
  fallos        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_push_endpoint (endpoint_hash),
  KEY idx_push_usuario (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabla push_avisos (cola de avisos).
--   pendiente  : enviado_en IS NULL e intentos < 3
--   enviado    : enviado_en con fecha (se marca justo antes del toque; si el servicio de push lo
--                rechaza se libera para reintentar)
--   entregado  : entregado_en con fecha (el dispositivo despertó y pidió el texto)
-- El texto (titulo, cuerpo) es GENÉRICO: sin montos, nombres, folios ni contenido de tickets.
CREATE TABLE IF NOT EXISTS push_avisos (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  suscripcion_id INT UNSIGNED NOT NULL,
  tipo           VARCHAR(30)  NOT NULL,
  titulo         VARCHAR(120) NOT NULL,
  cuerpo         VARCHAR(255) NOT NULL,
  url            VARCHAR(255) NULL DEFAULT NULL,
  creado_en      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  enviado_en     DATETIME     NULL DEFAULT NULL,
  entregado_en   DATETIME     NULL DEFAULT NULL,
  intentos       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_pushav_pendientes (enviado_en, id),
  KEY idx_pushav_susc (suscripcion_id, entregado_en),
  KEY idx_pushav_creado (creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
