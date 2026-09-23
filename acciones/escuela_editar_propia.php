<?php
// acciones/escuela_editar_propia.php
//
// Antes, editar_escuela.php era la ÚNICA vía para tocar los datos de una
// escuela, y es solo-superadmin -- un admin de colegio no tenía ninguna
// pantalla para editar los datos fiscales de SU PROPIA cuenta. Esta acción
// cubre justo eso: solo los campos fiscales (persona física/moral, razón
// social, régimen, CP fiscal), no lo que ya administra el superadmin
// (nombre, clave, plan, etc.).

requerir_rol($usuario_actual['rol'] ?? '', ['admin', 'superadmin'], 'No tienes permiso para editar estos datos.');

$escuela_id = intval($input['escuela_id'] ?? ($usuario_actual['escuela_id'] ?? 0));
if (!$escuela_id) respond(['success' => false, 'error' => 'escuela_id requerido']);
requerir_escuela_propia($usuario_actual['rol'] ?? '', $escuela_id, $usuario_actual, 'No tienes permiso sobre esta escuela.');

$tipo_persona   = trim($input['tipo_persona']   ?? '');
$razon_social   = trim($input['razon_social']   ?? '');
$regimen_fiscal = trim($input['regimen_fiscal'] ?? '');
$cp_fiscal      = trim($input['cp_fiscal']      ?? '');

// tipo_persona_valido() en lib/helpers_pagos.php es la fuente única (23-sep-2026):
// antes esta lista estaba copiada a mano aquí y en otros 4 lugares, y olvidar
// uno producía un 400 en un flujo distinto al que se probó.
if ($tipo_persona !== '' && !tipo_persona_valido($tipo_persona)) {
    respond(['success' => false, 'error' => 'tipo_persona no reconocido']);
}
if ($cp_fiscal !== '' && !preg_match('/^\d{5}$/', $cp_fiscal)) {
    respond(['success' => false, 'error' => 'El código postal debe tener 5 dígitos']);
}

// SET dinámico: solo se escriben las columnas que el llamador MANDÓ.
//
// CORREGIDO 23-sep-2026. Antes el UPDATE pisaba las cuatro columnas sin
// condición, y views/MiCuenta.js (guardarFiscal) solo manda tres: tipo_persona,
// razon_social y regimen_fiscal. Resultado: cada vez que un admin pulsaba
// "Guardar datos fiscales" se BORRABA escuelas.cp_fiscal, que el formulario de
// alta de comercio (escuela_guardar_datos_pago.php) acababa de escribir desde
// su campo "Código postal". Silencioso, y con la guía de primer uso empujando a
// todo mundo por esa pantalla se iba a disparar mucho más seguido.
//
// Mismo patrón que ya usa escuela_guardar_datos_pago.php.
$setsFiscal = [];
$valsFiscal = [];
foreach ([
    'tipo_persona'   => $tipo_persona ?: null,
    'razon_social'   => $razon_social !== '' ? mb_substr($razon_social, 0, 200) : null,
    'regimen_fiscal' => $regimen_fiscal ?: null,
    'cp_fiscal'      => $cp_fiscal ?: null,
] as $col => $val) {
    // array_key_exists y no isset: un campo mandado como null o '' SÍ es una
    // orden de limpiarlo, y isset() no distingue eso de "no vino".
    if (!array_key_exists($col, $input)) continue;
    $setsFiscal[] = "$col = ?";
    $valsFiscal[] = $val;
}
if (!$setsFiscal) respond(['success' => false, 'error' => 'No mandaste ningún dato fiscal que guardar.']);
$valsFiscal[] = $escuela_id;
$pdo->prepare("UPDATE escuelas SET " . implode(', ', $setsFiscal) . " WHERE id = ?")->execute($valsFiscal);

registrar_log($pdo, $usuario_actual, 'escuela_fiscal_editada', "Escuela #$escuela_id: datos fiscales actualizados", $escuela_id);

respond(['success' => true]);
