# OF-4b — Allowlist de acciones para admin, cajero, contador y distribuidor

Rama `mejoras-of-perm` (sale de `mejoras-of`) · 19-nov-2026

## Por qué

`requerir_rol()` **no niega por defecto**: solo protege a las acciones que la llaman. Hay ~28
acciones en `acciones/` que escriben o leen datos sin llamarla (ver "Acciones sin requerir_rol"
abajo). La defensa estructural es `$ACCIONES_POR_ROL_PLATAFORMA` en `api.php`: un mapa
rol → acciones permitidas que corre **antes** del despacho. Si el rol tiene entrada, todo lo que no
esté en su lista recibe 403.

Ya tenían lista `soporte`, `provision`, `promotor`, `tesoreria`, `docente`, `alumno`,
`control_escolar`, `direccion`, `tienda` y `familia` (esta última en modo registro). Faltaban los
cuatro roles más viejos: **admin, cajero, contador y distribuidor**. `superadmin` sigue sin lista a
propósito: puede todo.

## Qué cambió

Solo `api.php`, dos herramientas nuevas y esta documentación. **No se tocó la lógica de ninguna
acción ni `config.php`.**

1. **Listas nuevas** en `$ACCIONES_POR_ROL_PLATAFORMA`, agrupadas por módulo con comentarios:

   | Rol | Entradas | Acciones que cubre (con comodines expandidos) |
   |---|---|---|
   | `admin` | 145 | 151 |
   | `cajero` | 30 | 36 |
   | `contador` | 7 | 7 |
   | `distribuidor` | 8 | 12 |

   Comodines solo donde todo el prefijo es del rol: `caja_*` (admin y cajero) y `distribuidor_*`.
   El control escolar de admin va **explícito** (un `escolar_*` abriría también las acciones futuras).
2. **Modo registro generalizado.** Constante `ALLOWLIST_ROLES_ESTRICTA`, leída con
   `defined(...) ? (bool) ... : false` (no hace falta definirla en `config.php` para que arranque en
   registro). Con `false`, un admin/cajero/contador/distribuidor que llame algo fuera de su lista
   **pasa**, y se anota en `api_log.txt`:

   ```
   ROL_FUERA_ALLOWLIST rol=cajero accion=listar_usuarios user_id=42
   ```

   Con `true` recibe 403 y queda `BLOQUEADO por allowlist de plataforma -> rol=... accion=... user_id=...`,
   igual que los demás roles. `familia` conserva su constante (`ALLOWLIST_FAMILIA_ESTRICTA`) y su
   línea de log (`FAMILIA_FUERA_ALLOWLIST`). Los demás roles con lista (soporte, provision, promotor,
   tesoreria, docente, alumno, control_escolar, direccion, tienda) siguen siempre estrictos.
3. La decisión salió a una **función pura**, `decision_allowlist_rol($rol, $accion, $listas,
   $familia_estricta, $roles_estricta)` → `'permitir' | 'registrar' | 'bloquear'`. El bloque de
   `api.php` solo la llama y aplica el resultado (log o 403). Así se puede probar sin levantar el
   servidor.
4. `herramientas/revisar-permisos.php` (comprobador) y `herramientas/inventario-permisos.php`
   (genera el inventario). Ver abajo.

## Cómo revisar el log

```
grep ROL_FUERA_ALLOWLIST api_log.txt | sort | uniq -c
```

Las líneas incluyen fecha y hora, así que `sort | uniq -c` solo agrupa si quitas el prefijo de la
fecha; para un conteo por acción y rol:

```
grep ROL_FUERA_ALLOWLIST api_log.txt | sed 's/.*ROL_FUERA_ALLOWLIST //; s/ user_id=.*//' | sort | uniq -c | sort -rn
```

El modo registro solo sirve si `API_LOG_ENABLED` es `true` en `config.php` (hoy lo es): con el log
apagado, `log_api()` no escribe nada y no habría de dónde sacar lo que se escapó.

Cada línea es una acción que un rol llamó sin tenerla en su lista. Hay dos casos:

* **Es legítima** (una pantalla la usa y la omitimos) → agregarla a la lista de ese rol.
* **No lo es** → es justo el hueco que el modo estricto va a cerrar. No agregar nada.

## Cómo pasar a estricto

1. Dejar el sistema en uso normal ~1 semana. Conviene que pase un corte de caja, una facturación y
   un cierre de ciclo: las acciones raras son las que se escapan.
