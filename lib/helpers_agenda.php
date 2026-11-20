<?php
// lib/helpers_agenda.php
//
// [OF-7c] AGENDA DE CITAS (20-nov-2026): admisiones, entrevistas con padres, reuniones.
//
// Una cita tiene un RESPONSABLE (usuario del personal del colegio) y, opcionalmente, una
// familia y un alumno/aspirante. Tabla `citas` (migración de OF-7c).
//
// SIN EMPALMES
//   El mismo responsable no puede tener dos citas 'programada' que se crucen. Las
//   canceladas, realizadas o con "no asistió" no ocupan lugar. Se valida en el SERVIDOR,
//   dentro de una transacción que primero bloquea la fila del responsable en `usuarios`
//   (SELECT ... FOR UPDATE): dos altas simultáneas para la misma persona se serializan, así
//   que la segunda ya ve la primera. Los roces de extremo (una termina a las 10:00 y la
//   otra empieza a las 10:00) NO son empalme.
//
// ROLES (decisión documentada en docs/mejoras-of/of7c.md)
//   · admin y control_escolar: crean, editan y cancelan citas de SU colegio.
//   · direccion: ve TODAS las del colegio, en lectura.
//   · docente: ve SOLO las suyas (donde es el responsable), en lectura.
//   · familia: ve solo las ligadas a SU familia, en lectura y sin las notas internas.
//   · cajero, tienda, alumno: no usan la agenda.
//   · superadmin: como admin, mandando escuela_id.
//
// Lo PURO (validación, empalme, texto del correo) se prueba en herramientas/pruebas.php.

const AGENDA_TIPOS   = ['admision' => 'Admisión', 'padres' => 'Entrevista con padres', 'reunion' => 'Reunión', 'otro' => 'Otro'];
const AGENDA_ESTADOS = ['programada' => 'Programada', 'realizada' => 'Realizada', 'cancelada' => 'Cancelada', 'no_asistio' => 'No asistió'];
// Roles que pueden ser "responsable" de una cita (personal del colegio con cuenta).
const AGENDA_ROLES_RESPONSABLE = ['admin', 'control_escolar', 'direccion', 'docente', 'cajero'];
const AGENDA_ROLES_GESTION     = ['superadmin', 'admin', 'control_escolar'];
const AGENDA_DURACION_MAX_MIN  = 720; // 12 horas
const AGENDA_RANGO_MAX_DIAS    = 93;

/** ¿Existe la tabla `citas`? (migración de OF-7c). Una vez por petición. */
function agenda_lista(PDO $pdo): bool
{
    static $listo = null;
    if ($listo !== null) return $listo;
    try {
        $pdo->query("SELECT 1 FROM citas LIMIT 0");
        $listo = true;
    } catch (\Throwable $e) {
        $listo = false;
    }
    return $listo;
}

/** Acepta '2026-11-25 10:30', '2026-11-25T10:30' o con segundos; devuelve 'Y-m-d H:i:s' o null. PURA. */
function agenda_fecha_hora($txt): ?string
{
    $t = trim(str_replace('T', ' ', (string) $txt));
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/', $t, $m)) return null;
    if (!checkdate((int) $m[2], (int) $m[3], (int) $m[1])) return null;
    if ((int) $m[4] > 23 || (int) $m[5] > 59) return null;
    return sprintf('%04d-%02d-%02d %02d:%02d:%02d', $m[1], $m[2], $m[3], $m[4], $m[5], isset($m[6]) ? $m[6] : 0);
}

/**
 * Valida y normaliza la entrada de una cita. PURA.
 * Devuelve ['ok' => true, 'datos' => [...]] o ['ok' => false, 'error' => '...'].
 * Los ids (responsable, familia, alumno) se validan contra la base en la acción.
 */
