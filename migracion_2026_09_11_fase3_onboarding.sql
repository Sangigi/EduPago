-- migracion_2026_09_11_fase3_onboarding.sql
--
-- Corre esto UNA VEZ en phpMyAdmin.
--
-- Tres cosas nuevas de la junta:
--
-- (c) Documentos fiscales del colegio: persona física/moral, razón social,
--     régimen fiscal, código postal fiscal, y un estado agregado de revisión
--     documental. Los documentos EN SÍ (INE, constancia de situación fiscal,
--     comprobante de domicilio) van en tabla aparte (`escuela_documentos`),
--     NO como columnas en `escuelas` -- `cargar_datos.php` hace SELECT * de
--     escuelas y se lo manda tal cual a TODOS los roles del colegio,
--     incluida familia; una columna con la URL de un INE ahí se filtraría
--     sola a cualquier padre de familia.
--
-- (d) Identificador externo que asignará Savala. Se agrega como columna
--     ADICIONAL a `usuarios.email` (no lo reemplaza) -- el login seguirá
--     aceptando cualquiera de los dos.
--
-- Sin "IF NOT EXISTS" -- tu servidor de MySQL no lo soporta. Si alguna
-- columna ya existiera, MySQL marcará "Duplicate column name" en esa línea
-- puntual; borra solo esa línea y corre el resto.

ALTER TABLE escuelas
  ADD COLUMN tipo_persona VARCHAR(10) NULL DEFAULT NULL COMMENT "'fisica' o 'moral'",
  ADD COLUMN razon_social VARCHAR(200) NULL DEFAULT NULL,
  ADD COLUMN regimen_fiscal VARCHAR(10) NULL DEFAULT NULL,
  ADD COLUMN cp_fiscal VARCHAR(5) NULL DEFAULT NULL,
  ADD COLUMN documentacion_estado VARCHAR(20) NOT NULL DEFAULT 'sin_enviar';

CREATE TABLE escuela_documentos (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  escuela_id      INT UNSIGNED NOT NULL,
  tipo            VARCHAR(40) NOT NULL COMMENT 'ine_representante | constancia_situacion_fiscal | comprobante_domicilio | acta_constitutiva | poder_notarial',
  ruta_archivo    VARCHAR(500) NOT NULL,
  nombre_original VARCHAR(255) NULL DEFAULT NULL,
  mime_real       VARCHAR(100) NULL DEFAULT NULL,
  tamano_bytes    INT UNSIGNED NULL DEFAULT NULL,
  estado          VARCHAR(20) NOT NULL DEFAULT 'pendiente' COMMENT 'pendiente | aprobado | rechazado',
  motivo_rechazo  VARCHAR(300) NULL DEFAULT NULL,
  subido_por      INT UNSIGNED NULL DEFAULT NULL,
  subido_en       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revisado_por    INT UNSIGNED NULL DEFAULT NULL,
  revisado_en     DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_escdoc_escuela (escuela_id),
  KEY idx_escdoc_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE usuarios
  ADD COLUMN id_externo VARCHAR(32) NULL DEFAULT NULL;

ALTER TABLE usuarios
  ADD UNIQUE KEY uq_usuarios_id_externo (id_externo);
