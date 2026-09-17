-- migracion_2026_08_28_evidencia_pago_tarjeta.sql
--
-- Corre esto UNA VEZ en phpMyAdmin antes de usar el código que la acompaña.
--
-- Cierra un hueco real: al recibir el webhook de pago con tarjeta (primera
-- vez que se tokeniza, vía webhook_liga.php) o al cobrar un Cargo Automático
-- (cobrar_via_token en lib/helpers_pagos.php), Cobroscontarjeta.com manda
-- varios datos de evidencia del pago (tarjeta enmascarada, tipo, correo
-- capturado) que hasta ahora se descartaban por completo — no había ninguna
-- columna donde guardarlos. Sin esto no hay forma de confirmar, por ejemplo,
-- "qué tarjeta terminada en qué dígitos" quedó domiciliada.

ALTER TABLE cobros
  ADD COLUMN cc_mask     VARCHAR(4)   NULL AFTER auth_code,
  ADD COLUMN cc_type     VARCHAR(60)  NULL AFTER cc_mask,
  ADD COLUMN pago_email  VARCHAR(150) NULL AFTER cc_type;

ALTER TABLE clientes
  ADD COLUMN token_tarjeta_mask VARCHAR(4)  NULL AFTER token_tarjeta_estado,
  ADD COLUMN token_tarjeta_tipo VARCHAR(60) NULL AFTER token_tarjeta_mask;
