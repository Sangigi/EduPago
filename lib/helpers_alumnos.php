<?php
/**
 * lib/helpers_alumnos.php — [F1] Ciclo de vida del alumno (18-nov-2026)
 *
 * POR QUÉ EXISTE
 *   Hasta hoy "dar de baja" a un alumno era solo `clientes.activo = 0`
 *   (acciones/toggle_cliente_activo.php): sin motivo, sin fecha, sin saber
 *   quién lo hizo, y el navegador además liberaba la CLABE SPEI del alumno en
 *   automático. Con eso no se podía distinguir una baja temporal de un
 *   egresado o de un traslado, ni reconstruir la historia de un alumno.
 *
 * QUÉ HAY AQUÍ
 *   alumno_cambiar_estatus()      → ÚNICO lugar que cambia el estatus de un
 *                                   alumno (baja, egreso, traslado, reactivación).
 *   alumno_registrar_movimiento() → bitácora `alumno_movimientos`. Nunca lanza.
 *   alumno_validar_limite_plan()  → límite de alumnos activos del plan; antes
 *                                   vivía copiado dentro de crear_cliente.php.
 *
 * INVARIANTE (otras fases dependen de ella)
 *   clientes.activo = 1  si y solo si  clientes.estatus = 'activo'.
 *   El resto del sistema (cargar_datos, cron, límite del plan, portal de
 *   familia) sigue leyendo `activo`; `estatus` agrega el detalle. Por eso las
 *   dos columnas se escriben SIEMPRE juntas, y solo desde
 *   alumno_cambiar_estatus(). Si alguna vez discrepan, manda `activo` (ver
 *   alumno_estatus_de_fila()).
 *
 * NUNCA se crea un renglón nuevo de `clientes` para reinscribir o reactivar a
 * un alumno que ya existe: su id viaja a los proveedores de pago (CLABE
 * individual, referencias de pago). Reactivar es cambiarle el estatus a ESTE
 * mismo renglón.
 *
 * Este archivo lo incluye api.php. No llama a respond(): devuelve arreglos
 * con 'success'/'error' para que lo puedan reutilizar otras acciones (p. ej.
 * cierre de ciclo / egreso masivo) sin que una sola fila corte la petición.
 */

// Estatus válidos y su etiqueta para mensajes al usuario. El espejo en el
// navegador es ALUMNO_ESTATUS_INFO (views/Alumnos.js).
const ALUMNO_ESTATUS = [
    'activo'          => 'Activo',
    'baja_temporal'   => 'Baja temporal',
    'baja_definitiva' => 'Baja definitiva',
    'egresado'        => 'Egresado',
    'traslado'        => 'Traslado',
];

// Transiciones permitidas (estatus actual => estatus a los que puede pasar).
//   · Cualquier baja/egreso/traslado puede volver a 'activo': es el MISMO
//     alumno que regresa (reingreso, readmisión, egresado de primaria que se
//     queda a secundaria), y debe conservar su id.
//   · Entre estados inactivos solo se permiten las correcciones razonables:
//     una baja temporal que se vuelve definitiva o resulta ser traslado, y una
//     definitiva que en realidad fue traslado (o al revés).
//   · 'egresado' solo se alcanza desde 'activo': egresa quien terminó el
//     ciclo estando inscrito.
const ALUMNO_TRANSICIONES = [
    'activo'          => ['baja_temporal', 'baja_definitiva', 'egresado', 'traslado'],
    'baja_temporal'   => ['activo', 'baja_definitiva', 'traslado'],
    'baja_definitiva' => ['activo', 'traslado'],
    'traslado'        => ['activo', 'baja_definitiva'],
    'egresado'        => ['activo'],
];

// Tipos de movimiento de la bitácora. Los últimos tres los registran otras
// fases (promoción de grado, reinscripción, cambio de grupo).
const ALUMNO_TIPOS_MOVIMIENTO = [
    'alta', 'edicion', 'baja_temporal', 'baja_definitiva', 'egreso', 'traslado',
    'reactivacion', 'cambio_grado', 'reinscripcion', 'cambio_grupo',
];

