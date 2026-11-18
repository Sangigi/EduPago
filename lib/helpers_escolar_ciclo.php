<?php
/**
 * lib/helpers_escolar_ciclo.php — Control escolar, fase F3 (18-nov-2026)
 *
 * Lo que le faltaba al módulo de control escolar para cubrir un ciclo
 * completo, de la inscripción al cierre y la reinscripción:
 *
 *   · Catálogo de grados (niveles_grados): "3° Primaria" como fila con su
 *     siguiente grado, en vez del texto libre clientes.grado.
 *   · Normalización del texto viejo ("3er Primaria", "3° prim", "tercero de
 *     primaria"…) para sugerir el grado del catálogo a cada alumno.
 *   · Ciclo cerrado = ya no se capturan calificaciones ni asistencias.
 *   · Acceso del rol 'alumno' a su propia boleta/kárdex.
 *   · Movimientos del expediente (F1) cuando se cambia grado/grupo, con guarda
 *     function_exists() para que esta rama funcione sola.
 *
 * Lo carga lib/helpers_escolar.php (require_once al final), así que todas las
 * acciones escolar_*.php lo tienen disponible sin tocar api.php.
 */

// Catálogo estándar de la SEP que carga escolar_cargar_catalogo_grados.php,
// en orden de avance. El último grado de cada nivel se encadena con el
// primero del siguiente nivel (Preescolar 3 → Primaria 1, etc.).
const ESCOLAR_CATALOGO_ESTANDAR = [
    'Preescolar'   => 3,
    'Primaria'     => 6,
    'Secundaria'   => 3,
    'Preparatoria' => 3,
];

const ESCOLAR_RESULTADOS = ['aprobado', 'reprobado', 'sin_calificar'];

/* ───────────────────────── Acceso ───────────────────────── */

/**
 * clientes.id al que está ligada una cuenta con rol 'alumno' (0 = ninguno).
 * usuarios.cliente_id lo agrega la fase F4; si esa columna todavía no existe,
 * ninguna cuenta de alumno está ligada y se niega todo (fail-closed).
 */
function escolar_cliente_id_de_usuario($pdo, $usuario_actual) {
    if (!empty($usuario_actual['cliente_id'])) return intval($usuario_actual['cliente_id']);
    try {
        $st = $pdo->prepare("SELECT cliente_id FROM usuarios WHERE id = ?");
        $st->execute([intval($usuario_actual['user_id'] ?? 0)]);
        return intval($st->fetchColumn() ?: 0);
    } catch (\PDOException $e) {
        return 0;
    }
}

function escolar_es_portal($ctx) {
    // Familia y alumno ven el módulo "desde fuera": solo periodos publicados.
    return in_array($ctx['rol'], ['familia', 'alumno'], true);
}

/**
 * Familia → solo sus hijos. Alumno → solo él mismo. El resto de los roles ya
 * quedó filtrado por escuela al cargar la fila (WHERE escuela_id = ?); el
 * docente lo valida cada acción contra sus grupos.
 * $alumno debe traer 'id' y 'familia_id'.
 */
function escolar_requerir_alumno_visible($pdo, $ctx, $usuario_actual, $alumno, $mensaje) {
    if ($ctx['rol'] === 'familia') {
        requerir_familia_propia($alumno['familia_id'] ?? null, $usuario_actual, $mensaje);
    } elseif ($ctx['rol'] === 'alumno') {
        // La F4 trae su propia validación; si ya está, se usa además de la
        // nuestra (las dos tienen que pasar).
        if (function_exists('requerir_alumno_propio')) {
            requerir_alumno_propio(intval($alumno['id']), $usuario_actual, $mensaje);
        }
        $propio = intval($ctx['cliente_id'] ?? 0);
        if (!$propio || $propio !== intval($alumno['id'])) escolar_403($mensaje);
    }
}

/* ───────────────────────── Ciclo cerrado ───────────────────────── */

function escolar_ciclo_cerrado($ciclo) {
    return !empty($ciclo['cerrado']);
}

function escolar_requerir_ciclo_abierto($ciclo, $que = 'hacer cambios') {
    if (escolar_ciclo_cerrado($ciclo)) {
        respond(['success' => false, 'error' => "El ciclo {$ciclo['nombre']} ya está cerrado: no se pueden {$que}. Si hace falta una corrección, la administración puede reabrir el ciclo y volver a cerrarlo."]);
    }
}

/* ───────────────────────── Expediente (F1) ───────────────────────── */

