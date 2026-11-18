-- migracion_2026_11_18_f2_expediente.sql
--
-- FASE F2 — EXPEDIENTE DEL ALUMNO, TUTORES Y DOCUMENTOS PRIVADOS.
--
-- QUÉ HACE
--   1. Agrega a `clientes` (= alumnos) los datos de expediente que hoy no
--      existen: sexo, nacionalidad, lugar de nacimiento, escuela de
--      procedencia, padecimientos, medicamentos, seguro médico, observaciones
--      y la aceptación del aviso de privacidad (cuándo y qué usuario).
--   2. Crea `alumno_tutores`: varios tutores por alumno (mamá, papá, abuela…)
--      con banderas de contacto de emergencia, autorizado para recoger,
--      responsable de pago y si vive con el alumno. Hasta hoy solo había UN
--      contacto por FAMILIA (familias.contacto/email/telefono) y un texto libre
--      clientes.contacto_emergencia.
--   3. Crea `alumno_documentos`: acta, CURP, certificado, boleta anterior,
--      cartilla, comprobante de domicilio, INE del tutor, fotografía, otro.
--      El archivo vive en uploads_privados/escuela_<id>/alumnos/<cliente_id>/
--      (carpeta con "Require all denied") y solo se sirve por
--      acciones/alumno_documento_descargar.php con sesión y validación de escuela.
--
-- ORDEN DE EJECUCIÓN
--   Corre la PARTE 1 completa en phpMyAdmin ANTES de subir el código de la
--   fase (lib/helpers_expediente.php, acciones/alumno_*.php,
--   views/components/ExpedienteAlumno.js). Si el código llega antes, las
--   acciones nuevas responden "falta correr migracion_2026_11_18_f2_expediente.sql"
--   en vez de tronar; nada de lo que ya existe cambia de comportamiento.
--
--   Cada ALTER TABLE va en su propia sentencia A PROPÓSITO: el MySQL 5.7 de
--   producción no soporta ADD COLUMN IF NOT EXISTS. Si alguna columna ya
--   existe, phpMyAdmin marca "Duplicate column name" en ESA sentencia: sáltala
--   y corre las siguientes. Los CREATE TABLE son idempotentes.
--
-- BACKFILL
--   La PARTE 2 (al final) es OPCIONAL y viene COMENTADA: crea un tutor por
--   alumno a partir del contacto de su familia. No corre si pegas el archivo
--   entero; para usarla, copia solo ese bloque sin los /* */. Es idempotente
--   (WHERE NOT EXISTS): correrla dos veces no duplica tutores.
--
-- Convenciones respetadas: escuela_id en todas las tablas, sin FOREIGN KEY
-- (la pertenencia se valida en PHP, ver lib/helpers_expediente.php),
-- InnoDB + utf8mb4.

-- ════════════════════════════════════════════════════════════════════════
-- PARTE 1 — Estructura (obligatoria)
-- ════════════════════════════════════════════════════════════════════════

-- 'H' | 'M' | 'X' (mismos valores que usa la CURP desde 2023). Se valida en
-- PHP y no con ENUM para poder ampliar sin otra migración.
ALTER TABLE clientes ADD COLUMN sexo VARCHAR(1) NULL DEFAULT NULL;
ALTER TABLE clientes ADD COLUMN nacionalidad VARCHAR(60) NULL DEFAULT NULL;
ALTER TABLE clientes ADD COLUMN lugar_nacimiento VARCHAR(120) NULL DEFAULT NULL;
ALTER TABLE clientes ADD COLUMN escuela_procedencia VARCHAR(150) NULL DEFAULT NULL;
-- Datos médicos: NO viajan en cargar_datos (se quitan ahí mismo); solo se
-- leen bajo demanda con alumno_expediente_obtener.
ALTER TABLE clientes ADD COLUMN padecimientos VARCHAR(500) NULL DEFAULT NULL;
ALTER TABLE clientes ADD COLUMN medicamentos VARCHAR(500) NULL DEFAULT NULL;
ALTER TABLE clientes ADD COLUMN seguro_medico VARCHAR(150) NULL DEFAULT NULL;
ALTER TABLE clientes ADD COLUMN observaciones TEXT NULL;
-- Aceptación del aviso de privacidad por parte de la familia (portal). Se
-- guarda la PRIMERA aceptación y no se sobrescribe (evidencia).
ALTER TABLE clientes ADD COLUMN aviso_privacidad_aceptado_en DATETIME NULL DEFAULT NULL;
ALTER TABLE clientes ADD COLUMN aviso_privacidad_aceptado_por INT NULL DEFAULT NULL;

