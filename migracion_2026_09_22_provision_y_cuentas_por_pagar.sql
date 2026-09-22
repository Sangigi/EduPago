-- ════════════════════════════════════════════════════════════════════════
-- migracion_2026_09_22_provision_y_cuentas_por_pagar.sql
--
-- Dos cosas independientes que se agrupan aquí por ser del mismo día:
--
--   A) PROVISIÓN: el identificador que Cobroscontarjeta.com le asigna a cada
--      colegio después de aprobar sus documentos.
--   B) CUENTAS POR PAGAR: convertir `gastos` de "historial de lo ya pagado"
--      en algo que además sepa qué falta pagar y cuándo vence.
--
-- Corre este archivo UNA SOLA VEZ. No usa information_schema (el usuario de
-- MySQL del hosting no tiene permiso sobre esa base, error #1044), así que
-- los ALTER van pelones: si alguno truena con #1060 "Duplicate column name",
-- esa columna ya existía — quítala del ALTER y corre el resto.
-- ════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════
-- A) PROVISIÓN DEL COLEGIO ANTE EL PROVEEDOR
-- ════════════════════════════════════════════════════════════════════════
--
-- Hoy `PLE_SCHOOL_ID` es una constante global en config.php ('000002'): TODAS
-- las escuelas cobran a través del comercio de PagaLaEscuela. Según lo que
-- Cobroscontarjeta.com le indicó a Leonel, después de aprobar los documentos
-- de un colegio le asignan un identificador propio, necesario para que ese
-- colegio pueda cobrar por SPEI.
--
-- El nombre del campo es deliberadamente descriptivo y no imita ninguno de
-- los nombres del proveedor (BusinessID, SchoolID, subEmisor): en este mismo
-- repo esos tres términos ya aparecen usados de formas distintas y hasta con
-- valores distintos por servicio — PDT_BUS_ID_EFECTIVO es '000002' mientras
-- PDT_BUS_ID_SPEI es '000067' (ver PRODUCCION.md 5.3ba/5.3bb). Hasta que el
-- proveedor confirme por escrito qué es exactamente este identificador, lo
-- honesto es guardarlo como "el id que nos dio el proveedor para este
-- colegio" y no fingir que sabemos cuál de sus conceptos es.
--
-- ⚠️ IMPORTANTE: esta migración SOLO GUARDA el dato. A propósito, NINGÚN
-- código de pagos lo usa todavía. Cambiar a dónde va el dinero de un colegio
-- con base en un identificador cuyo significado nadie ha confirmado sería
-- imprudente. El paso siguiente —hacer que los pagos usen este id en vez de
-- la constante global— va después de que Cobroscontarjeta.com confirme el
-- contrato, y es un cambio que se prueba con un cobro real de monto chico.

ALTER TABLE escuelas
  ADD COLUMN proveedor_school_id VARCHAR(32) NULL DEFAULT NULL
    COMMENT 'Identificador que el proveedor de pagos asigna al colegio tras aprobar sus documentos. Ver migracion_2026_09_22.',
  ADD COLUMN proveedor_school_id_en DATETIME NULL DEFAULT NULL
    COMMENT 'Cuándo se capturó',
  ADD COLUMN proveedor_school_id_por INT UNSIGNED NULL DEFAULT NULL
    COMMENT 'usuarios.id de quien lo capturó (rol provision)';

-- Índice para poder buscar un colegio por el id que dio el proveedor cuando
-- ellos reporten una incidencia citando ese número y no el nombre.
ALTER TABLE escuelas
  ADD KEY idx_escuelas_proveedor_school_id (proveedor_school_id);


-- ════════════════════════════════════════════════════════════════════════
-- B) CUENTAS POR PAGAR A PROVEEDORES
-- ════════════════════════════════════════════════════════════════════════
--
-- `gastos` nació como historial: un renglón se captura cuando el dinero YA
-- salió. Por eso tiene `fecha` (cuándo ocurrió) y ninguna noción de
-- vencimiento ni de pendiente — y por eso no hay ninguna pantalla que pueda
-- responder "¿a quién le toca cobrarme este mes y qué día?".
--
-- Se agregan las tres columnas mínimas para que un gasto pueda existir ANTES
-- de pagarse, sin romper nada de lo que ya hay.

ALTER TABLE gastos
  -- Cuándo vence. NULL = gasto de contado, sin fecha límite (el caso de todo
  -- lo capturado hasta hoy).
  ADD COLUMN fecha_vencimiento DATE NULL DEFAULT NULL AFTER fecha,
  -- 'pagado' por DEFECTO y no 'pendiente', a propósito: las filas que ya
  -- existen se capturaron cuando el dinero ya había salido, así que ese es su
  -- estado correcto. Con el default al revés, todo el historial aparecería de
  -- golpe como deuda viva.
  ADD COLUMN estado VARCHAR(20) NOT NULL DEFAULT 'pagado'
    COMMENT 'pendiente | pagado | cancelado' AFTER fecha_vencimiento,
  -- Cuándo se pagó de verdad, que no tiene por qué ser ni `fecha` ni el
  -- vencimiento. Sin esto no se puede medir si se está pagando a tiempo.
  ADD COLUMN fecha_pago DATE NULL DEFAULT NULL AFTER estado;

-- El índice que hace barata la pregunta "¿qué debo este mes?": filtra por
-- escuela y estado, y ordena por vencimiento.
ALTER TABLE gastos
  ADD KEY idx_gastos_por_pagar (escuela_id, estado, fecha_vencimiento);

-- Día del mes en que toca pagarle a un proveedor recurrente (renta, nómina de
-- servicio, licencias). NULL = no es recurrente, se paga contra factura.
-- Es lo que permite responder "cuándo les toca" sin que alguien tenga que
-- capturar a mano el gasto de cada mes.
ALTER TABLE proveedores
  ADD COLUMN dia_pago_mes TINYINT UNSIGNED NULL DEFAULT NULL
    COMMENT '1-31, día del mes en que se le paga. NULL = no recurrente.';


-- ════════════════════════════════════════════════════════════════════════
-- COMPROBACIÓN
-- ════════════════════════════════════════════════════════════════════════
-- Deben aparecer las columnas nuevas:
SHOW COLUMNS FROM escuelas LIKE 'proveedor_school_id%';
SHOW COLUMNS FROM gastos LIKE 'fecha_vencimiento';
SHOW COLUMNS FROM gastos LIKE 'estado';
SHOW COLUMNS FROM gastos LIKE 'fecha_pago';
SHOW COLUMNS FROM proveedores LIKE 'dia_pago_mes';

-- Y el historial que ya existía debe haber quedado TODO como 'pagado':
SELECT estado, COUNT(*) AS n FROM gastos GROUP BY estado;
