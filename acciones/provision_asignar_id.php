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
    "SELECT id, nombre, documentacion_estado, proveedor_school_id FROM escuelas WHERE id = ?"
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

respond([
    'success'              => true,
    'escuela_id'           => $escuela_id,
    'proveedor_school_id'  => $proveedor_id,
    'reemplazo'            => $reemplazo,
    'referidos_activados'  => $referidos_activados,
    'mensaje'              => $referidos_activados
        ? 'Identificador guardado. El colegio pasó a "activo" en el embudo.'
        : 'Identificador guardado.',
]);
