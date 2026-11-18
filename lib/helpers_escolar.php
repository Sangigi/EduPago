<?php
/**
 * lib/helpers_escolar.php — Control escolar (13-nov-2026)
 *
 * Reglas de acceso del módulo académico, en UN solo lugar. Cada acción
 * acciones/escolar_*.php empieza con escolar_ctx() y después usa
 * escolar_grupo() / escolar_gm() para comprobar que la fila que toca es de su
 * escuela y —si es docente— de su salón.
 *
 * QUIÉN PUEDE QUÉ
 *   superadmin → todo, en la escuela que mande en $input['escuela_id'].
 *   admin      → todo, solo en su escuela.
 *   docente    → solo los grupos donde es tutor o imparte alguna materia:
 *                pasa lista (si es tutor o da clase en el grupo) y califica
 *                SOLO sus materias, y solo en periodos abiertos.
 *   familia    → solo lectura de la boleta/asistencias de SUS hijos.
 *   cajero     → nada: su trabajo es la caja, no lo académico.
 *   [F3] control_escolar → lo mismo que admin dentro del módulo (es la
 *                coordinación académica): ver escolar_es_gestor().
 *   [F3] direccion → solo lectura de todo lo académico de su escuela; ninguna
 *                acción de escritura la incluye en su lista de roles.
 *   [F3] alumno → solo su propia boleta y su kárdex (periodos publicados).
 *
 * El rol 'docente' además está en el allowlist explícito de api.php
 * ($ACCIONES_POR_ROL_PLATAFORMA), así que aunque una acción futura olvide
 * llamar a escolar_ctx(), un docente no puede llegar a cobros ni a
 * cargar_datos (que le mandaría saldos y pagos de toda la escuela).
 */

// Ids de sección del menú (ver SECCIONES_DISPONIBLES en api.php y NAV_ITEMS en
// assets/js/app.js). El super admin puede apagar cualquiera por colegio.
const ESCOLAR_SECCIONES = ['escolar_grupos', 'escolar_asistencias', 'escolar_calificaciones', 'escolar_config'];

const ESCOLAR_ESTADOS_ASISTENCIA = ['presente', 'falta', 'retardo', 'justificada'];

// [F3] Listas de roles del módulo, en un solo lugar para que cada acción no
// las escriba a mano (y no se le olvide 'control_escolar' a ninguna).
//   GESTOR  → escriben configuración, inscripciones, cierres y promociones.
//   LECTURA → además 'direccion', que solo consulta. Las acciones de escritura
//             usan ESCOLAR_ROLES_GESTOR (+ 'docente' donde aplica), nunca esta.
const ESCOLAR_ROLES_GESTOR  = ['superadmin', 'admin', 'control_escolar'];
const ESCOLAR_ROLES_LECTURA = ['superadmin', 'admin', 'control_escolar', 'direccion'];

/**
 * Valida rol + escuela + sección habilitada + que la migración exista.
 * Devuelve ['rol','escuela_id','user_id','familia_id'].
 *
 * $roles: roles admitidos por la acción que llama.
 * $secciones: secciones "dueñas" (basta con que UNA siga habilitada).
 */
