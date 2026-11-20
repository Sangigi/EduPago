-- ════════════════════════════════════════════════════════════════════════
-- migracion_2026_11_20_of5_importar.sql
--
-- OF-5 — IMPORTAR ADEUDOS Y SALDOS INICIALES DESDE UN ARCHIVO.
--
-- DOCUMENTACIÓN. Desde OF-4a las migraciones corren solas:
--     php herramientas/migrar.php --aplicar
--   (o Diagnóstico → Base de datos → Aplicar pendientes). Los pasos de esta
--   fase están en lib/migraciones.php con los ids 2026_11_20_of5_01 y _02. Este
--   archivo queda como referencia y para quien prefiera pegarlo en phpMyAdmin
--   (CREATE TABLE IF NOT EXISTS: es seguro repetirlo).
--
-- QUÉ HACE
--   · importaciones_saldos        → una fila por importación aplicada: quién, cuándo,
--                                   qué archivo (nombre y hash), cuántos cobros y por
--                                   cuánto, y su estado ('aplicada' | 'deshecha').
--   · importaciones_saldos_filas  → una fila por COBRO creado. Es la tabla "puente"
--                                   entre la importación y cobros: guarda lo que decía
--                                   el archivo (monto original, abonado, folio externo,
--                                   vencimiento) y la HUELLA del renglón, con
--                                   UNIQUE (escuela_id, huella): subir otra vez el mismo
--                                   archivo no duplica nada.
--
-- POR QUÉ UNA TABLA PUENTE Y NO cobros.importacion_id
--   cobros es la tabla más grande y más caliente del sistema: un ALTER mientras
--   hay cobro bloquearía la caja. Con la tabla puente esta migración no toca
--   ninguna tabla existente. Tampoco hay que agregar nada a cobros para el
--   "folio externo" ni la fecha de vencimiento (cobros no tiene columna de
--   vencimiento): quedan aquí.
--
-- ORDEN DE EJECUCIÓN
--   Antes o después del `git pull`. El código tolera que no esté aplicada: las
--   acciones importar_saldos_* responden "falta aplicar la migración" y el resto
--   del sistema ni se entera.
--
-- AL DESHACER una importación, huella pasa a NULL y deshecha a 1 (un UNIQUE admite
-- muchos NULL): así el mismo archivo se puede volver a importar después.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS importaciones_saldos (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  escuela_id      INT UNSIGNED  NOT NULL,
  archivo_nombre  VARCHAR(255)  NULL DEFAULT NULL,
  archivo_hash    CHAR(40)      NULL DEFAULT NULL,
  usuario_id      INT UNSIGNED  NULL DEFAULT NULL,
  creado_en       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  filas_total     INT UNSIGNED  NOT NULL DEFAULT 0,
  cobros_creados  INT UNSIGNED  NOT NULL DEFAULT 0,
  filas_omitidas  INT UNSIGNED  NOT NULL DEFAULT 0,
  monto_total     DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  estado          VARCHAR(10)   NOT NULL DEFAULT 'aplicada',
  deshecha_por    INT UNSIGNED  NULL DEFAULT NULL,
  deshecha_en     DATETIME      NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_impsal_escuela (escuela_id, creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS importaciones_saldos_filas (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  importacion_id  INT UNSIGNED  NOT NULL,
  escuela_id      INT UNSIGNED  NOT NULL,
  cobro_id        INT UNSIGNED  NOT NULL,
  cliente_id      INT UNSIGNED  NOT NULL,
  fila_archivo    INT UNSIGNED  NULL DEFAULT NULL,
  huella          CHAR(40)      NULL DEFAULT NULL,
  concepto        VARCHAR(190)  NULL DEFAULT NULL,
  monto_original  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  abonado         DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  pendiente       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  fecha_emision   DATE          NULL DEFAULT NULL,
  fecha_vence     DATE          NULL DEFAULT NULL,
  folio_externo   VARCHAR(60)   NULL DEFAULT NULL,
  producto_id     INT UNSIGNED  NULL DEFAULT NULL,
  nota            VARCHAR(255)  NULL DEFAULT NULL,
  deshecha        TINYINT(1)    NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_impsalf_huella (escuela_id, huella),
  KEY idx_impsalf_imp (importacion_id),
  KEY idx_impsalf_cobro (cobro_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
