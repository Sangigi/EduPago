-- ════════════════════════════════════════════════════════════════════════
-- migracion_2026_09_21_pagos_no_aplicados.sql
--
-- POR QUÉ EXISTE ESTA TABLA
--
-- Hasta hoy, cuando llegaba dinero que el sistema no podía aplicar (monto
-- distinto al esperado, referencia desconocida, CLABE reciclada, alumno sin
-- adeudo), los 3 webhooks de pago hacían exactamente lo mismo:
--   $pdo->rollBack();  +  una línea de texto en un .txt  +  responder código 30
-- Es decir: CERO filas en base de datos. Desde el punto de vista del sistema,
-- ese depósito nunca existió. No había forma de conciliarlo, ni de detectarlo,
-- ni de responderle a una familia que reclamara con su comprobante en la mano.
--
-- Caso real que originó esto (21-sep-2026): tres transferencias SPEI de $10.00
-- contra un adeudo de $2,170.00 fueron rechazadas con "monto no coincide" y no
-- dejaron rastro alguno en la base de datos. Además, PRODUCCION.md (sección
-- 5.3ax) ya documentaba entradas "⚠ LIGA HUÉRFANA" con response:approved —
-- cargos de tarjeta REALMENTE aprobados por el banco que nunca se conciliaron
-- (folios 624905207, 624916117, 624941090, 624944765).
--
-- Esta tabla NO cambia el comportamiento de los webhooks: siguen rechazando
-- igual que antes. Lo único que cambia es que ahora queda el registro.
--
-- Cómo correrla: pegar todo en phpMyAdmin y ejecutar. Es segura de re-ejecutar
-- (usa IF NOT EXISTS).
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pagos_no_aplicados (
  id INT AUTO_INCREMENT PRIMARY KEY,

  -- 'spei' | 'efectivo' | 'tarjeta'
  canal VARCHAR(20) NOT NULL,

  -- Por qué no se pudo aplicar. Valores que usa el código hoy:
  --   monto_no_coincide      el depósito llegó por un importe distinto
  --   referencia_desconocida la referencia no corresponde a nada nuestro
  --   clabe_desconocida      la CLABE no existe o está inactiva
  --   sin_adeudo_pendiente   el alumno/referencia ya no debe nada
  --   idempotente_sin_monto  se autorizó por reintento sin comparar importe
  motivo VARCHAR(40) NOT NULL,

  -- Identificadores tal como los mandó el proveedor (sin normalizar).
  referencia VARCHAR(64) DEFAULT NULL,
  clabe VARCHAR(24) DEFAULT NULL,

  -- El id de transacción del proveedor: es la ÚNICA llave común con su
  -- sistema, y hasta hoy no se guardaba en ninguna parte. Sin esto no se
  -- puede conciliar contra su reporte.
  transaccion_proveedor VARCHAR(64) DEFAULT NULL,
  auth_code VARCHAR(32) DEFAULT NULL,

  monto_recibido DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  monto_esperado DECIMAL(12,2) DEFAULT NULL,

  -- A quién correspondía, cuando se pudo determinar. NULL si no se identificó.
  cliente_id INT DEFAULT NULL,
  cobro_id INT DEFAULT NULL,
  escuela_id INT DEFAULT NULL,

  -- El body crudo del webhook, para poder reconstruir el caso después.
  payload_raw TEXT,
  ip_origen VARCHAR(45) DEFAULT NULL,

  -- Cuántas veces llegó el MISMO id de transacción (reintentos del proveedor).
  intentos INT NOT NULL DEFAULT 1,

  -- 'pendiente' (nadie lo ha revisado) | 'resuelto' | 'descartado'
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  notas TEXT,
  resuelto_por INT DEFAULT NULL,
  resuelto_en DATETIME DEFAULT NULL,

  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NULL DEFAULT NULL,

  -- Dedup de reintentos: si el proveedor reenvía la MISMA transacción, se
  -- incrementa `intentos` en vez de crear una fila nueva (ver
  -- registrar_pago_no_aplicado() en lib/helpers_pagos.php).
  -- OJO: en MySQL varios NULL no chocan entre sí en un índice UNIQUE, así que
  -- los avisos sin id de transacción sí generan una fila cada uno — que es lo
  -- correcto, porque no hay forma de saber si son el mismo depósito.
  UNIQUE KEY uq_canal_transaccion (canal, transaccion_proveedor),

  KEY idx_estado_creado (estado, creado_en),
  KEY idx_cliente (cliente_id),
  KEY idx_escuela (escuela_id),
  KEY idx_referencia (referencia)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
