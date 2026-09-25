-- migracion_2026_09_09_secciones_escuela.sql
--
-- Corre esto UNA VEZ en phpMyAdmin antes de usar el código que la acompaña.
--
-- Permite que el super admin habilite/deshabilite secciones del menú
-- (dashboard, ingresos, corte de caja, etc.) por colegio. Se guarda como una
-- lista de EXCLUSIÓN (las secciones deshabilitadas), no de inclusión: así
-- todas las secciones quedan habilitadas por defecto (NULL/'[]') sin tener
-- que rellenar la columna en cada colegio existente, y cualquier sección
-- nueva que se agregue después al sistema también nace habilitada para todos
-- sin requerir otra migración. Es TEXT (no JSON nativo de MySQL) porque el
-- resto del proyecto no usa columnas JSON en ningún lado — se decodifica a
-- mano con json_decode/json_encode en PHP, igual que ya se hace con el body
-- de las peticiones a la API.

ALTER TABLE escuelas
  ADD COLUMN secciones_deshabilitadas TEXT NULL DEFAULT NULL
  COMMENT 'JSON array de ids de sección (ver SECCIONES_DISPONIBLES en api.php) ocultas para este colegio';
