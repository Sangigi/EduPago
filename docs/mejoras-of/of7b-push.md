# OF-7b — Avisos push en el navegador y el celular

Rama `mejoras-of-7` · 20-nov-2026

Un aviso que llega **aunque EduPago esté cerrado**: "Tu pago fue confirmado", "Se publicaron calificaciones",
"Soporte respondió tu ticket". Es Web Push, portado de OF-LIBERTYFIN: PHP plano, OpenSSL y curl, **sin librerías**.

## Cómo funciona (en 30 segundos)

1. La persona pulsa **Activar avisos** en un dispositivo. El navegador le da al servidor una dirección única
   (`endpoint`) en el servicio de avisos de Google, Mozilla, Microsoft o Apple, y el servidor la guarda
   (`push_suscripciones`).
2. Cuando pasa algo, el servidor **encola** un aviso (`push_avisos`) y, **después de responder**, "toca" esa
   dirección con una firma VAPID. **El toque va vacío**: no lleva texto.
3. El navegador despierta a `sw-edupago.js` (service worker, en la raíz). Este le pregunta al servidor qué mostrar
   (acción pública `push_aviso`, identificándose con el SHA-256 de su propia dirección) y muestra la notificación.
4. Al tocarla se abre EduPago en la pantalla que corresponde (`?ir=...`); si no hay sesión, primero pide entrar.

## Qué avisos existen, para quién, y qué NO incluyen

El texto es **genérico a propósito**: lo ve cualquiera que pase frente a la pantalla. Ningún aviso lleva montos,
nombres de alumnos, folios, calificaciones, el asunto de un ticket ni su contenido (lo prueba `herramientas/pruebas.php`).

| Tipo | Texto | Para quién | Cuándo se encola (archivo) | Abre |
|---|---|---|---|---|
| `pago_confirmado` | "Pago confirmado · Tu pago fue confirmado." | Usuarios **familia** del alumno del cobro | Abono aplicado o pago confirmado: `webhooks/pago_clabe.php` (SPEI), `webhooks/pago_referencia.php` (efectivo, suelto y agrupado), `webhooks/webhook_liga.php` (tarjeta, suelto y agrupado), `webhooks/webhook_spei.php`, `lib/helpers_pagos.php` → `cobrar_via_token()` (tarjeta guardada) y `acciones/confirmar_pago.php` (solo cuando confirma el **personal** un cobro que estaba pendiente) | Inicio del portal de familia |
| `recordatorio_pago` | "Recordatorio de pago · Tienes un recordatorio de pago." | Usuarios **familia** | `cron_recordatorios.php`, donde el cron ya manda el correo (cobro recurrente nuevo, un día antes de que cierre la ventana, recargo por pago tardío y recordatorios de cobros pendientes) | Inicio del portal de familia |
| `calificaciones` | "Calificaciones · Se publicaron calificaciones." | **Familias y alumnos** con calificaciones en ese periodo y escuela | `acciones/escolar_publicar_periodo.php`, solo al pasar de oculto a publicado | Pestaña Escolar (familia) / Calificaciones (alumno) |
| `soporte_respuesta` | "Soporte · Soporte respondió tu ticket." | **admin y cajero de esa escuela** | `acciones/soporte_ticket_responder.php`, solo mensajes **públicos** (**nunca** una nota interna) | Ayuda |
| `soporte_nuevo` | "Tickets de soporte · Hay un ticket nuevo de un colegio." | Usuarios **soporte y superadmin** activos | `acciones/soporte_ticket_crear.php` | Tickets de soporte |
| `soporte_colegio` | "Tickets de soporte · Un colegio respondió en un ticket." | Usuarios **soporte y superadmin** activos | `acciones/soporte_ticket_responder.php`, cuando responde el colegio | Tickets de soporte |
| `prueba` | "Aviso de prueba · Los avisos funcionan en este dispositivo." | Los dispositivos de quien pulsa **Enviar prueba** | `acciones/push_probar.php` | — |

Reglas:

