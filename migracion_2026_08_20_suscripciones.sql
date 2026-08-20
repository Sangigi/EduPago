-- migracion_2026_08_20_suscripciones.sql
-- Ejecutar UNA VEZ en la base de datos (phpMyAdmin de Hostinger o consola MySQL)
-- antes de subir los cambios de api.php / cron_recordatorios.php a producción.
--
-- Agrega el control de vencimiento de la suscripción SaaS (plan) de cada
-- colegio, usada por el cron de recordatorios (cron_recordatorios.php) para
-- avisar por correo 7 y 5 días antes de que venza.

ALTER TABLE escuelas
  ADD COLUMN fecha_vencimiento_plan DATE NULL
    COMMENT 'Próxima fecha límite de pago de la suscripción (plan SaaS)',
  ADD COLUMN ultimo_recordatorio_plan DATE NULL
    COMMENT 'Última fecha en que se envió el correo de aviso de vencimiento de plan';

-- Backfill para colegios ya existentes: arrancan su primer ciclo (prorrateado)
-- venciendo a fin del mes en curso, igual que un colegio nuevo daría de alta hoy.
UPDATE escuelas
SET fecha_vencimiento_plan = LAST_DAY(CURDATE())
WHERE es_plantel = 0 AND fecha_vencimiento_plan IS NULL;
