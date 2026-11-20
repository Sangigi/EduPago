# OF-7c — "Ver como", bitácora de auditoría con antes y después, y agenda de citas

Tres piezas tomadas de OF-LIBERTYFIN y adaptadas a EduPago. Todo lo nuevo depende de la
migración `2026_11_20_of7c_01..03` (ver el final); sin ella el sistema funciona como antes:
"Ver como" anota al usuario real dentro del detalle del log, `auditar()` no escribe nada y la
agenda responde "aún no está instalada".

## 1. "Ver como"

Entrar como otro usuario **sin pedirle su contraseña**. El que entra escribe **la propia**, y
queda anotado quién entró como quién.

### Quién puede ver como quién (lo decide el servidor)

`suplantacion_decision()` en `lib/helpers_suplantacion.php`; se vuelve a evaluar **en cada
petición** (si al real le cambian el rol o el objetivo cambia de escuela, la sesión muere).

| Quien entra | Puede ver como | Modo |
|---|---|---|
| superadmin | cualquier usuario activo que no sea superadmin | normal (lectura si el objetivo es familia o alumno) |
| soporte | cualquier usuario **de colegio** (no de plataforma) | **siempre solo lectura** |
| admin | de **su escuela**: cajero, control_escolar, direccion, docente, tienda | normal |
| admin | de su escuela: familia, alumno | **siempre solo lectura** |
| cualquier otro rol | nadie | — |

Nunca: otro superadmin, uno mismo, cuentas apagadas, otro admin, otra escuela. Quien pide
"solo lectura" siempre puede (el modo pedido solo puede ser **más** estricto). Decisión
propia de esta fase: para **cualquiera**, entrar como familia o alumno es siempre lectura
(el brief solo lo exigía al admin y a soporte); nadie paga ni consiente en nombre de una familia.

### El token de suplantación

Es una **sesión distinta**, no un token normal con un campo extra:

```
base64( "sup" . objetivo . real . modo . emitido . vence . firma )      7 partes separadas por "."
firma = HMAC-SHA256("sup.objetivo.real.modo.emitido.vence", APP_TOKEN_SECRET)
```

- El token normal tiene 3 partes; `verificar_token_auth()` (api.php) manda a la rama de
  suplantación todo lo que decodifica a algo que empieza con `sup.`. Uno no se confunde con otro.
- **Vence a los 30 minutos** (`SUPLANTACION_TTL`). Un token firmado con una duración mayor se rechaza.
- En cada petición se leen frescos el usuario real y el objetivo: ambos activos, escuela activa,
  la regla vigente, y que ninguno haya cambiado su contraseña o cerrado sesiones
  (`sesion_valida_desde`) después de emitido el token. Si algo falla: 401 con
  `codigo: suplantacion_vencida`.
- `$usuario_actual` queda como el **objetivo**, más `['suplantado_por']` (id del real),
  `['suplantacion_modo']` y `['suplantacion_vence']`.
- **Confirmación con la contraseña propia** (`password_verify` del usuario real, nunca la del
  otro) y el mismo freno de intentos que `login.php`: 15 fallos por IP o 5 por usuario en 15
  minutos (cuenta `suplantar_fallido` en `logs_sistema`).
- El mensaje de "no puedes" es genérico a propósito: no confirma si un id existe en otro colegio.

En el navegador (`controllers/AuthController.js`): la sesión de suplantación vive en
`sessionStorage` (solo esa pestaña) bajo `edupago_suplanta_v1`; la sesión propia en
`localStorage` **nunca se toca**. Mientras exista y no haya vencido, `getSession()` devuelve al
objetivo con ese token, así que todas las pantallas trabajan como él. Volver, vencer, un 401 o
"Cerrar sesión" estando en "Ver como" solo sueltan ese token y recargan: se regresa a la cuenta propia.

### Qué se puede hacer mientras se está viendo como otro

Dos listas **explícitas** en `lib/helpers_suplantacion.php`, ambas validadas por
`php herramientas/revisar-permisos.php` (sección 5):

