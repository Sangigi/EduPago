# OF-5 — Importar adeudos y saldos iniciales

Rama `mejoras-of` · 20-nov-2026

## Para qué sirve

Un colegio que empieza a usar la plataforma a mitad de ciclo ya tiene familias que le deben algo. `importar_alumnos` crea alumnos con saldo 0; hasta ahora había que capturar cada adeudo a mano. Aquí se sube **un archivo (CSV o XLSX)**, se ve una **vista previa** y, solo entonces, se crean los cobros. Idea tomada del importador de ventas de OF-LIBERTYFIN (analizar → ajustar → aplicar).

Se abre desde **Alumnos → "Importar adeudos"** (solo admin y superadmin, con una escuela elegida). Tiene dos pestañas: **Importar** (asistente de 3 pasos) e **Importaciones** (historial con "Deshacer").

## Qué se importa — y qué NO

* Se importa el **saldo pendiente**, no el historial de pagos. Por cada renglón válido se crea **un cobro `pendiente`** cuyo total es `monto − abonado`, con `metodo = 'Pendiente'` (igual que los cobros del cron de recurrentes), `fecha` = la fecha de emisión del archivo (o hoy) y un renglón en `cobro_items` con el concepto, creado con `impuestos_insertar_item` (hereda IVA y clave SAT del concepto de pago si se ligó uno).
* **NO se crean abonos** (`cobro_abonos`). Ese dinero no entró por la plataforma: no genera complementos de pago ni aparece en el corte de caja. `monto_pagado` queda en 0.
* El saldo del alumno se recalcula con `recalcular_saldo_pendiente` (por alumno, al terminar cada lote).
* La leyenda "Saldo inicial importado (original $X, abonado $Y)", el folio externo, el vencimiento y el número de renglón del archivo quedan en `importaciones_saldos_filas` (visibles en **Importaciones → Detalle**). **No** se escriben en `cobros`: `cobros.referencia` la usan SPEI/ligas/efectivo para casar pagos, `cobro_items.nombre` se vuelve la descripción de la factura, y `cobros` no tiene columna de vencimiento. El vencimiento es solo informativo (el cron de recordatorios no lo usa para cobros sin producto recurrente).
* Los cobros importados **no** disparan recargos ni avisos automáticos del cron (esos solo miran cobros ligados a `pagos_recurrentes_generados`).

## Formato del archivo

CSV (UTF-8 con o sin BOM, UTF-16 de Excel o Windows-1252; separador coma, punto y coma o tabulador, detectado solo) o XLSX (si PHP trae la extensión `zip`; si no, el sistema pide "guárdalo como CSV"). La primera fila con contenido son los encabezados. Hasta **5,000 renglones y 5 MB**.

Las columnas se reconocen **por nombre**, sin importar mayúsculas, acentos ni el orden:

| Campo | Nombres reconocidos (algunos) | Obligatorio |
|---|---|---|
| matrícula | Matrícula, No. de matrícula, ID alumno | sí (o el nombre) |
| alumno | Alumno, Nombre del alumno, Nombre | alternativa a la matrícula |
| concepto | Concepto, Descripción, Detalle | no (default "Saldo inicial") |
| monto | Monto, Importe, Total, Adeudo, Saldo, Pendiente | sí |
| abonado | Abonado, Abono, Pagado, Anticipo | no |
| fecha | Fecha, Fecha de emisión | no (default hoy) |
| vence | Vence, Vencimiento, Fecha de vencimiento | no |
| folio | Folio, Folio externo, Referencia, Recibo | no |

Si el archivo trae "Total" y "Saldo" a la vez, gana "Total" como `monto`; usa el selector de columnas del paso 2 para cambiarlo. Si una columna no se reconoce, en el paso 2 se mapea a mano.

Ejemplo (hay plantilla descargable en el asistente):

```
Matrícula,Alumno,Concepto,Monto,Abonado,Fecha,Vence,Folio
2024-001,Ana López Pérez,Colegiatura septiembre,1500.00,500.00,01/09/2026,10/09/2026,F-123
2024-002,,Uniforme,800,,,,
```

