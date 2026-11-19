# OF-3 — Becas por alumno, cancelar cobro con motivo, folio por abono y notas de cobranza

Rama `mejoras-of` · 19-nov-2026

## Qué cambió

1. **Becas guardadas en el alumno** (`alumno_becas`). Una beca ya no es un concepto con precio
   negativo que el cajero agrega a mano: vive en el alumno (porcentaje o monto, por categoría de
   concepto o por conceptos concretos, con vigencia).
   * El **cron de cobros recurrentes** la aplica solo: el concepto va a precio completo y cada beca
     se agrega como renglón negativo en `cobro_items`.
   * **Caja** propone sola el renglón negativo (visible, con el nombre de la beca) cuando el alumno
     seleccionado tiene becas y se agrega un concepto dentro de su alcance. El cajero lo puede quitar.
   * **Alumnos** (solo admin y superadmin): botón **Becas** por alumno (lista, alta, edición con vista
     previa, baja lógica) y botón **Becas del colegio** (todas las activas y el descuento mensual
     estimado).
2. **Cancelar un cobro con motivo y registro.** Motivo obligatorio (≥ 5 caracteres), todo en una
   transacción con el cobro bloqueado, se guarda quién/cuándo/por qué y cuánto dinero ya se había
   recibido. Avisa si tiene dinero recibido (no se devuelve) o está facturado. Antes no había botón
   para esto en la interfaz (los botones se habían quitado de `Cobros.js`): ahora está en el detalle
   del cobro.
3. **Folio propio por abono** (`cobro_abonos.folio`): `COL-0123-01`, `COL-0123-02`… Se ve en el
   desglose de abonos del cobro, en Facturación (complementos pendientes y visor de complementos) y
   en el visor de complementos del portal de familia.
4. **Notas de cobranza por familia** (`familia_notas`): línea de tiempo con autor y fecha, y
   compromisos de pago. Se abren desde Familias (botón "Notas de cobranza"), desde Recordatorios (botón
   "Notas" por cobro) y desde el detalle de un cobro. Recordatorios muestra el bloque **"Compromisos
   de pago de hoy y vencidos"**.

## Reglas de cálculo de becas

Una sola fuente: `lib/helpers_becas.php` (`becas_calcular_descuento`, funciones puras, todo en
**centavos enteros**). El espejo en el navegador es `becasCalcular()` en
`views/components/BecasAlumno.js` (lo usan Caja y la vista previa); si cambia la regla, hay que
cambiar los dos.

Para un alumno, un concepto y una fecha:

1. Se toman las becas **activas**, **vigentes** en esa fecha (ambos extremos incluyen su día; `NULL` =
   sin límite) y cuyo **alcance** incluye el concepto (por `productos.categoria`, sin importar
   mayúsculas, o por `productos.id`). Una beca sin alcance definido no aplica a nada.
2. Los **porcentajes se suman** con tope de 100 % y se aplican sobre el **precio original**
   (30 % + 20 % = 50 % del precio; no 20 % del ya rebajado).
3. Después se restan los **montos fijos**, uno por uno, hasta agotar el precio.
4. El descuento **nunca supera el precio**.
5. Se devuelve el descuento total y el detalle por beca; la suma del detalle es exactamente el total.
   Cada beca que descontó algo se vuelve un renglón negativo `Beca: <nombre> (<30%|$X>)`.

Ejemplos con colegiatura de $2,450.00:

| Becas | Descuento | Total del cobro |
|---|---|---|
| 30 % | $735.00 | $1,715.00 |
| 30 % + 20 % | $1,225.00 | $1,225.00 |
| 30 % + $200 | $735.00 + $200.00 = $935.00 | $1,515.00 |
| 70 % + 60 % (tope) | $2,450.00 (100 %) | $0.00 → no se crea cobro |
| $5,000 (monto mayor al precio) | $2,450.00 (tope) | $0.00 → no se crea cobro |
| 100 % + $200 | $2,450.00 (el monto ya no aporta) | $0.00 → no se crea cobro |
| 33.33 % + 33.33 % + 33.34 % sobre $1.00 | $1.00 exacto (el redondeo se reparte por diferencia acumulada) | $0.00 |

### En el cron (`cron_recordatorios.php`, bloque 0)

* El renglón del concepto va a **precio completo**; un renglón negativo por cada beca
  (`producto_id` NULL, `precio_unitario` y `subtotal` negativos). `cobros.total` = precio − descuento.
