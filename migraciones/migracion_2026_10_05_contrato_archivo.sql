-- migracion_2026_10_05_contrato_archivo.sql
--
-- Guarda el PDF del contrato que provision sube para cada escuela (se manda
-- por correo al contacto de firma). Va en uploads_privados/, esto solo guarda
-- la ruta relativa y el nombre original.
-- Correr UNA vez en phpMyAdmin, después de migracion_2026_10_05_contactos_y_contrato.sql.

ALTER TABLE escuelas
  ADD COLUMN contrato_ruta VARCHAR(255) NULL,
  ADD COLUMN contrato_nombre VARCHAR(255) NULL;