/**
 * Registra un movimiento en el expediente del alumno si la fase F1
 * (lib/helpers_alumnos.php) ya está integrada. Nunca truena: un movimiento
 * que no se pudo anotar no debe tumbar una inscripción ni una promoción.
 */
function escolar_registrar_movimiento($pdo, $escuela_id, $cliente_id, $tipo, $motivo = null, $detalle = null, $usuario_id = null) {
    if (!function_exists('alumno_registrar_movimiento')) return false;
    try {
        alumno_registrar_movimiento($pdo, intval($escuela_id), intval($cliente_id), $tipo, $motivo, $detalle, $usuario_id ? intval($usuario_id) : null);
        return true;
    } catch (\Throwable $e) {
        log_api("escolar: no se pudo registrar movimiento {$tipo} del alumno #{$cliente_id} -> " . $e->getMessage());
        return false;
    }
}

/* ───────────────────────── Catálogo de grados ───────────────────────── */

/** Catálogo de la escuela en orden de avance. */
function escolar_grados($pdo, $escuela_id) {
    $st = $pdo->prepare("SELECT id, nivel, grado, nombre_corto, orden, siguiente_id, activo FROM niveles_grados WHERE escuela_id = ? ORDER BY orden, id");
    $st->execute([intval($escuela_id)]);
    return array_map(function ($g) {
        $g['id'] = intval($g['id']);
        $g['orden'] = intval($g['orden']);
        $g['siguiente_id'] = $g['siguiente_id'] !== null ? intval($g['siguiente_id']) : null;
        $g['activo'] = (bool) $g['activo'];
        return $g;
    }, $st->fetchAll());
}

/** Un grado de la escuela, o corta con error. */
function escolar_grado($pdo, $escuela_id, $grado_id) {
    $st = $pdo->prepare("SELECT id, nivel, grado, nombre_corto, orden, siguiente_id, activo FROM niveles_grados WHERE id = ? AND escuela_id = ?");
    $st->execute([intval($grado_id), intval($escuela_id)]);
    $g = $st->fetch();
    if (!$g) respond(['success' => false, 'error' => 'El grado elegido no existe en el catálogo de este colegio.']);
    $g['id'] = intval($g['id']);
    $g['siguiente_id'] = $g['siguiente_id'] !== null ? intval($g['siguiente_id']) : null;
    return $g;
}

/** "3° Primaria" a partir de nivel + grado. */
function escolar_nombre_grado($nivel, $grado) {
    $grado = trim((string) $grado);
    return trim((ctype_digit($grado) ? $grado . '°' : $grado) . ' ' . trim((string) $nivel));
}

/**
 * Minúsculas, sin acentos ni signos (°, º, puntos, guiones): "3er. Primaria"
 * y "3ER PRIMARIA" quedan iguales.
 */
function escolar_norm_texto($s) {
    $s = mb_strtolower(trim((string) $s), 'UTF-8');
    $s = strtr($s, [
        'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n',
        '°' => ' ', 'º' => ' ', 'ª' => ' ', '.' => ' ', '-' => ' ', '_' => ' ', '/' => ' ',
        ',' => ' ', '(' => ' ', ')' => ' ', '#' => ' ',
    ]);
    return trim(preg_replace('/\s+/', ' ', $s));
}

/** Nivel educativo que menciona un texto ya normalizado, o null. */
function escolar_nivel_de_texto($t) {
    if (preg_match('/\b(preescolar|pre escolar|kinder|kindergarten|kinda|jardin|maternal|k[1-3]|kg)\b/', $t)) return 'Preescolar';
    if (preg_match('/\b(preparatoria|prepa|bachillerato|bachiller|bach|media superior)\b/', $t)) return 'Preparatoria';
    if (preg_match('/\b(secundaria|secu|sec)\b/', $t)) return 'Secundaria';
    if (preg_match('/\b(primaria|prim|pri)\b/', $t)) return 'Primaria';
    return null;
}

/**
 * Número de grado que menciona un texto ya normalizado, o null.
 * Entiende "3", "3er", "3ro", "k2", "tercero", "tercer", "III".
 * (?<!\d)…(?!\d) evita leer el ciclo "2026-2027" como grado.
 */
