-- migracion_2026_09_11_rol_contador.sql
--
-- Corre esto UNA VEZ en phpMyAdmin.
--
-- Diagnóstico: usuarios.rol es un ENUM que no incluye 'contador'. En modo
-- SQL no estricto (común en hosting compartido tipo Hostinger), MySQL NO
-- avienta error al insertar un valor de ENUM fuera de rango -- lo guarda en
-- silencio como cadena vacía (''). Por eso crear_usuario.php respondió
-- éxito sin ningún error, pero la cuenta quedó con rol='' (por eso no
-- aparecía ninguna etiqueta de rol en la tabla de Usuarios).
--
-- Se convierte la columna a VARCHAR para que este problema no se repita con
-- ningún rol futuro (ya no depende de mantener sincronizado un ENUM en la
-- BD con la lista de roles válidos que ya vive en el código PHP).

ALTER TABLE usuarios
  MODIFY COLUMN rol VARCHAR(20) NOT NULL;

-- Corrige la cuenta que ya quedó creada con rol vacío por este bug.
-- Ajusta el correo si no es el mismo que la que probaste.
UPDATE usuarios SET rol = 'contador'
 WHERE email = 'leonelalmanza23@gmail.com' AND (rol = '' OR rol IS NULL);