* Los renglones negativos copian el snapshot de IVA / clave SAT / unidad **del concepto**: la
  facturación de OF-2 (`cfdi_armar_renglones`) exige snapshot en todos los renglones, y convierte los
  negativos en `discount` repartido entre los positivos (verificado leyendo la función).
* El correo "Nuevo cobro" muestra el total ya con beca y aclara el descuento.
* **Beca del 100 % → no se crea cobro**, pero el periodo queda marcado (ver abajo).

### Beca del 100 % en el cron

El repositorio **no contiene la definición original** de `pagos_recurrentes_generados` (la migración
`2026_08_20_pagos_recurrentes.sql` no está en `migraciones/`), así que no se pudo comprobar si
`cobro_id` admite NULL. Decisión:

* La migración OF-3 (bloque 5) hace `MODIFY cobro_id <tipo actual> NULL DEFAULT NULL`, leyendo el tipo
  de `information_schema` para no adivinarlo. Es idempotente (si ya admite NULL o la tabla no existe,
  no hace nada).
* El cron inserta una fila **con `cobro_id` NULL** para marcar "este alumno ya se revisó en este
  periodo". Las demás lecturas de la tabla la unen por `cobro_id` con INNER JOIN, así que esa fila no
  aparece como cobro (el recargo, el aviso previo y el cargo automático no la ven).
* Si el `INSERT` falla (migración sin correr, o `cobro_id` es parte de la llave primaria), **no se crea
  ningún cobro** y el resumen del cron dice `AVISO: beca 100% … NO se pudo marcar el periodo`. No hay
  nada que duplicar; lo único que se pierde es la marca.

### Becas y recargos

El recargo por pago tardío se calcula sobre `cobros.total`, que **ya es el total con beca**. Un recargo
en **porcentaje** (p. ej. 10 %) sobre una colegiatura de $2,450 con beca 30 % (total $1,715) es $171.50,
no $245. Un recargo de **monto fijo** no cambia. La beca no se aplica sobre el recargo. Un alumno con
beca del 100 % no genera cobro, por tanto tampoco recargo.

Consecuencia ya existente (de OF-2, no nueva): cuando se aplica un recargo, `cobros.total` deja de
coincidir con la suma de los renglones, y `generar_cfdi` factura ese cobro en un solo renglón (con
aviso en `api_log`).

### Caja

* Al seleccionar un alumno, Caja pide `alumno_becas_listar` (solo admin, cajero y superadmin) y guarda
  las becas activas. Por cada concepto del carrito con precio > 0 (que no sea de categoría `beca`) se
  calcula el descuento sobre `precio × cantidad` (cada línea cuenta como un solo concepto) y se agrega
  el renglón negativo `Beca: <nombre> (<%|$>) · <concepto>`.
* Quitar el renglón con la ✕ lo recuerda mientras siga ese alumno y haya carrito. Cambiar cantidades o
  agregar/quitar conceptos recalcula los renglones automáticos.
* `crear_cobro` **no aplica becas por su cuenta**: lo que viaja es exactamente lo que se ve en el
  carrito, así no se descuenta dos veces. Los renglones de beca viajan con `id` null.
* **Por qué una acción de lectura y no `cargar_datos`:** `cargar_datos` se comparte con
  `control_escolar` y `direccion`, que no deben ver finanzas, y `quitar_campos_financieros()` es una
  lista negra (olvidar una clave nueva la filtraría). La acción nueva exige rol explícito, valida la
  escuela del alumno y solo se llama cuando hay un alumno seleccionado.

## Cancelar un cobro con motivo

`acciones/cancelar_cobro.php` (roles `superadmin`, `admin`, `cajero`; escuela del cobro validada):

* Motivo obligatorio, 5 a 255 caracteres.
* Una transacción con `SELECT … FOR UPDATE` del cobro. Solo cancela si **sigue** en `pendiente` o
  `pagado`; si ya estaba cancelado responde "Este cobro ya estaba cancelado." y no toca el registro de
  la primera cancelación. El `UPDATE` repite la condición de estado.
* Guarda `cancelado_motivo`, `cancelado_por`, `cancelado_en` y `cancelado_monto_recibido`, y recalcula
  `clientes.saldo_pendiente` dentro de la misma transacción.