function agenda_validar_input(array $in): array
{
    $titulo = trim((string) ($in['titulo'] ?? ''));
    if ($titulo === '') return ['ok' => false, 'error' => 'Escribe el título de la cita.'];
    if (mb_strlen($titulo) > 150) return ['ok' => false, 'error' => 'El título no puede pasar de 150 caracteres.'];

    $tipo = (string) ($in['tipo'] ?? 'otro');
    if (!isset(AGENDA_TIPOS[$tipo])) return ['ok' => false, 'error' => 'El tipo de cita no es válido.'];

    $inicio = agenda_fecha_hora($in['inicio'] ?? '');
    $fin    = agenda_fecha_hora($in['fin'] ?? '');
    if ($inicio === null || $fin === null) return ['ok' => false, 'error' => 'Elige el día y la hora de inicio y de fin.'];
    $seg = strtotime($fin) - strtotime($inicio);
    if ($seg <= 0) return ['ok' => false, 'error' => 'La cita debe terminar después de empezar.'];
    if ($seg > AGENDA_DURACION_MAX_MIN * 60) return ['ok' => false, 'error' => 'Una cita no puede durar más de 12 horas.'];

    $responsable = intval($in['responsable_id'] ?? 0);
    if ($responsable <= 0) return ['ok' => false, 'error' => 'Elige quién atiende la cita.'];

    $lugar = trim((string) ($in['lugar'] ?? ''));
    if (mb_strlen($lugar) > 150) return ['ok' => false, 'error' => 'El lugar no puede pasar de 150 caracteres.'];
    $notas = trim((string) ($in['notas'] ?? ''));
    if (mb_strlen($notas) > 1000) return ['ok' => false, 'error' => 'Las notas no pueden pasar de 1000 caracteres.'];

    return ['ok' => true, 'datos' => [
        'titulo' => $titulo, 'tipo' => $tipo, 'inicio' => $inicio, 'fin' => $fin,
        'responsable_id' => $responsable,
        'familia_id' => intval($in['familia_id'] ?? 0) ?: null,
        'cliente_id' => intval($in['cliente_id'] ?? 0) ?: null,
        'lugar' => $lugar !== '' ? $lugar : null,
        'notas' => $notas !== '' ? $notas : null,
    ]];
}

/**
 * ¿Se cruzan dos intervalos? Medio abierto: [inicio, fin). Terminar a las 10:00 y empezar a
 * las 10:00 NO es empalme. Recibe 'Y-m-d H:i:s' (o cualquier cosa que strtotime entienda). PURA.
 */
function agenda_se_empalman($ini1, $fin1, $ini2, $fin2): bool
{
    return strtotime($ini1) < strtotime($fin2) && strtotime($fin1) > strtotime($ini2);
}

/**
 * De una lista de citas ['id','inicio','fin','estado','responsable_id'], la primera que
 * choca con el intervalo para ese responsable (ignorando la cita $exceptoId y las que no
 * ocupan lugar). PURA: es la regla que la consulta SQL de agenda_empalme_en_bd() repite.
 */
function agenda_buscar_empalme(array $citas, $responsable_id, $inicio, $fin, $exceptoId = 0): ?array
{
    foreach ($citas as $c) {
        if (intval($c['responsable_id']) !== intval($responsable_id)) continue;
        if (intval($c['id']) === intval($exceptoId)) continue;
        if (($c['estado'] ?? 'programada') !== 'programada') continue;
        if (agenda_se_empalman($c['inicio'], $c['fin'], $inicio, $fin)) return $c;
    }
    return null;
}

/** La primera cita programada del responsable que se cruza con [inicio, fin). Hay que llamarla con la fila del responsable bloqueada. */
function agenda_empalme_en_bd(PDO $pdo, $responsable_id, $inicio, $fin, $exceptoId = 0): ?array
{
    $st = $pdo->prepare(
        "SELECT id, titulo, inicio, fin, estado, responsable_id FROM citas
          WHERE responsable_id = ? AND id <> ? AND estado = 'programada' AND inicio < ? AND fin > ?
          ORDER BY inicio LIMIT 1"
    );
    $st->execute([intval($responsable_id), intval($exceptoId), $fin, $inicio]);
    $f = $st->fetch(PDO::FETCH_ASSOC);
    return $f ?: null;
}

/** "mié 25 nov 2026, 10:30 a 11:00" en español. PURA. */
function agenda_texto_horario($inicio, $fin): string
{
    $dias  = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    $meses = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    $a = strtotime($inicio); $b = strtotime($fin);
    $txt = $dias[(int) date('w', $a)] . ' ' . date('j', $a) . ' ' . $meses[(int) date('n', $a)] . ' ' . date('Y', $a)
        . ', ' . date('H:i', $a) . ' a ' . date('H:i', $b);
    if (date('Y-m-d', $a) !== date('Y-m-d', $b)) {
        $txt = $dias[(int) date('w', $a)] . ' ' . date('j', $a) . ' ' . $meses[(int) date('n', $a)] . ' ' . date('H:i', $a)
            . ' a ' . $dias[(int) date('w', $b)] . ' ' . date('j', $b) . ' ' . $meses[(int) date('n', $b)] . ' ' . date('H:i', $b);
    }
    return $txt;
}

/**
 * El correo a la familia. SIN datos sensibles: lleva el tipo de cita, el colegio, cuándo y
 * dónde, y a quién preguntar. NUNCA las notas internas, el nombre del alumno ni saldos.
 * $cambio: 'creada' | 'cambiada' | 'cancelada'. Devuelve ['asunto' => ..., 'html' => ...]. PURA.
 */