- Un mismo dispositivo no recibe dos avisos del **mismo tipo** si el primero aún no se entregó (en los últimos 10 min):
  varios eventos seguidos son un solo aviso. Una familia con tres hijos no recibe tres.
- Usuarios inactivos no reciben nada. Un dispositivo con 5 fallos seguidos queda desactivado hasta que la persona
  vuelve a activar los avisos.
- **No hay aviso de gastos, caja, facturas ni nada de dinero del colegio**: solo lo de arriba.

## Un push nunca retrasa ni tumba un pago

Los avisos de pago salen de los **webhooks del proveedor**, que esperan respuesta en segundos. Garantías:

1. **El evento solo encola.** `push_aviso_pago_cobros()` es un `INSERT … SELECT` en `try/catch` que **nunca lanza**
   (sin la migración devuelve 0 y no deja ni una línea en el log). Va **después del `commit`** del dinero y no toca esa lógica.
2. **El envío real ocurre después de responder.** `push_programar_despacho()` registra un `register_shutdown_function` que
   (a) suelta los buffers de salida, (b) llama a `fastcgi_finish_request()` (o `litespeed_finish_request()` en LiteSpeed:
   el proveedor ya tiene su respuesta) y **solo entonces** despacha, con un tope de tiempo total de **3 s** y timeouts de
   curl de 2 s de conexión. Los envíos de un lote van **en paralelo** (`curl_multi`).
3. **Si el servidor no puede cerrar la respuesta antes** (PHP como módulo de Apache, por ejemplo), el webhook **no despacha**
   en esa petición: el aviso queda en cola. (Las acciones de pantalla sí despachan, con tope de 3 s, porque ahí no hay
   un proveedor esperando.)
4. **Lo pendiente lo despacha el cron** (`cron_recordatorios.php`, bloque `[OF-7b]` al final, en su propio `try/catch`:
   un fallo ahí no frena los correos de dinero). Ese bloque también limpia: avisos de más de 30 días, huérfanos y
   suscripciones desactivadas hace más de 60 días.
5. **Candado:** `GET_LOCK('edupago_push_reclamo')` protege solo el reclamo (SELECT + UPDATE de `enviado_en`), así que dos
   procesos no mandan lo mismo y el envío —lo lento— va fuera del candado. Un aviso se marca enviado **antes** del toque
   (para que el dispositivo, al despertar, ya lo encuentre) y se libera si el servicio de push lo rechaza.
6. Un aviso viejo (más de 24 h) ya no se envía ni se muestra; cada aviso tiene máximo 3 intentos, y los reintentos van
   en la siguiente corrida, no en bucle.

## Activarlo en cada dispositivo

**Dónde está la opción**

- **Familias:** portal de familia → pestaña **Configuración** → *Avisos en este dispositivo*.
- **Alumnos, admin, cajero, soporte y superadmin:** clic en su nombre (menú de perfil) → **Avisos en este dispositivo**.
- La opción solo aparece si el servidor tiene los avisos encendidos (migración aplicada y llaves). **Nunca** se pide
  permiso al cargar la página: solo al pulsar *Activar avisos*. También hay *Desactivar* y *Enviar prueba* (a todos los
  dispositivos de la cuenta).

**Por navegador**

| Dispositivo | Qué hacer |
|---|---|
| Chrome / Edge / Brave (Windows, Mac, Linux) | Activar avisos → "Permitir" en el cuadro del navegador. Brave trae apagado "Usar los servicios de Google para la mensajería push" (`brave://settings/privacy`): la pantalla lo explica. |
| Firefox (escritorio y Android) | Igual: Activar avisos → Permitir. |
| Android (Chrome, Edge, Firefox, Samsung Internet) | Igual. Funcionan con la app cerrada; si el celular tiene ahorro de batería agresivo, puede retrasarlos. |
| Safari en Mac | macOS 13 o más nuevo: Activar avisos → Permitir. |
| **iPhone y iPad** | **Web Push solo funciona con EduPago instalado en la pantalla de inicio (iOS/iPadOS 16.4 o más reciente).** En Safari "a secas" el navegador ni siquiera ofrece la función. La pantalla lo detecta y muestra los pasos: (1) abrir EduPago en **Safari**, (2) **Compartir → Agregar a pantalla de inicio**, (3) abrir EduPago **desde el ícono nuevo**, entrar y activar los avisos ahí. Para eso existe `manifest.webmanifest` (nombre, ícono, `display: standalone`). |

