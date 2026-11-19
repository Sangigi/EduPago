<?php
/**
 * lib/helpers_notas_cobranza.php — [OF-3] Notas de cobranza por familia.
 *
 * Bitácora de lo que el colegio hace para cobrar (llamadas, acuerdos, correos,
 * visitas) con compromisos de pago opcionales. Tabla familia_notas
 * (migracion_2026_11_19_of3_cobranza.sql).
 *
 * Las usan acciones/familia_notas_listar.php, familia_nota_guardar.php,
 * familia_nota_eliminar.php, familia_nota_cumplida.php y
 * compromisos_pago_listar.php. Todas son de admin, cajero y superadmin: estas
 * notas hablan de dinero y de la situación de una familia, así que
 * control_escolar, direccion, familia, alumno, etc. NO las ven.
 *
 * Estados de un compromiso (fecha_compromiso no nula):
 *   cumplido NULL o 0 → sin cumplir (vence el día de fecha_compromiso)
 *   cumplido = 1      → cumplido
 * Una nota sin fecha_compromiso nunca es compromiso (cumplido NULL).
 */

const NOTA_TIPOS = ['llamada', 'acuerdo', 'correo', 'visita', 'otro'];
const NOTA_ROLES = ['superadmin', 'admin', 'cajero'];

/** ¿Existe la tabla familia_notas? (una consulta por proceso). */
function notas_tabla_lista(PDO $pdo): bool
{
    static $ok = null;
    if ($ok !== null) return $ok;
    try {
        $ok = (bool) $pdo->query("SHOW TABLES LIKE 'familia_notas'")->fetch();
    } catch (\Throwable $e) {
        $ok = false;
    }
    return $ok;
}

/** Corta con "falta correr la migración" si la tabla no existe. */
function notas_requerir_tabla(PDO $pdo): void
{
    if (!notas_tabla_lista($pdo)) {
        respond(['success' => false, 'falta_migracion' => true,
                 'error' => 'Falta correr la migración de OF-3 (migracion_2026_11_19_of3_cobranza.sql) para usar las notas de cobranza.']);
    }
}

/**
 * Carga la familia y valida que el usuario pueda tocarla: rol permitido, misma
 * escuela (salvo superadmin) y sección habilitada. Devuelve la fila
 * (id, escuela_id, nombre). Corta con 403/404 si no.
 */
function notas_familia_autorizada(PDO $pdo, array $usuario_actual, int $familia_id, string $mensaje = 'No tienes permiso sobre esta familia.'): array
{
    $rol = $usuario_actual['rol'] ?? '';
    requerir_rol($rol, NOTA_ROLES, 'No tienes permiso para ver o escribir notas de cobranza.');
    if ($familia_id <= 0) respond(['success' => false, 'error' => 'familia_id requerido']);
    $st = $pdo->prepare("SELECT id, escuela_id, nombre FROM familias WHERE id = ?");
    $st->execute([$familia_id]);
    $fam = $st->fetch();
    if (!$fam) {
        http_response_code(404);
        respond(['success' => false, 'error' => 'Familia no encontrada.']);
    }
    requerir_escuela_propia($rol, $fam['escuela_id'], $usuario_actual, $mensaje);
    requerir_seccion_habilitada($pdo, $rol, $fam['escuela_id'], ['familias', 'cobros', 'recordatorios']);
    return $fam;
}

/** ¿Puede este usuario editar o eliminar la nota? Su autor, o admin / superadmin. */
function notas_puede_modificar(array $usuario_actual, array $nota): bool
{
    $rol = $usuario_actual['rol'] ?? '';
    if ($rol === 'superadmin' || $rol === 'admin') return true;
    return intval($nota['usuario_id'] ?? 0) > 0 && intval($nota['usuario_id']) === intval($usuario_actual['user_id'] ?? -1);
}

/** Fila de familia_notas lista para el navegador. */
function notas_fila_publica(array $f, array $usuario_actual): array
{
    return [
        'id'               => intval($f['id']),
        'familia_id'       => intval($f['familia_id']),
        'cliente_id'       => $f['cliente_id'] !== null ? intval($f['cliente_id']) : null,
        'cliente_nombre'   => $f['cliente_nombre'] ?? null,
        'tipo'             => (string) $f['tipo'],
        'texto'            => (string) $f['texto'],
        'fecha_compromiso' => $f['fecha_compromiso'] ?: null,
        'monto_compromiso' => $f['monto_compromiso'] !== null ? floatval($f['monto_compromiso']) : null,
        'cumplido'         => $f['cumplido'] !== null ? intval($f['cumplido']) === 1 : null,
        'usuario_id'       => $f['usuario_id'] !== null ? intval($f['usuario_id']) : null,
        'autor'            => $f['autor_nombre'] ?? null,
        'creado_en'        => $f['creado_en'],
        'actualizado_en'   => $f['actualizado_en'] ?? null,
        'puede_modificar'  => notas_puede_modificar($usuario_actual, $f),
    ];
}

/**
 * Valida el cuerpo de una nota (alta o edición).
 * Devuelve ['ok' => true, 'datos' => ['tipo','texto','fecha_compromiso','monto_compromiso','cliente_id']]
 * o ['ok' => false, 'error' => '...']. cliente_id sale tal cual (int|null): quien
 * llama valida que sea un alumno de ESA familia y escuela.
 */
function notas_validar_input(array $in): array
{
    $tipo = strtolower(trim((string) ($in['tipo'] ?? 'otro')));
    if (!in_array($tipo, NOTA_TIPOS, true)) return ['ok' => false, 'error' => 'El tipo de nota no es válido.'];

    $texto = trim((string) ($in['texto'] ?? ''));
    if ($texto === '') return ['ok' => false, 'error' => 'Escribe la nota.'];
    if (mb_strlen($texto) > 1000) return ['ok' => false, 'error' => 'La nota no puede pasar de 1000 caracteres.'];

    $fecha = isset($in['fecha_compromiso']) && $in['fecha_compromiso'] !== '' ? $in['fecha_compromiso'] : null;
    if ($fecha !== null) {
        $ok = is_string($fecha) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)
            && checkdate((int) substr($fecha, 5, 2), (int) substr($fecha, 8, 2), (int) substr($fecha, 0, 4));
        if (!$ok) return ['ok' => false, 'error' => 'La fecha del compromiso no es válida.'];
    }

    $monto = null;
    if (isset($in['monto_compromiso']) && $in['monto_compromiso'] !== '' && $in['monto_compromiso'] !== null) {
        if (!is_numeric($in['monto_compromiso']) || floatval($in['monto_compromiso']) < 0 || floatval($in['monto_compromiso']) > 9999999999) {
            return ['ok' => false, 'error' => 'El monto del compromiso no es válido.'];
        }
        $monto = round(floatval($in['monto_compromiso']), 2);
        if ($fecha === null) return ['ok' => false, 'error' => 'Para registrar un monto prometido indica también la fecha del compromiso.'];
    }

    $cliente_id = intval($in['cliente_id'] ?? 0) ?: null;
    return ['ok' => true, 'datos' => [
        'tipo' => $tipo, 'texto' => $texto, 'fecha_compromiso' => $fecha, 'monto_compromiso' => $monto, 'cliente_id' => $cliente_id,
    ]];
}
