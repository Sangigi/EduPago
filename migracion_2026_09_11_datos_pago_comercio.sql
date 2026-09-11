-- migracion_2026_09_11_datos_pago_comercio.sql
--
-- Corre esto UNA VEZ en phpMyAdmin.
--
-- Formulario completo de alta de comercio de Cobroscontarjeta.com ("Mi
-- cuenta" -> activar cobros reales): datos del titular, representante
-- legal, datos de la empresa, identificación oficial y datos BANCARIOS
-- (banco, cuenta, CLABE).
--
-- A PROPÓSITO en tabla aparte, NUNCA en `escuelas`: acciones/cargar_datos.php
-- hace SELECT * de escuelas y lo manda tal cual a TODOS los roles del
-- colegio, incluidos cajero y familia. Una CLABE o número de cuenta ahí se
-- filtraría solo a cualquier padre de familia. Esta tabla solo la leen/
-- escriben acciones/escuela_obtener_datos_pago.php y
-- acciones/escuela_guardar_datos_pago.php, restringidas a admin (su propia
-- escuela) y superadmin.
--
-- Sin "IF NOT EXISTS" -- tu servidor de MySQL no lo soporta.

CREATE TABLE escuela_datos_pago (
  escuela_id                 INT UNSIGNED NOT NULL,
  -- Datos generales del titular
  titular_nombre             VARCHAR(200) NULL DEFAULT NULL COMMENT 'Como aparece en el estado de cuenta',
  nombre_comercio             VARCHAR(200) NULL DEFAULT NULL COMMENT 'Nombre de sucursal / nombre comercial',
  titular_correo              VARCHAR(160) NULL DEFAULT NULL,
  giro                        VARCHAR(200) NULL DEFAULT NULL,
  calle_numero                VARCHAR(200) NULL DEFAULT NULL,
  numero_interior             VARCHAR(50)  NULL DEFAULT NULL,
  colonia                     VARCHAR(150) NULL DEFAULT NULL,
  delegacion_municipio        VARCHAR(150) NULL DEFAULT NULL,
  ciudad                      VARCHAR(100) NULL DEFAULT NULL,
  estado_direccion            VARCHAR(100) NULL DEFAULT NULL,
  pais                        VARCHAR(100) NULL DEFAULT 'México',
  telefono_oficina            VARCHAR(20)  NULL DEFAULT NULL,
  telefono_celular            VARCHAR(20)  NULL DEFAULT NULL,
  nombre_vendedor             VARCHAR(150) NULL DEFAULT NULL,
  -- Datos del representante legal (persona física con negocio, o rep. de la empresa)
  rep_legal_nombre            VARCHAR(200) NULL DEFAULT NULL,
  rep_legal_escritura         VARCHAR(200) NULL DEFAULT NULL COMMENT 'Número y fecha de escritura',
  rep_legal_notaria_numero    VARCHAR(50)  NULL DEFAULT NULL,
  rep_legal_notario_nombre    VARCHAR(200) NULL DEFAULT NULL,
  rep_legal_ciudad            VARCHAR(100) NULL DEFAULT NULL,
  -- Datos de la empresa (solo persona moral)
  empresa_escritura           VARCHAR(200) NULL DEFAULT NULL COMMENT 'Número de escritura y fecha',
  empresa_folio_rpc           VARCHAR(100) NULL DEFAULT NULL COMMENT 'Folio del registro público del comercio',
  empresa_ciudad              VARCHAR(100) NULL DEFAULT NULL,
  empresa_notario_nombre      VARCHAR(200) NULL DEFAULT NULL,
  empresa_notaria_numero      VARCHAR(50)  NULL DEFAULT NULL,
  -- Documento de identificación del titular o representante legal
  id_tipo                     VARCHAR(50)  NULL DEFAULT NULL,
  id_numero                   VARCHAR(100) NULL DEFAULT NULL,
  id_fecha_expedicion         DATE NULL DEFAULT NULL,
  id_vigencia                 DATE NULL DEFAULT NULL,
  -- Datos bancarios -- lo más sensible de esta tabla
  banco                       VARCHAR(100) NULL DEFAULT NULL,
  plaza                       VARCHAR(100) NULL DEFAULT NULL,
  sucursal_bancaria           VARCHAR(100) NULL DEFAULT NULL,
  cuenta_cheques               VARCHAR(30)  NULL DEFAULT NULL,
  cuenta_clabe                VARCHAR(18)  NULL DEFAULT NULL,
  -- Aceptación legal
  clausulado_aceptado_en      DATETIME NULL DEFAULT NULL,
  actualizado_en              DATETIME NULL DEFAULT NULL,
  actualizado_por             INT UNSIGNED NULL DEFAULT NULL,
  PRIMARY KEY (escuela_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