* **Dinero recibido:** se cuenta `monto_pagado`; si el cobro está `pagado` y `monto_pagado` es menor al
  total (cobros anteriores a los abonos) se cuenta el total. Se permite cancelar, y la respuesta (y el
  modal) avisan: *"Este cobro ya tenía $X recibidos. Cancelarlo NO devuelve el dinero: registra la
  devolución por fuera."* Los abonos de `cobro_abonos` no se tocan.
* **Facturado** (`factura_uuid` no vacío; al cancelar la factura OF-2 lo limpia): el aviso lo dice y
  apunta a Facturación → "Cancelar factura".
* **Recargas de monedero:** se pueden cancelar igual; el barrido de `helpers_monedero.php` revierte el
  saldo acreditado de las recargas canceladas.
* **Sin la migración:** sigue cancelando como antes pero exige el motivo, que queda solo en
  `registrar_log` (la respuesta trae `motivo_guardado: false` y el modal lo aclara).
* El detalle del cobro (`detalle_cobro`, solo para admin/cajero/superadmin) devuelve el bloque `cobro`
  con el estado fresco y el registro de cancelación (motivo, quién, cuándo, dinero recibido).

No toqué la cancelación masiva que hace la baja de un alumno (`lib/helpers_alumnos.php`): sigue
cancelando solo pendientes sin abonos y sin pedir motivo (queda en la bitácora de movimientos del
alumno).

## Folio por abono

* `lib/helpers_pagos.php::aplicar_abono_a_cobro` (único lugar que inserta en `cobro_abonos`): folio =
  folio del cobro + `-` + (abonos que ya tiene el cobro + 1) con 2 dígitos. El `SELECT` del cobro ahora
  lleva `FOR UPDATE` (el llamador ya lo traía bloqueado; si algún camino no lo traía, el número deja de
  poder repetirse). Si el folio del cobro es larguísimo se recorta el cobro, nunca el número.
* Sin la columna (`abonos_col_folio()` consulta `SHOW COLUMNS` una vez por petición) el abono se guarda
  como antes, sin folio.
* **Listados:** `detalle_cobro` y `abonos_sin_complemento_listar` devuelven `folio`; a los abonos viejos
  sin folio se les calcula igual (folio del cobro + número por **orden de id**, el mismo orden que el
  número de parcialidad de los complementos de pago).
* **Backfill opcional** (comentado en la migración, bloque 6): numera los abonos existentes por cobro
  en orden de id; seguro repetirlo (solo toca filas con `folio` NULL). No hace falta correrlo.

## Notas de cobranza

* Acciones (admin, cajero y superadmin de la escuela de la familia; la escuela sale de la familia, nunca
  del input): `familia_notas_listar`, `familia_nota_guardar`, `familia_nota_eliminar` (baja lógica),
  `familia_nota_cumplida`, `compromisos_pago_listar`.
* **Editar o eliminar:** solo el autor o admin / superadmin. **Marcar cumplido:** cualquiera de los tres
  roles de la escuela.
* Un alumno ligado a la nota debe ser hijo de esa familia y de esa escuela.
* `cumplido`: NULL = la nota no es compromiso, 0 = compromiso sin cumplir, 1 = cumplido.
  `compromisos_pago_listar` trae `fecha_compromiso <= hoy` y `cumplido` NULL o 0, con el saldo que la
  familia debe hoy.

## Seguridad / roles

* Acciones nuevas: `alumno_becas_listar` (superadmin, admin, cajero; el modo "colegio" solo admin y
  superadmin), `alumno_beca_guardar` y `alumno_beca_desactivar` (superadmin, admin), y las 5 de notas
  (superadmin, admin, cajero). Todas llaman `requerir_rol` con lista explícita, validan la escuela de la
  fila con `requerir_escuela_propia`, usan la escuela de la fila (nunca `escuela_id` del input salvo el
  superadmin que la manda en los modos "de colegio") y llaman `requerir_seccion_habilitada`.
* **No** se agregaron a `$ACCIONES_POR_ROL_PLATAFORMA`: `control_escolar`, `direccion`, `alumno`,
  `tienda`, `docente`, `familia` y los roles de plataforma tienen allowlist y no las incluyen, así que
  reciben 403 antes de despachar.
* `cargar_datos` **no cambió**: ninguna clave financiera nueva.

## Migración

`migraciones/migracion_2026_11_19_of3_cobranza.sql` — correr **una vez en phpMyAdmin, de preferencia
antes del `git pull`**. Es un solo archivo.

