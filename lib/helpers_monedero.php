<?php
/**
 * lib/helpers_monedero.php — Monedero virtual del alumno (F6, 18-nov-2026)
 *
 * Saldo prepagado por alumno para gastar en la tiendita/cafetería del colegio.
 * Lo incluyen api.php y cron_recordatorios.php (bloques [F6]).
 *
 * ── MODELO DE DINERO ─────────────────────────────────────────────────────
 * Mismo patrón que cobro_abonos/cobros.monto_pagado y que
 * clientes.saldo_pendiente: un LIBRO MAYOR inmutable (monedero_movimientos)
 * que es la fuente de verdad, más un saldo CACHEADO (monederos.saldo) que se
 * recalcula desde ese libro en cada escritura — nunca se suma sobre el valor
 * anterior, para que la columna no pueda desviarse de la verdad.
 *
 * INVARIANTES (no las rompas al tocar esto):
 *   1. monederos.saldo == SUM(signo * monto) del alumno en el libro.
 *   2. El saldo NUNCA queda negativo (monedero_mover lanza antes).
 *   3. Toda escritura va en una transacción con el renglón de `monederos`
 *      bloqueado (SELECT ... FOR UPDATE). Ese candado es el que serializa dos
 *      ventas simultáneas del mismo alumno: sin él, las dos leerían el mismo
 *      saldo y podrían gastarlo dos veces.
 *   4. Cada movimiento lleva idem_key ÚNICA y determinística, así que un
 *      reintento (doble clic, cron que corre dos veces, dos barridos a la vez)
 *      choca contra el UNIQUE y no mueve dinero dos veces.
 *
 * ── DE DÓNDE ENTRA EL DINERO ─────────────────────────────────────────────
 * Siempre a través de un COBRO marcado es_recarga_monedero = 1:
 *   · En caja (monedero_recarga_caja): el cobro nace YA pagado y se acredita
 *     en la misma transacción.
 *   · En línea (monedero_recargar): el cobro nace pendiente; la familia lo
 *     paga con liga de tarjeta o referencia de efectivo (NUNCA SPEI: la CLABE
 *     es del alumno y el depósito se repartiría entre sus adeudos). Los
 *     webhooks de siempre lo marcan 'pagado' sin saber nada del monedero, y
 *     monedero_acreditar_recargas() lo acredita después por BARRIDO. Así no se
 *     tocó ningún webhook: el barrido corre en el cron y cada vez que alguien
 *     consulta el saldo.
 */

// Rango de una recarga (contrato de la fase).
const MONEDERO_RECARGA_MIN = 20;
const MONEDERO_RECARGA_MAX = 5000;
// generar_liga.php y generar_referencia_efectivo.php rechazan importes menores
// a $50 (mínimo de Cobroscontarjeta.com). Pedir una recarga EN LÍNEA de $20
// crearía un cobro que nadie puede pagar, así que en línea el piso real es $50.
// En caja no hay procesador de por medio y aplica MONEDERO_RECARGA_MIN.
const MONEDERO_RECARGA_MIN_EN_LINEA = 50;
// Recargas en línea sin pagar se cancelan solas pasado este plazo (cron).
const MONEDERO_RECARGA_VIGENCIA_DIAS = 3;
// Máximo de recargas pendientes por alumno, para que nadie llene el sistema
// de cobros basura dándole clic a "Recargar" sin pagar.
const MONEDERO_RECARGAS_PENDIENTES_MAX = 3;
// Tope de una sola venta en la tiendita.
const MONEDERO_VENTA_MAX = 5000;
// Freno contra adivinar el NIP: al 5º error seguido, 15 minutos sin NIP.
const MONEDERO_NIP_INTENTOS_MAX = 5;
const MONEDERO_NIP_BLOQUEO_MIN = 15;

const MONEDERO_TIPOS = ['recarga', 'consumo', 'ajuste', 'reverso'];

