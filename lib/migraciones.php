<?php
// lib/migraciones.php
//
// [OF-4a] MIGRACIONES AUTOMÁTICAS VERSIONADAS (19-nov-2026).
//
// EL PROBLEMA QUE RESUELVE
//   Cada fase dejaba un .sql que había que pegar a mano en phpMyAdmin. MySQL 5.7
//   (producción) no soporta ADD COLUMN IF NOT EXISTS, así que si una sentencia ya
//   había corrido marcaba error y había que saltarla a mano. Peor: hay backfills
//   que NO se pueden repetir. El caso típico es el paso 5b de la F3
//   (UPDATE periodos_evaluacion SET publicado = 1): si se repite, vuelve a
//   publicar periodos que el colegio ocultó a propósito.
//
// CÓMO FUNCIONA
//   migraciones_registro() es una lista ORDENADA de pasos con id estable. Cada
//   paso se verifica contra information_schema ANTES de ejecutarse: correr todo
//   dos veces no hace nada la segunda. Lo que se hizo (o ya existía) queda en la
//   tabla schema_migraciones, que se crea sola.
//
//   Tipos de paso:
//     tabla      CREATE TABLE si no existe en information_schema.TABLES.
//     columna    ADD COLUMN si no existe en information_schema.COLUMNS.
//     indice     ADD INDEX  si no existe en information_schema.STATISTICS.
//     modificar  una función PHP para lo que no cabe en lo anterior (verificar()
//                dice si ya está hecho; aplicar() lo hace).
//     datos      backfill. NUNCA corre "por si acaso": lleva `depende_de` (solo
//                corre si ESE paso quedó registrado como 'aplicada' por este
//                migrador, es decir, si la columna la acaba de crear él) o una
//                `condicion` idempotente explícita.
//
// REGLA DE ORO PARA BASES DONDE EL .sql YA CORRIÓ A MANO
//   Los pasos estructurales dan 'ya_existia' y los backfills que dependen de una
//   columna que ya existía dan 'ya_existia' SIN tocar datos.
//
// CÓMO SE EJECUTA (nunca solo, en una petición web normal: un ALTER sobre una
// tabla grande en horario de cobro bloquea la tabla)
//   · CLI:   php herramientas/migrar.php            (muestra pendientes)
//            php herramientas/migrar.php --aplicar
//   · Web:   acciones migraciones_estado / migraciones_aplicar (solo superadmin),
//            desde Diagnóstico > Base de datos, con confirmación.
//
// CÓMO AGREGAR UN PASO NUEVO: ver docs/mejoras-of/of4-migraciones.md.
//
// Los .sql de /migraciones se quedan como documentación.
//
// Compatible con MySQL 5.7 y 8.x. No declara nada fuera de funciones, así que se
// puede hacer require_once sin efectos.

const MIGRACIONES_TABLA = 'schema_migraciones';

/**
 * El registro ordenado de pasos. El ORDEN importa (un paso solo puede depender
 * de los anteriores). NUNCA cambies el id de un paso que ya salió a producción:
 * quedaría como pendiente y se volvería a intentar.
 *
 * Forma de un paso: ['id', 'desc', 'tipo', + campos del tipo]
 *   tabla     : tabla, sql
 *   columna   : tabla, columna, def, [despues]   (def = definición SQL de la columna)
 *   indice    : tabla, indice, columnas, [unico]
 *   modificar : tablas (para el inventario), verificar(PDO):bool, aplicar(PDO):void,
 *               [tolerante] (si falla solo avisa, no frena la corrida)
 *   datos     : depende_de | condicion(PDO):bool, aplicar(PDO):int, [tablas]
 *   Cualquiera: [requiere] (tablas que deben existir antes), [archivo] (.sql origen)
 */
