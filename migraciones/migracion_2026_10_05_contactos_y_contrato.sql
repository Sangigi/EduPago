-- migracion_2026_10_05_contactos_y_contrato.sql
--
-- 1) Tres personas de contacto por escuela (nombre + correo cada una):
--    quien recibe facturas, quien firma el contrato y quien atiende pagos.
--    Viven en escuela_datos_pago (no en `escuelas`, que cargar_datos.php manda
--    completa a todos los roles del colegio).
-- 2) Estatus del contrato por escuela, lo marca el superadmin a mano:
--    sin_enviar -> enviado -> firmado.
--
-- Correr UNA vez en phpMyAdmin. Si una columna ya existe, borra esa línea
-- (este MySQL no soporta ADD COLUMN IF NOT EXISTS).

ALTER TABLE escuela_datos_pago
  ADD COLUMN contacto_facturas_nombre VARCHAR(150) NULL,
  ADD COLUMN contacto_facturas_correo VARCHAR(160) NULL,
  ADD COLUMN contacto_contrato_nombre VARCHAR(150) NULL,
  ADD COLUMN contacto_contrato_correo VARCHAR(160) NULL,
  ADD COLUMN contacto_pagos_nombre    VARCHAR(150) NULL,
  ADD COLUMN contacto_pagos_correo    VARCHAR(160) NULL;

ALTER TABLE escuelas
  ADD COLUMN contrato_estado VARCHAR(12) NOT NULL DEFAULT 'sin_enviar',
  ADD COLUMN contrato_fecha_envio DATE NULL,
  ADD COLUMN contrato_fecha_firma DATE NULL;
