-- ════════════════════════════════════════════════════════════════════════
-- migracion_2026_09_24_comisiones_devengo.sql
--
-- LIBRO MAYOR DE COMISIONES DE DISTRIBUIDOR
--
-- EL PROBLEMA QUE RESUELVE
-- acciones/distribuidor_comisiones.php calcula la comision historica EN VIVO:
--     comision_del_mes = SUM(cobros pagados del mes) x comision_pct ACTUAL
-- No existe ningun registro de que porcentaje regia cuando se devengo cada
-- mes. Si a un distribuidor le pagaste 25 pesos en agosto al 5% y hoy le bajas
-- a 3%, agosto pasa a mostrar 15. El historico se reescribe solo.
--
-- LA SOLUCION, en dos piezas
--   1. distribuidor_comision_tasas  -> desde cuando rige cada porcentaje.
--   2. comision_devengos            -> lo devengado de cada mes YA CERRADO,
--                                      con su porcentaje congelado dentro.
-- El mes en curso NO se congela: se calcula en vivo con la misma funcion, para
-- que no existan dos formulas que puedan desacordar.
--
-- Es el mismo patron que ya usan los abonos: cobro_abonos es el libro mayor y
-- cobros.monto_pagado la columna cacheada que se RECALCULA desde el.
-- distribuidor_referidos.comision_pct queda degradada a cache de "la tasa de
-- hoy", para no reescribir las consultas que ya la leen.
--
-- ORDEN DE DESPLIEGUE (no lo cambies):
--   1. Correr el PASO 0 y LEER lo que devuelve. Puede abortar la migracion.
--   2. Correr los pasos 1-6 de este archivo.
--   3. php migracion_2026_09_24_comisiones_backfill.php          (dry-run)
--   4. Comparar ese listado contra lo que la pantalla muestra HOY.
--   5. Solo si cuadra: php migracion_2026_09_24_comisiones_backfill.php --aplicar
--   6. git pull
--
-- Correr este archivo UNA SOLA VEZ. Si truena con #1050 "Table already exists",
-- ya se habia corrido.
-- ════════════════════════════════════════════════════════════════════════


-- ── PASO 0 · PREFLIGHT ──────────────────────────────────────────────────
-- LEE EL RESULTADO ANTES DE SEGUIR. Estas dos consultas no modifican nada,
-- pero cualquiera de las dos puede obligarte a parar.

-- (a) Dos referidos apuntando al MISMO colegio.
--     Hoy eso ya duplica la comision en vivo. Congelarlo la convertiria en
--     deuda formal, escrita y dificil de deshacer. Si devuelve filas, hay que
--     resolverlo ANTES de continuar.
SELECT escuela_id, COUNT(*) AS referidos_repetidos
  FROM distribuidor_referidos
 WHERE escuela_id IS NOT NULL
 GROUP BY escuela_id
HAVING COUNT(*) > 1;

-- (b) El reloj de MySQL contra el de Mexico.
--     config.php pone PHP en America/Mexico_City, pero cobro_abonos.creado_en
--     lo escribe MySQL con DEFAULT CURRENT_TIMESTAMP, o sea con el reloj del
--     servidor de base de datos. Si ese reloj esta en UTC, un pago a las 18:30
--     del 30-sep queda sellado como 1-oct y se devenga en el mes equivocado.
--     Mexico ya no tiene horario de verano, asi que -06:00 es estable.
SELECT NOW() AS hora_mysql, CURDATE() AS fecha_mysql,
       @@global.time_zone AS tz_global, @@session.time_zone AS tz_sesion;


