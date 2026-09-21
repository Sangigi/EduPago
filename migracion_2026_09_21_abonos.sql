-- ════════════════════════════════════════════════════════════════════════
-- migracion_2026_09_21_abonos.sql
--
-- PAGOS PARCIALES (ABONOS)
--
-- Hasta hoy `cobros` era binario: o se pagaba el total exacto, o no se pagaba.
-- Si una familia debía $10.00 y transfería $8.00, el webhook rechazaba el
-- depósito con "Monto inválido" y el dinero quedaba en el limbo (ver
-- migracion_2026_09_21_pagos_no_aplicados.sql, que es de hoy mismo y nació
-- justo de ese caso real: alumno 2184, esperado $10.00, recibido $8.00).
-- El único arreglo disponible era que el colegio partiera el cobro a mano en
-- dos — que es lo que el propio Portal de Familia sugiere hoy en
-- views/PortalFamilia.js:596.
--
-- Con esto, un cobro puede recibir varios abonos hasta cubrirse.
--
-- MODELO: `cobro_abonos` es la FUENTE DE VERDAD (un renglón por cada pago
-- recibido). `cobros.monto_pagado` es una columna cacheada que se recalcula
-- desde esa tabla — exactamente el mismo patrón que ya usa
-- `clientes.saldo_pendiente` (ver recalcular_saldo_pendiente en
-- lib/helpers_pagos.php), para no tener que reescribir todas las consultas
-- del sistema con un JOIN.
--
-- INVARIANTE: estado='pagado' <=> monto_pagado >= total.
--
-- Cómo correrla: pegar en phpMyAdmin y ejecutar. Si el ALTER TABLE falla con
-- "Duplicate column name 'monto_pagado'", esa línea ya se había corrido:
-- bórrala y ejecuta el resto. (Este MySQL no soporta ADD COLUMN IF NOT EXISTS.)
-- ════════════════════════════════════════════════════════════════════════

-- 1. Cuánto se lleva pagado de cada cobro. 0.00 = nada (el estado normal
--    de todo lo que ya existe, así que el default deja la BD consistente
--    sin tener que tocar ninguna fila vieja).
ALTER TABLE cobros
  ADD COLUMN monto_pagado DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER total;

-- 2. Los cobros que YA estaban pagados antes de esta migración se consideran
--    cubiertos al 100%. Sin esto, todo el histórico quedaría como "pagado
--    pero con $0.00 abonados" y cualquier recálculo posterior lo rompería.
UPDATE cobros SET monto_pagado = total WHERE estado = 'pagado';

-- 3. El libro mayor de abonos: un renglón por cada pago recibido.
CREATE TABLE IF NOT EXISTS cobro_abonos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cobro_id INT NOT NULL,
  cliente_id INT DEFAULT NULL,
  escuela_id INT DEFAULT NULL,

  monto DECIMAL(12,2) NOT NULL,

  -- 'SPEI' | 'EfectivoRef' | 'TC' | 'Efectivo' | 'Cheque' | 'manual'
  metodo VARCHAR(20) DEFAULT NULL,

  -- Trazabilidad con el proveedor. `transaccion_proveedor` es la llave común
  -- con su sistema: sin ella no se puede conciliar contra su reporte.
  referencia VARCHAR(64) DEFAULT NULL,
  clabe VARCHAR(24) DEFAULT NULL,
  transaccion_proveedor VARCHAR(64) DEFAULT NULL,
  auth_code VARCHAR(32) DEFAULT NULL,

  -- 'webhook_spei' | 'webhook_referencia' | 'webhook_liga' | 'caja' | ...
  origen VARCHAR(30) DEFAULT NULL,
  -- Usuario que lo registró, cuando fue a mano desde Caja. NULL = automático.
  registrado_por INT DEFAULT NULL,
  notas TEXT,

  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  KEY idx_cobro (cobro_id),
  KEY idx_cliente (cliente_id),
  KEY idx_creado (creado_en),

  -- Idempotencia: si el proveedor reenvía la MISMA transacción, el segundo
  -- INSERT falla en vez de abonar dos veces el mismo dinero. Varios NULL no
  -- chocan entre sí en MySQL, así que los abonos manuales (sin transacción)
  -- no se estorban.
  UNIQUE KEY uq_transaccion (transaccion_proveedor)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
