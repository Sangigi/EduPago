<?php
// acciones/importar_saldos_listar.php — [OF-5] Historial de importaciones de adeudos.
//
// Solo lectura. Devuelve las últimas 100 importaciones del colegio con quién y
// cuándo, cuántos cobros y por cuánto, su estado y si SE PUEDEN DESHACER hoy
// (ninguno de sus cobros ha recibido pagos). Con `importacion_id` devuelve además
// el detalle (hasta 500 cobros) con el estado y lo pagado de cada uno.
//
// Entrada (JSON): escuela_id (solo superadmin), importacion_id (opcional).
// Roles: admin y superadmin.

require_once __DIR__ . '/../lib/helpers_importar_saldos.php';

// El rol se exige aquí mismo (y otra vez dentro del helper, que además valida la escuela y la sección).
requerir_rol($usuario_actual['rol'] ?? '', ['superadmin', 'admin'], 'No tienes permiso para ver las importaciones de adeudos.');
$escuela_id = importar_contexto_o_responder($pdo, $usuario_actual, $input['escuela_id'] ?? 0, 'No tienes permiso para ver las importaciones de adeudos.');

if (!importar_tablas_listas($pdo)) {
    respond(['success' => true, 'falta_migracion' => true, 'aviso' => IMPORTAR_AVISO_MIGRACION, 'importaciones' => []]);
}

$st = $pdo->prepare(
    "SELECT i.id, i.archivo_nombre, i.usuario_id, i.creado_en, i.filas_total, i.cobros_creados, i.filas_omitidas, i.monto_total,
            i.estado, i.deshecha_en, u.nombre AS usuario_nombre, ud.nombre AS deshecha_por_nombre
       FROM importaciones_saldos i
       LEFT JOIN usuarios u  ON u.id  = i.usuario_id
       LEFT JOIN usuarios ud ON ud.id = i.deshecha_por
      WHERE i.escuela_id = ?
      ORDER BY i.id DESC
      LIMIT 100"
);
$st->execute([$escuela_id]);
$imps = $st->fetchAll(PDO::FETCH_ASSOC);

// Cuántos cobros de cada importación ya NO se pueden cancelar sin pérdida
// (recibieron pagos, o dejaron de estar pendientes). Una sola consulta.
$bloq = [];
if ($imps) {
    $ids = array_map(function ($i) { return intval($i['id']); }, $imps);
    $q = implode(',', array_fill(0, count($ids), '?'));
    $sb = $pdo->prepare(
        "SELECT f.importacion_id,
                SUM(CASE WHEN c.monto_pagado > 0 THEN 1 ELSE 0 END) AS con_pagos,
                SUM(CASE WHEN c.monto_pagado <= 0 AND c.estado NOT IN ('pendiente', 'cancelado') THEN 1 ELSE 0 END) AS no_pendientes
           FROM importaciones_saldos_filas f
           JOIN cobros c ON c.id = f.cobro_id
          WHERE f.escuela_id = ? AND f.deshecha = 0 AND f.importacion_id IN ($q)
          GROUP BY f.importacion_id"
    );
    $sb->execute(array_merge([$escuela_id], $ids));
    foreach ($sb->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $bloq[intval($r['importacion_id'])] = intval($r['con_pagos']) + intval($r['no_pendientes']);
    }
}
$out = [];
foreach ($imps as $i) {
    $n_bloq = $bloq[intval($i['id'])] ?? 0;
    $out[] = [
        'id' => intval($i['id']), 'archivo_nombre' => $i['archivo_nombre'], 'creado_en' => $i['creado_en'],
        'usuario' => $i['usuario_nombre'], 'filas_total' => intval($i['filas_total']),
        'cobros_creados' => intval($i['cobros_creados']), 'omitidas' => intval($i['filas_omitidas']),
        'monto_total' => floatval($i['monto_total']), 'estado' => $i['estado'],
        'deshecha_en' => $i['deshecha_en'], 'deshecha_por' => $i['deshecha_por_nombre'],
        'cobros_con_pagos' => $n_bloq,
        'puede_deshacer' => $i['estado'] === 'aplicada' && $n_bloq === 0 && intval($i['cobros_creados']) > 0,
    ];
}

$resp = ['success' => true, 'importaciones' => $out];

$det_id = intval($input['importacion_id'] ?? 0);
if ($det_id > 0) {
    $sd = $pdo->prepare(
        "SELECT f.fila_archivo, f.cobro_id, f.cliente_id, f.concepto, f.monto_original, f.abonado, f.pendiente, f.fecha_emision,
                f.fecha_vence, f.folio_externo, f.nota, f.deshecha,
                c.folio, c.estado AS cobro_estado, c.monto_pagado, cl.nombre AS alumno
           FROM importaciones_saldos_filas f
           LEFT JOIN cobros c ON c.id = f.cobro_id
           LEFT JOIN clientes cl ON cl.id = f.cliente_id
          WHERE f.importacion_id = ? AND f.escuela_id = ?
          ORDER BY f.id
          LIMIT 500"
    );
    $sd->execute([$det_id, $escuela_id]);
    $resp['detalle'] = array_map(function ($r) {
        return [
            'fila' => $r['fila_archivo'], 'cobro_id' => intval($r['cobro_id']), 'folio' => $r['folio'], 'alumno' => $r['alumno'],
            'concepto' => $r['concepto'], 'monto_original' => floatval($r['monto_original']), 'abonado' => floatval($r['abonado']),
            'pendiente' => floatval($r['pendiente']), 'fecha_emision' => $r['fecha_emision'], 'vence' => $r['fecha_vence'],
            'folio_externo' => $r['folio_externo'], 'nota' => $r['nota'], 'deshecha' => (bool) intval($r['deshecha']),
            'cobro_estado' => $r['cobro_estado'], 'pagado' => floatval($r['monto_pagado']),
        ];
    }, $sd->fetchAll(PDO::FETCH_ASSOC));
    $resp['detalle_id'] = $det_id;
}
respond($resp);
