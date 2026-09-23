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
// (23-sep-2026) Ya NO es una lista fija: depende del tipo_persona del colegio.
// documentos_requeridos_por_tipo_persona() en lib/helpers_pagos.php le quita
// 'constancia_fiscal' al NEGOCIO INDEPENDIENTE, que no factura. Se resuelve
// más abajo, cuando ya se sabe de qué escuela es el documento.
//
// No es cosmético: el recálculo de abajo exige que TODOS los requeridos estén
// aprobados para poner documentacion_estado='aprobada', y
// provision_listar_pendientes.php solo lista colegios en ese estado. Pedirle a
// un negocio independiente una constancia que no tiene lo dejaría atorado en
// 'en_revision' y, por lo tanto, SIN PODER COBRAR NUNCA.

requerir_rol($usuario_actual['rol'] ?? '', ['superadmin', 'contador', 'provision'], 'No tienes permiso para revisar documentos.');

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
// El tipo_persona de ESTA escuela decide qué documentos se le exigen.
$stmtTP = $pdo->prepare("SELECT tipo_persona FROM escuelas WHERE id = ?");
$stmtTP->execute([$escuela_id]);
$tiposRequeridos = documentos_requeridos_por_tipo_persona($stmtTP->fetchColumn());

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
// `email` se incluye para el aviso de rechazo al colegio, más abajo.
$stmtPrev = $pdo->prepare("SELECT nombre, email, documentacion_estado, proveedor_school_id FROM escuelas WHERE id = ?");
$stmtPrev->execute([$escuela_id]);
$escPrev = $stmtPrev->fetch() ?: ['nombre' => '', 'email' => null, 'documentacion_estado' => null, 'proveedor_school_id' => null];

$pdo->prepare("UPDATE escuelas SET documentacion_estado = ? WHERE id = ?")->execute([$agregado, $escuela_id]);

registrar_log($pdo, $usuario_actual, 'documento_escuela_revisado',
    "Escuela #$escuela_id: documento #$documento_id $nuevoEstado" . ($motivo ? " ($motivo)" : '') . " -> documentacion_estado=$agregado",
    $escuela_id);

// ── Aviso de RECHAZO al colegio ─────────────────────────────────────────
//
// Sin esto, un documento rechazado solo se veía entrando a "Mi cuenta" — el
// colegio podía pasar días creyendo que seguía en revisión cuando en realidad
// la pelota estaba de su lado. Y el motivo del rechazo es justamente lo que
// necesita para corregir.
//
// Se dispara cuando ESTA revisión fue un rechazo, y lista TODOS los documentos
// que están rechazados ahora mismo (no solo el de esta llamada): si hay tres
// mal, el colegio los necesita los tres en un mismo correo para arreglarlos de
// una vez, en vez de ir descubriéndolos de uno en uno.
$aviso_rechazo_enviado = false;
if ($nuevoEstado === 'rechazado') {
    try {
        // Nombres legibles, los mismos que ve el colegio en su pantalla de Mi
        // cuenta (views/MiCuenta.js). Mandarle 'identificacion_frente' tal cual
        // sería mandarle el nombre interno de la columna.
        $ETIQUETAS_DOC = [
            'identificacion_frente'  => 'Identificación dueño del negocio (Frente)',
            'identificacion_reverso' => 'Identificación dueño del negocio (Reverso)',
            'estado_cuenta_bancario' => 'Portada del estado de cuenta bancario',
            'comprobante_domicilio'  => 'Comprobante de domicilio',
            'constancia_fiscal'      => 'Constancia Fiscal',
        ];

        $stmtRech = $pdo->prepare(
            "SELECT tipo, motivo_rechazo FROM escuela_documentos
              WHERE escuela_id = ? AND estado = 'rechazado' ORDER BY id"
        );
        $stmtRech->execute([$escuela_id]);
        $rechazados = $stmtRech->fetchAll();

        $destEsc = [];
        if (!empty($escPrev['email'])) $destEsc[] = $escPrev['email'];
        $stmtAdmR = $pdo->prepare("SELECT email FROM usuarios WHERE escuela_id = ? AND rol = 'admin' AND activo = 1");
        $stmtAdmR->execute([$escuela_id]);
        foreach ($stmtAdmR->fetchAll() as $a) $destEsc[] = $a['email'];
        $destEsc = array_values(array_unique(array_filter($destEsc)));

        if ($destEsc && $rechazados) {
            $lista = '';
            foreach ($rechazados as $r) {
                $etq = htmlspecialchars($ETIQUETAS_DOC[$r['tipo']] ?? $r['tipo']);
                $mot = trim((string) $r['motivo_rechazo']);
                // Sin motivo capturado no se inventa uno: se dice que no se
                // especificó, que es información honesta y le da al colegio
                // algo concreto que preguntar.
                $lista .= '<li><strong>' . $etq . '</strong><br>'
                        . ($mot !== ''
                            ? 'Motivo: ' . htmlspecialchars($mot)
                            : '<em>No se especificó un motivo. Escríbenos y te decimos qué corregir.</em>')
                        . '</li>';
            }
            $nombreEscR = htmlspecialchars($escPrev['nombre'] ?: ('Escuela #' . $escuela_id));
            $plural = count($rechazados) === 1;
            $htmlR = "
                <p>Hola,</p>
                <p>Revisamos la documentación de <strong>{$nombreEscR}</strong> y "
                . ($plural
                    ? 'hay <strong>un documento</strong> que necesitamos que corrijan'
                    : 'hay <strong>' . count($rechazados) . ' documentos</strong> que necesitamos que corrijan')
                . ":</p>
                <ul>{$lista}</ul>
                <p>Para continuar, vuelvan a subir "
                . ($plural ? 'ese documento' : 'esos documentos')
                . " desde <strong>Mi cuenta → Documentos</strong>. No hace falta volver a subir los que ya quedaron aprobados.</p>
                <p>En cuanto los recibamos los revisamos de nuevo. La revisión tarda entre 48 y 72 horas hábiles.</p>
                <p>Si algo no queda claro, respondan este correo y les ayudamos.</p>
                <p>— Equipo Pagalaescuela</p>
            ";
            $rR = enviar_correo($destEsc, 'Necesitamos que corrijan ' . ($plural ? 'un documento' : 'unos documentos'), $htmlR);
            $aviso_rechazo_enviado = (bool) ($rR['success'] ?? false);
            if (!$aviso_rechazo_enviado) {
                log_api("revisar_documento_escuela: falló el aviso de rechazo a la escuela #{$escuela_id} -> " . ($rR['error'] ?? 'desconocido'));
            }
        } elseif (!$destEsc) {
            log_api("revisar_documento_escuela: escuela #{$escuela_id} con documento rechazado, pero sin correo de contacto ni admin activo al que avisarle.");
        }
    } catch (\Throwable $eR) {
        log_api("revisar_documento_escuela: error armando el aviso de rechazo de la escuela #{$escuela_id} -> " . $eR->getMessage());
    }
}

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
    'aviso_rechazo_enviado'   => $aviso_rechazo_enviado,
]);
