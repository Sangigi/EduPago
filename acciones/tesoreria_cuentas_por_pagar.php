<?php
// acciones/tesoreria_cuentas_por_pagar.php
//
// Responde la pregunta que hoy no tenía dónde contestarse: "¿a quién le tengo
// que pagar este mes y qué día?".
//
// El módulo de Gastos (migracion_2026_09_09) nació como HISTORIAL: un renglón
// se capturaba cuando el dinero ya había salido. Por eso tenía `fecha`
// (cuándo ocurrió) y ninguna noción de vencimiento ni de pendiente. La
// migración del 22-sep agrega fecha_vencimiento/estado/fecha_pago a `gastos` y
// dia_pago_mes a `proveedores`, y esta acción es la que los lee.
//
// Devuelve DOS cosas distintas que juntas arman el calendario del mes:
//
//   1. `cuentas`   — gastos capturados con estado='pendiente'. Deuda concreta,
//                    con monto y vencimiento reales.
//   2. `recurrentes` — proveedores con dia_pago_mes que TODAVÍA no tienen un
//                    gasto capturado para el mes consultado. Son los que "les
//                    toca" pero que nadie ha capturado aún; sin esto, el
//                    calendario se vería vacío justo antes de cada pago
//                    recurrente, que es cuando más falta hace.
//
// Alcance: TODAS las escuelas. Es un rol de plataforma (el dueño del sistema),
// no de un colegio.

requerir_rol($usuario_actual['rol'] ?? '', ['superadmin', 'tesoreria'], 'No tienes permiso para ver las cuentas por pagar.');

// Mes consultado, formato YYYY-MM. Por omisión, el mes en curso.
$mes = trim($input['mes'] ?? '');
if (!preg_match('/^\d{4}-\d{2}$/', $mes)) $mes = date('Y-m');
$mes_inicio = $mes . '-01';
$mes_fin    = date('Y-m-t', strtotime($mes_inicio));

// Filtro opcional por escuela. 0 / vacío = todas.
$escuela_id_filtro = intval($input['escuela_id'] ?? 0);

// 'mes' (default) limita al mes consultado; 'todo' trae TODO lo pendiente,
// incluido lo vencido de meses anteriores — que es justamente lo que no se
// puede perder de vista.
$alcance = trim($input['alcance'] ?? 'mes');
if (!in_array($alcance, ['mes', 'todo'], true)) $alcance = 'mes';

try {
    $where  = "g.estado = 'pendiente'";
    $params = [];
    if ($alcance === 'mes') {
        // COALESCE: un gasto pendiente SIN vencimiento se agenda por su fecha
        // de captura. Si no, quedaría fuera de todo mes y nadie lo vería.
        $where .= " AND COALESCE(g.fecha_vencimiento, g.fecha) <= ?";
        $params[] = $mes_fin;
    }
    if ($escuela_id_filtro) { $where .= " AND g.escuela_id = ?"; $params[] = $escuela_id_filtro; }

    $stmt = $pdo->prepare(
        "SELECT g.id, g.escuela_id, g.proveedor_id, g.concepto, g.monto,
                g.fecha, g.fecha_vencimiento, g.estado, g.forma_pago,
                COALESCE(g.fecha_vencimiento, g.fecha) AS vence,
                DATEDIFF(COALESCE(g.fecha_vencimiento, g.fecha), CURDATE()) AS dias_para_vencer,
                p.nombre AS proveedor_nombre, p.dia_pago_mes,
                e.nombre AS escuela_nombre
           FROM gastos g
           LEFT JOIN proveedores p ON p.id = g.proveedor_id
           LEFT JOIN escuelas e    ON e.id = g.escuela_id
          WHERE $where
          ORDER BY vence ASC, g.id ASC"
    );
    $stmt->execute($params);
    $cuentas = $stmt->fetchAll();

    // Proveedores recurrentes sin gasto capturado para este mes.
    $whereProv = "p.activo = 1 AND p.dia_pago_mes IS NOT NULL";
    if ($escuela_id_filtro) $whereProv .= " AND p.escuela_id = ?";

    $stmtProv = $pdo->prepare(
        "SELECT p.id, p.escuela_id, p.nombre, p.dia_pago_mes, e.nombre AS escuela_nombre
           FROM proveedores p
           LEFT JOIN escuelas e ON e.id = p.escuela_id
          WHERE $whereProv
            AND NOT EXISTS (
                SELECT 1 FROM gastos g2
                 WHERE g2.proveedor_id = p.id
                   AND g2.estado <> 'cancelado'
                   AND COALESCE(g2.fecha_vencimiento, g2.fecha) BETWEEN ? AND ?
            )
          ORDER BY p.dia_pago_mes ASC, p.nombre ASC"
    );
    // El orden importa: PDO liga los ? por POSICIÓN, y en el SQL el filtro
    // opcional de escuela aparece ANTES del BETWEEN del NOT EXISTS. Armar el
    // arreglo en otro orden no da error de SQL — da resultados silenciosamente
    // equivocados, que es peor.
    $stmtProv->execute($escuela_id_filtro
        ? [$escuela_id_filtro, $mes_inicio, $mes_fin]
        : [$mes_inicio, $mes_fin]);
    $recurrentes = $stmtProv->fetchAll();
} catch (\PDOException $e) {
    respond(['success' => false,
             'error' => 'Falta correr migracion_2026_09_22_provision_y_cuentas_por_pagar.sql en la base de datos.',
             'detalle' => $e->getMessage()]);
}

$hoy = date('Y-m-d');
$total_pendiente = 0.0;
$total_vencido   = 0.0;
foreach ($cuentas as &$c) {
    $c['id']               = intval($c['id']);
    $c['escuela_id']       = intval($c['escuela_id']);
    $c['monto']            = round(floatval($c['monto']), 2);
    $c['dias_para_vencer'] = $c['dias_para_vencer'] !== null ? intval($c['dias_para_vencer']) : null;
    $c['vencido']          = $c['vence'] !== null && $c['vence'] < $hoy;
    $total_pendiente += $c['monto'];
    if ($c['vencido']) $total_vencido += $c['monto'];
}
unset($c);

foreach ($recurrentes as &$r) {
    $r['id']           = intval($r['id']);
    $r['escuela_id']   = intval($r['escuela_id']);
    $r['dia_pago_mes'] = intval($r['dia_pago_mes']);
    // La fecha en que toca este mes. Si el proveedor está configurado en 31 y
    // el mes tiene 30, se ancla al último día en vez de desbordarse al mes
    // siguiente (que es lo que haría construir la fecha a mano).
    $dia = min($r['dia_pago_mes'], intval(date('t', strtotime($mes_inicio))));
    $r['fecha_estimada'] = $mes . '-' . str_pad(strval($dia), 2, '0', STR_PAD_LEFT);
}
unset($r);

respond([
    'success'         => true,
    'mes'             => $mes,
    'alcance'         => $alcance,
    'cuentas'         => $cuentas,
    'recurrentes'     => $recurrentes,
    'total_pendiente' => round($total_pendiente, 2),
    'total_vencido'   => round($total_vencido, 2),
]);
