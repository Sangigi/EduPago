# OF-2 — IVA por concepto, factura con un renglón por concepto y cancelación de facturas

Rama `mejoras-of` · 19-nov-2026

> **Esto no es asesoría fiscal.** La tasa de IVA, la clave SAT y la unidad que
> corresponden a cada concepto las decide **el contador del colegio**. El sistema
> solo permite configurarlas. Lo que se pone por defecto (16 %) es lo que se
> facturaba antes de esta fase.

## Qué cambió

1. **Cada concepto de pago tiene su IVA, clave SAT y unidad** (`productos.iva_tasa`, `clave_sat`, `clave_unidad`).
   Tasas: `exento`, `0` (tasa 0 %) y `16`. Los conceptos que ya existen quedan en `16` / `86101800` / `E48`:
   **nada cambia hasta que el colegio edite un concepto.**
2. **El precio capturado sigue siendo el precio final, con impuesto incluido.** No hay modo "sumar IVA":
   lo que paga la familia no cambia. Solo cambia cómo se desglosa en la factura.
3. **Al crear un cobro, cada renglón guarda un snapshot** (`cobro_items.iva_tasa/clave_sat/clave_unidad`)
   del concepto en ese momento. Editar el concepto después no altera cobros ya creados.
4. **`generar_cfdi` factura un renglón por concepto** cuando el cobro tiene snapshot:
   tasa 16 %, tasa 0 o exento, con su clave SAT y su unidad. Las becas (renglones negativos) se
   convierten en `discount` repartido entre los renglones positivos. El complemento IEDU va solo en los
   renglones educativos (categoría colegiatura, inscripción o anualidad).
5. **Complementos de pago**: el impuesto del pago corresponde al de la factura original (abono repartido
   proporcionalmente entre las tasas de la factura).
6. **Cancelar factura** (nuevo): acción `cancelar_cfdi`, botón en Facturación, historial en la pestaña "Canceladas".
7. **Las recargas de monedero no se facturan**: `generar_cfdi` las rechaza con un mensaje claro.

## Cómo configurar los conceptos (admin)

*Productos → Nuevo concepto / editar*, bloque **Facturación (CFDI)**:

| Campo | Qué es |
|---|---|
| IVA | Exento · Tasa 0 % · 16 % (incluido en el precio) |
| Unidad | E48 Servicio · H87 Pieza · "Otra" (clave de 2 o 3 caracteres, c_ClaveUnidad) |
| Clave SAT | 8 dígitos (c_ClaveProdServ). Por defecto `86101800` (servicios educativos) |

Al **crear**, la categoría sugiere un valor (el admin lo puede cambiar; si ya tocó el IVA, deja de sugerir):
colegiatura, inscripción, anualidad y examen → exento · uniforme → 16 % + H87 · lo demás → 16 %.

La clave SAT es texto libre validado (8 dígitos): **no se ofrece una lista de claves educativas** porque no se
pudo verificar el catálogo oficial c_ClaveProdServ desde aquí. El contador debe confirmar la clave de cada nivel.

Arriba de Productos, solo para el admin, aparece el aviso *"Hoy todos tus conceptos se facturan con IVA 16 %…"*.
Se oculta solo cuando algún concepto ya tiene una tasa distinta de 16, o con el botón *Cerrar* (se recuerda por
colegio en ese navegador).

## Migración

`migraciones/migracion_2026_11_19_of2_impuestos.sql` — correr **una vez en phpMyAdmin, antes del `git pull`**.

* MySQL 5.7: **los `ALTER` no son idempotentes**. Si uno marca *Duplicate column name*, esa columna ya existe: sáltala y sigue.
  Cada columna va en su propia sentencia para poder hacerlo. El `CREATE TABLE` sí es idempotente.
* Agrega: 3 columnas en `productos` (NOT NULL con DEFAULT), 3 columnas NULL en `cobro_items`,
  `cobros.factura_impuestos_json` y `cobros.factura_cancelacion_estado`, y la tabla `facturas_canceladas`.
* Sin FOREIGN KEY, InnoDB utf8mb4. Sin backfill.
* **El código tolera que la migración aún no haya corrido**: no snapshot, un solo renglón al 16 % como antes,
  Productos guarda el concepto y avisa que el IVA no se guardó, "Cancelar factura" responde que falta migrar.
* `config.php` no se toca.

