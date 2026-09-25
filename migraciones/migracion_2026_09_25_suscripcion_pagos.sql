-- migracion_2026_09_25_suscripcion_pagos.sql
--
-- HISTORIAL DE PAGOS DE LA SUSCRIPCIÓN (mensualidad del colegio al sistema).
--
-- POR QUÉ EXISTE ESTA TABLA
--
-- Hasta hoy no había forma de ver los pagos de suscripción de un colegio, y
-- no era un problema de pantalla: era de DATO. Los pagos de renovación se
-- guardaban en columnas de `escuelas` (pago_renovacion_referencia, _folio,
-- _monto, _plan) pensadas como "pago EN CURSO", no como historial — y en el
-- mismo UPDATE que confirma el pago se ponen en NULL:
--
--     webhooks/webhook_liga.php:310   y   webhooks/pago_referencia.php:427
--       SET fecha_vencimiento_plan = ?, ...
--           pago_renovacion_referencia = NULL, pago_renovacion_folio = NULL,
--           pago_renovacion_monto = NULL, pago_renovacion_plan = NULL
--
-- O sea: el monto, la referencia y el folio se BORRABAN justo al confirmarse
-- el pago. Limpiarlas es correcto para lo que hacen (si no, el siguiente
-- cobro heredaría una intención vieja), pero significaba que cada renovación
-- destruía la evidencia de la anterior. Lo único que quedaba era una línea en
-- logs_sistema sin monto, sin referencia y sin código de autorización — y esa
-- tabla se archiva a los 180 días (cron_recordatorios.php).
--
-- Por eso esto es una tabla NUEVA y no una consulta sobre lo existente: el
-- dato histórico no está en ningún lado, hay que empezar a guardarlo.
--
-- DISEÑO: SOLO SE INSERTA, NUNCA SE ACTUALIZA
--
-- Misma lección que el ledger de abonos (cobro_abonos) y el de comisiones:
-- una fila por pago confirmado, que no se toca nunca más. Si algo sale mal se
-- agrega una fila que lo corrige, no se edita la vieja. Es lo único que
-- aguanta una aclaración meses después.
--
-- IDEMPOTENCIA
--
-- Los webhooks del proveedor REINTENTAN. Sin protección, un reintento crearía
-- una segunda fila del mismo pago y el colegio vería cobros duplicados que
-- nunca existieron. La llave `idem` la arma quien inserta (ver
-- registrar_pago_suscripcion en lib/helpers_pagos.php) con la referencia o el
-- código de autorización del proveedor, que son únicos por operación. El
-- UNIQUE la hace cumplir en la base, no solo en el código: aunque dos
-- reintentos lleguen a la vez, solo uno gana.
--
-- Esta migración es IDEMPOTENTE: se puede correr varias veces sin romper nada.
-- No se usa information_schema porque Hostinger no da permiso (#1044).

CREATE TABLE IF NOT EXISTS suscripcion_pagos (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  escuela_id       INT NOT NULL,

  -- De dónde vino el pago:
  --   'registro'   primera mensualidad, pagada durante el alta del colegio
  --                (vive también en invitaciones_colegio)
  --   'renovacion' renovación mensual de un colegio ya activo
  --   'manual'     el superadmin movió la fecha de vencimiento a mano, SIN
  --                cobro de por medio (acciones/renovar_suscripcion.php).
  --                Se registra igual, y a propósito con monto NULL, para que
  --                al revisar el historial no parezca que falta un pago.
  origen           VARCHAR(24) NOT NULL,

  metodo           VARCHAR(16)  NULL,   -- 'TC' | 'Efectivo' | NULL si fue manual
  plan             VARCHAR(20)  NULL,   -- el plan que quedó vigente con este pago
  monto            DECIMAL(10,2) NULL,  -- NULL SOLO cuando origen='manual'

  -- Datos del proveedor, que son los que sirven para una aclaración:
  referencia       VARCHAR(64)  NULL,
  folio            VARCHAR(64)  NULL,
  auth_code        VARCHAR(64)  NULL,

  -- Periodo que cubre este pago. cubre_hasta es la fecha de vencimiento que
  -- quedó tras aplicarlo, que es justo lo que el colegio quiere poder ver.
  cubre_desde      DATE NULL,
  cubre_hasta      DATE NULL,

  registrado_por   INT NULL,            -- usuarios.id si lo hizo una persona; NULL si fue el webhook
  pagado_en        DATETIME NOT NULL,
  creado_en        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Ver la nota de IDEMPOTENCIA de arriba.
  UNIQUE KEY uq_suscpago_idem (idem_key),
  KEY idx_suscpago_escuela (escuela_id, pagado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
