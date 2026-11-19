-- ════════════════════════════════════════════════════════════════════════
-- migracion_2026_11_18_f3_control_escolar.sql
--
-- F3 — COMPLETAR CONTROL ESCOLAR (catálogo de grados, publicación de
-- periodos, cierre de ciclo, historial académico y promoción).
--
-- Requiere que ya esté corrida migracion_2026_11_13_control_escolar.sql
-- (crea ciclos_escolares, periodos_evaluacion, grupos, asistencias,
-- calificaciones…). Corre esta DESPUÉS de esa y ANTES de subir el código de
-- la rama est/f3-control-escolar: lib/helpers_escolar.php avisa con un
-- mensaje claro si faltan estas columnas, pero mientras no se corra el módulo
-- escolar completo queda detenido (docentes y familias incluidos).
--
-- QUÉ HACE
--   1. niveles_grados       → catálogo de grados por escuela ("3° Primaria"),
--                             con orden y `siguiente_id` (a qué grado se
--                             promueve). clientes.grado era texto libre y no
--                             servía para promover ni para filtrar cobros.
--   2. historial_academico  → foto del cierre de cada ciclo por alumno
--                             (promedio final, resultado, materias). Es lo que
--                             lee el kárdex y lo que decide la promoción.
--   3. clientes.grado_id    → grado del alumno en el catálogo. NO sustituye a
--                             clientes.grado (texto): se llena con el
--                             asistente de mapeo de Control escolar.
--   4. grupos.grado_id      → grado del catálogo que cursa el grupo.
--   5. periodos_evaluacion.publicado → las familias/alumnos solo ven
--                             calificaciones de periodos publicados.
--   6. ciclos_escolares.cerrado / cerrado_en → ciclo cerrado = ya no se
--                             capturan calificaciones ni asistencias.
--   7. Índices que faltaban: asistencias(grupo_id, fecha) y
--      calificaciones(periodo_id).
--
-- CÓMO CORRERLA: pegar en phpMyAdmin y ejecutar UNA SOLA VEZ, completa, en
-- el orden en que viene.
--
-- Este MySQL (5.7) no soporta ADD COLUMN IF NOT EXISTS: cada ALTER va en su
-- propia sentencia para que, si alguno ya existe ("Duplicate column name" o
-- "Duplicate key name"), se pueda saltar ESE y seguir con los demás.
--
-- >>> BACKFILL — CUIDADO CON EL PASO 5b. <<<
-- `UPDATE periodos_evaluacion SET publicado = 1` marca como publicados TODOS
-- los periodos que ya existen, porque hasta hoy las familias veían todo y no
-- queremos esconderles de golpe lo que ya conocían. Corre ese UPDATE SOLO
-- inmediatamente después del ALTER 5a. Si el ALTER 5a falla con "Duplicate
-- column name 'publicado'", la migración YA SE HABÍA CORRIDO: NO corras el
-- UPDATE, porque volvería a publicar periodos que el colegio ocultó a
-- propósito. Los periodos que se creen después nacen NO publicados.
--
-- Convenciones (las mismas de migracion_2026_11_13_control_escolar.sql):
-- multi-tenant por escuela_id en todas las tablas y sin FOREIGN KEY: la
-- pertenencia se valida en PHP (lib/helpers_escolar.php).
-- ════════════════════════════════════════════════════════════════════════

