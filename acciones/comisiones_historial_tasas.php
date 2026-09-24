<?php
// acciones/comisiones_historial_tasas.php
//
// Los tramos de porcentaje de un referido: desde cuándo rigió cada uno, quién
// lo capturó y cuándo.
//
// Es la respuesta a "¿con qué porcentaje me pagaste agosto?", que antes no se
// podía contestar: el único rastro de un cambio era el texto "Referido #N
// actualizado" en logs_sistema, sin el valor viejo ni el nuevo.

$rolTasas = $usuario_actual['rol'] ?? '';
requerir_rol($rolTasas, ['superadmin', 'distribuidor'], 'No tienes permiso para ver el historial de comisiones.');

$refTasas = intval($input['referido_id'] ?? $_GET['referido_id'] ?? 0);
if (!$refTasas) respond(['success' => false, 'error' => 'referido_id requerido']);

// Un distribuidor solo ve SUS propios referidos. requerir_escuela_propia no
// aplica aquí (un distribuidor no tiene escuela_id), así que el candado es
// este: se compara el dueño del referido contra el de la sesión.
try {
    $dueno = $pdo->prepare("SELECT distribuidor_id, nombre_colegio FROM distribuidor_referidos WHERE id = ?");
    $dueno->execute([$refTasas]);
    $refRow = $dueno->fetch();
    if (!$refRow) respond(['success' => false, 'error' => 'Referido no encontrado.']);

    if ($rolTasas === 'distribuidor'
        && intval($refRow['distribuidor_id']) !== intval($usuario_actual['user_id'] ?? 0)) {
        http_response_code(403);
        respond(['success' => false, 'error' => 'Ese referido no es tuyo.']);
    }

    $st = $pdo->prepare(
        "SELECT t.id, t.comision_pct, t.vigente_desde, t.vigente_hasta,
                t.origen, t.motivo, t.creado_en, u.nombre AS registrado_por_nombre
           FROM distribuidor_comision_tasas t
           LEFT JOIN usuarios u ON u.id = t.registrado_por
          WHERE t.referido_id = ?
          ORDER BY t.vigente_desde DESC"
    );
    $st->execute([$refTasas]);
    $tramos = array_map(function ($t) {
        return [
            'id'             => intval($t['id']),
            'comision_pct'   => floatval($t['comision_pct']),
            'vigente_desde'  => $t['vigente_desde'],
            // NULL = es la que rige hoy.
            'vigente_hasta'  => $t['vigente_hasta'],
            'vigente_ahora'  => $t['vigente_hasta'] === null,
            'origen'         => $t['origen'],
            'motivo'         => $t['motivo'],
            'registrado_por' => $t['registrado_por_nombre'],
            'creado_en'      => $t['creado_en'],
        ];
    }, $st->fetchAll());
} catch (\PDOException $e) {
    respond(['success' => false,
             'error' => 'Falta correr migracion_2026_09_24_comisiones_devengo.sql en este servidor.']);
}

respond(['success' => true, 'colegio' => $refRow['nombre_colegio'], 'tramos' => $tramos]);
