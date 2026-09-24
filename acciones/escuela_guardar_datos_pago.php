<?php
// acciones/escuela_guardar_datos_pago.php
//
// Guarda los datos de alta de comercio (Cobroscontarjeta.com): titular,
// representante legal, datos de la empresa, identificación oficial y datos
// BANCARIOS. El checkbox de aceptación del clausulado es obligatorio solo la
// PRIMERA vez que se manda la información (mismo criterio que el propio
// formulario: "Indispensable aceptarlo para mandar la información") -- una
// vez aceptado, no se vuelve a exigir en cada edición posterior.

$rol = $usuario_actual['rol'] ?? '';
requerir_rol($rol, ['admin', 'superadmin'], 'No tienes permiso para editar estos datos.');

$escuela_id = intval($input['escuela_id'] ?? ($usuario_actual['escuela_id'] ?? 0));
if (!$escuela_id) respond(['success' => false, 'error' => 'escuela_id requerido']);
requerir_escuela_propia($rol, $escuela_id, $usuario_actual, 'No tienes permiso sobre esta escuela.');

$stmtExiste = $pdo->prepare("SELECT clausulado_aceptado_en FROM escuela_datos_pago WHERE escuela_id = ?");
$stmtExiste->execute([$escuela_id]);
$existente = $stmtExiste->fetch();

$aceptaClausulado = !empty($input['acepta_clausulado']);
if (!$existente && !$aceptaClausulado) {
    respond(['success' => false, 'error' => 'Debes aceptar el clausulado del contrato de procesamiento de transacciones para enviar esta información.']);
}

$campo = function ($nombre, $max = null) use ($input) {
    $v = trim($input[$nombre] ?? '');
    return $v === '' ? null : ($max ? mb_substr($v, 0, $max) : $v);
};
$campoFecha = function ($nombre) use ($input) {
    $v = trim($input[$nombre] ?? '');
    if ($v === '') return null;
    $ts = strtotime($v);
    return $ts ? date('Y-m-d', $ts) : null;
};

$vals = [
    'titular_nombre'          => $campo('titular_nombre', 200),
    'nombre_comercio'         => $campo('nombre_comercio', 200),
    'titular_correo'          => $campo('titular_correo', 160),
    'giro'                    => $campo('giro', 200),
    'calle_numero'            => $campo('calle_numero', 200),
    'numero_interior'         => $campo('numero_interior', 50),
    'colonia'                 => $campo('colonia', 150),
    'delegacion_municipio'    => $campo('delegacion_municipio', 150),
    'ciudad'                  => $campo('ciudad', 100),
    'estado_direccion'        => $campo('estado_direccion', 100),
    'pais'                    => $campo('pais', 100) ?: 'México',
    'telefono_oficina'        => $campo('telefono_oficina', 20),
    'telefono_celular'        => $campo('telefono_celular', 20),
    'nombre_vendedor'         => $campo('nombre_vendedor', 150),
    'rep_legal_nombre'        => $campo('rep_legal_nombre', 200),
    'rep_legal_escritura'     => $campo('rep_legal_escritura', 200),
    'rep_legal_notaria_numero'=> $campo('rep_legal_notaria_numero', 50),
    'rep_legal_notario_nombre'=> $campo('rep_legal_notario_nombre', 200),
    'rep_legal_ciudad'        => $campo('rep_legal_ciudad', 100),
    'empresa_escritura'       => $campo('empresa_escritura', 200),
    'empresa_folio_rpc'       => $campo('empresa_folio_rpc', 100),
    'empresa_ciudad'          => $campo('empresa_ciudad', 100),
    'empresa_notario_nombre'  => $campo('empresa_notario_nombre', 200),
    'empresa_notaria_numero'  => $campo('empresa_notaria_numero', 50),
    'id_tipo'                 => $campo('id_tipo', 50),
    'id_numero'               => $campo('id_numero', 100),
    'id_fecha_expedicion'     => $campoFecha('id_fecha_expedicion'),
    'id_vigencia'             => $campoFecha('id_vigencia'),
    'banco'                   => $campo('banco', 100),
    'plaza'                   => $campo('plaza', 100),
    'sucursal_bancaria'       => $campo('sucursal_bancaria', 100),
    'cuenta_cheques'          => $campo('cuenta_cheques', 30),
    'cuenta_clabe'            => $campo('cuenta_clabe', 18),
];

if ($vals['cuenta_clabe'] !== null && !preg_match('/^\d{18}$/', $vals['cuenta_clabe'])) {
    respond(['success' => false, 'error' => 'La cuenta CLABE debe tener 18 dígitos.']);
}

$cols = array_keys($vals);
$placeholders = implode(', ', array_fill(0, count($cols), '?'));
$colsList = implode(', ', $cols);
$updateList = implode(', ', array_map(fn($c) => "$c = VALUES($c)", $cols));

