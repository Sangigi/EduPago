# Rediseño de interfaz al estilo OF (rama `mejoras-of-ui`)

Solo diseño visual: no cambian textos, flujos, rutas, permisos ni lógica.
Vista previa sin servidor: abre `docs/mejoras-of/ui-preview.html` con doble clic
(carga `../../assets/css/main.css`; botones flotantes: Panel / Login / Modo oscuro).

## Qué se cambió

| Archivo | Cambio |
|---|---|
| `assets/css/main.css` | Tokens de `:root` remapeados a OF; reescritas las reglas de sidebar, topbar, botones, tarjetas, indicadores, tablas, badges, formularios, modales, login, pastillas, interruptor y tema oscuro. El resto (POS, paginador, esqueletos, responsive) se conserva y hereda los tokens. |
| `index.html` | Fuentes: Google Sans + JetBrains Mono (misma URL que `layout.php` de OF). Splash usa Google Sans. Carga `tema-temprano.js`. Versiones `?v=1795700000`. |
| `assets/js/tema-temprano.js` (nuevo) | Aplica `data-theme="dark"` antes de pintar. |
| `views/Login.js` | Colores de iconos, avisos y casilla para leerse sobre la tarjeta verde oscuro. |
| `views/components/Charts.js`, `Dashboard.js`, `Reportes.js` | Paleta categórica de OF; la serie "Tarjeta" pasa a `--lf-pizarra` (si siguiera como `--violet` sería el mismo verde que "Efectivo"). |
| `views/PortalFamilia.js` | `fontFamily` por variable (`var(--font)`) en vez de "DM Sans" fijo. |
| `registro.html`, `activar_cuenta.html` | Páginas públicas independientes: tokens/fuente/pared verde como el login. |

`app.js` NO se modificó: el marcado del menú y la barra ya era el de OF (grupos
`.nav-section`, ítems `.nav-item`, `.topbar-title`); bastó el CSS.

## Lenguaje visual de OF aplicado

- Lienzo gris-verdoso `#f1f4f2`; panel blanco que flota (esquina superior izquierda 26 px, borde de 1 px).
- Superficies por color, sombras muy bajas (`--lf-s1/s2/s3`), radios 7/9/12/18/26/píldora.
- Menú lateral de 240 px transparente; ítem de 12 px de radio; activo con fondo de marca tenue, texto de marca, peso 600 y barrita de 3 px al borde derecho; grupos en mayúsculas de 10 px.
- Barra superior de 64 px con título de 17 px e icono de marca; botón de tema redondo de 36 px.
- Botones en píldora (primario sólido, secundario blanco con borde, peligro/éxito en tinte suave).
- Tarjetas de 18 px; indicadores con azulejo de icono, **cifra en JetBrains Mono 29 px** y etiqueta debajo.
- Tablas: cabecera flotante sobre `--lf-vidrio` sin borde, filas con línea fina, hover con tinte de marca.
- Badges en píldora de 10.5 px mayúsculas con borde del mismo tono; campos de 12 px con anillo de foco de marca; modales de 26 px con pie en superficie 2.
- Pestañas/filtros: `.pill` (píldora, activa sólida de marca). Estados vacíos: texto centrado en tinta tenue.
- Login: marca de pared a pared y tarjeta verde oscuro con campos blancos, como OF. El logo conserva su contenedor navy `#272c64` con padding de 10 px (no se tocó).
- Modo oscuro: paleta oscura de OF (`#0c110f / #141b18 / #1a2320 / #202b27`), `color-scheme: dark`.

### Sin parpadeo blanco
OF lo evita con un `<script>` en línea en el `<head>`. La CSP de EduPago
(`script-src 'self' …`, sin `unsafe-inline`) no lo permite, así que es
`assets/js/tema-temprano.js`, cargado en el `<head>` **sin `defer`** y antes de
`main.css`. Aplica la MISMA regla que ya tenían `app.js` y `PortalFamilia.js`
(llave `edupago_theme`; sin preferencia guardada, sigue al sistema operativo).
Nota: OF nunca hereda el tema del sistema; EduPago sí lo hace, y no se cambió
porque es comportamiento, no apariencia.

### Fuentes y CSP
El `Content-Security-Policy` de `.htaccess` ya incluye `style-src … https://fonts.googleapis.com`
y `font-src 'self' https://fonts.gstatic.com`. **No hace falta editar `.htaccess`.**

## Color de marca: cómo cambiarlo

En `assets/css/main.css`, primer bloque de `:root`:

```css
--lf-brand: #49af54;   /* ← la ÚNICA línea */
```

Todo lo demás se calcula con `color-mix()` (como en OF):

| Variable | Fórmula | Uso |
|---|---|---|
| `--lf-brand-2` | marca 70 % + negro | texto de marca sobre claro (5.2:1 sobre blanco) |
| `--lf-brand-d` | marca 75 % + negro | **fondos con texto blanco** (botón primario, pastilla activa: 4.7:1) |
| `--lf-brand-dd` | marca 62 % + negro | hover de esos fondos |
| `--lf-brand-3` | marca 65 % + blanco | tono claro |
| `--lf-brand-soft` | marca 11 % + blanco | ítem activo, azulejos, badges |
| `--lf-brand-glow` / `-ring` | marca 10 % / 22 % transparente | hover de fila, anillo de foco |

En oscuro `--lf-brand-2` es marca 55 % + blanco. Si la marca es muy clara, los
porcentajes de `-2`/`-d` pueden requerir ajuste para mantener 4.5:1. El login
y `registro.html`/`activar_cuenta.html`: el login sale de la variable;
`registro.html` y `activar_cuenta.html` usan literales (no cargan `main.css`):
`#337b3b`, `#49af54`, `#214f26`.