// Qué tipo de movimiento genera llegar a cada estatus.
const ALUMNO_MOVIMIENTO_POR_ESTATUS = [
    'activo'          => 'reactivacion',
    'baja_temporal'   => 'baja_temporal',
    'baja_definitiva' => 'baja_definitiva',
    'egresado'        => 'egreso',
    'traslado'        => 'traslado',
];

// Roles que, además de cambiar el estatus, pueden tocar DINERO al dar de baja
// (cancelar adeudos o liberar la CLABE). 'control_escolar' cambia estatus pero
// no hace cobranza: un coordinador académico no debe poder borrar adeudos.
const ALUMNO_ROLES_DINERO_BAJA = ['superadmin', 'admin'];

// Error "de negocio" (validación) dentro de alumno_cambiar_estatus(): se
// convierte en ['success' => false, 'error' => ...] sin registrarse como fallo
// interno.
if (!class_exists('AlumnoEstatusError')) {
    class AlumnoEstatusError extends \RuntimeException {}
}

/**
 * Escribe en el log de la API sin depender de que log_api() esté cargada
 * (este archivo también puede usarse desde scripts que no incluyen api.php).
 * Nunca lanza.
 */
function alumno_log(string $msg): void
{
    try {
        if (function_exists('log_api')) {
            log_api($msg);
            return;
        }
        $archivo = defined('API_LOG_FILE') ? API_LOG_FILE : (__DIR__ . '/../api_log.txt');
        @file_put_contents($archivo, date('Y-m-d H:i:s') . ' | ' . $msg . PHP_EOL, FILE_APPEND);
    } catch (\Throwable $e) {
        // Ni el log debe tumbar la petición.
    }
}

/**
 * ¿Existe la tabla/columna? Se prueba con un SELECT ... LIMIT 0 (no lee filas)
 * y se recuerda el resultado durante la petición. Sirve para que el código
 * llegue a producción antes o después de su migración sin dar un 500.
 * $sql_prueba es SIEMPRE un literal de este archivo, nunca input del usuario.
 */
function alumno_esquema_existe(PDO $pdo, string $clave, string $sql_prueba): bool
{
    static $cache = [];
    if (array_key_exists($clave, $cache)) return $cache[$clave];
    try {
        $pdo->query($sql_prueba);
        $cache[$clave] = true;
    } catch (\PDOException $e) {
        $cache[$clave] = false;
    }
    return $cache[$clave];
}

/** ¿Ya corrió migracion_2026_11_18_f1_ciclo_vida.sql (columnas de estatus)? */
function alumno_hay_columnas_estatus(PDO $pdo): bool
{
    return alumno_esquema_existe($pdo, 'clientes.estatus',
        "SELECT estatus, estatus_fecha, estatus_motivo FROM clientes LIMIT 0");
}

/** ¿Existe la tabla? (solo nombres literales de este archivo). */
function alumno_hay_tabla(PDO $pdo, string $tabla): bool
{
    if (!preg_match('/^[a-z_]+$/', $tabla)) return false;
    return alumno_esquema_existe($pdo, 'tabla.' . $tabla, "SELECT 1 FROM `$tabla` LIMIT 0");
}

/**
 * Estatus efectivo de una fila de `clientes`. Si `activo` y `estatus`
 * discrepan (dato viejo, o la migración aún no corre), manda `activo`, que es
 * lo que lee todo el resto del sistema.
 */
function alumno_estatus_de_fila(array $fila): string
{
    if (!empty($fila['activo'])) return 'activo';
    $est = $fila['estatus'] ?? null;
    if (is_string($est) && $est !== 'activo' && isset(ALUMNO_ESTATUS[$est])) return $est;
    return 'baja_temporal';
}

/**
 * Registra un movimiento en la bitácora del alumno. NUNCA lanza: si la tabla
 * no existe (falta la migración) o el INSERT falla, solo deja nota en el log.
 * Una bitácora que no se pudo escribir no debe deshacer el cambio real.
 *
 * $detalle: arreglo (se guarda como JSON) o texto. No metas aquí datos
 * sensibles (CURP, teléfonos, datos fiscales): en una edición se guardan los
 * NOMBRES de los campos que cambiaron, no sus valores.
 */
