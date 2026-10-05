-- migracion_2026_10_05_contrato_firmado.sql
--
-- Contrato firmado que la escuela sube desde Mi cuenta. Se guarda en
-- uploads_privados/; aquí solo la ruta, el nombre original y el MIME.
-- Correr UNA vez en phpMyAdmin, después de las otras dos migraciones del 05-oct.

ALTER TABLE escuelas
  ADD COLUMN contrato_firmado_ruta VARCHAR(255) NULL,
  ADD COLUMN contrato_firmado_nombre VARCHAR(255) NULL,
  ADD COLUMN contrato_firmado_mime VARCHAR(100) NULL;
