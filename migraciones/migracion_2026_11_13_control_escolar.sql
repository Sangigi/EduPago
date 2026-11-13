-- migracion_2026_11_13_control_escolar.sql
--
-- Corre esto UNA VEZ en phpMyAdmin antes de subir el código que la acompaña
-- (lib/helpers_escolar.php, acciones/escolar_*.php, views/ControlEscolar.js,
-- views/PortalDocente.js, views/components/EscolarFamilia.js).
--
-- MÓDULO DE CONTROL ESCOLAR. Hasta hoy el sistema solo conocía al alumno como
-- sujeto de cobro (tabla `clientes`, con `grado` como texto libre). Esto agrega
-- la parte académica sin tocar nada de cobros:
--
--   ciclos_escolares     → "2026-2027", con su escala de calificación
--   periodos_evaluacion  → bimestres/trimestres/parciales de cada ciclo
--   aulas                → salones físicos (para horarios y choques)
--   materias             → catálogo de asignaturas de la escuela
--   grupos               → "3° A Primaria" de un ciclo, con tutor y aula
--   grupo_alumnos        → inscripción del alumno (clientes.id) al grupo
--   grupo_materias       → qué materia lleva el grupo y qué docente la imparte
--   horarios             → bloques semanales de cada grupo_materia
--   asistencias          → pase de lista diario por grupo
--   calificaciones       → nota por alumno × grupo_materia × periodo
--
-- Convenciones del proyecto que se respetan:
--   · Multi-tenant por escuela_id en TODAS las tablas (aunque se pueda deducir
--     por join): cada acción filtra por escuela_id directo, sin joins de más.
--   · Sin FOREIGN KEY (ver migracion_2026_09_09_proveedores_gastos.sql): la
--     pertenencia se valida en PHP (lib/helpers_escolar.php).
--   · Los docentes son filas de `usuarios` con rol = 'docente'. usuarios.rol es
--     VARCHAR desde migracion_2026_09_11_rol_contador.sql, así que el rol
--     nuevo NO necesita ALTER.
--
-- Es idempotente para las tablas (CREATE TABLE IF NOT EXISTS). Correrla dos
-- veces no hace daño.