**Si está bloqueado:** la pantalla lo dice y explica cómo permitirlo (candado junto a la dirección → Permisos →
Notificaciones → Permitir, y recargar). Si "Activar" no hace nada en un navegador, revisar que la página esté en HTTPS.

**Cuenta compartida:** si otra persona entra en ese navegador y activa los avisos, la suscripción pasa a **su** cuenta
(no hereda los avisos de la anterior). Si la persona A los activó y la B entra después, a B le aparecen como *no activados*
hasta que los active ella.

## Dónde viven las llaves VAPID y cómo rotarlas

- **Un solo archivo:** `uploads_privados/push_vapid.pem` (llave privada P-256 en PEM; la pública se deriva de ella).
  Se **genera sola** la primera vez que alguien usa los avisos, con OpenSSL (`openssl_pkey_new`, `prime256v1`), con
  permisos `0600` si el sistema lo permite.
- **Fuera de git:** `uploads_privados/.gitignore` ignora todo lo que haya en esa carpeta salvo su `.htaccess` y su
  `.gitignore`. (El repositorio no tenía `.gitignore` raíz; este archivo, dentro de la carpeta, no choca con nada.)
- **Fuera del alcance web:** `uploads_privados/.htaccess` ya niega todo (`Require all denied`).
- **Nunca en logs ni respuestas:** `push_llave_publica` solo entrega la **pública** (87 caracteres). Si algo falla,
  se anota el motivo sin imprimir ninguna llave.
- **No la copies** a tu computadora ni al repositorio. Sirve para firmar avisos a nombre del servidor.
- **Si no se pueden generar** (OpenSSL sin soporte de curvas elípticas, o la carpeta no es escribible), los avisos quedan
  **apagados**: nadie ve la opción, y el **superadmin** ve el motivo en la pantalla *Avisos en este dispositivo*
  (y queda una línea `[EduPago] push:` en `api_log.txt`).

**Rotar las llaves.** Borrar el archivo y listo: la siguiente petición genera un par nuevo. **Efecto: todas las
suscripciones existentes dejan de servir** (los servicios de push rechazan la firma nueva con 401/403 y, tras 5 fallos
seguidos, cada una se desactiva). Cada persona debe volver a pulsar *Activar avisos*; al hacerlo, la pantalla detecta
que la suscripción vieja usa otra llave y la renueva sola. Rotar solo si la llave pudo filtrarse. Para borrar todas
las suscripciones junto con la llave: `DELETE FROM push_avisos; DELETE FROM push_suscripciones;`.

## Seguridad

- **Acción pública:** `push_aviso` (en `$acciones_publicas` de `api.php`) la llama el service worker **sin sesión**.
  Recibe el SHA-256 de la dirección del dispositivo; responde **solo** `titulo`, `cuerpo`, `url` y `tag` de **ese**
  dispositivo, y un hash que no existe y un dispositivo sin pendientes reciben **la misma respuesta** (el aviso genérico).
  Límite de tasa: **60 por minuto por IP y 20 por minuto por hash** (429 al excederse; el service worker muestra
  igual su aviso genérico). Los contadores son archivos pequeños en `uploads_privados/push_tasa/`.
- **Permisos:** `push_llave_publica`, `push_suscribir`, `push_quitar` y `push_probar` llaman `requerir_rol` con
  `familia, alumno, admin, cajero, soporte, superadmin` y están en la lista de cada uno de esos roles en
  `$ACCIONES_POR_ROL_PLATAFORMA` (`herramientas/revisar-permisos.php` → OK). `push_quitar` solo borra suscripciones **de
  quien la llama**; el usuario y la escuela de una suscripción salen de la sesión, nunca del cuerpo de la petición.
