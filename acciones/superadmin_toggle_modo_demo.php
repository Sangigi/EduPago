<?php
// acciones/superadmin_toggle_modo_demo.php
//
// Activa/desactiva el modo demo de una escuela. En 'demo', ningún cobro real
// se manda a la pasarela de pagos ni se asigna una CLABE STP real (ver
// escuela_en_modo_demo()/responder_demo_si_aplica() en lib/helpers_pagos.php
// y los guards en generar_liga.php, generar_referencia_efectivo.php,
// iniciar_pago_agrupado.php, cobrar_via_token(), generar_clabe_individual.php,
// asignar_clabe_pool.php y asignar_clabe_pool_masivo.php).

// Mismas 4 secciones que cron_recordatorios.php (bloque 1.1) apaga/reactiva
// por falta de pago. Se repiten aquí (no se comparten como constante porque
// ese bloque vive en un archivo que corre por CLI) para poder reactivarlas
// explícitamente al entrar o salir de demo -- blindaje (11-sep-2026, hallado
// en revisión adversarial): antes ninguna de las dos ramas tocaba esta
// columna, así que una escuela con caja/cobros ya apagados por el cron (por
// una fecha_vencimiento_plan vencida) los seguía teniendo apagados aunque
// pasara a modo demo -- contradiciendo el propio mensaje de la UI ("puede
// usar todo el sistema").
function _reactivar_secciones_de_pago_demo($pdo, $escuela_id) {
    $SECCIONES_DE_PAGO = ['caja', 'corte_caja', 'cobros', 'recordatorios'];
    $stmt = $pdo->prepare("SELECT secciones_deshabilitadas FROM escuelas WHERE id = ?");
    $stmt->execute([$escuela_id]);
    $actuales = json_decode($stmt->fetchColumn() ?: '', true);
    if (!is_array($actuales)) return;
    $nuevas = array_values(array_diff($actuales, $SECCIONES_DE_PAGO));
    if ($nuevas !== $actuales) {
        $pdo->prepare("UPDATE escuelas SET secciones_deshabilitadas = ? WHERE id = ?")
            ->execute([json_encode($nuevas), $escuela_id]);
    }
}

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
    // Blindaje (11-sep-2026): antes esto solo tocaba modo/fecha_fin_prueba,
    // dejando fecha_vencimiento_plan en el placeholder de cuando se creó la
    // escuela (normalmente ya vencido) -- el cron la habría marcado como
    // "sin pagar" y apagado caja/cobros en la siguiente corrida, justo lo
    // opuesto a lo que "quitar demo" debería significar. Se le da el mismo
    // respiro que a una escuela recién creada (fin del mes actual): esto es
    // una acción manual del superadmin, no un pago real, así que no se le da
    // un mes completo de gracia como si hubiera pagado.
    $nuevoVencimiento = fin_de_mes_actual();
    $pdo->prepare("UPDATE escuelas SET modo = 'activa', fecha_fin_prueba = NULL, fecha_vencimiento_plan = ? WHERE id = ?")
        ->execute([$nuevoVencimiento, $id]);
    _reactivar_secciones_de_pago_demo($pdo, $id);
    registrar_log($pdo, $usuario_actual, 'escuela_demo_desactivada',
        "Escuela #$id: modo demo desactivado manualmente, vencimiento -> $nuevoVencimiento", $id);
    respond(['success' => true, 'modo' => 'activa', 'fecha_vencimiento_plan' => $nuevoVencimiento]);
}

// accion === 'activar'
if ($dias < 1) {
    $dias = dias_demo_default($pdo);
}
$fecha_fin = date('Y-m-d', strtotime("+{$dias} days"));
// ultimo_recordatorio_plan también se limpia aquí: si esta escuela ya había
// estado en demo antes y recibió el aviso de "vence en 3 días" de ese ciclo
// anterior, un ciclo nuevo (reactivado a mano) merece poder avisar otra vez.
$pdo->prepare("UPDATE escuelas SET modo = 'demo', fecha_fin_prueba = ?, ultimo_recordatorio_plan = NULL WHERE id = ?")->execute([$fecha_fin, $id]);
_reactivar_secciones_de_pago_demo($pdo, $id);
registrar_log($pdo, $usuario_actual, 'escuela_demo_activada', "Escuela #$id: modo demo activado, $dias días (vence $fecha_fin)", $id);
respond(['success' => true, 'modo' => 'demo', 'fecha_fin_prueba' => $fecha_fin, 'dias' => $dias]);
