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
 *
 * $copiar_texto = false lo usa el asistente de mapeo: ahí el alumno NO cambia
 * de grado, solo se liga su texto ("3er Primaria") con el catálogo, así que
 * no hay por qué reescribir lo que capturó el colegio.
 */
function escolar_asignar_grado_alumno($pdo, $escuela_id, $cliente_id, array $grado, $copiar_texto = true) {
    $st = $pdo->prepare("SELECT grado_id FROM clientes WHERE id = ? AND escuela_id = ?");
    $st->execute([intval($cliente_id), intval($escuela_id)]);
    $anterior = $st->fetchColumn();
    if ($anterior === false) return false;
    $anterior = $anterior !== null ? intval($anterior) : null;
    if ($anterior === intval($grado['id'])) return false;
    $pdo->prepare("UPDATE clientes SET grado_id = ? WHERE id = ? AND escuela_id = ?")
        ->execute([intval($grado['id']), intval($cliente_id), intval($escuela_id)]);
    if (!$copiar_texto) return ['anterior' => $anterior];
    try {
        $pdo->prepare("UPDATE clientes SET grado = ? WHERE id = ? AND escuela_id = ?")
            ->execute([$grado['nombre_corto'], intval($cliente_id), intval($escuela_id)]);
    } catch (\PDOException $e) {
        log_api("escolar: no se pudo copiar el texto del grado al alumno #{$cliente_id} -> " . $e->getMessage());
    }
    return ['anterior' => $anterior];
}

/**
 * Alinea clientes.grado_id con el grado de un grupo al que se acaba de
 * inscribir al alumno (o cuyo grado se acaba de definir). Devuelve el
 * movimiento 'cambio_grado' que hay que anotar en el expediente, o null si no
 * hubo cambio. NO lo anota aquí: quien llama lo registra después del commit,
 * para que un movimiento nunca quede a medias dentro de una transacción.
 */
function escolar_alinear_grado_alumno($pdo, $escuela_id, $cliente_id, array $grado, $contexto = []) {
    $cambio = escolar_asignar_grado_alumno($pdo, $escuela_id, $cliente_id, $grado);
    if (!$cambio) return null;
    return [
        'cliente_id' => intval($cliente_id),
        'tipo'       => 'cambio_grado',
        'motivo'     => 'Pasa a ' . $grado['nombre_corto'],
        'detalle'    => array_merge([
            'grado_anterior_id' => $cambio['anterior'],
            'grado_nuevo_id'    => intval($grado['id']),
            'grado_nuevo'       => $grado['nombre_corto'],
        ], $contexto),
    ];
}

/** Registra en el expediente una lista de movimientos pendientes (ver arriba). */
function escolar_registrar_movimientos($pdo, $escuela_id, array $movimientos, $usuario_id) {
    foreach ($movimientos as $m) {
        escolar_registrar_movimiento($pdo, $escuela_id, $m['cliente_id'], $m['tipo'], $m['motivo'] ?? null, $m['detalle'] ?? null, $usuario_id);
    }
}

/* ───────────────────────── Cierre de ciclo ───────────────────────── */

/**
 * Resultado final de un alumno a partir de su boleta (escolar_armar_boleta).
 *   · Calificación final por materia = promedio de los periodos que tienen
 *     calificación (el mismo 'promedio' que ya ve en su boleta).
 *   · Promedio final = promedio de esas finales.
 *   · Resultado: 'aprobado' si el promedio final alcanza la calificación
 *     aprobatoria del ciclo, 'reprobado' si no, 'sin_calificar' si no tiene
 *     ninguna calificación. Las materias reprobadas se guardan aparte para
 *     que la coordinación las vea en la promoción y decida (forzar/excluir):
 *     las reglas de la SEP cambian por nivel y no se adivinan aquí.
 */
function escolar_resultado_final(array $boleta, $calif_aprobatoria) {
    $aprob = floatval($calif_aprobatoria);
    $materias = [];
    $reprobadas = 0;
    foreach ($boleta['materias'] as $m) {
        $final = $m['promedio'] !== null ? floatval($m['promedio']) : null;
        if ($final !== null && $final < $aprob) $reprobadas++;
        $materias[] = ['materia_id' => intval($m['materia_id'] ?? 0), 'nombre' => $m['materia'], 'final' => $final];
    }
    $prom = $boleta['promedio_general'];
    if ($prom === null) {
        $resultado = 'sin_calificar';
    } else {
        $resultado = floatval($prom) >= $aprob ? 'aprobado' : 'reprobado';
    }
    return [
        'promedio_final'      => $prom !== null ? floatval($prom) : null,
        'resultado'           => $resultado,
        'materias_reprobadas' => $reprobadas,
        'materias'            => $materias,
    ];
}