## Cómo se arma la factura

* Si el cobro tiene `cobro_items` y **todos** traen snapshot, se factura un renglón por cada item de importe positivo.
* Se trabaja en **centavos enteros**. Antes de armar nada se exige que la suma de los renglones sea exactamente
  `cobros.total`. Si no cuadra (o hay renglones sin snapshot, una "beca" con precio positivo, un descuento que cubre un
  renglón completo...) se usa **el comportamiento anterior (un renglón al 16 %)** y el motivo queda en `api_log.txt`
  (`generar_cfdi -> un solo renglón (comportamiento anterior) ... motivo: ...`).
* Los renglones se mandan con **precios netos** y `tax_included: false` (el precio que paga la familia no cambia;
  la base se calcula al revés para que base + IVA dé el importe pagado). Esto además da al `discount` la semántica
  estándar del CFDI (antes de impuestos).
* **Redondeo inherente del CFDI**: el IVA se calcula por concepto como `round(base × 0.16)`, y ~1 de cada 7 importes en
  centavos no tiene una base exacta. En ese caso ese renglón queda **1 centavo por debajo** de lo pagado (nunca por
  encima) y se anota en el log. Los importes sin IVA (exento / tasa 0) no tienen este efecto.
* Becas: el total de renglones negativos se reparte entre los positivos en proporción a su importe, en centavos;
  el residuo va al renglón mayor.
* Después de timbrar se compara el total que devolvió el PAC con el esperado; si difiere (> 2 centavos) se registra
  `ALERTA total distinto` en el log y la respuesta trae `advertencia` (la factura ya está timbrada).
* Se guarda el desglose por tasa en `cobros.factura_impuestos_json`.

## Cancelación de facturas

`cancelar_cfdi {cobro_id, motivo, uuid_sustitucion}` — solo `superadmin` y `admin` de la escuela del cobro
(la escuela sale de la fila del cobro, no del input).

| Motivo | Cuándo |
|---|---|
| 01 | Factura con errores y **ya emitida la sustituta** (requiere UUID de la sustituta) |
| 02 | Factura con errores, sin relación (el caso normal para corregir y volver a facturar) |
| 03 | No se llevó a cabo la operación |
| 04 | Operación nominativa en factura global (casi nunca aplica a un colegio; Facturapi también pide la sustituta) |

* Cancelar la factura **no cancela el cobro ni mueve dinero**. El cobro queda con `factura = 0` y sin datos de
  factura, listo para facturarse de nuevo (los datos fiscales de la familia se conservan para prellenar).
* Todo queda en `facturas_canceladas` (cobro, folio fiscal, motivo, sustituta, estado, respuesta del PAC, usuario, fecha)
  y en `logs_sistema` (`cfdi_cancelacion`).
* **Pendiente de aceptación**: si el SAT exige que el receptor acepte, Facturapi responde `status: valid` con
  `cancellation_status: pending`. Se guarda como *pendiente*; el cobro sigue facturado y muestra
  "Cancelación pendiente". El botón **Actualizar estado** (`cancelar_cfdi_actualizar`) consulta a Facturapi:
  aceptada → cancelada y cobro liberado; rechazada o vencida → la factura sigue vigente. No hay webhook; es manual.
* No se deja cancelar una factura con **complementos de pago emitidos** (primero hay que cancelar esos complementos
  en el panel de Facturapi; esa acción no existe aún en el sistema). Un cobro con cancelación pendiente tampoco
  permite emitir complementos.

## Pruebas manuales en el sandbox de Facturapi

Usar la llave de **pruebas** (no la de producción). Antes: correr la migración.

1. **Colegiatura exenta.** Concepto "Colegiatura" categoría colegiatura (sugiere exento). Cobro de $3,500 → Facturar.
   Esperado: un renglón, IVA *Exento*, subtotal $3,500.00, IVA $0.00, total $3,500.00, complemento IEDU presente.
2. **Uniforme 16 %.** Concepto uniforme (16 % + H87), 2 piezas de $450. Esperado: 1 renglón x2, unidad Pieza,
   subtotal $775.86, IVA $124.14, total $900.00. **Verificar que el total timbrado = $900.00** (ver riesgos).
