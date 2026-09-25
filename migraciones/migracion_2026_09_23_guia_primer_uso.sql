-- ════════════════════════════════════════════════════════════════════════
-- migracion_2026_09_23_guia_primer_uso.sql
--
-- GUÍA DE PRIMER USO
--
-- Hasta hoy el sistema no tenía forma de saber si alguien entra por primera
-- vez. El único precedente de "primera vez" en el proyecto es
-- assets/js/intro-splash.js, que lo guarda en localStorage con la llave
-- 'edupago_intro_seen' — y eso sirve para una animación de marca, pero no
-- para esto:
--
--   · localStorage es POR NAVEGADOR, no por usuario. Dos personas del mismo
--     colegio en la misma computadora comparten el estado: la segunda nunca
--     vería la guía.
--   · Y la misma persona entrando desde su celular la volvería a ver.
--
-- Por eso la marca vive en `usuarios`, no en el navegador.
--
-- Corre este archivo UNA SOLA VEZ. Si truena con #1060 "Duplicate column
-- name", ya se había corrido.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE usuarios
  -- NULL = nunca la ha terminado ni saltado, o sea: mostrársela.
  -- Una fecha = ya pasó por ella, no volver a interrumpirlo.
  --
  -- Es DATETIME y no un booleano a propósito: saber CUÁNDO la vio permite
  -- responder "¿este colegio se atoró el primer día?" sin agregar otra
  -- columna después. Un TINYINT solo diría que sí o que no.
  ADD COLUMN guia_vista_en DATETIME NULL DEFAULT NULL
    COMMENT 'Cuándo terminó o saltó la guía de primer uso. NULL = todavía no.';

-- Las cuentas que YA existen no deberían recibir una guía de bienvenida: ya
-- llevan tiempo usando el sistema y sería ruido. Se marcan como vistas.
--
-- Esto hace que la migración NO sea idempotente: si se vuelve a correr
-- después de que alguien nuevo se registró, le borraría la guía sin que la
-- haya visto. Por eso el paso 1 falla con #1060 al repetirse — es la señal de
-- que no hay que ejecutar este paso 2 tampoco.
UPDATE usuarios SET guia_vista_en = NOW() WHERE guia_vista_en IS NULL;


-- ── COMPROBACIÓN ────────────────────────────────────────────────────────
SHOW COLUMNS FROM usuarios LIKE 'guia_vista_en';
-- Debe dar 0 pendientes: todas las cuentas actuales quedaron marcadas.
SELECT COUNT(*) AS cuentas_sin_guia FROM usuarios WHERE guia_vista_en IS NULL;
