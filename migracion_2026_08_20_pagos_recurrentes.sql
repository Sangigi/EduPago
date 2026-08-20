-- migracion_2026_08_20_pagos_recurrentes.sql
-- Ejecutar UNA VEZ en la base de datos antes de subir el api.php / cron nuevos.
--
-- Agrega soporte de "conceptos de pago recurrentes" (colegiatura mensual,
-- semestral, anual) sobre la tabla `productos` ya existente, con ventana de
-- pago (día 1 al 5 por defecto) y penalización por pago tardío (única, no
-- escalable) sobre `cobros`. Los cobros generados por un concepto recurrente
-- se registran en `pagos_recurrentes_generados` para no duplicarlos.

ALTER TABLE productos
  ADD COLUMN tipo ENUM('unico','recurrente') NOT NULL DEFAULT 'unico'
    COMMENT 'unico = se agrega manualmente al carrito en caja; recurrente = se cobra solo, cron_recordatorios.php lo genera',
  ADD COLUMN periodicidad_meses INT NULL COMMENT '1=mensual, 6=semestral, 12=anual (solo aplica si tipo=recurrente)',
  ADD COLUMN fecha_inicio DATE NULL COMMENT 'Ancla: primer mes en que se empieza a cobrar este concepto',
  ADD COLUMN dia_ventana_inicio TINYINT NOT NULL DEFAULT 1 COMMENT 'Día del mes en que abre el periodo de pago sin recargo',
  ADD COLUMN dia_ventana_fin TINYINT NOT NULL DEFAULT 5 COMMENT 'Último día del mes para pagar sin recargo',
  ADD COLUMN penalizacion_tipo ENUM('porcentaje','monto_fijo') NULL COMMENT 'NULL = sin penalización',
  ADD COLUMN penalizacion_valor DECIMAL(10,2) NULL COMMENT '% (ej. 10.00 = 10%) o monto fijo en MXN según penalizacion_tipo',
  ADD COLUMN ultima_generacion DATE NULL COMMENT 'Primer día del último periodo (mes) ya generado — evita duplicar cobros';

ALTER TABLE cobros
  ADD COLUMN recargo_aplicado TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Ya se le sumó el recargo por pago tardío a este cobro (una sola vez)',
  ADD COLUMN recargo_monto DECIMAL(10,2) NULL DEFAULT NULL COMMENT 'Cuánto se sumó por recargo, para mostrarlo en el recibo/correo';

CREATE TABLE IF NOT EXISTS pagos_recurrentes_generados (
  id INT AUTO_INCREMENT PRIMARY KEY,
  producto_id INT NOT NULL,
  cliente_id INT NOT NULL,
  periodo DATE NOT NULL COMMENT 'Primer día del mes calendario que representa el periodo cobrado',
  cobro_id INT NOT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_periodo_alumno (producto_id, cliente_id, periodo),
  KEY idx_cobro (cobro_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
