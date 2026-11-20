# OF-7a — Soporte dentro de la plataforma: tickets y Ayuda

Rama `mejoras-of-7` · 20-nov-2026

Hasta hoy un colegio no tenía cómo pedir ayuda desde el sistema. Esta fase agrega:

1. **Tickets de soporte**: el colegio abre un ticket (con archivos), soporte lo atiende desde una bandeja
   con todos los colegios, y los dos lados se avisan por correo.
2. **Ayuda**: artículos y novedades que escribe soporte y que lee el colegio, con buscador y un punto
   "nuevo" en el menú.

Las **familias no usan tickets** en esta fase (ni ven la Ayuda).

## Roles

| Rol | Qué puede |
|---|---|
| `admin`, `cajero` (colegio) | Crear tickets de **su** escuela, ver **todos** los de su escuela (no solo los que abrió), responder, adjuntar archivos, marcar **resuelto** y reabrir un resuelto. Ver los artículos publicados para su rol y las novedades. **Nunca** ven notas internas, ni quién de soporte tiene el ticket, ni la prioridad. |
| `soporte`, `superadmin` | Bandeja de **todos** los colegios con filtros, asignarse un ticket (o asignarlo a otro del equipo), responder, escribir **notas internas**, cambiar estado y prioridad. Crear y editar artículos y novedades. |
| `familia`, `alumno`, `docente`, etc. | Nada (403). |

## Cómo se ve

**Colegio** (menú *Configuración → Ayuda*, solo admin y cajero). Tres pestañas:

- *Mis tickets*: lista de los tickets de su colegio (Abiertos / Todos / Resueltos). Los que tienen una respuesta de
  soporte sin leer salen en negritas con *Respuesta nueva*. *+ Nuevo ticket* pide asunto, categoría
  (Cobros y caja, Facturación, Control escolar, Mi cuenta y accesos, Otro), mensaje y adjuntos opcionales. Al abrir un
  ticket se ve la conversación, se responde y se puede *Marcar como resuelto* (o *Reabrir*). Si el colegio responde a un
  ticket resuelto, se reabre solo.
- *Artículos*: los publicados para su rol, con buscador (filtra en el navegador por título y texto).
- *Novedades*: avisos de lo nuevo. Abrir la pestaña las marca como vistas.

El ítem **Ayuda** del menú muestra un número rojo con los tickets que tienen respuesta de soporte sin leer o, si no hay
ninguno, un **punto verde** mientras haya novedades sin ver. Se lee con `soporte_resumen` al entrar y cada 2 minutos.

**Plataforma** (menú *Superadmin → Tickets de soporte*, con un contador de tickets sin respuesta). Dos pestañas:

- *Bandeja de tickets*: todos los colegios. Orden: los resueltos al final; antes, los que el colegio escribió y **nadie ha
  contestado**, y dentro de cada grupo el **más viejo primero**. La columna *Espera* muestra la antigüedad desde el último
  mensaje (en rojo si un ticket sin respuesta lleva más de un día) y un punto rojo marca lo que ese usuario no ha abierto.
  Filtros: estado, categoría, colegio, asignación y búsqueda por asunto. Al abrir un ticket: cambiar estado, prioridad
  (normal/alta) y asignación; responder (eligiendo en qué estado queda: *Esperando al colegio* por omisión, *En proceso* o
  *Resuelto*) o marcar *Nota interna*.
- *Artículos y novedades*: lista, editor con vista previa, roles que lo ven (administrador, cajero) y casilla *Publicado*
  (sin ella es un borrador que nadie del colegio ve).

### Estados

`abierto` → `en_proceso` → `esperando_cliente` → `resuelto` (soporte puede pasar a cualquiera). Reglas (función pura
`soporte_estado_tras_mensaje()`, con pruebas):

