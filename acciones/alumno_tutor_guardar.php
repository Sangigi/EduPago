<?php
// acciones/alumno_tutor_guardar.php — F2 (18-nov-2026)
//
// Alta (sin id) o edición (con id) de un tutor del alumno.
//
// En la EDICIÓN el alumno sale de la fila del tutor, no del input: así no se
// puede "mover" un tutor a otro alumno —ni a otro colegio— mandando un
// cliente_id distinto. Si el input trae cliente_id y no coincide, se rechaza.
//
// Entrada: cliente_id (alta), id (edición), nombre, parentesco, email,
// telefono, telefono_alt, es_contacto_emergencia, autorizado_recoger,
// responsable_pago, vive_con_alumno, notas, usuario_id (opcional).

require_once __DIR__ . '/../lib/helpers_expediente.php';

$rolExp = $usuario_actual['rol'] ?? '';
requerir_rol($rolExp, EXPEDIENTE_ROLES_GESTION, 'No tienes permiso para modificar los tutores de este alumno.');

expediente_requerir_tabla($pdo, 'alumno_tutores');

$tutor_id = intval($input['id'] ?? 0);
$existente = null;
if ($tutor_id > 0) {
    $st = $pdo->prepare("SELECT id, escuela_id, cliente_id, activo FROM alumno_tutores WHERE id = ?");
    $st->execute([$tutor_id]);
    $existente = $st->fetch();
    if (!$existente) {
        http_response_code(404);
        respond(['success' => false, 'error' => 'Tutor no encontrado.']);
    }
    if (!empty($input['cliente_id']) && intval($input['cliente_id']) !== intval($existente['cliente_id'])) {
        respond(['success' => false, 'error' => 'Ese tutor pertenece a otro alumno.']);
    }
    $cliente_id = intval($existente['cliente_id']);
} else {
    $cliente_id = intval($input['cliente_id'] ?? 0);
}

$alumno = expediente_alumno($pdo, $usuario_actual, $cliente_id,
    EXPEDIENTE_ROLES_GESTION, 'No tienes permiso para modificar los tutores de este alumno.');

// Defensa extra: la fila del tutor debe ser de la misma escuela que su alumno.
if ($existente && intval($existente['escuela_id']) !== $alumno['escuela_id']) {
    http_response_code(403);
    respond(['success' => false, 'error' => 'No tienes permiso sobre este tutor.']);
}
if ($existente && !intval($existente['activo'])) {
    respond(['success' => false, 'error' => 'Este tutor ya fue dado de baja. Agrégalo de nuevo si hace falta.']);
}

// ── Validación ──────────────────────────────────────────────────────────
$nombre = expediente_texto($input['nombre'] ?? null, 150, 'Nombre del tutor');
if ($nombre === null) respond(['success' => false, 'error' => 'Escribe el nombre del tutor.']);

$parentesco = strtolower(trim((string) ($input['parentesco'] ?? '')));
if ($parentesco === '') {
    $parentesco = null;
} elseif (!array_key_exists($parentesco, EXPEDIENTE_PARENTESCOS_TUTOR)) {
    respond(['success' => false, 'error' => 'Parentesco no válido.']);
}

// validar_email_opcional() (api.php) también bloquea \r\n: este correo puede
// terminar en un envío SMTP del cron, igual que el de familias/clientes.
$email = expediente_texto($input['email'] ?? null, 150, 'Correo');
if ($email !== null) {
    if (function_exists('validar_email_opcional')) {
        $email = validar_email_opcional($email);
    } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        respond(['success' => false, 'error' => 'El correo electrónico no es válido.']);
    }
}

$telefono     = expediente_telefono($input['telefono'] ?? null, 'teléfono');
$telefono_alt = expediente_telefono($input['telefono_alt'] ?? null, 'teléfono alterno');
$notas        = expediente_texto($input['notas'] ?? null, 500, 'Notas', true);

$es_emergencia = expediente_bool($input['es_contacto_emergencia'] ?? 0);
$recoger       = expediente_bool($input['autorizado_recoger'] ?? 0);
$paga          = expediente_bool($input['responsable_pago'] ?? 0);
$vive          = expediente_bool($input['vive_con_alumno'] ?? 0);

