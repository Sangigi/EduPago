<?php
// acciones/alumno_tutores_listar.php — F2 (18-nov-2026)
//
// Tutores ACTIVOS de un alumno (los dados de baja se conservan en la tabla
// con activo = 0 pero no se muestran). Además manda el contacto de la familia
// para que la vista pueda ofrecer "usar los datos de la familia" al dar de
// alta el primer tutor, sin otra petición.
//
// Entrada: cliente_id (JSON o ?cliente_id=).

require_once __DIR__ . '/../lib/helpers_expediente.php';

$rolExp = $usuario_actual['rol'] ?? '';
requerir_rol($rolExp, EXPEDIENTE_ROLES_LECTURA, 'No tienes permiso para ver los tutores de este alumno.');

$alumno = expediente_alumno($pdo, $usuario_actual,
    $input['cliente_id'] ?? $_GET['cliente_id'] ?? 0,
    EXPEDIENTE_ROLES_LECTURA, 'No tienes permiso para ver los tutores de este alumno.');

expediente_requerir_tabla($pdo, 'alumno_tutores');

$st = $pdo->prepare(
    "SELECT t.id, t.cliente_id, t.nombre, t.parentesco, t.email, t.telefono, t.telefono_alt,
            t.es_contacto_emergencia, t.autorizado_recoger, t.responsable_pago, t.vive_con_alumno,
            t.usuario_id, t.notas, t.creado_en, t.actualizado_en
     FROM alumno_tutores t
     WHERE t.cliente_id = ? AND t.escuela_id = ? AND t.activo = 1
     ORDER BY t.responsable_pago DESC, t.es_contacto_emergencia DESC, t.nombre"
);
$st->execute([$alumno['id'], $alumno['escuela_id']]);
$tutores = array_map('expediente_tutor_salida', $st->fetchAll());

// Contacto de la familia (misma escuela), solo como sugerencia para la vista.
$familia = null;
if ($alumno['familia_id']) {
    $sf = $pdo->prepare("SELECT id, nombre, contacto, email, telefono FROM familias WHERE id = ? AND escuela_id = ?");
    $sf->execute([$alumno['familia_id'], $alumno['escuela_id']]);
    $familia = $sf->fetch() ?: null;
    if ($familia) $familia['id'] = intval($familia['id']);
}

respond([
    'success'      => true,
    'tutores'      => $tutores,
    'familia'      => $familia,
    'parentescos'  => EXPEDIENTE_PARENTESCOS_TUTOR,
    'puede_editar' => expediente_puede_editar($usuario_actual),
]);
