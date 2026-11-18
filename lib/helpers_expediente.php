<?php
/**
 * lib/helpers_expediente.php — Expediente del alumno (F2, 18-nov-2026)
 *
 * Reglas de acceso y validaciones compartidas por las acciones
 * acciones/alumno_expediente_*.php, alumno_tutor*.php y alumno_documento*.php.
 * Viven en UN solo lugar para que las diez acciones no repitan (y luego
 * desincronicen) quién puede ver o tocar el expediente.
 *
 * No se carga desde api.php (archivo compartido con otras fases): cada acción
 * hace require_once de este archivo. Usa respond(), requerir_rol(),
 * requerir_escuela_propia(), requerir_seccion_habilitada() y log_api(), que
 * ya están definidas cuando api.php despacha a acciones/.
 *
 * QUIÉN PUEDE QUÉ
 *   superadmin, admin, control_escolar → ver y modificar (GESTIÓN).
 *   direccion                          → solo ver (LECTURA).
 *   cajero                             → nada: su trabajo es la caja; los
 *                                        datos médicos no le hacen falta.
 *   familia                            → solo aceptar el aviso de privacidad
 *                                        de SUS hijos (acción aparte).
 *
 * OJO: requerir_rol() NO es default-deny global (ver api.php). Estas listas
 * protegen solo porque cada acción del expediente las llama al principio.
 */

const EXPEDIENTE_ROLES_GESTION = ['superadmin', 'admin', 'control_escolar'];
const EXPEDIENTE_ROLES_LECTURA = ['superadmin', 'admin', 'control_escolar', 'direccion'];

// Catálogo de documentos del expediente. La etiqueta se manda al navegador
// para que la vista no tenga que copiar la lista (en documentos del colegio
// la misma lista acabó copiada a mano en tres vistas).
const EXPEDIENTE_TIPOS_DOCUMENTO = [
    'acta_nacimiento'       => 'Acta de nacimiento',
    'curp'                  => 'CURP',
    'certificado_anterior'  => 'Certificado del nivel anterior',
    'boleta_anterior'       => 'Boleta del ciclo anterior',
    'cartilla_vacunacion'   => 'Cartilla de vacunación',
    'comprobante_domicilio' => 'Comprobante de domicilio',
    'identificacion_tutor'  => 'Identificación del tutor',
    'fotografia'            => 'Fotografía',
    'otro'                  => 'Otro',
];

// Parentesco del TUTOR respecto al alumno (no confundir con
// clientes.parentesco, que es el del alumno respecto a la familia y tiene su
// propia lista en normalizar_parentesco() de api.php).
const EXPEDIENTE_PARENTESCOS_TUTOR = [
    'madre' => 'Madre', 'padre' => 'Padre', 'tutor' => 'Tutor legal',
    'abuela' => 'Abuela', 'abuelo' => 'Abuelo', 'tia' => 'Tía', 'tio' => 'Tío',
    'hermana' => 'Hermana', 'hermano' => 'Hermano',
    'madrastra' => 'Madrastra', 'padrastro' => 'Padrastro', 'otro' => 'Otro',
];

const EXPEDIENTE_TIPOS_SANGRE = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// Topes anti-abuso: un expediente real no se acerca a esto, pero sin tope un
// script podría llenar el disco del hosting compartido subiendo archivos.
const EXPEDIENTE_MAX_TUTORES_ACTIVOS = 10;
const EXPEDIENTE_MAX_DOCUMENTOS = 40;

/**
 * Valida rol + que el alumno exista + que sea de la escuela del usuario.
 * Devuelve la fila mínima del alumno: id, escuela_id, familia_id, nombre.
 *
 * La escuela SIEMPRE sale de la fila del alumno, nunca de $input: así ni el
 * superadmin puede equivocarse de colegio, y nadie más puede pedir un alumno
 * ajeno con solo cambiar el id.
 */
