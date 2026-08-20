-- EduPago — Migración: datos fiscales a nivel familia (tutor), no por alumno.
--
-- Antes, el RFC/razón social/domicilio fiscal se guardaban por alumno
-- (columna en `clientes`), lo cual mostraba el RFC en la ficha de cada hijo
-- dentro de Configuración del Portal de Familia. El código ahora los guarda
-- a nivel familia (un solo RFC por tutor, compartido entre sus hijos) y
-- requiere estas columnas nuevas en `familias`.
--
-- Aplica esto UNA VEZ en la base de datos de producción (phpMyAdmin, Adminer,
-- o el gestor de base de datos de Hostinger) antes de subir el código nuevo,
-- o los guardados de "Datos fiscales" del Portal de Familia fallarán con un
-- error controlado ("faltan columnas fiscales...") hasta que corra esto.
-- Es seguro re-ejecutar: usa IF NOT EXISTS a través de una comprobación simple.

ALTER TABLE familias
  ADD COLUMN IF NOT EXISTS rfc_factura VARCHAR(13) NULL,
  ADD COLUMN IF NOT EXISTS razon_social_factura VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS cp_factura VARCHAR(5) NULL,
  ADD COLUMN IF NOT EXISTS domicilio_factura VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS regimen_factura VARCHAR(10) NULL,
  ADD COLUMN IF NOT EXISTS uso_cfdi_defecto VARCHAR(10) NULL;