## Mapa de variables EduPago → valores de OF

| EduPago (se conserva el nombre) | Valor ahora |
|---|---|
| `--bg-main` / `--bg-panel` / `--bg-surface` / `--bg-surface-2` | `--lf-lienzo #f1f4f2` / `--lf-panel #fff` / `--lf-sup #fff` / `--lf-sup-2 #f7f9f8` (oscuro: `#0c110f / #141b18 / #1a2320 / #202b27`) |
| `--glass-light` | `--lf-vidrio #f3f6f4` (oscuro `rgba(255,255,255,.05)`) |
| `--border-glow` / `--border-strong` | `--lf-linea #e6ebe8` / `--lf-linea-f #d4dcd8` |
| `--ink` / `--ink-2` / `--ink-3` / `--ink-4` | `#1b2420` / `#43504a` / `#5a6760` / `#63706a` (OF usa `#68756f`/`#6c7771`; se oscurecieron para llegar a 4.5:1 también sobre lienzo y cabecera de tabla) |
| `--shadow-glass` / `--shadow-md` / `--shadow-lg` | `--lf-s1` / `--lf-s2` / `--lf-s3` |
| `--radius-sm` / `--radius` / `--radius-lg` / `--radius-panel` | 9 / 12 / 18 / 26 px (+ `--radius-xs` 7) |
| `--font` / `--mono` | Google Sans / JetBrains Mono |
| `--sidebar-w` / `--header-h` | 240 px / 64 px |
| `--accent`, `--violet` | `--lf-brand-2` (alias: ya no son violeta) |
| `--violet-dark` / `-light` / `-soft` | `--lf-brand-dd` / `--lf-brand-3` / `--lf-brand-soft` |
| `--accent-glow` | `--lf-brand-glow` |
| `--btn-gradient`, `--accent-gradient` | `--lf-brand-d` (sólido) |
| `--grad-brand/-cool/-warm` | degradado `--lf-brand-d → --lf-brand-dd` |
| `--green`, `--green-dark` | `--lf-brand-2` (texto legible; el verde puro da 2.8:1) |
| `--green-glow` | `--lf-brand-glow` |
| `--lime` | `--lf-lima-ink #4a7a22` (el `#bdcf00` daba 1.8:1 como texto) |
| `--amber` / `--amber-glow` | `--lf-amb-ink #8f5f00` (OF `#c58a14` da 3:1) / `--lf-amb-soft` |
| `--red` / `--red-glow` | `--lf-rojo #c23b2e` (OF `#cf4436`) / `--lf-rojo-soft` |
| `--cyan` / `--magenta` / `--purple` | `--lf-info #1a7499` / `--lf-pizarra #2c3e50` / `--lf-pizarra` |
| `--navy*` | sin cambio (solo logo/splash) |
| `.badge-blue` / `.badge-purple` | info de OF / pizarra de OF |

Desviaciones deliberadas respecto a OF, por el mínimo de 4.5:1: botones primarios
con `--lf-brand-d` (OF usa el verde puro con texto blanco, 2.8:1), ámbar y rojo de texto un tono más oscuro, tinta 3/4 más oscura y el botón de entrar del login con texto oscuro en vez de blanco.

## Lo que quedó con estilo inline fijo (no sigue la paleta)

Hay ~2,170 bloques `style: {…}` en vistas; casi todos usan variables y se re-tiñen solos.
Colores literales (hex/rgba, sin contar blanco): **~242 en total**. Los principales:

| Archivo | Literales |
|---|---|
| `views/PortalFamilia.js` | 43 |
| `views/components/Comprobantes.js` | 32 (HTML de recibos/impresión: se deja a propósito) |
| `views/Caja.js` | 29 |
| `views/components/Charts.js` | 27 (paleta categórica; ya remapeada) |
| `views/Usuarios.js` | 25 (colores por rol: violeta/fucsia/lima fijos — identifican el rol) |
| `views/ControlEscolar.js` | 14 |
| `views/Login.js` | 13 |
| `assets/js/app.js` | 9 |
| resto (Distribuidor, Facturacion, Suscripciones, …) | ≤7 cada uno |

Además: avatares por rol (`.avatar-familia`, `-distribuidor`, `-contador`, `-soporte`,
`-provision`, `-tesoreria`, `-promotor`) conservan sus degradados fijos para coincidir con
`ROL_INFO` de `Usuarios.js`; la clase `badge-purple` ahora es pizarra, pero `Usuarios.js`
fija violeta/fucsia en línea para esos roles. El navy `#272c64`/`#282d65` (logo, splash) se
mantiene por pedido del dueño. `demo_api.js` aún nombra "DM Sans" en un aviso de demo.

## Riesgos

- **Hay que desplegar todo junto** (`main.css`, `index.html`, `tema-temprano.js`, vistas): `index.html` ya trae `?v=1795700000` para forzar caché.
- **Google Sans se carga de Google Fonts**; sin red cae a `system-ui` (igual que OF).
- Vistas con colores fijos (arriba) pueden verse "de otra paleta"; `Usuarios.js` es la más visible.
- Botones primarios y pastillas activas son un verde más oscuro que el de OF por contraste; si el dueño prefiere el verde puro, cambiar `--lf-brand-d` a `var(--lf-brand)` (baja a 2.8:1 con texto blanco).
- `border-collapse` de las tablas pasó a `separate` (como OF, para cabecera redondeada): tablas con bordes en línea podrían mostrar diferencias mínimas.
- `.btn-sm` ahora es píldora (antes 9 px); `.card` tiene 22 px de padding (antes 24).
- Sin build ni pruebas automáticas de UI: se verificó con capturas de `ui-preview.html` en Edge headless (claro, oscuro y login). No se revisó cada vista de la app real con datos.
