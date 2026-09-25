-- migracion_2026_09_11_modo_demo.sql
--
-- Corre esto UNA VEZ en phpMyAdmin.
--
-- Modo demo/prueba por colegio (requisito de la junta): una escuela en modo
-- 'demo' puede recorrer TODO el sistema, pero ningún cobro real se manda a
-- la pasarela de pagos ni se asigna una CLABE STP real. El superadmin define
-- cuántos días dura al activarlo para un colegio.
--
-- Nada de esto existía antes (verificado por grep exhaustivo de
-- demo|trial|prueba sobre todo el repo): no había columna, ni estado, ni
-- interruptor para esto.
--
-- Sin "IF NOT EXISTS" -- tu servidor de MySQL no soporta esa sintaxis. Si
-- alguna columna ya existiera, MySQL marcará "Duplicate column name" en esa
-- línea puntual; en ese caso borra solo esa línea y corre el resto.

ALTER TABLE escuelas
  ADD COLUMN modo VARCHAR(10) NOT NULL DEFAULT 'activa',
  ADD COLUMN fecha_fin_prueba DATE NULL DEFAULT NULL;

-- Días de prueba por defecto cuando el superadmin activa una demo sin
-- especificar cuántos días (mismo patrón clave/valor que ya usan
-- 'mantenimiento_secciones', 'metodos_pago_global', etc.).
INSERT INTO config_sistema (clave, valor, actualizado_en)
  VALUES ('demo_dias_default', '15', NOW())
  ON DUPLICATE KEY UPDATE clave = clave;