/* ───────────────────────── Promoción ───────────────────────── */

/**
 * Calcula (sin escribir nada) qué le pasa a cada alumno activo inscrito en el
 * ciclo de origen al promover al ciclo destino. Lo usan la vista previa y la
 * aplicación de escolar_promover.php: las dos corren EXACTAMENTE este mismo
 * cálculo, y el 'token' (huella del plan) garantiza que se aplica lo mismo
 * que se revisó.
 *
 * Acciones por alumno:
 *   promover      → aprobado (o forzado): pasa al siguiente grado del catálogo.
 *   egresar       → aprobado en un grado sin siguiente (último que ofrece la escuela).
 *   repetir       → reprobado: se queda en el mismo grado.
 *   revisar       → sin calificaciones: no se mueve hasta que lo fuercen o excluyan.
 *   excluido      → lo pidió quien promueve.
 *   ya_procesado  → ya se promovió en una corrida anterior (no se repite).
 *   sin_historial → lo inscribieron después del cierre: hay que re-cerrar.
 *   sin_grado     → ni su grupo ni su ficha tienen grado del catálogo.
 */
function escolar_plan_promocion($pdo, $escuela_id, array $origen, array $destino, array $mapeo, array $excluir, array $forzar) {
    $eid = intval($escuela_id);
    $excluir = array_flip(array_map('intval', $excluir));
    $forzar  = array_flip(array_map('intval', $forzar));

    $grados = [];
    foreach (escolar_grados($pdo, $eid) as $g) $grados[$g['id']] = $g;

    $st = $pdo->prepare("SELECT id, nombre, grado_id, cupo FROM grupos WHERE escuela_id = ? AND ciclo_id = ?");
    $st->execute([$eid, intval($origen['id'])]);
    $gruposOrigen = [];
    foreach ($st->fetchAll() as $g) $gruposOrigen[intval($g['id'])] = $g;
    $st->execute([$eid, intval($destino['id'])]);
    $gruposDestino = [];
    foreach ($st->fetchAll() as $g) $gruposDestino[intval($g['id'])] = $g;

    $map = [];
    foreach ($mapeo as $go => $gd) {
        $go = intval($go); $gd = intval($gd);
        if (!$go || !$gd) continue;
        if (!isset($gruposOrigen[$go]))  respond(['success' => false, 'error' => 'Un grupo de origen del mapeo no pertenece al ciclo de origen.']);
        if (!isset($gruposDestino[$gd])) respond(['success' => false, 'error' => 'Un grupo destino del mapeo no pertenece al ciclo destino.']);
        $map[$go] = $gd;
    }

    // Quién ya está inscrito (activo) en el ciclo destino y en qué grupo: para
    // el cupo y para no contar dos veces a quien ya estaba en su grupo.
    $st = $pdo->prepare(
        "SELECT ga.grupo_id, ga.cliente_id FROM grupo_alumnos ga JOIN grupos g ON g.id = ga.grupo_id
         WHERE g.escuela_id = ? AND g.ciclo_id = ? AND ga.activo = 1"
    );
    $st->execute([$eid, intval($destino['id'])]);
    $ocupacion = [];     // grupo destino => alumnos activos hoy
    $yaEnGrupo = [];     // "grupo|cliente" => true
    foreach ($st->fetchAll() as $r) {
        $gid = intval($r['grupo_id']);
        $ocupacion[$gid] = ($ocupacion[$gid] ?? 0) + 1;
        $yaEnGrupo[$gid . '|' . intval($r['cliente_id'])] = true;
    }

    // Alumnos activos con inscripción activa en el ciclo de origen. Si por
    // algún dato viejo tuviera dos inscripciones activas, manda la más reciente.
    $st = $pdo->prepare(
        "SELECT c.id, c.nombre, c.matricula, c.grado_id AS grado_cliente,
                ga.grupo_id, g.nombre AS grupo, g.grado_id AS grado_grupo,
                h.id AS historial_id, h.resultado, h.promedio_final, h.materias_reprobadas,
                h.grado_id AS grado_historial, h.promovido_a_ciclo_id, h.promocion_accion
         FROM grupo_alumnos ga
         JOIN grupos g   ON g.id = ga.grupo_id
         JOIN clientes c ON c.id = ga.cliente_id
         LEFT JOIN historial_academico h ON h.cliente_id = c.id AND h.ciclo_id = g.ciclo_id
         WHERE g.escuela_id = ? AND g.ciclo_id = ? AND ga.activo = 1
           AND c.escuela_id = ? AND c.activo = 1 AND COALESCE(c.tipo,'alumno') = 'alumno'
         ORDER BY c.nombre, c.id, ga.id DESC"
    );
    $st->execute([$eid, intval($origen['id']), $eid]);

    $filas = [];
    $vistos = [];
    $nuevosEnGrupo = []; // grupo destino => altas que agrega este plan
    foreach ($st->fetchAll() as $r) {
        $cid = intval($r['id']);
        if (isset($vistos[$cid])) continue;
        $vistos[$cid] = true;

        $gradoActualId = $r['grado_historial'] ?? $r['grado_grupo'] ?? $r['grado_cliente'];
        $gradoActualId = $gradoActualId !== null ? intval($gradoActualId) : null;
        $gradoActual = $gradoActualId && isset($grados[$gradoActualId]) ? $grados[$gradoActualId] : null;
        $forzado = isset($forzar[$cid]);

        $f = [
            'cliente_id'          => $cid,
            'nombre'              => $r['nombre'],
            'matricula'           => $r['matricula'],
            'grupo_origen_id'     => intval($r['grupo_id']),
            'grupo_origen'        => $r['grupo'],
            'resultado'           => $r['historial_id'] ? $r['resultado'] : null,
            'promedio'            => $r['promedio_final'] !== null ? floatval($r['promedio_final']) : null,
            'materias_reprobadas' => intval($r['materias_reprobadas'] ?? 0),
            'grado_actual_id'     => $gradoActual ? $gradoActual['id'] : null,
            'grado_actual'        => $gradoActual ? $gradoActual['nombre_corto'] : null,
            'forzado'             => $forzado,
            'accion'              => null,
            'grado_nuevo_id'      => null,
            'grado_nuevo'         => null,
            'grupo_destino_id'    => null,
            'grupo_destino'       => null,
            'aviso'               => null,
        ];

        if (isset($excluir[$cid])) {
            $f['accion'] = 'excluido';
        } elseif ($r['promovido_a_ciclo_id'] !== null) {
            $f['accion'] = 'ya_procesado';
            $f['aviso'] = 'Ya se procesó antes (' . ($r['promocion_accion'] ?: 'promoción') . ').';
        } elseif (!$r['historial_id']) {
            $f['accion'] = 'sin_historial';
            $f['aviso'] = 'No tiene resultado del cierre: reabre y vuelve a cerrar el ciclo de origen.';
        } elseif (!$gradoActual) {
            $f['accion'] = 'sin_grado';
            $f['aviso'] = 'Ni su grupo ni su ficha tienen un grado del catálogo.';
        } elseif ($r['resultado'] === 'aprobado' || $forzado) {
            $sig = $gradoActual['siguiente_id'];
            if ($sig && isset($grados[$sig])) {
                $f['accion'] = 'promover';
                $f['grado_nuevo_id'] = $sig;
                $f['grado_nuevo'] = $grados[$sig]['nombre_corto'];
            } else {
                $f['accion'] = 'egresar';
                if (!function_exists('alumno_cambiar_estatus')) {
                    $f['aviso'] = 'Egresa, pero el expediente de alumnos aún no está instalado: su estatus no se cambiará automáticamente.';
                }
            }
        } elseif ($r['resultado'] === 'reprobado') {
            $f['accion'] = 'repetir';
            $f['grado_nuevo_id'] = $gradoActual['id'];
            $f['grado_nuevo'] = $gradoActual['nombre_corto'];
        } else {
            $f['accion'] = 'revisar';
            $f['aviso'] = 'Sin calificaciones: márcalo para promoverlo o exclúyelo.';
        }

        // Grupo destino según el mapeo. Solo si el grupo es del grado al que
        // va el alumno (o el grupo no tiene grado): así un alumno que repite
        // no termina en el grupo de los que sí pasaron.
        if (in_array($f['accion'], ['promover', 'repetir'], true) && isset($map[$f['grupo_origen_id']])) {
            $gd = $gruposDestino[$map[$f['grupo_origen_id']]];
            $gdId = intval($gd['id']);
            $yaEsta = isset($yaEnGrupo[$gdId . '|' . $cid]);
            if ($gd['grado_id'] !== null && intval($gd['grado_id']) !== $f['grado_nuevo_id']) {
                $f['aviso'] = 'No se inscribe en ' . $gd['nombre'] . ' porque ese grupo es de otro grado; inscríbelo a mano.';
            } elseif (!$yaEsta && $gd['cupo'] && ($ocupacion[$gdId] ?? 0) + ($nuevosEnGrupo[$gdId] ?? 0) >= intval($gd['cupo'])) {
                $f['aviso'] = 'El grupo ' . $gd['nombre'] . ' ya no tiene cupo; inscríbelo a mano.';
            } else {
                $f['grupo_destino_id'] = $gdId;
                $f['grupo_destino'] = $gd['nombre'];
                if (!$yaEsta) $nuevosEnGrupo[$gdId] = ($nuevosEnGrupo[$gdId] ?? 0) + 1;
            }
        }
        $filas[] = $f;
    }

    $resumen = [];
    foreach ($filas as $f) $resumen[$f['accion']] = ($resumen[$f['accion']] ?? 0) + 1;

    // Huella del plan: si algo cambia entre la vista previa y la aplicación
    // (otra persona inscribió, re-cerró el ciclo, cambió el catálogo…), el
    // token ya no coincide y hay que volver a revisar.
    $huella = array_map(function ($f) {
        return [$f['cliente_id'], $f['accion'], $f['grado_actual_id'], $f['grado_nuevo_id'], $f['grupo_destino_id']];
    }, $filas);
    $token = hash('sha256', json_encode([intval($origen['id']), intval($destino['id']), $huella]));

    return ['filas' => $filas, 'resumen' => $resumen, 'token' => $token];
}

