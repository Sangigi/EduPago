<?php
// acciones/superadmin_toggle_modo_demo.php
//
// Activa/desactiva el modo demo de una escuela. En 'demo', ningún cobro real
// se manda a la pasarela de pagos ni se asigna una CLABE STP real (ver
// escuela_en_modo_demo()/responder_demo_si_aplica() en lib/helpers_pagos.php
// y los guards en generar_liga.php, generar_referencia_efectivo.php,
// iniciar_pago_agrupado.php, cobrar_via_token(), generar_clabe_individual.php,
// asignar_clabe_pool.php y asignar_clabe_pool_masivo.php).

requerir_rol($usuario_actual['rol'] ?? '', ['superadmin'], 'Solo el super admin puede activar/desactivar el modo demo.');

$id     = intval($input['id'] ?? 0);
$accion = trim($input['accion'] ?? ''); // 'activar' | 'desactivar'
$dias   = intval($input['dias'] ?? 0);

if (!$id) respond(['success' => false, 'error' => 'id requerido']);
if (!in_array($accion, ['activar', 'desactivar'], true)) {
    respond(['success' => false, 'error' => 'accion debe ser activar o desactivar']);
}

$stmt = $pdo->prepare("SELECT id, modo FROM escuelas WHERE id = ?");
$stmt->execute([$id]);
$escuela = $stmt->fetch();
if (!$escuela) respond(['success' => false, 'error' => 'Escuela no encontrada']);

if ($accion === 'desactivar') {
    $pdo->prepare("UPDATE escuelas SET modo = 'activa', fecha_fin_prueba = NULL WHERE id = ?")->execute([$id]);
    registrar_log($pdo, $usuario_actual, 'escuela_demo_desactivada', "Escuela #$id: modo demo desactivado manualmente", $id);
    respond(['success' => true, 'modo' => 'activa']);
}

// accion === 'activar'
if ($dias < 1) {
    $dias = dias_demo_default($pdo);
}
$fecha_fin = date('Y-m-d', strtotime("+{$dias} days"));
$pdo->prepare("UPDATE escuelas SET modo = 'demo', fecha_fin_prueba = ? WHERE id = ?")->execute([$fecha_fin, $id]);
registrar_log($pdo, $usuario_actual, 'escuela_demo_activada', "Escuela #$id: modo demo activado, $dias días (vence $fecha_fin)", $id);
respond(['success' => true, 'modo' => 'demo', 'fecha_fin_prueba' => $fecha_fin, 'dias' => $dias]);
