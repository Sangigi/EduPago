-- ════════════════════════════════════════════════════════════════════════
-- migracion_2026_11_20_of6_inventario.sql
--
-- OF-6 — INVENTARIO CON EXISTENCIAS (uniformes, libros, material y productos
-- de la tiendita), con entradas de mercancía, conteo físico y avisos.
--
-- DOCUMENTACIÓN. Las migraciones corren solas:
--     php herramientas/migrar.php --aplicar
--   (o Diagnóstico → Base de datos → Aplicar pendientes). Los pasos de esta fase
--   están en lib/migraciones.php con los ids 2026_11_20_of6_01 a _04. Este archivo
--   queda como referencia y para quien prefiera pegarlo en phpMyAdmin, PERO:
--   MySQL 5.7 no soporta "ADD COLUMN IF NOT EXISTS": si pegas las dos primeras
--   sentencias a mano, salta una que ya exista ("Duplicate column name"). Con el
--   migrador no hay ese problema (verifica information_schema antes de cada paso).
--
-- QUÉ HACE
--   · productos.maneja_existencias         → 1 = este concepto de pago lleva existencias
--                                            (solo categorías físicas: uniforme, material,
--                                            comedor, otro; el servidor lo exige).
--   · tienda_productos.maneja_existencias  → 1 = este producto de la tiendita lleva existencias.
--   · inventario_existencias               → la existencia CACHEADA y el mínimo de cada
--                                            producto controlado. UNIQUE (tipo, item_id).
--                                            tipo = 'concepto' (productos) | 'tienda' (tienda_productos).
--   · inventario_movimientos               → el LIBRO: la fuente de verdad. Una fila por
--                                            entrada, venta, devolución, ajuste o conteo, con
--                                            cantidad CON SIGNO, la existencia que quedó, quién,
--                                            cuándo, el documento (cobro_id / venta_id / gasto_id)
--                                            y una idem_key UNIQUE (un reintento no mueve dos veces).
--
-- NO HAY BACKFILL. Nada se controla hasta que el admin marca "Maneja existencias" en un
-- concepto (o "Controlar" en Inventario). Una existencia inicial se captura con un
-- conteo físico o una entrada.
--
-- NO TOCA dinero ni tablas calientes: las dos columnas son ADD COLUMN con DEFAULT 0
-- sobre productos y tienda_productos (tablas chicas); las dos tablas son nuevas.
--
-- SIN ESTA MIGRACIÓN el sistema funciona exactamente como antes (sin inventario):
-- inventario_listo() devuelve false y las ventas no intentan moverlo.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE productos ADD COLUMN maneja_existencias TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE tienda_productos ADD COLUMN maneja_existencias TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS inventario_existencias (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  escuela_id      INT UNSIGNED  NOT NULL,
  tipo            VARCHAR(10)   NOT NULL,
  item_id         INT UNSIGNED  NOT NULL,
  existencia      INT           NOT NULL DEFAULT 0,
  minimo          INT           NOT NULL DEFAULT 0,
  ultimo_costo    DECIMAL(12,2) NULL DEFAULT NULL,
  actualizado_en  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_invex_item (tipo, item_id),
  KEY idx_invex_escuela (escuela_id, tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS inventario_movimientos (
  id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  escuela_id          INT UNSIGNED  NOT NULL,
  tipo                VARCHAR(10)   NOT NULL,
  item_id             INT UNSIGNED  NOT NULL,
  movimiento          VARCHAR(12)   NOT NULL,
  cantidad            INT           NOT NULL,
  existencia_despues  INT           NOT NULL,
  costo_unitario      DECIMAL(12,2) NULL DEFAULT NULL,
  proveedor_id        INT UNSIGNED  NULL DEFAULT NULL,
  cobro_id            INT UNSIGNED  NULL DEFAULT NULL,
  venta_id            INT UNSIGNED  NULL DEFAULT NULL,
  gasto_id            INT UNSIGNED  NULL DEFAULT NULL,
  motivo              VARCHAR(255)  NULL DEFAULT NULL,
  usuario_id          INT UNSIGNED  NULL DEFAULT NULL,
  idem_key            VARCHAR(80)   NOT NULL,
  creado_en           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_invmov_idem (idem_key),
  KEY idx_invmov_item (tipo, item_id, id),
  KEY idx_invmov_escuela (escuela_id, creado_en),
  KEY idx_invmov_cobro (cobro_id),
  KEY idx_invmov_venta (venta_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
