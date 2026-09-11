<?php
// acciones/asignar_id_externo.php
//
// Asigna el ID externo que genera Savala a la cuenta admin de un colegio
// (usuarios.id_externo — se puede usar para iniciar sesión además del
// correo, ver acciones/login.php). Solo superadmin. No reemplaza el correo:
// se agrega como una llave adicional.

requerir_rol($usuario_actual['rol'] ?? '', ['superadmin'], 'Solo el super admin puede asignar el ID externo.');

$usuario_id = intval($input['usuario_id'] ?? 0);
$id_externo = trim($input['id_externo'] ?? '');

if (!$usuario_id) respond(['success' => false, 'error' => 'usuario_id requerido']);
if ($id_externo === '' || strlen($id_externo) > 32) {
    respond(['success' => false, 'error' => 'id_externo requerido (máximo 32 caracteres)']);
}

$stmt = $pdo->prepare("SELECT id, nombre, escuela_id FROM usuarios WHERE id = ?");
$stmt->execute([$usuario_id]);
$usr = $stmt->fetch();
if (!$usr) respond(['success' => false, 'error' => 'Usuario no encontrado']);

try {
    $pdo->prepare("UPDATE usuarios SET id_externo = ? WHERE id = ?")->execute([$id_externo, $usuario_id]);
} catch (\PDOException $e) {
    // Código 23000 = violación de índice único (id_externo ya está en uso).
    if ($e->getCode() === '23000') {
        respond(['success' => false, 'error' => 'Ese ID externo ya está asignado a otra cuenta.']);
    }
    respond(['success' => false, 'error' => 'No se pudo asignar el ID externo.']);
}

registrar_log($pdo, $usuario_actual, 'id_externo_asignado', "Usuario #$usuario_id ({$usr['nombre']}): id_externo = $id_externo", $usr['escuela_id']);

respond(['success' => true, 'id_externo' => $id_externo]);
