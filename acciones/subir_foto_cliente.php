<?php
// acciones/subir_foto_cliente.php
// Sube la foto de un alumno como ARCHIVO real. multipart/form-data, NO JSON
// — $input de api.php viene vacío en este tipo de petición, por eso se lee
// $_POST/$_FILES directo (mismo patrón que usa subir_comprobante_gasto.php).

$rol_actual = $usuario_actual['rol'] ?? '';
// El cajero no edita alumnos (mismo criterio que editar_cliente.php).
requerir_rol($rol_actual, ['superadmin', 'admin', 'familia'],
    'No tienes permiso para cambiar la foto de este alumno.');

$id = intval($_POST['id'] ?? 0);
if (!$id) respond(['success' => false, 'error' => 'id requerido']);

$chk = $pdo->prepare("SELECT familia_id, escuela_id, foto_url FROM clientes WHERE id = ?");
$chk->execute([$id]);
$cliente = $chk->fetch();
if (!$cliente) respond(['success' => false, 'error' => 'Alumno no encontrado']);

if ($rol_actual === 'familia') {
    requerir_familia_propia($cliente['familia_id'], $usuario_actual, 'No puedes cambiar la foto de este alumno.');
} else {
    requerir_escuela_propia($rol_actual, $cliente['escuela_id'], $usuario_actual, 'No tienes permiso para cambiar la foto de este alumno.');
}

if (empty($_FILES['foto'])) respond(['success' => false, 'error' => 'No se recibió ninguna foto.']);

$resultado = guardar_archivo_subido($_FILES['foto'], 'fotos_clientes', UPLOADS_EXT_FOTO, UPLOADS_MAX_BYTES_FOTO);
if (!$resultado['ok']) respond(['success' => false, 'error' => $resultado['error']]);

$stmt = $pdo->prepare("UPDATE clientes SET foto_url = ? WHERE id = ?");
$stmt->execute([$resultado['ruta_relativa'], $id]);

// Limpieza best-effort del archivo anterior SOLO si era una subida local
// nuestra — nunca si era un enlace externo (Drive, etc.), ahí no hay nada
// que borrar en nuestro servidor.
if (!empty($cliente['foto_url']) && strpos($cliente['foto_url'], 'uploads/') === 0) {
    $rutaVieja = UPLOADS_DIR_ABS . '/' . substr($cliente['foto_url'], strlen('uploads/'));
    if (is_file($rutaVieja)) @unlink($rutaVieja);
}

registrar_log($pdo, $usuario_actual, 'foto_cliente_subida', "Foto actualizada para alumno #{$id}", $cliente['escuela_id']);

respond(['success' => true, 'foto_url' => $resultado['ruta_relativa']]);
