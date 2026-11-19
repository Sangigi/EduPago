<?php
// tienda_buscar_alumno {q} — el vendedor localiza al alumno por matrícula o nombre (F6).
//
// Roles: tienda y admin. Solo alumnos ACTIVOS de la escuela de la sesión, máx. 20.
// Devuelve ÚNICAMENTE lo que la caja de la tiendita necesita: nada de datos
// financieros de la familia (adeudos, CLABE, tarjeta, RFC) ni médicos ni de contacto.
// Es una lectura: el vendedor ve el saldo aunque el módulo esté apagado (para
// poder explicar por qué no puede cobrar), y `monedero_activo` viaja aparte.
$ctx = monedero_ctx($pdo, $usuario_actual, $input, ['tienda', 'admin']);

$q = trim(strval($input['q'] ?? ''));
if (mb_strlen($q) < 2) {
    respond(['success' => true, 'monedero_activo' => monedero_activo($pdo, $ctx['escuela_id']), 'alumnos' => []]);
}
// El nombre se busca con LIKE: se escapan % y _ para que no actúen de comodín.
$like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q) . '%';

$st = $pdo->prepare(
    "SELECT cl.id, cl.nombre, cl.grado, cl.matricula, cl.foto_url,
            m.saldo, m.limite_diario, m.nip_hash, m.bloqueado
       FROM clientes cl
       LEFT JOIN monederos m ON m.cliente_id = cl.id
      WHERE cl.escuela_id = ? AND cl.tipo = 'alumno' AND cl.activo = 1
        AND (cl.matricula = ? OR cl.nombre LIKE ?)
      ORDER BY (cl.matricula = ?) DESC, cl.nombre
      LIMIT 20"
);
$st->execute([$ctx['escuela_id'], $q, $like, $q]);
$filas = $st->fetchAll();

$out = [];
foreach ($filas as $r) {
    $cid = intval($r['id']);
    // Con pocos resultados se acreditan antes las recargas ya pagadas que el
    // barrido no hubiera visto, para que el vendedor vea el saldo real. Con
    // muchos no vale la pena (son 2 consultas por alumno); el saldo que
    // cuenta se vuelve a leer bajo candado dentro de tienda_vender.
    if (count($filas) <= 5) monedero_acreditar_recargas($pdo, $cid);
    $est = monedero_estado($pdo, $cid);
    $out[] = [
        'id'             => $cid,
        'nombre'         => $r['nombre'],
        'grado'          => $r['grado'],
        'matricula'      => $r['matricula'],
        'foto_url'       => $r['foto_url'],
        'saldo'          => $est['saldo'],
        'requiere_nip'   => $est['tiene_nip'],
        'bloqueado'      => $est['bloqueado'],
        'limite_diario'  => $est['limite_diario'],
        'disponible_hoy' => $est['disponible_hoy'],
    ];
}
respond(['success' => true, 'monedero_activo' => monedero_activo($pdo, $ctx['escuela_id']), 'alumnos' => $out]);