- **SSRF:** solo se aceptan, y solo se llaman, direcciones **HTTPS** sin usuario/contraseña, puerto 443 y host
  `fcm.googleapis.com`, `web.push.apple.com` (y `*.web.push.apple.com`), `push.services.mozilla.com` (y
  `*.push.services.mozilla.com`) o `*.notify.windows.com` (`push_endpoint_valido()`, con pruebas contra
  `localhost`, IPs internas, `@`, `#`, puertos, mayúsculas, puntos finales y subdominios engañosos). Se valida al
  suscribir **y otra vez** al enviar; curl va con `CURLOPT_PROTOCOLS = HTTPS` y sin seguir redirecciones.
- **Texto sin datos:** ver la tabla de avisos. El service worker solo muestra lo que dice el servidor.
- **Suscripciones muertas:** 404 o 410 del servicio de push → la suscripción (y sus avisos) se borra sola. Otros
  fallos suman a `fallos`; con 5 seguidos queda desactivada. Un envío o una activación exitosa lo reinicia.
- **Topes:** 10 dispositivos por cuenta (se conservan los más recientes); 20 activaciones/min y 5 pruebas/min por usuario.
- **El navegador manda la dirección y las llaves en hexadecimal.** Algunos hostings rechazan con 406 un `"https://..."`
  tal cual en el cuerpo de una petición (pasó en OF-LIBERTYFIN); en hexadecimal solo hay `0-9a-f`. El servidor acepta también texto plano.

### CSP y `.htaccess`

**No se tocó `.htaccess`.** Con el CSP estricto de la raíz (`default-src 'self'; script-src` sin `'unsafe-inline'`):

- `sw-edupago.js` es un script del mismo origen: `worker-src` cae en `script-src 'self'`. Su único `fetch` es al mismo
  origen (`connect-src 'self'`).
- `manifest.webmanifest` cae en `manifest-src` → `default-src 'self'`. Los íconos, en `img-src` (`'self'`).
- `push_cliente.js` y `AvisosDispositivo.js` son archivos propios, sin scripts en línea.
- El `FilesMatch` que niega `.json`/`.txt`/`.log`/`.sql`/`.md` **no** toca `.webmanifest`.
- El `.htaccess` da `Cache-Control: max-age=31536000` a todos los `.js`; para el service worker no estorba: se registra
  con `updateViaCache: 'none'` y los navegadores revalidan el archivo principal del service worker aunque tenga caché.
- Si algún día un servidor sirviera el manifiesto con un tipo MIME raro, Chrome y Safari lo leen igual; si hiciera falta,
  la línea sería `AddType application/manifest+json .webmanifest`.

## Migración

Dos tablas (`push_suscripciones`, `push_avisos`), pasos `2026_11_20_of7b_01` y `_02` en `lib/migraciones.php`; el
`.sql` de documentación es `migraciones/migracion_2026_11_20_of7b_push.sql` (idempotente: `CREATE TABLE IF NOT EXISTS`).

```
git pull
php herramientas/migrar.php            # muestra qué falta
php herramientas/migrar.php --aplicar  # lo aplica (o Diagnóstico → Base de datos → Aplicar pendientes)
```

Orden de despliegue: **migraciones antes** de usar la opción. Sin migración, la opción no aparece y nada falla (todo está
en `try/catch`); el código nuevo puede subirse antes. No hace falta tocar `config.php` ni el cron (el que ya existe despacha).

## Pruebas

**Automáticas** (`php herramientas/pruebas.php push`, sin base de datos ni red): base64url (vectores e ida y vuelta);
validación de endpoints (válidos, y ~30 intentos de SSRF); **JWT de VAPID firmado y verificado con `openssl_verify`**
contra la llave pública que se manda en `k=` (cabecera, `aud`, `exp`, `sub`, firma r‖s, y que falle con otro mensaje u
otra llave); conversión DER↔r‖s; generación de llaves una sola vez, con `0600`, sin pisar un archivo dañado; textos
genéricos (sin cifras, `$` ni `#`); nombre del dispositivo; límite de tasa.

**Manuales** (hace falta HTTPS; en Chrome de escritorio, `localhost` también cuenta como seguro):

