<?php
// acciones/alumno_expediente_guardar.php — F2 (18-nov-2026)
//
// Guarda los datos personales y médicos del expediente de un alumno.
// Actualización PARCIAL: solo se tocan los campos que vienen en el JSON
// (array_key_exists), igual que editar_cliente.php. Así la vista manda solo
// lo que cambió y no pisa con un valor viejo lo que otra pantalla acaba de
// guardar (p. ej. la CURP desde el formulario de Alumnos).
//
// No toca nombre, grado, matrícula, familia, saldo ni CLABE: eso sigue siendo
// de editar_cliente.php. Tampoco el aviso de privacidad: lo acepta la
// familia desde su portal (alumno_aviso_privacidad_aceptar.php).
//
// Entrada: cliente_id + cualquiera de los campos de $CAMPOS_EXPEDIENTE.

require_once __DIR__ . '/../lib/helpers_expediente.php';

$rolExp = $usuario_actual['rol'] ?? '';
requerir_rol($rolExp, EXPEDIENTE_ROLES_GESTION, 'No tienes permiso para modificar el expediente de este alumno.');

$alumno = expediente_alumno($pdo, $usuario_actual, $input['cliente_id'] ?? 0,
    EXPEDIENTE_ROLES_GESTION, 'No tienes permiso para modificar el expediente de este alumno.');

// campo => [largo máximo, etiqueta para el mensaje de error, multilínea]
$CAMPOS_EXPEDIENTE = [
    'nacionalidad'        => [60,   'Nacionalidad', false],
    'lugar_nacimiento'    => [120,  'Lugar de nacimiento', false],
    'escuela_procedencia' => [150,  'Escuela de procedencia', false],
    'alergias'            => [255,  'Alergias', true],
    'padecimientos'       => [500,  'Padecimientos', true],
    'medicamentos'        => [500,  'Medicamentos', true],
    'seguro_medico'       => [150,  'Seguro médico', false],
    'observaciones'       => [5000, 'Observaciones', true],
];

$sets = [];
$vals = [];
$cambiados = [];

foreach ($CAMPOS_EXPEDIENTE as $campo => [$max, $etiqueta, $multi]) {
    if (!array_key_exists($campo, $input)) continue;
    $sets[] = "`{$campo}` = ?";
    $vals[] = expediente_texto($input[$campo], $max, $etiqueta, $multi);
    $cambiados[] = $campo;
}

// CURP: 18 caracteres con la estructura oficial (4 letras, fecha AAMMDD,
// sexo H/M/X, 5 letras, homoclave y dígito). No se valida el dígito
// verificador: RENAPO ha emitido CURPs que no lo cumplen y rechazar una CURP
// real sería peor que aceptar una con el dígito mal.
if (array_key_exists('curp', $input)) {
    $curp = strtoupper(trim((string) ($input['curp'] ?? '')));
    if ($curp === '') {
        $curp = null;
    } elseif (!preg_match('/^[A-Z]{4}\d{6}[HMX][A-Z]{5}[0-9A-Z]\d$/', $curp)) {
        respond(['success' => false, 'error' => 'La CURP no es válida: debe tener 18 caracteres (por ejemplo GALA090315MDFPNB08).']);
    }
    $sets[] = '`curp` = ?';
    $vals[] = $curp;
    $cambiados[] = 'curp';
}

if (array_key_exists('sexo', $input)) {
    $sexo = strtoupper(trim((string) ($input['sexo'] ?? '')));
    if ($sexo === '') {
        $sexo = null;
    } elseif (!in_array($sexo, ['H', 'M', 'X'], true)) {
        respond(['success' => false, 'error' => 'El sexo debe ser H (hombre), M (mujer) o X (no binario).']);
    }
    $sets[] = '`sexo` = ?';
    $vals[] = $sexo;
    $cambiados[] = 'sexo';
}

if (array_key_exists('fecha_nac', $input)) {
    $fecha = trim((string) ($input['fecha_nac'] ?? ''));
    if ($fecha === '') {
        $fecha = null;
    } else {
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $fecha, $m) || !checkdate(intval($m[2]), intval($m[3]), intval($m[1]))) {
            respond(['success' => false, 'error' => 'La fecha de nacimiento no es válida (usa el formato AAAA-MM-DD).']);
        }
        if ($fecha > date('Y-m-d') || intval($m[1]) < 1900) {
            respond(['success' => false, 'error' => 'La fecha de nacimiento está fuera de rango.']);
        }
    }
    $sets[] = '`fecha_nac` = ?';
    $vals[] = $fecha;
    $cambiados[] = 'fecha_nac';
}

if (array_key_exists('tipo_sangre', $input)) {
    $sangre = strtoupper(str_replace(' ', '', trim((string) ($input['tipo_sangre'] ?? ''))));
    if ($sangre === '') {
        $sangre = null;
    } elseif (!in_array($sangre, EXPEDIENTE_TIPOS_SANGRE, true)) {
        respond(['success' => false, 'error' => 'Tipo de sangre no válido. Usa A+, A-, B+, B-, AB+, AB-, O+ u O-.']);
    }
    $sets[] = '`tipo_sangre` = ?';
    $vals[] = $sangre;
    $cambiados[] = 'tipo_sangre';
}

if (empty($sets)) respond(['success' => false, 'error' => 'No hay cambios que guardar.']);

try {
    $vals[] = $alumno['id'];
    $vals[] = $alumno['escuela_id'];
    $pdo->prepare("UPDATE clientes SET " . implode(', ', $sets) . " WHERE id = ? AND escuela_id = ?")->execute($vals);
    $expediente = expediente_cargar($pdo, $alumno['id']);
} catch (\PDOException $e) {
    expediente_error_bd($e, 'alumno_expediente_guardar');
}

// Solo los NOMBRES de los campos tocados, nunca sus valores: logs_sistema lo
// lee cualquiera con acceso a la bitácora y no debe contener datos médicos.
registrar_log($pdo, $usuario_actual, 'alumno_expediente_editado',
    "Alumno #{$alumno['id']}: actualizó expediente (" . implode(', ', $cambiados) . ")", $alumno['escuela_id']);

respond(['success' => true, 'expediente' => $expediente]);
