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
- Dar la URL `https://tudominio.com/webhook_spei.php` a Pagadetodo
- Verificar que el archivo sea accesible sin autenticación

### 5. Base de datos — migraciones
- Correr `migracion_2026_08_20_suscripciones.sql` una sola vez (phpMyAdmin o consola MySQL de Hostinger) **antes** de subir el `api.php` nuevo — agrega `fecha_vencimiento_plan` / `ultimo_recordatorio_plan` a `escuelas`.
- Correr también `migracion_2026_08_20_pagos_recurrentes.sql` — agrega los campos de recurrencia/penalización a `productos` y `cobros`, y crea la tabla `pagos_recurrentes_generados`. Sin esto, los conceptos recurrentes (Productos → tipo "Recurrente") no se generan ni se penalizan.

### 6. Correo saliente (SMTP) y Cron de recordatorios
- `config.php` ya apunta a `contacto@pagalaescuela.com` (mail.pagalaescuela.com:465, SSL). Solo falta reemplazar `SMTP_PASS` con la contraseña real de esa cuenta.
- ⚠️ `config.php` está versionado en este repo con credenciales reales (y ya se filtró dos veces por estar en un repo público — ver los comentarios "ROTADO" en el archivo). Antes de subir la contraseña SMTP real, considera moverlo a `.gitignore` o a variables de entorno.
- En el panel de Hostinger → **Avanzado → Cron Jobs**, crear un cron diario (ej. todos los días a las 8:00 am) que ejecute:
  ```
  php /home/TU_USUARIO/domains/tudominio.com/public_html/cron_recordatorios.php
  ```
- Revisa `correos_log.txt` (se crea junto a `api.php`) para confirmar que los correos se están enviando.

## Estructura de archivos
```
index.html          ← Entrada principal (no requiere build)
config.php          ← ⚠ Credenciales (no versionar)
api.php             ← Backend PHP unificado
webhook_spei.php    ← Receptor de notificaciones SPEI
assets/css/main.css ← Estilos (paleta Pagalaescuela)
assets/js/app.jsx   ← Router principal React
views/Login.jsx     ← Pantalla de login (admin + familias)
views/PortalFamilia.jsx ← Portal de padres de familia
```
