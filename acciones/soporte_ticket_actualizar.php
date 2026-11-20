<?php
// acciones/soporte_ticket_actualizar.php — OF-7a (20-nov-2026)
//
// Cambia estado, prioridad o asignación de un ticket.
//
// Entrada (JSON): ticket_id y al menos uno de:
//   estado      — plataforma: cualquiera de los 4. Colegio: solo 'resuelto' (marcar
//                 resuelto) o 'abierto' para REABRIR un ticket resuelto.
//   prioridad   — 'normal' | 'alta'. Solo plataforma.
//   asignado_a  — solo plataforma: 'yo', 0/null (quitar asignación) o el id de un usuario
//                 activo con rol soporte o superadmin.
//
// El colegio solo puede tocar tickets de SU escuela (soporte_ticket_cargar).

require_once __DIR__ . '/../lib/helpers_soporte.php';

$rolSop = $usuario_actual['rol'] ?? '';
requerir_rol($rolSop, array_merge(SOPORTE_ROLES_COLEGIO, SOPORTE_ROLES_PLATAFORMA), 'No tienes permiso para modificar tickets de soporte.');
$esPlataforma = soporte_es_plataforma($rolSop);
$lado = soporte_lado($rolSop);
$yo = intval($usuario_actual['user_id'] ?? 0);

soporte_requerir_tabla($pdo, 'soporte_tickets');

$tocaEstado = array_key_exists('estado', $input);
$tocaPrioridad = array_key_exists('prioridad', $input);
$tocaAsignado = array_key_exists('asignado_a', $input);
if (!$tocaEstado && !$tocaPrioridad && !$tocaAsignado) respond(['success' => false, 'error' => 'No hay nada que cambiar.']);
if (!$esPlataforma && ($tocaPrioridad || $tocaAsignado)) {
    http_response_code(403);
    respond(['success' => false, 'error' => 'Solo soporte puede cambiar la prioridad o la asignación.']);
}

try {
    $pdo->beginTransaction();
    $t = soporte_ticket_cargar($pdo, $usuario_actual, $input['ticket_id'] ?? 0, true);
    $sets = []; $vals = []; $detalle = [];

    if ($tocaEstado) {
        $nuevo = trim((string) $input['estado']);
        if (!soporte_transicion_permitida($lado, $t['estado'], $nuevo)) {
            $pdo->rollBack();
            respond(['success' => false, 'error' => $lado === 'colegio'
                ? 'Solo puedes marcar el ticket como resuelto o reabrir uno resuelto.'
                : 'El estado elegido no es válido.']);
        }
        if ($nuevo !== $t['estado']) {
            $sets[] = 'estado = ?'; $vals[] = $nuevo;
            $sets[] = $nuevo === 'resuelto' ? 'cerrado_en = NOW()' : 'cerrado_en = NULL';
            // Reabrir desde el colegio es hablar: vuelve a la bandeja como "sin respuesta".
            if ($lado === 'colegio' && $nuevo === 'abierto') { $sets[] = "ultimo_autor = 'colegio'"; $sets[] = 'ultimo_mensaje_en = NOW(3)'; }
            $detalle[] = "estado {$t['estado']} → {$nuevo}";
        }
    }
    if ($tocaPrioridad) {
        $p = trim((string) $input['prioridad']);
        if (!isset(SOPORTE_PRIORIDADES[$p])) { $pdo->rollBack(); respond(['success' => false, 'error' => 'La prioridad elegida no es válida.']); }
        if ($p !== $t['prioridad']) { $sets[] = 'prioridad = ?'; $vals[] = $p; $detalle[] = "prioridad {$t['prioridad']} → {$p}"; }
    }
    if ($tocaAsignado) {
        $a = $input['asignado_a'];
        $destino = ($a === 'yo') ? $yo : intval($a);
        if ($destino > 0) {
            $ch = $pdo->prepare("SELECT 1 FROM usuarios WHERE id = ? AND activo = 1 AND rol IN ('soporte', 'superadmin')");
            $ch->execute([$destino]);
            if (!$ch->fetchColumn()) { $pdo->rollBack(); respond(['success' => false, 'error' => 'Solo se puede asignar a alguien del equipo de soporte.']); }
        }
        $nuevoAsig = $destino > 0 ? $destino : null;
        if ($nuevoAsig !== $t['asignado_a']) {
            $sets[] = 'asignado_a = ?'; $vals[] = $nuevoAsig;
            $detalle[] = $nuevoAsig ? "asignado a usuario #{$nuevoAsig}" : 'asignación retirada';
        }
    }

    if ($sets) {
        $vals[] = $t['id'];
        $pdo->prepare('UPDATE soporte_tickets SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($vals);
    }
    $pdo->commit();
} catch (\Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    soporte_error_bd($e, 'soporte_ticket_actualizar');
}

if ($detalle) {
    registrar_log($pdo, $usuario_actual, 'soporte_ticket_actualizado', "Ticket #{$t['id']}: " . implode('; ', $detalle), $t['escuela_id']);
}
respond(['success' => true, 'cambios' => $detalle]);