-- ── PASO 1 · Historial de tasas ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS distribuidor_comision_tasas (
  id INT AUTO_INCREMENT PRIMARY KEY,

  -- La tasa pertenece al REFERIDO (el par distribuidor+colegio), que es donde
  -- vive hoy comision_pct. distribuidor_id y escuela_id van duplicados a
  -- proposito: eliminar_escuela.php borra la fila de distribuidor_referidos, y
  -- sin estas dos columnas la vigencia quedaria huerfana y sin forma de saber
  -- de quien era.
  referido_id INT NOT NULL,
  distribuidor_id INT NOT NULL,
  escuela_id INT DEFAULT NULL,

  comision_pct DECIMAL(5,2) NOT NULL,

  -- Primer dia en que rige esta tasa. vigente_hasta NULL = "es la de hoy".
  -- El cierre se guarda aunque sea redundante: MySQL 5.7 no tiene funciones de
  -- ventana, y con el rango cerrado "que tasa regia el 14-ago" es un BETWEEN
  -- indexado en vez de una subconsulta correlacionada.
  vigente_desde DATE NOT NULL,
  vigente_hasta DATE DEFAULT NULL,

  -- 'migracion_historica' | 'alta_referido' | 'edicion_superadmin'
  origen VARCHAR(30) NOT NULL DEFAULT 'edicion_superadmin',
  motivo VARCHAR(190) DEFAULT NULL,
  -- usuarios.id de quien la capturo. NULL = sistema: invitacion_enviar.php
  -- inserta referidos desde un contexto publico SIN sesion.
  registrado_por INT DEFAULT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Un solo tramo por referido y dia de inicio: si el superadmin cambia el
  -- porcentaje dos veces el MISMO dia, el segundo ACTUALIZA este renglon en
  -- vez de crear un tramo solapado. Dentro de un dia manda la ultima palabra,
  -- y las dos quedan en logs_sistema.
  UNIQUE KEY uq_referido_desde (referido_id, vigente_desde),
  KEY idx_ref_vigencia (referido_id, vigente_desde, vigente_hasta),
  KEY idx_distribuidor (distribuidor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ── PASO 2 · Devengado mensual congelado ────────────────────────────────
CREATE TABLE IF NOT EXISTS comision_devengos (
  id INT AUTO_INCREMENT PRIMARY KEY,

  periodo CHAR(7) NOT NULL COMMENT 'YYYY-MM',

  -- TODO denormalizado a proposito. Este renglon tiene que sobrevivir a que
  -- borren la escuela (eliminar_escuela.php hace DELETE de
  -- distribuidor_referidos), a que le cambien el estado y a que le muevan el
  -- escuela_id. Ningun reporte historico debe hacer JOIN contra
  -- distribuidor_referidos para sacar el nombre. Sin FOREIGN KEY, por lo mismo.
  distribuidor_id INT NOT NULL,
  referido_id INT NOT NULL,
  escuela_id INT DEFAULT NULL,
  nombre_colegio VARCHAR(190) DEFAULT NULL COMMENT 'Copia del nombre al cierre',

  -- 'devengo' = el mes tal como cerro. 'ajuste' = correccion posterior (dinero
  -- que llego tarde, cobro cancelado despues del cierre). Un mes cerrado NUNCA
  -- se reescribe: se le suma un ajuste.
  tipo VARCHAR(10) NOT NULL DEFAULT 'devengo',
  periodo_ajustado CHAR(7) DEFAULT NULL COMMENT 'Solo en tipo=ajuste',
  devengo_origen_id INT DEFAULT NULL COMMENT 'Solo en tipo=ajuste',

  -- La tasa CONGELADA. Aunque manana borren la vigencia, este renglon sigue
  -- sabiendo con que porcentaje se calculo.
  tasa_id INT DEFAULT NULL,
  comision_pct DECIMAL(5,2) NOT NULL,

  -- Tramo de dias que cubre. Normalmente el mes completo; si la tasa cambio a
  -- media semana, el mes produce DOS renglones con dos tramos.
  dias_desde DATE NOT NULL,
  dias_hasta DATE NOT NULL,

  base_cobrada DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  comision DECIMAL(12,2) NOT NULL DEFAULT 0.00,

  -- 'legacy_total_cobro' = SUM(cobros.total) por cobros.fecha, la formula que
  -- el sistema uso hasta hoy. 'ledger_mixto' = dinero real. Se guarda para que
  -- cualquiera pueda ver con que regla nacio un numero.
  base_regla VARCHAR(24) NOT NULL DEFAULT 'ledger_mixto',

  -- Cuanto de esta comision ya se pago. COLUMNA CACHEADA: se recalcula SIEMPRE
  -- desde comision_liquidacion_detalle, nunca se suma sobre el valor anterior.
  -- Misma regla de oro que cobros.monto_pagado.
  monto_liquidado DECIMAL(12,2) NOT NULL DEFAULT 0.00,

  origen VARCHAR(30) NOT NULL DEFAULT 'cierre_cron',
  cerrado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cerrado_por INT DEFAULT NULL COMMENT 'usuarios.id; NULL = cron o migracion',
  notas TEXT,

  -- Un renglon por referido, mes y tramo de tasa. Los ajustes llevan
  -- tasa_id = NULL a proposito: en MySQL varios NULL no chocan en un UNIQUE,
  -- asi que un mes puede recibir varios ajustes mientras el devengo original
  -- sigue siendo irrepetible.
  UNIQUE KEY uq_devengo (referido_id, periodo, tasa_id),
  KEY idx_dist_periodo (distribuidor_id, periodo),
  KEY idx_periodo (periodo),
  KEY idx_escuela (escuela_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ── PASO 3 · Bitacora de cierres ────────────────────────────────────────
-- El UNIQUE de periodo es lo que hace que cerrar dos veces el mismo mes no
-- duplique nada: el segundo intento choca y se detiene.
CREATE TABLE IF NOT EXISTS comision_cierres (
  id INT AUTO_INCREMENT PRIMARY KEY,
  periodo CHAR(7) NOT NULL COMMENT 'YYYY-MM',

  base_regla VARCHAR(24) NOT NULL,
  referidos_evaluados INT NOT NULL DEFAULT 0,
  renglones INT NOT NULL DEFAULT 0,
  total_devengado DECIMAL(12,2) NOT NULL DEFAULT 0.00,

  cerrado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cerrado_por INT DEFAULT NULL,
  origen VARCHAR(30) NOT NULL DEFAULT 'cron',
  notas TEXT,

  UNIQUE KEY uq_periodo (periodo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ── PASO 4 · Liquidaciones (lo que de verdad se pago) ───────────────────
-- Hoy NO existe ningun registro de pagos al distribuidor: se busco en todo el
-- repo (liquidac|payout|comision_pagada|pago_distribuidor) y no hay nada.
-- Estas dos tablas nacen VACIAS y se llenan a mano con los pagos ya hechos.
--
-- No se rellenan automaticamente con "todo lo anterior a hoy se da por pagado"
-- porque eso seria fabricar comprobantes de pagos que nadie puede verificar; y
-- si alguno no se hizo, desapareceria una deuda real.
CREATE TABLE IF NOT EXISTS comision_liquidaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  distribuidor_id INT NOT NULL,
  monto_total DECIMAL(12,2) NOT NULL,
  fecha_pago DATE NOT NULL,
  metodo VARCHAR(30) DEFAULT NULL,
  referencia VARCHAR(120) DEFAULT NULL,

  -- Copia de los datos bancarios AL MOMENTO del pago. Si el distribuidor
  -- cambia su CLABE despues, el comprobante tiene que seguir diciendo a donde
  -- se mando el dinero.
  pago_banco VARCHAR(120) DEFAULT NULL,
  pago_clabe VARCHAR(18) DEFAULT NULL,
  pago_titular VARCHAR(180) DEFAULT NULL,

  notas TEXT,
  registrado_por INT DEFAULT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  KEY idx_distribuidor_fecha (distribuidor_id, fecha_pago)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS comision_liquidacion_detalle (
  id INT AUTO_INCREMENT PRIMARY KEY,
  liquidacion_id INT NOT NULL,
  devengo_id INT NOT NULL,
  monto_aplicado DECIMAL(12,2) NOT NULL,

  -- Un devengo puede recibir varios pagos parciales, pero no dos veces el
  -- mismo pago.
  UNIQUE KEY uq_liq_devengo (liquidacion_id, devengo_id),
  KEY idx_devengo (devengo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ── PASO 5 · Indices de apoyo ───────────────────────────────────────────
-- El calculo del devengo filtra por (escuela, estado, fecha) y por
-- (escuela, fecha del abono). Sin estos indices, cerrar un mes con muchos
-- cobros recorre la tabla entera por cada referido.
--
-- SI ALGUNO DA #1061 "Duplicate key name", ese indice ya existia: saltatelo y
-- sigue con el siguiente. No es un error que deba detener la migracion.
ALTER TABLE cobros
  ADD KEY idx_cobros_escuela_estado_fecha (escuela_id, estado, fecha);

ALTER TABLE cobro_abonos
  ADD KEY idx_abono_escuela_creado (escuela_id, creado_en);


-- ── PASO 6 · Siembra de la tasa historica ───────────────────────────────
-- ESTO ES UNA SUPOSICION, y conviene que quede dicho con todas sus letras.
--
-- Hay cobros desde junio-2026 y los referidos estan todos al 5.00, sin ningun
-- registro de vigencia. Se asume que la tasa actual rigio DESDE SIEMPRE
-- (vigente_desde = '2000-01-01', abierto por la izquierda para que ningun
-- cobro viejo se quede sin tasa).
--
-- Es la unica suposicion posible, porque es la unica que reproduce EXACTAMENTE
-- los montos que el sistema venia mostrando. Cualquier otra -por ejemplo
-- inventar que en julio era 4%- cambiaria el historico justo en la migracion
-- que se hizo para que el historico no cambie.
INSERT INTO distribuidor_comision_tasas
  (referido_id, distribuidor_id, escuela_id, comision_pct,
   vigente_desde, vigente_hasta, origen, motivo, registrado_por)
SELECT r.id, r.distribuidor_id, r.escuela_id, r.comision_pct,
       '2000-01-01', NULL, 'migracion_historica',
       'Supuesta: al migrar no existia registro de vigencias, se asume que la tasa actual rigio desde siempre',
       NULL
  FROM distribuidor_referidos r;


-- ── COMPROBACION ────────────────────────────────────────────────────────
-- Debe haber una vigencia por cada referido, y los libros deben nacer vacios.
SELECT (SELECT COUNT(*) FROM distribuidor_referidos)        AS referidos,
       (SELECT COUNT(*) FROM distribuidor_comision_tasas)   AS vigencias_sembradas,
       (SELECT COUNT(*) FROM comision_devengos)             AS devengos_debe_ser_0,
       (SELECT COUNT(*) FROM comision_cierres)              AS cierres_debe_ser_0;

SHOW TABLES LIKE 'comision%';
SHOW TABLES LIKE 'distribuidor_comision%';