- Soporte responde: queda `esperando_cliente` (o el estado que haya elegido). Una aclaración a un ticket ya resuelto no lo reabre.
- El colegio responde: un ticket `resuelto` pasa a `abierto`; uno que esperaba al colegio pasa a `en_proceso`.
- Una **nota interna** nunca cambia el estado ni cuenta como respuesta al colegio.
- "Sin respuesta" = lo último que se escribió (en público) es del colegio y el ticket no está resuelto.

## Formato del texto de los artículos

Texto plano con formato mínimo: párrafos separados por una línea en blanco, listas con `- ` al inicio del renglón y
`**negritas**`. La vista lo pinta **construyendo elementos de React** (`<p>`, `<ul>`, `<li>`, `<strong>`); no hay
`innerHTML` ni `dangerouslySetInnerHTML`. Un `<script>` escrito en un artículo (o un `<b>` en un ticket) se ve como texto.

## Notas internas: cómo se garantiza que el colegio no las ve

La regla se aplica **en el servidor**, no escondiéndolas en la pantalla:

- `soporte_condicion_interno()` (`lib/helpers_soporte.php`) es la única definición: para cualquier rol que no sea
  `soporte`/`superadmin` agrega `AND m.interno = 0`. La usan **la consulta de mensajes y la de adjuntos**
  (`soporte_ticket_ver`); una nota interna ni siquiera sale de la base hacia ese usuario.
- `soporte_adjunto_descargar`: si el adjunto es de una nota interna, un usuario de colegio recibe el mismo 404 que si no existiera.
- `soporte_ticket_responder`: el campo `interno` **solo se lee si quien escribe es de plataforma**; si un admin lo manda, se ignora y el mensaje sale público.
- Una nota interna **no manda correo** a nadie ni cambia lo que el colegio ve como "no leído".
- Al colegio tampoco se le manda el nombre ni el correo de quien de soporte contesta: ve "Soporte EduPago".

## Aislamiento entre colegios

`soporte_ticket_cargar()` toma la escuela **de la fila del ticket** y la compara con la de la sesión; si no coincide responde
**404** (igual que un id inexistente: no se confirma que exista). `soporte_tickets_listar` ignora cualquier `escuela_id`
que mande un colegio y filtra por el de su sesión. Al **crear**, la escuela sale de la sesión, nunca del formulario.

## Adjuntos

- Imágenes (JPG, PNG, WEBP) y PDF, **hasta 10 MB** cada uno (`UPLOADS_MAX_BYTES_DOCUMENTO`), 5 por mensaje, 25 por ticket.
- Se valida por **firma de bytes** (magic bytes), no por extensión: se lee el encabezado, se deduce el tipo real y esa
  extensión es la que se pasa a `guardar_archivo_privado()` (que además cruza con `finfo`). Un `.png` que es un script se
  rechaza; un PNG real que se llama `.pdf` o `.dat` se acepta como PNG.
- Se guardan en `uploads_privados/escuela_<id>/soporte/<ticket>/` (misma carpeta con `.htaccess` `Require all denied` que los
  documentos del expediente), con nombre aleatorio. **No hay URL directa**: se descargan con la acción
  `soporte_adjunto_descargar` (sesión + validación de rol, escuela y nota interna), con `X-Content-Type-Options: nosniff` y
  `Cache-Control: private, no-store`. La vista los abre con `abrirDocumentoPrivado()`.
- Si falla el `INSERT` después de guardar, los archivos se borran (no quedan huérfanos).

## Correos

Usan `lib/mailer.php` (`enviar_correo`). **Nunca llevan el asunto ni el texto del ticket**: solo el número, el nombre del
colegio, la categoría y una liga a la plataforma. Un fallo de correo no tumba la acción: se anota en `api_log.txt`.

| Cuándo | A quién | Asunto del correo |
|---|---|---|
| El colegio abre un ticket | Usuarios **activos** con rol `soporte` y `superadmin` | Nuevo ticket de soporte #N |
| El colegio responde | Igual | Respuesta del colegio en el ticket #N |
| Soporte responde (mensaje público) | El que abrió el ticket y quien del colegio haya escrito en él | Soporte respondió tu ticket #N |
| Nota interna, cambio de estado o asignación | Nadie | — |

