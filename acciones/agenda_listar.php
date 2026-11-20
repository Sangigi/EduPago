<?php
// agenda_listar — citas del colegio en un rango de fechas (OF-7c). Solo lectura.
//
// Entrada: desde, hasta (Y-m-d; por omisión la semana en curso; máx. 93 días),
//          responsable_id (filtro opcional), estado (filtro opcional),
//          escuela_id (solo superadmin).
// Quién ve qué:
//   admin, control_escolar, superadmin  todas las del colegio (y pueden gestionarlas);
//   direccion                           todas las del colegio, en lectura;
//   docente                             SOLO las suyas (responsable = él), en lectura;
//   familia                             SOLO las ligadas a su familia, en lectura, sin notas
//                                       internas ni datos del personal más allá del nombre.
// La escuela sale de la sesión (nunca del input salvo superadmin); toda consulta lleva
// `escuela_id = ?`, así un id de otro colegio responde igual que uno que no existe.
$rol_ag = $usuario_actual['rol'] ?? '';
$ctx = agenda_ctx($pdo, $usuario_actual, $input, ['superadmin', 'admin', 'control_escolar', 'direccion', 'docente', 'familia']);
$esc = $ctx['escuela_id'];

$desde = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($input['desde'] ?? '')) ? $input['desde'] : date('Y-m-d', strtotime('monday this week'));
$hasta = preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($input['hasta'] ?? '')) ? $input['hasta'] : date('Y-m-d', strtotime($desde . ' +6 days'));
if (strtotime($hasta) < strtotime($desde)) respond(['success' => false, 'error' => 'La fecha final es anterior a la inicial.']);
if ((strtotime($hasta) - strtotime($desde)) / 86400 > AGENDA_RANGO_MAX_DIAS) {
    respond(['success' => false, 'error' => 'El rango no puede pasar de ' . AGENDA_RANGO_MAX_DIAS . ' días.']);
}

$w = ['c.escuela_id = ?', 'c.inicio < ?', 'c.fin > ?'];
$p = [$esc, date('Y-m-d', strtotime($hasta . ' +1 day')) . ' 00:00:00', $desde . ' 00:00:00'];
if ($rol_ag === 'docente') {
    $w[] = 'c.responsable_id = ?'; $p[] = intval($usuario_actual['user_id'] ?? 0);
} elseif ($rol_ag === 'familia') {
    $fam = intval($usuario_actual['familia_id'] ?? 0);
    if ($fam <= 0) respond(['success' => true, 'citas' => [], 'responsables' => [], 'puede_gestionar' => false, 'rol' => $rol_ag, 'desde' => $desde, 'hasta' => $hasta]);
    $w[] = 'c.familia_id = ?'; $p[] = $fam;
} elseif (!empty($input['responsable_id'])) {
    $w[] = 'c.responsable_id = ?'; $p[] = intval($input['responsable_id']);
}
if (!empty($input['estado']) && isset(AGENDA_ESTADOS[(string) $input['estado']])) {
    $w[] = 'c.estado = ?'; $p[] = (string) $input['estado'];
}

$st = $pdo->prepare(
    "SELECT c.id, c.titulo, c.tipo, c.inicio, c.fin, c.responsable_id, u.nombre AS responsable_nombre,
            c.familia_id, f.nombre AS familia_nombre, c.cliente_id, cl.nombre AS cliente_nombre,
            c.lugar, c.notas, c.estado, c.creado_por, c.creado_en
       FROM citas c
       LEFT JOIN usuarios u  ON u.id  = c.responsable_id
       LEFT JOIN familias f  ON f.id  = c.familia_id
       LEFT JOIN clientes cl ON cl.id = c.cliente_id
      WHERE " . implode(' AND ', $w) . "
      ORDER BY c.inicio, c.id LIMIT 1000"
);
$st->execute($p);
$citas = $st->fetchAll(PDO::FETCH_ASSOC);
foreach ($citas as &$c) {
    foreach (['id', 'responsable_id', 'familia_id', 'cliente_id', 'creado_por'] as $k) $c[$k] = $c[$k] !== null ? intval($c[$k]) : null;
    if ($rol_ag === 'familia') {
        // La familia no ve notas internas ni el nombre del alumno de otra cita ajena a ella (ya filtradas por familia_id).
        unset($c['notas'], $c['creado_por'], $c['cliente_nombre']);
    }
}
unset($c);

$responsables = [];
if ($rol_ag !== 'familia') {
    $rs = $pdo->prepare(
        "SELECT id, nombre, rol FROM usuarios
          WHERE escuela_id = ? AND activo = 1 AND rol IN ('" . implode("','", AGENDA_ROLES_RESPONSABLE) . "')
          ORDER BY nombre LIMIT 500"
    );
    $rs->execute([$esc]);
    $responsables = $rs->fetchAll(PDO::FETCH_ASSOC);
    foreach ($responsables as &$r) $r['id'] = intval($r['id']);
    unset($r);
}

respond(['success' => true, 'citas' => $citas, 'responsables' => $responsables,
         'puede_gestionar' => $ctx['gestion'], 'rol' => $rol_ag,
         'tipos' => AGENDA_TIPOS, 'estados' => AGENDA_ESTADOS,
         'desde' => $desde, 'hasta' => $hasta]);
