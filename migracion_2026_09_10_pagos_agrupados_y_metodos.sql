-- migracion_2026_09_10_pagos_agrupados_y_metodos.sql
--
-- Corre esto UNA VEZ en phpMyAdmin antes de usar el código que la acompaña.
--
-- Diagnóstico: el pago agrupado en Portal Familia (y varias features más
-- que llegaron en el mismo lote: renovación de suscripción con cobro real,
-- pago de invitación durante el registro, métodos de pago apagables por
-- escuela/globalmente, modo mantenimiento) fallan porque el código ya usa
-- tablas y columnas que nunca se crearon en la base de datos real — no
-- existe ningún migracion_*.sql para ellas ni quedó registro en
-- PRODUCCION.md (a diferencia del resto de features del proyecto, que sí
-- documentan su migración incluso después de borrar el .sql). Por eso
-- iniciar_pago_agrupado.php fallaba con un error genérico ("No se pudo
-- preparar el pago agrupado") o con un error fatal sin loguear nada: el
-- INSERT/SELECT contra `cobros_agrupados` truena antes de llegar a
-- cualquier log_api().
--
-- Todo usa IF NOT EXISTS / ADD COLUMN IF NOT EXISTS para poder re-correrse
-- sin romper nada si alguna pieza ya existía parcialmente. ADD COLUMN IF
-- NOT EXISTS requiere MySQL 8.0.29+ / MariaDB 10.3+; si tu servidor es más
-- viejo, quita el "IF NOT EXISTS" de cada línea de ALTER TABLE y corre solo
-- las que de verdad falten.

-- ── Config global clave/valor (métodos de pago apagados globalmente, modo
--    mantenimiento) ──
CREATE TABLE IF NOT EXISTS config_sistema (
  clave            VARCHAR(100) NOT NULL,
  valor            TEXT NULL,
  actualizado_en   DATETIME NULL,
  actualizado_por  INT UNSIGNED NULL,
  PRIMARY KEY (clave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Pagos agrupados (Portal Familia: varios cobros pendientes del mismo
--    alumno pagados juntos con Tarjeta o Efectivo) ──
CREATE TABLE IF NOT EXISTS cobros_agrupados (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  escuela_id      INT UNSIGNED NOT NULL,
  cliente_id      INT UNSIGNED NOT NULL,
  folio           VARCHAR(60) NOT NULL,
  total           DECIMAL(10,2) NOT NULL,
  metodo          VARCHAR(20) NOT NULL,
  estado          VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  referencia      VARCHAR(30) NULL,
  barcode_url     TEXT NULL,
  payformat_url   TEXT NULL,
  vencimiento     DATE NULL,
  auth_code       VARCHAR(20) NULL,
  pagado_en       DATETIME NULL,
  creado_en       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cobros_agrupados_cliente (cliente_id),
  KEY idx_cobros_agrupados_escuela (escuela_id),
  KEY idx_cobros_agrupados_referencia (referencia),
  KEY idx_cobros_agrupados_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cobros_agrupados_detalle (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  cobro_agrupado_id   INT UNSIGNED NOT NULL,
  cobro_id            INT UNSIGNED NOT NULL,
  total               DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_detalle_agrupado (cobro_agrupado_id),
  KEY idx_detalle_cobro (cobro_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Escuelas: métodos de pago apagados por escuela + pago de renovación de
--    suscripción ──
ALTER TABLE escuelas
  ADD COLUMN IF NOT EXISTS metodos_pago_deshabilitados TEXT NULL DEFAULT NULL
    COMMENT 'JSON array de metodos (Efectivo/TC/SPEI/EfectivoRef/Cheque/CAI) apagados para esta escuela',
  ADD COLUMN IF NOT EXISTS pago_renovacion_referencia VARCHAR(30) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pago_renovacion_folio VARCHAR(60) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pago_renovacion_monto DECIMAL(10,2) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pago_renovacion_barcode_url TEXT NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pago_renovacion_payformat_url TEXT NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pago_renovacion_vencimiento DATE NULL DEFAULT NULL;

-- ── Invitaciones de colegio: pago de la primera mensualidad durante el
--    registro público ──
ALTER TABLE invitaciones_colegio
  ADD COLUMN IF NOT EXISTS metodo_pago VARCHAR(20) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pago_referencia VARCHAR(30) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pago_folio VARCHAR(60) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pago_barcode_url TEXT NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pago_vencimiento DATE NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pago_auth_code VARCHAR(20) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS plan_elegido VARCHAR(20) NULL DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS monto_suscripcion DECIMAL(10,2) NULL DEFAULT NULL;

-- ── Cobros: código de autorización de tarjeta (referenciado al confirmar
--    pagos agrupados y de renovación vía webhook) ──
ALTER TABLE cobros
  ADD COLUMN IF NOT EXISTS auth_code VARCHAR(20) NULL DEFAULT NULL;

-- ── Índices para las búsquedas que hacen los webhooks por referencia
--    (webhook_liga.php, webhooks/pago_referencia.php) ──
ALTER TABLE escuelas
  ADD INDEX IF NOT EXISTS idx_escuelas_pago_renovacion_referencia (pago_renovacion_referencia);
ALTER TABLE invitaciones_colegio
  ADD INDEX IF NOT EXISTS idx_invitaciones_pago_referencia (pago_referencia);
