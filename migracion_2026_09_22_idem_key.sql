-- ════════════════════════════════════════════════════════════════════════
-- migracion_2026_09_22_idem_key.sql
--
-- PARCHE a migracion_2026_09_21_abonos.sql
--
-- ¿PARA QUIÉN ES ESTO? Para quien YA corrió la migración de abonos del
-- 21-sep antes de que se corrigiera la llave de idempotencia. Si vas a
-- instalar desde cero, NO necesitas este archivo: la migración del 21-sep
-- ya trae el esquema correcto.
--
-- QUÉ CAMBIA Y POR QUÉ
--
-- La versión original de `cobro_abonos` deduplicaba con
-- `UNIQUE KEY uq_transaccion (transaccion_proveedor)`. Eso está mal: ese
-- campo lo pone el proveedor y NO está garantizado como único entre canales.
-- En los logs de producción se han visto valores cortos y repetibles (del
-- estilo "101"). Con un UNIQUE global sobre esa sola columna, un pago REAL
-- de efectivo se descartaría en silencio como "duplicado" nada más porque un
-- pago de SPEI ya había usado ese mismo número — y perder un pago real es
-- peor que registrar uno de más.
--
-- La llave pasa a ser `idem_key`: un SHA1 de
--     canal | referencia o CLABE | transacción | centavos | fecha
-- que un REINTENTO del proveedor reproduce idéntico, pero que dos pagos
-- genuinamente distintos casi nunca comparten completo. La calcula
-- construir_idem_key() en lib/helpers_pagos.php.
--
-- ── ORDEN DE DESPLIEGUE — IMPORTA ───────────────────────────────────────
--
--   1) PRIMERO corre este archivo en phpMyAdmin.
--   2) DESPUÉS haz el git pull en el servidor.
--
-- Al revés NO funciona: el código nuevo hace INSERT con la columna
-- `idem_key`, así que entre el pull y la migración TODO pago por webhook
-- fallaría con "Unknown column 'idem_key'". Los tres webhooks atrapan la
-- excepción y responden código 50 ("Error de sistema"), no 30, así que al
-- menos NO se le devuelve el dinero a la familia — pero el pago no se
-- registra, el cobro se queda 'pendiente' y alguien ya pagó. Es justo el bug
-- que costó trabajo encontrar en septiembre. No abras esa ventana.
--
-- En el orden correcto no hay ventana rota: el código VIEJO no conoce
-- `idem_key` y simplemente la deja en NULL, su chequeo de duplicados
-- (WHERE transaccion_proveedor = ?) sigue funcionando porque la columna se
-- conserva, y lo único que se pierde son unos minutos sin el UNIQUE viejo.
--
-- ── POR QUÉ NO ES AUTO-DETECTABLE ───────────────────────────────────────
--
-- La primera versión de este parche revisaba information_schema para saltarse
-- los pasos ya aplicados. No sirve: el usuario de MySQL del hosting no tiene
-- permiso sobre esa base (#1044). Por eso los pasos van como ALTER pelones y
-- la verificación se hace con SHOW, que sí está permitido.
-- ════════════════════════════════════════════════════════════════════════


-- ── PASO 0: mira qué tienes antes de tocar nada ──────────────────────────
-- Corre SOLO estas dos líneas primero, por separado, y revisa la salida.
--
--   SHOW COLUMNS FROM cobro_abonos;
--   SHOW INDEX FROM cobro_abonos;
--
-- Lo esperado si corriste la migración del 21-sep tal como estaba:
--   · NO aparece ninguna columna `idem_key`
--   · SÍ aparece un índice `uq_transaccion` con Non_unique = 0
--
-- Si ya ves `idem_key` y `uq_idem`, este parche ya se aplicó: no corras nada.


-- ── PASO 1: el cambio, en un solo ALTER ──────────────────────────────────
-- Va todo junto a propósito. Si algo falla, MySQL no aplica NADA de este
-- ALTER y la tabla se queda exactamente como estaba — que es el modo seguro
-- de fallar. Nada de estados a medias.
--
-- Los renglones que ya existen quedan con idem_key en NULL, y así se quedan.
-- NO se rellenan hacia atrás, y es deliberado: la llave se calcula sobre el
-- monto RECIBIDO, pero la tabla guarda el monto APLICADO — y en un sobrepago
-- esos dos números no son el mismo. Un relleno "listo" produciría llaves
-- equivocadas, y una llave equivocada puede tumbar un pago futuro legítimo
-- por parecerse a un renglón viejo. En MySQL varios NULL no chocan entre sí
-- en un UNIQUE, así que dejarlos en NULL es inofensivo: lo único que se
-- pierde es la protección contra un reintento de esos depósitos concretos, y
-- el proveedor reintenta en minutos, no después.
--
-- `transaccion_proveedor` se conserva: ya no deduplica, pero sigue siendo la
-- llave común con el sistema del proveedor y sin ella no se puede conciliar
-- contra su reporte. Solo deja de ser única.

ALTER TABLE cobro_abonos
  ADD COLUMN idem_key CHAR(40) DEFAULT NULL AFTER auth_code,
  ADD UNIQUE KEY uq_idem (idem_key),
  DROP INDEX uq_transaccion,
  ADD KEY idx_transaccion (transaccion_proveedor);


-- ── SI EL PASO 1 DA ERROR ────────────────────────────────────────────────
--
-- #1060 "Duplicate column name 'idem_key'"
--     La columna ya existe. Quita del ALTER la línea ADD COLUMN y vuelve a
--     correr lo que quede.
--
-- #1091 "Can't DROP 'uq_transaccion'; check that column/key exists"
--     Ese índice ya no está (o nunca se llamó así). Quita del ALTER la línea
--     DROP INDEX y vuelve a correr lo que quede. Revisa con
--     SHOW INDEX FROM cobro_abonos; cómo se llama el índice único real.
--
-- #1061 "Duplicate key name 'uq_idem'" o 'idx_transaccion'
--     Ese índice ya existe. Quita esa línea del ALTER y corre el resto.
--
-- #1062 "Duplicate entry ... for key 'uq_idem'"
--     Hay dos renglones con el MISMO idem_key no nulo. No debería pasar con
--     las filas viejas (todas en NULL). Si pasa, NO fuerces nada: manda la
--     salida de
--       SELECT idem_key, COUNT(*) c FROM cobro_abonos
--        WHERE idem_key IS NOT NULL GROUP BY idem_key HAVING c > 1;


-- ── PASO 2: comprobación final ───────────────────────────────────────────
-- Corre esto y revisa la columna Non_unique:
--
--   SHOW INDEX FROM cobro_abonos;
--
-- Debe quedar así:
--   · uq_idem           Non_unique = 0   (única)   sobre idem_key
--   · idx_transaccion   Non_unique = 1   (normal)  sobre transaccion_proveedor
--   · uq_transaccion    NO DEBE APARECER
