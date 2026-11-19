<?php
// acciones/diagnostico_incoherencias.php  [OF-4a]
//
// Detector de incoherencias de datos (ver lib/helpers_diagnostico.php).
// SOLO LECTURA. Superadmin y soporte (ambos con alcance global). Parámetro
// opcional escuela_id para mirar un solo colegio.
//
// OJO: 'soporte' tiene un allowlist en api.php que corre ANTES del despacho;
// esta acción debe estar ahí o recibe 403 sin llegar aquí.

requerir_rol($usuario_actual['rol'] ?? '', ['superadmin', 'soporte'], 'No tienes permiso para ver el diagnóstico de datos.');

require_once __DIR__ . '/../lib/helpers_diagnostico.php';

$escuela_id = intval($input['escuela_id'] ?? 0);
if ($escuela_id > 0) {
    $chk = $pdo->prepare('SELECT id FROM escuelas WHERE id = ?');
    $chk->execute([$escuela_id]);
    if (!$chk->fetch()) respond(['success' => false, 'error' => 'Colegio no encontrado.']);
}

try {
    respond(['success' => true] + diagnostico_incoherencias($pdo, $escuela_id > 0 ? $escuela_id : null));
} catch (\Throwable $e) {
    log_api('diagnostico_incoherencias fallo: ' . $e->getMessage());
    respond(['success' => false, 'error' => 'No se pudo correr el diagnóstico.']);
}
