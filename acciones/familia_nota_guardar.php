<?php
// acciones/familia_nota_guardar.php — [OF-3] Alta (sin id) o edición (con id) de
// una nota de cobranza.
//
//   · Alta: la pueden hacer superadmin, admin y cajero de la escuela de la familia.
//   · Edición: solo su AUTOR o admin / superadmin. La familia y la escuela salen de
//     la fila de la nota: no se puede mover una nota a otra familia mandando otro
//     familia_id.
//   · cliente_id (opcional): debe ser un alumno de ESA familia y ESA escuela.
//   · Un compromiso (fecha_compromiso) nace sin cumplir (cumplido = 0); si se le
//     quita la fecha, deja de ser compromiso (cumplido NULL).
//
// Entrada: familia_id (alta), id (edición), tipo, texto, fecha_compromiso,
// monto_compromiso, cliente_id.

require_once __DIR__ . '/../lib/helpers_notas_cobranza.php';

$rol_ng = $usuario_actual['rol'] ?? '';
requerir_rol($rol_ng, NOTA_ROLES, 'No tienes permiso para escribir notas de cobranza.');
notas_requerir_tabla($pdo);

$nota_id_ng = intval($input['id'] ?? 0);
$existente_ng = null;
if ($nota_id_ng > 0) {
    $st = $pdo->prepare("SELECT * FROM familia_notas WHERE id = ? AND eliminado = 0");
    $st->execute([$nota_id_ng]);
    $existente_ng = $st->fetch(PDO::FETCH_ASSOC);
    if (!$existente_ng) {
        http_response_code(404);
        respond(['success' => false, 'error' => 'Nota no encontrada.']);
    }
    if (!empty($input['familia_id']) && intval($input['familia_id']) !== intval($existente_ng['familia_id'])) {
        respond(['success' => false, 'error' => 'Esa nota pertenece a otra familia.']);
    }
    $familia_id_ng = intval($existente_ng['familia_id']);
} else {
    $familia_id_ng = intval($input['familia_id'] ?? 0);
}
$fam_ng = notas_familia_autorizada($pdo, $usuario_actual, $familia_id_ng);
if ($existente_ng) {
    if (intval($existente_ng['escuela_id']) !== intval($fam_ng['escuela_id'])) {
        respond(['success' => false, 'error' => 'La nota no corresponde al colegio de la familia.']);
    }
    if (!notas_puede_modificar($usuario_actual, $existente_ng)) {
        http_response_code(403);
        respond(['success' => false, 'error' => 'Solo quien escribió la nota o la administración del colegio puede editarla.']);
    }
}

$val = notas_validar_input($input);
if (!$val['ok']) respond(['success' => false, 'error' => $val['error']]);
$d = $val['datos'];

// El alumno de la nota (si lo hay) tiene que ser hijo de ESTA familia en ESTA escuela.
if ($d['cliente_id'] !== null) {
    $st = $pdo->prepare("SELECT id FROM clientes WHERE id = ? AND familia_id = ? AND escuela_id = ?");
    $st->execute([$d['cliente_id'], $fam_ng['id'], $fam_ng['escuela_id']]);
    if (!$st->fetch()) respond(['success' => false, 'error' => 'Ese alumno no pertenece a esta familia.']);
}

$uid_ng = intval($usuario_actual['user_id'] ?? 0) ?: null;
if ($existente_ng) {
    // cumplido: sin fecha deja de ser compromiso; con fecha conserva lo que tenía (o nace en 0).
    $cumplido_ng = $d['fecha_compromiso'] === null ? null : (intval($existente_ng['cumplido'] ?? 0) === 1 ? 1 : 0);
    $pdo->prepare(
        "UPDATE familia_notas SET tipo = ?, texto = ?, fecha_compromiso = ?, monto_compromiso = ?, cliente_id = ?,
                cumplido = ?, actualizado_en = NOW()
          WHERE id = ? AND escuela_id = ? AND eliminado = 0"
    )->execute([$d['tipo'], $d['texto'], $d['fecha_compromiso'], $d['monto_compromiso'], $d['cliente_id'],
                $cumplido_ng, $nota_id_ng, $fam_ng['escuela_id']]);
    registrar_log($pdo, $usuario_actual, 'familia_nota_editada',
        "Nota #{$nota_id_ng} de la familia #{$fam_ng['id']} ({$fam_ng['nombre']}) editada", intval($fam_ng['escuela_id']));
    respond(['success' => true, 'id' => $nota_id_ng]);
}

$pdo->prepare(
    "INSERT INTO familia_notas
        (escuela_id, familia_id, cliente_id, tipo, texto, fecha_compromiso, monto_compromiso, cumplido, usuario_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
)->execute([$fam_ng['escuela_id'], $fam_ng['id'], $d['cliente_id'], $d['tipo'], $d['texto'],
            $d['fecha_compromiso'], $d['monto_compromiso'], $d['fecha_compromiso'] !== null ? 0 : null, $uid_ng]);
$nuevo_id_ng = intval($pdo->lastInsertId());
registrar_log($pdo, $usuario_actual, 'familia_nota_creada',
    "Nota #{$nuevo_id_ng} ({$d['tipo']}) en la familia #{$fam_ng['id']} ({$fam_ng['nombre']})"
    . ($d['fecha_compromiso'] !== null ? ", compromiso para {$d['fecha_compromiso']}" . ($d['monto_compromiso'] !== null ? ' por $' . number_format($d['monto_compromiso'], 2) : '') : ''),
    intval($fam_ng['escuela_id']));
respond(['success' => true, 'id' => $nuevo_id_ng]);
