# OF-4a — Migraciones automáticas, comprobadores, pruebas e incoherencias

Esta fase trae cuatro cosas, tomadas de la práctica de OF-LIBERTYFIN:

1. **Migraciones automáticas versionadas** (este documento).
2. Comprobadores que se corren antes de desplegar (`herramientas/`, ver `herramientas/LEEME.md`).
3. Pruebas de la lógica de dinero sin base de datos (`herramientas/pruebas.php`).
4. Detector de incoherencias de datos, solo lectura (Diagnóstico → Incoherencias).

## 1. Cómo se despliega desde ahora

Antes: `git pull` + pegar el `.sql` de cada fase en phpMyAdmin, saltándose a mano las sentencias que marcaban "Duplicate column name". Además había backfills peligrosos de repetir (el `UPDATE periodos_evaluacion SET publicado = 1` de F3 publica periodos que el colegio ocultó).

Ahora:

```
git pull
php herramientas/migrar.php            # muestra qué falta; NO cambia nada
php herramientas/migrar.php --aplicar  # lo aplica
```

o, sin SSH: **Diagnóstico → Base de datos → Aplicar pendientes** (solo superadmin, con confirmación). Mientras haya pasos pendientes el superadmin ve un aviso en cualquier pantalla.

**Hazlo fuera de horario de cobro.** Un `ALTER TABLE` sobre una tabla grande la bloquea mientras corre. El migrador nunca se ejecuta solo (no corre en peticiones web normales), usa un candado (`GET_LOCK`) para que no haya dos a la vez y un `lock_wait_timeout` de 20 s: si no logra entrar rápido a una tabla ocupada, se rinde sin registrar nada en vez de formar una cola detrás de sí y se puede reintentar.

Se detiene en el **primer error**; lo ya aplicado queda registrado y al reintentar continúa desde ahí.

### Qué pasa en una base donde el `.sql` ya corrió a mano

La primera corrida de `--aplicar` anota cada paso como `ya_existia` y **no toca datos**: los backfills solo corren si el paso que crea su columna lo aplicó el migrador (ver abajo). Se puede verificar antes con `php herramientas/migrar.php` (sin `--aplicar`): los pasos que ya existen salen como "por anotar" y la cuenta de pendientes es 0.

Los `.sql` de `migraciones/` se quedan como **documentación** (y para los backfills opcionales: el de tutores de F2 y el de folios de abonos de OF-3 siguen siendo manuales, comentados en su archivo).

## 2. El registro

`lib/migraciones.php` → `migraciones_registro()`: lista **ordenada** de pasos con id estable, p. ej. `2026_11_18_f1_01_clientes_estatus`. Cubre F1–F6, OF-2, OF-3, OF-7a y OF-7b (69 pasos; los 60 de las fases anteriores, los 7 de soporte y los 2 de push). **No cambies nunca el id de un paso que ya salió a producción:** quedaría como pendiente y se volvería a intentar.

| tipo | qué hace | cómo decide que ya está |
|---|---|---|
| `tabla` | `CREATE TABLE` | existe en `information_schema.TABLES` |
| `columna` | `ALTER TABLE … ADD COLUMN` | existe en `information_schema.COLUMNS` |
| `indice` | `ALTER TABLE … ADD INDEX` | existe en `information_schema.STATISTICS` |
| `modificar` | función PHP (p. ej. `MODIFY cobro_id … NULL` de OF-3) | su función `verificar()` |
| `datos` | backfill | **solo si** `depende_de` (ese paso quedó `aplicada` por el migrador) **o** su `condicion()` idempotente dice que hay trabajo |

Tabla de control `schema_migraciones` (se crea sola): `id`, `aplicada_en`, `duracion_ms`, `resultado` (`aplicada` | `ya_existia`), `detalle`.

Reglas que conviene recordar:

- Lo **estructural** se decide por `information_schema`, no por la tabla de control: si alguien borró una columna a mano, vuelve a crearse. Un backfill registrado **no se repite jamás**, aunque su columna se borre y se recree.
- Un paso de columna/índice cuya **tabla no existe** queda *bloqueado* con el motivo (p. ej. "Falta la tabla grupos (corre antes migracion_2026_11_13_control_escolar.sql)"): `migracion_2026_11_13_control_escolar.sql` y las anteriores a noviembre **no están en el registro**; se asumen aplicadas.
- `tolerante => true` (solo el `MODIFY` de `pagos_recurrentes_generados`): si falla, avisa y sigue; el cron funciona sin ese cambio. Queda pendiente hasta que se logre.

## 3. Cómo agregar un paso nuevo (el patrón para las siguientes fases)

1. Escribe tu `.sql` como siempre en `migraciones/` (documentación).
2. Al **final** de `migraciones_registro()` agrega los pasos, **uno por sentencia**, con el id `AAAA_MM_DD_<fase>_<nn>_<que>`:

```php
$f = 'migracion_2026_12_01_of5_algo.sql';
$columna('2026_12_01_of5_01_cobros_algo', 'cobros.algo (para qué sirve)',
    'cobros', 'algo', 'TINYINT(1) NOT NULL DEFAULT 0', $f);           // + 'AFTER_col' como 7.º argumento si hace falta
$indice('2026_12_01_of5_02_idx_cobros_algo', 'Índice cobros (algo)',
    'cobros', 'idx_cobros_algo', 'algo, estado', $f);
$tabla('2026_12_01_of5_03_cosas', 'Tabla cosas', 'cosas', "CREATE TABLE IF NOT EXISTS cosas ( … ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4", $f);
```