CREATE TABLE IF NOT EXISTS ciclos_escolares (
  id                      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  escuela_id              INT UNSIGNED NOT NULL,
  nombre                  VARCHAR(60)  NOT NULL,
  fecha_inicio            DATE         NOT NULL,
  fecha_fin               DATE         NOT NULL,
  -- Escala de la SEP por defecto (5 a 10, aprueba con 6). Configurable para
  -- universidades (0-100) o escalas propias.
  escala_min              DECIMAL(5,2) NOT NULL DEFAULT 5.00,
  escala_max              DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  calif_aprobatoria       DECIMAL(5,2) NOT NULL DEFAULT 6.00,
  -- Solo uno "actual" por escuela; lo garantiza escolar_guardar_ciclo.php.
  actual                  TINYINT(1)   NOT NULL DEFAULT 0,
  fecha_creacion          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ciclos_escuela (escuela_id, actual)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS periodos_evaluacion (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  escuela_id      INT UNSIGNED NOT NULL,
  ciclo_id        INT UNSIGNED NOT NULL,
  nombre          VARCHAR(60)  NOT NULL,
  orden           TINYINT UNSIGNED NOT NULL DEFAULT 1,
  fecha_inicio    DATE NULL,
  fecha_fin       DATE NULL,
  -- Periodo cerrado: el docente ya no puede modificar calificaciones; solo el
  -- admin (que es quien lo cierra y lo puede reabrir).
  cerrado         TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_periodos_ciclo (ciclo_id, orden),
  KEY idx_periodos_escuela (escuela_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS aulas (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  escuela_id      INT UNSIGNED NOT NULL,
  nombre          VARCHAR(80)  NOT NULL,
  capacidad       SMALLINT UNSIGNED NULL,
  ubicacion       VARCHAR(150) NULL,
  activo          TINYINT(1)   NOT NULL DEFAULT 1,
  fecha_creacion  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_aulas_escuela (escuela_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS materias (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  escuela_id      INT UNSIGNED NOT NULL,
  nombre          VARCHAR(120) NOT NULL,
  clave           VARCHAR(30)  NULL,
  nivel           VARCHAR(30)  NULL,
  horas_semana    TINYINT UNSIGNED NULL,
  activo          TINYINT(1)   NOT NULL DEFAULT 1,
  fecha_creacion  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_materias_escuela (escuela_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS grupos (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  escuela_id      INT UNSIGNED NOT NULL,
  ciclo_id        INT UNSIGNED NOT NULL,
  nombre          VARCHAR(60)  NOT NULL,
  nivel           VARCHAR(30)  NULL,
  grado           VARCHAR(20)  NULL,
  turno           VARCHAR(20)  NULL,
  aula_id         INT UNSIGNED NULL,
  -- Docente titular / tutor del grupo (usuarios.id con rol 'docente'). Es
  -- quien pasa lista; las calificaciones son de cada docente de materia.
  tutor_id        INT UNSIGNED NULL,
  cupo            SMALLINT UNSIGNED NULL,
  activo          TINYINT(1)   NOT NULL DEFAULT 1,
  fecha_creacion  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_grupos_escuela_ciclo (escuela_id, ciclo_id),
  KEY idx_grupos_tutor (tutor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS grupo_alumnos (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  escuela_id      INT UNSIGNED NOT NULL,
  grupo_id        INT UNSIGNED NOT NULL,
  cliente_id      INT UNSIGNED NOT NULL,
  fecha_alta      DATE         NOT NULL,
  -- Baja lógica: las asistencias y calificaciones históricas del alumno en
  -- este grupo se conservan aunque se cambie de grupo o se dé de baja.
  activo          TINYINT(1)   NOT NULL DEFAULT 1,
  fecha_baja      DATE NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_grupo_alumno (grupo_id, cliente_id),
  KEY idx_ga_cliente (cliente_id, activo),
  KEY idx_ga_escuela (escuela_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS grupo_materias (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  escuela_id      INT UNSIGNED NOT NULL,
  grupo_id        INT UNSIGNED NOT NULL,
  materia_id      INT UNSIGNED NOT NULL,
  docente_id      INT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_grupo_materia (grupo_id, materia_id),
  KEY idx_gm_docente (docente_id),
  KEY idx_gm_escuela (escuela_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS horarios (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  escuela_id        INT UNSIGNED NOT NULL,
  grupo_materia_id  INT UNSIGNED NOT NULL,
  dia_semana        TINYINT UNSIGNED NOT NULL COMMENT '1=lunes … 6=sábado',
  hora_inicio       TIME NOT NULL,
  hora_fin          TIME NOT NULL,
  aula_id           INT UNSIGNED NULL COMMENT 'NULL = el aula del grupo',
  PRIMARY KEY (id),
  KEY idx_horarios_gm (grupo_materia_id),
  KEY idx_horarios_escuela_dia (escuela_id, dia_semana)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS asistencias (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  escuela_id      INT UNSIGNED NOT NULL,
  grupo_id        INT UNSIGNED NOT NULL,
  cliente_id      INT UNSIGNED NOT NULL,
  fecha           DATE NOT NULL,
  estado          ENUM('presente','falta','retardo','justificada') NOT NULL DEFAULT 'presente',
  observacion     VARCHAR(255) NULL,
  usuario_id      INT UNSIGNED NULL,
  fecha_registro  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_asistencia (grupo_id, cliente_id, fecha),
  KEY idx_asis_cliente_fecha (cliente_id, fecha),
  KEY idx_asis_escuela_fecha (escuela_id, fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS calificaciones (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  escuela_id          INT UNSIGNED NOT NULL,
  grupo_materia_id    INT UNSIGNED NOT NULL,
  cliente_id          INT UNSIGNED NOT NULL,
  periodo_id          INT UNSIGNED NOT NULL,
  calificacion        DECIMAL(5,2) NULL,
  observacion         VARCHAR(255) NULL,
  usuario_id          INT UNSIGNED NULL,
  fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_calificacion (grupo_materia_id, cliente_id, periodo_id),
  KEY idx_calif_cliente (cliente_id),
  KEY idx_calif_escuela (escuela_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
