<?php
// acciones/alumno_beca_desactivar.php — [OF-3] Baja LÓGICA de una beca (nunca se
// borra: el historial de qué descuento tuvo un alumno se conserva). También
// reactiva con reactivar=1.
//
// Solo admin y superadmin. La beca se busca por id y la escuela se valida contra
// la de la fila: el escuela_id del input no se usa.
//
// Desactivar una beca NO cambia cobros ya generados: solo los próximos.
//
// Entrada: id, reactivar (opcional, 1 = volver a activarla).

require_once __DIR__ . '/../lib/helpers_becas.php';

$rolBd = $usuario_actual['rol'] ?? '';
requerir_rol($rolBd, ['superadmin', 'admin'], 'Solo la administración del colegio puede dar de baja becas.');

if (!becas_tabla_lista($pdo)) {
    respond(['success' => false, 'error' => 'Falta correr la migración de OF-3 (migracion_2026_11_19_of3_cobranza.sql).']);
}

$beca_id_bd = intval($input['id'] ?? 0);
if ($beca_id_bd <= 0) respond(['success' => false, 'error' => 'id requerido']);
$st = $pdo->prepare("SELECT id, escuela_id, cliente_id, nombre, activo FROM alumno_becas WHERE id = ?");
$st->execute([$beca_id_bd]);
$fila_bd = $st->fetch();
if (!$fila_bd) {
    http_response_code(404);
    respond(['success' => false, 'error' => 'Beca no encontrada.']);
}
requerir_escuela_propia($rolBd, $fila_bd['escuela_id'], $usuario_actual, 'No tienes permiso sobre esta beca.');
requerir_seccion_habilitada($pdo, $rolBd, $fila_bd['escuela_id'], ['alumnos']);

$activar_bd = !empty($input['reactivar']) ? 1 : 0;
$pdo->prepare("UPDATE alumno_becas SET activo = ? WHERE id = ? AND escuela_id = ?")
    ->execute([$activar_bd, $beca_id_bd, $fila_bd['escuela_id']]);
registrar_log($pdo, $usuario_actual, $activar_bd ? 'beca_reactivada' : 'beca_desactivada',
    "Beca #{$beca_id_bd} \"{$fila_bd['nombre']}\" del alumno #{$fila_bd['cliente_id']} " . ($activar_bd ? 'reactivada' : 'dada de baja'),
    intval($fila_bd['escuela_id']));
// [OF-7c] Auditoría: activa/inactiva antes y después.
auditar($pdo, $usuario_actual, 'beca.estado', 'beca', $beca_id_bd,
    ['activo' => $fila_bd['activo']], ['activo' => $activar_bd], intval($fila_bd['escuela_id']));
respond(['success' => true, 'id' => $beca_id_bd, 'activo' => (bool) $activar_bd]);
