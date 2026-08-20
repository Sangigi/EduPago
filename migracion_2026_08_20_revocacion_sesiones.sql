-- migracion_2026_08_20_revocacion_sesiones.sql
-- Ejecutar UNA VEZ en la base de datos antes de subir el api.php nuevo.
--
-- Antes no había ninguna forma de invalidar un token ya emitido (bearer
-- HMAC de 12h) antes de que expirara solo — ni al cambiar contraseña, ni
-- si un admin quería forzar el cierre de sesión de alguien. Cualquier token
-- filtrado (XSS, dispositivo perdido) seguía siendo válido hasta 12h.

ALTER TABLE usuarios
  ADD COLUMN sesion_valida_desde DATETIME NULL DEFAULT NULL
    COMMENT 'Tokens emitidos ANTES de esta fecha se rechazan aunque su firma/expiración sean válidas. Se actualiza al cambiar contraseña o al forzar cierre de sesión.';
