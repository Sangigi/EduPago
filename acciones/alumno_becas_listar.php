<?php
// acciones/alumno_becas_listar.php — [OF-3] Becas guardadas en el alumno.
//
// Dos modos:
//   · con cliente_id  → las becas de ESE alumno (activas e inactivas; la baja es
//     lógica y el historial se conserva). Lo usa Caja (solo las activas) y el
//     componente BecasAlumno.
//   · sin cliente_id  → "Becas del colegio": todas las becas ACTIVAS de la
//     escuela y el descuento mensual estimado. Solo admin y superadmin.
//
// Roles: superadmin, admin y cajero. control_escolar y direccion NO ven nada
// financiero: no están en la lista y además tienen allowlist en api.php.
//
// Por qué una acción de lectura y no un campo más de cargar_datos: cargar_datos
// es compartido con roles que no deben ver finanzas (quitar_campos_financieros
// es una lista NEGRA: olvidar una clave nueva la filtraría), y las becas solo
// hacen falta cuando hay un alumno seleccionado.
//
// Entrada: cliente_id (opcional), escuela_id (solo superadmin, modo colegio).

require_once __DIR__ . '/../lib/helpers_becas.php';

$rolBec = $usuario_actual['rol'] ?? '';
requerir_rol($rolBec, ['superadmin', 'admin', 'cajero'], 'No tienes permiso para ver las becas.');

if (!becas_tabla_lista($pdo)) {
    respond(['success' => true, 'becas' => [], 'falta_migracion' => true,
             'aviso' => 'Falta correr la migración de OF-3 (migracion_2026_11_19_of3_cobranza.sql) para usar becas.']);
}

$cliente_id_bec = intval($input['cliente_id'] ?? 0);
if ($cliente_id_bec > 0) {
    $st = $pdo->prepare("SELECT id, escuela_id, nombre, tipo FROM clientes WHERE id = ?");
    $st->execute([$cliente_id_bec]);
    $cli = $st->fetch();
    if (!$cli) respond(['success' => false, 'error' => 'Alumno no encontrado.']);
    requerir_escuela_propia($rolBec, $cli['escuela_id'], $usuario_actual, 'No tienes permiso sobre este alumno.');
    requerir_seccion_habilitada($pdo, $rolBec, $cli['escuela_id'], ['caja', 'alumnos']);
    $st = $pdo->prepare("SELECT * FROM alumno_becas WHERE escuela_id = ? AND cliente_id = ? ORDER BY activo DESC, id DESC");
    $st->execute([$cli['escuela_id'], $cliente_id_bec]);
    $becas = array_map('becas_fila_publica', $st->fetchAll(PDO::FETCH_ASSOC));
    respond(['success' => true, 'becas' => $becas]);
}

// ── Modo colegio ──
requerir_rol($rolBec, ['superadmin', 'admin'], 'Solo la administración del colegio ve las becas de todo el colegio.');
$escuela_bec = $rolBec === 'superadmin' ? intval($input['escuela_id'] ?? 0) : intval($usuario_actual['escuela_id'] ?? 0);
if ($escuela_bec <= 0) respond(['success' => false, 'error' => 'escuela_id requerido']);
requerir_seccion_habilitada($pdo, $rolBec, $escuela_bec, ['alumnos']);

$st = $pdo->prepare(
    "SELECT b.*, cl.nombre AS cliente_nombre, cl.grado AS cliente_grado, cl.activo AS cliente_activo
       FROM alumno_becas b
       JOIN clientes cl ON cl.id = b.cliente_id AND cl.escuela_id = b.escuela_id
      WHERE b.escuela_id = ? AND b.activo = 1
      ORDER BY cl.nombre, b.id
      LIMIT 3000"
);
$st->execute([$escuela_bec]);
$filas = $st->fetchAll(PDO::FETCH_ASSOC);
$por_alumno = [];
foreach ($filas as $f) $por_alumno[intval($f['cliente_id'])][] = $f;
$est = becas_estimado_mensual($pdo, $escuela_bec, $por_alumno, date('Y-m-d'));
$becas = array_map(function ($f) use ($est) {
    $b = becas_fila_publica($f);
    $b['cliente_nombre'] = $f['cliente_nombre'];
    $b['cliente_grado'] = $f['cliente_grado'];
    $b['cliente_activo'] = intval($f['cliente_activo']) === 1;
    $b['descuento_mensual_estimado'] = $est['por_beca'][intval($f['id'])] ?? 0;
    return $b;
}, $filas);
respond([
    'success' => true,
    'becas' => $becas,
    'alumnos_con_beca' => count($por_alumno),
    'descuento_mensual_estimado' => $est['total'],
]);
