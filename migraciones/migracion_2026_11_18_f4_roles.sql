-- migracion_2026_11_18_f4_roles.sql  -- [F4]
--
-- QUE HACE
--   Liga una cuenta de acceso con rol 'alumno' a SU fila de alumno
--   (clientes.id). Es lo unico que necesita la base para los roles nuevos de
--   la fase F4 ('control_escolar', 'direccion', 'alumno'): usuarios.rol es
--   VARCHAR desde migracion_2026_09_11_rol_contador.sql, asi que los roles en
--   si NO necesitan ALTER.
--
--   usuarios.cliente_id  -> NULL para todos los roles salvo 'alumno'. Lo lee
--                           verificar_token_auth() (api.php) en cada peticion
--                           y lo usa requerir_alumno_propio() para que un
--                           alumno solo pueda ver SU boleta, SU monedero, etc.
--
--   Sin FOREIGN KEY, igual que el resto del proyecto: la pertenencia (que el
--   alumno sea de la misma escuela, que este activo, que no tenga ya otra
--   cuenta activa) se valida en acciones/crear_usuario.php.
--
-- ORDEN DE EJECUCION
--   1. Corre este archivo UNA VEZ en phpMyAdmin, ANTES de subir el codigo.
--   2. Despues sube el codigo de la fase F4 (git pull).
--   El codigo tolera que la columna todavia no exista (api.php reintenta el
--   SELECT sin ella, nadie pierde el login), pero crear cuentas de alumno
--   exige la columna y lo dice con un mensaje claro.
--
--   MySQL 5.7 (produccion) no soporta ADD COLUMN IF NOT EXISTS: un ALTER por
--   columna. Si alguna sentencia marca "Duplicate column name" o
--   "Duplicate key name" es que ya se habia corrido: saltala y sigue.
--
-- BACKFILL
--   Ninguno. Las cuentas existentes quedan con cliente_id = NULL, que es lo
--   correcto: hasta hoy no existia el rol 'alumno'.

ALTER TABLE usuarios ADD COLUMN cliente_id INT NULL DEFAULT NULL AFTER familia_id;

-- "Este alumno ya tiene cuenta?" (crear_usuario.php) y la columna de acceso
-- de la vista de Alumnos.
ALTER TABLE usuarios ADD INDEX idx_usuarios_cliente_id (cliente_id);