if ($es_emergencia && $telefono === null && $telefono_alt === null) {
    respond(['success' => false, 'error' => 'Un contacto de emergencia necesita al menos un teléfono.']);
}

// Cuenta del portal ligada (opcional). Solo se acepta una cuenta 'familia'
// de la MISMA familia y escuela del alumno: ligar la cuenta de otra familia le
// daría a futuro acceso a un alumno ajeno.
$usuario_id = null;
if (array_key_exists('usuario_id', $input) && intval($input['usuario_id'] ?? 0) > 0) {
    $su = $pdo->prepare("SELECT id, escuela_id, familia_id, rol FROM usuarios WHERE id = ?");
    $su->execute([intval($input['usuario_id'])]);
    $u = $su->fetch();
    if (!$u || $u['rol'] !== 'familia'
        || intval($u['escuela_id']) !== $alumno['escuela_id']
        || !$alumno['familia_id'] || intval($u['familia_id']) !== $alumno['familia_id']) {
        respond(['success' => false, 'error' => 'La cuenta indicada no es de la familia de este alumno.']);
    }
    $usuario_id = intval($u['id']);
}

// ── Guardado ────────────────────────────────────────────────────────────
try {
    if ($existente) {
        $sets = "nombre = ?, parentesco = ?, email = ?, telefono = ?, telefono_alt = ?,
                 es_contacto_emergencia = ?, autorizado_recoger = ?, responsable_pago = ?,
                 vive_con_alumno = ?, notas = ?";
        $vals = [$nombre, $parentesco, $email, $telefono, $telefono_alt,
                 $es_emergencia, $recoger, $paga, $vive, $notas];
        // usuario_id solo se toca si viene en el input: la vista actual no lo
        // manda y no debe borrar una liga hecha por otro medio.
        if (array_key_exists('usuario_id', $input)) {
            $sets .= ", usuario_id = ?";
            $vals[] = $usuario_id;
        }
        $vals[] = $tutor_id;
        $vals[] = $alumno['escuela_id'];
        $pdo->prepare("UPDATE alumno_tutores SET {$sets} WHERE id = ? AND escuela_id = ?")->execute($vals);
        $accionLog = 'alumno_tutor_editado';
    } else {
        $sc = $pdo->prepare("SELECT COUNT(*) FROM alumno_tutores WHERE cliente_id = ? AND escuela_id = ? AND activo = 1");
        $sc->execute([$alumno['id'], $alumno['escuela_id']]);
        if (intval($sc->fetchColumn()) >= EXPEDIENTE_MAX_TUTORES_ACTIVOS) {
            respond(['success' => false, 'error' => 'Este alumno ya tiene ' . EXPEDIENTE_MAX_TUTORES_ACTIVOS . ' tutores activos. Da de baja alguno antes de agregar otro.']);
        }
        $pdo->prepare(
            "INSERT INTO alumno_tutores
                (escuela_id, cliente_id, nombre, parentesco, email, telefono, telefono_alt,
                 es_contacto_emergencia, autorizado_recoger, responsable_pago, vive_con_alumno,
                 usuario_id, notas, activo, creado_en)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())"
        )->execute([
            $alumno['escuela_id'], $alumno['id'], $nombre, $parentesco, $email, $telefono, $telefono_alt,
            $es_emergencia, $recoger, $paga, $vive, $usuario_id, $notas,
        ]);
        $tutor_id = intval($pdo->lastInsertId());
        $accionLog = 'alumno_tutor_creado';
    }

    $st = $pdo->prepare(
        "SELECT id, cliente_id, nombre, parentesco, email, telefono, telefono_alt,
                es_contacto_emergencia, autorizado_recoger, responsable_pago, vive_con_alumno,
                usuario_id, notas, creado_en, actualizado_en
         FROM alumno_tutores WHERE id = ?"
    );
    $st->execute([$tutor_id]);
    $tutor = expediente_tutor_salida($st->fetch() ?: []);
} catch (\PDOException $e) {
    expediente_error_bd($e, 'alumno_tutor_guardar');
}

registrar_log($pdo, $usuario_actual, $accionLog,
    "Alumno #{$alumno['id']}: tutor #{$tutor_id}" . ($parentesco ? " ({$parentesco})" : ''), $alumno['escuela_id']);

respond(['success' => true, 'tutor' => $tutor]);