2. Revisar el log (comando de arriba) y agregar lo legítimo a la lista del rol en `api.php`.
3. Con el log limpio, agregar en el `config.php` **del servidor**:

   ```php
   define('ALLOWLIST_ROLES_ESTRICTA', true);
   ```

   Una sola constante cubre los cuatro roles. `config.php` está versionado: si se edita a mano en el
   servidor, el siguiente `git pull` puede chocar con esa línea. Lo más limpio es hacerlo con un
   commit. Para volver al modo registro basta con quitar la línea.
4. Antes de activarla, `php herramientas/revisar-permisos.php --roles-estricta` muestra qué
   acciones sin guardia de rol quedarían cerradas para quién.

## Cómo agregar una acción nueva

Tres capas, siempre las tres:

1. **Archivo** `acciones/mi_accion.php`, con `requerir_rol($rol, [...])` **por dentro** (o un helper de
   contexto que la llame: `escolar_ctx`, `monedero_ctx`, `expediente_alumno`). Más la validación de
   escuela (`requerir_escuela_propia`).
2. **Lista del rol** en `$ACCIONES_POR_ROL_PLATAFORMA` (api.php), en el grupo de su módulo. Agregar el
   rol al `requerir_rol` de la acción **no basta**: el allowlist corre antes del despacho y
   dejaría un 403 que solo se ve en `api_log.txt` (o, en modo registro, un `ROL_FUERA_ALLOWLIST`).
3. **Comprobar**: `php herramientas/revisar-permisos.php`. Falla (código 1) si la acción no está en
   ninguna lista, ni es pública, ni está en `SOLO_SUPERADMIN` del comprobador.

Si es de superadmin: agrégala a `SOLO_SUPERADMIN` en `revisar-permisos.php` (el comprobador verifica
que de verdad exija `superadmin` por dentro). Si es pública (sin sesión), va en `$acciones_publicas`
de `api.php`; mantenlas al mínimo.

Evita nombres que caigan bajo un comodín de otro rol (`caja_*`, `distribuidor_*`, `escolar_*`,
`alumno_*`): esos prefijos abren también las acciones futuras.

## El comprobador

```
php herramientas/revisar-permisos.php [--roles-estricta] [--familia-estricta]
```

Extrae `$ACCIONES_POR_ROL_PLATAFORMA`, `accion_en_allowlist()` y `decision_allowlist_rol()` del
propio `api.php` y las evalúa (no hay una segunda copia de la lógica que pueda divergir). Revisa:

1. Toda acción de `acciones/` está en alguna lista, en `SOLO_SUPERADMIN`, en `SUPERADMIN_POR_ALLOWLIST`
   o es pública. Si no → salida 1.
2. Toda entrada de las listas tiene su archivo (un comodín debe cubrir al menos uno). Si no → salida 1.
3. Lista las acciones que **no llaman `requerir_rol`** (ni un helper que lo haga) y qué roles las
   alcanzan: los que la tienen en su lista, y los que solo llegan por el modo registro. Informativo.
4. Que cada acción de `SOLO_SUPERADMIN` la exija por dentro.

`herramientas/inventario-permisos.php` regenera `of4-permisos-inventario.md` (una fila por acción:
quién la llama, `requerir_rol` interno, en qué lista quedó y notas). "Quién la llama" es una
aproximación **por archivo** (busca el nombre de la acción en `views/`, `controllers/` y
`assets/js/` y le asigna a cada archivo los roles que lo ven según `NAV_ITEMS` y el ruteo de
`app.js`); cuando un botón concreto está tras un `rol === ...` dentro de la vista manda el
`requerir_rol` de la acción. Las tablas de roles por archivo están al inicio del script: si cambia
el frontend, se actualizan ahí y se regenera.

## Acciones sin `requerir_rol` (hallazgos)

El comprobador marca **28**. Los roles que las alcanzan hoy "por registro" (fuera de su lista) son el
hueco real que cierra el modo estricto. Las más relevantes:

| Acción | Qué pasa hoy | Quién debería llamarla |
|---|---|---|
| `listar_usuarios` | Sin guardia de rol: la rama final entrega el equipo del colegio a **cualquier** rol con `escuela_id` (un cajero lo recibiría). | admin, control_escolar (y superadmin, soporte) |
| `listar_gastos` | Solo valida escuela y sección: un cajero de la misma escuela pasa. | admin (soporte, tesorería) |
| `listar_clabes_pool` | **Sin ninguna validación**: cualquier rol autenticado lista el pool de CLABEs de cualquier escuela si manda `escuela_id`. Solo la usa `Escuelas.js` (superadmin). Queda declarada en `SUPERADMIN_POR_ALLOWLIST`. | superadmin |
| `listar_zonas` | Sin guardia (lista zonas activas; dato de bajo riesgo). | admin, superadmin, control_escolar (vía Usuarios.js) |
| `iniciar_pago_agrupado`, `verificar_saldo_alumno` | Validan escuela y propiedad solo en la rama de familia; el resto pasa por escuela. | familia |
| `cancelar_cai`, `iniciar_firma_cai`, `descargar_cfdi`, `descargar_complemento_pago`, `enviar_factura_correo`, `editar_cliente`, `editar_familia`, `editar_logo_escuela`, `invitacion_*`, `cargar_datos`, `detalle_cobro`, `generar_liga`, `generar_referencia_efectivo`, `listar_cobros`, `tendencia_cobranza`, `verificar_spei` | Guardia **inline** (comparan el rol a mano) o solo por escuela. Revisadas a mano en el inventario. | ver inventario |
| `cambiar_password_propio`, `editar_usuario`, `guia_marcar_vista` | Autoservicio: cualquier usuario autenticado, sobre sí mismo (están en las listas de todos los roles). | todos |

Importante: **en modo registro estos huecos siguen abiertos** (es lo que hace el modo registro). Las
listas nuevas no cierran nada hasta definir `ALLOWLIST_ROLES_ESTRICTA`.

## Acciones dudosas

Entraron a una lista por el criterio "ante la duda, se incluye" (marcadas **DUDOSA** en los
comentarios de `api.php` y en el inventario): el backend admite al rol pero ninguna pantalla suya
la llama hoy.

**En la lista de `admin`:**

* Domiciliación en pausa: `cancelar_cai`, `iniciar_firma_cai`.
* CLABEs: `liberar_clabe_individual` (nadie la invoca), `asignar_clabe_pool`,
  `asignar_clabe_pool_masivo` (sin llamador), `importar_clabes`, `eliminar_clabes_pool` (solo las
  pinta Escuelas.js).
* Documentos y contrato: `descargar_documento_escuela`, `descargar_contrato_firmado` (los usan
  contador/provisión).
* Planteles: `planteles_de_escuela`, `crear_plantel`, `editar_plantel`, `eliminar_plantel`,
  `toggle_plantel` (solo Escuelas.js, de superadmin).
* Invitar colegios: `invitacion_crear`, `invitacion_regenerar`, `invitaciones_listar`.
* Monedero: `monedero_saldo`, `monedero_movimientos`, `monedero_recargar`,
  `monedero_config_guardar` (las usa el portal de familia; la pantalla de admin usa reporte y ajustes).

**En la lista de `cajero`:** `iniciar_firma_cai`, `asignar_clabe_pool` (sin llamador).

**En la lista de `distribuidor`:** `comisiones_historial_tasas` (sin llamador).

**Quedaron FUERA de la lista aunque el backend admite al rol** (ninguna pantalla del rol las
llama; si el log las muestra, agregarlas):

* `cajero`: `abonos_sin_complemento_listar`, `cancelar_cai`, `descargar_cfdi`,
  `descargar_complemento_pago`, `enviar_recordatorio_correo`, `generar_complemento_pago`,
  `monedero_movimientos`, `monedero_saldo`.
* `contador`: `listar_pagos_no_aplicados`, `resolver_pago_no_aplicado` (su requerir_rol lo admite pero
  su panel no las llama; solo `Cobros.js`). Además `Contador.js` todavía invoca `asignar_id_externo`
  (`guardarIdExterno`), que `requerir_rol` ya rechaza: llamada muerta.

## Qué se probó y qué no

Probado (script que evalúa el **código real** de `api.php`: las funciones y el bloque del candado, con
`log_api`/`respond` simulados, en las 9 combinaciones de `ALLOWLIST_FAMILIA_ESTRICTA` y
`ALLOWLIST_ROLES_ESTRICTA` ausente/false/true):

* `superadmin` y cualquier rol sin lista pasan todas las acciones (más de 600 combinaciones).
* Las listas de los 10 roles que ya existían son idénticas a las de `mejoras-of`, y su decisión es
  idéntica a la lógica anterior para toda acción × rol.
* Los cuatro roles nuevos: dentro de lista → permitir; fuera → registrar (línea
  `ROL_FUERA_ALLOWLIST rol=X accion=Y user_id=Z`) o bloquear (403) según la constante.
* `familia` conserva su comportamiento y no se afecta por la constante nueva (y viceversa).
* Las listas de `api.php`, con comodines expandidos, coinciden exactamente con lo que genera el
  inventario.

**No verificado:** no se corrió contra el servidor ni con una base de datos real (no hay entorno
local con datos), así que no se probó una sesión completa de cada rol navegando su pantalla. La
columna "quién la llama" del inventario es una aproximación por archivo; la verificación de verdad
es la semana de log en modo registro.