3. **Si hay backfill**, nunca lo pongas "suelto". Dos formas:

```php
// a) Atado a la columna que lo hace necesario (lo normal):
$r[] = ['id' => '2026_12_01_of5_04_backfill_algo', 'tipo' => 'datos', 'archivo' => $f,
    'desc' => 'Backfill: …',
    'depende_de' => '2026_12_01_of5_01_cobros_algo', 'tablas' => ['cobros'],
    'aplicar' => function (PDO $pdo): int {
        return (int) $pdo->exec("UPDATE cobros SET algo = 1 WHERE …");
    }];

// b) Con condición idempotente explícita (sin columna nueva):
$r[] = ['id' => '…', 'tipo' => 'datos', 'archivo' => $f, 'desc' => '…', 'tablas' => ['cobros'],
    'condicion' => function (PDO $pdo): bool { return (bool) $pdo->query("SELECT 1 FROM cobros WHERE … LIMIT 1")->fetch(); },
    'aplicar'   => function (PDO $pdo): int  { return (int) $pdo->exec("UPDATE …"); }];
```

   Pregúntate: *¿qué pasa si esto corre en una base donde ya se hizo a mano y el colegio ya cambió los datos?* Si la respuesta es "pisa algo", tiene que ir atado a `depende_de`.
4. Para lo que no cabe en columna/índice/tabla: `tipo => 'modificar'` con `verificar()` (true = ya está) y `aplicar()`.
5. Antes de commitear: `php herramientas/migrar.php` contra una base de pruebas (ver abajo), `php herramientas/revisar-sintaxis.php`.

## 4. Cómo se probó (19-nov-2026, MySQL 8.4 local)

Bases de prueba creadas ex profeso (`edupago_prueba_of4*`) con un esquema base mínimo inferido del código (el esquema base real de producción **no vive en el repositorio**) más `migracion_2026_09_21_abonos.sql` y `migracion_2026_11_13_control_escolar.sql`:

| Escenario | Resultado |
|---|---|
| **A.** los 8 `.sql` de noviembre aplicados a mano; el colegio oculta un periodo (`publicado = 0`) y un cliente inactivo queda con estatus `activo`; luego `--aplicar` | 60 × `ya_existia`, 0 aplicadas; el periodo oculto **sigue oculto** y el cliente **no se tocó**. Segunda corrida: "no había nada que hacer". |
| **B.** base sin ninguna migración | 60 × `aplicada` (backfills incluidos: periodos publicados, bajas en `baja_temporal`, `cobro_id` admite NULL); segunda y tercera corrida sin cambios; un periodo ocultado después **no se vuelve a publicar**. |
| **A vs B** | columnas e índices (tipo, nulabilidad, default, posición) **idénticos** en `information_schema` → el registro reproduce los `.sql`. |
| **C.** solo F1 y F3 a mano | 18 × `ya_existia`, 42 × `aplicada`; backfills de F1/F3 no se repiten. |
| **E.** sin las tablas del módulo escolar | los pasos de F3 que las necesitan salen *bloqueados* con el motivo y la corrida se detiene limpiamente; lo anterior queda registrado. |

**No se pudo probar:** MySQL **5.7** (producción; solo hay 8.4 local — el SQL usado es compatible con 5.7: `information_schema`, `ADD COLUMN`/`ADD INDEX` simples, sin `IF NOT EXISTS` de columnas), el tiempo de un `ALTER` sobre tablas con millones de filas, ni el comportamiento con `lock_wait_timeout` ante una consulta larga real.

## 5. Detector de incoherencias

`acciones/diagnostico_incoherencias.php` (superadmin y soporte; `escuela_id` opcional) + `lib/helpers_diagnostico.php`. **Solo lectura.** 14 reglas (12 de OF-4a + 2 de inventario de OF-6), cada una en su propio `try/catch` (si falta una tabla o columna dice "no disponible" y las demás siguen), con conteo, hasta 20 ejemplos con id y una frase de qué problema causa. Cada consulta lleva `max_execution_time` de 20 s. La pantalla (Diagnóstico → Incoherencias) corre a petición, no al abrirse.

Notas de criterio:
- "Pagados con monto menor al total" se separa en **posteriores** y **anteriores** al libro de abonos (la frontera es la fecha del primer abono en `cobro_abonos`).
- "Abonos vs monto_pagado" solo mira cobros con al menos un abono.
- "Conceptos vs total" solo mira cobros cuyos conceptos **todos** tienen snapshot de IVA (OF-2).
- Los pagos no aplicados sin colegio identificado solo aparecen sin filtro por colegio.
- Una regla que da hallazgos **no** dice cuál cifra es la buena: casi siempre manda el libro (abonos / movimientos del monedero), y se corrige con la función de recálculo correspondiente, a mano y con criterio.

Soporte necesita `diagnostico_incoherencias` en su allowlist de `api.php` (corre antes del despacho; sin eso recibe 403).
