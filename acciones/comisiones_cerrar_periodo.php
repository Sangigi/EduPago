<?php
// acciones/comisiones_cerrar_periodo.php
//
// Cierra un mes a mano, sin esperar al cron. Sirve para dos cosas: pagarle al
// distribuidor antes del día 3, y ponerse al corriente si el cron estuvo caído.
//
// Llama a la MISMA función que el cron (comision_cerrar_periodo), así que no
// puede producir un resultado distinto. Y es idempotente: si el mes ya estaba
// cerrado, no escribe nada y lo dice.
//
// Ver lib/helpers_comisiones.php y migracion_2026_09_24_comisiones_devengo.sql.

requerir_rol($usuario_actual['rol'] ?? '', ['superadmin'], 'Solo el super admin puede cerrar periodos de comisión.');

$periodoCerrar = trim($input['periodo'] ?? '');
if (!preg_match('/^\d{4}-\d{2}$/', $periodoCerrar)) {
    respond(['success' => false, 'error' => 'Indica el periodo en formato YYYY-MM.']);
}

// El guard duro vive en comision_cerrar_periodo(); esto solo da un mensaje
// más claro antes de llegar ahí.
if ($periodoCerrar >= date('Y-m')) {
    respond(['success' => false,
             'error' => 'Ese mes todavía no termina. Solo se pueden cerrar meses ya vencidos, porque hasta el último día puede entrar dinero.']);
}

try {
    $resCierre = comision_cerrar_periodo(
        $pdo, $periodoCerrar,
        intval($usuario_actual['user_id'] ?? 0) ?: null,
        'cierre_manual'
    );
} catch (\PDOException $e) {
    respond(['success' => false,
             'error' => 'Falta correr migracion_2026_09_24_comisiones_devengo.sql en este servidor.']);
}

if (!$resCierre['ok']) respond(['success' => false, 'error' => $resCierre['error']]);

if (!empty($resCierre['ya_estaba'])) {
    respond(['success' => true, 'ya_estaba' => true,
             'mensaje' => "El mes $periodoCerrar ya estaba cerrado. No se cambió nada."]);
}

registrar_log($pdo, $usuario_actual, 'comisiones_periodo_cerrado',
    "Periodo $periodoCerrar cerrado: {$resCierre['renglones']} renglón(es), total devengado $" . number_format($resCierre['total'], 2));

respond([
    'success'    => true,
    'periodo'    => $periodoCerrar,
    'renglones'  => $resCierre['renglones'],
    'total'      => $resCierre['total'],
    'mensaje'    => "Mes $periodoCerrar cerrado. A partir de ahora esos montos no cambian aunque edites el porcentaje.",
]);
