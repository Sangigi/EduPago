-- ════════════════════════════════════════════════════════════════════════
-- migracion_2026_11_20_of7c.sql
--
-- OF-7c — "VER COMO", BITÁCORA DE AUDITORÍA CON ANTES Y DESPUÉS Y AGENDA DE CITAS.
--
-- DOCUMENTACIÓN. Las migraciones corren solas:
--     php herramientas/migrar.php --aplicar
--   (o Diagnóstico → Base de datos → Aplicar pendientes). Los pasos de esta fase están
--   en lib/migraciones.php con los ids 2026_11_20_of7c_01 a _03. Este archivo queda como
--   referencia y para quien prefiera pegarlo en phpMyAdmin, PERO: MySQL 5.7 no soporta
--   "ADD COLUMN IF NOT EXISTS"; si pegas la primera sentencia a mano y ya existe, marca
--   "Duplicate column name". Con el migrador no hay ese problema.
--
-- QUÉ HACE
--   · logs_sistema.suplantado_por → id del usuario REAL cuando la acción se hizo viendo como
--                                   otro usuario (la fila queda a nombre del objetivo).
--   · auditoria                   → bitácora de cambios: quién, sobre qué, y SOLO los campos
--                                   que cambiaron, antes y después, en JSON. Nunca guarda
--                                   contraseñas, tokens, NIP, CLABE completa ni datos médicos.
--   · citas                       → agenda: admisión, entrevistas con padres, reuniones.
--
-- NO HAY BACKFILL.
--
-- OJO CON logs_sistema: es una tabla de solo-agregar que con los años puede tener millones
-- de filas. ADD COLUMN ... NULL la reconstruye (permite lecturas y escrituras mientras corre,
-- pero tarda y compite por disco). Hazlo fuera de horario de cobro. Puede esperar sin
-- romper nada: sin la columna, registrar_log() anota el id real dentro del detalle.
--
-- SIN ESTA MIGRACIÓN el sistema funciona exactamente como antes: auditar() no escribe nada,
-- la agenda responde "aún no está instalada" y la pantalla de Auditoría lo avisa.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE logs_sistema ADD COLUMN suplantado_por INT UNSIGNED NULL DEFAULT NULL;

CREATE TABLE IF NOT EXISTS auditoria (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  escuela_id      INT UNSIGNED    NULL DEFAULT NULL,
  usuario_id      INT UNSIGNED    NULL DEFAULT NULL,
  suplantado_por  INT UNSIGNED    NULL DEFAULT NULL,
  accion          VARCHAR(40)     NOT NULL,
  entidad         VARCHAR(30)     NOT NULL,
  entidad_id      INT UNSIGNED    NULL DEFAULT NULL,
  antes           TEXT            NULL,
  despues         TEXT            NULL,
  ip              VARCHAR(45)     NULL DEFAULT NULL,
  creado_en       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_aud_escuela_fecha (escuela_id, creado_en),
  KEY idx_aud_entidad (entidad, entidad_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS citas (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  escuela_id      INT UNSIGNED    NOT NULL,
  titulo          VARCHAR(150)    NOT NULL,
  tipo            VARCHAR(12)     NOT NULL DEFAULT 'otro',
  inicio          DATETIME        NOT NULL,
  fin             DATETIME        NOT NULL,
  responsable_id  INT UNSIGNED    NOT NULL,
  familia_id      INT UNSIGNED    NULL DEFAULT NULL,
  cliente_id      INT UNSIGNED    NULL DEFAULT NULL,
  lugar           VARCHAR(150)    NULL DEFAULT NULL,
  notas           TEXT            NULL,
  estado          VARCHAR(12)     NOT NULL DEFAULT 'programada',
  creado_por      INT UNSIGNED    NULL DEFAULT NULL,
  creado_en       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_citas_escuela_inicio (escuela_id, inicio),
  KEY idx_citas_responsable (responsable_id, inicio),
  KEY idx_citas_familia (familia_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