if (!class_exists('MonederoError')) {
    /** Error de negocio del monedero (saldo insuficiente, monto inválido...). */
    class MonederoError extends \RuntimeException {}
}

/** Pesos -> centavos enteros (sumar decimales en float arrastra errores). */
function monedero_c($valor): int
{
    return intval(round(floatval($valor) * 100));
}

/** Centavos -> pesos con 2 decimales. */
function monedero_p(int $centavos): float
{
    return round($centavos / 100, 2);
}

/** ¿Ya corrió migracion_2026_11_18_f6_monedero.sql? (cacheado por proceso) */
function monedero_tablas_ok(PDO $pdo): bool
{
    static $ok = null;
    if ($ok !== null) return $ok;
    try {
        $pdo->query("SELECT 1 FROM monedero_movimientos LIMIT 1");
        $ok = function_exists('cobros_col_recarga_monedero') ? cobros_col_recarga_monedero($pdo) : true;
    } catch (\Throwable $e) {
        $ok = false;
    }
    return $ok;
}

function monedero_log(string $msg): void
{
    if (function_exists('log_api')) {
        log_api('MONEDERO ' . $msg);
        return;
    }
    @file_put_contents(defined('API_LOG_FILE') ? API_LOG_FILE : (__DIR__ . '/../api_log.txt'),
        date('Y-m-d H:i:s') . ' | MONEDERO ' . $msg . PHP_EOL, FILE_APPEND);
}

/**
 * ¿El colegio activó el monedero? (escuelas.monedero_activo, apagado por
 * defecto). Si la columna todavía no existe (falta la sentencia 8 de la
 * migración) se trata como apagado: es el lado seguro, nadie puede recargar
 * ni vender.
 */
function monedero_activo(PDO $pdo, int $escuela_id): bool
{
    try {
        $st = $pdo->prepare("SELECT monedero_activo FROM escuelas WHERE id = ?");
        $st->execute([$escuela_id]);
        return (bool) intval($st->fetchColumn());
    } catch (\Throwable $e) {
        return false;
    }
}

/**
 * Responde al navegador con el error de una operación del monedero.
 * MonederoError trae un mensaje pensado para el usuario ("Saldo insuficiente...")
 * y se muestra tal cual; cualquier otra excepción (PDOException, etc.) se
 * registra y se responde algo genérico, para no filtrar nombres de tablas.
 * Quien llama ya debe haber hecho rollBack().
 */
function monedero_fallo(\Throwable $e, string $contexto): void
{
    if ($e instanceof MonederoError) {
        respond(['success' => false, 'error' => $e->getMessage()]);
    }
    monedero_log("{$contexto}: " . get_class($e) . ' ' . $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine());
    respond(['success' => false, 'error' => 'No se pudo completar la operación del monedero. Intenta de nuevo; si el problema sigue, avisa al colegio.']);
}

/** ¿El alumno tiene saldo o algún movimiento? (para no esconder dinero con el módulo apagado) */
function monedero_tiene_historial(PDO $pdo, int $cliente_id): bool
{
    $st = $pdo->prepare("SELECT 1 FROM monedero_movimientos WHERE cliente_id = ? LIMIT 1");
    $st->execute([$cliente_id]);
    if ($st->fetchColumn()) return true;
    $st = $pdo->prepare("SELECT saldo FROM monederos WHERE cliente_id = ?");
    $st->execute([$cliente_id]);
    $s = $st->fetchColumn();
    return $s !== false && monedero_c($s) !== 0;
}

/**
 * Estado del monedero para mostrar (saldo, límite, NIP, bloqueo, consumo de hoy
 * y lo que le queda por gastar hoy). No escribe nada. Un alumno sin renglón en
 * `monederos` se muestra en ceros.
 */