- **`SUPLANTACION_ACCIONES_NUNCA`**, aun en modo normal, con 403 y el mensaje "Esta acción no se
  puede hacer mientras estás viendo como otro usuario": cambiar contraseña, editar usuarios
  (incluido el perfil propio del objetivo), crear/borrar/activar usuarios, cerrar sus sesiones,
  reenviar credenciales, marcar la guía como vista, iniciar otra suplantación, pagar en nombre de
  una familia (`generar_liga`, `generar_referencia_efectivo`, `iniciar_pago_agrupado`,
  `monedero_recargar`, `cobrar_cai`, `cancelar_cai`, `iniciar_firma_cai`, `monedero_config_guardar`),
  aceptar el aviso de privacidad (consentimiento legal) y cancelar facturas (`cancelar_cfdi`,
  `cancelar_cfdi_actualizar`).
- **`SUPLANTACION_ACCIONES_SOLO_LECTURA`**: en modo lectura **solo** pasan estas (el resto recibe
  403 con "Estás viendo como otro usuario en modo de solo lectura"). Una acción nueva nace
  bloqueada hasta que alguien la revise y la agregue. Las que hay se leyeron **una por una**; el
  comprobador además rechaza cualquiera que contenga `INSERT/UPDATE/DELETE/REPLACE`, `->exec(`,
  archivos o correo (así detectó que `invitaciones_listar` marca invitaciones vencidas: salió del
  conjunto). Dos excepciones anotadas: `caja_sucursales` (su rama que crea la sucursal "Principal"
  se omite en modo lectura) y `alumno_documento_descargar` (solo deja la línea de quién lo bajó).
  `suplantar_terminar` nunca se bloquea.

El filtro corre en `api.php` **antes** de todo lo demás (marcado `[OF-7c]`). `suplantar_terminar`
también se salta el allowlist del rol del objetivo (docente, alumno, tienda…, que no la traen) y el
candado de suscripción vencida.

### Rastro

- `api_log.txt`: una línea por **cada petición** en suplantación:
  `SUPLANTACION real=10 objetivo=11 modo=normal accion=editar_producto` (+ `BLOQUEADA(...)`).
- `registrar_log()` guarda el renglón a nombre del objetivo y `logs_sistema.suplantado_por` con el real.
- Bitácora de auditoría: `suplantar.inicio` y `suplantar.fin`, y todo lo auditado que se haga
  viendo como otro lleva `usuario_id` = objetivo y `suplantado_por` = real.
- La pantalla Logs y Auditoría enseñan "hecho por X (viendo como)".

### Interfaz

- Botón de ojo ("Ver como") en **Mi equipo** y en la lista de **Usuarios** del superadmin
  (`views/Usuarios.js`), y en **Ficha de colegio** de soporte (`views/SoporteEscuela.js`; para eso
  `listar_usuarios` acepta `escuela_id` de soporte, solo lectura).
- Modal con la contraseña propia y la casilla "Solo lectura" (marcada y bloqueada cuando es obligatoria):
  `views/components/VerComoModal.js`.
- Barra fija arriba en **todas** las pantallas, también los portales: "Estás viendo como <nombre>
  (<rol>) · solo lectura · quedan 24 min · Volver a mi cuenta" (`assets/js/suplantacion.js` +
  estilos al final de `main.css`; ámbar en modo normal, azul en lectura). La app se corre hacia abajo
  lo que mida la barra.

### Pruebas manuales

1. Admin → Mi equipo → ojo en un cajero → contraseña mal: error y no entra; contraseña bien: barra ámbar, menú de cajero.
2. Con la barra: intentar cambiar contraseña (Mi cuenta) → mensaje de "no se puede". Volver: reaparece Mi equipo.
3. Admin → ojo en una familia: casilla de solo lectura bloqueada; portal de familia con la barra azul; cualquier botón que escriba da el mensaje de solo lectura.
4. Esperar 30 min (o editar `vence` en `sessionStorage`): al siguiente movimiento se vuelve a la cuenta propia.
5. Soporte → Ficha de colegio → Usuarios del colegio → Ver como.
6. Logs del Sistema → Registro: las filas hechas viendo como otro dicen "hecho por …".
7. Cambiar la contraseña del admin real estando en "Ver como" desde otra pestaña: la sesión de suplantación muere.

