<?php
// acciones/escuela_set_contrato_estado.php
//
// El superadmin o provision marcan a mano el estatus del contrato de una escuela:
// sin_enviar -> enviado -> firmado. Sin proveedor de firma de por medio.
// Guarda la fecha de envío / firma la primera vez que se llega a ese estado.

requerir_rol($usuario_actual['rol'] ?? '', ['superadmin', 'provision'], 'No tienes permiso para cambiar el estatus del contrato.');

$id = intval($input['id'] ?? 0);
$estado = trim($input['estado'] ?? '');
if (!$id) respond(['success' => false, 'error' => 'id requerido']);
if (!in_array($estado, ['sin_enviar', 'enviado', 'firmado'], true)) {
    respond(['success' => false, 'error' => 'Estatus inválido']);
}

$st = $pdo->prepare("SELECT id FROM escuelas WHERE id = ?");
$st->execute([$id]);
if (!$st->fetch()) respond(['success' => false, 'error' => 'Colegio no encontrado']);

$pdo->prepare(
    "UPDATE escuelas SET contrato_estado = ?,
        contrato_fecha_envio = CASE WHEN ? = 'enviado' AND contrato_fecha_envio IS NULL THEN CURDATE() ELSE contrato_fecha_envio END,
        contrato_fecha_firma = CASE WHEN ? = 'firmado' THEN CURDATE() ELSE NULL END
     WHERE id = ?"
)->execute([$estado, $estado, $estado, $id]);

registrar_log($pdo, $usuario_actual, 'contrato_estado', "Colegio #$id: contrato -> $estado", $id);

$st = $pdo->prepare("SELECT contrato_estado, contrato_fecha_envio, contrato_fecha_firma FROM escuelas WHERE id = ?");
$st->execute([$id]);
respond(['success' => true, 'escuela' => $st->fetch()]);
