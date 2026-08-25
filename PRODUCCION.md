# EduPago — Guía de puesta en producción

## Paleta de colores actualizada
| Token CSS | Hex | Uso |
|---|---|---|
| `--navy` | `#282d65` | Color primario, sidebar, navbar |
| `--lime` | `#bdcf00` | Acento principal, botones, highlights |
| `--green` | `#49af54` | Confirmaciones, éxito, pagos ok |
| `--white` | `#ffffff` | Fondo claro |

## Accesos del sistema (demo)
| Rol | Email | Contraseña |
|---|---|---|
| Super Admin | superadmin@pagalaescuela.mx | SuperAdmin2026! |
| Admin ITM | admin@itm.edu.mx | admin123 |
| Cajero ITM | cajero@itm.edu.mx | cajero123 |
| **Familia García** | garcia.fam@mail.com | familia123 |
| **Familia Hernández** | hernandez.t@mail.com | familia123 |
| **Familia Méndez** | mendez.c@mail.com | familia123 |

## Checklist antes de subir a Hostinger

### 1. `config.php`
- [ ] Cambiar `SPEI_CLABE_FIJA` por la CLABE real de STP/Pagadetodo
- [ ] Cambiar `PDT_USER`, `PDT_PASS`, `PDT_INT_ID` por credenciales reales
- [ ] Cambiar `FACTURAPI_KEY` por la llave de producción (quitar `sk_test_`)
- [ ] Cambiar `WEBHOOK_URL` por la URL real del servidor
- [ ] Cambiar `ADMIN_PASS` por contraseña segura

### 2. PHP / Servidor
- PHP 8.0+ con extensiones: `curl`, `json`, `mbstring`
- El directorio debe ser escribible para `api_log.txt`
- HTTPS obligatorio (certificado SSL activo)

### 3. Portal de familias
- Los usuarios con rol `familia` acceden al portal automáticamente al login
- Se vinculan por `familia_id` a sus alumnos
- Crearlos desde Usuarios → rol: Familia → seleccionar familia vinculada

### 4. Webhook SPEI
- Dar la URL `https://tudominio.com/webhooks/webhook_spei.php` a Pagadetodo
- Verificar que el archivo sea accesible sin autenticación

### 4.1 ⚠️ Los 10 endpoints de pago se movieron a `webhooks/` — ACTUALIZAR EN EL SANDBOX
Antes vivían en la raíz del proyecto. Se movieron a una carpeta `webhooks/` para no mezclarlos con el resto del backend. **Esto NO funciona solo — hay que actualizar la URL configurada en el Sandbox de Cobroscontarjeta.com/Pagadetodo para cada uno de los 10**, o ese endpoint empezará a responder 404 en cuanto subas los archivos nuevos.

Secuencia recomendada para no perder notificaciones reales durante el cambio:
1. Sube los archivos nuevos (con la carpeta `webhooks/`) al servidor.
2. Inmediatamente después, entra al Sandbox y actualiza las 10 URLs de la tabla de abajo (agregando `/webhooks/` antes del nombre del archivo — todo lo demás de la URL se queda igual).
3. Haz una prueba real (o de sandbox) de cada método de pago que uses activamente para confirmar que el webhook correspondiente sigue llegando.

| Archivo | Dónde se configura en el Sandbox | URL nueva (con tu dominio real) |
|---|---|---|
| `webhook_spei.php` | Ya cubierto arriba (campo del webhook de Pagadetodo) | `.../webhooks/webhook_spei.php?token=...` |
| `webhook_liga.php` | Pagalaescuela → EntregarPagoLigaToken | `.../webhooks/webhook_liga.php` |
| `pago_referencia.php` | EndPoint → Comercios → "Pagar referencia" | `.../webhooks/pago_referencia.php` |
| `cancela_pago_referencia.php` | EndPoint → Comercios → "Cancelar pago" | `.../webhooks/cancela_pago_referencia.php` |
| `consulta_referencia.php` | EndPoint → Comercios → "Consultar referencia" | `.../webhooks/consulta_referencia.php` |
| `entregar_referencia.php` | EndPoint → Comercios → "Entregar referencia" | `.../webhooks/entregar_referencia.php` |
| `pago_clabe.php` | EndPoint → Pago por SPEI → "Pagar clabe" | `.../webhooks/pago_clabe.php` |
| `cancela_pago_spei.php` | EndPoint → Pago por SPEI → "Cancelar pago" | `.../webhooks/cancela_pago_spei.php` |
| `consulta_clabe.php` | EndPoint → Pago por SPEI → "Consultar clabe" | `.../webhooks/consulta_clabe.php` |
| `entregar_clabe.php` | EndPoint → Pago por SPEI → "Entregar clabe" | `.../webhooks/entregar_clabe.php` |

`config.php` (`WEBHOOK_URL`, `WEBHOOK_LIGA_URL`) ya se actualizó con el prefijo `/webhooks/` — solo son constantes informativas (no se leen en ningún flujo de pago), pero conviene que reflejen la URL real que le das a Pagadetodo.