function escolar_numero_de_texto($t) {
    if (preg_match('/\bk\s?([1-3])\b/', $t, $m)) return intval($m[1]);
    if (preg_match('/(?<!\d)([1-9])(?!\d)/', $t, $m)) return intval($m[1]);
    $palabras = ['primero' => 1, 'primer' => 1, 'segundo' => 2, 'tercero' => 3, 'tercer' => 3, 'cuarto' => 4, 'quinto' => 5, 'sexto' => 6];
    foreach ($palabras as $p => $n) {
        if (preg_match('/\b' . $p . '\b/', $t)) return $n;
    }
    $romanos = ['i' => 1, 'ii' => 2, 'iii' => 3, 'iv' => 4, 'v' => 5, 'vi' => 6];
    if (preg_match('/\b(iii|ii|iv|vi|v|i)\b/', $t, $m)) return $romanos[$m[1]];
    return null;
}

/**
 * Prepara el catálogo una vez para sugerir muchos textos sin repetir la
 * normalización por cada alumno.
 */
function escolar_preparar_catalogo_sugerencias(array $grados) {
    $prep = [];
    foreach ($grados as $g) {
        if (empty($g['activo'])) continue;
        $nivelNorm = escolar_norm_texto($g['nivel']);
        $prep[] = [
            'id'     => intval($g['id']),
            'exacto' => array_unique([
                escolar_norm_texto($g['nombre_corto']),
                escolar_norm_texto($g['nivel'] . ' ' . $g['grado']),
                escolar_norm_texto($g['grado'] . ' ' . $g['nivel']),
            ]),
            'nivel'  => escolar_nivel_de_texto($nivelNorm) ?: $nivelNorm,
            'numero' => escolar_numero_de_texto(escolar_norm_texto($g['grado'])),
        ];
    }
    return $prep;
}

/**
 * Sugiere un grado del catálogo para el texto libre de clientes.grado.
 * Devuelve ['grado_id' => int, 'confianza' => 'alta'|'baja'] o null.
 *   alta → coincide exacto con el nombre, o nivel + número sin ambigüedad.
 *   baja → el texto no dice nivel ("3°") y solo un grado activo tiene ese
 *          número: se sugiere, pero el asistente lo marca para revisarlo.
 */
function escolar_sugerir_grado($texto, array $catalogoPreparado) {
    $t = escolar_norm_texto($texto);
    if ($t === '') return null;
    foreach ($catalogoPreparado as $g) {
        if (in_array($t, $g['exacto'], true)) return ['grado_id' => $g['id'], 'confianza' => 'alta'];
    }
    $num = escolar_numero_de_texto($t);
    if ($num === null) return null;
    $nivel = escolar_nivel_de_texto($t);
    $coinciden = array_values(array_filter($catalogoPreparado, function ($g) use ($num, $nivel) {
        return $g['numero'] === $num && ($nivel === null || $g['nivel'] === $nivel);
    }));
    if (count($coinciden) !== 1) return null;
    return ['grado_id' => $coinciden[0]['id'], 'confianza' => $nivel !== null ? 'alta' : 'baja'];
}

/**
 * Pone al alumno en un grado del catálogo: clientes.grado_id y, para que la
 * ficha de Alumnos no siga mostrando el grado viejo, también el texto
 * clientes.grado (= nombre_corto). Devuelve el grado_id anterior si hubo
 * cambio, o false si ya estaba en ese grado.
 *
 * El texto va en su propia sentencia y con try/catch: si el nombre del grado
 * no cupiera en la columna de texto, lo que importa (grado_id) ya quedó.
 */
function escolar_asignar_grado_alumno($pdo, $escuela_id, $cliente_id, array $grado) {
    $st = $pdo->prepare("SELECT grado_id FROM clientes WHERE id = ? AND escuela_id = ?");
    $st->execute([intval($cliente_id), intval($escuela_id)]);
    $anterior = $st->fetchColumn();
    if ($anterior === false) return false;
    $anterior = $anterior !== null ? intval($anterior) : null;
    if ($anterior === intval($grado['id'])) return false;
    $pdo->prepare("UPDATE clientes SET grado_id = ? WHERE id = ? AND escuela_id = ?")
        ->execute([intval($grado['id']), intval($cliente_id), intval($escuela_id)]);
    try {
        $pdo->prepare("UPDATE clientes SET grado = ? WHERE id = ? AND escuela_id = ?")
            ->execute([$grado['nombre_corto'], intval($cliente_id), intval($escuela_id)]);
    } catch (\PDOException $e) {
        log_api("escolar: no se pudo copiar el texto del grado al alumno #{$cliente_id} -> " . $e->getMessage());
    }
    return ['anterior' => $anterior];
}
