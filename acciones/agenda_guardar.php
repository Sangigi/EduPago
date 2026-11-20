<?php
// agenda_guardar — alta (sin id) o edición (con id) de una cita (OF-7c).
//
// Entrada: id?, titulo, tipo (admision|padres|reunion|otro), inicio, fin ('YYYY-MM-DD HH:MM' o
//          con 'T'), responsable_id, familia_id?, cliente_id?, lugar?, notas?,
//          avisar_familia? (casilla: manda un correo a la familia, sin datos sensibles),
//          escuela_id (solo superadmin).
//
// Roles: admin y control_escolar (y superadmin con escuela_id), de SU colegio. La escuela de
// una cita existente sale de la FILA; el responsable, la familia y el alumno deben ser de
// ESA escuela (un id de otro colegio responde como inexistente).
//
// SIN EMPALMES: el mismo responsable no puede tener dos citas 'programada' que se crucen.
// Se valida aquí, en el servidor, dentro de una transacción que primero BLOQUEA la fila del
// responsable (SELECT ... FOR UPDATE): dos altas simultáneas se serializan y la segunda ya
// ve la primera. Solo se edita una cita 'programada'; para reabrir una cancelada se usa
// agenda_estado (que repite la misma validación).
$ctx = agenda_ctx($pdo, $usuario_actual, $input, AGENDA_ROLES_GESTION);
$esc = $ctx['escuela_id'];

$id_ag = intval($input['id'] ?? 0);
$previa = null;
if ($id_ag > 0) {
    $st = $pdo->prepare("SELECT * FROM citas WHERE id = ? AND escuela_id = ?");
    $st->execute([$id_ag, $esc]);
    $previa = $st->fetch(PDO::FETCH_ASSOC);
    if (!$previa) {
        http_response_code(404);
        respond(['success' => false, 'error' => 'Cita no encontrada.']);
    }
    if ($previa['estado'] !== 'programada') {
        respond(['success' => false, 'error' => 'Solo se puede editar una cita programada. Reprográmala primero.']);
    }
}

$val = agenda_validar_input($input);
if (!$val['ok']) respond(['success' => false, 'error' => $val['error']]);
$d = $val['datos'];

// El responsable: personal activo de ESTE colegio.
$st = $pdo->prepare("SELECT id, nombre FROM usuarios WHERE id = ? AND escuela_id = ? AND activo = 1 AND rol IN ('" . implode("','", AGENDA_ROLES_RESPONSABLE) . "')");
$st->execute([$d['responsable_id'], $esc]);
if (!$st->fetch()) respond(['success' => false, 'error' => 'La persona elegida como responsable no existe en este colegio.']);

// La familia y el alumno/aspirante, si vienen: del mismo colegio y coherentes entre sí.
if ($d['familia_id']) {
    $st = $pdo->prepare("SELECT id FROM familias WHERE id = ? AND escuela_id = ?");
    $st->execute([$d['familia_id'], $esc]);
    if (!$st->fetch()) respond(['success' => false, 'error' => 'La familia elegida no existe en este colegio.']);
}
if ($d['cliente_id']) {
    $st = $pdo->prepare("SELECT id, familia_id FROM clientes WHERE id = ? AND escuela_id = ?");
    $st->execute([$d['cliente_id'], $esc]);
    $cli = $st->fetch(PDO::FETCH_ASSOC);
    if (!$cli) respond(['success' => false, 'error' => 'El alumno elegido no existe en este colegio.']);
    if (!$d['familia_id'] && !empty($cli['familia_id'])) $d['familia_id'] = intval($cli['familia_id']);
    elseif ($d['familia_id'] && !empty($cli['familia_id']) && intval($cli['familia_id']) !== $d['familia_id']) {
        respond(['success' => false, 'error' => 'El alumno elegido no pertenece a esa familia.']);
    }
}

$uid = intval($usuario_actual['user_id'] ?? 0) ?: null;
$choque = null;
try {
    $pdo->beginTransaction();
    // El candado: todas las altas/cambios de ESTE responsable pasan por esta fila.
    $pdo->prepare("SELECT id FROM usuarios WHERE id = ? FOR UPDATE")->execute([$d['responsable_id']]);
    $choque = agenda_empalme_en_bd($pdo, $d['responsable_id'], $d['inicio'], $d['fin'], $id_ag);
    if ($choque === null) {
        if ($previa) {
            $pdo->prepare(
                "UPDATE citas SET titulo = ?, tipo = ?, inicio = ?, fin = ?, responsable_id = ?, familia_id = ?, cliente_id = ?, lugar = ?, notas = ?
                  WHERE id = ? AND escuela_id = ?"
            )->execute([$d['titulo'], $d['tipo'], $d['inicio'], $d['fin'], $d['responsable_id'], $d['familia_id'], $d['cliente_id'], $d['lugar'], $d['notas'], $id_ag, $esc]);
        } else {
            $pdo->prepare(
                "INSERT INTO citas (escuela_id, titulo, tipo, inicio, fin, responsable_id, familia_id, cliente_id, lugar, notas, estado, creado_por, creado_en)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'programada', ?, NOW())"
            )->execute([$esc, $d['titulo'], $d['tipo'], $d['inicio'], $d['fin'], $d['responsable_id'], $d['familia_id'], $d['cliente_id'], $d['lugar'], $d['notas'], $uid]);
            $id_ag = intval($pdo->lastInsertId());
        }
        $pdo->commit();
    } else {
        $pdo->rollBack();
    }
} catch (\Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    log_api('agenda_guardar: ' . $e->getMessage());
    respond(['success' => false, 'error' => 'No se pudo guardar la cita. Intenta de nuevo.']);
}
if ($choque !== null) {
    respond(['success' => false, 'conflicto' => true,
        'error' => 'Esa persona ya tiene la cita «' . $choque['titulo'] . '» de ' . date('H:i', strtotime($choque['inicio'])) . ' a '
            . date('H:i', strtotime($choque['fin'])) . ' (' . date('d/m/Y', strtotime($choque['inicio'])) . '). Elige otro horario u otra persona.']);
}

// Después del commit: bitácora, auditoría y aviso. Nada de esto tumba el guardado.
$campos_aud = ['titulo', 'tipo', 'inicio', 'fin', 'responsable_id', 'familia_id', 'cliente_id', 'lugar'];
$antes_aud = $previa ? array_intersect_key($previa, array_flip($campos_aud)) : [];
$despues_aud = array_intersect_key($d, array_flip($campos_aud)) + ['estado' => 'programada'];
if ($previa) $antes_aud['estado'] = $previa['estado'];
auditar($pdo, $usuario_actual, $previa ? 'cita.editar' : 'cita.crear', 'cita', $id_ag, $antes_aud, $despues_aud, $esc);
registrar_log($pdo, $usuario_actual, $previa ? 'cita_editada' : 'cita_creada',
    "Cita #{$id_ag} ({$d['tipo']}) {$d['inicio']} con responsable #{$d['responsable_id']}", $esc);

$aviso = null;
if (!empty($input['avisar_familia'])) {
    $aviso = agenda_avisar_familia($pdo, $d + ['escuela_id' => $esc], $previa ? 'cambiada' : 'creada');
}
respond(['success' => true, 'id' => $id_ag, 'aviso' => $aviso]);