function migraciones_registro(): array
{
    static $reg = null;
    if ($reg !== null) return $reg;
    $r = [];

    $tabla = function (string $id, string $desc, string $nombre, string $sql, string $archivo, array $requiere = []) use (&$r) {
        $r[] = ['id' => $id, 'desc' => $desc, 'tipo' => 'tabla', 'tabla' => $nombre, 'sql' => $sql, 'archivo' => $archivo, 'requiere' => $requiere];
    };
    $columna = function (string $id, string $desc, string $t, string $c, string $def, string $archivo, ?string $despues = null) use (&$r) {
        $r[] = ['id' => $id, 'desc' => $desc, 'tipo' => 'columna', 'tabla' => $t, 'columna' => $c, 'def' => $def, 'despues' => $despues, 'archivo' => $archivo];
    };
    $indice = function (string $id, string $desc, string $t, string $nombre, string $cols, string $archivo) use (&$r) {
        $r[] = ['id' => $id, 'desc' => $desc, 'tipo' => 'indice', 'tabla' => $t, 'indice' => $nombre, 'columnas' => $cols, 'archivo' => $archivo];
    };

    // ═══ F1 — ciclo de vida del alumno ═══════════════════════════════════
    $f = 'migracion_2026_11_18_f1_ciclo_vida.sql';
    $columna('2026_11_18_f1_01_clientes_estatus', 'clientes.estatus (activo, baja_temporal, baja_definitiva, egresado, traslado)',
        'clientes', 'estatus', "VARCHAR(20) NOT NULL DEFAULT 'activo'", $f);
    $columna('2026_11_18_f1_02_clientes_estatus_fecha', 'clientes.estatus_fecha',
        'clientes', 'estatus_fecha', 'DATE NULL', $f);
    $columna('2026_11_18_f1_03_clientes_estatus_motivo', 'clientes.estatus_motivo',
        'clientes', 'estatus_motivo', 'VARCHAR(255) NULL', $f);
    $indice('2026_11_18_f1_04_idx_clientes_escuela_estatus', 'Índice clientes (escuela_id, estatus)',
        'clientes', 'idx_clientes_escuela_estatus', 'escuela_id, estatus', $f);
    $tabla('2026_11_18_f1_05_alumno_movimientos', 'Tabla alumno_movimientos (bitácora del alumno)', 'alumno_movimientos', "
CREATE TABLE IF NOT EXISTS alumno_movimientos (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  escuela_id        INT UNSIGNED NOT NULL,
  cliente_id        INT UNSIGNED NOT NULL,
  tipo              VARCHAR(30)  NOT NULL,
  estatus_anterior  VARCHAR(20)  NULL,
  estatus_nuevo     VARCHAR(20)  NULL,
  motivo            VARCHAR(255) NULL,
  detalle           TEXT         NULL,
  usuario_id        INT UNSIGNED NULL,
  creado_en         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_am_cliente (cliente_id, creado_en),
  KEY idx_am_escuela (escuela_id, creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4", $f);
    $r[] = [
        'id' => '2026_11_18_f1_06_backfill_bajas', 'tipo' => 'datos', 'archivo' => $f,
        'desc' => 'Backfill: los alumnos/clientes inactivos quedan como baja_temporal (invariante activo = 1 <=> estatus = activo)',
        'depende_de' => '2026_11_18_f1_01_clientes_estatus', 'tablas' => ['clientes'],
        // El .sql lo hacía en dos UPDATE (tipo alumno / el resto): juntos son este.
        'aplicar' => function (PDO $pdo): int {
            return (int) $pdo->exec("UPDATE clientes
                   SET estatus = 'baja_temporal', estatus_motivo = 'Migración: estaba inactivo'
                 WHERE activo = 0 AND estatus = 'activo'");
        },
    ];

    // ═══ F2 — expediente del alumno ══════════════════════════════════════
    // (El backfill de tutores de esa migración es OPCIONAL y viene comentado en
    // el .sql: no se registra aquí a propósito; se sigue corriendo a mano si el
    // colegio lo quiere.)
    $f = 'migracion_2026_11_18_f2_expediente.sql';
    $cols = [
        ['2_01_sexo', 'sexo', "VARCHAR(1) NULL DEFAULT NULL"],
        ['2_02_nacionalidad', 'nacionalidad', "VARCHAR(60) NULL DEFAULT NULL"],
        ['2_03_lugar_nacimiento', 'lugar_nacimiento', "VARCHAR(120) NULL DEFAULT NULL"],
        ['2_04_escuela_procedencia', 'escuela_procedencia', "VARCHAR(150) NULL DEFAULT NULL"],
        ['2_05_padecimientos', 'padecimientos', "VARCHAR(500) NULL DEFAULT NULL"],
        ['2_06_medicamentos', 'medicamentos', "VARCHAR(500) NULL DEFAULT NULL"],
        ['2_07_seguro_medico', 'seguro_medico', "VARCHAR(150) NULL DEFAULT NULL"],
        ['2_08_observaciones', 'observaciones', "TEXT NULL"],
        ['2_09_aviso_privacidad_aceptado_en', 'aviso_privacidad_aceptado_en', "DATETIME NULL DEFAULT NULL"],
        ['2_10_aviso_privacidad_aceptado_por', 'aviso_privacidad_aceptado_por', "INT NULL DEFAULT NULL"],
    ];
    foreach ($cols as $c) {
        $columna('2026_11_18_f' . $c[0], 'clientes.' . $c[1] . ' (expediente)', 'clientes', $c[1], $c[2], $f);
    }
    $tabla('2026_11_18_f2_11_alumno_tutores', 'Tabla alumno_tutores (varios tutores por alumno)', 'alumno_tutores', "
CREATE TABLE IF NOT EXISTS alumno_tutores (
  id                      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  escuela_id              INT UNSIGNED NOT NULL,
  cliente_id              INT UNSIGNED NOT NULL,
  nombre                  VARCHAR(150) NOT NULL,
  parentesco              VARCHAR(20)  NULL DEFAULT NULL,
  email                   VARCHAR(150) NULL DEFAULT NULL,
  telefono                VARCHAR(25)  NULL DEFAULT NULL,
  telefono_alt            VARCHAR(25)  NULL DEFAULT NULL,
  es_contacto_emergencia  TINYINT(1)   NOT NULL DEFAULT 0,
  autorizado_recoger      TINYINT(1)   NOT NULL DEFAULT 0,
  responsable_pago        TINYINT(1)   NOT NULL DEFAULT 0,
  vive_con_alumno         TINYINT(1)   NOT NULL DEFAULT 0,
  usuario_id              INT UNSIGNED NULL DEFAULT NULL,
  notas                   VARCHAR(500) NULL DEFAULT NULL,
  activo                  TINYINT(1)   NOT NULL DEFAULT 1,
  creado_en               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en          DATETIME     NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_alumtut_escuela (escuela_id),
  KEY idx_alumtut_cliente (cliente_id, activo),
  KEY idx_alumtut_usuario (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4", $f);
    $tabla('2026_11_18_f2_12_alumno_documentos', 'Tabla alumno_documentos (documentos privados del alumno)', 'alumno_documentos', "
CREATE TABLE IF NOT EXISTS alumno_documentos (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  escuela_id       INT UNSIGNED NOT NULL,
  cliente_id       INT UNSIGNED NOT NULL,
  tipo             VARCHAR(40)  NOT NULL,
  ruta_archivo     VARCHAR(255) NOT NULL,
  nombre_original  VARCHAR(255) NULL DEFAULT NULL,
  mime_real        VARCHAR(100) NULL DEFAULT NULL,
  tamano_bytes     INT UNSIGNED NULL DEFAULT NULL,
  subido_por       INT UNSIGNED NULL DEFAULT NULL,
  subido_en        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_alumdoc_escuela (escuela_id),
  KEY idx_alumdoc_cliente (cliente_id, tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4", $f);

    // ═══ F3 — control escolar completo ═══════════════════════════════════
    // Requiere migracion_2026_11_13_control_escolar.sql (ciclos, grupos…).
    $f = 'migracion_2026_11_18_f3_control_escolar.sql';
    $prereq = ['ciclos_escolares', 'periodos_evaluacion', 'grupos', 'asistencias', 'calificaciones'];
    $tabla('2026_11_18_f3_01_niveles_grados', 'Tabla niveles_grados (catálogo de grados)', 'niveles_grados', "
CREATE TABLE IF NOT EXISTS niveles_grados (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  escuela_id      INT UNSIGNED NOT NULL,
  nivel           VARCHAR(30)  NOT NULL,
  grado           VARCHAR(20)  NOT NULL,
  nombre_corto    VARCHAR(40)  NOT NULL,
  orden           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  siguiente_id    INT UNSIGNED NULL,
  activo          TINYINT(1)   NOT NULL DEFAULT 1,
  fecha_creacion  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ng_escuela_nivel_grado (escuela_id, nivel, grado),
  KEY idx_ng_escuela_orden (escuela_id, orden)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4", $f);
    $tabla('2026_11_18_f3_02_historial_academico', 'Tabla historial_academico (cierre de ciclo por alumno)', 'historial_academico', "
CREATE TABLE IF NOT EXISTS historial_academico (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  escuela_id      INT UNSIGNED NOT NULL,
  cliente_id      INT UNSIGNED NOT NULL,
  ciclo_id        INT UNSIGNED NOT NULL,
  grado_id        INT UNSIGNED NULL,
  grado_nombre    VARCHAR(40)  NULL,
  grupo_id        INT UNSIGNED NULL,
  grupo_nombre    VARCHAR(60)  NULL,
  promedio_final  DECIMAL(5,2) NULL,
  resultado       VARCHAR(20)  NOT NULL DEFAULT 'sin_calificar',
  materias_reprobadas TINYINT UNSIGNED NOT NULL DEFAULT 0,
  materias        TEXT NULL,
  promovido_a_ciclo_id INT UNSIGNED NULL,
  promocion_accion VARCHAR(20) NULL,
  promovido_en    DATETIME NULL,
  usuario_id      INT UNSIGNED NULL,
  creado_en       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en  DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_historial_cliente_ciclo (cliente_id, ciclo_id),
  KEY idx_historial_escuela_ciclo (escuela_id, ciclo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4", $f);
    $columna('2026_11_18_f3_03_clientes_grado_id', 'clientes.grado_id (grado del catálogo)', 'clientes', 'grado_id', 'INT UNSIGNED NULL', $f);
    $indice('2026_11_18_f3_04_idx_clientes_grado', 'Índice clientes (escuela_id, grado_id)', 'clientes', 'idx_clientes_grado', 'escuela_id, grado_id', $f);
    $columna('2026_11_18_f3_05_grupos_grado_id', 'grupos.grado_id', 'grupos', 'grado_id', 'INT UNSIGNED NULL', $f);
    $indice('2026_11_18_f3_06_idx_grupos_grado', 'Índice grupos (grado_id)', 'grupos', 'idx_grupos_grado', 'grado_id', $f);
    $columna('2026_11_18_f3_07_periodos_publicado', 'periodos_evaluacion.publicado (las familias solo ven periodos publicados)',
        'periodos_evaluacion', 'publicado', 'TINYINT(1) NOT NULL DEFAULT 0', $f);
    $r[] = [
        'id' => '2026_11_18_f3_08_backfill_periodos_publicados', 'tipo' => 'datos', 'archivo' => $f,
        'desc' => 'Backfill (paso 5b): los periodos que YA existían quedan publicados. SOLO si el paso f3_07 acaba de crear la columna',
        'depende_de' => '2026_11_18_f3_07_periodos_publicado', 'tablas' => ['periodos_evaluacion'],
        'aplicar' => function (PDO $pdo): int {
            return (int) $pdo->exec('UPDATE periodos_evaluacion SET publicado = 1');
        },
    ];
    $columna('2026_11_18_f3_09_ciclos_cerrado', 'ciclos_escolares.cerrado', 'ciclos_escolares', 'cerrado', 'TINYINT(1) NOT NULL DEFAULT 0', $f);
    $columna('2026_11_18_f3_10_ciclos_cerrado_en', 'ciclos_escolares.cerrado_en', 'ciclos_escolares', 'cerrado_en', 'DATETIME NULL', $f);
    $indice('2026_11_18_f3_11_idx_asis_grupo_fecha', 'Índice asistencias (grupo_id, fecha)', 'asistencias', 'idx_asis_grupo_fecha', 'grupo_id, fecha', $f);
    $indice('2026_11_18_f3_12_idx_calif_periodo', 'Índice calificaciones (periodo_id)', 'calificaciones', 'idx_calif_periodo', 'periodo_id', $f);
    // Los pasos de F3 que tocan tablas del módulo escolar piden que esas tablas
    // existan (las crea migracion_2026_11_13_control_escolar.sql).
    foreach ($r as $i => $p) {
        if (strpos($p['id'], '2026_11_18_f3_') === 0 && in_array($p['tipo'], ['columna', 'indice'], true)
            && in_array($p['tabla'], $prereq, true)) {
            $r[$i]['aviso_requisito'] = 'migracion_2026_11_13_control_escolar.sql';
        }
    }

    // ═══ F4 — roles (cuenta de alumno) ═══════════════════════════════════
    $f = 'migracion_2026_11_18_f4_roles.sql';
    $columna('2026_11_18_f4_01_usuarios_cliente_id', 'usuarios.cliente_id (liga la cuenta rol alumno con su clientes.id)',
        'usuarios', 'cliente_id', 'INT NULL DEFAULT NULL', $f, 'familia_id');
    $indice('2026_11_18_f4_02_idx_usuarios_cliente_id', 'Índice usuarios (cliente_id)', 'usuarios', 'idx_usuarios_cliente_id', 'cliente_id', $f);

    // ═══ F5 — colegiatura por grado/grupo ════════════════════════════════
    $f = 'migracion_2026_11_18_f5_colegiatura_grado.sql';
    $columna('2026_11_18_f5_01_productos_alcance', "productos.alcance ('todos', 'grados' o 'grupos')", 'productos', 'alcance', "VARCHAR(10) NOT NULL DEFAULT 'todos'", $f);
    $columna('2026_11_18_f5_02_productos_alcance_ids', 'productos.alcance_ids (JSON de ids de grados o grupos)', 'productos', 'alcance_ids', 'TEXT NULL', $f);

    // ═══ F6 — monedero y tiendita ════════════════════════════════════════
    $f = 'migracion_2026_11_18_f6_monedero.sql';
    $tabla('2026_11_18_f6_01_monederos', 'Tabla monederos (saldo cacheado por alumno)', 'monederos', "
CREATE TABLE IF NOT EXISTS monederos (
  cliente_id          INT UNSIGNED  NOT NULL,
  escuela_id          INT UNSIGNED  NOT NULL,
  saldo               DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  limite_diario       DECIMAL(12,2) NULL DEFAULT NULL,
  nip_hash            VARCHAR(255)  NULL DEFAULT NULL,
  nip_intentos        TINYINT UNSIGNED NOT NULL DEFAULT 0,
  nip_bloqueado_hasta DATETIME      NULL DEFAULT NULL,
  bloqueado           TINYINT(1)    NOT NULL DEFAULT 0,
  creado_en           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (cliente_id),
  KEY idx_monederos_escuela (escuela_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4", $f);
    $tabla('2026_11_18_f6_02_monedero_movimientos', 'Tabla monedero_movimientos (libro mayor inmutable)', 'monedero_movimientos', "
CREATE TABLE IF NOT EXISTS monedero_movimientos (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  escuela_id      INT UNSIGNED  NOT NULL,
  cliente_id      INT UNSIGNED  NOT NULL,
  tipo            VARCHAR(10)   NOT NULL,
  signo           TINYINT       NOT NULL DEFAULT 1,
  monto           DECIMAL(12,2) NOT NULL,
  saldo_despues   DECIMAL(12,2) NOT NULL,
  cobro_id        INT UNSIGNED  NULL DEFAULT NULL,
  venta_id        INT UNSIGNED  NULL DEFAULT NULL,
  idem_key        VARCHAR(80)   NOT NULL,
  solicitud_key   VARCHAR(80)   NULL DEFAULT NULL,
  descripcion     VARCHAR(255)  NULL DEFAULT NULL,
  usuario_id      INT UNSIGNED  NULL DEFAULT NULL,
  creado_en       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mm_idem (idem_key),
  UNIQUE KEY uq_mm_solicitud (solicitud_key),
  KEY idx_mm_cliente (cliente_id, id),
  KEY idx_mm_escuela_fecha (escuela_id, creado_en),
  KEY idx_mm_cobro (cobro_id),
  KEY idx_mm_venta (venta_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4", $f);
    $tabla('2026_11_18_f6_03_tienda_productos', 'Tabla tienda_productos (catálogo de la tiendita)', 'tienda_productos', "
CREATE TABLE IF NOT EXISTS tienda_productos (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  escuela_id  INT UNSIGNED  NOT NULL,
  nombre      VARCHAR(80)   NOT NULL,
  precio      DECIMAL(10,2) NOT NULL,
  activo      TINYINT(1)    NOT NULL DEFAULT 1,
  creado_en   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tp_escuela (escuela_id, activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4", $f);
    $tabla('2026_11_18_f6_04_tienda_ventas', 'Tabla tienda_ventas (ventas de la tiendita)', 'tienda_ventas', "
CREATE TABLE IF NOT EXISTS tienda_ventas (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  escuela_id    INT UNSIGNED  NOT NULL,
  cliente_id    INT UNSIGNED  NOT NULL,
  total         DECIMAL(12,2) NOT NULL,
  usuario_id    INT UNSIGNED  NOT NULL,
  estado        VARCHAR(12)   NOT NULL DEFAULT 'completada',
  idem_key      VARCHAR(80)   NOT NULL,
  creado_en     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelada_en  DATETIME      NULL DEFAULT NULL,
  cancelada_por INT UNSIGNED  NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tv_idem (idem_key),
  KEY idx_tv_escuela_fecha (escuela_id, creado_en),
  KEY idx_tv_cliente_fecha (cliente_id, creado_en),
  KEY idx_tv_usuario_fecha (usuario_id, creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4", $f);
    $tabla('2026_11_18_f6_05_tienda_venta_items', 'Tabla tienda_venta_items (renglones de cada venta)', 'tienda_venta_items', "
CREATE TABLE IF NOT EXISTS tienda_venta_items (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  venta_id        INT UNSIGNED  NOT NULL,
  producto_id     INT UNSIGNED  NULL DEFAULT NULL,
  nombre          VARCHAR(80)   NOT NULL,
  cantidad        INT UNSIGNED  NOT NULL DEFAULT 1,
  precio_unitario DECIMAL(10,2) NOT NULL,
  subtotal        DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_tvi_venta (venta_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4", $f);
    $columna('2026_11_18_f6_06_cobros_es_recarga_monedero', 'cobros.es_recarga_monedero (marca las recargas del monedero)',
        'cobros', 'es_recarga_monedero', 'TINYINT(1) NOT NULL DEFAULT 0', $f);
    $indice('2026_11_18_f6_07_idx_cobros_recarga_monedero', 'Índice cobros (es_recarga_monedero, estado, cliente_id)',
        'cobros', 'idx_cobros_recarga_monedero', 'es_recarga_monedero, estado, cliente_id', $f);
    $columna('2026_11_18_f6_08_escuelas_monedero_activo', 'escuelas.monedero_activo (interruptor del monedero por colegio, apagado)',
        'escuelas', 'monedero_activo', 'TINYINT(1) NOT NULL DEFAULT 0', $f);

    // ═══ OF-2 — impuestos y cancelación de facturas ══════════════════════
    $f = 'migracion_2026_11_19_of2_impuestos.sql';
    $columna('2026_11_19_of2_01_productos_iva_tasa', "productos.iva_tasa ('exento', '0' o '16')", 'productos', 'iva_tasa', "VARCHAR(6) NOT NULL DEFAULT '16'", $f);
    $columna('2026_11_19_of2_02_productos_clave_sat', 'productos.clave_sat', 'productos', 'clave_sat', "VARCHAR(8) NOT NULL DEFAULT '86101800'", $f);
    $columna('2026_11_19_of2_03_productos_clave_unidad', 'productos.clave_unidad', 'productos', 'clave_unidad', "VARCHAR(5) NOT NULL DEFAULT 'E48'", $f);
    $columna('2026_11_19_of2_04_cobro_items_iva_tasa', 'cobro_items.iva_tasa (snapshot; NULL = renglón anterior a OF-2)', 'cobro_items', 'iva_tasa', 'VARCHAR(6) NULL DEFAULT NULL', $f);
    $columna('2026_11_19_of2_05_cobro_items_clave_sat', 'cobro_items.clave_sat (snapshot)', 'cobro_items', 'clave_sat', 'VARCHAR(8) NULL DEFAULT NULL', $f);
    $columna('2026_11_19_of2_06_cobro_items_clave_unidad', 'cobro_items.clave_unidad (snapshot)', 'cobro_items', 'clave_unidad', 'VARCHAR(5) NULL DEFAULT NULL', $f);
    $columna('2026_11_19_of2_07_cobros_factura_impuestos_json', 'cobros.factura_impuestos_json (desglose por tasa de la factura emitida)', 'cobros', 'factura_impuestos_json', 'TEXT NULL DEFAULT NULL', $f);
    $columna('2026_11_19_of2_08_cobros_factura_cancelacion_estado', 'cobros.factura_cancelacion_estado', 'cobros', 'factura_cancelacion_estado', 'VARCHAR(12) NULL DEFAULT NULL', $f);
    $tabla('2026_11_19_of2_09_facturas_canceladas', 'Tabla facturas_canceladas (historial de cancelaciones de CFDI)', 'facturas_canceladas', "
CREATE TABLE IF NOT EXISTS facturas_canceladas (
  id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  escuela_id       INT UNSIGNED  NOT NULL,
  cobro_id         INT UNSIGNED  NOT NULL,
  facturapi_id     VARCHAR(64)   NOT NULL,
  uuid             VARCHAR(64)   NULL DEFAULT NULL,
  serie_folio      VARCHAR(40)   NULL DEFAULT NULL,
  total            DECIMAL(12,2) NULL DEFAULT NULL,
  rfc_receptor     VARCHAR(20)   NULL DEFAULT NULL,
  motivo           CHAR(2)       NOT NULL,
  sustitucion_uuid VARCHAR(64)   NULL DEFAULT NULL,
  estado           VARCHAR(12)   NOT NULL DEFAULT 'canceled',
  respuesta_pac    TEXT          NULL DEFAULT NULL,
  usuario_id       INT UNSIGNED  NULL DEFAULT NULL,
  cancelada_en     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizada_en   DATETIME      NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_fcanc_escuela (escuela_id, cancelada_en),
  KEY idx_fcanc_cobro (cobro_id),
  KEY idx_fcanc_facturapi (facturapi_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4", $f);

    // ═══ OF-3 — cobranza (becas, cancelar con motivo, folio por abono, notas) ═══
    $f = 'migracion_2026_11_19_of3_cobranza.sql';
    $tabla('2026_11_19_of3_01_alumno_becas', 'Tabla alumno_becas (becas y descuentos por alumno)', 'alumno_becas', "
CREATE TABLE IF NOT EXISTS alumno_becas (
  id             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  escuela_id     INT UNSIGNED  NOT NULL,
  cliente_id     INT UNSIGNED  NOT NULL,
  nombre         VARCHAR(80)   NOT NULL,
  tipo           VARCHAR(10)   NOT NULL DEFAULT 'porcentaje',
  valor          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  alcance        VARCHAR(10)   NOT NULL DEFAULT 'categorias',
  alcance_ids    TEXT          NULL DEFAULT NULL,
  vigente_desde  DATE          NULL DEFAULT NULL,
  vigente_hasta  DATE          NULL DEFAULT NULL,
  activo         TINYINT(1)    NOT NULL DEFAULT 1,
  notas          VARCHAR(255)  NULL DEFAULT NULL,
  creado_por     INT UNSIGNED  NULL DEFAULT NULL,
  creado_en      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_becas_alumno (escuela_id, cliente_id, activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4", $f);
    $tabla('2026_11_19_of3_02_familia_notas', 'Tabla familia_notas (bitácora de cobranza por familia)', 'familia_notas', "
CREATE TABLE IF NOT EXISTS familia_notas (
  id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  escuela_id        INT UNSIGNED  NOT NULL,
  familia_id        INT UNSIGNED  NOT NULL,
  cliente_id        INT UNSIGNED  NULL DEFAULT NULL,
  tipo              VARCHAR(10)   NOT NULL DEFAULT 'otro',
  texto             VARCHAR(1000) NOT NULL,
  fecha_compromiso  DATE          NULL DEFAULT NULL,
  monto_compromiso  DECIMAL(12,2) NULL DEFAULT NULL,
  cumplido          TINYINT(1)    NULL DEFAULT NULL,
  usuario_id        INT UNSIGNED  NULL DEFAULT NULL,
  creado_en         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en    DATETIME      NULL DEFAULT NULL,
  eliminado         TINYINT(1)    NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_fnotas_familia (escuela_id, familia_id),
  KEY idx_fnotas_compromiso (escuela_id, fecha_compromiso)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4", $f);
    $columna('2026_11_19_of3_03_cobros_cancelado_motivo', 'cobros.cancelado_motivo', 'cobros', 'cancelado_motivo', 'VARCHAR(255) NULL DEFAULT NULL', $f);
    $columna('2026_11_19_of3_04_cobros_cancelado_por', 'cobros.cancelado_por', 'cobros', 'cancelado_por', 'INT NULL DEFAULT NULL', $f);
    $columna('2026_11_19_of3_05_cobros_cancelado_en', 'cobros.cancelado_en', 'cobros', 'cancelado_en', 'DATETIME NULL DEFAULT NULL', $f);
    $columna('2026_11_19_of3_06_cobros_cancelado_monto_recibido', 'cobros.cancelado_monto_recibido (lo que había que devolver por fuera)',
        'cobros', 'cancelado_monto_recibido', 'DECIMAL(12,2) NULL DEFAULT NULL', $f);
    $columna('2026_11_19_of3_07_cobro_abonos_folio', 'cobro_abonos.folio (folio propio por abono)', 'cobro_abonos', 'folio', 'VARCHAR(40) NULL DEFAULT NULL', $f);
    $indice('2026_11_19_of3_08_idx_abonos_folio', 'Índice cobro_abonos (folio)', 'cobro_abonos', 'idx_abonos_folio', 'folio', $f);
    $r[] = [
        'id' => '2026_11_19_of3_09_recurrentes_cobro_id_null', 'tipo' => 'modificar', 'archivo' => $f,
        'desc' => 'pagos_recurrentes_generados.cobro_id admite NULL (marca "ya revisado" cuando una beca del 100% no genera cobro)',
        'tablas' => ['pagos_recurrentes_generados'],
        // Como en el .sql: la definición original de la tabla no vive en el repo,
        // así que se lee el tipo de information_schema y se conserva tal cual.
        // Si la tabla no existe o la columna ya admite NULL, no hay nada que hacer.
        'verificar' => function (PDO $pdo): bool {
            return migraciones__tipo_columna_not_null($pdo, 'pagos_recurrentes_generados', 'cobro_id') === null;
        },
        'aplicar' => function (PDO $pdo): void {
            $tipo = migraciones__tipo_columna_not_null($pdo, 'pagos_recurrentes_generados', 'cobro_id');
            if ($tipo === null) return;
            $pdo->exec('ALTER TABLE pagos_recurrentes_generados MODIFY cobro_id ' . $tipo . ' NULL DEFAULT NULL');
        },
        // Si el ALTER falla (p. ej. cobro_id es parte de la llave primaria), el
        // cron sigue funcionando y solo avisa: no debe frenar el resto.
        'tolerante' => true,
    ];

    // ═══ OF-5 — importar adeudos y saldos iniciales (dos tablas nuevas; no toca cobros) ═══
    $f = 'migracion_2026_11_20_of5_importar.sql';
    $tabla('2026_11_20_of5_01_importaciones_saldos', 'Tabla importaciones_saldos (una fila por importación de adeudos)', 'importaciones_saldos', "
CREATE TABLE IF NOT EXISTS importaciones_saldos (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  escuela_id      INT UNSIGNED  NOT NULL,
  archivo_nombre  VARCHAR(255)  NULL DEFAULT NULL,
  archivo_hash    CHAR(40)      NULL DEFAULT NULL,
  usuario_id      INT UNSIGNED  NULL DEFAULT NULL,
  creado_en       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  filas_total     INT UNSIGNED  NOT NULL DEFAULT 0,
  cobros_creados  INT UNSIGNED  NOT NULL DEFAULT 0,
  filas_omitidas  INT UNSIGNED  NOT NULL DEFAULT 0,
  monto_total     DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  estado          VARCHAR(10)   NOT NULL DEFAULT 'aplicada',
  deshecha_por    INT UNSIGNED  NULL DEFAULT NULL,
  deshecha_en     DATETIME      NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_impsal_escuela (escuela_id, creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4", $f);
    $tabla('2026_11_20_of5_02_importaciones_saldos_filas', 'Tabla importaciones_saldos_filas (cobro creado por renglón + huella de idempotencia)', 'importaciones_saldos_filas', "
CREATE TABLE IF NOT EXISTS importaciones_saldos_filas (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  importacion_id  INT UNSIGNED  NOT NULL,
  escuela_id      INT UNSIGNED  NOT NULL,
  cobro_id        INT UNSIGNED  NOT NULL,
  cliente_id      INT UNSIGNED  NOT NULL,
  fila_archivo    INT UNSIGNED  NULL DEFAULT NULL,
  huella          CHAR(40)      NULL DEFAULT NULL,
  concepto        VARCHAR(190)  NULL DEFAULT NULL,
  monto_original  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  abonado         DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  pendiente       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  fecha_emision   DATE          NULL DEFAULT NULL,
  fecha_vence     DATE          NULL DEFAULT NULL,
  folio_externo   VARCHAR(60)   NULL DEFAULT NULL,
  producto_id     INT UNSIGNED  NULL DEFAULT NULL,
  nota            VARCHAR(255)  NULL DEFAULT NULL,
  deshecha        TINYINT(1)    NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_impsalf_huella (escuela_id, huella),
  KEY idx_impsalf_imp (importacion_id),
  KEY idx_impsalf_cobro (cobro_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4", $f);

    // ═══ OF-6 — inventario con existencias (dos columnas "maneja_existencias" y dos tablas) ═══
    // Sin backfill: nada se controla hasta que el admin lo marque. Sin estos pasos el
    // código funciona como siempre (inventario_listo() = false), sin inventario.
    $f = 'migracion_2026_11_20_of6_inventario.sql';
    $columna('2026_11_20_of6_01_productos_maneja_existencias', 'productos.maneja_existencias (el concepto lleva existencias)',
        'productos', 'maneja_existencias', 'TINYINT(1) NOT NULL DEFAULT 0', $f);
    $columna('2026_11_20_of6_02_tienda_productos_maneja_existencias', 'tienda_productos.maneja_existencias (el producto de la tiendita lleva existencias)',
        'tienda_productos', 'maneja_existencias', 'TINYINT(1) NOT NULL DEFAULT 0', $f);
    $tabla('2026_11_20_of6_03_inventario_existencias', 'Tabla inventario_existencias (existencia cacheada y mínimo por producto)', 'inventario_existencias', "
CREATE TABLE IF NOT EXISTS inventario_existencias (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  escuela_id      INT UNSIGNED  NOT NULL,
  tipo            VARCHAR(10)   NOT NULL,
  item_id         INT UNSIGNED  NOT NULL,
  existencia      INT           NOT NULL DEFAULT 0,
  minimo          INT           NOT NULL DEFAULT 0,
  ultimo_costo    DECIMAL(12,2) NULL DEFAULT NULL,
  actualizado_en  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_invex_item (tipo, item_id),
  KEY idx_invex_escuela (escuela_id, tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4", $f);
    $tabla('2026_11_20_of6_04_inventario_movimientos', 'Tabla inventario_movimientos (libro de movimientos: la verdad de la existencia)', 'inventario_movimientos', "
CREATE TABLE IF NOT EXISTS inventario_movimientos (
  id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  escuela_id          INT UNSIGNED  NOT NULL,
  tipo                VARCHAR(10)   NOT NULL,
  item_id             INT UNSIGNED  NOT NULL,
  movimiento          VARCHAR(12)   NOT NULL,
  cantidad            INT           NOT NULL,
  existencia_despues  INT           NOT NULL,
  costo_unitario      DECIMAL(12,2) NULL DEFAULT NULL,
  proveedor_id        INT UNSIGNED  NULL DEFAULT NULL,
  cobro_id            INT UNSIGNED  NULL DEFAULT NULL,
  venta_id            INT UNSIGNED  NULL DEFAULT NULL,
  gasto_id            INT UNSIGNED  NULL DEFAULT NULL,
  motivo              VARCHAR(255)  NULL DEFAULT NULL,
  usuario_id          INT UNSIGNED  NULL DEFAULT NULL,
  idem_key            VARCHAR(80)   NOT NULL,
  creado_en           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_invmov_idem (idem_key),
  KEY idx_invmov_item (tipo, item_id, id),
  KEY idx_invmov_escuela (escuela_id, creado_en),
  KEY idx_invmov_cobro (cobro_id),
  KEY idx_invmov_venta (venta_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4", $f);

    // ═══ OF-7c — "Ver como" (columna de rastro), bitácora de auditoría y agenda de citas ═══
    // Sin backfill. Sin estos pasos el sistema funciona como antes: "Ver como" anota al usuario
    // real dentro del detalle del log (registrar_log reintenta sin la columna), auditar() no
    // escribe nada (auditoria_lista() = false) y la agenda responde que aún no está instalada.
    // ALTER sobre logs_sistema: es una tabla de solo-agregar que puede ser grande; hazlo fuera de
    // horario de cobro (ver docs/mejoras-of/of7c.md). Puede esperar: el código tolera su ausencia.
    $f = 'migracion_2026_11_20_of7c.sql';
    $columna('2026_11_20_of7c_01_logs_suplantado_por', 'logs_sistema.suplantado_por (quién hizo la acción en realidad, viendo como otro usuario)',
        'logs_sistema', 'suplantado_por', 'INT UNSIGNED NULL DEFAULT NULL', $f);
    $tabla('2026_11_20_of7c_02_auditoria', 'Tabla auditoria (bitácora de cambios con antes y después)', 'auditoria', "
CREATE TABLE IF NOT EXISTS auditoria (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  escuela_id      INT UNSIGNED    NULL DEFAULT NULL,
  usuario_id      INT UNSIGNED    NULL DEFAULT NULL,
  suplantado_por  INT UNSIGNED    NULL DEFAULT NULL,
  accion          VARCHAR(40)     NOT NULL,
  entidad         VARCHAR(30)     NOT NULL,
  entidad_id      INT UNSIGNED    NULL DEFAULT NULL,
  antes           TEXT            NULL,
  despues         TEXT            NULL,
  ip              VARCHAR(45)     NULL DEFAULT NULL,
  creado_en       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_aud_escuela_fecha (escuela_id, creado_en),
  KEY idx_aud_entidad (entidad, entidad_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4", $f);
    $tabla('2026_11_20_of7c_03_citas', 'Tabla citas (agenda: admisión, entrevistas con padres, reuniones)', 'citas', "
CREATE TABLE IF NOT EXISTS citas (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  escuela_id      INT UNSIGNED    NOT NULL,
  titulo          VARCHAR(150)    NOT NULL,
  tipo            VARCHAR(12)     NOT NULL DEFAULT 'otro',
  inicio          DATETIME        NOT NULL,
  fin             DATETIME        NOT NULL,
  responsable_id  INT UNSIGNED    NOT NULL,
  familia_id      INT UNSIGNED    NULL DEFAULT NULL,
  cliente_id      INT UNSIGNED    NULL DEFAULT NULL,
  lugar           VARCHAR(150)    NULL DEFAULT NULL,
  notas           TEXT            NULL,
  estado          VARCHAR(12)     NOT NULL DEFAULT 'programada',
  creado_por      INT UNSIGNED    NULL DEFAULT NULL,
  creado_en       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_citas_escuela_inicio (escuela_id, inicio),
  KEY idx_citas_responsable (responsable_id, inicio),
  KEY idx_citas_familia (familia_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4", $f);

    $reg = $r;
    return $reg;
}

/** COLUMN_TYPE de la columna si es NOT NULL; null si no existe la tabla/columna o ya admite NULL. */
function migraciones__tipo_columna_not_null(PDO $pdo, string $tabla, string $columna): ?string
{
    $st = $pdo->prepare("SELECT COLUMN_TYPE AS tipo FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? AND IS_NULLABLE = 'NO'");
    $st->execute([$tabla, $columna]);
    $t = $st->fetchColumn();
    return ($t === false || $t === null || $t === '') ? null : (string) $t;
}

// ════════════════════════════════════════════════════════════════════════
// Inventario de information_schema (una consulta por tipo, solo las tablas
// que nos interesan).
// ════════════════════════════════════════════════════════════════════════

/**
 * @param string[] $tablas nombres de tabla
 * @return array{tablas: array<string,bool>, columnas: array<string,bool>, indices: array<string,bool>}
 */
function migraciones_inventario(PDO $pdo, array $tablas): array
{
    $tablas = array_values(array_unique(array_map('strtolower', $tablas)));
    $inv = ['tablas' => [], 'columnas' => [], 'indices' => []];
    if (!$tablas) return $inv;
    $in = implode(',', array_fill(0, count($tablas), '?'));

    $st = $pdo->prepare("SELECT TABLE_NAME AS t FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ($in)");
    $st->execute($tablas);
    foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $t) $inv['tablas'][strtolower($t)] = true;

    $st = $pdo->prepare("SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ($in)");
    $st->execute($tablas);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $f) $inv['columnas'][strtolower($f['t']) . '.' . strtolower($f['c'])] = true;

    $st = $pdo->prepare("SELECT DISTINCT TABLE_NAME AS t, INDEX_NAME AS i FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ($in)");
    $st->execute($tablas);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $f) $inv['indices'][strtolower($f['t']) . '.' . strtolower($f['i'])] = true;

    return $inv;
}

/** Tablas que un paso necesita mirar en el inventario. */
function migraciones__tablas_de(array $p): array
{
    $t = $p['tablas'] ?? [];
    if (isset($p['tabla'])) $t[] = $p['tabla'];
    foreach ($p['requiere'] ?? [] as $q) $t[] = $q;
    return $t;
}

/** Tablas de TODO el registro (para el inventario de estado()). */
function migraciones__todas_las_tablas(): array
{
    $t = [];
    foreach (migraciones_registro() as $p) foreach (migraciones__tablas_de($p) as $x) $t[] = $x;
    return $t;
}

/**
 * ¿El paso estructural ya está hecho? true / false; null si no es estructural
 * (datos) o no se puede saber.
 */
function migraciones__esta_hecho(PDO $pdo, array $p, array $inv): ?bool
{
    switch ($p['tipo']) {
        case 'tabla':
            return isset($inv['tablas'][strtolower($p['tabla'])]);
        case 'columna':
            return isset($inv['columnas'][strtolower($p['tabla']) . '.' . strtolower($p['columna'])]);
        case 'indice':
            return isset($inv['indices'][strtolower($p['tabla']) . '.' . strtolower($p['indice'])]);
        case 'modificar':
            return (bool) $p['verificar']($pdo);
    }
    return null;
}

/** Qué le falta a un paso para poder ejecutarse (tablas que no existen), o null. */
function migraciones__bloqueo(array $p, array $inv): ?string
{
    $falta = [];
    if (in_array($p['tipo'], ['columna', 'indice'], true) && !isset($inv['tablas'][strtolower($p['tabla'])])) {
        $falta[] = $p['tabla'];
    }
    foreach ($p['requiere'] ?? [] as $q) {
        if (!isset($inv['tablas'][strtolower($q)])) $falta[] = $q;
    }
    if (!$falta) return null;
    $msg = 'Falta la tabla ' . implode(', ', array_unique($falta));
    if (!empty($p['aviso_requisito'])) $msg .= ' (corre antes ' . $p['aviso_requisito'] . ')';
    return $msg;
}

// ════════════════════════════════════════════════════════════════════════
// schema_migraciones
// ════════════════════════════════════════════════════════════════════════

function migraciones_crear_tabla_control(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS " . MIGRACIONES_TABLA . " (
        id           VARCHAR(120) NOT NULL,
        aplicada_en  DATETIME     NOT NULL,
        duracion_ms  INT          NOT NULL DEFAULT 0,
        resultado    VARCHAR(20)  NOT NULL,
        detalle      VARCHAR(255) NULL,
        PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

/** Lo ya registrado, por id. Sin tabla de control: vacío (esta función NO la crea). */
function migraciones_registradas(PDO $pdo): array
{
    try {
        $st = $pdo->query('SELECT id, aplicada_en, duracion_ms, resultado, detalle FROM ' . MIGRACIONES_TABLA);
    } catch (Throwable $e) {
        return [];
    }
    $o = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $f) $o[$f['id']] = $f;
    return $o;
}

function migraciones__registrar(PDO $pdo, string $id, string $resultado, int $ms, ?string $detalle): void
{
    $pdo->prepare('INSERT INTO ' . MIGRACIONES_TABLA . ' (id, aplicada_en, duracion_ms, resultado, detalle)
                   VALUES (?, NOW(), ?, ?, ?)
                   ON DUPLICATE KEY UPDATE aplicada_en = VALUES(aplicada_en), duracion_ms = VALUES(duracion_ms),
                                           resultado = VALUES(resultado), detalle = VALUES(detalle)')
        ->execute([$id, $ms, $resultado, $detalle === null ? null : mb_substr($detalle, 0, 255)]);
}

// ════════════════════════════════════════════════════════════════════════
// Estado (solo lectura)
// ════════════════════════════════════════════════════════════════════════

/**
 * Estado de cada paso, SIN modificar nada (ni siquiera crea schema_migraciones).
 *
 * estado de cada paso:
 *   aplicada      ya la aplicó este migrador.
 *   ya_existia    la estructura ya estaba (p. ej. el .sql se corrió a mano).
 *   pendiente     hará cambios al aplicar.
 *   por_registrar solo se anotará en schema_migraciones, SIN tocar datos
 *                 (backfill de una columna que ya existía).
 *   bloqueada     no se puede aplicar (falta una tabla previa); `detalle` dice cuál.
 *
 * @return array{pasos: array<int,array>, pendientes: int, por_registrar: int, bloqueadas: int, total: int}
 */
function migraciones_estado(PDO $pdo): array
{
    $reg = migraciones_registro();
    $inv = migraciones_inventario($pdo, migraciones__todas_las_tablas());
    $hechas = migraciones_registradas($pdo);

    $pasos = [];
    $cuenta = ['pendiente' => 0, 'por_registrar' => 0, 'bloqueada' => 0];
    // Para decidir un backfill hace falta saber si su dependencia "se aplicaría
    // ahora" (columna ausente) o ya existe: se resuelve sobre la marcha.
    $dep_pendiente = [];

    foreach ($reg as $p) {
        $fila = ['id' => $p['id'], 'descripcion' => $p['desc'], 'tipo' => $p['tipo'],
                 'archivo' => $p['archivo'] ?? null, 'estado' => null,
                 'aplicada_en' => null, 'duracion_ms' => null, 'detalle' => null];
        $h = $hechas[$p['id']] ?? null;

        if ($p['tipo'] === 'datos') {
            if ($h) {
                $fila['estado'] = $h['resultado'];
            } elseif (!empty($p['depende_de'])) {
                $d = $hechas[$p['depende_de']] ?? null;
                $dep_aplicada = ($d && $d['resultado'] === 'aplicada') || !empty($dep_pendiente[$p['depende_de']]);
                $fila['estado'] = $dep_aplicada ? 'pendiente' : 'por_registrar';
            } else {
                $fila['estado'] = 'pendiente';
            }
        } else {
            $hecho = migraciones__esta_hecho($pdo, $p, $inv);
            if ($hecho) {
                // Una estructura ya presente y sin registro es un 'ya_existia'
                // que solo falta anotar; no es trabajo pendiente.
                $fila['estado'] = $h ? $h['resultado'] : 'por_registrar';
            } else {
                $b = migraciones__bloqueo($p, $inv);
                if ($b !== null) { $fila['estado'] = 'bloqueada'; $fila['detalle'] = $b; }
                else { $fila['estado'] = 'pendiente'; $dep_pendiente[$p['id']] = true; }
            }
        }
        if ($h) {
            $fila['aplicada_en'] = $h['aplicada_en'];
            $fila['duracion_ms'] = (int) $h['duracion_ms'];
            if ($fila['detalle'] === null) $fila['detalle'] = $h['detalle'];
        }
        if (isset($cuenta[$fila['estado']])) $cuenta[$fila['estado']]++;
        $pasos[] = $fila;
    }

    return [
        'pasos'         => $pasos,
        'pendientes'    => $cuenta['pendiente'] + $cuenta['bloqueada'],
        'por_registrar' => $cuenta['por_registrar'],
        'bloqueadas'    => $cuenta['bloqueada'],
        'total'         => count($pasos),
    ];
}

// ════════════════════════════════════════════════════════════════════════
// Aplicar
// ════════════════════════════════════════════════════════════════════════

/** Código de error de MySQL de una excepción de PDO (1060 columna duplicada, etc.). */
function migraciones__codigo_mysql(Throwable $e): int
{
    if ($e instanceof PDOException && isset($e->errorInfo[1])) return (int) $e->errorInfo[1];
    return 0;
}

function migraciones__ejecutar_estructura(PDO $pdo, array $p): string
{
    switch ($p['tipo']) {
        case 'tabla':
            $pdo->exec($p['sql']);
            return 'CREATE TABLE ' . $p['tabla'];
        case 'columna':
            $despues = '';
            if (!empty($p['despues'])) {
                $inv = migraciones_inventario($pdo, [$p['tabla']]);
                if (isset($inv['columnas'][strtolower($p['tabla']) . '.' . strtolower($p['despues'])])) {
                    $despues = ' AFTER `' . $p['despues'] . '`';
                }
            }
            $pdo->exec('ALTER TABLE `' . $p['tabla'] . '` ADD COLUMN `' . $p['columna'] . '` ' . $p['def'] . $despues);
            return 'ALTER TABLE ' . $p['tabla'] . ' ADD COLUMN ' . $p['columna'];
        case 'indice':
            $pdo->exec('ALTER TABLE `' . $p['tabla'] . '` ADD ' . (!empty($p['unico']) ? 'UNIQUE ' : '')
                . 'INDEX `' . $p['indice'] . '` (' . $p['columnas'] . ')');
            return 'ALTER TABLE ' . $p['tabla'] . ' ADD INDEX ' . $p['indice'];
        case 'modificar':
            $p['aplicar']($pdo);
            return 'Modificación aplicada';
    }
    throw new LogicException('Tipo de paso desconocido: ' . $p['tipo']);
}

/**
 * Aplica lo que falte. NUNCA correr desde una petición web normal: ver la
 * cabecera. Se detiene en el primer error (los pasos posteriores pueden depender
 * del que falló); los pasos 'tolerante' solo avisan.
 *
 * @param callable|null $progreso fn(array $resultado_de_un_paso): void
 * @return array{ok: bool, pasos: array, aplicadas: int, ya_existian: int, avisos: int, error: ?array, duracion_ms: int}
 */
function migraciones_aplicar(PDO $pdo, ?callable $progreso = null): array
{
    $t0 = microtime(true);
    $out = ['ok' => true, 'pasos' => [], 'aplicadas' => 0, 'ya_existian' => 0, 'avisos' => 0, 'error' => null, 'duracion_ms' => 0];

    // Un solo migrador a la vez (CLI y web comparten este candado).
    $lock = $pdo->query("SELECT GET_LOCK('edupago_migraciones', 0)")->fetchColumn();
    if ((int) $lock !== 1) {
        $out['ok'] = false;
        $out['error'] = ['id' => null, 'mensaje' => 'Ya hay otra migración corriendo. Espera a que termine.'];
        return $out;
    }

    try {
        // Un ALTER espera el bloqueo de metadatos detrás de cualquier consulta
        // larga y, mientras espera, TODAS las demás consultas de esa tabla se
        // forman detrás de él. Con un tope bajo, si no puede entrar rápido se
        // rinde (no se registra nada) y se reintenta después.
        try { $pdo->exec('SET SESSION lock_wait_timeout = 20'); } catch (Throwable $e) { /* opcional */ }

        migraciones_crear_tabla_control($pdo);
        $hechas = migraciones_registradas($pdo);

        $nota = function (array $paso) use (&$out, $progreso) {
            $out['pasos'][] = $paso;
            if ($progreso) $progreso($paso);
        };

        foreach (migraciones_registro() as $p) {
            $id = $p['id'];
            $ini = microtime(true);
            $ms = function () use ($ini) { return (int) round((microtime(true) - $ini) * 1000); };
            $reg = $hechas[$id] ?? null;

            try {
                if ($p['tipo'] === 'datos') {
                    if ($reg) continue;                      // un backfill registrado NO se repite jamás
                    $correr = false;
                    if (!empty($p['depende_de'])) {
                        $d = $hechas[$p['depende_de']] ?? null;
                        $correr = $d && $d['resultado'] === 'aplicada';
                        $motivo = 'La estructura (' . $p['depende_de'] . ') ya existía antes de este migrador: no se repite el backfill.';
                    } else {
                        $correr = (bool) $p['condicion']($pdo);
                        $motivo = 'Nada que corregir.';
                    }
                    if (!$correr) {
                        migraciones__registrar($pdo, $id, 'ya_existia', $ms(), $motivo);
                        $hechas[$id] = ['resultado' => 'ya_existia'];
                        $out['ya_existian']++;
                        $nota(['id' => $id, 'resultado' => 'ya_existia', 'detalle' => $motivo, 'duracion_ms' => $ms()]);
                        continue;
                    }
                    // El backfill y su registro van en UNA transacción: o quedan
                    // los dos o ninguno (así nunca se repite ni se pierde).
                    $pdo->beginTransaction();
                    try {
                        $filas = (int) $p['aplicar']($pdo);
                        $det = $filas . ' fila(s) actualizada(s)';
                        migraciones__registrar($pdo, $id, 'aplicada', $ms(), $det);
                        $pdo->commit();
                    } catch (Throwable $e) {
                        if ($pdo->inTransaction()) $pdo->rollBack();
                        throw $e;
                    }
                    $hechas[$id] = ['resultado' => 'aplicada'];
                    $out['aplicadas']++;
                    $nota(['id' => $id, 'resultado' => 'aplicada', 'detalle' => $det, 'duracion_ms' => $ms()]);
                    continue;
                }

                // Estructurales: information_schema manda (si alguien borró la
                // columna a mano, se vuelve a crear aunque esté registrada).
                $inv = migraciones_inventario($pdo, migraciones__tablas_de($p));
                if (migraciones__esta_hecho($pdo, $p, $inv)) {
                    if (!$reg) {
                        $det = 'Ya existía (aplicado a mano o por otra vía).';
                        migraciones__registrar($pdo, $id, 'ya_existia', $ms(), $det);
                        $hechas[$id] = ['resultado' => 'ya_existia'];
                        $out['ya_existian']++;
                        $nota(['id' => $id, 'resultado' => 'ya_existia', 'detalle' => $det, 'duracion_ms' => $ms()]);
                    }
                    continue;
                }
                $b = migraciones__bloqueo($p, $inv);
                if ($b !== null) throw new RuntimeException($b);

                try {
                    $det = migraciones__ejecutar_estructura($pdo, $p);
                    $res = 'aplicada';
                } catch (Throwable $e) {
                    // Carrera: otro proceso lo creó entre la verificación y el ALTER.
                    // 1060 columna duplicada, 1061 índice duplicado, 1050 tabla existe.
                    if (in_array(migraciones__codigo_mysql($e), [1060, 1061, 1050], true)) {
                        $det = 'Ya existía (lo creó otro proceso).';
                        $res = 'ya_existia';
                    } else {
                        throw $e;
                    }
                }
                migraciones__registrar($pdo, $id, $res, $ms(), $det);
                $hechas[$id] = ['resultado' => $res];
                $out[$res === 'aplicada' ? 'aplicadas' : 'ya_existian']++;
                $nota(['id' => $id, 'resultado' => $res, 'detalle' => $det, 'duracion_ms' => $ms()]);
            } catch (Throwable $e) {
                $msg = $e->getMessage();
                if (!empty($p['tolerante'])) {
                    $out['avisos']++;
                    $nota(['id' => $id, 'resultado' => 'aviso', 'detalle' => 'No se aplicó (no frena el resto): ' . $msg, 'duracion_ms' => $ms()]);
                    continue;
                }
                $out['ok'] = false;
                $out['error'] = ['id' => $id, 'mensaje' => $msg];
                $nota(['id' => $id, 'resultado' => 'error', 'detalle' => $msg, 'duracion_ms' => $ms()]);
                break;
            }
        }
    } finally {
        try { $pdo->query("SELECT RELEASE_LOCK('edupago_migraciones')")->fetchColumn(); } catch (Throwable $e) { /* se libera al cerrar la conexión */ }
    }

    $out['duracion_ms'] = (int) round((microtime(true) - $t0) * 1000);
    return $out;
}