$pdo->prepare(
    "INSERT INTO escuela_datos_pago (escuela_id, $colsList, actualizado_en, actualizado_por" .
    ($aceptaClausulado && !$existente ? ", clausulado_aceptado_en" : "") . ")
     VALUES (?, $placeholders, NOW(), ?" . ($aceptaClausulado && !$existente ? ", NOW()" : "") . ")
     ON DUPLICATE KEY UPDATE $updateList, actualizado_en = VALUES(actualizado_en), actualizado_por = VALUES(actualizado_por)"
)->execute(array_merge([$escuela_id], array_values($vals), [intval($usuario_actual['user_id'] ?? 0)]));

// El RFC, el código postal fiscal y tipo_persona ya viven en `escuelas`
// (compartidos con el resto del sistema, ej. CFDI / escuela_editar_propia.php)
// -- este formulario también los pide, así que se actualizan ahí en vez de
// duplicarlos en esta tabla.
$rfc = $campo('rfc');
$cp  = $campo('cp');
$tipoPersonaForm = trim($input['tipo_persona'] ?? '');
// Ver tipo_persona_valido() en lib/helpers_pagos.php (fuente única, 23-sep-2026).
if ($tipoPersonaForm !== '' && !tipo_persona_valido($tipoPersonaForm)) {
    respond(['success' => false, 'error' => 'tipo_persona debe ser fisica o moral']);
}
if ($rfc !== null || $cp !== null || $tipoPersonaForm !== '') {
    $sets = []; $params = [];
    if ($rfc !== null) { $sets[] = 'rfc = ?'; $params[] = strtoupper($rfc); }
    if ($cp !== null) {
        if (!preg_match('/^\d{5}$/', $cp)) respond(['success' => false, 'error' => 'El código postal debe tener 5 dígitos']);
        $sets[] = 'cp_fiscal = ?'; $params[] = $cp;
    }
    if ($tipoPersonaForm !== '') { $sets[] = 'tipo_persona = ?'; $params[] = $tipoPersonaForm; }
    $params[] = $escuela_id;
    $pdo->prepare("UPDATE escuelas SET " . implode(', ', $sets) . " WHERE id = ?")->execute($params);
}

registrar_log($pdo, $usuario_actual, 'escuela_datos_pago_guardados', "Escuela #$escuela_id: datos de alta de comercio actualizados", $escuela_id);

// ── Aviso a CONTADOR: formulario de alta de comercio completado ────────
//
// Es el segundo disparador de la misma cola de contador (el primero es
// subir_documento_escuela.php, cuando se completan los 5 documentos). Este
// dispara cuando el colegio manda el FORMULARIO por primera vez -- se usa
// "primera vez" (`!$existente`, ya leído arriba antes del INSERT) y no
// "aceptó el clausulado" porque ese checkbox ya está atado 1:1 a la primera
// vez (ver el comentario de arriba: solo se exige la primera vez). Ediciones
// posteriores del mismo formulario no reavisan: contador ya sabe que este
// colegio existe y está en su cola.
$aviso_contador_form_enviado = false;
if (!$existente) {
    try {
        $stmtCont2 = $pdo->prepare("SELECT email FROM usuarios WHERE rol = 'contador' AND activo = 1 AND email IS NOT NULL AND email <> ''");
        $stmtCont2->execute();
        $destCont2 = array_values(array_unique(array_filter(array_column($stmtCont2->fetchAll(), 'email'))));

        if ($destCont2) {
            $stmtNombreEsc = $pdo->prepare("SELECT nombre FROM escuelas WHERE id = ?");
            $stmtNombreEsc->execute([$escuela_id]);
            $nombreEscRaw = $stmtNombreEsc->fetchColumn() ?: ('Escuela #' . $escuela_id);
            $nombreEscF = htmlspecialchars($nombreEscRaw);
            $htmlContF = "
                <p>Hola,</p>
                <p><strong>{$nombreEscF} acaba de completar su formulario de alta de comercio.</strong></p>
                <p>Lo encuentras en tu panel, en la lista de colegios pendientes de revisión.</p>
                <p>— Sistema Pagalaescuela</p>
            ";
            $rContF = enviar_correo($destCont2, "Formulario de alta completado: {$nombreEscRaw}", $htmlContF);
            $aviso_contador_form_enviado = (bool) ($rContF['success'] ?? false);
            if (!$aviso_contador_form_enviado) {
                log_api("escuela_guardar_datos_pago: falló el aviso a contador por la escuela #{$escuela_id} -> " . ($rContF['error'] ?? 'desconocido'));
            }
        } else {
            log_api("escuela_guardar_datos_pago: escuela #{$escuela_id} completó su formulario, pero NO hay ninguna cuenta con rol 'contador' activa que avisar.");
        }
    } catch (\Throwable $eContF) {
        // Nunca tumbar el guardado del formulario por un problema de correo:
        // los datos ya quedaron guardados, que es lo que importa.
        log_api("escuela_guardar_datos_pago: error armando el aviso a contador de la escuela #{$escuela_id} -> " . $eContF->getMessage());
    }
}

respond(['success' => true, 'aviso_contador_enviado' => $aviso_contador_form_enviado]);