## Bitácora (`logs_sistema`)

`soporte_ticket_creado`, `soporte_ticket_respuesta`, `soporte_nota_interna`, `soporte_ticket_actualizado` (estado, prioridad,
asignación), `ayuda_articulo_creado`, `ayuda_articulo_editado`. Sin el texto de los mensajes.

## Acciones y permisos

Todas llaman `requerir_rol()` por dentro y validan propiedad. Están en la lista de cada rol que las usa en
`$ACCIONES_POR_ROL_PLATAFORMA` (api.php); `soporte` es estricto, así que **sin la entrada en su lista recibe 403**.

| Acción | admin / cajero | soporte | superadmin |
|---|---|---|---|
| `soporte_ticket_crear` (multipart) | sí (su escuela) | — | — |
| `soporte_tickets_listar` | sí (su escuela) | sí (filtros) | sí |
| `soporte_ticket_ver` | sí (sin notas internas) | sí | sí |
| `soporte_ticket_responder` (multipart) | sí | sí (+ nota interna) | sí |
| `soporte_ticket_actualizar` | solo `resuelto`/reabrir | todo | todo |
| `soporte_adjunto_descargar` | sí (sin notas internas) | sí | sí |
| `soporte_resumen` | sí | sí | sí |
| `ayuda_listar` | publicados para su rol | todo, borradores incluidos | todo |
| `ayuda_guardar` | — | sí | sí |
| `ayuda_novedades_vistas` | sí | — | — |

`superadmin` no tiene lista (puede todo). Sin comodines. `php herramientas/revisar-permisos.php` → `RESULTADO: OK`.

## Migración

`migraciones/migracion_2026_11_20_of7a_soporte.sql` (documentación) y los pasos `2026_11_20_of7a_01` a `07` en
`lib/migraciones.php`. Se aplica como el resto (`php herramientas/migrar.php --aplicar` o *Diagnóstico → Base de datos*).

| Paso | Qué |
|---|---|
| 01–04 | Tablas `soporte_tickets`, `soporte_mensajes` (`interno` TINYINT), `soporte_adjuntos`, `soporte_lecturas` (leído por usuario y ticket) |
| 05–06 | Tablas `ayuda_articulos` y `ayuda_usuario` (novedades vistas por usuario) |
| 07 | Datos: siembra 4 artículos (cobro en Caja, abonos parciales, dar de baja a un alumno, IVA de un concepto), **solo si `ayuda_articulos` está vacía** (`condicion` idempotente; un paso `datos` registrado no se repite jamás) |

Diferencias con la lista del encargo: `soporte_tickets` lleva además `ultimo_autor` y `ultimo_mensaje_en` (DATETIME(3)), que
permiten ordenar la bandeja y calcular "sin respuesta" sin recorrer los mensajes; `ayuda_articulos` lleva `publicado_en`
(es lo que decide si una novedad es "nueva"; corregir una errata no la vuelve a marcar nueva). Los milisegundos evitan que
un mensaje que llega en el mismo segundo en que alguien abre el ticket quede como leído. MySQL ≥ 5.6.4; sin `FOREIGN KEY`.

**Tolerancia si no está aplicada:** `soporte_resumen` responde ceros con `instalado: false` (el menú no se rompe) y las demás
acciones dicen *"El soporte dentro de la plataforma aún no está instalado… (Diagnóstico → Base de datos)"*.

## Pruebas

**Automáticas** (`php herramientas/pruebas.php`, sin base de datos): condición SQL de notas internas, máquina de estados,
transiciones permitidas por lado, tipo de adjunto por firma, roles visibles de Ayuda y formato de los artículos sembrados.