## 2. Bitácora de auditoría con antes y después

Tabla `auditoria` (id, escuela_id, usuario_id, suplantado_por, accion, entidad, entidad_id, antes JSON,
despues JSON, ip, creado_en; índices `(escuela_id, creado_en)` y `(entidad, entidad_id)`).

`auditar($pdo, $usuario_actual, $accion, $entidad, $entidad_id, $antes, $despues, $escuela_id)`
(`lib/helpers_auditoria.php`):

- **Nunca lanza ni tumba la operación**: si la tabla no existe o algo falla deja una línea en `api_log`
  y sigue. Siempre se llama **después del commit**, nunca dentro de la transacción.
- Solo guarda **los campos que cambiaron** (`12.00` = `12`, `null` = vacío).
- **Sin secretos**: contraseñas, hashes, NIP, tokens, llaves, tarjetas salen como `[oculto]`; la
  **CLABE** solo con los últimos 4 dígitos; los **datos médicos** como `[dato médico]` (solo el nombre
  del campo). Las notas de las citas no se copian.

### Dónde está enganchada

| Acción auditada | Archivo |
|---|---|
| `cobro.cancelar` | `acciones/cancelar_cobro.php` |
| `cfdi.cancelar` | `acciones/cancelar_cfdi.php` |
| `alumno.estatus` | `acciones/alumno_cambiar_estatus.php` |
| `producto.editar` (precio, IVA, alcance…) | `acciones/editar_producto.php` |
| `beca.guardar`, `beca.estado` | `acciones/alumno_beca_guardar.php`, `alumno_beca_desactivar.php` |
| `monedero.ajuste` | `acciones/monedero_ajuste.php` |
| `inventario.ajuste`, `inventario.conteo` | `acciones/inventario_ajuste.php`, `inventario_conteo.php` |
| `usuario.crear`, `usuario.editar`, `usuario.activo` | `acciones/crear_usuario.php`, `editar_usuario.php`, `toggle_usuario.php` |
| `escuela.editar` | `acciones/editar_escuela.php` |
| `escuela.seccion`, `escuela.metodo_pago`, `global.seccion`, `global.metodo_pago`, `escuela.demo` | `acciones/superadmin_toggle_*.php` |
| `escuela.contrato` | `acciones/escuela_set_contrato_estado.php` |
| `importacion.aplicar`, `importacion.deshacer` | `acciones/importar_saldos_aplicar.php`, `importar_saldos_deshacer.php` |
| `suplantar.inicio`, `suplantar.fin` | `acciones/suplantar_iniciar.php`, `suplantar_terminar.php` |
| `cita.crear`, `cita.editar`, `cita.estado` | `acciones/agenda_*.php` |

### Quién la ve

`acciones/auditoria_listar.php`: superadmin y soporte, todos los colegios (con filtro por colegio y
con la IP); **admin**, solo su colegio (la escuela sale de su sesión, el `escuela_id` del input se
ignora; sin IP). Filtros: fecha, usuario (quien lo hizo o a nombre de quién), acción, entidad.
Pantallas: **Logs del Sistema → pestaña Auditoría** (superadmin y soporte) y menú **Auditoría**
(admin). Cada renglón se abre en dos columnas, antes y después, con lo cambiado resaltado.

## 3. Agenda de citas

Tabla `citas` (id, escuela_id, titulo, tipo `admision|padres|reunion|otro`, inicio, fin,
responsable_id, familia_id, cliente_id, lugar, notas, estado `programada|realizada|cancelada|no_asistio`,
creado_por, creado_en). Sección `agenda` (el superadmin puede apagarla por colegio).

### Roles (decisión documentada)

