<?php
// acciones/provision_asignar_id.php
//
// Captura el identificador que Cobroscontarjeta.com asignó a un colegio
// después de que el contador aprobó sus documentos, y con eso lo da por
// provisionado: si ese colegio llegó por un distribuidor, su renglón del
// embudo pasa a 'activo'.
//
// Este es el eslabón que faltaba entre las dos máquinas de estado que hasta
// hoy vivían separadas y nunca se hablaban:
//
//   escuelas.documentacion_estado : sin_enviar -> en_revision -> aprobada
//   distribuidor_referidos.estado : prospecto -> demo_agendada -> implementacion -> activo
//
// El estado del embudo se movía SOLO a mano desde el panel de superadmin, y
// por eso 'implementacion' y 'demo_agendada' nunca se veían en uso: nada los
// avanzaba. Ahora al menos el salto final queda atado a un hecho real.
//
// ⚠️ Esta acción NO cambia a dónde va el dinero. Solo guarda el dato. Ver la
// nota larga en migracion_2026_09_22_provision_y_cuentas_por_pagar.sql sobre
// por qué el código de pagos todavía no usa este identificador.

requerir_rol($usuario_actual['rol'] ?? '', ['superadmin', 'provision'], 'No tienes permiso para provisionar colegios.');

$escuela_id  = intval($input['escuela_id'] ?? 0);
$proveedor_id = trim(strval($input['proveedor_school_id'] ?? ''));

if (!$escuela_id) respond(['success' => false, 'error' => 'escuela_id requerido']);
if ($proveedor_id === '') respond(['success' => false, 'error' => 'El identificador del proveedor no puede ir vacío.']);
if (strlen($proveedor_id) > 32) respond(['success' => false, 'error' => 'El identificador no puede pasar de 32 caracteres.']);
// Se aceptan letras, dígitos, guion y guion bajo. NO se exige un formato de N
// dígitos a propósito: los identificadores que este proveedor ha usado en este
// proyecto van de '000002' a '000067' con ceros a la izquierda significativos,
// y no hay confirmación por escrito de cuál es su formato real. Validar de más
// aquí significaría rechazar un identificador válido y dejar al colegio sin
// poder cobrar por una suposición nuestra.
if (!preg_match('/^[A-Za-z0-9_-]+$/', $proveedor_id)) {
    respond(['success' => false, 'error' => 'El identificador solo puede tener letras, números, guion y guion bajo.']);
}

$stmtEsc = $pdo->prepare(
    // `email` va en el SELECT para el correo de bienvenida de más abajo.
    "SELECT id, nombre, email, documentacion_estado, proveedor_school_id FROM escuelas WHERE id = ?"
);
$stmtEsc->execute([$escuela_id]);
$esc = $stmtEsc->fetch();
if (!$esc) respond(['success' => false, 'error' => 'Colegio no encontrado']);

// El orden importa: primero los papeles, después el identificador. Capturar
// un id sobre documentos no aprobados dejaría al colegio cobrando sin que
// nadie haya validado a quién le está cayendo el dinero.
if ($esc['documentacion_estado'] !== 'aprobada') {
    respond(['success' => false,
             'error' => 'Este colegio todavía no tiene la documentación aprobada (estado actual: ' . $esc['documentacion_estado'] . '). El contador debe aprobarla antes de provisionar.']);
}

$reemplazo = !empty($esc['proveedor_school_id']) && $esc['proveedor_school_id'] !== $proveedor_id;

$pdo->beginTransaction();
try {
    $pdo->prepare(
        "UPDATE escuelas
            SET proveedor_school_id = ?, proveedor_school_id_en = NOW(), proveedor_school_id_por = ?
          WHERE id = ?"
    )->execute([$proveedor_id, intval($usuario_actual['user_id'] ?? 0) ?: null, $escuela_id]);

    // Embudo comercial a 'activo', solo si el colegio llegó por un
    // distribuidor. Es un UPDATE condicionado y no un respond() de error
    // porque un colegio directo se provisiona igual: simplemente no tiene
    // renglón de referido que mover.
    $stmtRef = $pdo->prepare("UPDATE distribuidor_referidos SET estado = 'activo' WHERE escuela_id = ? AND estado <> 'activo'");
    $stmtRef->execute([$escuela_id]);
    $referidos_activados = $stmtRef->rowCount();

    $pdo->commit();
} catch (\Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    respond(['success' => false, 'error' => 'No se pudo guardar: ' . $e->getMessage()]);
}

