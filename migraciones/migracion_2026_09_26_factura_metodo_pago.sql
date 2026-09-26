-- migracion_2026_09_26_factura_metodo_pago.sql
--
-- GUARDAR SI UNA FACTURA SE EMITIÓ COMO PUE O COMO PPD
--
-- EL PROBLEMA
--
-- acciones/generar_cfdi.php YA decide correctamente el método de pago al
-- timbrar: calcula `$cobroCubierto` (¿el monto_pagado cubre el total?) y manda
-- a Facturapi "payment_method" => PUE o PPD, con "payment_form" => la forma
-- real o '99' respectivamente. Pero esa decisión NO se guardaba en ningún
-- lado: se calculaba, se mandaba al PAC y se tiraba.
--
-- La consecuencia es real y cuesta un rechazo del PAC. Un cobro que ya estaba
-- CUBIERTO cuando se facturó se timbra como PUE, y una factura PUE no admite
-- complementos de pago. Pero si ese cobro llegó a estar cubierto con DOS o más
-- abonos, sus filas siguen en `cobro_abonos`, y
-- acciones/abonos_sin_complemento_listar.php las listaba como "pendientes de
-- complemento" con solo pedir que el cobro tuviera `factura_uuid`. El cajero
-- veía abonos por complementar, pulsaba "Emitir complemento", y el PAC
-- rechazaba el timbrado porque la factura de origen es PUE.
--
-- LA COLUMNA
--
-- Un espejo de lo que se le mandó al PAC. Es la única fuente honesta: no se
-- puede deducir después, porque depende de si el cobro estaba cubierto EN EL
-- MOMENTO de timbrar, y eso no queda registrado en ninguna otra parte.

ALTER TABLE cobros
  ADD COLUMN factura_metodo_pago VARCHAR(3) NULL AFTER factura_uso_cfdi;

-- Índice: abonos_sin_complemento_listar.php filtra por esta columna en cada
-- carga de la pestaña "Complementos pendientes".
CREATE INDEX idx_cobros_factura_metodo ON cobros (factura_metodo_pago);

-- SIN BACKFILL, A PROPÓSITO
--
-- Las filas ya facturadas se quedan en NULL y NO se rellenan adivinando.
-- Se consideró deducirlo del número de filas en `cobro_abonos`, y no funciona:
-- lib/helpers_pagos.php -> aplicar_abono_a_cobro() inserta una fila por CADA
-- aplicación de pago, incluido un pago único en una sola exhibición. Así que
-- "tiene un abono" no distingue un PUE de un PPD que recibió su primer pago.
-- Marcar mal una fila como 'PUE' escondería para siempre complementos que de
-- verdad hacen falta — un problema fiscal peor que el que se está arreglando.
--
-- Por eso el filtro del listado se escribe EN NEGATIVO:
--     (c.factura_metodo_pago IS NULL OR c.factura_metodo_pago <> 'PUE')
-- Con NULL se conserva exactamente el comportamiento de hoy para lo viejo
-- (se sigue listando, y si alguno no procede el PAC lo dirá, como hasta ahora),
-- y lo que se timbre a partir de este despliegue queda bien clasificado.
-- Si algún día se quiere limpiar el histórico, hay que hacerlo revisando
-- factura por factura contra el PAC, no con una heurística.
