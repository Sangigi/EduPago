<?php
// monedero_reporte — saldos y movimientos del monedero del colegio (F6).
//
// Solo admin y superadmin. Devuelve:
//   · saldos        alumnos con saldo distinto de cero (nombre, grado, matrícula, saldo)
//   · total_saldos  su suma = PASIVO del colegio: dinero de las familias que el
//                   colegio custodia y debe poder devolver o servir en la tiendita.
//                   No es ingreso del colegio.
//   · cuadra        compara la suma de saldos cacheados contra el libro mayor
//                   (invariante 1); si no cuadra, alguien tocó la tabla a mano.
//   · totales       recargas, consumos, reversos y ajustes del rango [desde, hasta]
//   · por_dia       consumo neto de la tiendita por día
$ctx = monedero_ctx($pdo, $usuario_actual, $input, ['admin', 'superadmin']);

$valida = function ($f) {
    $f = trim(strval($f ?? ''));
    $d = DateTime::createFromFormat('Y-m-d', $f);
    return ($d && $d->format('Y-m-d') === $f) ? $f : null;
};
$hasta = $valida($input['hasta'] ?? null) ?: date('Y-m-d');
$desde = $valida($input['desde'] ?? null) ?: date('Y-m-01');
if ($desde > $hasta) { $tmp = $desde; $desde = $hasta; $hasta = $tmp; }

try {
    // Saldos por alumno (con saldo ≠ 0). Se incluyen alumnos dados de baja con
    // saldo: ese dinero sigue siendo de la familia y hay que devolverlo.
    $st = $pdo->prepare(
        "SELECT cl.id, cl.nombre, cl.grado, cl.matricula, cl.activo, m.saldo
           FROM monederos m JOIN clientes cl ON cl.id = m.cliente_id
          WHERE m.escuela_id = ? AND m.saldo <> 0
          ORDER BY cl.nombre LIMIT 3000"
    );
    $st->execute([$ctx['escuela_id']]);
    $saldos = array_map(function ($r) {
        return [
            'cliente_id' => intval($r['id']), 'nombre' => $r['nombre'], 'grado' => $r['grado'],
            'matricula' => $r['matricula'], 'activo' => (bool) intval($r['activo']),
            'saldo' => round(floatval($r['saldo']), 2),
        ];
    }, $st->fetchAll());

    $st = $pdo->prepare("SELECT COALESCE(SUM(saldo), 0) FROM monederos WHERE escuela_id = ?");
    $st->execute([$ctx['escuela_id']]);
    $total_c = monedero_c($st->fetchColumn());
    $st = $pdo->prepare("SELECT COALESCE(SUM(signo * monto), 0) FROM monedero_movimientos WHERE escuela_id = ?");
    $st->execute([$ctx['escuela_id']]);
    $libro_c = monedero_c($st->fetchColumn());

    // Totales del rango, por tipo y dirección.
    $st = $pdo->prepare(
        "SELECT tipo, signo, COALESCE(SUM(monto), 0) AS suma, COUNT(*) AS n
           FROM monedero_movimientos
          WHERE escuela_id = ? AND creado_en >= ? AND creado_en < DATE_ADD(?, INTERVAL 1 DAY)
          GROUP BY tipo, signo"
    );
    $st->execute([$ctx['escuela_id'], $desde, $hasta]);
    $tot = [
        'recargas' => ['n' => 0, 'monto' => 0.0], 'consumos' => ['n' => 0, 'monto' => 0.0],
        'reversos' => ['n' => 0, 'monto' => 0.0],
        'ajustes_suma' => ['n' => 0, 'monto' => 0.0], 'ajustes_resta' => ['n' => 0, 'monto' => 0.0],
    ];
    foreach ($st->fetchAll() as $r) {
        $clave = null;
        if ($r['tipo'] === 'recarga') $clave = 'recargas';
        elseif ($r['tipo'] === 'consumo') $clave = 'consumos';
        elseif ($r['tipo'] === 'reverso') $clave = 'reversos';
        elseif ($r['tipo'] === 'ajuste') $clave = intval($r['signo']) > 0 ? 'ajustes_suma' : 'ajustes_resta';
        if ($clave) {
            $tot[$clave]['n'] += intval($r['n']);
            $tot[$clave]['monto'] = round($tot[$clave]['monto'] + floatval($r['suma']), 2);
        }
    }

    // Consumo por día: compras menos devoluciones.
    $st = $pdo->prepare(
        "SELECT DATE(creado_en) AS dia,
                COALESCE(SUM(CASE WHEN tipo = 'consumo' THEN monto ELSE 0 END), 0) AS consumos,
                COALESCE(SUM(CASE WHEN tipo = 'reverso' THEN monto ELSE 0 END), 0) AS reversos
           FROM monedero_movimientos
          WHERE escuela_id = ? AND tipo IN ('consumo', 'reverso')
            AND creado_en >= ? AND creado_en < DATE_ADD(?, INTERVAL 1 DAY)
          GROUP BY DATE(creado_en) ORDER BY dia"
    );
    $st->execute([$ctx['escuela_id'], $desde, $hasta]);
    $por_dia = array_map(function ($r) {
        $c = round(floatval($r['consumos']), 2); $v = round(floatval($r['reversos']), 2);
        return ['fecha' => $r['dia'], 'consumos' => $c, 'reversos' => $v, 'neto' => round($c - $v, 2)];
    }, $st->fetchAll());

    respond([
        'success' => true, 'habilitado' => monedero_activo($pdo, $ctx['escuela_id']),
        'desde' => $desde, 'hasta' => $hasta,
        'saldos' => $saldos, 'total_saldos' => monedero_p($total_c),
        'cuadra' => $total_c === $libro_c, 'total_libro' => monedero_p($libro_c),
        'totales' => $tot, 'por_dia' => $por_dia,
    ]);
} catch (\Throwable $e) {
    monedero_fallo($e, 'monedero_reporte');
}
