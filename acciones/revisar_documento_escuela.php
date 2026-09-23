<?php
// acciones/revisar_documento_escuela.php
//
// Aprueba o rechaza un documento fiscal ya subido. Superadmin o contador
// (rol dedicado a esta revisión, sin los demás poderes de superadmin).
// Recalcula escuelas.documentacion_estado a partir del estado real de TODOS
// los documentos de la escuela, no solo este.

// Los 5 documentos del formulario de alta de comercio de
// Cobroscontarjeta.com -- los mismos para persona física o moral (el
// formulario no distingue), ver subir_documento_escuela.php.
$TIPOS_REQUERIDOS = ['identificacion_frente', 'identificacion_reverso', 'estado_cuenta_bancario', 'comprobante_domicilio', 'constancia_fiscal'];

requerir_rol($usuario_actual['rol'] ?? '', ['superadmin', 'contador'], 'No tienes permiso para revisar documentos.');

$documento_id = intval($input['documento_id'] ?? 0);
$accion       = trim($input['accion'] ?? ''); // 'aprobar' | 'rechazar'
$motivo       = trim($input['motivo'] ?? '');

if (!$documento_id) respond(['success' => false, 'error' => 'documento_id requerido']);
if (!in_array($accion, ['aprobar', 'rechazar'], true)) respond(['success' => false, 'error' => 'accion debe ser aprobar o rechazar']);
if ($accion === 'rechazar' && $motivo === '') respond(['success' => false, 'error' => 'Indica el motivo del rechazo.']);

$stmt = $pdo->prepare("SELECT escuela_id FROM escuela_documentos WHERE id = ?");
$stmt->execute([$documento_id]);
$doc = $stmt->fetch();
if (!$doc) respond(['success' => false, 'error' => 'Documento no encontrado']);
$escuela_id = intval($doc['escuela_id']);

$nuevoEstado = $accion === 'aprobar' ? 'aprobado' : 'rechazado';
$pdo->prepare(
    "UPDATE escuela_documentos SET estado = ?, motivo_rechazo = ?, revisado_por = ?, revisado_en = NOW() WHERE id = ?"
)->execute([$nuevoEstado, $accion === 'rechazar' ? mb_substr($motivo, 0, 300) : null, intval($usuario_actual['user_id'] ?? 0), $documento_id]);

// Blindaje (11-sep-2026, hallado en revisión adversarial): antes "todos
// aprobados" significaba "todos los que EXISTAN en escuela_documentos" --
// una escuela que solo subiera y aprobara UN documento (de los 5 requeridos)
// ya quedaba en 'aprobada'. Ahora se exige explícitamente que cada uno de
// los 5 tipos tenga una fila con estado 'aprobado' (subir_documento_escuela.php
// ya garantiza como máximo una fila por (escuela_id, tipo) gracias al upsert).
$tiposRequeridos = $TIPOS_REQUERIDOS;

$stmtTodos = $pdo->prepare("SELECT tipo, estado FROM escuela_documentos WHERE escuela_id = ?");
$stmtTodos->execute([$escuela_id]);
$filas = $stmtTodos->fetchAll();
$estadoPorTipo = [];
foreach ($filas as $f) { $estadoPorTipo[$f['tipo']] = $f['estado']; }
$estados = array_column($filas, 'estado');

if (in_array('rechazado', $estados, true)) {
    $agregado = 'rechazada';
} elseif (in_array('pendiente', $estados, true)) {
    $agregado = 'en_revision';
} else {
    $faltantes = array_filter($tiposRequeridos, fn($t) => ($estadoPorTipo[$t] ?? null) !== 'aprobado');
    $agregado = empty($filas) ? 'sin_enviar' : (empty($faltantes) ? 'aprobada' : 'en_revision');
}
// El estado ANTERIOR se lee antes de pisarlo: el aviso al equipo de provisión
// debe salir en la TRANSICIÓN a 'aprobada', no cada vez que se aprueba un
// documento suelto de una escuela que ya estaba aprobada.
$stmtPrev = $pdo->prepare("SELECT nombre, documentacion_estado, proveedor_school_id FROM escuelas WHERE id = ?");
$stmtPrev->execute([$escuela_id]);
$escPrev = $stmtPrev->fetch() ?: ['nombre' => '', 'documentacion_estado' => null, 'proveedor_school_id' => null];

