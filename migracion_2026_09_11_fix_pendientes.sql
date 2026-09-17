-- migracion_2026_09_11_fix_pendientes.sql
--
-- Corre esto UNA VEZ en phpMyAdmin.
--
-- Diagnóstico: dos columnas que el código YA escribe no las crea ninguna
-- migración del repo (verificado con grep sobre los 7 archivos .sql
-- existentes) ni aparecen documentadas en PRODUCCION.md:
--
--   - invitaciones_colegio.pagado_en -- la escriben webhooks/webhook_liga.php
--     y webhooks/pago_referencia.php al confirmar el pago de la primera
--     mensualidad de un colegio nuevo.
--     YA EXISTE en tu base real (venía en el esquema original, que llegó por
--     un git pull externo y nunca se documentó en ningún .sql del repo) --
--     confirmado el 11-sep-2026 por el error "Duplicate column name
--     'pagado_en'" al intentar agregarla. Por eso ya no está en este archivo.
--   - escuelas.origen_invitacion_id -- la escribe acciones/invitacion_resolver.php
--     al crear la escuela, para saber de qué invitación vino. Esta sí falta.
--
-- Si esta columna no existe en la base real, el INSERT de aprobación de una
-- invitación hace rollback (el colegio nunca se crea, aunque ya se haya
-- cobrado el pago de suscripción) -- falla en silencio del lado del usuario.
--
-- Es una columna NUEVA (verificado por grep: no aparece en ninguna migración
-- previa del repo), así que se agrega directamente, sin "IF NOT EXISTS" --
-- tu servidor de MySQL no soporta esa sintaxis. Si por alguna razón ya
-- existiera también, MySQL marcará "Duplicate column name" y no hace falta
-- correr nada más.

ALTER TABLE escuelas
  ADD COLUMN origen_invitacion_id INT UNSIGNED NULL DEFAULT NULL;

ALTER TABLE escuelas
  ADD INDEX idx_escuelas_origen_invitacion (origen_invitacion_id);