function escolar_ctx($pdo, $usuario_actual, $input, array $roles, $secciones = ESCOLAR_SECCIONES) {
    $rol = $usuario_actual['rol'] ?? '';
    requerir_rol($rol, $roles, 'No tienes permiso para esta acción del control escolar.');

    if ($rol === 'superadmin') {
        $escuela_id = intval($input['escuela_id'] ?? $_GET['escuela_id'] ?? 0);
        if (!$escuela_id) respond(['success' => false, 'error' => 'Selecciona un colegio primero.']);
    } else {
        $escuela_id = intval($usuario_actual['escuela_id'] ?? 0);
        if (!$escuela_id) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'Tu cuenta no está ligada a ningún colegio.']);
        }
    }

    // requerir_seccion_habilitada() solo actúa para 'admin'/'cajero' (ver
    // api.php). Para docente y familia se evalúa COMO SI fueran admin: si el
    // super admin apagó el módulo escolar para el colegio, también se les
    // corta a ellos — sería absurdo que el docente siguiera capturando en un
    // módulo que el colegio no tiene.
    if ($rol !== 'superadmin') {
        requerir_seccion_habilitada($pdo, 'admin', $escuela_id, (array) $secciones,
            'El control escolar no está habilitado para este colegio.');
    }

    // Migración pendiente: mensaje claro en vez de un 500 genérico.
    try {
        $pdo->query("SELECT 1 FROM calificaciones LIMIT 1");
    } catch (\PDOException $e) {
        log_api("escolar: tablas no encontradas (¿falta migracion_2026_11_13_control_escolar.sql?) -> " . $e->getMessage());
        respond(['success' => false, 'error' => 'El módulo escolar aún no está instalado en la base de datos (falta correr migracion_2026_11_13_control_escolar.sql).']);
    }

    // [F3] Igual para las columnas/tablas de la F3 (grados, publicación,
    // cierre de ciclo, historial). LIMIT 0 no lee ninguna fila: solo obliga a
    // MySQL a resolver los nombres, que es justo lo que falla si falta la
    // migración. Una sola vez por petición.
    static $f3_verificada = false;
    if (!$f3_verificada) {
        try {
            $pdo->query(
                "SELECT p.publicado, c.cerrado, c.cerrado_en, g.grado_id, cl.grado_id, n.siguiente_id, h.resultado, h.promovido_a_ciclo_id
                 FROM periodos_evaluacion p, ciclos_escolares c, grupos g, clientes cl, niveles_grados n, historial_academico h
                 LIMIT 0"
            );
            $f3_verificada = true;
        } catch (\PDOException $e) {
            log_api("escolar: faltan columnas de la F3 (¿falta migracion_2026_11_18_f3_control_escolar.sql?) -> " . $e->getMessage());
            respond(['success' => false, 'error' => 'El control escolar necesita una actualización de la base de datos (falta correr migracion_2026_11_18_f3_control_escolar.sql).']);
        }
    }

    return [
        'rol'        => $rol,
        'escuela_id' => $escuela_id,
        'user_id'    => intval($usuario_actual['user_id'] ?? 0),
        'familia_id' => $usuario_actual['familia_id'] ?? null,
        // [F3] Cuenta de alumno: a qué clientes.id está ligada (0 = a ninguno).
        'cliente_id' => $rol === 'alumno' ? escolar_cliente_id_de_usuario($pdo, $usuario_actual) : null,
    ];
}

function escolar_es_gestor($ctx) {
    // [F3] 'control_escolar' (coordinación académica) gestiona igual que admin.
    return in_array($ctx['rol'], ESCOLAR_ROLES_GESTOR, true);
}

function escolar_requerir_gestor($ctx, $mensaje = 'Solo la administración del colegio puede hacer esto.') {
    if (!escolar_es_gestor($ctx)) {
        http_response_code(403);
        respond(['success' => false, 'error' => $mensaje]);
    }
}

function escolar_403($mensaje) {
    http_response_code(403);
    respond(['success' => false, 'error' => $mensaje]);
}

/** ¿El docente es tutor del grupo o imparte alguna materia en él? */
function escolar_docente_en_grupo($pdo, $docente_id, $grupo_id) {
    $st = $pdo->prepare(
        "SELECT 1 FROM grupos WHERE id = ? AND tutor_id = ?
         UNION SELECT 1 FROM grupo_materias WHERE grupo_id = ? AND docente_id = ? LIMIT 1"
    );
    $st->execute([$grupo_id, $docente_id, $grupo_id, $docente_id]);
    return (bool) $st->fetchColumn();
}

/** Carga un grupo de la escuela del contexto; si es docente, debe ser suyo. */
function escolar_grupo($pdo, $ctx, $grupo_id) {
    $grupo_id = intval($grupo_id);
    $st = $pdo->prepare("SELECT * FROM grupos WHERE id = ? AND escuela_id = ?");
    $st->execute([$grupo_id, $ctx['escuela_id']]);
    $g = $st->fetch();
    if (!$g) respond(['success' => false, 'error' => 'Grupo no encontrado.']);
    if ($ctx['rol'] === 'docente' && !escolar_docente_en_grupo($pdo, $ctx['user_id'], $grupo_id)) {
        escolar_403('Ese grupo no está asignado a ti.');
    }
    return $g;
}

/**
 * Carga una asignación grupo-materia. Si es docente:
 *   - para LEER basta con estar en el grupo (el tutor ve todas las materias);
 *   - para ESCRIBIR calificaciones tiene que ser el docente de esa materia.
 */
