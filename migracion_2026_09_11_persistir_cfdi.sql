-- migracion_2026_09_11_persistir_cfdi.sql
--
-- Corre esto UNA VEZ en phpMyAdmin.
--
-- Diagnóstico ("rehabilitar facturación", parte 2): el CFDI timbrado nunca se
-- guardaba en el servidor más allá de `cobros.factura` (bool) y
-- `cobros.facturapi_id`. El resto de los datos (uuid, serie, folio, fecha de
-- timbrado, subtotal/IVA, RFC y razón social del receptor, etc.) solo vivían
-- en localStorage del navegador (assets/js/... AppModel.save), que
-- assets/js/app.js deja de mezclar con los datos frescos del servidor en
-- cada carga. Resultado: la pestaña "Emitidas" de Facturación siempre
-- aparecía vacía después de recargar, y los cobros ya facturados volvían a
-- listarse como "Por facturar" -- lo que ya causó un doble timbrado real
-- (mismo cobro timbrado dos veces, ver api_log.txt).
--
-- Esta migración agrega las columnas que faltan para que generar_cfdi.php
-- pueda persistir el CFDI completo en `cobros`, y cargar_datos.php lo
-- devuelva ya armado como el objeto `factura_cfdi` que el frontend siempre
-- esperó (sin necesidad de tocar la parte de LECTURA de views/Facturacion.js).
--
-- Estas columnas son NUEVAS (verificado por grep: no aparecen en ninguna
-- migración previa del repo), así que se agregan directamente, sin "IF NOT
-- EXISTS" -- tu servidor de MySQL no soporta esa sintaxis (requiere MySQL
-- 8.0.29+ / MariaDB 10.3+). Si alguna columna ya existiera, MySQL marcará
-- "Duplicate column name" en esa línea puntual; en ese caso borra solo esa
-- línea y vuelve a correr el resto.

ALTER TABLE cobros
  ADD COLUMN factura_uuid           VARCHAR(60)   NULL DEFAULT NULL,
  ADD COLUMN factura_serie          VARCHAR(10)   NULL DEFAULT NULL,
  ADD COLUMN factura_folio          VARCHAR(30)   NULL DEFAULT NULL,
  ADD COLUMN factura_fecha_timbrado DATETIME      NULL DEFAULT NULL,
  ADD COLUMN factura_subtotal       DECIMAL(10,2) NULL DEFAULT NULL,
  ADD COLUMN factura_iva            DECIMAL(10,2) NULL DEFAULT NULL,
  ADD COLUMN factura_rfc_receptor   VARCHAR(20)   NULL DEFAULT NULL,
  ADD COLUMN factura_razon_social   VARCHAR(200)  NULL DEFAULT NULL,
  ADD COLUMN factura_uso_cfdi       VARCHAR(10)   NULL DEFAULT NULL,
  ADD COLUMN factura_cp_receptor    VARCHAR(10)   NULL DEFAULT NULL,
  ADD COLUMN factura_email_receptor VARCHAR(160)  NULL DEFAULT NULL,
  ADD COLUMN factura_qr_url         VARCHAR(500)  NULL DEFAULT NULL;