* El alumno se busca **solo en la escuela del usuario**, activo o inactivo (inactivo = advertencia). Por matrícula (Excel suele quitar los ceros: `0123` y `123` se igualan si no hay ambigüedad); si no hay matrícula, por nombre exacto (sin acentos/mayúsculas). Matrícula o nombre repetidos en el colegio = error (ambiguo).
* Dinero: `1500`, `1,500.00`, `$1.500,50`, `1500,5`. Un solo separador con exactamente 3 dígitos detrás (`1,500`, `1.500`) se toma como miles. Negativos, texto o más de 2 decimales = error.
* Fechas: día/mes/año (`05/09/2026`, `5-9-26`) o año-mes-día. Una fecha de emisión ilegible es error; un vencimiento ilegible solo avisa.

## Los tres pasos

1. **Analizar** (`importar_saldos_analizar`): sube el archivo y devuelve el plan **sin escribir nada**: por renglón el alumno encontrado, concepto, monto a importar, errores (alumno no encontrado, monto inválido, abonado mayor que el monto, fecha inválida…), advertencias, y estado `ok` / `omitida` (saldo 0, repetido, ya importado) / `error`; más totales y, por cada concepto distinto, una **sugerencia de concepto de pago** (por nombre igual/parecido, palabras en común o categoría; los dados de baja no se sugieren).
2. **Ajustar** (en la pantalla): corriges el mapeo de columnas (se vuelve a analizar el mismo archivo) y eliges, para cada concepto, un concepto de pago o "sin concepto ligado" (el renglón queda sin `producto_id` y se factura como hoy). La sugerencia viene preseleccionada pero **solo cuenta lo que quede elegido al aplicar**; un producto de otra escuela se ignora.
3. **Aplicar** (`importar_saldos_aplicar`): **vuelve a leer y analizar el archivo** (nunca confía en renglones que mande el navegador), crea los cobros en transacciones de 200, y registra la importación. Va con un candado por escuela (`GET_LOCK`): dos "Aplicar" a la vez no pueden duplicar. La pantalla manda cuántos cobros y qué monto vio en la vista previa; si ya no coinciden, rechaza y pide revisar de nuevo.

Si un lote falla, ese lote se revierte completo; los anteriores quedan y la importación aparece en el historial con lo que sí se creó. Volver a subir el mismo archivo importa solo lo que falte.

El folio de cada cobro usa el formato de `crear_cobro` (`CLAVE-0001`) tomando el mayor entre "cobros de la escuela + 1" y "el número más alto ya usado + 1", dentro de la transacción de cada lote.

## Idempotencia (no duplicar)

Cada renglón tiene una **huella** (SHA-1 de: escuela + **alumno** + concepto normalizado + **monto original** + fecha + folio externo), guardada en `importaciones_saldos_filas` con `UNIQUE (escuela_id, huella)`. Dos matices a propósito:

* Entra el **id del alumno ya resuelto** (no el texto de la matrícula) para que "0123", "123" y el nombre den la misma huella.
* Entra la fecha **que traía el archivo** (vacía si no traía), no la de "hoy" con que se completa: si no, subir el mismo archivo mañana lo importaría otra vez. Entra el monto original (no el pendiente): corregir solo la columna "abonado" y resubir sigue siendo el mismo renglón.

Salen como "ya importado" los renglones cuya huella existe, y como "repetido" los que se repiten dentro del archivo (si de verdad son dos cargos iguales, agrega un folio que los distinga).

## Deshacer (`importar_saldos_deshacer`)

Solo si **ninguno** de los cobros de la importación recibió pagos (`monto_pagado = 0`) ni dejó de estar pendiente. En una transacción con la importación y sus cobros bloqueados: cancela los cobros con el motivo **"Importación deshecha"** (columnas `cancelado_*` de OF-3 si existen; si no, solo el estado y el motivo queda en la bitácora), recalcula los saldos, libera las huellas (`huella = NULL`, `deshecha = 1`, para poder reimportar) y marca la importación `deshecha`. Un cobro ya cancelado a mano no estorba. Si alguno ya recibió pago, no deja deshacer y devuelve cuáles (folio, alumno, motivo). Los cobros no se borran.