*Chrome de escritorio*
1. Entrar con una cuenta de **familia** → Configuración → *Avisos en este dispositivo* → **Activar avisos** → Permitir. Debe decir
   "Activados en este dispositivo". (DevTools → Application → Service Workers: `sw-edupago.js` *activated*; Push Messaging
   con el permiso concedido.)
2. **Enviar prueba**: debe aparecer "Aviso de prueba" en unos segundos. Si no: la respuesta de la pantalla trae el código
   del servicio de push; revisar que Windows/macOS permitan las notificaciones de Chrome y que "No molestar" esté apagado.
3. **Con la pestaña cerrada** (cerrar todas las de EduPago, dejar Chrome abierto): generar un pago de prueba con el
   simulador/webhook (o publicar un periodo de calificaciones) → llega "Pago confirmado" / "Se publicaron calificaciones".
   Al tocarlo abre EduPago en la pantalla correcta (pide entrar si no hay sesión).
4. En la base: `SELECT tipo, creado_en, enviado_en, entregado_en, intentos FROM push_avisos ORDER BY id DESC LIMIT 10;`
   Un aviso sano tiene `enviado_en` y `entregado_en`. Sin `enviado_en` e `intentos < 3` está pendiente (lo toma el siguiente
   evento o el cron); sin `entregado_en`, el toque se mandó pero el dispositivo no despertó.
5. **Soporte:** abrir un ticket como admin → llega "Hay un ticket nuevo" a soporte/superadmin con avisos activos;
   responder como soporte → llega "Soporte respondió tu ticket" al admin/cajero de ese colegio; una **nota interna** no
   manda nada.
6. **Desactivar** y repetir 3: ya no llega. Entrar con otra cuenta en el mismo navegador: aparece como *no activado*.
7. Rotar llaves (en un servidor de pruebas): borrar `uploads_privados/push_vapid.pem` → la prueba falla (401/403) → volver a
   activar → vuelve a funcionar.

*Chrome en Android*
1. Abrir EduPago por HTTPS en Chrome, entrar con una cuenta, activar los avisos y permitir las notificaciones.
2. **Enviar prueba**; luego cerrar Chrome (deslizarlo de recientes) y repetir el paso 3 de escritorio: el aviso llega con
   la app cerrada. Probar también con la pantalla apagada y con ahorro de batería.
3. Opcional: menú ⋮ → *Instalar aplicación*; el manifiesto debe dar nombre e ícono de EduPago.

*iPhone (si se tiene uno)*: sin instalar, la opción debe mostrar las instrucciones de "Agregar a pantalla de inicio" en
lugar del botón; ya instalada (iOS 16.4+) debe poder activar y recibir.

## Lo que no está verificado

- **No se recibió un push real** en ningún navegador ni celular: en el desarrollo no hay HTTPS público ni un dispositivo
  suscrito. Lo verificado es lo puro (firma VAPID con `openssl_verify`, validación), el SQL contra MySQL 8.4 (encolado,
  deduplicación, quién recibe cada aviso, reclamo con candado, texto que devuelve `push_aviso`, límites de tasa) y que
  que el servicio de **Mozilla** contesta al toque firmado (404 para una suscripción inventada, que es la respuesta que
  borra la suscripción: probado el camino completo curl_multi → 404 → suscripción eliminada). Con Google, Apple y
  Microsoft no se pudo: el PHP de esa máquina de desarrollo no tiene el certificado raíz para esos hosts (curl error 60),
  así que ahí solo se probó el manejo del fallo de red. **Falta confirmar en vivo**: que `fastcgi_finish_request`/`litespeed_finish_request` existe en el
  PHP del hosting (si no, los webhooks solo encolan y los avisos de pago salen con el cron), que el hosting no filtre la
  petición del service worker, y la experiencia en iPhone.
- MySQL 5.7 de producción no se probó (se usó 8.4); el SQL usado es compatible (`INSERT … SELECT`, `GET_LOCK`).
- Un navegador con la suscripción vencida o con el permiso revocado simplemente deja de recibir; se limpia sola con el 404/410
  o tras 5 fallos.