### 5. Base de datos — migraciones
- Correr `migracion_2026_08_20_suscripciones.sql` una sola vez (phpMyAdmin o consola MySQL de Hostinger) **antes** de subir el `api.php` nuevo — agrega `fecha_vencimiento_plan` / `ultimo_recordatorio_plan` a `escuelas`.
- Correr también `migracion_2026_08_20_pagos_recurrentes.sql` — agrega los campos de recurrencia/penalización a `productos` y `cobros`, y crea la tabla `pagos_recurrentes_generados`. Sin esto, los conceptos recurrentes (Productos → tipo "Recurrente") no se generan ni se penalizan.
- Correr también `migracion_2026_08_20_revocacion_sesiones.sql` — agrega `usuarios.sesion_valida_desde`, usada para poder invalidar tokens ya emitidos (al cambiar contraseña, o al forzar el cierre de sesión de alguien desde Usuarios). Sin esto, `verificar_token_auth()` en api.php tronaría con "columna desconocida".
- Correr también `migracion_2026_08_20_fix_metodo_enum.sql` — corrige un bug real: `cron_recordatorios.php` generaba cobros con `metodo='Pendiente'`, valor que no existía en el ENUM de `cobros.metodo` y MySQL lo silenciaba a `''` (confirmado en producción: cobros #187-192). Agrega `'Pendiente'` al ENUM, corrige los registros ya afectados, y agrega el índice `idx_cobros_estado` que le faltaba a la tabla para no escanearla completa cada vez que el cron busca cobros pendientes.
- Correr también `migracion_2026_08_20_plan_enum.sql` — convierte `escuelas.plan` de texto libre a `ENUM('basico','avanzado','pro')`, para que un typo no pueda dejar a un colegio con un plan inválido (el código ya tenía que defenderse de esto).

### 5.1 Seguridad — pendiente de tu parte (no se puede arreglar solo en código)
- **Hacer privado el repo de GitHub** (`Sangigi/EduPago`) — está público con `config.php` completo expuesto.
- **Rotar `DB_PASS` y `PDT_PASS`** — nunca se rotaron pese a estar expuestos desde la misma fuga que sí motivó rotar otros dos secretos.
- Después de rotar: considera sacar `config.php` de git (`git rm --cached config.php` + `.gitignore`) para que la próxima vez que lo edites no se vuelva a subir con el bot de auto-commit.
- `pago_referencia.php` / `cancela_pago_referencia.php` / `webhook_liga.php`: su protocolo con Cobroscontarjeta.com no admite token, así que la única defensa real es lista blanca de IP — pide la IP real a Cobroscontarjeta.com/Pagadetodo y agrégala en `config.php` → `IPS_PERMITIDAS_PAGOS_SIN_TOKEN` (hoy vacío = sin restricción).

### 5.2 Limpieza de datos de prueba
- Corre `reporte_datos_prueba.sql` (solo `SELECT`, no borra nada) en phpMyAdmin y revisa los resultados — agrupa alumnos/familias/colegios/cobros que parecen ser de las pruebas que hicimos juntos (emails `@example.com`, nombres como "q"/"123", el colegio "Instituto Tecnológico Naulcalpan" de prueba, cobros de $0.01). Con base en eso se genera `limpieza_datos_prueba.sql` con los `DELETE` que confirmes — no se borra nada sin que lo revises primero.

### 5.3 Bug corregido: `saldo_pendiente` desincronizable en pagos SPEI
- `clientes.saldo_pendiente` es una columna cacheada (no se calcula en vivo). Se recalculaba con la misma consulta copiada y pegada en 12 sitios (`api.php` x4, `webhook_liga.php`, `pago_referencia.php`, `cancela_pago_referencia.php`, `cancela_pago_spei.php`, `pago_clabe.php`, `cron_recordatorios.php` x2) — salvo `webhook_spei.php`, que en vez de recalcular desde `cobros` hacía un decremento (`saldo_pendiente - total`). Si ese saldo alguna vez se desincronizaba por cualquier otra razón, la confirmación de un pago SPEI era el único flujo que nunca se autocorregía.
- Se centralizó en `helpers_pagos.php` → `recalcular_saldo_pendiente($pdo, $cliente_id)`, usada ahora en los 12 sitios (incluido el de SPEI, ya corregido). No requiere migración de base de datos — es un fix de lógica, no de esquema.

### 5.3b Hueco de auditoría cerrado: acciones de dinero sin registrar en `logs_sistema`
- `registrar_log()` ya se usaba en 24 sitios (creación de usuarios, escuelas, etc.) pero ninguna de las 7 acciones que mueven dinero de verdad la llamaba: `generar_liga`, `cobrar_cai`, `cancelar_cai`, `generar_referencia_efectivo`, `crear_cobro`, `confirmar_pago`, `cancelar_cobro`. Quedaban fuera del log de auditoría precisamente las acciones más sensibles del sistema.
- Se agregó `registrar_log()` a las 7 (con acciones descriptivas: `liga_pago_generada`, `cargo_automatico_cobrado`, `tarjeta_domiciliada_cancelada`, `referencia_efectivo_generada`, `cobro_creado`, `pago_confirmado_manual`, `cobro_cancelado`). `verificar_spei` se dejó fuera a propósito: es una consulta de solo lectura (no modifica nada), registrarla solo generaría ruido en `logs_sistema` sin valor de auditoría.
- No requiere migración SQL (la tabla y la función ya existían).

### 5.3c Deduplicado: check "admin no puede tocar un usuario de otra escuela ni a un superadmin"
- Este check estaba copiado casi idéntico en 4 acciones (`editar_usuario`, `toggle_usuario`, `cerrar_sesiones_usuario`, `eliminar_usuario`). Se centralizó en `validar_admin_sobre_usuario($pdo, $rol_actual, $usuario_actual, $id, $mensaje)` (api.php, junto a `validar_email_opcional`) — misma lógica exacta, sin cambios de comportamiento.
- No requiere migración SQL.

### 5.3d Frontend: se quitó la mezcla de datos reales con `AppModel` (localStorage)
- `models/AppModel.js` es un store de localStorage de antes de que existiera el backend real. `assets/js/app.js` (función `cargarDatosDesdeAPI`) mezclaba la respuesta real de la API con `AppModel.load()`: si la API regresaba `escuelas`, `productos` o `recordatorios` vacíos, se rellenaba con lo último guardado en localStorage en vez de reflejar el estado real — y ese resultado mezclado se volvía a guardar en `AppModel`, perpetuando datos viejos en pantalla.
- Se quitó la mezcla: ahora `cargarDatosDesdeAPI` siempre confía en la respuesta real de la API, sin caché local de por medio. Los usos de `AppModel.load()` como respaldo cuando la API no responde (sesión 401, error de red, o sin sesión) se dejaron intactos a propósito — no es el mismo problema (es un respaldo ante falla, no una mezcla silenciosa con datos válidos).
- Las ~9 vistas que todavía llaman `AppModel.save(...)` quedaron sin tocar por ahora (son escrituras inofensivas a un store que ya nadie lee para mostrar datos reales) — limpiarlas es la Fase 5 del plan de refactor.
- JS-only, no requiere migración.

### 5.3e Frontend: consolidados los 5 `apiPost()` duplicados en `ApiClient.js`
- `AuthController.js`, `CajaController.js`, `ClienteController.js`, `CobroController.js` y `ProductosController.js` reimplementaban, cada uno, la misma función `apiPost` (fetch + header de auth + logout en 401 + error si HTTP no-ok) — copiada 5 veces casi línea por línea.
- Se centralizó en `assets/js/ApiClient.js` (nuevo, cargado en `index.html` antes de los controllers) → `ApiClient.post(action, body)`. Cada controller ahora solo hace `const apiPost = ApiClient.post;` — ningún call site (`apiPost('crear_cobro', ...)`, etc.) cambió, mismo comportamiento exacto.
- Las 29 llamadas `fetch()` sueltas directamente en las vistas (que no pasan por ningún controller) quedaron sin tocar — es una limpieza aparte, de mayor superficie y riesgo, no incluida en esta pasada.
- JS-only, no requiere migración. Probar: login/logout (ruta 401), y una acción de escritura por cada dominio (caja, cliente, cobro, producto, usuario).

### 5.3f Backend reorganizado en `lib/` + `webhooks/` + logging/respuestas consolidados
- Los archivos internos que nunca se llaman por URL directa (`db.php`, `mailer.php`, `helpers_pagos.php`, y el nuevo `webhook_helpers.php`) se movieron a una carpeta `lib/`. Se actualizaron todos los `require_once` — verificado con `php -l` **y** con una ejecución real por CLI de varios endpoints (no basta con `php -l`: un `require_once` a una ruta que ya no existe es un error que solo aparece en tiempo de ejecución, no de sintaxis — así se encontró y corrigió un bug real: `lib/db.php` tenía su propio `require_once __DIR__ . '/config.php'` interno que quedó roto por el movimiento, lo que habría tronado TODO lo que usa `db.php`, incluyendo `api.php`).
- Los 10 endpoints de pago (`webhook_liga.php`, `webhook_spei.php`, `pago_referencia.php`, `cancela_pago_referencia.php`, `cancela_pago_spei.php`, `pago_clabe.php`, `consulta_referencia.php`, `consulta_clabe.php`, `entregar_referencia.php`, `entregar_clabe.php`) se movieron a una carpeta `webhooks/` — **esto requiere actualizar la URL en el Sandbox de Cobroscontarjeta.com/Pagadetodo para cada uno, ver sección 4.1**, no es automático.
- Además, esos mismos 10 archivos reimplementaban, cada uno, su propia función de "escribe una línea con fecha a un archivo de log" (`log_api_liga`, `log_ref_pago`, `log_ref_cancela`, `log_cancela_spei`, `log_clabe`, `log_ref`, `log_pago_clabe`, o líneas sueltas de `file_put_contents` en `webhook_spei.php`/`webhook_liga.php`). Se centralizó la mecánica de escritura en `lib/webhook_helpers.php` → `webhook_log($archivo, $mensaje)`; cada archivo conserva su propia función con su nombre, su condición de activado y su archivo de destino tal cual estaban (solo delegan la escritura real).
- Los 8 formateadores de respuesta (`responder_liga`, `responder` de SPEI, `responder_pago`, `responder_cancela`, `responder_cancela_spei`, `responder_consulta`, `responder_consulta_clabe`, `responder_pago_clabe`) también repetían el mismo mecanismo (`echo json_encode([...], JSON_UNESCAPED_UNICODE); exit;`). Se centralizó ESE mecanismo en `webhook_helpers.php` → `webhook_responder($payload)` — pero a propósito **no se unificó el contenido del JSON**: cada `responder_*` sigue armando su propio arreglo con los campos exactos que su proveedor/endpoint espera (`codigo`/`autorizacion`/`transaccion`/`fecha` en unos, `success`/`mensaje` en otros). Unificar los CAMPOS habría arriesgado romper el contrato externo con dinero real de por medio; unificar solo el "envíalo y corta" no cambia ni un campo de lo que cada proveedor recibe.
- Efecto secundario menor del movimiento a `webhooks/`: `webhook_liga.php` escribe dos archivos de diagnóstico crudo (`debug_webhook.txt`, `webhook_log.txt`) usando su propia carpeta como referencia — ahora aparecerán dentro de `webhooks/` en vez de en la raíz. Los logs importantes (`api_log.txt`, `referencias_log.txt`) NO se movieron, siguen en la raíz (se definen desde `config.php`, que no cambió de lugar).
- No requiere migración SQL.

### 5.3g Centralizado el cliente de Facturapi.io + corregido `CURLOPT_SSL_VERIFYPEER`
- Las 3 llamadas a Facturapi.io (`generar_cfdi`, `descargar_cfdi`, `enviar_factura_correo` en `api.php`) reimplementaban, cada una, su propio bloque `curl_init`/`curl_setopt_array`/`curl_exec`/`curl_close` — y las 3 tenían `CURLOPT_SSL_VERIFYPEER => false` puesto a mano, a diferencia de `curl_post()` (usado para Pagadetodo/Cobroscontarjeta.com), que ya usa `true`. Un endpoint HTTPS validando certificados en `false` acepta un certificado falso/interceptado sin avisar — real, aunque de menor severidad que los hallazgos de fraude de la auditoría de seguridad de esta sesión.
- Se centralizó en `lib/facturapi.php` → `facturapi_request($ruta, $metodo, $payload)`, con `CURLOPT_SSL_VERIFYPEER => true`.
- ⚠️ **Prueba esto antes de confiar en ello en producción**: pasar de `false` a `true` puede fallar si el bundle de certificados CA del servidor de Hostinger está desactualizado. Genera una factura real de prueba (`generar_cfdi`), descárgala (`descargar_cfdi`, ambos tipos xml/pdf) y envíala por correo (`enviar_factura_correo`) — si alguna falla con un error de SSL/certificado, es el hosting, no el código; en ese caso avísame para volver a `false` temporalmente mientras se resuelve con Hostinger.
- No requiere migración SQL.

### 5.3h Frontend: hook de paginación compartido (`usePaginaActual`) — adopción parcial, a propósito
- Se investigó la duplicación de "adopción amplia de `Badge.js`" del backlog de la Fase 8 y resultó ser un falso positivo: los 57 sitios con clases `badge-*` fuera de `Badge.js` (investigados con 12 agentes, uno por archivo) son badges de rol de usuario, plan de suscripción, activo/inactivo, etapa de embudo de distribuidor, estado de sesión de caja, botones de filtro y contadores de importación CSV — ninguno es un badge de `cobro.estado`/`cobro.metodo`. No había nada que convertir; se eliminó del backlog.
- Se creó `views/hooks/usePaginaActual.js` (cargado en `index.html` junto a los demás componentes compartidos) → `usePaginaActual(totalPaginas)`, que centraliza el estado de página actual + una función `irAPagina` que hace clamp a `[1, totalPaginas]`. A propósito NO calcula `totalPaginas` internamente — cada vista sigue calculándolo como ya lo hacía.
- ⚠️ Se llamaba originalmente `usePaginacion`, pero una actualización posterior del equipo agregó `views/components/Paginador.js` con una función global del MISMO nombre (`usePaginacion`) y firma/propósito totalmente distintos (pagina una lista completa ya cargada, no solo un número de página). En JavaScript no-strict esto no truena — la que cargue después sobreescribe silenciosamente a la otra — así que se detectó revisando el código, no por un error visible. Se renombró la de aquí a `usePaginaActual` para no chocar; `Paginador.js`/`usePaginacion` (de ellos) se dejó intacto, ya está más integrado (`Familias.js`).
- **Adoptado en `Logs.js`** (paginación de servidor simple) y en el historial de pagos de `PortalFamilia.js` (paginación de cliente sobre un arreglo ya cargado) — ambos son coincidencias limpias: solo manejaban número de página + clamp, sin nada más acoplado.
- **A propósito NO adoptado en `Cobros.js` ni `Alumnos.js`**: su `irAPagina` no es solo "cambiar de página" — también dispara un `fetch` al backend (`buscarEnServidor`) para traer esa página. Forzar el hook genérico ahí perdería esa llamada o requeriría un hook más grande y arriesgado ("paginación + fetch"), en las dos vistas de mayor tráfico del sistema, sin pruebas automatizadas. Se dejaron con su lógica original, intacta.
- **A propósito NO adoptado en la paginación por-hijo de `PortalFamilia.js`** (`paginaPends`, un objeto `{ [hijoId]: numeroPagina }`): son N contadores de página independientes según cuántos hijos tenga la familia, un patrón de "mapa de páginas dinámico" que no se puede resolver llamando un hook una vez por hijo dentro de un `.map()` (violaría las reglas de hooks de React). No es el mismo problema que resuelve `usePaginacion`.
- JS-only, no requiere migración. Verificado con `node --check` en los 3 archivos tocados.

### 5.3i Frontend: `ConfirmModal` compartido — adopción parcial, a propósito
- Se creó `views/components/ConfirmModal.js` (mismo `.modal`/`.modal-backdrop` que ya usaba el resto de la app), y se adoptó en `Usuarios.js`, que tenía su propio modal de confirmación armado a mano (para desactivar/eliminar un usuario). El estado (`confirm`/`setConfirm`/`confirmarAccion`) no cambió — solo se reemplazó el bloque de JSX que lo dibujaba por `<ConfirmModal abierto={...} titulo={...} mensaje={...} onConfirmar={...} onCancelar={...}/>`. Cero cambio de comportamiento.
- **A propósito NO se convirtieron** los 8 sitios que usan `confirm()`/`window.confirm()` nativo del navegador (`Cobros.js`, `Escuelas.js` x3, `Familias.js` x2, `Usuarios.js` (cerrar sesiones), `PortalFamilia.js`). El nativo ya funciona correctamente (bloquea y confirma de verdad); migrarlo a un modal de React requiere reestructurar el flujo de control de cada función (de un `if (!confirm(...)) return;` síncrono a un modal asíncrono con estado) — 8 sitios, varios de ellos acciones destructivas reales (eliminar colegio, eliminar plantel, desvincular familia), sin pruebas automatizadas. El beneficio es puramente estético (consistencia visual); el riesgo de que alguna conversión salga mal y una acción destructiva se dispare sin confirmar de verdad no vale ese beneficio. Si en algún momento quieres hacerlo, avísame y lo hacemos uno por uno con cuidado.
- JS-only, no requiere migración. Verificado con `node --check`.

### 5.3j Deduplicados 36 checks de rol puro con `requerir_rol()`
- El patrón "si el rol actual no está en esta lista, corta con 403 y este mensaje" (`if (!in_array($rolX, [...])) { http_response_code(403); respond([...]); }`) estaba repetido **36 veces** en `api.php`, con distintas combinaciones de roles permitidos y distintos mensajes, pero el mismo cuerpo exacto siempre.
- Se centralizó en `requerir_rol($rol_actual, $roles_permitidos, $mensaje)` (junto a `validar_admin_sobre_usuario`). Cada uno de los 36 sitios quedó en una sola línea — mismos roles permitidos, mismo mensaje, mismo comportamiento exacto.
- **A propósito NO se tocaron 3 sitios** que combinan el check de rol con una condición adicional vía `&&` (ej. `!in_array(...) && !$es_propio_perfil`) — esos siguen teniendo lógica extra que `requerir_rol()` no captura, se quedan como estaban.
- **A propósito NO se tocaron los checks de pertenencia** (~30 sitios que verifican que un admin/cajero solo toque filas de su propia escuela, o que una familia solo toque a sus propios hijos) — esos SÍ tienen variaciones reales entre sitios (`!=` vs `!==`, `?? null` vs `?? -1`/`?? -2` como valor de respaldo) que hay que revisar uno por uno antes de unificar, para no cambiar sutilmente el comportamiento de seguridad de ninguno. Queda pendiente para una próxima pasada, con más tiempo dedicado a verificar cada caso.
- Verificado con `php -l`, con una prueba unitaria aislada de `requerir_rol()` (caso permitido sigue ejecutando; caso no permitido corta con 403 y el mensaje exacto), y con una ejecución real de `api.php` por CLI. No requiere migración SQL.

### 5.3k Deduplicados los checks de pertenencia (escuela/familia) restantes
- Se completó la limpieza de checks de autorización: 17 sitios de "solo tu propia escuela" (admin/cajero limitados a su escuela, superadmin exento) se centralizaron en `requerir_escuela_propia($rol_actual, $escuela_id_fila, $usuario_actual, $mensaje)`, y 8 sitios de "solo tus propios hijos" (familia limitada a su propia familia_id) en `requerir_familia_propia($familia_id_fila, $usuario_actual, $mensaje)`.
- Varios sitios originales usaban comparación floja (`!=` sin `intval`, con `?? null` de respaldo) mientras otros ya usaban `intval(...) !== intval(...)` con respaldo `-1`/`-2`. Se unificó todo a la versión estricta con respaldo numérico — en la práctica **no cambia ningún resultado real** (un `escuela_id`/`familia_id` real nunca es `0` en este esquema), pero cierra un caso teórico donde "escuela ausente" pudiera compararse como igual a "escuela ausente" en el otro lado.
- **A propósito NO se tocaron 4 sitios** que resuelven el permiso con 3 ramas OR distintas (superadmin / familia-propia / admin-cajero-de-su-escuela) en una sola variable booleana antes de negar: `cancelar_cai`, `descargar_cfdi`, `enviar_factura_correo`, y la eliminación de tarjeta guardada. Su forma no es "niega salvo que" sino "calcula si algo de 3 formas distintas es cierto" — forzarlos en los helpers de arriba habría requerido reescribir la lógica, no solo extraerla.
- **A propósito NO se tocaron los 3 sitios compuestos** ya identificados antes (`editar_cliente`, `editar_familia`, `editar_usuario`), que combinan el check de rol con una excepción de "es su propio registro" vía `&&`.
- Verificado con `php -l`, pruebas unitarias aisladas de ambos helpers nuevos (`requerir_escuela_propia`: superadmin exento, admin con escuela distinta deniega, admin con su propia escuela pasa; `requerir_familia_propia`: familia propia pasa, fila no encontrada deniega, familia distinta deniega), y una ejecución real de `api.php` por CLI. No requiere migración SQL.
- Con esto, de los ~67 checks de autorización originales en `api.php`, quedan **13 sin tocar**: 4 definiciones de helper, 4 de 3 ramas OR, 3 compuestos con `&&`, y 1 que no es de autorización (revisa si un pago ya fue confirmado por el banco). Todos documentados arriba, ninguno es un descuido.

### 5.3l `api.php` dividido: el switch de 79 casos ahora vive en `acciones/`
- `api.php` era un solo archivo de ~4,200 líneas dominado por un `switch($action)` de 79 casos. Se dividió: cada caso pasó a su propio archivo `acciones/<accion>.php` (ej. `acciones/crear_cobro.php`), y `api.php` quedó en **332 líneas** — solo config, helpers compartidos, autenticación, y un despacho que hace `require __DIR__ . '/acciones/' . $action . '.php'`.
- **Verificación antes de mover una sola línea**: se confirmó que ningún `case` dependía de fall-through (todos terminan en `break`/`exit`/`respond()`, que a su vez llama `exit`), y que no había `case` apilados ni `break`/`continue` de múltiples niveles — condición necesaria para que la división no cambiara el comportamiento.
- **Seguridad del despacho**: `$action` vem de `$_GET`, controlado por quien llama. Antes de construir la ruta del archivo se exige que cumpla `^[a-z_]+$` (los 79 nombres de acción reales lo cumplen) — sin esto, alguien podría intentar `action=../../../algo` para forzar la inclusión de un archivo arbitrario. Verificado con pruebas reales: `../config`, path traversal con `/../../`, y nombres con `;`/mayúsculas/guiones — todos rechazados antes de tocar el filesystem.
- **Verificación de equivalencia**: se comparó el `api.php` viejo (switch) contra el nuevo (despacho) llamando a las mismas acciones con los mismos parámetros — 8 acciones de solo lectura autenticadas (`listar_usuarios`, `listar_logs`, `cargar_datos`, `listar_zonas`, `listar_clabes_pool`, `superadmin_listar_referidos`, `invitaciones_listar`) dieron respuesta **byte por byte idéntica** entre ambas versiones. También se probó `login`/`invitacion_ver` (públicas) y una acción inexistente.
- ⚠️ **Estas pruebas se corrieron contra la base de datos real** (las credenciales de `config.php` son las de producción) — por eso se usaron exclusivamente acciones de solo lectura, nunca una que cree/modifique/cobre/elimine algo.
- Se agregó `acciones/.htaccess` y `lib/.htaccess` (ambos con `Require all denied`) — esos archivos PHP solo deben ejecutarse vía `require()` desde `api.php` (que ya resolvió `$pdo`/`$usuario_actual`/`$input` antes de incluirlos), nunca accedidos directo por URL.
- **Si en el futuro agregas una acción nueva**: ya no se agrega un `case` a `api.php` — se crea un archivo nuevo en `acciones/<nombre_de_la_accion>.php` con el código de esa acción (sin `case`/`break`, el archivo completo ES el cuerpo). Cualquiera que siga trabajando en este repo (incluido el bot/proceso que hace commits automáticos) necesita saber esto — si alguien vuelve a agregar un `case` directo en un switch dentro de `api.php` por costumbre, no se ejecutará nunca porque el switch ya no existe.
- No requiere migración SQL.

### 5.3m "Recordar sesión" en el login
- Antes la sesión SIEMPRE se guardaba en `sessionStorage` (se pierde al cerrar la pestaña/navegador). Se agregó una casilla "Recordar sesión en este dispositivo" en `Login.js` — si se marca, `AuthController.login()` guarda en `localStorage` en su lugar, así que la sesión sigue abierta la próxima vez que se entre, hasta que el token expire (`APP_TOKEN_TTL`, 12h en `config.php`) o se cierre sesión manualmente.
- `getSession()` ahora revisa ambos almacenamientos (localStorage primero, luego sessionStorage) y `logout()` limpia los dos, para no dejar una sesión vieja huérfana en el que no se usó.
- JS-only, no requiere migración.

### 5.3n Deduplicado: "añadir logo" aparecía dos veces en el menú de perfil
- `views/components/MenuPerfil.js` tenía dos entradas separadas: "Editar mi perfil" (con un campo para pegar el enlace de tu foto) y "Logo de la escuela" (un modal aparte, casi idéntico, para pegar el enlace del logo). Misma mecánica ("pega un enlace de imagen"), duplicada en dos pantallas.
- Se fusionó: el campo del logo de la escuela ahora vive dentro de "Editar mi perfil" (solo visible para admin/superadmin con escuela asignada). Al guardar, si el logo cambió, se manda una llamada aparte a `editar_logo_escuela` (sigue siendo una tabla distinta — `escuelas`, no `usuarios` — así que no se puede fusionar en una sola petición al backend), pero desde la vista del usuario es un solo formulario.
- Se corrigió `assets/js/app.js` (`onActualizado`) para que separe `logo_url` (pertenece a la escuela) del resto de los campos (pertenecen al usuario) al reflejar el cambio en pantalla — antes esperaba un `tipo === 'logo'` que ya no existe.
- JS-only, no requiere migración.

### 5.3o Gráfica de "Tendencia de cobranza": filtro de rango de fechas real
- La gráfica del Dashboard mostraba muy pocos días con datos. Causa real: se calculaba en el navegador a partir de `data.cobros`, que `cargar_datos` solo llena con los últimos 90 días (y con un tope de 1000 filas) — cualquier rango más largo simplemente no tenía de dónde sacar datos.
- Se creó `acciones/tendencia_cobranza.php`: agrega cobros pagados por día (`SUM`/`GROUP BY fecha`) directo en el servidor, para el rango de fechas que pida el usuario — funciona igual de rápido para 7 días que para 1 año, porque nunca manda cobro por cobro al navegador. Mismo modelo de permisos que `listar_cobros` (`requerir_escuela_propia` + familia limitada a sus propios hijos). Tope de 400 días por petición (cubre el preset más largo, 1 año, con margen) para que nadie pida un rango de décadas.
- En `Dashboard.js` se agregó un selector de rango: **1 día, 5 días, 7 días, 1 mes, 3 meses, 6 meses, 1 año**, o **rango personalizado** (dos campos de fecha). Cambiar el rango dispara la consulta al nuevo endpoint automáticamente.
- Probado contra la base de datos real (de solo lectura, sin riesgo): un rango de 30 días para la escuela #1 mostró cobros en 11 días distintos (contra los ~2 que se veían antes), confirmando que el problema era la fuente de datos, no la gráfica en sí. También se probaron rangos inválidos (hasta antes que desde) y el tope de 400 días — ambos rechazados correctamente.
- No requiere migración SQL (usa la columna `cobros.fecha` que ya existe).

### 5.3p La verdadera "gráfica de historial de cobros" (en Cobros.js) — mismo filtro de rango
- La gráfica que el usuario tenía en mente en realidad era "Tendencia del periodo" en `views/Cobros.js`, no la del Dashboard (5.3o). Tenía un filtro viejo (`filtroPeriodo`: Hoy/Semana/Mes/Año/Todo) que solo filtraba en el navegador la página ya cargada — con paginación de servidor activa eso eran cuando mucho 200 filas, así que "Año" en la práctica mostraba lo mismo que "Semana".
- Se reemplazó por el mismo selector de `RANGOS_TENDENCIA` que el Dashboard (1 día, 5 días, 7 días, 1 mes, 3 meses, 6 meses, 1 año, personalizado, más "Todo" sin filtro de fecha) y se conectó de verdad al servidor:
  - `acciones/listar_cobros.php` ahora acepta `desde`/`hasta` opcionales — la tabla y las tarjetas de resumen ("Cobrado en este listado", etc.) filtran por fecha en la base de datos, no en la página ya traída.
  - `acciones/tendencia_cobranza.php` (creado en 5.3o) ahora acepta `metodo` opcional, para que la gráfica siga respetando el filtro de método que ya tenía Cobros.js. La gráfica misma se recalculó para usar el agregado del servidor en vez de `lista`.
  - El filtro de texto de búsqueda (folio/cliente/matrícula) a propósito NO se aplica a la gráfica — no tiene un equivalente claro en una suma por día, solo afecta la tabla.
- Probado contra la base real (solo lectura): `listar_cobros` con rango de 30 días devolvió cobros dentro del rango correcto; `tendencia_cobranza` con `metodo=TC` devolvió 8 días con pagos por tarjeta en los últimos 90 días.
- No requiere migración SQL.

### 5.4 Columnas de la base de datos — pendientes documentados (no tocar sin leer esto)
- **`usuarios.zona` / `planteles.zona` (texto) vs `zona_id` (FK a la tabla `zonas`)**: es una migración a normalizado que ya está en curso desde antes, NO un descuido. Hoy solo las filas nuevas (distribuidores #11/#12) tienen `zona_id` poblado — el resto de usuarios/planteles viejos sigue con `zona_id = NULL` y solo el texto libre. **No borres las columnas `zona` (texto) todavía** — primero hay que backfillear `zona_id` en todas las filas viejas cruzando contra `zonas.nombre`, confirmar que quedó 100% poblado, y solo entonces dropear el texto.
- **`escuelas.clabe_fija`**: legado, reemplazado por el sistema de `clabe_pool` (CLABEs individuales). Confirmado que ningún archivo PHP la lee ya (ni siquiera los webhooks de SPEI/CLABE) — es segura de eliminar cuando quieras, no es urgente.

### 6. Correo saliente (SMTP) y Cron de recordatorios
- `config.php` ya apunta a `contacto@pagalaescuela.com` (mail.pagalaescuela.com:465, SSL). Solo falta reemplazar `SMTP_PASS` con la contraseña real de esa cuenta.
- ⚠️ `config.php` está versionado en este repo con credenciales reales (y ya se filtró dos veces por estar en un repo público — ver los comentarios "ROTADO" en el archivo). Antes de subir la contraseña SMTP real, considera moverlo a `.gitignore` o a variables de entorno.
- En el panel de Hostinger → **Avanzado → Cron Jobs**, crear un cron diario (ej. todos los días a las 8:00 am) que ejecute:
  ```
  php /home/TU_USUARIO/domains/tudominio.com/public_html/cron_recordatorios.php
  ```
- Revisa `correos_log.txt` (se crea junto a `api.php`) para confirmar que los correos se están enviando.
- El mismo cron ahora también archiva `logs_sistema` (ver 6.1) — no hace falta un segundo cron en Hostinger.

### 6.1 Archivado automático de `logs_sistema`
- `logs_sistema` es la tabla que más rápido crece (registra cada login exitoso, no solo los fallidos). `cron_recordatorios.php` ahora incluye una sección que corre solo el día 1 de cada mes: mueve las filas de más de 180 días a `logs_sistema_archivo` (la crea sola con `CREATE TABLE ... LIKE`, no requiere migración manual) y las borra de la tabla activa.
- No se pierde histórico — solo se saca del camino de `listar_logs` (panel de Logs del superadmin) y de las consultas de rate-limiting de login, que solo miran los últimos minutos.
- Si alguna vez necesitas revisar logs viejos, consúltalos directo en `logs_sistema_archivo` desde phpMyAdmin (no está expuesta en la UI).
- Paginación de `listar_logs` y `listar_cobros`: se optimizó para que a offset alto (páginas muy avanzadas) MySQL no tenga que leer y descartar el ancho completo de cada fila solo para saltarla — primero busca los `id` de la página (solo toca la columna indexada) y después trae esas filas completas. No cambia la API ni el frontend, solo el rendimiento interno.

## Estructura de archivos
```
index.html              ← Entrada principal (no requiere build, carga todo por <script src>)
config.php              ← ⚠ Credenciales (no versionar)
api.php                 ← Router (332 líneas): auth + despacho a acciones/<accion>.php
cron_recordatorios.php  ← Job diario (Hostinger Cron Jobs) — recordatorios + archivado de logs

acciones/               ← Una accion nueva = un archivo nuevo aquí (ya NO un case en api.php)
  crear_cobro.php, listar_usuarios.php, ...  (79 archivos, uno por acción — ver 5.3l)

lib/                    ← Librerías internas (nunca se llaman por URL directa)
  db.php                ←   Conexión PDO
  mailer.php            ←   Cliente SMTP (enviar_correo)
  helpers_pagos.php     ←   recalcular_saldo_pendiente()
  webhook_helpers.php   ←   webhook_log() + webhook_responder() compartidos
  facturapi.php         ←   facturapi_request() — cliente HTTP hacia Facturapi.io

webhooks/               ← Endpoints de pago con URL fija en el Sandbox de Cobroscontarjeta.com/
  webhook_liga.php,     ←   Pagadetodo — mover/renombrar CUALQUIERA de estos 10 requiere
  webhook_spei.php,     ←   actualizar la URL correspondiente en el Sandbox (ver sección 4.1).
  pago_referencia.php,
  cancela_pago_*.php,
  consulta_*.php,
  entregar_*.php

assets/css/main.css     ← Estilos (paleta Pagalaescuela)
assets/js/app.js        ← Router principal React (carga/mezcla datos, sesión)
assets/js/ApiClient.js  ← Cliente HTTP compartido (fetch + auth + logout en 401)
controllers/*.js        ← Un controller por dominio (Auth, Caja, Cliente, Cobro, Productos)
models/AppModel.js      ← Remanente de localStorage (legado, en limpieza — ver 5.3d)
views/*.js              ← Una vista por pantalla (Login, PortalFamilia, Cobros, Escuelas...)
views/components/       ← Componentes compartidos (Badge, Icons, EmojiPicker, ConfirmModal)
views/hooks/            ← Hooks compartidos (usePaginaActual)

migracion_*.sql         ← Migraciones manuales (correr una vez en phpMyAdmin, ver sección 5)
```