3. **Cobro mixto con beca.** Colegiatura (exento) $3,500 + uniforme x2 (16 %) $900 + libro (tasa 0) $320 + beca
   $-350. Esperado: 3 renglones, cada uno con su impuesto, descuentos proporcionales, total $4,370.00, IEDU solo en
   la colegiatura.
4. **Complemento de un abono sobre factura mixta.** Con el cobro del punto 3 sin pagar por completo (PPD): abonar $1,000
   y emitir el complemento. Esperado: `taxes` del documento relacionado con tres entradas (Exento, Tasa 0, Tasa 16 %)
   que suman la base proporcional al abono; el sandbox lo timbra.
   Una factura vieja de un solo renglón al 16 % debe seguir produciendo un solo impuesto 16 % igual que antes.
5. **Cancelación con cada motivo.** Emitir 4 facturas de prueba; cancelar una con 02, una con 03, una con 01 (con el
   UUID de otra factura vigente como sustituta) y una con 04 (idem). Verificar en cada una: `facturas_canceladas`,
   que el cobro vuelve a "Por facturar" (o muestra "Cancelación pendiente" y, tras *Actualizar estado*, se resuelve), y
   que un admin de otra escuela recibe 403.
6. **Recarga de monedero.** Intentar facturar un cobro de recarga: debe responder "Las recargas de monedero no se facturan…".
7. **Sin migración** (opcional, en una copia): crear un cobro y facturarlo → un solo renglón al 16 %, sin errores.

## Riesgos y cosas que verificar

* **No se pudo probar contra Facturapi** (no hay llave ni sandbox desde el entorno de desarrollo). Los formatos salen de
  la documentación (`docs.facturapi.io/api/`) y del SDK oficial `facturapi-node` 6.1.0. Puntos a confirmar en el sandbox:
  1. `factor: "Exento"` junto con `rate: 0` (el tipo exige `rate`; el CFDI no lleva tasa en exento).
  2. Que Facturapi acepte precios con `tax_included: false` + `discount` y que el total coincida con el esperado.
  3. `unit_name` ("Unidad de servicio", "Pieza", "Actividad") junto con `unit_key`.
  4. El payload de `related_documents[].taxes` con `factor: "Exento"` en el complemento de pago.
* **Posible problema ya existente (no se modificó)**: el renglón único anterior manda `price = total/1.16` sin
  `tax_included`; la documentación de Facturapi dice que su valor por defecto es `true` (precio con IVA incluido), con lo
  que esa factura podría timbrarse por el subtotal y no por el total. Conviene comprobar el total de una factura reciente
  de ese tipo. El camino nuevo manda `tax_included: false` de forma explícita y valida el total.
* Un cobro con renglones sin snapshot (anteriores a la migración) o con una "beca" de precio positivo se sigue
  facturando como antes (un renglón al 16 %), aunque algún concepto sea exento. Para esos, corregir la tasa no basta:
  hay que crear el cobro de nuevo.
* Si se cambia la tasa de un concepto, los cobros pendientes ya creados conservan la anterior (snapshot).
* Cancelar una factura que ya se mandó por correo o ya se descargó no la "retira": el receptor debe ser avisado.
* Los complementos de pago ya emitidos no se pueden cancelar desde el sistema.
* Motivo 04: Facturapi pide `substitution` también para 04 (el brief original decía solo 01); el sistema lo exige en ambos.
* Fuentes: https://docs.facturapi.io/api/ (crear factura, producto, cancelar factura, complemento de pago) y el paquete
  npm `facturapi` 6.1.0 (tipos `TaxFactor`, `InvoiceItemInput`, `CancellationQueryInput`, `InvoiceCancellationStatus`, `PaymentInput`).

## Archivos

Nuevos: `lib/helpers_impuestos.php`, `lib/helpers_cancelacion.php`, `acciones/cancelar_cfdi.php`,
`acciones/cancelar_cfdi_actualizar.php`, `acciones/cfdi_cancelaciones_listar.php`,
`migraciones/migracion_2026_11_19_of2_impuestos.sql`.

Modificados: `acciones/generar_cfdi.php`, `acciones/generar_complemento_pago.php`, `acciones/crear_cobro.php`,
`acciones/crear_producto.php`, `acciones/editar_producto.php`, `acciones/cargar_datos.php`, `cron_recordatorios.php`,
`lib/facturapi.php` (soporte `DELETE`), `views/Productos.js`, `views/Facturacion.js`, `index.html` (`?v=1795700000`).