**Verificadas de punta a punta** (19/20-nov-2026, MySQL 8.4 local, PHP 8.3, por `api.php` real con tokens firmados y un SMTP
de mentira): 89 comprobaciones, entre ellas las de abajo. La base de prueba es mínima (`escuelas`, `usuarios`, `logs_sistema` +
la migración), no la de producción.

**Manuales** (con datos de dos colegios, A y B, con un admin cada uno; un usuario `soporte`):

1. **Un colegio no ve tickets de otro.** Admin A crea un ticket con un adjunto. Admin B: *Ayuda → Mis tickets* no lo lista.
   Llamando a mano `soporte_ticket_ver`, `soporte_ticket_responder`, `soporte_ticket_actualizar` o
   `soporte_adjunto_descargar` con el id de A, el servidor responde **404** (igual que un id que no existe). Un admin de A
   que manda `escuela_id` de B en el listado o al crear sigue operando en A.
2. **El colegio no ve notas internas.** Soporte abre el ticket de A y escribe una nota interna con un PDF adjunto. Admin A abre
   el ticket: no aparece la nota. En la pestaña *Red* del navegador, la respuesta de `soporte_ticket_ver` **no contiene el texto**
   de la nota ni un campo `interno`. Pedir a mano `soporte_adjunto_descargar&adjunto_id=<el del PDF de la nota>` → **404**.
   Admin A manda `interno=1` en `soporte_ticket_responder`: el mensaje queda público. La nota no genera correo ni "respuesta nueva".
3. **Contadores.** Soporte responde: el admin y el cajero de A ven el número en *Ayuda*; el admin lo abre y a él se le quita,
   al cajero no. El admin de B no ve nada.
4. **Bandeja.** Con tres tickets de distinta edad, sin respuesta, el más viejo va primero; una nota interna no lo saca de
   "sin respuesta"; resolverlo lo manda al final; el colegio que responde lo reabre.
5. **Adjuntos.** Un `.png` que en realidad es texto/PHP → "Solo se aceptan imágenes… y PDF". Un archivo de más de 10 MB →
   rechazado en el navegador y en el servidor. `GET /uploads_privados/...` directo → 403.
6. **Roles.** Un usuario `familia` recibe 403 en todas las acciones. Un `cajero` no puede `ayuda_guardar` (403). Un `soporte`
   no puede `soporte_ticket_crear` ni acciones fuera de su lista.
7. **Ayuda.** Soporte crea una novedad en borrador (el colegio no la ve ni cuenta), la publica solo para `admin` (el cajero no la
   ve; el admin ve el punto verde y al abrir *Novedades* se quita). Un `<script>` o `**` mal cerrado en el texto se ve como texto.
8. **Correos.** Con SMTP real: un ticket nuevo llega a soporte/superadmin activos (no a los desactivados) sin asunto ni mensaje;
   la respuesta de soporte llega al que abrió el ticket.

## Lo que no se pudo verificar

- **MySQL 5.7** (producción): solo hay 8.4 local. El SQL usa solo `CREATE TABLE IF NOT EXISTS`, `DATETIME(3)`,
  `ON DUPLICATE KEY UPDATE` y `GREATEST`, todo disponible en 5.7.
- **Correo real** por SMTP y el **servidor Apache** (`.htaccess` de `uploads_privados/`, límites `post_max_size` /
  `upload_max_filesize` del hosting: si son menores de 10 MB, un adjunto grande falla con "El envío es demasiado grande").
- **La interfaz en un navegador**: las vistas pasan `node --check` y el renderizador de texto se probó con un React de
  mentira, pero no se abrieron en pantalla.
- Un colegio con **suscripción vencida** ve la pantalla de renovación y no llega a *Ayuda* (el candado de `api.php` responde 402
  a estas acciones); no se agregaron a `$ACCIONES_PERMITIDAS_VENCIDO`. Si se quiere que puedan pedir ayuda, es una decisión aparte.
