<?php
// acciones/escuela_editar_propia.php
//
// Antes, editar_escuela.php era la ÚNICA vía para tocar los datos de una
// escuela, y es solo-superadmin -- un admin de colegio no tenía ninguna
// pantalla para editar los datos fiscales de SU PROPIA cuenta. Esta acción
// cubre justo eso: solo los campos fiscales (persona física/moral, razón
// social, régimen, CP fiscal), no lo que ya administra el superadmin
// (nombre, clave, plan, etc.).

requerir_rol($usuario_actual['rol'] ?? '', ['admin', 'superadmin'], 'No tienes permiso para editar estos datos.');

$escuela_id = intval($input['escuela_id'] ?? ($usuario_actual['escuela_id'] ?? 0));
if (!$escuela_id) respond(['success' => false, 'error' => 'escuela_id requerido']);
requerir_escuela_propia($usuario_actual['rol'] ?? '', $escuela_id, $usuario_actual, 'No tienes permiso sobre esta escuela.');

$tipo_persona   = trim($input['tipo_persona']   ?? '');
$razon_social   = trim($input['razon_social']   ?? '');
$regimen_fiscal = trim($input['regimen_fiscal'] ?? '');
$cp_fiscal      = trim($input['cp_fiscal']      ?? '');

if ($tipo_persona !== '' && !in_array($tipo_persona, ['fisica', 'moral'], true)) {
    respond(['success' => false, 'error' => 'tipo_persona debe ser fisica o moral']);
}
if ($cp_fiscal !== '' && !preg_match('/^\d{5}$/', $cp_fiscal)) {
    respond(['success' => false, 'error' => 'El código postal debe tener 5 dígitos']);
}

$pdo->prepare(
    "UPDATE escuelas SET tipo_persona = ?, razon_social = ?, regimen_fiscal = ?, cp_fiscal = ? WHERE id = ?"
)->execute([
    $tipo_persona ?: null, $razon_social !== '' ? mb_substr($razon_social, 0, 200) : null,
    $regimen_fiscal ?: null, $cp_fiscal ?: null, $escuela_id,
]);

registrar_log($pdo, $usuario_actual, 'escuela_fiscal_editada', "Escuela #$escuela_id: datos fiscales actualizados", $escuela_id);

respond(['success' => true]);