function monedero_estado(PDO $pdo, int $cliente_id): array
{
    $st = $pdo->prepare("SELECT * FROM monederos WHERE cliente_id = ?");
    $st->execute([$cliente_id]);
    $m = $st->fetch() ?: null;
    $pub = monedero_publico($m);
    $saldo_c = monedero_c($pub['saldo']);
    $consumido_c = monedero_consumido_hoy_c($pdo, $cliente_id);
    $disp_c = $saldo_c;
    if ($pub['limite_diario'] !== null) {
        $disp_c = min($saldo_c, max(0, monedero_c($pub['limite_diario']) - $consumido_c));
    }
    $pub['consumido_hoy'] = monedero_p($consumido_c);
    $pub['disponible_hoy'] = monedero_p($disp_c);
    return $pub;
}

// ═════════════════════════════ ACCESO (solo api.php) ═════════════════════

/**
 * Valida rol + escuela + migración + sección, igual que escolar_ctx().
 * Devuelve ['rol','escuela_id','user_id','familia_id'].
 *
 * $escritura: si es true y la sección 'monedero' está apagada para el
 * colegio, se corta. requerir_seccion_habilitada() es no-op para cualquier
 * rol que no sea admin/cajero, así que se evalúa COMO SI fuera admin (mismo
 * truco que escolar_ctx): si el colegio apagó el monedero, también se le
 * corta a la tiendita y a la familia. Las LECTURAS (saldo, movimientos,
 * reporte) y la cancelación de ventas (que DEVUELVE dinero al alumno) no se
 * cortan: apagar el módulo no debe esconderle a nadie su dinero.
 */
function monedero_ctx(PDO $pdo, array $usuario_actual, array $input, array $roles, bool $escritura = false): array
{
    $rol = $usuario_actual['rol'] ?? '';
    requerir_rol($rol, $roles, 'No tienes permiso para esta acción del monedero.');

    if ($rol === 'superadmin') {
        $escuela_id = intval($input['escuela_id'] ?? $_GET['escuela_id'] ?? 0);
        if (!$escuela_id) respond(['success' => false, 'error' => 'Selecciona un colegio primero.']);
    } else {
        // NUNCA del input: la escuela sale de la sesión.
        $escuela_id = intval($usuario_actual['escuela_id'] ?? 0);
        if (!$escuela_id) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'Tu cuenta no está ligada a ningún colegio.']);
        }
    }

    if (!monedero_tablas_ok($pdo)) {
        monedero_log("tablas no encontradas (¿falta migracion_2026_11_18_f6_monedero.sql?)");
        respond(['success' => false, 'error' => 'El monedero aún no está instalado en la base de datos (falta correr migracion_2026_11_18_f6_monedero.sql).']);
    }

    if ($escritura) {
        // Interruptor propio del monedero (escuelas.monedero_activo, apagado por
        // defecto). Sustituye a "secciones_deshabilitadas" como puerta de las
        // escrituras: esa lista es opt-out, así que el monedero habría quedado
        // encendido en todos los colegios de golpe. Aplica también al
        // superadmin (que solo se salta esto para activar, que no pasa por aquí).
        if (!monedero_activo($pdo, $escuela_id)) {
            respond(['success' => false, 'error' => 'El monedero no está activado para este colegio.']);
        }
        // Además, la sección 'monedero' que el superadmin puede apagar desde el
        // panel de plataforma (api.php) sigue siendo un interruptor maestro.
        if ($rol !== 'superadmin' && function_exists('requerir_seccion_habilitada')) {
            requerir_seccion_habilitada($pdo, 'admin', $escuela_id, ['monedero'],
                'El monedero no está habilitado para este colegio.');
        }
    }

    return [
        'rol'        => $rol,
        'escuela_id' => $escuela_id,
        'user_id'    => intval($usuario_actual['user_id'] ?? 0),
        'familia_id' => isset($usuario_actual['familia_id']) && $usuario_actual['familia_id'] ? intval($usuario_actual['familia_id']) : null,
    ];
}

function monedero_403(string $mensaje): void
{
    http_response_code(403);
    respond(['success' => false, 'error' => $mensaje]);
}

