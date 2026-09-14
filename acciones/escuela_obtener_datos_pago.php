<?php
// acciones/escuela_obtener_datos_pago.php
//
// Devuelve los datos de alta de comercio (Cobroscontarjeta.com) de una
// escuela: titular, representante legal, empresa, identificación y datos
// BANCARIOS. A propósito NO viaja por cargar_datos.php (que hace SELECT *
// de escuelas y se lo manda a todos los roles del colegio) -- este endpoint
// aparte solo lo puede pedir el admin de su propia escuela, el superadmin,
// o contador (revisa, pero no edita -- ver escuela_guardar_datos_pago.php,
// que a propósito NO incluye 'contador').

$rol = $usuario_actual['rol'] ?? '';
requerir_rol($rol, ['admin', 'superadmin', 'contador'], 'No tienes permiso para ver estos datos.');

$escuela_id = intval($input['escuela_id'] ?? ($usuario_actual['escuela_id'] ?? 0));
if (!$escuela_id) respond(['success' => false, 'error' => 'escuela_id requerido']);
// Bypass local para 'contador' (revisa cualquier escuela) -- ver nota en
// listar_documentos_escuela.php.
if ($rol !== 'contador') {
    requerir_escuela_propia($rol, $escuela_id, $usuario_actual, 'No tienes permiso sobre esta escuela.');
}

$stmt = $pdo->prepare("SELECT * FROM escuela_datos_pago WHERE escuela_id = ?");
$stmt->execute([$escuela_id]);
$datos = $stmt->fetch();

// Blindaje: rfc y cp_fiscal se GUARDAN en escuelas (no duplicados aquí,
// escuela_guardar_datos_pago.php ya los enruta ahí), pero este SELECT nunca
// los devolvía de vuelta -- el formulario los guardaba bien, pero al
// recargar la pantalla el campo se veía vacío porque nada los traía de
// vuelta desde escuelas. Se mezclan aquí para que MiCuenta.js los pueda
// prellenar igual que el resto de los campos de esta misma tabla.
$stmtRfcCp = $pdo->prepare("SELECT rfc, cp_fiscal FROM escuelas WHERE id = ?");
$stmtRfcCp->execute([$escuela_id]);
$rfcCp = $stmtRfcCp->fetch();
if ($rfcCp) {
    if (!$datos) $datos = [];
    $datos['rfc'] = $rfcCp['rfc'];
    $datos['cp'] = $rfcCp['cp_fiscal'];
}

// El admin de la escuela va en la misma respuesta -- para 'contador', es
// justo a quien se le asigna el ID externo de Savala al terminar la
// revisión (ver asignar_id_externo.php). Evita un endpoint aparte solo para
// esto.
$stmtAdmin = $pdo->prepare("SELECT id, nombre, email, id_externo FROM usuarios WHERE escuela_id = ? AND rol = 'admin' AND activo = 1 ORDER BY id ASC LIMIT 1");
$stmtAdmin->execute([$escuela_id]);
$admin = $stmtAdmin->fetch();

respond(['success' => true, 'datos_pago' => $datos ?: null, 'admin' => $admin ?: null]);
