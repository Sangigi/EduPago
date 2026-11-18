<?php
// acciones/alumno_aviso_privacidad_aceptar.php — F2 (18-nov-2026)
//
// La familia acepta, desde su portal, el aviso de privacidad del colegio para
// UNO de sus hijos. Se guarda cuándo y con qué cuenta (evidencia de
// consentimiento para el tratamiento de los datos del expediente, incluidos
// los médicos).
//
// Solo hijos PROPIOS: clientes.familia_id = familia del usuario Y misma
// escuela. Las dos cosas: un familia_id solo no basta si algún día se reusa
// un id de familia entre colegios por error de captura.
//
// Se conserva la PRIMERA aceptación: volver a aceptar no la sobrescribe (si
// no, la fecha de consentimiento "se movería" con cada clic).
//
// Entrada: cliente_id.

$rolAviso = $usuario_actual['rol'] ?? '';
requerir_rol($rolAviso, ['familia'], 'Solo el tutor desde su portal puede aceptar el aviso de privacidad.');

$cliente_id = intval($input['cliente_id'] ?? 0);
if ($cliente_id <= 0) respond(['success' => false, 'error' => 'Falta indicar el alumno.']);

try {
    $st = $pdo->prepare("SELECT id, escuela_id, familia_id, aviso_privacidad_aceptado_en FROM clientes WHERE id = ?");
    $st->execute([$cliente_id]);
    $alumno = $st->fetch();
} catch (\PDOException $e) {
    log_api("alumno_aviso_privacidad_aceptar: columna no encontrada (¿falta migracion_2026_11_18_f2_expediente.sql?) -> " . $e->getMessage());
    respond(['success' => false, 'error' => 'Esta función aún no está disponible. Inténtalo más tarde.']);
}

requerir_familia_propia($alumno['familia_id'] ?? null, $usuario_actual, 'No puedes aceptar el aviso de privacidad de este alumno.');
if (intval($alumno['escuela_id'] ?? -1) !== intval($usuario_actual['escuela_id'] ?? -2)) {
    http_response_code(403);
    respond(['success' => false, 'error' => 'No puedes aceptar el aviso de privacidad de este alumno.']);
}

if (empty($alumno['aviso_privacidad_aceptado_en'])) {
    // El "IS NULL" en el WHERE cubre la carrera de dos clics/dos tutores al
    // mismo tiempo: solo el primero escribe.
    $up = $pdo->prepare(
        "UPDATE clientes SET aviso_privacidad_aceptado_en = NOW(), aviso_privacidad_aceptado_por = ?
         WHERE id = ? AND aviso_privacidad_aceptado_en IS NULL"
    );
    $up->execute([intval($usuario_actual['user_id'] ?? 0), $cliente_id]);
    if ($up->rowCount() > 0) {
        registrar_log($pdo, $usuario_actual, 'aviso_privacidad_aceptado',
            "Alumno #{$cliente_id}: la familia aceptó el aviso de privacidad", intval($alumno['escuela_id']));
    }
    $st2 = $pdo->prepare("SELECT aviso_privacidad_aceptado_en FROM clientes WHERE id = ?");
    $st2->execute([$cliente_id]);
    $fecha = $st2->fetchColumn();
} else {
    $fecha = $alumno['aviso_privacidad_aceptado_en'];
}

respond(['success' => true, 'cliente_id' => $cliente_id, 'aviso_privacidad_aceptado_en' => $fecha]);
