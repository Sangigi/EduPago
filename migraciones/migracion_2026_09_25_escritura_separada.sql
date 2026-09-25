-- migracion_2026_09_25_escritura_separada.sql
--
-- SEPARA "NÚMERO Y FECHA DE ESCRITURA" EN DOS CAMPOS, Y ELIMINA EL VIEJO
--
-- EL PROBLEMA
--
-- El formulario de alta de comercio pedía un solo campo de texto libre para
-- dos datos distintos:
--
--   rep_legal_escritura  VARCHAR(200)  COMMENT 'Número y fecha de escritura'
--   empresa_escritura    VARCHAR(200)  COMMENT 'Número de escritura y fecha'
--
-- Quien llena el formulario tenía que inventarse el formato ("12345 del
-- 03/05/2019", "Esc. 12345, 3 de mayo de 2019", "12345 - 2019-05-03"...), y
-- del otro lado quien captura el alta ante el proveedor tenía que
-- interpretarlo. Es un dato que va a un trámite formal: la fecha debe ser una
-- fecha de verdad y el número, un número.
--
-- POR QUÉ SE BORRAN LAS COLUMNAS VIEJAS
--
-- El sistema todavía no sale a producción, así que no hay captura real que
-- rescatar. Conservarlas "por si acaso" dejaría dos columnas que ningún código
-- lee ni escribe — deuda que dentro de seis meses nadie sabe si se puede
-- tocar. Se corta de raíz: se agregan las nuevas y se eliminan las viejas en
-- la misma migración.
--
-- Si hubiera algo capturado que quieras ver antes de borrar, esto lo lista
-- (corre esto ANTES del BLOQUE B):
--
--   SELECT escuela_id, rep_legal_escritura, empresa_escritura
--     FROM escuela_datos_pago
--    WHERE (rep_legal_escritura IS NOT NULL AND rep_legal_escritura <> '')
--       OR (empresa_escritura   IS NOT NULL AND empresa_escritura   <> '');
--
-- NO ES IDEMPOTENTE: MySQL 5.7 no soporta ADD/DROP COLUMN IF NOT EXISTS, y
-- esta base no da permiso sobre information_schema (#1044), así que no hay
-- forma limpia de condicionarlo desde SQL. Si se corre dos veces, la segunda
-- falla con "Duplicate column name" o "Can't DROP" — errores inofensivos y
-- claros. Mismo criterio que migracion_2026_09_22_provision_y_cuentas_por_pagar.sql.
--
-- ¿YA CORRISTE LA VERSIÓN ANTERIOR DE ESTE ARCHIVO? Esa solo agregaba las
-- cuatro columnas nuevas. En ese caso salta el BLOQUE A y corre solo el B.

-- ════════════════════════════════════════════════════════════════════════
-- BLOQUE A — las cuatro columnas nuevas
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE escuela_datos_pago
  ADD COLUMN rep_legal_escritura_numero VARCHAR(60) NULL DEFAULT NULL
    COMMENT 'Número de la escritura del poder del representante legal'
    AFTER rep_legal_nombre,
  ADD COLUMN rep_legal_escritura_fecha DATE NULL DEFAULT NULL
    COMMENT 'Fecha de esa escritura'
    AFTER rep_legal_escritura_numero;

ALTER TABLE escuela_datos_pago
  ADD COLUMN empresa_escritura_numero VARCHAR(60) NULL DEFAULT NULL
    COMMENT 'Número de la escritura constitutiva de la empresa'
    AFTER empresa_escritura,
  ADD COLUMN empresa_escritura_fecha DATE NULL DEFAULT NULL
    COMMENT 'Fecha de esa escritura'
    AFTER empresa_escritura_numero;

-- ════════════════════════════════════════════════════════════════════════
-- BLOQUE B — fuera las viejas
-- ════════════════════════════════════════════════════════════════════════
-- Ningún archivo del sistema las lee ni las escribe ya: se quitaron de
-- acciones/escuela_guardar_datos_pago.php y de views/MiCuenta.js en el mismo
-- cambio que agrega las nuevas.

ALTER TABLE escuela_datos_pago
  DROP COLUMN rep_legal_escritura,
  DROP COLUMN empresa_escritura;

-- ════════════════════════════════════════════════════════════════════════
-- COMPROBACIÓN
-- ════════════════════════════════════════════════════════════════════════
-- Deben aparecer SOLO las cuatro nuevas (_numero y _fecha de cada una),
-- y ninguna llamada 'rep_legal_escritura' o 'empresa_escritura' a secas:
SHOW COLUMNS FROM escuela_datos_pago LIKE 'rep_legal_escritura%';
SHOW COLUMNS FROM escuela_datos_pago LIKE 'empresa_escritura%';