function expediente_alumno($pdo, $usuario_actual, $cliente_id, array $roles, $mensaje = 'No tienes permiso sobre el expediente de este alumno.') {
    $rol = $usuario_actual['rol'] ?? '';
    requerir_rol($rol, $roles, $mensaje);

    $cliente_id = intval($cliente_id);
    if ($cliente_id <= 0) respond(['success' => false, 'error' => 'Falta indicar el alumno.']);

    $st = $pdo->prepare("SELECT id, escuela_id, familia_id, nombre FROM clientes WHERE id = ?");
    $st->execute([$cliente_id]);
    $al = $st->fetch();
    if (!$al) {
        http_response_code(404);
        respond(['success' => false, 'error' => 'Alumno no encontrado.']);
    }
    requerir_escuela_propia($rol, $al['escuela_id'], $usuario_actual, $mensaje);
    // Solo actúa para admin/cajero (ver api.php): respeta el apagado de la
    // sección "Alumnos" por colegio, igual que editar_cliente/subir_foto_cliente.
    // NO es el control de acceso — ese es requerir_rol + requerir_escuela_propia.
    requerir_seccion_habilitada($pdo, $rol, $al['escuela_id'], ['alumnos', 'familias']);

    $al['id']         = intval($al['id']);
    $al['escuela_id'] = intval($al['escuela_id']);
    $al['familia_id'] = $al['familia_id'] ? intval($al['familia_id']) : null;
    return $al;
}

/** ¿El rol puede modificar el expediente? (para que la vista oculte botones) */
function expediente_puede_editar($usuario_actual) {
    return in_array($usuario_actual['rol'] ?? '', EXPEDIENTE_ROLES_GESTION, true);
}

/**
 * Migración pendiente → mensaje claro en vez de un 500 genérico. $tabla
 * siempre es una constante escrita en el código, nunca viene del usuario.
 */
function expediente_requerir_tabla($pdo, $tabla) {
    try {
        $pdo->query("SELECT 1 FROM `{$tabla}` LIMIT 1");
    } catch (\PDOException $e) {
        log_api("expediente: tabla {$tabla} no encontrada (¿falta migracion_2026_11_18_f2_expediente.sql?) -> " . $e->getMessage());
        respond(['success' => false, 'error' => 'El expediente del alumno aún no está instalado en la base de datos (falta correr migracion_2026_11_18_f2_expediente.sql).']);
    }
}

/**
 * Convierte un error de BD en un mensaje que sirva. Distingue la migración
 * pendiente (tabla/columna inexistente: 42S02/42S22) de un texto más largo
 * que la columna (22001) — sin esto, cualquier fallo se diagnosticaría como
 * "falta la migración" aunque la migración sí estuviera.
 */
function expediente_error_bd(\Throwable $e, $donde) {
    $estado = (string) $e->getCode();
    log_api("expediente: error de BD en {$donde} (SQLSTATE {$estado}) -> " . $e->getMessage());
    if ($estado === '42S02' || $estado === '42S22') {
        respond(['success' => false, 'error' => 'El expediente del alumno aún no está instalado en la base de datos (falta correr migracion_2026_11_18_f2_expediente.sql).']);
    }
    if ($estado === '22001') {
        respond(['success' => false, 'error' => 'Uno de los textos es demasiado largo. Acórtalo e intenta de nuevo.']);
    }
    http_response_code(500);
    respond(['success' => false, 'error' => 'No se pudo completar la operación (ya quedó registrado en el log).']);
}

/**
 * Texto opcional: recorta espacios, vacío → null, y rechaza (no recorta en
 * silencio) lo que pase del largo de la columna — con MySQL en modo estricto
 * el INSERT tronaría con un 500; sin modo estricto se guardaría truncado sin
 * avisar. Quita caracteres de control salvo saltos de línea en los campos
 * multilínea.
 */
function expediente_texto($valor, $max, $etiqueta, $multilinea = false) {
    if ($valor === null) return null;
    if (!is_scalar($valor)) respond(['success' => false, 'error' => "El campo «{$etiqueta}» no es válido."]);
    $v = trim((string) $valor);
    $v = $multilinea
        ? preg_replace('/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/u', '', $v)
        : preg_replace('/[\x00-\x1F\x7F]/u', ' ', $v);
    if ($v === null) respond(['success' => false, 'error' => "El campo «{$etiqueta}» tiene caracteres no válidos."]);
    $v = trim($v);
    if ($v === '') return null;
    if (mb_strlen($v, 'UTF-8') > $max) {
        respond(['success' => false, 'error' => "El campo «{$etiqueta}» no puede pasar de {$max} caracteres."]);
    }
    return $v;
}

/** Teléfono opcional: solo dígitos, espacios, +, -, paréntesis y "ext". */
function expediente_telefono($valor, $etiqueta) {
    $v = expediente_texto($valor, 25, $etiqueta);
    if ($v === null) return null;
    if (!preg_match('/^[0-9+()\-\s.extEXT]{7,25}$/', $v) || preg_match_all('/\d/', $v) < 7) {
        respond(['success' => false, 'error' => "El {$etiqueta} no parece un número de teléfono válido."]);
    }
    return $v;
}