* Crea `alumno_becas` y `familia_notas` (`IF NOT EXISTS`, idempotentes).
* **No idempotentes** (MySQL 5.7 no tiene `ADD COLUMN IF NOT EXISTS`): 4 columnas `cancelado_*` en
  `cobros`, `cobro_abonos.folio` y su índice. Si marcan *Duplicate column name* / *Duplicate key name*,
  ya existen: sáltalas y sigue (cada una va en su propia sentencia).
* Bloque 5 (idempotente): `pagos_recurrentes_generados.cobro_id` admite NULL, conservando su tipo.
* Bloque 6 (opcional, comentado): backfill de folios de abonos.
* Sin FOREIGN KEY, InnoDB utf8mb4.
* **El código tolera que no haya corrido:** sin `alumno_becas` no hay becas (cron y Caja como siempre; el
  botón Becas avisa que falta migrar); sin `cancelado_*` cancelar funciona y exige motivo (queda en la
  bitácora); sin `folio` se calcula al listar; sin `familia_notas` las notas responden "falta correr la
  migración"; sin `cobro_id` NULL el cron avisa en su resumen.

`config.php` no se toca. Versiones de caché: los JS nuevos y los modificados quedaron en `?v=1795800000`
en `index.html` (`BecasAlumno.js`, `NotasCobranza.js`, `Alumnos.js`, `Caja.js`, `Cobros.js`,
`Facturacion.js`, `Familias.js`, `PortalFamilia.js`, `Recordatorios.js`, `CobroController.js`).

## Pruebas manuales (paso a paso)

Con la migración corrida, en un colegio de pruebas con un concepto recurrente de colegiatura
(`categoria = colegiatura`, $2,450, mensual, fecha de inicio ya pasada) y un alumno activo con familia.

**1. Beca 30 % en colegiatura generada por el cron**
1. Alumnos → fila del alumno → **Becas** → *+ Nueva beca*: nombre "Hermanos", Porcentaje 30, aplica a
   Categorías → Colegiatura. La vista previa debe decir *Colegiatura $2,450.00 → $1,715.00 con esta beca*. Guardar.
2. Poner `productos.ultima_generacion` del concepto en un mes anterior (o usar otro mes) y correr
   `php cron_recordatorios.php`.
3. Cobros: el cobro del alumno tiene total $1,715.00; en su detalle, "Conceptos" lista la colegiatura
   $2,450.00 y `Beca: Hermanos (30%)` −$735.00. El saldo del alumno es $1,715.00.

**2. Beca 100 %**
1. Cambiar la beca a 100 % (o crear otra "Beca SEP" 100 % en colegiatura) y borrar la fila del periodo en
   `pagos_recurrentes_generados` + `ultima_generacion` de otro mes para repetir.
2. Correr el cron: el resumen dice `OK beca 100% … periodo marcado`, **no** se crea cobro y
   `pagos_recurrentes_generados` tiene una fila con `cobro_id` NULL. Correr el cron otra vez (con
   `ultima_generacion` atrasada): no hay duplicado.
3. Si la migración (bloque 5) no se corrió: el resumen dice `AVISO … NO se pudo marcar el periodo` y
   tampoco hay cobro.

**3. Dos becas sumadas**
1. Alumno con 30 % + 20 % sobre colegiatura: el cobro generado queda en $1,225.00 con dos renglones
   negativos (−$735.00 y −$490.00).
2. Agregar además una beca de monto fijo $200: descuento total $1,425.00 (30 % + 20 % = $1,225.00, luego $200).

**4. Beca en Caja**
1. Caja → seleccionar al alumno con beca activa → agregar "Colegiatura" (un concepto NO recurrente de
   categoría colegiatura): aparece sola la línea `Beca: Hermanos (30%) · Colegiatura` en negativo y el total baja.
2. Subir la cantidad a 2: el descuento se recalcula. Quitar la línea con la ✕: el total vuelve al
   precio completo y no reaparece.
3. Cobrar: el cobro creado trae el renglón negativo con su nombre (y no se descuenta dos veces).

**5. Cancelar un cobro**
1. *Sin abonos:* Cobros → abrir un cobro pendiente → **Cancelar cobro**. Con el motivo vacío o de menos
   de 5 caracteres el botón está deshabilitado. Escribir un motivo y confirmar: el cobro queda
   cancelado, el saldo del alumno baja; el detalle muestra motivo, quién y cuándo. Intentar cancelarlo
   otra vez por API: "Este cobro ya estaba cancelado."
