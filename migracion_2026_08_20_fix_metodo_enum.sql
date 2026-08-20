-- migracion_2026_08_20_fix_metodo_enum.sql
-- Ejecutar UNA VEZ en la base de datos.
--
-- BUG CONFIRMADO: cron_recordatorios.php inserta metodo='Pendiente' al generar
-- el cobro de un concepto recurrente, pero cobros.metodo es un ENUM que no
-- incluía ese valor — MySQL 5.7 en modo no estricto lo silenció a '' (string
-- vacío). Confirmado en producción: los cobros #187-192 (generados por el
-- cron de pagos recurrentes el 2026-08-20) tienen metodo=''.
--
-- Fix: agregar 'Pendiente' como valor válido del ENUM (es justo lo que el
-- código ya intentaba escribir, así que cron_recordatorios.php no cambia) y
-- corregir los registros ya afectados. También se agrega el índice que
-- faltaba para que la consulta diaria de "cobros pendientes" del cron no
-- escanee toda la tabla conforme crezca.

ALTER TABLE cobros
  MODIFY `metodo` ENUM('Efectivo','EfectivoRef','TC','SPEI','CoDi','Cheque','Pendiente') NOT NULL;

-- Backfill de los registros ya corrompidos por el bug (metodo='' en vez de
-- 'Pendiente'). Solo toca cobros generados por el cron de recurrentes que
-- todavía no se hayan pagado con otro método real.
UPDATE cobros
SET metodo = 'Pendiente'
WHERE metodo = ''
  AND id IN (SELECT cobro_id FROM pagos_recurrentes_generados);

ALTER TABLE cobros
  ADD INDEX `idx_cobros_estado` (`estado`);
