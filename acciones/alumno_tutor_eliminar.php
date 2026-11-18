<?php
// acciones/alumno_tutor_eliminar.php — F2 (18-nov-2026)
//
// Baja LÓGICA de un tutor (activo = 0). No se borra la fila: si mañana hay
// que aclarar quién estaba autorizado a recoger al alumno en una fecha, el
// registro sigue ahí (con su creado_en / actualizado_en).
//
// Entrada: id (del tutor).

require_once __DIR__ . '/../lib/helpers_expediente.php';

$rolExp = $usuario_actual['rol'] ?? '';
requerir_rol($rolExp, EXPEDIENTE_ROLES_GESTION, 'No tienes permiso para modificar los tutores de este alumno.');

expediente_requerir_tabla($pdo, 'alumno_tutores');

$tutor_id = intval($input['id'] ?? 0);
if ($tutor_id <= 0) respond(['success' => false, 'error' => 'Falta indicar el tutor.']);

$st = $pdo->prepare("SELECT id, escuela_id, cliente_id, activo FROM alumno_tutores WHERE id = ?");
$st->execute([$tutor_id]);
$tutor = $st->fetch();
if (!$tutor) {
    http_response_code(404);
    respond(['success' => false, 'error' => 'Tutor no encontrado.']);
}

// La pertenencia se valida contra el ALUMNO del tutor (y su escuela).
$alumno = expediente_alumno($pdo, $usuario_actual, $tutor['cliente_id'],
    EXPEDIENTE_ROLES_GESTION, 'No tienes permiso para modificar los tutores de este alumno.');
if (intval($tutor['escuela_id']) !== $alumno['escuela_id']) {
    http_response_code(403);
    respond(['success' => false, 'error' => 'No tienes permiso sobre este tutor.']);
}

if (intval($tutor['activo'])) {
    $pdo->prepare("UPDATE alumno_tutores SET activo = 0 WHERE id = ? AND escuela_id = ?")
        ->execute([$tutor_id, $alumno['escuela_id']]);
    registrar_log($pdo, $usuario_actual, 'alumno_tutor_baja',
        "Alumno #{$alumno['id']}: dio de baja al tutor #{$tutor_id}", $alumno['escuela_id']);
}

// Idempotente: dar de baja a uno que ya estaba de baja no es un error.
respond(['success' => true, 'id' => $tutor_id]);