2. *Con abonos:* cobro de $1,000 con un abono de $400. Al abrir el modal aparece *"Este cobro ya tiene
   $400.00 recibidos. Cancelarlo NO devuelve el dinero…"*. Tras cancelar, el detalle muestra
   "Tenía $400.00 recibidos al cancelarse"; los abonos siguen en el desglose.
3. *Facturado:* cobro con factura vigente → el modal agrega el aviso con el folio fiscal y dirige a
   Facturación → "Cancelar factura". Tras cancelar el cobro, la factura sigue vigente hasta cancelarla ahí.
4. *Sin migración:* (en una copia) cancelar funciona, pide motivo, y `logs_sistema` guarda el motivo.

**6. Folios de abonos**
1. Pagar un cobro en 3 abonos (SPEI parcial o abono manual): los folios son `FOLIO-01`, `FOLIO-02`,
   `FOLIO-03` en el desglose de abonos del cobro (Cobros), en Facturación → "Complementos pendientes"
   (si está facturado como PPD) y en el visor de complementos.
2. Abonos **viejos** (anteriores a la migración): se listan con folio calculado (cobro + número por id).
   Un abono **nuevo** de ese mismo cobro continúa la numeración (`-04`).
3. (Opcional) correr el backfill comentado y confirmar que los folios guardados coinciden con los calculados.

**7. Notas y compromisos**
1. Familias → *Notas de cobranza* → nueva nota tipo Llamada, marcar "La familia se comprometió a pagar",
   fecha de hoy y monto → aparece en la línea de tiempo con autor y fecha.
2. Recordatorios: el bloque **Compromisos de pago de hoy y vencidos** muestra la familia, lo prometido y
   lo que debe hoy; con un compromiso de ayer sale como *Vencido*.
3. **Cumplido** (en el bloque o dentro de la nota): el compromiso desaparece del bloque.
4. Entrar como otro cajero: puede ver y marcar cumplido, pero no editar ni eliminar la nota de otro (sí
   un admin). Eliminar una nota (baja lógica): desaparece de la línea de tiempo y la fila sigue en la base.
5. Desde el detalle de un cobro, **Notas de cobranza** abre las notas de la familia del alumno.

## Riesgos

* **`pagos_recurrentes_generados.cobro_id` NULL:** no se pudo verificar la definición original (ver
  arriba). Mientras el bloque 5 no corra, la beca de 100 % no marca el periodo (no hay cobro, pero el
  aviso aparece en el resumen del cron).
* **Beca y facturación con varios conceptos (Caja):** el CFDI convierte los renglones negativos en
  `discount` repartido **proporcionalmente entre todos los renglones positivos** del cobro, no solo el
  concepto al que aplica la beca. Con conceptos de distinta tasa de IVA el desglose por tasa se reparte
  proporcionalmente (es el comportamiento de OF-2 para cualquier descuento). Con el cron hay un solo
  concepto, así que no hay efecto.
* **Recargo y factura:** ver "Becas y recargos".
* **Doble implementación del cálculo** (PHP en el cron, JS en Caja y la vista previa): hay que mantenerlas
  iguales. Probadas con los mismos casos (tabla de ejemplos).
* **Fecha:** el cron usa la fecha del servidor para la vigencia; Caja y la vista previa, la del navegador.
  Cerca de medianoche pueden discrepar un día en el último día de vigencia.
* **Caja confía en el navegador para las becas:** el servidor no las valida ni las aplica (decisión del
  diseño para no descontar dos veces); un cajero puede quitar la línea o, en teoría, agregar un renglón
  negativo a mano, igual que antes de OF-3.
* **`FOR UPDATE` en `aplicar_abono_a_cobro`:** cambia la lectura del cobro a "última versión confirmada"
  y mantiene el candado hasta el final de la transacción del llamador (ya lo traían bloqueado). No
  cambia ninguna invariante de dinero; conviene vigilar los primeros pagos reales por si aparece algún
  *lock wait timeout*.
* **Cancelar un cobro `pagado` sin dinero registrado** (anterior a los abonos): se asume cobrado el total
  para el aviso y para `cancelado_monto_recibido`.
* **Descuento mensual estimado** de "Becas del colegio": es una estimación (becas vigentes hoy × conceptos
  recurrentes activos × alcance del concepto, dividido entre la periodicidad); no es lo facturado.
* **No se pudo ejecutar contra MySQL** (ver el reporte): la migración, las consultas y los flujos de la
  interfaz se probaron solo con lint y pruebas unitarias de las funciones puras.