/** Casilla: acepta true/false, 1/0, "1"/"0", "si"/"no", "on". */
function expediente_bool($valor) {
    if (is_bool($valor)) return $valor ? 1 : 0;
    $v = strtolower(trim((string) $valor));
    return in_array($v, ['1', 'true', 'si', 'sí', 'on', 'yes'], true) ? 1 : 0;
}

/**
 * Carga el expediente completo de un alumno ya validado. Lanza PDOException si
 * faltan las columnas de la migración (el llamador lo convierte en mensaje).
 */
function expediente_cargar($pdo, $cliente_id) {
    $st = $pdo->prepare(
        "SELECT c.id, c.escuela_id, c.familia_id, c.nombre, c.matricula, c.grado, c.curp,
                c.fecha_nac, c.tipo_sangre, c.alergias,
                c.sexo, c.nacionalidad, c.lugar_nacimiento, c.escuela_procedencia,
                c.padecimientos, c.medicamentos, c.seguro_medico, c.observaciones,
                c.aviso_privacidad_aceptado_en, c.aviso_privacidad_aceptado_por,
                u.nombre AS aviso_privacidad_aceptado_por_nombre,
                f.nombre AS familia_nombre
         FROM clientes c
         LEFT JOIN usuarios u ON u.id = c.aviso_privacidad_aceptado_por
         LEFT JOIN familias f ON f.id = c.familia_id AND f.escuela_id = c.escuela_id
         WHERE c.id = ?"
    );
    $st->execute([intval($cliente_id)]);
    $e = $st->fetch();
    if (!$e) return null;
    $e['id']         = intval($e['id']);
    $e['escuela_id'] = intval($e['escuela_id']);
    $e['familia_id'] = $e['familia_id'] ? intval($e['familia_id']) : null;
    $e['aviso_privacidad_aceptado_por'] = $e['aviso_privacidad_aceptado_por'] ? intval($e['aviso_privacidad_aceptado_por']) : null;
    return $e;
}

/** Normaliza una fila de alumno_tutores para el navegador. */
function expediente_tutor_salida(array $t) {
    foreach (['id', 'escuela_id', 'cliente_id'] as $k) {
        if (isset($t[$k])) $t[$k] = intval($t[$k]);
    }
    foreach (['es_contacto_emergencia', 'autorizado_recoger', 'responsable_pago', 'vive_con_alumno', 'activo'] as $k) {
        if (array_key_exists($k, $t)) $t[$k] = (bool) $t[$k];
    }
    $t['usuario_id'] = !empty($t['usuario_id']) ? intval($t['usuario_id']) : null;
    return $t;
}

/**
 * Nombre de archivo seguro para guardar en BD y para el Content-Disposition:
 * sin rutas, sin comillas ni caracteres de control (un " o un salto de línea
 * en el nombre original rompería la cabecera de la descarga).
 */
function expediente_nombre_archivo($nombre) {
    $n = basename(str_replace('\\', '/', (string) $nombre));
    $n = preg_replace('/[\x00-\x1F\x7F"\\\\\/]/u', '', $n);
    if ($n === null) $n = '';
    $n = trim($n);
    return $n === '' ? null : mb_substr($n, 0, 255, 'UTF-8');
}

/**
 * Ruta absoluta de un documento privado, verificando que quede DENTRO de
 * uploads_privados/. ruta_archivo la genera guardar_archivo_privado() y nunca
 * viene del usuario, pero si la fila se corrompiera (o alguien la editara a
 * mano en phpMyAdmin) con un "../", esto evita servir un archivo ajeno.
 * Devuelve null si el archivo no existe o queda fuera.
 */
function expediente_ruta_documento($ruta_relativa) {
    $base = realpath(rtrim(UPLOADS_PRIVADOS_DIR_ABS, '/\\'));
    if ($base === false || $ruta_relativa === null || $ruta_relativa === '') return null;
    if (strpos($ruta_relativa, '..') !== false) return null;
    $abs = realpath($base . DIRECTORY_SEPARATOR . ltrim($ruta_relativa, '/\\'));
    if ($abs === false || !is_file($abs)) return null;
    $prefijo = rtrim($base, '/\\') . DIRECTORY_SEPARATOR;
    if (strncmp($abs, $prefijo, strlen($prefijo)) !== 0) return null;
    return $abs;
}
