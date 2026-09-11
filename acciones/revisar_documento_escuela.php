<?php
// acciones/revisar_documento_escuela.php
//
// Aprueba o rechaza un documento fiscal ya subido. Solo superadmin (o quien
// haga las veces de contador — hoy no existe ese rol, así que por ahora
// queda en superadmin). Recalcula escuelas.documentacion_estado a partir del
// estado real de TODOS los documentos de la escuela, no solo este.

requerir_rol($usuario_actual['rol'] ?? '', ['superadmin'], 'Solo el super admin puede revisar documentos.');

$documento_id = intval($input['documento_id'] ?? 0);
$accion       = trim($input['accion'] ?? ''); // 'aprobar' | 'rechazar'
$motivo       = trim($input['motivo'] ?? '');

if (!$documento_id) respond(['success' => false, 'error' => 'documento_id requerido']);
if (!in_array($accion, ['aprobar', 'rechazar'], true)) respond(['success' => false, 'error' => 'accion debe ser aprobar o rechazar']);
if ($accion === 'rechazar' && $motivo === '') respond(['success' => false, 'error' => 'Indica el motivo del rechazo.']);

$stmt = $pdo->prepare("SELECT escuela_id FROM escuela_documentos WHERE id = ?");
$stmt->execute([$documento_id]);
$doc = $stmt->fetch();
if (!$doc) respond(['success' => false, 'error' => 'Documento no encontrado']);
$escuela_id = intval($doc['escuela_id']);

$nuevoEstado = $accion === 'aprobar' ? 'aprobado' : 'rechazado';
$pdo->prepare(
    "UPDATE escuela_documentos SET estado = ?, motivo_rechazo = ?, revisado_por = ?, revisado_en = NOW() WHERE id = ?"
)->execute([$nuevoEstado, $accion === 'rechazar' ? mb_substr($motivo, 0, 300) : null, intval($usuario_actual['user_id'] ?? 0), $documento_id]);

// Recalcular el estado agregado de la escuela desde CERO (no solo este
// documento): si cualquiera quedó rechazado, la escuela está rechazada; si
// falta alguno por revisar, sigue en revisión; solo si TODOS están
// aprobados (y hay al menos uno) la escuela queda aprobada.
$stmtTodos = $pdo->prepare("SELECT estado FROM escuela_documentos WHERE escuela_id = ?");
$stmtTodos->execute([$escuela_id]);
$estados = array_column($stmtTodos->fetchAll(), 'estado');
if (in_array('rechazado', $estados, true)) {
    $agregado = 'rechazada';
} elseif (in_array('pendiente', $estados, true)) {
    $agregado = 'en_revision';
} elseif (count($estados) > 0) {
    $agregado = 'aprobada';
} else {
    $agregado = 'sin_enviar';
}
$pdo->prepare("UPDATE escuelas SET documentacion_estado = ? WHERE id = ?")->execute([$agregado, $escuela_id]);

registrar_log($pdo, $usuario_actual, 'documento_escuela_revisado',
    "Escuela #$escuela_id: documento #$documento_id $nuevoEstado" . ($motivo ? " ($motivo)" : '') . " -> documentacion_estado=$agregado",
    $escuela_id);

respond(['success' => true, 'estado' => $nuevoEstado, 'documentacion_estado' => $agregado]);
