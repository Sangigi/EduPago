-- migracion_2026_08_20_plan_enum.sql
-- Ejecutar UNA VEZ en la base de datos.
--
-- escuelas.plan era varchar(20) libre — el propio código ya se defendía de
-- esto (views/Suscripciones.js muestra "Valor de plan no reconocido" cuando
-- llega un typo, y usa el plan más restrictivo por seguridad). El backend
-- (crear_escuela/editar_escuela/cambiar_plan_escuela) ya solo escribe
-- 'basico'/'avanzado'/'pro' — convertir la columna a ENUM hace el typo
-- imposible desde la base de datos, sin necesidad de tocar ningún código.
--
-- Si algún día agregas un plan nuevo, acuérdate de agregarlo aquí también
-- (y a PLANES_LIMITES en api.php / PLANES_INFO en Suscripciones.js).

ALTER TABLE escuelas
  MODIFY `plan` ENUM('basico','avanzado','pro') NOT NULL DEFAULT 'basico';