CREATE TABLE IF NOT EXISTS alumno_tutores (
  id                      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  escuela_id              INT UNSIGNED NOT NULL,
  -- clientes.id del alumno. Un mismo adulto con dos hijos aparece dos veces
  -- (una por alumno): las banderas (recoger, emergencia, paga) son por alumno.
  cliente_id              INT UNSIGNED NOT NULL,
  nombre                  VARCHAR(150) NOT NULL,
  -- madre|padre|tutor|abuela|abuelo|tia|tio|hermana|hermano|madrastra|padrastro|otro
  -- (lista blanca en lib/helpers_expediente.php).
  parentesco              VARCHAR(20)  NULL DEFAULT NULL,
  email                   VARCHAR(150) NULL DEFAULT NULL,
  telefono                VARCHAR(25)  NULL DEFAULT NULL,
  telefono_alt            VARCHAR(25)  NULL DEFAULT NULL,
  es_contacto_emergencia  TINYINT(1)   NOT NULL DEFAULT 0,
  autorizado_recoger      TINYINT(1)   NOT NULL DEFAULT 0,
  responsable_pago        TINYINT(1)   NOT NULL DEFAULT 0,
  vive_con_alumno         TINYINT(1)   NOT NULL DEFAULT 0,
  -- Cuenta de portal (usuarios.id, rol 'familia') de este tutor, si tiene.
  -- Opcional; alumno_tutor_guardar valida que sea de la MISMA familia.
  usuario_id              INT UNSIGNED NULL DEFAULT NULL,
  notas                   VARCHAR(500) NULL DEFAULT NULL,
  -- Baja lógica: un tutor "eliminado" queda con activo = 0 para conservar el
  -- historial de quién estuvo autorizado a recoger al alumno y cuándo.
  activo                  TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en          DATETIME     NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_alumtut_escuela (escuela_id),
  KEY idx_alumtut_cliente (cliente_id, activo),
  KEY idx_alumtut_usuario (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS alumno_documentos (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  escuela_id       INT UNSIGNED NOT NULL,
  cliente_id       INT UNSIGNED NOT NULL,
  -- acta_nacimiento|curp|certificado_anterior|boleta_anterior|
  -- cartilla_vacunacion|comprobante_domicilio|identificacion_tutor|fotografia|otro
  tipo             VARCHAR(40)  NOT NULL,
  -- Relativa a UPLOADS_PRIVADOS_DIR_ABS. NUNCA se manda al navegador: la
  -- descarga recibe el id del documento, no la ruta.
  ruta_archivo     VARCHAR(255) NOT NULL,
  nombre_original  VARCHAR(255) NULL DEFAULT NULL,
  -- MIME leído de los bytes (finfo), no el que manda el navegador.
  mime_real        VARCHAR(100) NULL DEFAULT NULL,
  tamano_bytes     INT UNSIGNED NULL DEFAULT NULL,
  subido_por       INT UNSIGNED NULL DEFAULT NULL,
  subido_en        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_alumdoc_escuela (escuela_id),
  KEY idx_alumdoc_cliente (cliente_id, tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ════════════════════════════════════════════════════════════════════════
-- PARTE 2 — Backfill OPCIONAL (comentado a propósito)
-- ════════════════════════════════════════════════════════════════════════
--
-- Crea UN tutor por alumno con el contacto de su familia
-- (familias.contacto / email / telefono), marcado como responsable de pago,
-- porque esa es justo la persona a la que hoy se le cobra. No lo marca como
-- autorizado para recoger ni como contacto de emergencia: eso no se sabe y
-- es mejor que el colegio lo confirme a mano que inventarlo.
--
-- Solo toma alumnos con familia de la MISMA escuela y con contacto capturado,
-- y solo si el alumno todavía no tiene NINGÚN tutor (activo o no): así no
-- duplica si se corre dos veces ni pisa lo que el colegio ya capturó.
--
-- Para correrlo: copia desde INSERT hasta el punto y coma (sin las líneas
-- /* y */) y ejecútalo aparte en phpMyAdmin, DESPUÉS de la PARTE 1.
/*
INSERT INTO alumno_tutores
    (escuela_id, cliente_id, nombre, parentesco, email, telefono,
     es_contacto_emergencia, autorizado_recoger, responsable_pago, vive_con_alumno,
     notas, activo, creado_en)
SELECT c.escuela_id, c.id, LEFT(TRIM(f.contacto), 150), 'tutor',
       NULLIF(LEFT(TRIM(f.email), 150), ''), NULLIF(LEFT(TRIM(f.telefono), 25), ''),
       0, 0, 1, 0,
       'Creado automáticamente desde el contacto de la familia (migración F2).', 1, NOW()
FROM clientes c
JOIN familias f ON f.id = c.familia_id AND f.escuela_id = c.escuela_id
WHERE c.tipo = 'alumno'
  AND f.contacto IS NOT NULL AND TRIM(f.contacto) <> ''
  AND NOT EXISTS (SELECT 1 FROM alumno_tutores t WHERE t.cliente_id = c.id);
*/