$pdo->prepare("UPDATE escuelas SET documentacion_estado = ? WHERE id = ?")->execute([$agregado, $escuela_id]);

registrar_log($pdo, $usuario_actual, 'documento_escuela_revisado',
    "Escuela #$escuela_id: documento #$documento_id $nuevoEstado" . ($motivo ? " ($motivo)" : '') . " -> documentacion_estado=$agregado",
    $escuela_id);

// ── Aviso al equipo de PROVISIÓN ────────────────────────────────────────
//
// El momento en que un colegio queda listo para que le pidan su identificador
// al proveedor es exactamente este: acaba de aprobarse su último documento
// pendiente. Sin este aviso, la cola de provisión solo se descubre entrando a
// mirarla, y un colegio puede quedarse días esperando sin que nadie se entere
// — justo después de haber esperado ya las 48-72 horas de la revisión.
//
// Tres condiciones para que salga:
//   · el agregado quedó en 'aprobada',
//   · NO estaba ya en 'aprobada' (si no, cada re-aprobación repetiría el aviso),
//   · el colegio todavía no tiene identificador (si ya lo tiene, no hay nada
//     que provisionar).
$aviso_provision_enviado = false;
if ($agregado === 'aprobada'
    && ($escPrev['documentacion_estado'] ?? null) !== 'aprobada'
    && empty($escPrev['proveedor_school_id'])) {
    try {
        // A todas las cuentas de provisión activas. Es trabajo de equipo, no
        // de una persona: quien esté disponible lo toma.
        $stmtProv = $pdo->prepare("SELECT email FROM usuarios WHERE rol = 'provision' AND activo = 1 AND email IS NOT NULL AND email <> ''");
        $stmtProv->execute();
        $destProv = array_values(array_unique(array_filter(array_column($stmtProv->fetchAll(), 'email'))));

        if ($destProv) {
            $nombreEsc = htmlspecialchars($escPrev['nombre'] ?: ('Escuela #' . $escuela_id));
            $htmlProv = "
                <p>Hola,</p>
                <p><strong>{$nombreEsc} ya tiene su documentación aprobada y está esperando su ID de escuela.</strong></p>
                <p>Enviaron sus documentos, se revisaron y quedaron validados. Lo que falta es tramitar
                   su identificador con el proveedor y capturarlo en el sistema.</p>
                <p>En cuanto lo captures, al colegio le llega solo el aviso de que ya puede cobrar y
                   facturar — no hace falta avisarle por fuera.</p>
                <p>Lo encuentras en tu panel, en <strong>Por provisionar</strong>.</p>
                <p>— Sistema Pagalaescuela</p>
            ";
            $rProv = enviar_correo($destProv, "Listo para provisionar: {$escPrev['nombre']}", $htmlProv);
            $aviso_provision_enviado = (bool) ($rProv['success'] ?? false);
            if (!$aviso_provision_enviado) {
                log_api("revisar_documento_escuela: falló el aviso a provisión por la escuela #{$escuela_id} -> " . ($rProv['error'] ?? 'desconocido'));
            }
        } else {
            // No es un error del flujo: puede que todavía no existan cuentas de
            // provisión. Pero sí hay que poder enterarse, porque significa que
            // ese colegio va a quedarse en la cola sin que nadie lo sepa.
            log_api("revisar_documento_escuela: escuela #{$escuela_id} lista para provisionar, pero NO hay ninguna cuenta con rol 'provision' activa que avisar.");
        }
    } catch (\Throwable $eProv) {
        // Nunca tumbar la revisión del documento por un problema de correo:
        // la aprobación ya quedó guardada y es lo que importa.
        log_api("revisar_documento_escuela: error armando el aviso a provisión de la escuela #{$escuela_id} -> " . $eProv->getMessage());
    }
}

respond([
    'success' => true,
    'estado' => $nuevoEstado,
    'documentacion_estado' => $agregado,
    'aviso_provision_enviado' => $aviso_provision_enviado,
]);
