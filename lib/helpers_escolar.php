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

    return [
        'rol'        => $rol,
        'escuela_id' => $escuela_id,
        'user_id'    => intval($usuario_actual['user_id'] ?? 0),
        'familia_id' => $usuario_actual['familia_id'] ?? null,
    ];
}

function escolar_es_gestor($ctx) {
    return in_array($ctx['rol'], ['superadmin', 'admin'], true);
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
        if (!$esSuya && !escolar_docente_en_grupo($pdo, $ctx['user_id'], $gm['grupo_id'])) {
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
 */
function escolar_armar_boleta($pdo, $escuela_id, $cliente_id, $ciclo) {
    $cliente_id = intval($cliente_id);
    $ciclo_id   = intval($ciclo['id']);

    $st = $pdo->prepare(
        "SELECT g.id, g.nombre, g.nivel, g.grado, g.turno, u.nombre AS tutor
         FROM grupo_alumnos ga
         JOIN grupos g ON g.id = ga.grupo_id
         LEFT JOIN usuarios u ON u.id = g.tutor_id
         WHERE ga.cliente_id = ? AND g.ciclo_id = ? AND g.escuela_id = ?
         ORDER BY ga.activo DESC, ga.id DESC LIMIT 1"
    );
    $st->execute([$cliente_id, $ciclo_id, $escuela_id]);
    $grupo = $st->fetch() ?: null;

    $st = $pdo->prepare("SELECT id, nombre, orden, cerrado FROM periodos_evaluacion WHERE ciclo_id = ? AND escuela_id = ? ORDER BY orden, id");
    $st->execute([$ciclo_id, $escuela_id]);
    $periodos = array_map(function ($p) {
        $p['id'] = intval($p['id']); $p['cerrado'] = (bool) $p['cerrado'];
        return $p;
    }, $st->fetchAll());

    $materias = [];
    if ($grupo) {
        $st = $pdo->prepare(
            "SELECT gm.id AS gm_id, m.nombre AS materia, m.clave, u.nombre AS docente
             FROM grupo_materias gm
             JOIN materias m ON m.id = gm.materia_id
             LEFT JOIN usuarios u ON u.id = gm.docente_id
             WHERE gm.grupo_id = ?
             ORDER BY m.nombre"
        );
        $st->execute([$grupo['id']]);
        foreach ($st->fetchAll() as $m) {
            $materias[intval($m['gm_id'])] = $m + ['calificaciones' => new \stdClass(), 'observaciones' => new \stdClass(), 'promedio' => null];
        }
        if ($materias) {
            $in = implode(',', array_fill(0, count($materias), '?'));
            $st = $pdo->prepare("SELECT grupo_materia_id, periodo_id, calificacion, observacion FROM calificaciones WHERE cliente_id = ? AND grupo_materia_id IN ($in)");
            $st->execute(array_merge([$cliente_id], array_keys($materias)));
            $porGm = [];
            foreach ($st->fetchAll() as $c) {
                $gm = intval($c['grupo_materia_id']);
                if ($c['calificacion'] !== null) $porGm[$gm]['c'][intval($c['periodo_id'])] = floatval($c['calificacion']);
                if ($c['observacion'])           $porGm[$gm]['o'][intval($c['periodo_id'])] = $c['observacion'];
            }
            foreach ($materias as $gm => &$m) {
                $cal = $porGm[$gm]['c'] ?? [];
                $m['calificaciones'] = (object) $cal;
                $m['observaciones']  = (object) ($porGm[$gm]['o'] ?? []);
                $m['promedio'] = $cal ? escolar_redondear(array_sum($cal) / count($cal)) : null;
            }
            unset($m);
        }
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

    $asistencia = escolar_resumen_asistencia_alumno($pdo, $escuela_id, $cliente_id, $ciclo['fecha_inicio'], $ciclo['fecha_fin']);

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
