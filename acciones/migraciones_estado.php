<?php
// acciones/migraciones_estado.php  [OF-4a]
//
// Lista el estado de cada paso de migración (ver lib/migraciones.php). SOLO
// LECTURA: no crea schema_migraciones ni toca nada. Solo superadmin.

requerir_rol($usuario_actual['rol'] ?? '', ['superadmin'], 'Solo el super admin puede ver el estado de la base de datos.');

require_once __DIR__ . '/../lib/migraciones.php';

try {
    respond(['success' => true] + migraciones_estado($pdo));
} catch (\Throwable $e) {
    log_api('migraciones_estado fallo: ' . $e->getMessage());
    respond(['success' => false, 'error' => 'No se pudo leer el estado de las migraciones.']);
}
