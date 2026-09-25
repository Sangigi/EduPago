-- migracion_2026_09_09_proveedores_gastos.sql
--
-- Corre esto UNA VEZ en phpMyAdmin antes de usar el código que la acompaña.
--
-- Crea el módulo de Proveedores y Gastos (pagos que la escuela hace a sus
-- proveedores) — no existía ninguna tabla para esto. Multi-tenant igual que
-- el resto del sistema (columna escuela_id en ambas tablas). NO se declaran
-- FOREIGN KEY: el esquema existente tampoco las usa para relaciones
-- equivalentes (cobros.cliente_id se valida a mano en crear_cobro.php, no es
-- una FK real) — se sigue esa misma convención aquí. Los índices sí importan:
-- listar_gastos.php filtra/ordena por escuela_id+fecha y por proveedor_id en
-- cada carga de la tabla.

CREATE TABLE proveedores (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  escuela_id        INT UNSIGNED NOT NULL,
  nombre            VARCHAR(150)  NOT NULL,
  categoria         VARCHAR(60)   NOT NULL DEFAULT 'otro',
  rfc               VARCHAR(13)   NULL,
  contacto_nombre   VARCHAR(150)  NULL,
  contacto_telefono VARCHAR(20)   NULL,
  contacto_email    VARCHAR(150)  NULL,
  activo            TINYINT(1)    NOT NULL DEFAULT 1,
  fecha_creacion    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_proveedores_escuela (escuela_id),
  KEY idx_proveedores_escuela_nombre (escuela_id, nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- proveedor_id es NULLABLE a propósito: igual que cobros.cliente_id permite
-- "Cliente general", un gasto de caja chica o un servicio sin proveedor
-- formal registrado debe poder capturarse sin forzar un proveedor ficticio.
--
-- forma_pago usa un enum DISTINTO al de cobros.metodo (Efectivo/EfectivoRef/
-- TC/SPEI/CoDi/Cheque): ese enum describe cómo un cliente le paga a la
-- escuela; aquí describe cómo la escuela le paga a un tercero — son
-- contextos distintos y no tiene sentido reusar, por ejemplo, 'CoDi' o
-- 'EfectivoRef' (referencia bancaria de cobro) para un egreso.
CREATE TABLE gastos (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  escuela_id      INT UNSIGNED NOT NULL,
  proveedor_id    INT UNSIGNED NULL,
  concepto        VARCHAR(200)  NOT NULL,
  monto           DECIMAL(12,2) NOT NULL,
  fecha           DATE          NOT NULL,
  forma_pago      ENUM('Efectivo','Transferencia','Cheque','TarjetaEmpresarial','Otro')
                  NOT NULL DEFAULT 'Transferencia',
  comprobante_url VARCHAR(500)  NULL,
  usuario_id      INT UNSIGNED NULL,
  fecha_creacion  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_gastos_escuela_fecha (escuela_id, fecha),
  KEY idx_gastos_proveedor (proveedor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