/**
 * clientes.id ligado a una cuenta rol 'alumno' (F4: usuarios.cliente_id).
 * Si la fase F4 todavía no está, la columna no existe y devuelve 0 (= no
 * puede ver ningún monedero), en vez de tronar.
 */
function monedero_cliente_de_usuario_alumno(PDO $pdo, array $usuario_actual): int
{
    if (!empty($usuario_actual['cliente_id'])) return intval($usuario_actual['cliente_id']);
    try {
        $st = $pdo->prepare("SELECT cliente_id FROM usuarios WHERE id = ?");
        $st->execute([intval($usuario_actual['user_id'] ?? 0)]);
        return intval($st->fetchColumn());
    } catch (\PDOException $e) {
        return 0;
    }
}

/**
 * Carga un alumno y comprueba que quien llama puede tocar SU monedero:
 *   · siempre: que sea de la escuela del contexto (nunca confiar en el input);
 *   · familia: que sea su hijo (familia_id de la sesión);
 *   · alumno:  que sea él mismo (usuarios.cliente_id, fase F4).
 * Corta con respond() si algo no cuadra.
 *
 * $solo_activos: la tiendita y las recargas solo operan con alumnos activos.
 */
function monedero_alumno(PDO $pdo, array $ctx, array $usuario_actual, int $cliente_id, bool $solo_activos = false): array
{
    if ($cliente_id <= 0) respond(['success' => false, 'error' => 'Falta indicar el alumno.']);
    $st = $pdo->prepare(
        "SELECT id, escuela_id, familia_id, nombre, grado, matricula, foto_url, activo, tipo
           FROM clientes WHERE id = ?"
    );
    $st->execute([$cliente_id]);
    $c = $st->fetch();
    if (!$c) respond(['success' => false, 'error' => 'Alumno no encontrado.']);
    if (intval($c['escuela_id']) !== intval($ctx['escuela_id'])) {
        monedero_403('Ese alumno no pertenece a tu colegio.');
    }
    if (($c['tipo'] ?? 'alumno') !== 'alumno') {
        respond(['success' => false, 'error' => 'Solo los alumnos tienen monedero.']);
    }
    if ($ctx['rol'] === 'familia') {
        requerir_familia_propia($c['familia_id'], $usuario_actual, 'Ese alumno no está ligado a tu cuenta.');
    }
    if ($ctx['rol'] === 'alumno') {
        if (function_exists('requerir_alumno_propio')) {
            requerir_alumno_propio($c['id'], $usuario_actual, 'Solo puedes consultar tu propio monedero.');
        } elseif (monedero_cliente_de_usuario_alumno($pdo, $usuario_actual) !== intval($c['id'])) {
            monedero_403('Solo puedes consultar tu propio monedero.');
        }
    }
    if ($solo_activos && !intval($c['activo'])) {
        respond(['success' => false, 'error' => 'El alumno ' . $c['nombre'] . ' no está activo.']);
    }
    return $c;
}

// ═════════════════════════════ LIBRO MAYOR ═══════════════════════════════

/** Crea el monedero (saldo 0) si el alumno todavía no tiene. Idempotente. */
function monedero_asegurar(PDO $pdo, int $escuela_id, int $cliente_id): void
{
    $pdo->prepare(
        "INSERT INTO monederos (cliente_id, escuela_id, saldo) VALUES (?, ?, 0.00)
         ON DUPLICATE KEY UPDATE cliente_id = cliente_id"
    )->execute([$cliente_id, $escuela_id]);
}

/**
 * Bloquea el renglón del monedero hasta el commit/rollback. DEBE llamarse
 * dentro de una transacción y después de monedero_asegurar().
 */
function monedero_bloquear(PDO $pdo, int $cliente_id): array
{
    $st = $pdo->prepare("SELECT * FROM monederos WHERE cliente_id = ? FOR UPDATE");
    $st->execute([$cliente_id]);
    $m = $st->fetch();
    if (!$m) throw new MonederoError('No se encontró el monedero del alumno.');
    return $m;
}

