<?php
// acciones/escuela_obtener_datos_pago.php
//
// Devuelve los datos de alta de comercio (Cobroscontarjeta.com) de una
// escuela: titular, representante legal, empresa, identificación y datos
// BANCARIOS. A propósito NO viaja por cargar_datos.php (que hace SELECT *
// de escuelas y se lo manda a todos los roles del colegio) -- este endpoint
// aparte solo lo puede pedir el admin de su propia escuela o el superadmin.

$rol = $usuario_actual['rol'] ?? '';
requerir_rol($rol, ['admin', 'superadmin'], 'No tienes permiso para ver estos datos.');

$escuela_id = intval($input['escuela_id'] ?? ($usuario_actual['escuela_id'] ?? 0));
if (!$escuela_id) respond(['success' => false, 'error' => 'escuela_id requerido']);
requerir_escuela_propia($rol, $escuela_id, $usuario_actual, 'No tienes permiso sobre esta escuela.');

$stmt = $pdo->prepare("SELECT * FROM escuela_datos_pago WHERE escuela_id = ?");
$stmt->execute([$escuela_id]);
$datos = $stmt->fetch();

respond(['success' => true, 'datos_pago' => $datos ?: null]);
