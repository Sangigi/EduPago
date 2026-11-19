# Herramientas de línea de comandos

Se corren desde la raíz del proyecto, por SSH o en tu computadora:

```
php herramientas/<nombre>.php
```

**Solo CLI.** Cada script se niega a correr si no lo llama la línea de comandos, y la carpeta tiene `.htaccess` con `Require all denied`: no se pueden abrir desde el navegador.

Las herramientas que tocan la base usan la misma que la aplicación (`config.php`, vía `lib/db.php`) y **no imprimen credenciales**. Para probar contra otra base sin tocar `config.php` hay variables de entorno (ver `_conexion.php`):

```
EDUPAGO_DB_NAME=edupago_prueba EDUPAGO_DB_USER=root EDUPAGO_DB_PASS= php herramientas/migrar.php
```

## Antes de cada despliegue

En tu computadora, con la rama lista:

1. `php herramientas/revisar-sintaxis.php` — debe terminar en "Todo en orden".
2. `php herramientas/pruebas.php` — debe dar 0 con falla.
3. `php herramientas/revisar-acciones.php` — mira si **apareció una acción nueva** en la lista (comparada con la anterior). No bloquea, pero una acción nueva que escribe y no valida rol es justo lo que esto existe para atrapar.

En el servidor, **después** del `git pull`:

4. `php herramientas/migrar.php` — muestra qué falta (no cambia nada).
5. `php herramientas/migrar.php --aplicar` — aplica lo pendiente. Es seguro repetirlo.
6. `php herramientas/revisar-migraciones.php` — confirma que la base quedó al día.

(Los pasos 4 y 5 también se pueden hacer desde la pantalla **Diagnóstico → Base de datos** del superadmin; ver `docs/mejoras-of/of4-migraciones.md`.)

## Qué hace cada una

### `migrar.php`
Migraciones automáticas de la base de datos (registro en `lib/migraciones.php`).
Sin argumentos solo **muestra** los pasos pendientes y sale con código 2 si hay alguno. Con `--aplicar` los aplica. Con `--todo` lista también los ya aplicados.
Cada paso se verifica contra `information_schema` antes de ejecutarse y lo hecho queda en la tabla `schema_migraciones`. **Correr todo dos veces no hace nada la segunda.** Una base donde los `.sql` ya se corrieron a mano da "ya existía" y los backfills peligrosos (p. ej. el 5b de F3, que publica periodos) **no se repiten**.

### `revisar-sintaxis.php`
`php -l` de todos los `.php` y `node --check` de todos los `.js`. Tarda ~30 s. Código ≠ 0 si algo falla.
Para los `.js` busca `node` solo (argumento `--node=RUTA`, variable `NODE`, PATH o `C:/Program Files/nodejs`); si no lo encuentra los omite con un aviso. `--sin-js` los salta a propósito.
**Por qué:** el frontend es JavaScript precompilado y sin build; un error de sintaxis no se nota hasta que alguien abre esa pantalla.

### `pruebas.php`
Pruebas de la lógica de dinero, **sin base de datos ni red**: reparto de IVA en facturas (`cfdi_armar_renglones`, residuos de redondeo, becas, recargos), complemento de pago, cálculo de becas (incluye 2000 casos aleatorios con semilla fija), folios de abono, centavos del monedero y la decisión de origen de los webhooks. `php herramientas/pruebas.php becas` corre solo las que contengan "becas"; `--lista` las enumera.
No modifica las funciones que prueba. Si una falla, léela antes de concluir: puede estar mal el supuesto de la prueba. Un fallo real se reporta con el caso exacto y se corrige en la función, no aquí.

### `revisar-acciones.php`
Diagnóstico de autorización: lista las `acciones/*.php` que **no** llaman a `requerir_rol()` (ni a una función "puerta" que la llame, como `escolar_ctx`, `monedero_ctx`, `expediente_alumno`; se descubren solas) y que no están en la lista de excepciones (públicas, leídas de `api.php`, y autoservicio). Marca con `E` las que escriben en la base y anota qué otras validaciones tienen.
**No corrige nada.** `requerir_rol()` no es "default-deny" global: solo protege a las acciones que la llaman. Que una acción aparezca aquí no prueba que esté abierta (puede validar a mano); que no aparezca no prueba que el filtro de escuela sea correcto. `--estricto` sale con código 1 si hay alguna; `--todo` lista también las que cumplen.
Si agregas una acción pública o de autoservicio legítima, añádela a las excepciones documentadas al principio del script.

### `revisar-migraciones.php`
Dos revisiones sobre la base conectada:
1. **Confiable:** que todos los pasos del registro estén aplicados. Código 1 si falta alguno.
2. **Aproximada:** columnas que el código **escribe** (`INSERT INTO tabla (cols…)` y `UPDATE tabla SET col = …`) y que la base no tiene. No cubre los `SELECT`, los `UPDATE` con JOIN o alias ni el SQL con nombres interpolados, y mucho código es *tolerante* a propósito (revisa si la columna existe y cae al comportamiento anterior), así que es una lista para leer, no un veredicto. Contra una base incompleta (p. ej. una de prueba) da mucho ruido.
