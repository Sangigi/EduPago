# OF-6 — Inventario con existencias

Para lo que el colegio vende **físicamente** (uniformes, libros, material, productos de la tiendita): cuántas piezas hay, entradas de mercancía, conteo físico y avisos de "se acabó / queda poco". La idea viene de OF-LIBERTYFIN; aquí se tomó la idea, no la arquitectura.

**El inventario no mueve dinero.** No toca cobros, abonos, saldos ni el monedero: solo cuenta piezas.

## 1. Qué se controla (y qué no)

| Qué | Dónde se activa | Notas |
|---|---|---|
| **Conceptos de pago** físicos (`productos`) | casilla "Maneja existencias" en Conceptos de pago, o el botón "Controlar" en Inventario | solo categorías `uniforme`, `material`, `comedor` y `otro`; únicos (no recurrentes); precio ≥ 0 |
| **Productos de la tiendita** (`tienda_productos`) | botón "Controlar" en Inventario → Existencias | todos los productos del catálogo de la tiendita |

Una **colegiatura, inscripción, anualidad, examen, beca, transporte o extracurricular nunca maneja existencias**: el servidor lo rechaza aunque alguien llame la API a mano (`inventario_concepto_elegible()` en `lib/helpers_inventario.php`). Si un concepto con existencias se cambia después a una categoría de servicio, se rechaza el cambio hasta apagar el control.

### Tallas: cada talla es su propio producto

Esta versión **no tiene variantes**. "Playera deportiva T8" y "Playera deportiva T10" son dos conceptos, cada uno con su existencia. Para crear la siguiente talla sin capturar todo otra vez, Inventario → Existencias → **Duplicar como otra talla**: copia categoría, precio, emoji y datos fiscales (IVA, clave SAT, unidad), deja el control activo, existencia 0 y el mismo mínimo. Recomendación: pon la talla en el nombre y ordena el catálogo por nombre para que queden juntas.

## 2. Cómo activarlo, concepto por concepto

1. **Antes**, aplicar la migración (sección 7). Sin ella no pasa nada: el sistema funciona como siempre.
2. Conceptos de pago → editar (o crear) el concepto → marcar **Maneja existencias (inventario)**. La casilla solo aparece con categoría física y concepto único.
3. En Inventario → Existencias aparece con existencia 0. Captura lo que hay con un **conteo físico** (lo más práctico la primera vez) o con una **entrada**.
4. Poner el **mínimo** (campo en la fila): a partir de ahí avisa "queda poco". Con mínimo 0 solo avisa cuando se acaba.

Desmarcar la casilla (o "Dejar de controlar") deja de descontar con las ventas; **no borra** la existencia ni el historial.

## 3. Los flujos

Todo movimiento es una fila del **libro** (`inventario_movimientos`); la existencia (`inventario_existencias.existencia`) es un caché que se recalcula **desde el libro** en cada movimiento, dentro de una transacción con el renglón bloqueado (`FOR UPDATE`) — el mismo patrón del monedero. Cada movimiento tiene una `idem_key` única: un reintento (doble clic, cobro cancelado dos veces) no mueve piezas dos veces.

| Movimiento | Quién lo escribe | idem_key | Cantidad |
|---|---|---|---|
| `entrada` | Inventario → Entradas (`inventario_entrada`) | `entrada:<hash>:<renglón>` | + |
| `venta` | `acciones/crear_cobro.php` (Caja y portal) | `venta_cobro:<cobro>:<producto>` | − |
| `venta` | `acciones/tienda_vender.php` | `venta_tienda:<venta>:<producto>` | − |
| `devolucion` | `acciones/cancelar_cobro.php` | `devol_cobro:<cobro>:<producto>` | + |
| `devolucion` | `acciones/tienda_cancelar_venta.php` | `devol_tienda:<venta>:<producto>` | + |
| `ajuste` | Existencias → Ajuste (`inventario_ajuste`), con motivo obligatorio | `ajuste:<hash>:0` | ± |
| `conteo` | Inventario → Conteo físico (`inventario_conteo`) | `conteo:<hash>:<renglón>` | ± (la diferencia) |

### Entrada de mercancía

Inventario → Entradas: uno o varios productos (hasta 30), piezas, **costo unitario opcional**, **proveedor opcional** (de la tabla de proveedores del colegio) y una nota. Casilla **"Registrar también como gasto"**: crea el gasto por el total de la compra (`piezas × costo` de todos los renglones), ligado al proveedor, con la forma de pago y la fecha que elijas. El gasto se inserta con **el mismo SQL y las mismas validaciones que `acciones/crear_gasto.php`** (proveedor del mismo colegio, forma de pago de la lista, fecha válida, monto > 0, sección Gastos habilitada); para registrarlo hace falta el costo unitario de todos los renglones. Piezas y gasto van en **una sola transacción**: o entra todo o no entra nada. El movimiento guarda el `gasto_id`, y el último costo queda en la fila del producto.

### Venta (Caja y tiendita) y cancelación