function agenda_correo_cuerpo(array $cita, string $colegio, string $cambio, string $responsable = ''): array
{
    $e = function ($t) { return htmlspecialchars((string) $t, ENT_QUOTES, 'UTF-8'); };
    $tipo = AGENDA_TIPOS[$cita['tipo'] ?? 'otro'] ?? 'Cita';
    $cuando = agenda_texto_horario($cita['inicio'], $cita['fin']);
    $verbo = ['creada' => 'Se agendó una cita', 'cambiada' => 'Se cambió una cita', 'cancelada' => 'Se canceló una cita'][$cambio] ?? 'Cita';
    $asunto = $verbo . ' — ' . $colegio;
    $html = '<p>Hola,</p>'
        . '<p>' . $e($verbo) . ' con ' . $e($colegio) . '.</p>'
        . '<ul>'
        . '<li><strong>Tipo:</strong> ' . $e($tipo) . '</li>'
        . '<li><strong>Cuándo:</strong> ' . $e($cuando) . '</li>'
        . (!empty($cita['lugar']) ? '<li><strong>Dónde:</strong> ' . $e($cita['lugar']) . '</li>' : '')
        . ($responsable !== '' ? '<li><strong>Te atiende:</strong> ' . $e($responsable) . '</li>' : '')
        . '</ul>'
        . ($cambio === 'cancelada'
            ? '<p>Si necesitas reprogramarla, comunícate con el colegio.</p>'
            : '<p>Si no puedes asistir, avísanos con anticipación para reprogramarla.</p>')
        . '<p>— ' . $e($colegio) . ' (Paga la Escuela)</p>';
    return ['asunto' => $asunto, 'html' => $html];
}

/**
 * Manda el aviso a la familia (correo de la familia). NUNCA lanza ni tumba el guardado:
 * devuelve ['enviado' => bool, 'motivo' => string]. $cita lleva familia_id, tipo, inicio,
 * fin, lugar, responsable_id.
 */
function agenda_avisar_familia(PDO $pdo, array $cita, string $cambio): array
{
    try {
        if (empty($cita['familia_id'])) return ['enviado' => false, 'motivo' => 'La cita no tiene familia ligada.'];
        $f = $pdo->prepare("SELECT email FROM familias WHERE id = ? AND escuela_id = ?");
        $f->execute([intval($cita['familia_id']), intval($cita['escuela_id'])]);
        $correo = trim((string) $f->fetchColumn());
        if ($correo === '') return ['enviado' => false, 'motivo' => 'La familia no tiene correo registrado.'];
        $e = $pdo->prepare("SELECT nombre FROM escuelas WHERE id = ?");
        $e->execute([intval($cita['escuela_id'])]);
        $colegio = (string) $e->fetchColumn() ?: 'tu colegio';
        $resp = '';
        if (!empty($cita['responsable_id'])) {
            $r = $pdo->prepare("SELECT nombre FROM usuarios WHERE id = ?");
            $r->execute([intval($cita['responsable_id'])]);
            $resp = (string) $r->fetchColumn();
        }
        $c = agenda_correo_cuerpo($cita, $colegio, $cambio, $resp);
        if (!function_exists('enviar_correo')) return ['enviado' => false, 'motivo' => 'El correo no está disponible.'];
        $res = enviar_correo($correo, $c['asunto'], $c['html']);
        return ['enviado' => !empty($res['success']), 'motivo' => !empty($res['success']) ? '' : 'No se pudo enviar el correo.'];
    } catch (\Throwable $e) {
        if (function_exists('log_api')) log_api('agenda_avisar_familia falló: ' . $e->getMessage());
        return ['enviado' => false, 'motivo' => 'No se pudo enviar el correo.'];
    }
}

/**
 * Contexto común de las acciones de agenda: valida rol, resuelve la escuela (de la fila,
 * nunca del input para roles de colegio) y la sección. Devuelve
 * ['rol','user_id','escuela_id','gestion' => bool]. Responde 403 si no corresponde.
 */
function agenda_ctx(PDO $pdo, array $usuario_actual, array $input, array $roles): array
{
    $rol = (string) ($usuario_actual['rol'] ?? '');
    requerir_rol($rol, $roles, 'No tienes permiso para usar la agenda.');
    $esc = $rol === 'superadmin' ? intval($input['escuela_id'] ?? 0) : intval($usuario_actual['escuela_id'] ?? 0);
    if ($esc <= 0) respond(['success' => false, 'error' => 'Elige el colegio.']);
    requerir_seccion_habilitada($pdo, $rol, $esc, ['agenda']);
    if (!agenda_lista($pdo)) {
        respond(['success' => false, 'error' => 'La agenda aún no está instalada en la base de datos. Pide al administrador de la plataforma que aplique las migraciones.']);
    }
    return ['rol' => $rol, 'user_id' => intval($usuario_actual['user_id'] ?? 0), 'escuela_id' => $esc,
            'gestion' => in_array($rol, AGENDA_ROLES_GESTION, true)];
}
