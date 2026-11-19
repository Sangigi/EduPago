-- ════════════════════════════════════════════════════════════════════════
-- migracion_2026_11_19_of3_cobranza.sql
--
-- OF-3 — BECAS POR ALUMNO, CANCELAR COBRO CON MOTIVO, FOLIO PROPIO POR
--        ABONO Y NOTAS DE COBRANZA POR FAMILIA.
--
-- QUÉ HACE
--   · alumno_becas  (tabla nueva) → becas / descuentos guardados en el alumno
--                      (porcentaje o monto, por categoría de concepto o por
--                      conceptos concretos, con vigencia). El cron de cobros
--                      recurrentes las aplica solo; Caja las propone.
--   · familia_notas (tabla nueva) → bitácora de cobranza por familia (llamadas,
--                      acuerdos, visitas) con compromisos de pago.
--   · cobros        → cancelado_motivo, cancelado_por, cancelado_en y
--                      cancelado_monto_recibido: quién canceló, cuándo, por qué
--                      y cuánto dinero ya se había recibido en ese momento.
--   · cobro_abonos  → folio (p. ej. 'COL-0123-01'): cada abono tiene su propio
--                      folio = folio del cobro + '-' + número de abono.
--   · pagos_recurrentes_generados.cobro_id → pasa a admitir NULL. Sirve para
--                      marcar "este alumno ya se revisó en este periodo" cuando
--                      su beca es del 100% y por eso NO se crea ningún cobro.
--
-- ORDEN DE EJECUCIÓN
--   Correr UNA VEZ en phpMyAdmin, de preferencia ANTES del `git pull` del
--   código de OF-3. El código tolera que la migración aún no exista (revisa
--   la tabla o la columna y cae al comportamiento anterior, o responde "falta
--   correr la migración"):
--     · sin alumno_becas: no hay becas (Caja y el cron funcionan como siempre);
--       "Becas" en Alumnos avisa que falta la migración.
--     · sin las columnas de cobros: cancelar cobro SIGUE funcionando y exige el
--       motivo, pero este solo queda en la bitácora (logs_sistema).
--     · sin cobro_abonos.folio: los abonos nuevos no guardan folio; al listar
--       se muestra el folio calculado igual que con la migración.
--     · sin familia_notas: Notas de cobranza responde "falta correr la migración".
--     · sin cobro_id NULL: una beca del 100% no puede marcar el periodo; el cron
--       lo avisa en su resumen y no crea nada (ver docs/mejoras-of/of3-cobranza.md).
--
--   ⚠ LOS ALTER NO SON IDEMPOTENTES. Este MySQL (5.7) no soporta
--   ADD COLUMN IF NOT EXISTS: si repites una sentencia, falla con "Duplicate
--   column name 'xxx'" (o "Duplicate key name 'xxx'" en un índice). Eso solo
--   significa que ya se corrió: sáltala y sigue con la siguiente (cada columna
--   y cada índice va en su propia sentencia justo para poder hacerlo).
--   Los CREATE TABLE sí son idempotentes (IF NOT EXISTS) y el bloque 5 también
--   (revisa information_schema antes de tocar nada).
--
-- BACKFILL
--   · Becas, notas y columnas de cancelación: ninguno. Los cobros ya cancelados
--     antes de OF-3 se quedan con motivo/quién/cuándo en NULL ("sin registro").
--   · Folios de abonos: OPCIONAL, comentado en el bloque 6. No hace falta
--     correrlo: los abonos viejos sin folio muestran uno calculado igual (cobro +
--     número de abono por orden de id) al listarse. Correrlo solo "congela" ese
--     mismo valor en la base, útil si alguien consulta cobro_abonos por SQL.
--     Es seguro repetirlo: solo toca filas con folio NULL.
--
-- Sin FOREIGN KEY (convención del proyecto): la pertenencia se valida en PHP.
-- ════════════════════════════════════════════════════════════════════════

-- 1. Becas por alumno.
--    · tipo        'porcentaje' (valor = % del precio, 0.01–100) | 'monto' (valor = pesos).
--    · alcance     'categorias' → alcance_ids = JSON de productos.categoria
--                                 (["colegiatura","transporte"]);
--                  'productos'  → alcance_ids = JSON de productos.id ([12,15]).
--    · vigente_*   NULL = sin límite de ese lado. Ambos extremos incluyen su día.
--    · activo      baja lógica: una beca NUNCA se borra (queda en el historial).
CREATE TABLE IF NOT EXISTS alumno_becas (
  id             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  escuela_id     INT UNSIGNED  NOT NULL,
  cliente_id     INT UNSIGNED  NOT NULL,
  nombre         VARCHAR(80)   NOT NULL,
  tipo           VARCHAR(10)   NOT NULL DEFAULT 'porcentaje',
  valor          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  alcance        VARCHAR(10)   NOT NULL DEFAULT 'categorias',
  alcance_ids    TEXT          NULL DEFAULT NULL,
  vigente_desde  DATE          NULL DEFAULT NULL,
  vigente_hasta  DATE          NULL DEFAULT NULL,
  activo         TINYINT(1)    NOT NULL DEFAULT 1,
  notas          VARCHAR(255)  NULL DEFAULT NULL,
  creado_por     INT UNSIGNED  NULL DEFAULT NULL,
  creado_en      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_becas_alumno (escuela_id, cliente_id, activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Notas de cobranza por familia.
--    · cliente_id        NULL = nota de toda la familia; con valor = de ese hijo.
--    · fecha_compromiso  fecha en que la familia prometió pagar (opcional).
--    · cumplido          NULL = la nota no es un compromiso; 0 = compromiso sin
--                        cumplir; 1 = cumplido. (Los listados tratan NULL y 0 igual.)
--    · eliminado         baja lógica (la nota queda en la base).
CREATE TABLE IF NOT EXISTS familia_notas (
  id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  escuela_id        INT UNSIGNED  NOT NULL,
  familia_id        INT UNSIGNED  NOT NULL,
  cliente_id        INT UNSIGNED  NULL DEFAULT NULL,
  tipo              VARCHAR(10)   NOT NULL DEFAULT 'otro',
  texto             VARCHAR(1000) NOT NULL,
  fecha_compromiso  DATE          NULL DEFAULT NULL,
  monto_compromiso  DECIMAL(12,2) NULL DEFAULT NULL,
  cumplido          TINYINT(1)    NULL DEFAULT NULL,
  usuario_id        INT UNSIGNED  NULL DEFAULT NULL,
  creado_en         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en    DATETIME      NULL DEFAULT NULL,
  eliminado         TINYINT(1)    NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_fnotas_familia (escuela_id, familia_id),
  KEY idx_fnotas_compromiso (escuela_id, fecha_compromiso)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Cancelación de cobros con motivo y registro. Todas NULL = cobro no
--    cancelado, o cancelado antes de OF-3.
--    cancelado_monto_recibido = cobros.monto_pagado al momento de cancelar:
--    cancelar NO devuelve dinero, y esta cifra es lo que el colegio debe
--    devolver por fuera.
ALTER TABLE cobros
  ADD COLUMN cancelado_motivo VARCHAR(255) NULL DEFAULT NULL;

ALTER TABLE cobros
  ADD COLUMN cancelado_por INT NULL DEFAULT NULL;

ALTER TABLE cobros
  ADD COLUMN cancelado_en DATETIME NULL DEFAULT NULL;

ALTER TABLE cobros
  ADD COLUMN cancelado_monto_recibido DECIMAL(12,2) NULL DEFAULT NULL;

-- 4. Folio propio por abono. NULL = abono anterior a OF-3 (se calcula al listar).
ALTER TABLE cobro_abonos
  ADD COLUMN folio VARCHAR(40) NULL DEFAULT NULL;

ALTER TABLE cobro_abonos
  ADD INDEX idx_abonos_folio (folio);

-- 5. pagos_recurrentes_generados.cobro_id debe admitir NULL.
--    Una beca del 100% deja el cobro en $0, y un cobro de $0 no se crea; pero el
--    periodo tiene que quedar marcado para que el cron no lo reintente. Ese
--    marcador es una fila de esta tabla SIN cobro (cobro_id NULL). Todo lo
--    demás que lee la tabla la une por cobro_id (INNER JOIN), así que esas
--    filas no se ven como cobros.
--    La definición original de la tabla no vive en este repositorio, así que
--    en vez de adivinar el tipo de la columna se lee de information_schema y se
--    conserva tal cual (solo cambia a NULL). Si la columna ya admite NULL, o si
--    la tabla no existe, no hace nada. Si el ALTER falla (p. ej. cobro_id forma
--    parte de la llave primaria), el cron sigue funcionando y solo avisa.
SET @of3_tipo := (SELECT COLUMN_TYPE FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE()
                     AND TABLE_NAME = 'pagos_recurrentes_generados'
                     AND COLUMN_NAME = 'cobro_id'
                     AND IS_NULLABLE = 'NO');
SET @of3_sql := IF(@of3_tipo IS NULL,
                   'SELECT ''cobro_id ya admite NULL (o la tabla no existe): nada que hacer'' AS of3_aviso',
                   CONCAT('ALTER TABLE pagos_recurrentes_generados MODIFY cobro_id ', @of3_tipo, ' NULL DEFAULT NULL'));
PREPARE of3_stmt FROM @of3_sql;
EXECUTE of3_stmt;
DEALLOCATE PREPARE of3_stmt;

-- 6. OPCIONAL — Backfill de folios de abonos existentes (ver cabecera).
--    Numera los abonos de cada cobro en orden de id (el mismo orden que usa el
--    número de parcialidad de los complementos de pago): COL-0123-01, -02, ...
--    Descomenta y corre UNA VEZ si quieres los folios guardados:
--
-- UPDATE cobro_abonos a
--   JOIN cobros c ON c.id = a.cobro_id
--   JOIN (SELECT a1.id, COUNT(a2.id) AS n
--           FROM cobro_abonos a1
--           JOIN cobro_abonos a2 ON a2.cobro_id = a1.cobro_id AND a2.id <= a1.id
--          GROUP BY a1.id) x ON x.id = a.id
--    SET a.folio = CONCAT(LEFT(c.folio, 37), '-', IF(x.n < 10, CONCAT('0', x.n), x.n))
--  WHERE a.folio IS NULL AND c.folio IS NOT NULL AND c.folio <> '';
