<?php
// acciones/importar_saldos_analizar.php — [OF-5] Paso 1 y 2 de "Importar adeudos": ANALIZAR.
//
// Lee el archivo (CSV o XLSX), lo valida y devuelve el plan por renglón SIN
// ESCRIBIR NADA en la base. El mismo endpoint sirve para el paso "ajustar": la
// pantalla reenvía el MISMO archivo con otro `mapeo` de columnas y/o con los
// productos elegidos (`eleccion`) y pide el análisis otra vez.
//
// multipart/form-data, NO JSON ($input llega vacío): se lee $_POST / $_FILES.
//   archivo   el CSV/XLSX (hasta 5 MB y 5,000 renglones)
//   escuela_id solo superadmin (el admin siempre usa la suya)
//   mapeo     JSON opcional {matricula:0, alumno:null, concepto:2, monto:3, abonado:4, fecha:5, vence:6, folio:7}
//   eleccion  JSON opcional {"<concepto normalizado>": producto_id | 0}  (0 = sin concepto ligado)
//   hoja      índice de hoja (xlsx), opcional
//
// Roles: admin y superadmin. Todo se busca SOLO dentro de la escuela del
// usuario: alumnos, productos y huellas. Ver lib/helpers_importar_saldos.php.

require_once __DIR__ . '/../lib/helpers_importar_saldos.php';

// El rol se exige aquí mismo (y otra vez dentro del helper, que además valida la escuela y la sección).
requerir_rol($usuario_actual['rol'] ?? '', ['superadmin', 'admin'], 'No tienes permiso para importar adeudos.');
$escuela_id = importar_contexto_o_responder($pdo, $usuario_actual, $_POST['escuela_id'] ?? 0, 'No tienes permiso para importar adeudos.');

if (!importar_tablas_listas($pdo)) {
    respond(['success' => false, 'falta_migracion' => true, 'error' => IMPORTAR_AVISO_MIGRACION]);
}

[$ruta, $nombre] = importar_archivo_subido_o_responder();
@set_time_limit(120);

try {
    $plan = importar_analizar_archivo($pdo, $escuela_id, $ruta, $nombre, [
        'mapeo'    => importar_json_post('mapeo'),
        'eleccion' => importar_json_post('eleccion'),
        'hoja'     => $_POST['hoja'] ?? null,
    ]);
} catch (\Throwable $e) {
    log_api('importar_saldos_analizar: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    respond(['success' => false, 'error' => 'No se pudo analizar el archivo. Revisa que sea un CSV o XLSX con encabezados; si el problema sigue, avisa a soporte.']);
}
if (empty($plan['ok'])) respond(['success' => false, 'error' => $plan['error'] ?: 'No se pudo leer el archivo.']);

respond(importar_plan_a_respuesta($plan));
