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
--
-- NOTA: el servidor de Hostinger no soporta "ADD COLUMN IF NOT EXISTS" (esa
-- sintaxis requiere MySQL 8.0.29+ o MariaDB 10.0.2+ con el módulo habilitado).
-- Este ALTER es de una sola vez: si ya lo corriste antes, NO lo vuelvas a
-- correr tal cual (fallará con "Duplicate column name"); en ese caso comenta
-- con -- las líneas de las columnas que ya existan.

ALTER TABLE familias
  ADD COLUMN rfc_factura VARCHAR(13) NULL,
  ADD COLUMN razon_social_factura VARCHAR(255) NULL,
  ADD COLUMN cp_factura VARCHAR(5) NULL,
  ADD COLUMN domicilio_factura VARCHAR(255) NULL,
  ADD COLUMN regimen_factura VARCHAR(10) NULL,
  ADD COLUMN uso_cfdi_defecto VARCHAR(10) NULL;
