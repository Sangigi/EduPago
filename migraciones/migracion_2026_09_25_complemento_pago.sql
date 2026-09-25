-- migracion_2026_09_25_complemento_pago.sql
--
-- FACTURACIÓN EN PARCIALIDADES: CFDI DE PAGO POR CADA ABONO
--
-- EL CONTEXTO FISCAL
--
-- Cuando un cobro se paga en abonos, el SAT NO permite facturarlo como PUE
-- (Pago en Una Exhibición). El camino correcto son dos comprobantes distintos:
--
--   1. UNA factura de ingreso tipo PPD (Pago en Parcialidades o Diferido),
--      emitida por el total, con forma de pago "99 Por definir". Se emite
--      aunque todavía no se haya cobrado nada.
--   2. UN CFDI de pago (tipo "P", complemento de recepción de pagos) por CADA
--      abono recibido, ligado al UUID de la factura del punto 1, diciendo
--      cuánto se pagó, con qué forma y cuánto saldo queda.
--
-- Sin el punto 2 la factura PPD queda "colgada": el SAT no tiene registro de
-- que se haya cobrado, y el cliente no puede deducir el gasto.
--
-- Hasta hoy acciones/generar_cfdi.php se NEGABA a facturar un cobro con
-- abonos, con un mensaje que explicaba exactamente esto. Esta migración es lo
-- que faltaba para poder levantar ese candado.
--
-- QUÉ AGREGA
--
-- Tres columnas en `cobro_abonos` para guardar el complemento de cada abono.
-- Van en el ABONO y no en el cobro a propósito: un cobro tiene un complemento
-- POR ABONO, no uno solo. Ponerlas en `cobros` obligaría a sobrescribir el
-- anterior con cada pago nuevo — exactamente el error que ya se cometió con
-- las columnas pago_renovacion_* de `escuelas` (ver
-- migracion_2026_09_25_suscripcion_pagos.sql).
--
-- NO ES IDEMPOTENTE: MySQL 5.7 no soporta ADD COLUMN IF NOT EXISTS y esta base
-- no da permiso sobre information_schema (#1044). Si se corre dos veces, la
-- segunda falla con "Duplicate column name" — error inofensivo y claro.

ALTER TABLE cobro_abonos
  ADD COLUMN cfdi_complemento_id VARCHAR(64) NULL DEFAULT NULL
    COMMENT 'id del CFDI de pago en Facturapi',
  ADD COLUMN cfdi_complemento_uuid VARCHAR(64) NULL DEFAULT NULL
    COMMENT 'Folio fiscal (UUID) del complemento de pago',
  ADD COLUMN cfdi_complemento_en DATETIME NULL DEFAULT NULL
    COMMENT 'Cuándo se timbró el complemento';

-- Para encontrar rápido los abonos que todavía no tienen su complemento: es
-- la consulta que hay que poder correr para no dejar facturas PPD colgadas.
ALTER TABLE cobro_abonos
  ADD KEY idx_abono_sin_complemento (cobro_id, cfdi_complemento_uuid);

-- ════════════════════════════════════════════════════════════════════════
-- COMPROBACIÓN
-- ════════════════════════════════════════════════════════════════════════
SHOW COLUMNS FROM cobro_abonos LIKE 'cfdi_complemento%';

-- Abonos de cobros YA facturados que siguen sin su complemento de pago.
-- Debería salir vacío una vez que todo esté al corriente:
-- SELECT a.id, a.cobro_id, a.monto, a.creado_en
--   FROM cobro_abonos a
--   JOIN cobros c ON c.id = a.cobro_id
--  WHERE c.factura_uuid IS NOT NULL
--    AND a.cfdi_complemento_uuid IS NULL;