registrar_log(
    $pdo, $usuario_actual, 'colegio_provisionado',
    "Escuela #{$escuela_id} ({$esc['nombre']}): identificador de proveedor "
    . ($reemplazo ? "REEMPLAZADO ({$esc['proveedor_school_id']} -> {$proveedor_id})" : "asignado ({$proveedor_id})")
    . ($referidos_activados ? " | referido -> activo" : ''),
    $escuela_id
);

// ── Correo de bienvenida al colegio ─────────────────────────────────────
//
// Este es EL momento en que el colegio queda realmente habilitado: sus
// documentos ya se aprobaron y el proveedor ya le asignó su identificador.
// Hasta hoy nadie se lo avisaba, así que el colegio se quedaba esperando sin
// saber que ya podía operar — y eso, después de 48 a 72 horas de revisión, es
// justo cuando más falta hace la noticia.
//
// Solo en la PRIMERA asignación: si esto es una corrección del identificador,
// darle la bienvenida otra vez sería confuso.
//
// Va DESPUÉS del commit y nunca tumba la petición: enviar_correo() devuelve
// ['success' => bool, ...] y no lanza excepción, pero la construcción de
// destinatarios sí puede fallar, y el trabajo ya está guardado — que el SMTP
// falle no puede deshacer una provisión válida.
$correo_enviado = false;
if (!$reemplazo) {
    try {
        // Mismos destinatarios que el resto de avisos al colegio (ver
        // webhook_liga.php): el correo de contacto de la escuela + sus admins
        // activos. El admin es quien de verdad va a entrar a cobrar.
        $destinatarios = [];
        if (!empty($esc['email'])) $destinatarios[] = $esc['email'];
        $stmtAdm = $pdo->prepare("SELECT email FROM usuarios WHERE escuela_id = ? AND rol = 'admin' AND activo = 1");
        $stmtAdm->execute([$escuela_id]);
        foreach ($stmtAdm->fetchAll() as $a) $destinatarios[] = $a['email'];
        $destinatarios = array_values(array_unique(array_filter($destinatarios)));

        if ($destinatarios) {
            $nombreEsc = htmlspecialchars($esc['nombre']);
            $html = "
                <p>Hola,</p>
                <p><strong>Ya está todo listo: {$nombreEsc} puede empezar a cobrar y a facturar.</strong></p>
                <p>Revisamos la documentación que nos enviaron y quedó aprobada. Con eso, su colegio
                   ya está dado de alta y habilitado en la plataforma de pagos.</p>
                <p>Desde hoy pueden:</p>
                <ul>
                  <li><strong>Cobrar a las familias</strong> por transferencia SPEI, tarjeta, o en efectivo
                      en tiendas participantes.</li>
                  <li><strong>Emitir facturas</strong> (CFDI) de los pagos que reciban.</li>
                  <li>Dar de alta alumnos y conceptos de pago, y que cada familia vea sus adeudos
                      desde su propio portal.</li>
                </ul>
                <p>Si es la primera vez que entran, les recomendamos empezar por dar de alta sus
                   conceptos de pago y sus alumnos; de ahí en adelante los cobros salen solos.</p>
                <p>Cualquier duda, respondan este correo y con gusto les ayudamos.</p>
                <p>Bienvenidos.<br>— Equipo Pagalaescuela</p>
            ";
            $rCorreo = enviar_correo($destinatarios, '¡Bienvenidos! Ya pueden cobrar y facturar con Pagalaescuela', $html);
            $correo_enviado = (bool) ($rCorreo['success'] ?? false);
            if (!$correo_enviado) {
                log_api("provision_asignar_id: falló el correo de bienvenida a escuela #{$escuela_id} -> " . ($rCorreo['error'] ?? 'desconocido'));
            }
        } else {
            log_api("provision_asignar_id: escuela #{$escuela_id} sin correo de contacto ni admin activo, no se pudo dar la bienvenida.");
        }
    } catch (\Throwable $eCorreo) {
        log_api("provision_asignar_id: error armando el correo de bienvenida de la escuela #{$escuela_id} -> " . $eCorreo->getMessage());
    }
}

respond([
    'success'              => true,
    'escuela_id'           => $escuela_id,
    'proveedor_school_id'  => $proveedor_id,
    'reemplazo'            => $reemplazo,
    'referidos_activados'  => $referidos_activados,
    'correo_enviado'       => $correo_enviado,
    'mensaje'              => ($referidos_activados
            ? 'Identificador guardado. El colegio pasó a "activo" en el embudo.'
            : 'Identificador guardado.')
        . ($reemplazo
            ? ' (Es un reemplazo: no se mandó correo de bienvenida.)'
            : ($correo_enviado
                ? ' Se le avisó al colegio por correo que ya puede cobrar y facturar.'
                : ' OJO: no se pudo mandar el correo de bienvenida — revisa el log y avísale al colegio a mano.')),
]);