/** Saldo según el LIBRO (fuente de verdad), en centavos. */
function monedero_saldo_libro_c(PDO $pdo, int $cliente_id): int
{
    $st = $pdo->prepare("SELECT COALESCE(SUM(signo * monto), 0) FROM monedero_movimientos WHERE cliente_id = ?");
    $st->execute([$cliente_id]);
    return monedero_c($st->fetchColumn());
}

/**
 * Escribe UN movimiento y deja monederos.saldo igual al libro.
 *
 * Requisitos del llamador: transacción abierta y monedero bloqueado con
 * monedero_bloquear() (sin el candado, dos ventas simultáneas leerían el mismo
 * saldo). Lanza MonederoError si el saldo quedaría negativo.
 *
 * Idempotente por $idem_key: si ya existe, NO escribe y devuelve duplicado.
 *
 * @param array $extra cobro_id, venta_id, descripcion, usuario_id, solicitud_key
 * @return array{id:int, saldo_despues:float, duplicado:bool}
 */
function monedero_mover(PDO $pdo, int $escuela_id, int $cliente_id, string $tipo, int $signo, int $monto_c, string $idem_key, array $extra = []): array
{
    if (!in_array($tipo, MONEDERO_TIPOS, true)) throw new MonederoError('Tipo de movimiento inválido.');
    if ($signo !== 1 && $signo !== -1) throw new MonederoError('Signo de movimiento inválido.');
    if ($monto_c <= 0) throw new MonederoError('El monto debe ser mayor a cero.');
    if ($idem_key === '' || strlen($idem_key) > 80) throw new MonederoError('Llave de idempotencia inválida.');

    $chk = $pdo->prepare("SELECT id, saldo_despues FROM monedero_movimientos WHERE idem_key = ? LIMIT 1");
    $chk->execute([$idem_key]);
    if ($prev = $chk->fetch()) {
        return ['id' => intval($prev['id']), 'saldo_despues' => floatval($prev['saldo_despues']), 'duplicado' => true];
    }

    // El saldo de partida sale del LIBRO, no de la columna cacheada: si la
    // columna se hubiera desviado por algo hecho a mano, esta escritura la
    // corrige en vez de arrastrar el error.
    $antes_c = monedero_saldo_libro_c($pdo, $cliente_id);
    $despues_c = $antes_c + $signo * $monto_c;
    if ($despues_c < 0) {
        throw new MonederoError('Saldo insuficiente: el monedero tiene $' . number_format(monedero_p($antes_c), 2)
            . ' y se requieren $' . number_format(monedero_p($monto_c), 2) . '.');
    }

    $pdo->prepare(
        "INSERT INTO monedero_movimientos
            (escuela_id, cliente_id, tipo, signo, monto, saldo_despues, cobro_id, venta_id,
             idem_key, solicitud_key, descripcion, usuario_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )->execute([
        $escuela_id, $cliente_id, $tipo, $signo,
        monedero_p($monto_c), monedero_p($despues_c),
        !empty($extra['cobro_id']) ? intval($extra['cobro_id']) : null,
        !empty($extra['venta_id']) ? intval($extra['venta_id']) : null,
        $idem_key,
        !empty($extra['solicitud_key']) ? substr(strval($extra['solicitud_key']), 0, 80) : null,
        isset($extra['descripcion']) ? mb_substr(strval($extra['descripcion']), 0, 255) : null,
        !empty($extra['usuario_id']) ? intval($extra['usuario_id']) : null,
    ]);
    $id = intval($pdo->lastInsertId());

    $pdo->prepare("UPDATE monederos SET saldo = ?, actualizado_en = NOW() WHERE cliente_id = ?")
        ->execute([monedero_p($despues_c), $cliente_id]);

    return ['id' => $id, 'saldo_despues' => monedero_p($despues_c), 'duplicado' => false];
}

/**
 * Consumo del día en la tiendita (ventas completadas de hoy; las canceladas
 * ya no cuentan, que es lo mismo que "consumos menos reversos").
 */
function monedero_consumido_hoy_c(PDO $pdo, int $cliente_id): int
{
    $st = $pdo->prepare(
        "SELECT COALESCE(SUM(total), 0) FROM tienda_ventas
          WHERE cliente_id = ? AND estado = 'completada'
            AND creado_en >= CURDATE() AND creado_en < CURDATE() + INTERVAL 1 DAY"
    );
    $st->execute([$cliente_id]);
    return monedero_c($st->fetchColumn());
}

/** Datos públicos del monedero (sin nip_hash). */
function monedero_publico(?array $m): array
{
    return [
        'saldo'         => $m ? round(floatval($m['saldo']), 2) : 0.0,
        'limite_diario' => ($m && $m['limite_diario'] !== null) ? round(floatval($m['limite_diario']), 2) : null,
        'tiene_nip'     => $m ? !empty($m['nip_hash']) : false,
        'bloqueado'     => $m ? (bool) intval($m['bloqueado']) : false,
    ];
}

/** Folio con el formato normal del colegio (CLAVE-0001), como crear_cobro.php. */
function monedero_folio_nuevo(PDO $pdo, int $escuela_id): string
{
    $st = $pdo->prepare("SELECT clave FROM escuelas WHERE id = ?");
    $st->execute([$escuela_id]);
    $clave = $st->fetchColumn() ?: 'ESC';
    $st = $pdo->prepare("SELECT COUNT(*) FROM cobros WHERE escuela_id = ?");
    $st->execute([$escuela_id]);
    $n = intval($st->fetchColumn()) + 1;
    // Mismo cálculo que crear_cobro.php, pero sin aceptar un folio repetido:
    // generar_liga/generar_referencia_efectivo buscan el cobro POR FOLIO, y
    // dos cobros con el mismo folio harían que la liga cobrara el equivocado.
    $chk = $pdo->prepare("SELECT 1 FROM cobros WHERE folio = ? LIMIT 1");
    for ($i = 0; $i < 50; $i++, $n++) {
        $folio = $clave . '-' . str_pad(strval($n), 4, '0', STR_PAD_LEFT);
        $chk->execute([$folio]);
        if (!$chk->fetchColumn()) return $folio;
    }
    return $clave . '-' . date('ymdHis') . '-' . random_int(10, 99);
}

// ═══════════════════ BARRIDO DE RECARGAS (api.php y cron) ════════════════

/**
 * Acredita al monedero las recargas YA PAGADAS que todavía no tienen su
 * movimiento ('recarga:<cobro_id>'), y revierte las recargas acreditadas
 * cuyo cobro se canceló después (cancelar_cobro.php, o el proveedor que
 * cancela un pago de efectivo el mismo día).
 *
 * Idempotente: dos barridos simultáneos chocan en el UNIQUE de idem_key bajo
 * el candado del monedero; el segundo no hace nada. Nunca lanza: un error
 * aquí no debe tumbar la consulta de saldo ni el cron (devuelve lo logrado).
 *
 * No debe llamarse con una transacción abierta: abre las suyas, una por
 * cobro, para que un cobro problemático no detenga a los demás.
 *
 * @return int cuántas recargas se acreditaron en esta corrida
 */
function monedero_acreditar_recargas(PDO $pdo, ?int $cliente_id = null): int
{
    $acreditadas = 0;
    try {
        if (!monedero_tablas_ok($pdo) || $pdo->inTransaction()) return 0;

        $filtro = $cliente_id ? ' AND co.cliente_id = ?' : '';
        $params = $cliente_id ? [$cliente_id] : [];

        // 1) Pagadas sin acreditar.
        $st = $pdo->prepare(
            "SELECT co.id, co.escuela_id, co.cliente_id, co.total, co.folio, co.metodo
               FROM cobros co
              WHERE co.es_recarga_monedero = 1 AND co.estado = 'pagado' AND co.cliente_id IS NOT NULL{$filtro}
                AND NOT EXISTS (SELECT 1 FROM monedero_movimientos mm WHERE mm.idem_key = CONCAT('recarga:', co.id))
              ORDER BY co.id ASC LIMIT 500"
        );
        $st->execute($params);
        foreach ($st->fetchAll() as $co) {
            $monto_c = monedero_c($co['total']);
            if ($monto_c <= 0) continue;
            try {
                $pdo->beginTransaction();
                monedero_asegurar($pdo, intval($co['escuela_id']), intval($co['cliente_id']));
                monedero_bloquear($pdo, intval($co['cliente_id']));
                $r = monedero_mover($pdo, intval($co['escuela_id']), intval($co['cliente_id']), 'recarga', 1, $monto_c,
                    'recarga:' . intval($co['id']), [
                        'cobro_id'    => intval($co['id']),
                        'descripcion' => 'Recarga ' . $co['folio'] . ' (' . monedero_etiqueta_metodo($co['metodo']) . ')',
                    ]);
                $pdo->commit();
                if (!$r['duplicado']) $acreditadas++;
            } catch (\Throwable $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                monedero_log("no se pudo acreditar la recarga cobro_id={$co['id']}: " . $e->getMessage());
            }
        }

        // 2) Acreditadas cuyo cobro se canceló después: se retira lo acreditado.
        //    Si el alumno ya se gastó parte, se retira lo que haya (el saldo
        //    nunca baja de cero) y el faltante queda escrito en la descripción
        //    y en el log para que el admin decida (monedero_ajuste).
        //    Con saldo 0 no se escribe nada y se reintenta en la próxima corrida.
        $st = $pdo->prepare(
            "SELECT co.id, co.escuela_id, co.cliente_id, co.folio, mm.monto
               FROM cobros co
               JOIN monedero_movimientos mm ON mm.idem_key = CONCAT('recarga:', co.id)
              WHERE co.es_recarga_monedero = 1 AND co.estado = 'cancelado' AND co.cliente_id IS NOT NULL{$filtro}
                AND NOT EXISTS (SELECT 1 FROM monedero_movimientos m2 WHERE m2.idem_key = CONCAT('anula_recarga:', co.id))
              ORDER BY co.id ASC LIMIT 200"
        );
        $st->execute($params);
        foreach ($st->fetchAll() as $co) {
            try {
                $pdo->beginTransaction();
                monedero_bloquear($pdo, intval($co['cliente_id']));
                $saldo_c = monedero_saldo_libro_c($pdo, intval($co['cliente_id']));
                $retirar_c = min($saldo_c, monedero_c($co['monto']));
                if ($retirar_c <= 0) { $pdo->rollBack(); continue; }
                $falta_c = monedero_c($co['monto']) - $retirar_c;
                monedero_mover($pdo, intval($co['escuela_id']), intval($co['cliente_id']), 'ajuste', -1, $retirar_c,
                    'anula_recarga:' . intval($co['id']), [
                        'cobro_id'    => intval($co['id']),
                        'descripcion' => 'Recarga ' . $co['folio'] . ' cancelada: se retira lo acreditado'
                            . ($falta_c > 0 ? ' (faltaron $' . number_format(monedero_p($falta_c), 2) . ' por saldo insuficiente)' : ''),
                    ]);
                $pdo->commit();
                if ($falta_c > 0) {
                    monedero_log("recarga cancelada cobro_id={$co['id']} cliente_id={$co['cliente_id']}: faltaron " . monedero_p($falta_c) . " por retirar (el alumno ya lo había gastado)");
                }
            } catch (\Throwable $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                monedero_log("no se pudo revertir la recarga cancelada cobro_id={$co['id']}: " . $e->getMessage());
            }
        }
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        monedero_log('barrido de recargas falló: ' . $e->getMessage());
    }
    return $acreditadas;
}

/**
 * Cancela recargas EN LÍNEA que nadie pagó después de
 * MONEDERO_RECARGA_VIGENCIA_DIAS. Solo las que no recibieron ni un centavo
 * (monto_pagado = 0) y cuya referencia de efectivo, si la hay, ya venció:
 * cancelar una referencia todavía vigente haría que el papá pagara en la
 * tienda un cobro cancelado. Lo llama el cron.
 *
 * @return int cuántas se cancelaron
 */
function monedero_cancelar_recargas_vencidas(PDO $pdo): int
{
    if (!monedero_tablas_ok($pdo)) return 0;
    $base = "FROM cobros
              WHERE es_recarga_monedero = 1 AND estado = 'pendiente' AND monto_pagado = 0
                AND fecha < DATE_SUB(CURDATE(), INTERVAL " . intval(MONEDERO_RECARGA_VIGENCIA_DIAS) . " DAY)";
    try {
        $sql_ids = "SELECT id, cliente_id {$base} AND (ref_vencimiento IS NULL OR ref_vencimiento < CURDATE())";
        $filas = $pdo->query($sql_ids)->fetchAll();
    } catch (\PDOException $e) {
        // Sin columna ref_vencimiento (BD muy vieja): solo por antigüedad.
        $filas = $pdo->query("SELECT id, cliente_id {$base}")->fetchAll();
    }
    $n = 0;
    $upd = $pdo->prepare(
        "UPDATE cobros SET estado = 'cancelado'
          WHERE id = ? AND es_recarga_monedero = 1 AND estado = 'pendiente' AND monto_pagado = 0"
    );
    foreach ($filas as $f) {
        // Compare-and-swap: si el pago llegó entre el SELECT y este UPDATE,
        // el cobro ya no está pendiente y no se toca.
        $upd->execute([$f['id']]);
        if ($upd->rowCount() > 0) {
            $n++;
            if (!empty($f['cliente_id']) && function_exists('recalcular_saldo_pendiente')) {
                recalcular_saldo_pendiente($pdo, intval($f['cliente_id']));
            }
        }
    }
    return $n;
}

function monedero_etiqueta_metodo($metodo): string
{
    switch ($metodo) {
        case 'Efectivo':    return 'efectivo en caja';
        case 'TC':          return 'tarjeta';
        case 'EfectivoRef': return 'efectivo en tienda';
        default:            return strval($metodo ?: 'otro');
    }
}

/**
 * Recargas en línea del alumno que siguen esperando pago (para que la familia
 * pueda volver a abrir su referencia o su liga).
 */
function monedero_recargas_pendientes(PDO $pdo, int $cliente_id): array
{
    try {
        $st = $pdo->prepare(
            "SELECT id, folio, total, metodo, fecha, referencia, ref_barcode_url, ref_vencimiento
               FROM cobros
              WHERE cliente_id = ? AND es_recarga_monedero = 1 AND estado = 'pendiente'
              ORDER BY id DESC LIMIT 10"
        );
        $st->execute([$cliente_id]);
    } catch (\PDOException $e) {
        $st = $pdo->prepare(
            "SELECT id, folio, total, metodo, fecha, referencia
               FROM cobros
              WHERE cliente_id = ? AND es_recarga_monedero = 1 AND estado = 'pendiente'
              ORDER BY id DESC LIMIT 10"
        );
        $st->execute([$cliente_id]);
    }
    return array_map(function ($r) {
        $r['id'] = intval($r['id']);
        $r['total'] = round(floatval($r['total']), 2);
        return $r;
    }, $st->fetchAll());
}

/** Valida y normaliza un monto en pesos (2 decimales). null si no es válido. */
function monedero_monto_valido($valor, float $min, float $max): ?float
{
    if ($valor === null || $valor === '' || !is_numeric($valor)) return null;
    $v = round(floatval($valor), 2);
    if ($v < $min || $v > $max) return null;
    return $v;
}

/** Llave que manda el navegador: letras, dígitos, guion y guion bajo. */
function monedero_llave_cliente($valor): ?string
{
    $v = trim(strval($valor ?? ''));
    return preg_match('/^[A-Za-z0-9_-]{8,64}$/', $v) ? $v : null;
}