- Al crear un cobro en Caja con renglones de conceptos que manejan existencias se registra una `venta` por producto (suma las piezas si el producto aparece en varios renglones). Un renglón cuyo producto no maneja existencias, o es de otro colegio, se ignora.
- Si ese cobro se **cancela** (con su motivo, OF-3) se registra la `devolucion` por **las mismas piezas que descontó** (se lee del libro). Si el cobro no había descontado nada (era anterior al inventario, o el inventario falló entonces), **no devuelve nada**: nunca se devuelve lo que no se descontó. El mensaje de cancelación avisa "Se regresaron N pieza(s) al inventario".
- La tiendita igual: `tienda_vender` descuenta, `tienda_cancelar_venta` devuelve.
- **Las importaciones de OF-5 y el cron de recurrentes no mueven inventario.**
- Todo va **después** del commit de la venta/cobro y en try/catch: **si el inventario falla, la venta o el cobro NO se caen**. El detalle queda en el log (`api_log.txt`, líneas `INVENTARIO …`) y el detector de incoherencias lo marca (sección 6).
- Un cobro que se cancela por otras vías (el proveedor de pagos que cancela una referencia vencida, por ejemplo) no devuelve piezas: esos caminos no pasan por `cancelar_cobro.php`. Si pasa, un ajuste o el siguiente conteo lo corrige.

### Conteo físico

Inventario → Conteo físico: una hoja con cada producto, su existencia actual y un campo **Contado**. Lo que no capturas no se toca. Con un motivo obligatorio ("Inventario de noviembre") y una confirmación que muestra las diferencias, al aplicar la existencia de cada producto **queda exactamente en lo contado**: se escribe un movimiento `conteo` por la diferencia (contado − existencia en ese momento, calculada del libro y bajo candado). Los que coinciden no escriben nada. Todo en una transacción.

Si se vendió mientras contabas, la respuesta lista esos productos ("la hoja decía 20 y había 19"): conviene contar con la tienda cerrada o repasar esa lista.

## 4. Existencias negativas

**Una venta nunca se bloquea por falta de existencia.** El producto puede estar físicamente en el anaquel aunque el conteo esté mal, y frenar al cajero por un número equivocado es peor que mostrarlo. Entonces:

- la existencia puede quedar **negativa**;
- se muestra en **rojo** ("(negativa)") en Inventario, con un aviso arriba de la tabla;
- cuenta como **agotado** (≤ 0) en los avisos, y el aviso del Dashboard sube a color rojo cuando hay negativos;
- se corrige con un **conteo físico** (que la lleva a lo real) o un **ajuste** con motivo.

## 5. Avisos y dónde se ve la existencia

- **Dashboard del admin**: tarjeta "Inventario: N productos agotados y M con queda poco".
- **Menú → Inventario**: contador rojo = agotados + queda poco.
- Los dos salen de **una sola consulta agregada** (`inventario_alertas_contar()`), que viaja dentro de `cargar_datos` (solo para admin): no es una consulta por producto, porque el aviso se pide en cada carga del panel y una consulta por producto se pagaría cientos de veces. Solo cuentan productos **activos** con control.
- **Caja**: cada concepto controlado muestra "N en existencia" o **"Agotado"** en rojo (≤ 0), solo lectura, sin bloquear.
- **Tiendita** (`Tienda.js`, rol `tienda` y admin): igual en el catálogo, vía `tienda_productos_listar`.

## 6. Detector de incoherencias (Diagnóstico → Incoherencias)

Dos reglas nuevas en `lib/helpers_diagnostico.php`, cada una en su `try/catch` (sin la migración dicen "no disponible"):

1. **Existencia de inventario ≠ suma del libro** (severidad media): el caché no coincide con el libro. El siguiente movimiento del producto lo corrige (parte del libro), o un conteo.
2. **Ventas de productos con existencias sin movimiento de inventario**: cobros (Caja/portal) o ventas de tiendita de productos controlados, posteriores al **primer movimiento** del producto, que no tienen su `venta_*`. Significa que el inventario falló esa vez (mira el log). Excluye los cobros de importaciones de saldos. En el primer día de control puede dar un falso positivo (un cobro de la mañana, anterior a la entrada de la tarde).

## 7. Migración y despliegue

Archivo de documentación: `migraciones/migracion_2026_11_20_of6_inventario.sql`. Pasos registrados en `lib/migraciones.php` (ids `2026_11_20_of6_01` a `_04`):

1. `productos.maneja_existencias TINYINT(1) NOT NULL DEFAULT 0`
2. `tienda_productos.maneja_existencias TINYINT(1) NOT NULL DEFAULT 0`
3. tabla `inventario_existencias` (`UNIQUE (tipo, item_id)`)
4. tabla `inventario_movimientos` (`UNIQUE (idem_key)`)

Sin backfill: nada se controla hasta que el admin lo marque. Las dos columnas son `ADD COLUMN … DEFAULT 0` sobre tablas chicas (conceptos y catálogo de la tiendita); las tablas son nuevas.

```
git pull
php herramientas/migrar.php            # muestra qué falta; no cambia nada
php herramientas/migrar.php --aplicar
```