function escolar_gm($pdo, $ctx, $gm_id, $para_escribir = false) {
    $st = $pdo->prepare(
        "SELECT gm.*, m.nombre AS materia, g.nombre AS grupo, g.ciclo_id, g.tutor_id
         FROM grupo_materias gm
         JOIN materias m ON m.id = gm.materia_id
         JOIN grupos g   ON g.id = gm.grupo_id
         WHERE gm.id = ? AND gm.escuela_id = ?"
    );
    $st->execute([intval($gm_id), $ctx['escuela_id']]);
    $gm = $st->fetch();
    if (!$gm) respond(['success' => false, 'error' => 'Materia del grupo no encontrada.']);
    if ($ctx['rol'] === 'docente') {
        $esSuya = intval($gm['docente_id']) === $ctx['user_id'];
        if ($para_escribir && !$esSuya) escolar_403('Solo el docente asignado puede calificar esta materia.');
        // [F3] Leer calificaciones de una materia AJENA solo lo puede el
        // tutor del grupo (es quien da seguimiento a todo el salón). Antes
        // bastaba con dar cualquier materia en el grupo, así que el maestro de
        // Inglés podía abrir la sábana de Matemáticas de otro docente.
        if (!$esSuya && intval($gm['tutor_id']) !== $ctx['user_id']) {
            escolar_403('Esa materia no está asignada a ti.');
        }
    }
    return $gm;
}

function escolar_ciclo($pdo, $escuela_id, $ciclo_id) {
    $st = $pdo->prepare("SELECT * FROM ciclos_escolares WHERE id = ? AND escuela_id = ?");
    $st->execute([intval($ciclo_id), $escuela_id]);
    $c = $st->fetch();
    if (!$c) respond(['success' => false, 'error' => 'Ciclo escolar no encontrado.']);
    return $c;
}

function escolar_ciclo_actual($pdo, $escuela_id) {
    $st = $pdo->prepare("SELECT * FROM ciclos_escolares WHERE escuela_id = ? ORDER BY actual DESC, fecha_inicio DESC LIMIT 1");
    $st->execute([$escuela_id]);
    return $st->fetch() ?: null;
}

function escolar_fecha($valor, $etiqueta = 'fecha', $opcional = false) {
    $v = trim((string) $valor);
    if ($v === '' && $opcional) return null;
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) || !strtotime($v)) {
        respond(['success' => false, 'error' => "La {$etiqueta} no es válida."]);
    }
    return $v;
}

function escolar_hora($valor, $etiqueta) {
    $v = trim((string) $valor);
    if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/', $v)) {
        respond(['success' => false, 'error' => "La hora de {$etiqueta} no es válida (usa HH:MM)."]);
    }
    return strlen($v) === 5 ? $v . ':00' : $v;
}

/** Valida que un usuario sea docente activo de la escuela (o null). */
function escolar_validar_docente($pdo, $escuela_id, $docente_id, $etiqueta = 'docente') {
    $docente_id = intval($docente_id);
    if (!$docente_id) return null;
    $st = $pdo->prepare("SELECT id FROM usuarios WHERE id = ? AND escuela_id = ? AND rol IN ('docente','admin') AND activo = 1");
    $st->execute([$docente_id, $escuela_id]);
    if (!$st->fetchColumn()) respond(['success' => false, 'error' => "El {$etiqueta} elegido no es un docente activo de este colegio."]);
    return $docente_id;
}

/** Alumnos activos inscritos en el grupo, en orden de lista. */
function escolar_alumnos_grupo($pdo, $grupo_id) {
    $st = $pdo->prepare(
        "SELECT c.id, c.nombre, c.matricula, c.foto_url, c.activo AS alumno_activo, ga.fecha_alta
         FROM grupo_alumnos ga
         JOIN clientes c ON c.id = ga.cliente_id
         WHERE ga.grupo_id = ? AND ga.activo = 1
         ORDER BY c.nombre"
    );
    $st->execute([intval($grupo_id)]);
    return array_map(function ($r) {
        $r['id'] = intval($r['id']);
        $r['alumno_activo'] = (bool) $r['alumno_activo'];
        return $r;
    }, $st->fetchAll());
}

function escolar_redondear($n, $dec = 1) {
    return $n === null ? null : round(floatval($n), $dec);
}

/**
 * Arma la boleta de un alumno en un ciclo: materias × periodos, promedio por
 * materia, promedio general y resumen de asistencia. La usan la vista de
 * admin, el portal del docente y el portal de familia — una sola cuenta para
 * que las tres pantallas nunca discrepen en un promedio.
 *
 * [F3] $opciones:
 *   'solo_publicados' => true  → solo periodos con publicado = 1 (familia y
 *                                alumno: no ven lo que el colegio aún no publica).
 *   'sin_asistencia'  => true  → no consulta asistencias ('asistencia' = null);
 *                                lo usa el cierre de ciclo, que no la necesita.
 * [F3] Las materias se combinan por materia_id entre TODOS los grupos del
 * ciclo en los que estuvo inscrito el alumno: si se cambió de 3° A a 3° B a
 * medio ciclo, las calificaciones que le pusieron en 3° A ya no se pierden de
 * la boleta. Para un mismo periodo manda la calificación del grupo actual.
 */
