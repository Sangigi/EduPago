-- ════════════════════════════════════════════════════════════════════════
-- migracion_2026_11_18_f6_monedero.sql
--
-- FASE F6 — MONEDERO VIRTUAL DEL ALUMNO PARA LA TIENDITA / CAFETERÍA.
--
-- QUÉ HACE
--   · monederos            → saldo CACHEADO por alumno (una fila por clientes.id).
--   · monedero_movimientos → LIBRO MAYOR inmutable: un renglón por cada
--                            recarga, consumo, ajuste o reverso. Es la fuente
--                            de verdad; monederos.saldo se recalcula desde aquí
--                            en cada escritura (mismo patrón que
--                            cobros.monto_pagado ← cobro_abonos).
--   · tienda_productos     → catálogo de la tiendita (precio de venta).
--   · tienda_ventas        → una fila por venta en la tiendita (consumo).
--   · tienda_venta_items   → renglones de cada venta (snapshot de nombre/precio).
--   · cobros.es_recarga_monedero → marca los cobros que son RECARGAS del
--                            monedero. Esos cobros NO son adeudo de la familia:
--                            no suman a clientes.saldo_pendiente, no reciben
--                            depósitos SPEI repartidos, no generan recargos ni
--                            recordatorios (ver lib/helpers_pagos.php y
--                            cron_recordatorios.php, bloques [F6]).
--
-- INVARIANTES DE DINERO (las sostiene lib/helpers_monedero.php)
--   1. monederos.saldo = SUM(signo * monto) de monedero_movimientos del alumno.
--   2. El saldo NUNCA es negativo.
--   3. monto siempre > 0; la dirección la da `signo` (+1 entra, -1 sale).
--   4. Cada movimiento tiene idem_key ÚNICA: 'recarga:<cobro_id>',
--      'consumo:<venta_id>', 'reverso:<venta_id>', 'anula_recarga:<cobro_id>',
--      'ajuste:e<escuela>:<llave>'. Reintentos no duplican dinero.
--
-- ORDEN DE EJECUCIÓN
--   Correr UNA VEZ en phpMyAdmin ANTES de subir el código de la fase F6
--   (lib/helpers_monedero.php, acciones/monedero_*.php, acciones/tienda_*.php,
--   views/Tienda.js, views/Monedero.js, views/MonederoFamilia.js).
--   El código nuevo tolera que la migración aún no exista (responde "falta
--   correr la migración" en vez de tronar), pero el monedero no funciona
--   hasta correrla.
--
--   Los CREATE TABLE son idempotentes (IF NOT EXISTS). El ALTER TABLE de
--   cobros NO lo es: este MySQL (5.7) no soporta ADD COLUMN IF NOT EXISTS.
--   Si falla con "Duplicate column name 'es_recarga_monedero'", esa parte ya
--   se corrió: sáltala y corre el resto (el índice también puede fallar con
--   "Duplicate key name": sáltalo igual).
--
-- BACKFILL: no hay. Ningún cobro existente es recarga (DEFAULT 0 deja la BD
--   consistente sin tocar filas viejas) y los monederos nacen vacíos.
--
-- Sin FOREIGN KEY (convención del proyecto): la pertenencia se valida en PHP.
-- ════════════════════════════════════════════════════════════════════════

-- 1. Saldo cacheado por alumno. cliente_id = clientes.id (el mismo id que ya
--    viaja a los proveedores de pago; nunca se crea un renglón de clientes
--    nuevo para el monedero).
CREATE TABLE IF NOT EXISTS monederos (
  cliente_id          INT UNSIGNED  NOT NULL,
  escuela_id          INT UNSIGNED  NOT NULL,
  saldo               DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  -- Tope de consumo por día en la tiendita. NULL = sin límite.
  limite_diario       DECIMAL(12,2) NULL DEFAULT NULL,
  -- NIP de 4 dígitos guardado con password_hash(). NULL = no pide NIP.
  nip_hash            VARCHAR(255)  NULL DEFAULT NULL,
  -- Intentos fallidos seguidos de NIP; al 5º se bloquea el NIP 15 minutos
  -- (un NIP de 4 dígitos se adivina en 10,000 intentos sin este freno).
  nip_intentos        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  nip_bloqueado_hasta DATETIME      NULL DEFAULT NULL,
  -- La familia puede congelar el monedero (credencial perdida, castigo, etc.).
  bloqueado           TINYINT(1)    NOT NULL DEFAULT 0,
  creado_en           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (cliente_id),
  KEY idx_monederos_escuela (escuela_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Libro mayor inmutable (nunca se hace UPDATE ni DELETE sobre él).
CREATE TABLE IF NOT EXISTS monedero_movimientos (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  escuela_id      INT UNSIGNED  NOT NULL,
  cliente_id      INT UNSIGNED  NOT NULL,
  -- recarga | consumo | ajuste | reverso
  tipo            VARCHAR(10)   NOT NULL,
  -- +1 suma al saldo, -1 resta. recarga/reverso = +1, consumo = -1,
  -- ajuste = +1 o -1 según lo que capture el admin.
  signo           TINYINT       NOT NULL DEFAULT 1,
  -- SIEMPRE positivo; la dirección la da `signo`.
  monto           DECIMAL(12,2) NOT NULL,
  -- Saldo del monedero inmediatamente después de este movimiento.
  saldo_despues   DECIMAL(12,2) NOT NULL,
  cobro_id        INT UNSIGNED  NULL DEFAULT NULL,
  venta_id        INT UNSIGNED  NULL DEFAULT NULL,
  -- Llave determinística del movimiento (ver cabecera). UNIQUE: un reintento
  -- choca aquí y no mueve dinero dos veces.
  idem_key        VARCHAR(80)   NOT NULL,
  -- Llave que manda el navegador para operaciones capturadas a mano (recarga
  -- en caja). Evita que un doble clic o un reintento tras un timeout registre
  -- dos recargas. NULL cuando no aplica (varios NULL no chocan en UNIQUE).
  solicitud_key   VARCHAR(80)   NULL DEFAULT NULL,
  descripcion     VARCHAR(255)  NULL DEFAULT NULL,
  usuario_id      INT UNSIGNED  NULL DEFAULT NULL,
  creado_en       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mm_idem (idem_key),
  UNIQUE KEY uq_mm_solicitud (solicitud_key),
  KEY idx_mm_cliente (cliente_id, id),
  KEY idx_mm_escuela_fecha (escuela_id, creado_en),
  KEY idx_mm_cobro (cobro_id),
  KEY idx_mm_venta (venta_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Catálogo de la tiendita.
CREATE TABLE IF NOT EXISTS tienda_productos (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  escuela_id  INT UNSIGNED  NOT NULL,
  nombre      VARCHAR(80)   NOT NULL,
  precio      DECIMAL(10,2) NOT NULL,
  activo      TINYINT(1)    NOT NULL DEFAULT 1,
  creado_en   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tp_escuela (escuela_id, activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Ventas de la tiendita (cada una genera un movimiento 'consumo').
CREATE TABLE IF NOT EXISTS tienda_ventas (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  escuela_id    INT UNSIGNED  NOT NULL,
  cliente_id    INT UNSIGNED  NOT NULL,
  total         DECIMAL(12,2) NOT NULL,
  -- Vendedor (usuarios.id, rol 'tienda' o admin).
  usuario_id    INT UNSIGNED  NOT NULL,
  -- completada | cancelada
  estado        VARCHAR(12)   NOT NULL DEFAULT 'completada',
  -- Llave que genera el punto de venta para cada intento de cobro, guardada
  -- como 'e<escuela_id>:<llave>'. Un reintento devuelve la venta ya hecha.
  idem_key      VARCHAR(80)   NOT NULL,
  creado_en     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelada_en  DATETIME      NULL DEFAULT NULL,
  cancelada_por INT UNSIGNED  NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tv_idem (idem_key),
  KEY idx_tv_escuela_fecha (escuela_id, creado_en),
  KEY idx_tv_cliente_fecha (cliente_id, creado_en),
  KEY idx_tv_usuario_fecha (usuario_id, creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Renglones de cada venta (snapshot: si el producto cambia de precio
--    después, el historial no cambia). producto_id NULL = monto libre.
CREATE TABLE IF NOT EXISTS tienda_venta_items (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  venta_id        INT UNSIGNED  NOT NULL,
  producto_id     INT UNSIGNED  NULL DEFAULT NULL,
  nombre          VARCHAR(80)   NOT NULL,
  cantidad        INT UNSIGNED  NOT NULL DEFAULT 1,
  precio_unitario DECIMAL(10,2) NOT NULL,
  subtotal        DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_tvi_venta (venta_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Marca de recarga en cobros. (NO idempotente: si ya existe, sáltala.)
ALTER TABLE cobros ADD COLUMN es_recarga_monedero TINYINT(1) NOT NULL DEFAULT 0;

-- 7. Índice para el barrido de acreditación (monedero_acreditar_recargas) y
--    para la cancelación automática de recargas viejas en el cron.
--    (Si falla con "Duplicate key name", ya existe: sáltalo.)
ALTER TABLE cobros ADD INDEX idx_cobros_recarga_monedero (es_recarga_monedero, estado, cliente_id);