/**
 * Inscribe a un alumno en un grupo y lo da de baja (lógica) de cualquier otro
 * grupo activo del MISMO ciclo — la misma regla de escolar_inscribir_alumnos.
 * Devuelve cuántas inscripciones anteriores se cerraron.
 */
function escolar_inscribir_en_grupo($pdo, $escuela_id, $cliente_id, array $grupo) {
    $baja = $pdo->prepare(
        "UPDATE grupo_alumnos ga JOIN grupos g ON g.id = ga.grupo_id
         SET ga.activo = 0, ga.fecha_baja = CURDATE()
         WHERE ga.cliente_id = ? AND ga.activo = 1 AND g.ciclo_id = ? AND ga.grupo_id <> ?"
    );
    $baja->execute([intval($cliente_id), intval($grupo['ciclo_id']), intval($grupo['id'])]);
    $pdo->prepare(
        "INSERT INTO grupo_alumnos (escuela_id, grupo_id, cliente_id, fecha_alta, activo)
         VALUES (?, ?, ?, CURDATE(), 1)
         ON DUPLICATE KEY UPDATE activo = 1, fecha_baja = NULL"
    )->execute([intval($escuela_id), intval($grupo['id']), intval($cliente_id)]);
    return $baja->rowCount();
}

/* ───────────────────────── Kárdex ───────────────────────── */

