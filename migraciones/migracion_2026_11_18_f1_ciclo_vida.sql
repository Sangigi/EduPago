-- migracion_2026_11_18_f1_ciclo_vida.sql
--
-- [F1] CICLO DE VIDA DEL ALUMNO (18-nov-2026).
--
-- QUÉ HACE
--   Hasta hoy "dar de baja" a un alumno era solo clientes.activo = 0: sin
--   motivo, sin fecha y sin rastro de quién lo hizo ni cuándo. Esto agrega:
--
--   clientes.estatus         → activo | baja_temporal | baja_definitiva |
--                              egresado | traslado
--   clientes.estatus_fecha   → fecha efectiva del último cambio de estatus
--   clientes.estatus_motivo  → por qué (texto libre, obligatorio en bajas)
--   alumno_movimientos       → bitácora del alumno: alta, edición, bajas,
--                              egreso, traslado, reactivación (y lo que usen
--                              otras fases: cambio_grado, reinscripcion,
--                              cambio_grupo).
--
--   INVARIANTE: clientes.activo = 1 si y solo si clientes.estatus = 'activo'.
--   El resto del sistema (cargar_datos, cron, límites del plan, portal de
--   familia) sigue leyendo `activo`; `estatus` solo agrega el detalle. Las dos
--   columnas se escriben SIEMPRE juntas desde alumno_cambiar_estatus()
--   (lib/helpers_alumnos.php).
--
-- ORDEN DE EJECUCIÓN
--   1. Correr ESTE archivo completo en phpMyAdmin.
--   2. Después, git pull del código de la rama est/f1-ciclo-vida.
--   (Si el código llega antes, el toggle de baja/reactivación sigue
--   funcionando —solo escribe `activo`— pero no guarda motivo ni historial.)
--
--   El servidor de producción es MySQL 5.7: NO soporta ADD COLUMN IF NOT
--   EXISTS. Por eso cada columna/índice va en su propia sentencia: si alguna
--   ya existe, MySQL da "Duplicate column name" / "Duplicate key name" y basta
--   con saltarse ESA sentencia y correr las demás.
--
-- BACKFILL: SÍ (paso 3, al final). Los alumnos que hoy están inactivos
--   (activo = 0) quedan como 'baja_temporal' con el motivo
--   'Migración: estaba inactivo', para que la invariante se cumpla desde el
--   primer día. Es idempotente: correrlo dos veces no cambia nada más.

-- ── 1. Columnas nuevas en clientes ──────────────────────────────────────────
ALTER TABLE clientes ADD COLUMN estatus VARCHAR(20) NOT NULL DEFAULT 'activo';

ALTER TABLE clientes ADD COLUMN estatus_fecha DATE NULL;

ALTER TABLE clientes ADD COLUMN estatus_motivo VARCHAR(255) NULL;

-- Para el filtro por estatus de la lista de Alumnos (cargar_datos filtra por
-- escuela + estatus).
ALTER TABLE clientes ADD INDEX idx_clientes_escuela_estatus (escuela_id, estatus);

-- ── 2. Bitácora de movimientos del alumno ───────────────────────────────────
-- Sin FOREIGN KEY (convención del proyecto, ver
-- migracion_2026_09_09_proveedores_gastos.sql): la pertenencia se valida en
-- PHP. escuela_id va repetido aunque se pueda deducir de cliente_id para que
-- cada consulta filtre por escuela directo, sin joins de más.
--
-- `detalle` es JSON en texto (MySQL 5.7 sí tiene tipo JSON, pero el resto del
-- proyecto guarda JSON en TEXT y así se mantiene). En una edición guarda SOLO
-- los NOMBRES de los campos cambiados, nunca los valores (CURP, teléfonos…).
CREATE TABLE IF NOT EXISTS alumno_movimientos (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  escuela_id        INT UNSIGNED NOT NULL,
  cliente_id        INT UNSIGNED NOT NULL,
  tipo              VARCHAR(30)  NOT NULL,
  estatus_anterior  VARCHAR(20)  NULL,
  estatus_nuevo     VARCHAR(20)  NULL,
  motivo            VARCHAR(255) NULL,
  detalle           TEXT         NULL,
  usuario_id        INT UNSIGNED NULL,
  creado_en         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_am_cliente (cliente_id, creado_en),
  KEY idx_am_escuela (escuela_id, creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 3. Backfill ─────────────────────────────────────────────────────────────
-- Alumnos que hoy están dados de baja: no sabemos el motivo real, así que se
-- marcan como baja temporal (la más conservadora: se pueden reactivar o pasar
-- a definitiva desde la pantalla de Alumnos) con un motivo que lo deja claro.
UPDATE clientes
   SET estatus = 'baja_temporal',
       estatus_motivo = 'Migración: estaba inactivo'
 WHERE activo = 0 AND tipo = 'alumno' AND estatus = 'activo';

-- Clientes que NO son alumno (tipo 'general') e inactivos: mismo tratamiento,
-- solo para que la invariante activo=1 <=> estatus='activo' se cumpla en
-- TODA la tabla y ninguna consulta futura por `estatus` los cuente como
-- activos. Para ellos el estatus no se muestra en ninguna pantalla.
UPDATE clientes
   SET estatus = 'baja_temporal',
       estatus_motivo = 'Migración: estaba inactivo'
 WHERE activo = 0 AND (tipo IS NULL OR tipo <> 'alumno') AND estatus = 'activo';

-- Verificación (debe dar 0 filas):
--   SELECT id, activo, estatus FROM clientes
--    WHERE (activo = 1 AND estatus <> 'activo') OR (activo = 0 AND estatus = 'activo');