o Diagnóstico → Base de datos → Aplicar pendientes (superadmin). Si el `.sql` se pega a mano en MySQL 5.7, las dos primeras sentencias fallan con "Duplicate column name" cuando ya existen: usa el migrador.

**Antes de aplicar la migración el código tolera su ausencia**: `inventario_listo()` es falso, las ventas no intentan mover inventario, `cargar_datos` no manda existencias, Inventario responde "falta aplicar las migraciones" y la casilla de Conceptos de pago responde lo mismo si se marca.

### Permisos

Acciones nuevas (todas llaman `requerir_rol` por `inventario_ctx()`, toman el colegio de la sesión —el superadmin manda `escuela_id`— y validan que el producto sea del colegio): `inventario_listar`, `inventario_activar`, `inventario_minimo`, `inventario_entrada`, `inventario_ajuste`, `inventario_conteo`, `inventario_movimientos`, `inventario_duplicar`. Están en la lista del rol `admin` de `$ACCIONES_POR_ROL_PLATAFORMA`. **cajero** y **tienda** no necesitan acciones nuevas: ven la existencia (solo lectura) dentro de `cargar_datos` y `tienda_productos_listar`. Las escrituras exigen además la sección `inventario` habilitada para el colegio (nueva en `SECCIONES_DISPONIBLES`; el superadmin puede apagarla por colegio).

## 8. Pruebas manuales, paso a paso

Con la migración aplicada, como **admin** de un colegio de prueba que tenga un concepto "Playera T8" (categoría Uniforme, $450) y un producto de tiendita "Sándwich":

1. **Activar.** Conceptos de pago → editar "Playera T8" → marcar *Maneja existencias* → Guardar. Menú → Inventario: aparece con existencia 0, "Agotado". El menú muestra el contador rojo (1). Intenta lo mismo con una colegiatura: la casilla no aparece.
2. **Entrada.** Entradas → Producto "Playera T8", 20 piezas, costo 120.50, un proveedor, casilla *Registrar también como gasto* (Transferencia) → Registrar. Existencias muestra 20 y "Ok"; en Gastos hay un gasto por $2,410.00 ligado al proveedor; Movimientos muestra la entrada con proveedor, costo y gasto. Pulsa de nuevo el botón con la misma pantalla abierta: no duplica.
3. **Mínimo.** En la fila de "Playera T8" pon mínimo 18 → pasa a "Queda poco" y el aviso del Dashboard dice "1 con queda poco".
4. **Venta.** Caja → cobra 3 "Playera T8" a un alumno: en el selector se veía "20 en existencia"; después 17. Movimientos: *Venta* −3 con el folio del cobro.
5. **Cancelación.** Historial de cobros → cancela ese cobro con motivo: el aviso dice "Se regresaron 3 pieza(s) al inventario"; existencia 20. Cancelar otra vez no devuelve otras 3.
6. **Negativo.** Cobra 25 playeras: la venta pasa, la existencia queda en −5 en rojo "(negativa)", Caja muestra "Agotado", el Dashboard sube a rojo.
7. **Conteo.** Conteo físico → captura 15 en "Playera T8" y motivo "Inventario de noviembre" → Aplicar conteo → confirma: existencia 15, Movimientos muestra *Conteo* +20 con ese motivo.
8. **Ajuste y talla.** Ajuste −1 con motivo "Pieza dañada" → 14. *Duplicar como otra talla* → "Playera T10": aparece con existencia 0, mismo precio, y en Conceptos de pago también.
9. **Tiendita.** Inventario → Existencias → "Controlar" el Sándwich; cuenta 30; vende 2 desde Tiendita (el catálogo muestra "30 en existencia" y luego 28); cancela la venta → 30.
10. **Otro rol.** Como **cajero**: Caja muestra existencias pero no hay menú Inventario; llamar `inventario_listar` por API da 403. Como **tienda**: ve la existencia en su catálogo.
11. **Detector.** Superadmin → Diagnóstico → Incoherencias: las dos reglas de inventario salen en 0.

## 9. Cómo se probó

Ver el informe de la fase: pruebas puras en `herramientas/pruebas.php` (cantidades, llaves de idempotencia, plan de conteo, secuencias de movimientos) y un recorrido completo contra MySQL local (entradas con gasto, ventas, cancelaciones, conteo, negativos, concurrencia de tres procesos vendiendo la misma pieza, y venta/cobro con el inventario roto a propósito).

## 10. Límites conocidos

- Sin variantes (tallas): ver sección 1.
- Un solo almacén por colegio: no hay traspasos entre planteles.
- La cancelación de cobros por vías distintas de `cancelar_cobro.php` no devuelve piezas (sección 3).
- Un cobro **pendiente** ya descontó piezas al crearse (igual que la deuda del alumno); si nunca se paga y se cancela, las piezas regresan en la cancelación.
- El conteo no es una sesión que se pueda dejar a medias: se captura la hoja y se aplica de una vez (lo capturado y no aplicado se pierde al salir de la pestaña).