/**
 * Trayectoria del alumno ciclo por ciclo.
 *   · Ciclo cerrado con historial → lo que se guardó al cerrar (no cambia
 *     aunque después se renombre el grupo o el grado).
 *   · Ciclo abierto (el actual o uno que nunca se cerró, o uno reabierto) →
 *     se calcula en vivo con la boleta. Familia/alumno: solo periodos
 *     publicados ($solo_publicados).
 */
function escolar_kardex($pdo, $escuela_id, $cliente_id, $solo_publicados) {
    $eid = intval($escuela_id);
    $cid = intval($cliente_id);

    $st = $pdo->prepare(
        "SELECT h.*, c.nombre AS ciclo_nombre, c.fecha_inicio, c.fecha_fin, c.cerrado AS ciclo_cerrado, c.calif_aprobatoria
         FROM historial_academico h
         JOIN ciclos_escolares c ON c.id = h.ciclo_id
         WHERE h.cliente_id = ? AND h.escuela_id = ?"
    );
    $st->execute([$cid, $eid]);
    $historial = [];
    foreach ($st->fetchAll() as $h) $historial[intval($h['ciclo_id'])] = $h;

    // Ciclos en los que estuvo inscrito (aunque no se hayan cerrado).
    $st = $pdo->prepare(
        "SELECT DISTINCT c.* FROM grupo_alumnos ga
         JOIN grupos g ON g.id = ga.grupo_id
         JOIN ciclos_escolares c ON c.id = g.ciclo_id
         WHERE ga.cliente_id = ? AND g.escuela_id = ?"
    );
    $st->execute([$cid, $eid]);
    $ciclos = [];
    foreach ($st->fetchAll() as $c) $ciclos[intval($c['id'])] = $c;

    $grados = [];
    foreach (escolar_grados($pdo, $eid) as $g) $grados[$g['id']] = $g;
    $actual = escolar_ciclo_actual($pdo, $eid);

    $filas = [];
    foreach (array_unique(array_merge(array_keys($historial), array_keys($ciclos))) as $ciclo_id) {
        $h = $historial[$ciclo_id] ?? null;
        if ($h && intval($h['ciclo_cerrado']) === 1) {
            $mats = json_decode($h['materias'] ?? '[]', true);
            $filas[] = [
                'ciclo_id'            => intval($ciclo_id),
                'ciclo'               => $h['ciclo_nombre'],
                'fecha_inicio'        => $h['fecha_inicio'],
                'estado'              => 'cerrado',
                'calif_aprobatoria'   => floatval($h['calif_aprobatoria']),
                'grado'               => $h['grado_nombre'],
                'grupo'               => $h['grupo_nombre'],
                'promedio'            => $h['promedio_final'] !== null ? floatval($h['promedio_final']) : null,
                'resultado'           => $h['resultado'],
                'materias_reprobadas' => intval($h['materias_reprobadas']),
                'materias'            => is_array($mats) ? $mats : [],
                'promocion'           => $h['promocion_accion'],
            ];
            continue;
        }
        $ciclo = $ciclos[$ciclo_id] ?? null;
        if (!$ciclo) {
            $st = $pdo->prepare("SELECT * FROM ciclos_escolares WHERE id = ? AND escuela_id = ?");
            $st->execute([$ciclo_id, $eid]);
            $ciclo = $st->fetch();
            if (!$ciclo) continue;
        }
        $b = escolar_armar_boleta($pdo, $eid, $cid, $ciclo, ['solo_publicados' => $solo_publicados, 'sin_asistencia' => true]);
        $r = escolar_resultado_final($b, $ciclo['calif_aprobatoria']);
        // Grado: el del catálogo si el grupo lo tiene; si no, el texto del grupo.
        $gradoId = $b['grupo']['grado_id'] ?? null;
        $gradoNombre = null;
        if ($gradoId && isset($grados[$gradoId])) {
            $gradoNombre = $grados[$gradoId]['nombre_corto'];
        } elseif ($b['grupo']) {
            $gradoNombre = trim(($b['grupo']['grado'] ?? '') . ' ' . ($b['grupo']['nivel'] ?? '')) ?: null;
        }
        $filas[] = [
            'ciclo_id'            => intval($ciclo_id),
            'ciclo'               => $ciclo['nombre'],
            'fecha_inicio'        => $ciclo['fecha_inicio'],
            'estado'              => $actual && intval($actual['id']) === intval($ciclo_id) ? 'en_curso' : 'sin_cerrar',
            'calif_aprobatoria'   => floatval($ciclo['calif_aprobatoria']),
            'grado'               => $gradoId && isset($grados[$gradoId]) ? $grados[$gradoId]['nombre_corto'] : ($b['grupo'] ? trim(($b['grupo']['grado'] ?? '') . ' ' . ($b['grupo']['nivel'] ?? '')) ?: null : null),
            'grupo'               => $b['grupo']['nombre'] ?? null,
            'promedio'            => $r['promedio_final'],
            // En un ciclo abierto todavía no hay resultado oficial.
            'resultado'           => null,
            'materias_reprobadas' => $r['materias_reprobadas'],
            'materias'            => $r['materias'],
            'promocion'           => null,
        ];
    }
    usort($filas, function ($a, $b) { return strcmp((string) $a['fecha_inicio'], (string) $b['fecha_inicio']); });

    $cerrados = array_values(array_filter(array_column(array_filter($filas, function ($f) { return $f['estado'] === 'cerrado'; }), 'promedio'), function ($p) { return $p !== null; }));
    return [
        'ciclos'          => $filas,
        'promedio_global' => $cerrados ? escolar_redondear(array_sum($cerrados) / count($cerrados)) : null,
    ];
}
