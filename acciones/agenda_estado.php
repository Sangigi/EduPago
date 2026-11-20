<?php
// agenda_estado — cambia el estado de una cita (OF-7c): programada, realizada, cancelada o
// no_asistio. Cancelar es cambiar el estado: la cita no se borra (queda el historial).
//
// Entrada: id, estado, avisar_familia? (casilla; solo avisa al cancelar o al reprogramar),
//          escuela_id (solo superadmin).
// Roles: admin y control_escolar (y superadmin con escuela_id), de SU colegio. La escuela
// sale de la fila de la cita.
// Volver a 'programada' una cita que estaba cancelada/realizada repite la validación de
// empalmes, con el mismo candado que agenda_guardar (la fila del responsable bloqueada):
// mientras estuvo cancelada pudo agendarse otra cosa en ese horario.
$ctx = agenda_ctx($pdo, $usuario_actual, $input, AGENDA_ROLES_GESTION);
$esc = $ctx['escuela_id'];

$id_ag = intval($input['id'] ?? 0);
$nuevo = (string) ($input['estado'] ?? '');
if ($id_ag <= 0) respond(['success' => false, 'error' => 'id requerido']);
if (!isset(AGENDA_ESTADOS[$nuevo])) respond(['success' => false, 'error' => 'El estado no es válido.']);

$st = $pdo->prepare("SELECT * FROM citas WHERE id = ? AND escuela_id = ?");
$st->execute([$id_ag, $esc]);
$c = $st->fetch(PDO::FETCH_ASSOC);
if (!$c) {
    http_response_code(404);
    respond(['success' => false, 'error' => 'Cita no encontrada.']);
}
if ($c['estado'] === $nuevo) respond(['success' => true, 'id' => $id_ag, 'estado' => $nuevo, 'sin_cambio' => true]);

$choque = null;
try {
    $pdo->beginTransaction();
    $pdo->prepare("SELECT id FROM usuarios WHERE id = ? FOR UPDATE")->execute([intval($c['responsable_id'])]);
    if ($nuevo === 'programada') {
        $choque = agenda_empalme_en_bd($pdo, $c['responsable_id'], $c['inicio'], $c['fin'], $id_ag);
    }
    if ($choque === null) {
        $pdo->prepare("UPDATE citas SET estado = ? WHERE id = ? AND escuela_id = ?")->execute([$nuevo, $id_ag, $esc]);
        $pdo->commit();
    } else {
        $pdo->rollBack();
    }
} catch (\Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    log_api('agenda_estado: ' . $e->getMessage());
    respond(['success' => false, 'error' => 'No se pudo cambiar el estado. Intenta de nuevo.']);
}
if ($choque !== null) {
    respond(['success' => false, 'conflicto' => true,
        'error' => 'No se puede reprogramar: esa persona ya tiene «' . $choque['titulo'] . '» de ' . date('H:i', strtotime($choque['inicio']))
            . ' a ' . date('H:i', strtotime($choque['fin'])) . ' ese día.']);
}

auditar($pdo, $usuario_actual, 'cita.estado', 'cita', $id_ag, ['estado' => $c['estado']], ['estado' => $nuevo], $esc);
registrar_log($pdo, $usuario_actual, 'cita_estado', "Cita #{$id_ag}: {$c['estado']} -> {$nuevo}", $esc);

$aviso = null;
if (!empty($input['avisar_familia']) && in_array($nuevo, ['cancelada', 'programada'], true)) {
    $aviso = agenda_avisar_familia($pdo, $c, $nuevo === 'cancelada' ? 'cancelada' : 'cambiada');
}
respond(['success' => true, 'id' => $id_ag, 'estado' => $nuevo, 'aviso' => $aviso]);
