<?php
// acciones/alumno_beca_guardar.php — [OF-3] Alta (sin id) o edición (con id) de
// una beca / descuento del alumno.
//
// Solo admin y superadmin: una beca cambia lo que se le cobra a una familia.
//
// En la EDICIÓN el alumno y la escuela salen de la fila de la beca, no del input:
// no se puede "mover" una beca a otro alumno ni a otro colegio. Si el input trae
// un cliente_id distinto, se rechaza. La escuela de una alta sale del alumno
// (nunca del input).
//
// Los conceptos de un alcance 'productos' se validan contra el catálogo de la
// escuela DEL ALUMNO: no se puede atar una beca a conceptos de otro colegio.
//
// Entrada: cliente_id (alta), id (edición), nombre, tipo ('porcentaje'|'monto'),
// valor, alcance ('categorias'|'productos'), alcance_ids, vigente_desde,
// vigente_hasta, notas.

require_once __DIR__ . '/../lib/helpers_becas.php';

$rolBg = $usuario_actual['rol'] ?? '';
requerir_rol($rolBg, ['superadmin', 'admin'], 'Solo la administración del colegio puede guardar becas.');

if (!becas_tabla_lista($pdo)) {
    respond(['success' => false, 'error' => 'Falta correr la migración de OF-3 (migracion_2026_11_19_of3_cobranza.sql) para guardar becas.']);
}

$beca_id_bg = intval($input['id'] ?? 0);
$existente_bg = null;
if ($beca_id_bg > 0) {
    $st = $pdo->prepare("SELECT * FROM alumno_becas WHERE id = ?");
    $st->execute([$beca_id_bg]);
    $existente_bg = $st->fetch(PDO::FETCH_ASSOC);
    if (!$existente_bg) {
        http_response_code(404);
        respond(['success' => false, 'error' => 'Beca no encontrada.']);
    }
    if (!empty($input['cliente_id']) && intval($input['cliente_id']) !== intval($existente_bg['cliente_id'])) {
        respond(['success' => false, 'error' => 'Esa beca pertenece a otro alumno.']);
    }
    $cliente_id_bg = intval($existente_bg['cliente_id']);
} else {
    $cliente_id_bg = intval($input['cliente_id'] ?? 0);
}
if ($cliente_id_bg <= 0) respond(['success' => false, 'error' => 'cliente_id requerido']);

$st = $pdo->prepare("SELECT id, escuela_id, nombre FROM clientes WHERE id = ?");
$st->execute([$cliente_id_bg]);
$cli_bg = $st->fetch();
if (!$cli_bg) respond(['success' => false, 'error' => 'Alumno no encontrado.']);
requerir_escuela_propia($rolBg, $cli_bg['escuela_id'], $usuario_actual, 'No tienes permiso sobre este alumno.');
requerir_seccion_habilitada($pdo, $rolBg, $cli_bg['escuela_id'], ['alumnos']);
$escuela_bg = intval($cli_bg['escuela_id']);
if ($existente_bg && intval($existente_bg['escuela_id']) !== $escuela_bg) {
    respond(['success' => false, 'error' => 'La beca no corresponde al colegio del alumno.']);
}

$val = becas_validar_input($input);
if (!$val['ok']) respond(['success' => false, 'error' => $val['error']]);
$d = $val['datos'];

// Alcance por conceptos: todos deben ser de la escuela del alumno.
if ($d['alcance'] === 'productos') {
    $in = implode(',', array_fill(0, count($d['alcance_ids']), '?'));
    $st = $pdo->prepare("SELECT COUNT(*) FROM productos WHERE escuela_id = ? AND id IN ($in)");
    $st->execute(array_merge([$escuela_bg], $d['alcance_ids']));
    if (intval($st->fetchColumn()) !== count($d['alcance_ids'])) {
        respond(['success' => false, 'error' => 'Uno o más conceptos elegidos no existen en este colegio. Recarga la página y vuelve a elegirlos.']);
    }
}

$ids_json = json_encode($d['alcance_ids'], JSON_UNESCAPED_UNICODE);
$uid_bg = intval($usuario_actual['user_id'] ?? 0) ?: null;
$resumen_bg = "{$d['nombre']} (" . becas_valor_texto(['tipo' => $d['tipo'], 'valor' => $d['valor']]) . ", {$d['alcance']}: " . implode(',', $d['alcance_ids']) . ")";

if ($existente_bg) {
    $pdo->prepare(
        "UPDATE alumno_becas SET nombre = ?, tipo = ?, valor = ?, alcance = ?, alcance_ids = ?,
                vigente_desde = ?, vigente_hasta = ?, notas = ?
          WHERE id = ? AND escuela_id = ?"
    )->execute([$d['nombre'], $d['tipo'], $d['valor'], $d['alcance'], $ids_json,
                $d['vigente_desde'], $d['vigente_hasta'], $d['notas'], $beca_id_bg, $escuela_bg]);
    registrar_log($pdo, $usuario_actual, 'beca_editada',
        "Beca #{$beca_id_bg} de {$cli_bg['nombre']} (alumno #{$cliente_id_bg}) editada: {$resumen_bg}", $escuela_bg);
    respond(['success' => true, 'id' => $beca_id_bg]);
}

$pdo->prepare(
    "INSERT INTO alumno_becas
        (escuela_id, cliente_id, nombre, tipo, valor, alcance, alcance_ids, vigente_desde, vigente_hasta, activo, notas, creado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)"
)->execute([$escuela_bg, $cliente_id_bg, $d['nombre'], $d['tipo'], $d['valor'], $d['alcance'], $ids_json,
            $d['vigente_desde'], $d['vigente_hasta'], $d['notas'], $uid_bg]);
$nuevo_id_bg = intval($pdo->lastInsertId());
registrar_log($pdo, $usuario_actual, 'beca_creada',
    "Beca #{$nuevo_id_bg} para {$cli_bg['nombre']} (alumno #{$cliente_id_bg}): {$resumen_bg}", $escuela_bg);
respond(['success' => true, 'id' => $nuevo_id_bg]);