| Rol | Qué ve | Qué hace |
|---|---|---|
| admin, control_escolar | todas las citas del colegio | crean, editan, cambian de estado y cancelan |
| direccion | todas las del colegio | solo lectura |
| docente | **solo las suyas** (donde es el responsable); está en su propio panel | solo lectura |
| familia | solo las ligadas a **su familia**, sin notas internas (pestaña **Citas** de su portal) | solo lectura |
| cajero, tienda, alumno | — | — |

### Sin empalmes

El mismo responsable no puede tener dos citas `programada` que se crucen (terminar a las 10:00 y
empezar a las 10:00 **no** es empalme; canceladas, realizadas y "no asistió" no ocupan lugar). Se valida
**en el servidor**, dentro de una transacción que primero **bloquea la fila del responsable** en
`usuarios` (`SELECT … FOR UPDATE`): dos altas simultáneas se serializan y la segunda ya ve la primera.
Reabrir una cita cancelada repite la validación. El responsable, la familia y el alumno deben ser del
colegio de la cita (un id ajeno responde como inexistente).

### Aviso por correo (opcional)

Casilla "Avisar a la familia" al crear, cambiar o cancelar (`lib/mailer.php`). Lleva el tipo de cita,
día y hora, lugar y quién atiende; **nunca** las notas, el nombre del alumno ni saldos. Si el correo
falla o la familia no tiene correo, la cita se guarda igual y la pantalla lo dice.

### Pruebas manuales

1. Admin → Agenda → Nueva cita (título, responsable, hora) → aparece en la semana.
2. Otra cita del mismo responsable que se cruce: se rechaza con el mensaje del servidor; una que empieza justo cuando termina la otra, se acepta.
3. Cancelar una cita con la casilla de aviso; reprogramarla encima de otra: rechazado.
4. Docente: su panel tiene Agenda con solo sus citas. Dirección: ve todas, sin botón de nueva cita.
5. Portal de familia (o "Ver como" una familia) → Citas: solo las de su familia.

## Migración

`lib/migraciones.php`, ids `2026_11_20_of7c_01_logs_suplantado_por` (columna
`logs_sistema.suplantado_por`), `_02_auditoria` y `_03_citas`; `.sql` de documentación en
`migraciones/migracion_2026_11_20_of7c.sql`. `php herramientas/migrar.php --aplicar` (o Diagnóstico →
Base de datos). **El `ALTER` sobre `logs_sistema`** reconstruye una tabla que puede ser grande: hazlo
fuera de horario de cobro; puede esperar sin romper nada.

## Permisos

Acciones nuevas y dónde se declaran (`$ACCIONES_POR_ROL_PLATAFORMA`, api.php): `suplantar_iniciar`
(admin, soporte; superadmin no tiene lista), `suplantar_terminar` (sin lista de rol: api.php la deja
pasar solo con un token de suplantación), `auditoria_listar` (admin, soporte), `agenda_listar` (admin,
control_escolar, direccion, docente, familia), `agenda_guardar` y `agenda_estado` (admin,
control_escolar). Todas llaman `requerir_rol` y validan la escuela de la fila.
`php herramientas/revisar-permisos.php` debe terminar en `RESULTADO: OK`.

## Pruebas

- `php herramientas/pruebas.php`: tabla completa de quién puede ver como quién, modo, filtro de
  acciones, token (ida y vuelta, vencimiento, firma alterada, 1 hora, futuro, token normal), diferencia
  de la auditoría (secretos, CLABE, médicos), empalmes y correo.
- Contra una base local y el `api.php` real (servidor `php -S`, dos procesos): un admin **no** puede ver
  como un admin de otra escuela ni como superadmin; en modo lectura una escritura da 403 con el mensaje
  exacto; vencimiento, revocación y cambio de rol; freno de intentos; la auditoría de cada colegio; agenda
  con 12 carreras entre dos servidores sin ningún empalme. Interfaz con Chrome headless: modal,
  barra, portales, agenda, auditoría y Logs.

## Siguiente paso (no hecho)

- Citas ligadas a **cliente_id** sin familia no se ven en el portal de familia (solo las que tienen `familia_id`).
- La agenda no manda recordatorios automáticos (solo el aviso al crear, cambiar o cancelar).
