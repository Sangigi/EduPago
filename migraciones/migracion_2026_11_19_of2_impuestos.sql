-- ════════════════════════════════════════════════════════════════════════
-- migracion_2026_11_19_of2_impuestos.sql
--
-- OF-2 — IVA POR CONCEPTO, FACTURA CON UN RENGLÓN POR CONCEPTO Y
--        CANCELACIÓN DE FACTURAS (CFDI).
--
-- QUÉ HACE
--   · productos      → iva_tasa ('exento' | '0' | '16'), clave_sat (8 dígitos,
--                      catálogo c_ClaveProdServ) y clave_unidad (c_ClaveUnidad).
--                      Los conceptos que ya existen quedan con '16' /
--                      '86101800' / 'E48': lo mismo que se facturaba antes, así
--                      que NADA cambia hasta que el colegio edite un concepto.
--   · cobro_items    → las mismas tres columnas, NULL. Son el SNAPSHOT que se
--                      copia del concepto al crear el cobro (para que cambiar
--                      el concepto después no altere cobros ya hechos). NULL =
--                      renglón de antes de OF-2: se factura como siempre.
--   · cobros         → factura_impuestos_json: desglose por tasa de la factura
--                      emitida (lo necesita el complemento de pago para repartir
--                      el abono entre renglones exentos, tasa 0 y 16%).
--                      factura_cancelacion_estado: 'pendiente' mientras el SAT
--                      espera la aceptación del receptor; NULL en cualquier otro
--                      caso.
--   · facturas_canceladas → historial de facturas canceladas (una fila por
--                      solicitud de cancelación; incluye las pendientes).
--
-- EL PRECIO SIGUE SIENDO EL PRECIO FINAL (impuesto incluido). Esta migración
-- no cambia ningún monto: solo guarda cómo se DESGLOSA el impuesto en el CFDI.
-- La tasa correcta de cada concepto la decide el contador del colegio.
--
-- ORDEN DE EJECUCIÓN
--   Correr UNA VEZ en phpMyAdmin, de preferencia ANTES del `git pull` del
--   código de OF-2. El código tolera que la migración aún no exista (revisa
--   las columnas con SHOW COLUMNS y cae al comportamiento anterior: un solo
--   renglón al 16%, sin cancelación), pero Productos no puede guardar IVA, y
--   "Cancelar factura" responde "falta correr la migración", hasta correrla.
--
--   ⚠ LOS ALTER NO SON IDEMPOTENTES. Este MySQL (5.7) no soporta
--   ADD COLUMN IF NOT EXISTS: si repites una sentencia, falla con "Duplicate
--   column name 'xxx'". Eso solo significa que esa columna ya existe: sáltala
--   y sigue con la siguiente (cada columna va en su propia sentencia justo para
--   poder hacerlo). El CREATE TABLE del final sí es idempotente (IF NOT EXISTS).
--
-- BACKFILL: no hay. Los conceptos existentes toman los DEFAULT; los renglones
--   y cobros existentes se quedan en NULL a propósito (se facturan como antes).
--
-- Sin FOREIGN KEY (convención del proyecto): la pertenencia se valida en PHP.
-- ════════════════════════════════════════════════════════════════════════

-- 1. Conceptos de pago (catálogo del colegio).
ALTER TABLE productos
  ADD COLUMN iva_tasa VARCHAR(6) NOT NULL DEFAULT '16';

ALTER TABLE productos
  ADD COLUMN clave_sat VARCHAR(8) NOT NULL DEFAULT '86101800';

ALTER TABLE productos
  ADD COLUMN clave_unidad VARCHAR(5) NOT NULL DEFAULT 'E48';

-- 2. Snapshot en cada renglón de cobro. NULL = renglón anterior a OF-2.
ALTER TABLE cobro_items
  ADD COLUMN iva_tasa VARCHAR(6) NULL DEFAULT NULL;

ALTER TABLE cobro_items
  ADD COLUMN clave_sat VARCHAR(8) NULL DEFAULT NULL;

ALTER TABLE cobro_items
  ADD COLUMN clave_unidad VARCHAR(5) NULL DEFAULT NULL;

-- 3. Cobros: desglose de impuestos de la factura emitida y estado de una
--    cancelación en curso. Ambas NULL para todo lo ya facturado: una factura
--    sin desglose guardado se trata como un solo renglón al 16% (lo de antes).
ALTER TABLE cobros
  ADD COLUMN factura_impuestos_json TEXT NULL DEFAULT NULL;

ALTER TABLE cobros
  ADD COLUMN factura_cancelacion_estado VARCHAR(12) NULL DEFAULT NULL;

-- 4. Historial de facturas canceladas.
--    · estado: lo que devolvió Facturapi → 'canceled' (cancelada), 'pending'
--      (esperando que el receptor la acepte), 'rejected' (el receptor la
--      rechazó: la factura SIGUE vigente) o 'expired'.
--    · respuesta_pac: JSON tal cual lo devolvió el PAC (para aclaraciones).
--    Cancelar una factura NO cancela el cobro ni mueve dinero.
CREATE TABLE IF NOT EXISTS facturas_canceladas (
  id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  escuela_id       INT UNSIGNED  NOT NULL,
  cobro_id         INT UNSIGNED  NOT NULL,
  facturapi_id     VARCHAR(64)   NOT NULL,
  uuid             VARCHAR(64)   NULL DEFAULT NULL,
  serie_folio      VARCHAR(40)   NULL DEFAULT NULL,
  total            DECIMAL(12,2) NULL DEFAULT NULL,
  rfc_receptor     VARCHAR(20)   NULL DEFAULT NULL,
  motivo           CHAR(2)       NOT NULL,
  sustitucion_uuid VARCHAR(64)   NULL DEFAULT NULL,
  estado           VARCHAR(12)   NOT NULL DEFAULT 'canceled',
  respuesta_pac    TEXT          NULL DEFAULT NULL,
  usuario_id       INT UNSIGNED  NULL DEFAULT NULL,
  cancelada_en     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizada_en   DATETIME      NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_fcanc_escuela (escuela_id, cancelada_en),
  KEY idx_fcanc_cobro (cobro_id),
  KEY idx_fcanc_facturapi (facturapi_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
