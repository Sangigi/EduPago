<?php
// acciones/comisiones_estado_cuenta.php
//
// Contesta literalmente la pregunta que antes no se podía contestar:
// "¿cuánto le debo a este distribuidor por el mes X?"
//
// Separa DEVENGADO (lo que se ganó) de PAGADO (lo que ya se liquidó), que es
// la distinción que no existía en ninguna parte del sistema.
//
// Un mes cerrado se lee del libro, con el porcentaje congelado de cada
// renglón. El mes en curso se calcula en vivo y se marca como preliminar —
// todavía puede entrar dinero.

requerir_rol($usuario_actual['rol'] ?? '', ['superadmin', 'tesoreria'],
             'No tienes permiso para ver el estado de cuenta de comisiones.');

$periodoEC = trim($input['periodo'] ?? $_GET['periodo'] ?? '');
if ($periodoEC === '') $periodoEC = date('Y-m');
if (!preg_match('/^\d{4}-\d{2}$/', $periodoEC)) {
    respond(['success' => false, 'error' => 'Periodo inválido (formato YYYY-MM).']);
}
$distEC = intval($input['distribuidor_id'] ?? $_GET['distribuidor_id'] ?? 0) ?: null;

try {
    $ceStmt = $pdo->prepare("SELECT * FROM comision_cierres WHERE periodo = ?");
    $ceStmt->execute([$periodoEC]);
    $cierre = $ceStmt->fetch();
} catch (\PDOException $e) {
    respond(['success' => false,
             'error' => 'Falta correr migracion_2026_09_24_comisiones_devengo.sql en este servidor.']);
}

$renglones = [];

if ($cierre) {
    // Mes CERRADO: se lee tal cual quedó. No se recalcula nada — recalcular
    // sería justo la puerta trasera por la que el histórico se movía.
    $sql = "SELECT d.*, u.nombre AS distribuidor_nombre
              FROM comision_devengos d
              LEFT JOIN usuarios u ON u.id = d.distribuidor_id
             WHERE COALESCE(d.periodo_ajustado, d.periodo) = ?";
    $par = [$periodoEC];
    if ($distEC) { $sql .= " AND d.distribuidor_id = ?"; $par[] = $distEC; }
    $sql .= " ORDER BY u.nombre, d.nombre_colegio, d.dias_desde";
    $st = $pdo->prepare($sql);
    $st->execute($par);
    foreach ($st->fetchAll() as $d) {
        $renglones[] = [
            'distribuidor_id'   => intval($d['distribuidor_id']),
            'distribuidor'      => $d['distribuidor_nombre'],
            'colegio'           => $d['nombre_colegio'],
            'tipo'              => $d['tipo'],
            'comision_pct'      => floatval($d['comision_pct']),
            'dias_desde'        => $d['dias_desde'],
            'dias_hasta'        => $d['dias_hasta'],
            'base_cobrada'      => floatval($d['base_cobrada']),
            'devengado'         => floatval($d['comision']),
            'pagado'            => floatval($d['monto_liquidado']),
            'por_pagar'         => round(floatval($d['comision']) - floatval($d['monto_liquidado']), 2),
            'devengo_id'        => intval($d['id']),
            'base_regla'        => $d['base_regla'],
        ];
    }
} else {
    // Mes ABIERTO (o uno viejo que nunca se cerró): se calcula en vivo con la
    // misma función que usa el cierre. Sin devengo_id, porque todavía no hay
    // renglón: no se le puede aplicar un pago a algo que no está congelado.
    $vivoEC = comision_calcular_periodo($pdo, $periodoEC, $distEC);
    $nombres = [];
    foreach ($pdo->query("SELECT id, nombre FROM usuarios WHERE rol = 'distribuidor'")->fetchAll() as $u) {
        $nombres[intval($u['id'])] = $u['nombre'];
    }
    foreach ($vivoEC as $v) {
        $renglones[] = [
            'distribuidor_id'   => $v['distribuidor_id'],
            'distribuidor'      => $nombres[$v['distribuidor_id']] ?? null,
            'colegio'           => $v['nombre_colegio'],
            'tipo'              => 'preliminar',
            'comision_pct'      => $v['comision_pct'],
            'dias_desde'        => $v['dias_desde'],
            'dias_hasta'        => $v['dias_hasta'],
            'base_cobrada'      => $v['base_cobrada'],
            'devengado'         => $v['comision'],
            'pagado'            => 0.0,
            'por_pagar'         => $v['comision'],
            'devengo_id'        => null,
            'base_regla'        => $v['base_regla'],
        ];
    }
}

$totDev = 0.0; $totPag = 0.0;
foreach ($renglones as $r) { $totDev += $r['devengado']; $totPag += $r['pagado']; }

respond([
    'success'   => true,
    'periodo'   => $periodoEC,
    // cerrado=false significa que el número todavía se puede mover. Es la
    // diferencia entre "esto es lo que le debo" y "esto es lo que va".
    'cerrado'   => (bool) $cierre,
    'cerrado_en'=> $cierre['cerrado_en'] ?? null,
    'renglones' => $renglones,
    'totales'   => [
        'devengado' => round($totDev, 2),
        'pagado'    => round($totPag, 2),
        'por_pagar' => round($totDev - $totPag, 2),
    ],
]);