## Permisos y registro

`admin` y `superadmin` (el superadmin manda `escuela_id`; el admin siempre usa el suyo). Las cuatro acciones llaman `requerir_rol`, validan la escuela (la de la fila en `deshacer`) y la sección `cobros`, y están en la lista de `admin` de `$ACCIONES_POR_ROL_PLATAFORMA`. `registrar_log` en aplicar (`importacion_saldos_aplicada`) y deshacer (`importacion_saldos_deshecha`). Validación del archivo: tamaño, extensión (csv/txt/xlsx), MIME real con `finfo`, firma ZIP para XLSX, límite de tamaño por parte descomprimida y sin DTD/entidades en el XML.

## Migración

`migraciones/migracion_2026_11_20_of5_importar.sql` (documentación) y pasos `2026_11_20_of5_01` y `_02` en `lib/migraciones.php`: dos tablas nuevas, `importaciones_saldos` e `importaciones_saldos_filas` (tabla puente, **no** se altera `cobros`). Despliegue: `git pull` y `php herramientas/migrar.php --aplicar`. Sin la migración las cuatro acciones responden "falta aplicar la migración" y nada más del sistema cambia.

## Pruebas

Automáticas, sin base (`php herramientas/pruebas.php importar`; con `-d extension=zip` también corre la de XLSX): codificación y separador, CSV, encabezados, mapeo, montos, fechas, pendiente, huella, plan completo (alumno inactivo/ambiguo/no encontrado, errores, repetidos, ya importados), sugerencias, límites de archivo.

Contra MySQL 8.4 local, en una base de prueba creada y descartada (flujo completo con las acciones reales): sin migración; roles (cajero 403, admin de otra escuela 403); analizar no escribe; aplicar crea 3 cobros con folios sin repetir, items con y sin snapshot de IVA, saldos recalculados y **0 abonos**; segundo "aplicar" del mismo archivo no duplica; archivo que repite un renglón importa solo el nuevo; candado por escuela; deshacer con pago rechazado indicando el cobro; deshacer sin pagos cancela con motivo y quién; reimportar después de deshacer; lote que falla se revierte; 5,000 renglones: analizar 0.13 s, aplicar 2.8 s.

### Pruebas manuales sugeridas

1. **Archivo correcto:** plantilla con 3 alumnos reales → vista previa → elegir conceptos → aplicar. Revisar Cobros (pendientes, total = monto − abonado) y el saldo en Alumnos.
2. **Con errores:** matrícula inexistente, monto "abc", abonado mayor, fecha 31/02, renglón con saldo 0. Deben salir marcados y no importarse; el resto sí.
3. **Repetido:** subir otra vez el mismo archivo → todo "ya importado"; aplicar responde "no hay renglones para importar".
4. **Deshacer sin pagos:** Importaciones → Deshacer → cobros cancelados con "Importación deshecha", saldos de vuelta.
5. **Deshacer con pagos:** cobrar (aunque sea parcial) uno de los cobros importados → Deshacer muestra cuáles tienen pago y no cancela nada.
6. **Sin zip:** con PHP sin `ZipArchive`, subir un .xlsx → mensaje "guárdalo como CSV".

## Lo que no se pudo verificar

* MySQL 5.7 de producción (solo hay 8.4 local; el SQL es el mismo estilo de las demás migraciones) y PHP 8.4.
* Lectura de un `.xlsx` real generado por Excel/LibreOffice (se probó con un XLSX mínimo armado a mano).
* El asistente en un navegador real (se verificó sintaxis y un renderizado de prueba con React simulado, no la interacción).
* La subida multipart por HTTP real (`is_uploaded_file`): las pruebas con base ejecutan las acciones sustituyendo solo esa llamada.
