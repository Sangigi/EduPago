-- ════════════════════════════════════════════════════════════════════════
-- migracion_2026_09_22_plan_al_pagar.sql
--
-- CAMBIAR DE PLAN AL MOMENTO DE PAGAR
--
-- Hasta hoy, escuela_generar_pago_renovacion.php cobraba el precio del plan
-- que la escuela YA tenía (`PLANES_LIMITES[$esc['plan']]`). Es decir: solo
-- podías pagar por el plan que elegiste al registrarte. Si un colegio crecía
-- y quería subirse a Pro, o al revés quería bajarse, no había camino dentro
-- del sistema — había que pedírselo al superadmin.
--
-- Ahora el colegio elige el plan en la pantalla de pago. Y aquí está la
-- decisión que importa:
--
--   El plan elegido NO se aplica al generar el cobro. Se GUARDA como
--   intención, y se aplica cuando el pago se CONFIRMA.
--
-- Si se aplicara al generar la liga, cualquiera podría subirse a Pro con solo
-- abrir la pantalla de pago y nunca pagar: tendría los límites del plan caro
-- gratis. Y en el sentido contrario sería igual de malo — un colegio que
-- empieza a bajarse de plan y se arrepiente a media pantalla se habría
-- quedado ya con los límites del plan chico, posiblemente por debajo de los
-- alumnos que tiene dados de alta.
--
-- Por eso esta columna vive junto al resto de `pago_renovacion_*`: es parte
-- del cobro en curso, y se limpia junto con ellas cuando el pago se confirma
-- o caduca.
--
-- Corre este archivo UNA SOLA VEZ. Si truena con #1060 "Duplicate column
-- name", ya se había corrido.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE escuelas
  ADD COLUMN pago_renovacion_plan VARCHAR(20) NULL DEFAULT NULL
    COMMENT 'Plan que el colegio eligió al generar este pago. Se aplica al confirmarse, no al generarse. NULL = renueva con el mismo plan.';


-- ── COMPROBACIÓN ────────────────────────────────────────────────────────
SHOW COLUMNS FROM escuelas LIKE 'pago_renovacion_plan';