function escolar_armar_boleta($pdo, $escuela_id, $cliente_id, $ciclo, $opciones = []) {
    $cliente_id = intval($cliente_id);
    $ciclo_id   = intval($ciclo['id']);
    $solo_publicados = !empty($opciones['solo_publicados']); // [F3]

    $st = $pdo->prepare(
        "SELECT g.id, g.nombre, g.nivel, g.grado, g.turno, g.grado_id, u.nombre AS tutor
         FROM grupo_alumnos ga
         JOIN grupos g ON g.id = ga.grupo_id
         LEFT JOIN usuarios u ON u.id = g.tutor_id
         WHERE ga.cliente_id = ? AND g.ciclo_id = ? AND g.escuela_id = ?
         ORDER BY ga.activo DESC, ga.id DESC LIMIT 1"
    );
    $st->execute([$cliente_id, $ciclo_id, $escuela_id]);
    $grupo = $st->fetch() ?: null;
    if ($grupo) $grupo['grado_id'] = $grupo['grado_id'] !== null ? intval($grupo['grado_id']) : null; // [F3]

    // [F3] + publicado, y filtro de publicados para familia/alumno.
    $st = $pdo->prepare(
        "SELECT id, nombre, orden, cerrado, publicado FROM periodos_evaluacion
         WHERE ciclo_id = ? AND escuela_id = ?" . ($solo_publicados ? " AND publicado = 1" : "") . "
         ORDER BY orden, id"
    );
    $st->execute([$ciclo_id, $escuela_id]);
    $periodos = array_map(function ($p) {
        $p['id'] = intval($p['id']); $p['cerrado'] = (bool) $p['cerrado'];
        $p['publicado'] = (bool) $p['publicado']; // [F3]
        return $p;
    }, $st->fetchAll());
    $periodosValidos = array_flip(array_column($periodos, 'id'));

    // [F3] Materias de todos los grupos del ciclo donde estuvo el alumno. El
    // ORDER BY define la prioridad: primero el grupo actual, luego las
    // inscripciones activas y, al final, las más recientes.
    $materias = [];
    if ($grupo) {
        $st = $pdo->prepare(
            "SELECT gm.id AS gm_id, gm.grupo_id, gm.materia_id, m.nombre AS materia, m.clave, u.nombre AS docente
             FROM grupo_alumnos ga
             JOIN grupos g          ON g.id = ga.grupo_id
             JOIN grupo_materias gm ON gm.grupo_id = g.id
             JOIN materias m        ON m.id = gm.materia_id
             LEFT JOIN usuarios u   ON u.id = gm.docente_id
             WHERE ga.cliente_id = ? AND g.ciclo_id = ? AND g.escuela_id = ?
             ORDER BY (g.id = ?) DESC, ga.activo DESC, ga.id DESC, m.nombre"
        );
        $st->execute([$cliente_id, $ciclo_id, $escuela_id, intval($grupo['id'])]);
        $prioridad = [];   // gm_id => posición (menor = manda)
        $gmMateria = [];   // gm_id => materia_id
        $porMateria = [];  // materia_id => datos de la materia
        foreach ($st->fetchAll() as $i => $m) {
            $gm  = intval($m['gm_id']);
            $mid = intval($m['materia_id']);
            $prioridad[$gm] = $i;
            $gmMateria[$gm] = $mid;
            if (!isset($porMateria[$mid])) {
                $porMateria[$mid] = [
                    'gm_id' => $gm, 'materia_id' => $mid, 'materia' => $m['materia'], 'clave' => $m['clave'], 'docente' => $m['docente'],
                    'del_grupo_actual' => intval($m['grupo_id']) === intval($grupo['id']),
                    'c' => [], 'o' => [], 'pc' => [], 'po' => [],
                ];
            }
        }
        if ($gmMateria) {
            $in = implode(',', array_fill(0, count($gmMateria), '?'));
            $st = $pdo->prepare("SELECT grupo_materia_id, periodo_id, calificacion, observacion FROM calificaciones WHERE cliente_id = ? AND grupo_materia_id IN ($in)");
            $st->execute(array_merge([$cliente_id], array_keys($gmMateria)));
            foreach ($st->fetchAll() as $c) {
                $gm  = intval($c['grupo_materia_id']);
                $pid = intval($c['periodo_id']);
                if (!isset($periodosValidos[$pid]) || !isset($gmMateria[$gm])) continue;
                $mid = $gmMateria[$gm];
                $pr  = $prioridad[$gm];
                if ($c['calificacion'] !== null && (!isset($porMateria[$mid]['pc'][$pid]) || $pr < $porMateria[$mid]['pc'][$pid])) {
                    $porMateria[$mid]['c'][$pid]  = floatval($c['calificacion']);
                    $porMateria[$mid]['pc'][$pid] = $pr;
                }
                if ($c['observacion'] && (!isset($porMateria[$mid]['po'][$pid]) || $pr < $porMateria[$mid]['po'][$pid])) {
                    $porMateria[$mid]['o'][$pid]  = $c['observacion'];
                    $porMateria[$mid]['po'][$pid] = $pr;
                }
            }
        }
        foreach ($porMateria as $m) {
            // Una materia de un grupo anterior que no lleva el grupo actual
            // solo se muestra si le dejaron alguna calificación u observación.
            if (!$m['del_grupo_actual'] && !$m['c'] && !$m['o']) continue;
            $cal = $m['c'];
            $materias[] = [
                'gm_id'          => $m['gm_id'],
                'materia_id'     => $m['materia_id'],
                'materia'        => $m['materia'],
                'clave'          => $m['clave'],
                'docente'        => $m['docente'],
                'calificaciones' => (object) $cal,
                'observaciones'  => (object) $m['o'],
                'promedio'       => $cal ? escolar_redondear(array_sum($cal) / count($cal)) : null,
            ];
        }
        usort($materias, function ($a, $b) {
            return strcmp(mb_strtolower($a['materia'], 'UTF-8'), mb_strtolower($b['materia'], 'UTF-8'));
        });
    }
    $materias = array_values($materias);
    $proms = array_values(array_filter(array_column($materias, 'promedio'), function ($p) { return $p !== null; }));
    $promedio_general = $proms ? escolar_redondear(array_sum($proms) / count($proms)) : null;

    // Promedio por periodo (todas las materias)
    $prom_periodo = [];
    foreach ($periodos as $p) {
        $vals = [];
        foreach ($materias as $m) {
            $arr = (array) $m['calificaciones'];
            if (isset($arr[$p['id']])) $vals[] = $arr[$p['id']];
        }
        $prom_periodo[$p['id']] = $vals ? escolar_redondear(array_sum($vals) / count($vals)) : null;
    }

    $asistencia = !empty($opciones['sin_asistencia']) ? null // [F3]
        : escolar_resumen_asistencia_alumno($pdo, $escuela_id, $cliente_id, $ciclo['fecha_inicio'], $ciclo['fecha_fin']);

    $aprob = floatval($ciclo['calif_aprobatoria']);
    return [
        'grupo'              => $grupo,
        'periodos'           => $periodos,
        'materias'           => $materias,
        'promedio_general'   => $promedio_general,
        'promedio_periodo'   => (object) $prom_periodo,
        'materias_reprobadas'=> count(array_filter($materias, function ($m) use ($aprob) { return $m['promedio'] !== null && $m['promedio'] < $aprob; })),
        'asistencia'         => $asistencia,
    ];
}

function escolar_resumen_asistencia_alumno($pdo, $escuela_id, $cliente_id, $desde, $hasta) {
    $st = $pdo->prepare(
        "SELECT estado, COUNT(*) AS n FROM asistencias
         WHERE escuela_id = ? AND cliente_id = ? AND fecha BETWEEN ? AND ?
         GROUP BY estado"
    );
    $st->execute([$escuela_id, intval($cliente_id), $desde, $hasta]);
    $r = ['presente' => 0, 'falta' => 0, 'retardo' => 0, 'justificada' => 0];
    foreach ($st->fetchAll() as $row) $r[$row['estado']] = intval($row['n']);
    $total = array_sum($r);
    // Retardo cuenta como asistencia; justificada no cuenta en contra.
    $r['total_dias'] = $total;
    $r['porcentaje'] = $total ? round(($r['presente'] + $r['retardo'] + $r['justificada']) * 100 / $total, 1) : null;
    return $r;
}

// [F3] Grados, cierre de ciclo, promoción, kárdex y acceso del rol alumno.
// Vive en su propio archivo para no engordar este (que tocan varias fases).
require_once __DIR__ . '/helpers_escolar_ciclo.php';