-- 1. Catálogo de grados por escuela.
CREATE TABLE IF NOT EXISTS niveles_grados (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  escuela_id      INT UNSIGNED NOT NULL,
  -- 'Preescolar' | 'Primaria' | 'Secundaria' | 'Preparatoria' | libre
  nivel           VARCHAR(30)  NOT NULL,
  -- '1', '2', '3'… o texto libre ('Maternal').
  grado           VARCHAR(20)  NOT NULL,
  -- Lo que se muestra: '3° Primaria'.
  nombre_corto    VARCHAR(40)  NOT NULL,
  -- Orden global en la escuela (Preescolar 1 antes que Primaria 1…).
  orden           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  -- Grado al que se promueve un alumno aprobado. NULL = último grado que
  -- ofrece la escuela: el alumno egresa.
  siguiente_id    INT UNSIGNED NULL,
  activo          TINYINT(1)   NOT NULL DEFAULT 1,
  fecha_creacion  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- Un mismo grado no se repite por escuela; además hace idempotente la
  -- carga del catálogo estándar (escolar_cargar_catalogo_grados.php).
  UNIQUE KEY uq_ng_escuela_nivel_grado (escuela_id, nivel, grado),
  KEY idx_ng_escuela_orden (escuela_id, orden)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Historial académico: una fila por alumno y ciclo cerrado.
CREATE TABLE IF NOT EXISTS historial_academico (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  escuela_id      INT UNSIGNED NOT NULL,
  cliente_id      INT UNSIGNED NOT NULL,
  ciclo_id        INT UNSIGNED NOT NULL,
  -- Grado que cursó en ese ciclo (el del grupo; si el grupo no lo tenía, el
  -- del alumno al momento del cierre).
  grado_id        INT UNSIGNED NULL,
  -- Copia del nombre del grado y del grupo al momento del cierre: si después
  -- se renombran, el kárdex sigue diciendo lo que decía la boleta.
  grado_nombre    VARCHAR(40)  NULL,
  grupo_id        INT UNSIGNED NULL,
  grupo_nombre    VARCHAR(60)  NULL,
  promedio_final  DECIMAL(5,2) NULL,
  -- 'aprobado' | 'reprobado' | 'sin_calificar'
  resultado       VARCHAR(20)  NOT NULL DEFAULT 'sin_calificar',
  materias_reprobadas TINYINT UNSIGNED NOT NULL DEFAULT 0,
  -- JSON: [{"materia_id":1,"nombre":"Matemáticas","final":8.5}, …]
  materias        TEXT NULL,
  -- Promoción/reinscripción (escolar_promover.php). Mientras sea NULL el
  -- alumno no se ha procesado; una vez lleno, volver a correr la promoción
  -- lo salta: así nunca se le sube de grado dos veces.
  promovido_a_ciclo_id INT UNSIGNED NULL,
  -- 'promovido' | 'repite' | 'egresado'
  promocion_accion VARCHAR(20) NULL,
  promovido_en    DATETIME NULL,
  usuario_id      INT UNSIGNED NULL,
  creado_en       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- Re-cerrar un ciclo actualiza la fila (upsert), no la duplica.
  UNIQUE KEY uq_historial_cliente_ciclo (cliente_id, ciclo_id),
  KEY idx_historial_escuela_ciclo (escuela_id, ciclo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Grado del alumno en el catálogo (el texto clientes.grado se conserva).
ALTER TABLE clientes ADD COLUMN grado_id INT UNSIGNED NULL;
ALTER TABLE clientes ADD INDEX idx_clientes_grado (escuela_id, grado_id);

-- 4. Grado del catálogo que cursa cada grupo.
ALTER TABLE grupos ADD COLUMN grado_id INT UNSIGNED NULL;
ALTER TABLE grupos ADD INDEX idx_grupos_grado (grado_id);

-- 5a. Publicación de periodos (ver la advertencia de BACKFILL arriba).
ALTER TABLE periodos_evaluacion ADD COLUMN publicado TINYINT(1) NOT NULL DEFAULT 0;
-- 5b. BACKFILL: lo que ya existía queda publicado (las familias ya lo veían).
UPDATE periodos_evaluacion SET publicado = 1;

-- 6. Cierre de ciclo.
ALTER TABLE ciclos_escolares ADD COLUMN cerrado TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE ciclos_escolares ADD COLUMN cerrado_en DATETIME NULL;

-- 7. Índices faltantes. El reporte de asistencia y el pase de lista filtran
--    por grupo + fecha (el UNIQUE uq_asistencia es grupo, cliente, fecha y no
--    sirve para rangos de fecha); guardar un ciclo cuenta calificaciones por
--    periodo_id antes de borrar un periodo.
ALTER TABLE asistencias ADD INDEX idx_asis_grupo_fecha (grupo_id, fecha);
ALTER TABLE calificaciones ADD INDEX idx_calif_periodo (periodo_id);