function alumno_registrar_movimiento(PDO $pdo, int $escuela_id, int $cliente_id, string $tipo, ?string $motivo = null, $detalle = null, ?int $usuario_id = null, ?string $estatus_anterior = null, ?string $estatus_nuevo = null): void
{
    try {
        $tipo = strtolower(trim($tipo));
        if (!preg_match('/^[a-z_]{1,30}$/', $tipo)) {
            alumno_log("alumno_registrar_movimiento: tipo inválido '" . substr($tipo, 0, 40) . "' (cliente #{$cliente_id}), no se registra.");
            return;
        }
        if (!in_array($tipo, ALUMNO_TIPOS_MOVIMIENTO, true)) {
            // Se registra igual (no perder el dato), pero se avisa para que
            // alguien lo agregue a la lista y al frontend.
            alumno_log("alumno_registrar_movimiento: tipo no catalogado '{$tipo}' (cliente #{$cliente_id}).");
        }
        $motivo = $motivo !== null ? trim($motivo) : null;
        if ($motivo === '') $motivo = null;
        if ($motivo !== null) $motivo = mb_substr($motivo, 0, 255);

        $detalle_txt = null;
        if (is_array($detalle) || is_object($detalle)) {
            $detalle_txt = json_encode($detalle, JSON_UNESCAPED_UNICODE);
            if ($detalle_txt === false) $detalle_txt = null;
        } elseif ($detalle !== null && $detalle !== '') {
            $detalle_txt = (string) $detalle;
        }

        $pdo->prepare(
            "INSERT INTO alumno_movimientos
                (escuela_id, cliente_id, tipo, estatus_anterior, estatus_nuevo, motivo, detalle, usuario_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )->execute([
            $escuela_id, $cliente_id, $tipo, $estatus_anterior, $estatus_nuevo,
            $motivo, $detalle_txt, $usuario_id ?: null,
        ]);
    } catch (\Throwable $e) {
        alumno_log("alumno_registrar_movimiento falló (¿falta migracion_2026_11_18_f1_ciclo_vida.sql?) cliente #{$cliente_id} tipo {$tipo}: " . $e->getMessage());
    }
}

/**
 * Límite de alumnos activos del plan contratado. Devuelve el mensaje de error
 * listo para mostrar si ya se llegó al tope, o null si todavía cabe uno más.
 *
 * Es la MISMA regla que tenía crear_cliente.php (se extrajo de ahí para que
 * reactivar a un alumno no sea una puerta trasera para pasarse del plan:
 * antes toggle_cliente_activo no validaba nada). Cuenta `activo = 1` de toda
 * la escuela, igual que antes.
 *
 * $para: lo que se le impide hacer, para el mensaje ("dar de alta a más
 * alumnos", "reactivar alumnos").
 */
function alumno_validar_limite_plan(PDO $pdo, int $escuela_id, string $para = 'dar de alta a más alumnos'): ?string
{
    // lib/planes.php lo carga api.php. Sin él no hay tabla de límites que
    // aplicar (p. ej. un script suelto): no se bloquea.
    if (!function_exists('limitesDelPlan')) return null;
    $plan_esc = $pdo->prepare("SELECT plan FROM escuelas WHERE id = ?");
    $plan_esc->execute([$escuela_id]);
    $fila_plan = $plan_esc->fetch();
    $plan_nombre = ($fila_plan && !empty($fila_plan['plan'])) ? $fila_plan['plan'] : PLAN_FALLBACK;
    $limite = limitesDelPlan($plan_nombre)['max_alumnos'];
    if ($limite === null) return null;
    $cnt = $pdo->prepare("SELECT COUNT(*) AS n FROM clientes WHERE escuela_id = ? AND activo = 1");
    $cnt->execute([$escuela_id]);
    $actuales = intval($cnt->fetch()['n'] ?? 0);
    if ($actuales >= $limite) {
        return "Llegaste al límite de $limite alumnos activos de tu plan ($plan_nombre). Actualiza tu plan para $para.";
    }
    return null;
}

/**
 * Cobros pendientes de un alumno, con lo ya abonado y los conceptos, para que
 * quien da de baja decida caso por caso qué hacer con cada adeudo.
 */
function alumno_cobros_pendientes(PDO $pdo, int $cliente_id): array
{
    // [F6] Las recargas de monedero pendientes no son adeudo: no se ofrecen
    // para "cobrar o cancelar" al dar de baja al alumno.
    $f6_sin_recargas = (function_exists('cobros_col_recarga_monedero') && cobros_col_recarga_monedero($pdo)) ? ' AND es_recarga_monedero = 0' : '';
    $st = $pdo->prepare(
        "SELECT id, folio, total, monto_pagado, fecha, referencia
           FROM cobros
          WHERE cliente_id = ? AND estado = 'pendiente'{$f6_sin_recargas}
          ORDER BY fecha, id"
    );
    $st->execute([$cliente_id]);
    $cobros = array_map(function ($c) {
        return [
            'id'           => intval($c['id']),
            'folio'        => $c['folio'],
            'total'        => floatval($c['total']),
            'monto_pagado' => floatval($c['monto_pagado']),
            'fecha'        => $c['fecha'],
            'referencia'   => $c['referencia'],
            'conceptos'    => [],
        ];
    }, $st->fetchAll());
    if (empty($cobros)) return [];
    // Conceptos en UNA consulta. Si cobro_items no existiera, se omiten.
    try {
        $ids = array_column($cobros, 'id');
        $in = implode(',', array_fill(0, count($ids), '?'));
        $it = $pdo->prepare("SELECT cobro_id, nombre FROM cobro_items WHERE cobro_id IN ($in) ORDER BY id");
        $it->execute($ids);
        $por_cobro = [];
        foreach ($it->fetchAll() as $fila) {
            $por_cobro[intval($fila['cobro_id'])][] = $fila['nombre'];
        }
        foreach ($cobros as &$c) {
            $c['conceptos'] = $por_cobro[$c['id']] ?? [];
        }
        unset($c);
    } catch (\PDOException $e) {
        // Sin conceptos: la lista sigue siendo útil con folio y monto.
    }
    return $cobros;
}

/**
 * Fila de `clientes` lista para el navegador (mismo formato que cargar_datos
 * y editar_cliente). Quita el token de la tarjeta domiciliada: no hace falta
 * en ninguna pantalla.
 */
function alumno_fila_para_respuesta(PDO $pdo, int $cliente_id): ?array
{
    $st = $pdo->prepare("SELECT * FROM clientes WHERE id = ?");
    $st->execute([$cliente_id]);
    $c = $st->fetch(PDO::FETCH_ASSOC);
    if (!$c) return null;
    $c['id']              = intval($c['id']);
    $c['activo']          = (bool) $c['activo'];
    $c['saldo_pendiente'] = floatval($c['saldo_pendiente']);
    $c['familia_id']      = $c['familia_id'] ? intval($c['familia_id']) : null;
    $c['tel']             = $c['telefono'] ?? null;
    if (!isset($c['estatus'])) $c['estatus'] = $c['activo'] ? 'activo' : 'baja_temporal';
    unset($c['token_tarjeta']);
    // [F4] Coordinación y dirección no ven dinero: sin CLABE, saldo ni tokens.
    // El rol sale del usuario en curso (api.php); fuera de una petición no aplica.
    if (function_exists('rol_sin_finanzas') && rol_sin_finanzas($GLOBALS['usuario_actual']['rol'] ?? '')) {
        $c = quitar_campos_financieros($c);
    }
    return $c;
}

/**
 * Cambia el estatus de un alumno. Es el ÚNICO camino para dar de baja,
 * egresar, trasladar o reactivar (toggle_cliente_activo.php también pasa por
 * aquí).
 *
 * $usuario_actual: el de api.php (user_id, rol, escuela_id). La acción que
 * llama ya validó rol y pertenencia; aquí se vuelve a comprobar la escuela
 * como defensa en profundidad.
 *
 * $opciones:
 *   'fecha'           => 'Y-m-d'  fecha efectiva (default hoy; no puede ser futura).
 *   'sacar_de_grupos' => bool     default true para cualquier estatus distinto de
 *                                 'activo': cierra sus inscripciones de
 *                                 grupo_alumnos (activo=0, fecha_baja=hoy). Su
 *                                 historial académico se conserva. Al reactivar
 *                                 NO se le reinscribe solo.
 *   'cobros_cancelar' => int[]    ids de cobros PENDIENTES de este alumno a
 *                                 cancelar. Solo sin abonos (monto_pagado = 0):
 *                                 si alguno ya tiene abonos se rechaza TODO con
 *                                 mensaje. Por defecto no se cancela nada: la
 *                                 decisión es del admin, caso por caso.
 *   'clabe'           => 'conservar' (default) | 'liberar'. Conservarla deja que
 *                                 la familia siga pagando adeudos por SPEI.
 *
 * Devuelve ['success' => true, 'cliente' => fila, 'estatus_anterior', 'estatus_nuevo',
 *           'movimiento' => tipo, 'cobros_cancelados' => [ids], 'grupos_cerrados' => n,
 *           'clabe_liberada' => bool, 'cobros_pendientes' => [...]]
 * o ['success' => false, 'error' => mensaje].
 *
 * Usa su propia transacción; si quien llama ya abrió una, trabaja dentro de
 * ella (no la confirma ni la deshace: los errores de validación ocurren antes
 * de escribir nada, y un fallo de BD se relanza para que el que llama decida).
 */
function alumno_cambiar_estatus(PDO $pdo, int $cliente_id, string $estatus_nuevo, ?string $motivo, array $usuario_actual, array $opciones = []): array
{
    $error = function ($msg) { return ['success' => false, 'error' => $msg]; };

    // ── 1. Validar la petición (antes de tocar la BD) ──
    $estatus_nuevo = strtolower(trim($estatus_nuevo));
    if (!isset(ALUMNO_ESTATUS[$estatus_nuevo])) {
        return $error('Estatus no válido. Usa: ' . implode(', ', array_values(ALUMNO_ESTATUS)) . '.');
    }
    $etiqueta_nuevo = ALUMNO_ESTATUS[$estatus_nuevo];
    $reactivar = $estatus_nuevo === 'activo';

    $motivo = $motivo !== null ? trim($motivo) : '';
    if (!$reactivar && $motivo === '') {
        return $error('Escribe el motivo (' . mb_strtolower($etiqueta_nuevo) . '): queda en el historial del alumno.');
    }
    if (mb_strlen($motivo) > 255) {
        return $error('El motivo es demasiado largo (máximo 255 caracteres).');
    }
    $motivo = $motivo === '' ? null : $motivo;

    $hoy = date('Y-m-d');
    $fecha = trim(strval($opciones['fecha'] ?? ''));
    if ($fecha === '') {
        $fecha = $hoy;
    } else {
        $partes = explode('-', $fecha);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha) || !checkdate(intval($partes[1]), intval($partes[2]), intval($partes[0]))) {
            return $error('La fecha no es válida (usa el formato AAAA-MM-DD).');
        }
        // Una fecha futura dejaría al alumno fuera del sistema (activo = 0)
        // ANTES de que la baja sea real: se registra cuando ocurre.
        if ($fecha > $hoy) {
            return $error('La fecha no puede ser posterior a hoy. Registra el cambio el día que ocurra.');
        }
        if ($fecha < '2000-01-01') {
            return $error('La fecha es demasiado antigua.');
        }
    }

    $sacar_de_grupos = array_key_exists('sacar_de_grupos', $opciones)
        ? (bool) $opciones['sacar_de_grupos']
        : !$reactivar;
    if ($reactivar) $sacar_de_grupos = false;

    $cobros_cancelar = $opciones['cobros_cancelar'] ?? [];
    if ($cobros_cancelar === null || $cobros_cancelar === '') $cobros_cancelar = [];
    if (!is_array($cobros_cancelar)) {
        return $error('La lista de cobros a cancelar no es válida.');
    }
    $ids_cancelar = [];
    foreach ($cobros_cancelar as $cid) {
        $n = intval($cid);
        if ($n <= 0) return $error('La lista de cobros a cancelar trae un id no válido.');
        $ids_cancelar[$n] = $n;
    }
    $ids_cancelar = array_values($ids_cancelar);
    if (count($ids_cancelar) > 200) {
        return $error('Demasiados cobros a cancelar en una sola operación (máximo 200).');
    }

    $clabe = strtolower(trim(strval($opciones['clabe'] ?? 'conservar')));
    if (!in_array($clabe, ['conservar', 'liberar'], true)) {
        return $error("Opción de CLABE no válida: usa 'conservar' o 'liberar'.");
    }

    if ($reactivar && (!empty($ids_cancelar) || $clabe === 'liberar')) {
        return $error('Cancelar adeudos o liberar la CLABE solo aplica al dar de baja, no al reactivar.');
    }
    $rol = $usuario_actual['rol'] ?? '';
    if ((!empty($ids_cancelar) || $clabe === 'liberar') && !in_array($rol, ALUMNO_ROLES_DINERO_BAJA, true)) {
        return $error('Solo la administración del colegio puede cancelar adeudos o liberar la CLABE. El cambio de estatus sí puedes hacerlo dejando los adeudos y la CLABE como están.');
    }

    // Las pruebas de esquema van ANTES de abrir la transacción: un SELECT a
    // una tabla inexistente a media transacción no la rompe en MySQL, pero
    // así no hay ni que pensarlo.
    $hay_estatus = alumno_hay_columnas_estatus($pdo);
    $hay_grupos  = $sacar_de_grupos && alumno_hay_tabla($pdo, 'grupo_alumnos');
    $hay_pool    = $clabe === 'liberar' && alumno_hay_tabla($pdo, 'clabe_pool');
    $usuario_id = intval($usuario_actual['user_id'] ?? 0) ?: null;

    // ── 2. Escribir, todo o nada ──
    $propia = !$pdo->inTransaction();
    if ($propia) $pdo->beginTransaction();
    try {
        // FOR UPDATE: dos clics seguidos (o dos personas) no deben poder
        // reactivar dos veces pasando juntos el límite del plan, ni registrar
        // dos movimientos para el mismo cambio.
        $st = $pdo->prepare("SELECT * FROM clientes WHERE id = ? FOR UPDATE");
        $st->execute([$cliente_id]);
        $fila = $st->fetch(PDO::FETCH_ASSOC);
        if (!$fila) throw new AlumnoEstatusError('No encontramos a ese alumno.');
        $escuela_id = intval($fila['escuela_id']);

        if ($rol !== 'superadmin' && $escuela_id !== intval($usuario_actual['escuela_id'] ?? -1)) {
            throw new AlumnoEstatusError('No tienes permiso sobre este alumno.');
        }

        $anterior = alumno_estatus_de_fila($fila);
        if ($anterior === $estatus_nuevo) {
            throw new AlumnoEstatusError('El alumno ya está en estatus "' . ALUMNO_ESTATUS[$anterior] . '".');
        }
        if (!in_array($estatus_nuevo, ALUMNO_TRANSICIONES[$anterior] ?? [], true)) {
            $posibles = array_map(function ($e) { return ALUMNO_ESTATUS[$e]; }, ALUMNO_TRANSICIONES[$anterior] ?? []);
            throw new AlumnoEstatusError('No se puede pasar de "' . ALUMNO_ESTATUS[$anterior] . '" a "' . $etiqueta_nuevo . '".'
                . ($posibles ? ' Desde "' . ALUMNO_ESTATUS[$anterior] . '" puedes pasar a: ' . implode(', ', $posibles) . '.' : ''));
        }

        if ($reactivar) {
            $err_plan = alumno_validar_limite_plan($pdo, $escuela_id, 'reactivar alumnos');
            if ($err_plan !== null) throw new AlumnoEstatusError($err_plan);
        }

        // Validar TODOS los cobros antes de escribir nada: si uno no se puede
        // cancelar, no se cancela ninguno y no cambia el estatus.
        if (!empty($ids_cancelar)) {
            $in = implode(',', array_fill(0, count($ids_cancelar), '?'));
            $stc = $pdo->prepare("SELECT id, folio, cliente_id, estado, total, monto_pagado FROM cobros WHERE id IN ($in) FOR UPDATE");
            $stc->execute($ids_cancelar);
            $encontrados = [];
            foreach ($stc->fetchAll() as $c) $encontrados[intval($c['id'])] = $c;
            $con_abonos = [];
            foreach ($ids_cancelar as $cid) {
                $c = $encontrados[$cid] ?? null;
                if (!$c || intval($c['cliente_id']) !== $cliente_id) {
                    throw new AlumnoEstatusError("El cobro #{$cid} no pertenece a este alumno.");
                }
                $etq = $c['folio'] ? "folio {$c['folio']}" : "#{$cid}";
                if ($c['estado'] !== 'pendiente') {
                    throw new AlumnoEstatusError("El cobro {$etq} ya no está pendiente (está {$c['estado']}); recarga la lista.");
                }
                // Un cobro con abonos ya tiene dinero real aplicado: cancelarlo
                // dejaría ese pago colgado de un cobro cancelado. Eso se
                // resuelve aparte (en Cobros), no en una baja.
                if (round(floatval($c['monto_pagado']), 2) > 0) {
                    $con_abonos[] = $etq . ' ($' . number_format(floatval($c['monto_pagado']), 2) . ' abonado)';
                }
            }
            if (!empty($con_abonos)) {
                throw new AlumnoEstatusError('No se puede cancelar un cobro que ya tiene abonos: ' . implode(', ', $con_abonos)
                    . '. Quítalo de la lista (se conservará como adeudo) y resuélvelo desde Cobros.');
            }
        }

        // ── Estatus + activo, SIEMPRE juntos ──
        $activo_nuevo = $reactivar ? 1 : 0;
        if ($hay_estatus) {
            $pdo->prepare("UPDATE clientes SET estatus = ?, estatus_fecha = ?, estatus_motivo = ?, activo = ? WHERE id = ?")
                ->execute([$estatus_nuevo, $fecha, $motivo, $activo_nuevo, $cliente_id]);
        } else {
            // Código desplegado antes que la migración: al menos el cambio
            // real (activo) ocurre; motivo y fecha se pierden.
            alumno_log("alumno_cambiar_estatus: faltan columnas de estatus (¿migracion_2026_11_18_f1_ciclo_vida.sql?). Cliente #{$cliente_id} solo se actualiza activo={$activo_nuevo}.");
            $pdo->prepare("UPDATE clientes SET activo = ? WHERE id = ?")->execute([$activo_nuevo, $cliente_id]);
        }

        // [F4] La cuenta de alumno (portal y monedero) sigue al estatus: al dar
        // de baja, egresar o trasladar se desactiva y se cierran sus sesiones
        // abiertas (sesion_valida_desde); al reactivar vuelve a quedar activa.
        // Sin esto, un alumno dado de baja seguía entrando a su portal.
        // Sin la migración de F4 (usuarios.cliente_id) no hay cuentas de
        // alumno que ajustar: el error de columna se ignora (en MySQL un
        // error de sentencia no aborta la transacción en curso).
        try {
            if ($reactivar) {
                $pdo->prepare("UPDATE usuarios SET activo = 1 WHERE cliente_id = ? AND rol = 'alumno'")->execute([$cliente_id]);
            } else {
                $pdo->prepare("UPDATE usuarios SET activo = 0, sesion_valida_desde = NOW() WHERE cliente_id = ? AND rol = 'alumno'")->execute([$cliente_id]);
            }
        } catch (\PDOException $e) {
            // usuarios.cliente_id aún no existe: nada que ajustar.
        }

        // ── Cobros a cancelar (solo los elegidos, solo sin abonos) ──
        $cancelados = [];
        foreach ($ids_cancelar as $cid) {
            // Se repiten las condiciones en el UPDATE (compare-and-swap), igual
            // que el recargo del cron: un abono que entre justo ahora gana.
            $up = $pdo->prepare("UPDATE cobros SET estado = 'cancelado' WHERE id = ? AND cliente_id = ? AND estado = 'pendiente' AND monto_pagado = 0");
            $up->execute([$cid, $cliente_id]);
            if ($up->rowCount() !== 1) {
                throw new \RuntimeException("El cobro #{$cid} cambió mientras se cancelaba.");
            }
            $cancelados[] = $cid;
        }
        if (!empty($cancelados) && function_exists('recalcular_saldo_pendiente')) {
            recalcular_saldo_pendiente($pdo, $cliente_id);
        }

        // ── Grupos escolares ──
        $grupos_cerrados = 0;
        if ($hay_grupos) {
            $ug = $pdo->prepare("UPDATE grupo_alumnos SET activo = 0, fecha_baja = CURDATE() WHERE cliente_id = ? AND escuela_id = ? AND activo = 1");
            $ug->execute([$cliente_id, $escuela_id]);
            $grupos_cerrados = $ug->rowCount();
        }

        // ── CLABE individual ──
        // Por defecto se CONSERVA: la familia puede seguir liquidando adeudos
        // por SPEI y el pago se identifica solo. Liberarla (lo que antes hacía
        // el navegador en automático en cada baja) hace que un SPEI posterior a
        // esa CLABE ya no se pueda ligar al alumno.
        $clabe_liberada = false;
        if ($clabe === 'liberar' && !empty($fila['clabe_individual'])) {
            if ($hay_pool) {
                $pdo->prepare("UPDATE clabe_pool SET estado = 'liberada', cliente_id = NULL, fecha_asign = NULL WHERE cliente_id = ? AND estado = 'asignada'")
                    ->execute([$cliente_id]);
            }
            $pdo->prepare("UPDATE clientes SET clabe_individual = NULL, clabe_individual_estado = 'liberada' WHERE id = ?")
                ->execute([$cliente_id]);
            $clabe_liberada = true;
        }

        // ── Bitácora ──
        $tipo_mov = ALUMNO_MOVIMIENTO_POR_ESTATUS[$estatus_nuevo];
        $detalle = ['fecha' => $fecha];
        if (!empty($cancelados)) $detalle['cobros_cancelados'] = $cancelados;
        if ($grupos_cerrados > 0) $detalle['grupos_cerrados'] = $grupos_cerrados;
        if (!$reactivar) $detalle['clabe'] = $clabe_liberada ? 'liberada' : 'conservada';
        alumno_registrar_movimiento($pdo, $escuela_id, $cliente_id, $tipo_mov, $motivo, $detalle,
            $usuario_id, $anterior, $estatus_nuevo);

        if ($propia) $pdo->commit();
    } catch (AlumnoEstatusError $e) {
        // Validación: no se escribió nada todavía.
        if ($propia && $pdo->inTransaction()) $pdo->rollBack();
        return $error($e->getMessage());
    } catch (\Throwable $e) {
        if ($propia) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            alumno_log("alumno_cambiar_estatus falló cliente #{$cliente_id} -> {$estatus_nuevo}: " . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            return $error('No se pudo cambiar el estatus del alumno. No se modificó nada; intenta de nuevo.');
        }
        throw $e;
    }

    if (function_exists('registrar_log')) {
        registrar_log($pdo, $usuario_actual, 'alumno_estatus',
            "Alumno #{$cliente_id}: " . ALUMNO_ESTATUS[$anterior] . " -> {$etiqueta_nuevo}"
            . ($motivo ? " ({$motivo})" : '')
            . (!empty($cancelados) ? '; cobros cancelados: ' . implode(',', $cancelados) : '')
            . ($clabe_liberada ? '; CLABE liberada' : ''),
            $escuela_id);
    }

    return [
        'success'           => true,
        'cliente'           => alumno_fila_para_respuesta($pdo, $cliente_id),
        'estatus_anterior'  => $anterior,
        'estatus_nuevo'     => $estatus_nuevo,
        'movimiento'        => $tipo_mov,
        'cobros_cancelados' => $cancelados,
        'grupos_cerrados'   => $grupos_cerrados,
        'clabe_liberada'    => $clabe_liberada,
        'cobros_pendientes' => alumno_cobros_pendientes($pdo, $cliente_id),
    ];
}
