<?php
// acciones/importar_saldos_aplicar.php — [OF-5] Paso 3 de "Importar adeudos": APLICAR.
//
// Crea un cobro 'pendiente' por cada renglón importable (total = lo que aún se
// debe: monto − abonado). NO crea abonos (cobro_abonos): ese dinero no entró por
// la plataforma. Detalle en lib/helpers_importar_saldos.php y
// docs/mejoras-of/of5-importar.md.
//
// multipart/form-data: mismos campos que importar_saldos_analizar (archivo,
// escuela_id, mapeo, eleccion, hoja) más, opcionales, lo que mostró la vista
// previa para detectar que algo cambió entre el análisis y la confirmación:
//   esperado_cobros  cuántos cobros decía la vista previa
//   esperado_monto   por cuánto ($)
//
// El archivo se VUELVE A LEER y a analizar aquí, ya con el candado de la
// escuela tomado: nunca se aplican renglones que mande el navegador, y dos
// "Aplicar" a la vez (doble clic, dos pestañas) no pueden crear duplicados.
// Con la huella UNIQUE (escuela_id, huella) como segunda red.

require_once __DIR__ . '/../lib/helpers_importar_saldos.php';

// El rol se exige aquí mismo (y otra vez dentro del helper, que además valida la escuela y la sección).
requerir_rol($usuario_actual['rol'] ?? '', ['superadmin', 'admin'], 'No tienes permiso para importar adeudos.');
$escuela_id = importar_contexto_o_responder($pdo, $usuario_actual, $_POST['escuela_id'] ?? 0, 'No tienes permiso para importar adeudos.');

if (!importar_tablas_listas($pdo)) {
    respond(['success' => false, 'falta_migracion' => true, 'error' => IMPORTAR_AVISO_MIGRACION]);
}

[$ruta, $nombre] = importar_archivo_subido_o_responder();
@set_time_limit(300);

// Un candado por escuela: mientras una importación se aplica, otra de la misma
// escuela (o un "deshacer") espera o se rechaza.
$llave_candado = 'edupago_importar_saldos_' . $escuela_id;
$got = $pdo->prepare("SELECT GET_LOCK(?, 5)");
$got->execute([$llave_candado]);
if (intval($got->fetchColumn()) !== 1) {
    respond(['success' => false, 'error' => 'Ya hay una importación de este colegio en curso. Espera a que termine y revisa el historial.']);
}

// Dentro del try NO se llama a respond(): se acumula la salida en $salida y se
// responde ya fuera, con el candado liberado.
$salida = null; $res = null; $t = null;
try {
    // El plan se arma DESPUÉS de tomar el candado: las huellas ya reflejan lo último.
    $plan = importar_analizar_archivo($pdo, $escuela_id, $ruta, $nombre, [
        'mapeo'    => importar_json_post('mapeo'),
        'eleccion' => importar_json_post('eleccion'),
        'hoja'     => $_POST['hoja'] ?? null,
    ]);
    if (empty($plan['ok'])) {
        $salida = ['success' => false, 'error' => $plan['error'] ?: 'No se pudo leer el archivo.'];
    } elseif ($plan['error']) {
        $salida = ['success' => false, 'error' => $plan['error']];
    } else {
        $t = $plan['totales'];
        if ($t['a_importar'] <= 0) {
            $salida = ['success' => false, 'error' => 'No hay renglones para importar: ' . ($t['ya_importadas'] > 0
                ? 'todos los válidos ya se importaron antes.' : 'revisa los errores del análisis.')];
        } elseif (isset($_POST['esperado_cobros']) && $_POST['esperado_cobros'] !== '' && intval($_POST['esperado_cobros']) !== $t['a_importar']) {
            $salida = ['success' => false, 'cambio' => true, 'error' => 'Lo que se va a importar cambió desde la vista previa (ahora son ' . $t['a_importar'] . ' cobros). Vuelve a revisar el análisis antes de aplicar.'];
        } elseif (isset($_POST['esperado_monto']) && $_POST['esperado_monto'] !== '' && abs(floatval($_POST['esperado_monto']) - $t['monto_c'] / 100) > 0.005) {
            $salida = ['success' => false, 'cambio' => true, 'error' => 'El monto total cambió desde la vista previa (ahora es $' . number_format($t['monto_c'] / 100, 2) . '). Vuelve a revisar el análisis antes de aplicar.'];
        } else {
            $res = importar_aplicar_plan($pdo, $escuela_id, $plan, $plan['archivo'], intval($usuario_actual['user_id'] ?? 0) ?: null);
        }
    }
} catch (\Throwable $e) {
    log_api('importar_saldos_aplicar: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    $salida = ['success' => false, 'error' => 'No se pudo aplicar la importación. Revisa el historial de importaciones (puede haberse guardado una parte) y vuelve a intentar; si el problema sigue, avisa a soporte.'];
} finally {
    try { $pdo->prepare("SELECT RELEASE_LOCK(?)")->execute([$llave_candado]); } catch (\Throwable $e) { /* se libera al cerrar la conexión */ }
}
if ($salida !== null) respond($salida);

registrar_log($pdo, $usuario_actual, 'importacion_saldos_aplicada',
    "Importación #{$res['importacion_id']} ({$nombre}): {$res['cobros_creados']} cobro(s) por $" . number_format($res['monto_total_c'] / 100, 2)
    . " de {$t['filas']} renglón(es); omitidos/errores: " . ($t['filas'] - $t['a_importar'])
    . ($res['error'] ? ' [INCOMPLETA: ' . $res['error'] . ']' : ''),
    $escuela_id);

respond([
    'success'        => $res['error'] === null,
    'parcial'        => $res['error'] !== null && $res['cobros_creados'] > 0,
    'error'          => $res['error'],
    'importacion_id' => $res['importacion_id'],
    'cobros_creados' => $res['cobros_creados'],
    'monto_total'    => importar_pesos($res['monto_total_c']),
    'omitidas'       => $t['filas'] - $t['a_importar'],
    'filas_total'    => $t['filas'],
]);
