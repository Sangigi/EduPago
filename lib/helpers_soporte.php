<?php
/**
 * lib/helpers_soporte.php — Tickets de soporte y Ayuda (OF-7a, 20-nov-2026)
 *
 * Reglas compartidas por acciones/soporte_*.php y acciones/ayuda_*.php. Viven en
 * UN solo lugar para que "quién ve qué" no se desincronice entre las diez
 * acciones. No se carga desde api.php: cada acción hace require_once. Usa
 * respond(), requerir_rol() y log_api(), que ya existen cuando api.php despacha.
 *
 * QUIÉN PUEDE QUÉ
 *   admin, cajero (colegio)  → crean tickets de SU escuela, ven todos los de su
 *                              escuela, responden y marcan resuelto. NUNCA ven
 *                              notas internas ni quién de soporte las escribió.
 *   soporte, superadmin      → ven los de todos los colegios, se asignan, responden,
 *                              escriben notas internas y cambian estado/prioridad.
 *   familia, alumno, etc.    → nada (las familias no usan tickets en esta fase).
 *
 * LA REGLA QUE IMPORTA (notas internas)
 *   Se garantiza en el SERVIDOR, en la consulta: toda lectura de mensajes y de
 *   adjuntos de un usuario de colegio lleva `interno = 0`. Ocultarlas en la vista
 *   no cuenta. Ver soporte_condicion_interno().
 *
 * OJO: requerir_rol() NO es default-deny global (ver api.php). Estas funciones
 * protegen solo porque cada acción las llama al principio.
 */

require_once __DIR__ . '/helpers_expediente.php'; // expediente_nombre_archivo(), expediente_ruta_documento()

const SOPORTE_ROLES_COLEGIO = ['admin', 'cajero'];
const SOPORTE_ROLES_PLATAFORMA = ['superadmin', 'soporte'];

const SOPORTE_CATEGORIAS = [
    'cobros'          => 'Cobros y caja',
    'facturacion'     => 'Facturación',
    'control_escolar' => 'Control escolar',
    'cuenta'          => 'Mi cuenta y accesos',
    'otro'            => 'Otro',
];
const SOPORTE_ESTADOS = [
    'abierto'          => 'Abierto',
    'en_proceso'       => 'En proceso',
    'esperando_cliente' => 'Esperando al colegio',
    'resuelto'         => 'Resuelto',
];
const SOPORTE_PRIORIDADES = ['normal' => 'Normal', 'alta' => 'Alta'];

const SOPORTE_MAX_ASUNTO = 150;
const SOPORTE_MAX_TEXTO = 5000;
const SOPORTE_MAX_ADJUNTOS_MENSAJE = 5;
const SOPORTE_MAX_ADJUNTOS_TICKET = 25;
const SOPORTE_MAX_TICKETS_POR_HORA = 10;   // por usuario: freno a un script que llene la bandeja
const SOPORTE_EXT_ADJUNTO = ['jpg', 'png', 'webp', 'pdf'];

const AYUDA_TIPOS = ['articulo' => 'Artículo', 'novedad' => 'Novedad'];
const AYUDA_ROLES_VISIBLES = ['admin', 'cajero'];   // los roles que tienen el ítem "Ayuda"
const AYUDA_MAX_TITULO = 200;
const AYUDA_MAX_CUERPO = 15000;   // la columna es TEXT (65 535 bytes): 15 000 caracteres × 4 bytes caben

function soporte_es_plataforma($rol) { return in_array($rol, SOPORTE_ROLES_PLATAFORMA, true); }
function soporte_es_colegio($rol)    { return in_array($rol, SOPORTE_ROLES_COLEGIO, true); }

/** 'soporte' (plataforma) o 'colegio': el "lado" que habla en un mensaje. */
function soporte_lado($rol) { return soporte_es_plataforma($rol) ? 'soporte' : 'colegio'; }

/**
 * Fragmento SQL que deja fuera las notas internas para quien no es plataforma.
 * Es la ÚNICA definición de la regla: toda consulta de mensajes la usa. Para
 * plataforma no agrega nada. $alias es el alias de soporte_mensajes en la consulta.
 */
function soporte_condicion_interno($rol, $alias = 'm') {
    return soporte_es_plataforma($rol) ? '' : " AND {$alias}.interno = 0";
}

/**
 * Máquina de estados tras un mensaje PÚBLICO (puro, sin BD; lo prueban
 * herramientas/pruebas.php).
 *   colegio escribe: un ticket resuelto se reabre ('abierto'); uno que esperaba
 *                    al colegio pasa a 'en_proceso'; los demás no cambian.
 *   soporte escribe: si pidió un estado válido, ese; si no, 'esperando_cliente'
 *                    (salvo que ya estuviera resuelto: no lo reabre una aclaración).
 * Las notas internas NO pasan por aquí: nunca cambian el estado.
 */
function soporte_estado_tras_mensaje($estado_actual, $lado, $estado_pedido = null) {
    if ($lado === 'colegio') {
        if ($estado_actual === 'resuelto') return 'abierto';
        if ($estado_actual === 'esperando_cliente') return 'en_proceso';
        return $estado_actual;
    }
    if ($estado_pedido !== null && $estado_pedido !== '' && isset(SOPORTE_ESTADOS[$estado_pedido])) return $estado_pedido;
    return $estado_actual === 'resuelto' ? 'resuelto' : 'esperando_cliente';
}

/**
 * ¿Puede este lado pasar el ticket de $actual a $nuevo? (puro)
 *   plataforma: cualquier estado válido.
 *   colegio:    solo 'resuelto' (marcar resuelto) y reabrir un resuelto.
 */
function soporte_transicion_permitida($lado, $actual, $nuevo) {
    if (!isset(SOPORTE_ESTADOS[$nuevo])) return false;
    if ($lado === 'soporte') return true;
    if ($nuevo === 'resuelto') return true;
    return $nuevo === 'abierto' && $actual === 'resuelto';
}

/** roles_visibles guardado como JSON o texto "admin,cajero" → lista limpia (puro). */
function ayuda_roles_normalizar($valor) {
    if (is_string($valor)) {
        $dec = json_decode($valor, true);
        $valor = is_array($dec) ? $dec : preg_split('/[\s,;]+/', $valor, -1, PREG_SPLIT_NO_EMPTY);
    }
    if (!is_array($valor)) return [];
    $out = [];
    foreach ($valor as $r) {
        $r = strtolower(trim((string) $r));
        if (in_array($r, AYUDA_ROLES_VISIBLES, true) && !in_array($r, $out, true)) $out[] = $r;
    }
    return $out;
}

/** ¿Un usuario de colegio con este rol puede ver el artículo? (puro) */
function ayuda_visible_para($fila, $rol) {
    if (empty($fila['publicado'])) return false;
    return in_array($rol, ayuda_roles_normalizar($fila['roles_visibles'] ?? ''), true);
}

/**
 * Novedades publicadas para el rol de este usuario desde la última vez que abrió la pestaña
 * "Novedades" (ayuda_usuario). Si nunca la ha abierto, cuentan las publicadas desde que se dio
 * de alta su cuenta (así un usuario nuevo no ve como "nuevo" todo el historial). Lanza
 * PDOException si falta la migración: el llamador decide.
 */
function ayuda_contar_novedades_sin_ver($pdo, $usuario_actual) {
    $rol = $usuario_actual['rol'] ?? '';
    $yo = intval($usuario_actual['user_id'] ?? 0);
    $st = $pdo->prepare(
        "SELECT n.roles_visibles, n.publicado FROM ayuda_articulos n
          WHERE n.tipo = 'novedad' AND n.publicado = 1
            AND n.publicado_en > COALESCE(
                  (SELECT v.novedades_vistas_en FROM ayuda_usuario v WHERE v.usuario_id = ?),
                  (SELECT u.fecha_alta FROM usuarios u WHERE u.id = ?),
                  '1970-01-01 00:00:00')"
    );
    $st->execute([$yo, $yo]);
    $n = 0;
    foreach ($st->fetchAll() as $f) if (ayuda_visible_para($f, $rol)) $n++;
    return $n;
}

// ── Base de datos ───────────────────────────────────────────────────────────

/** Migración pendiente → mensaje claro en vez de un 500 genérico. $tabla es siempre una constante del código. */
function soporte_requerir_tabla($pdo, $tabla) {
    try {
        $pdo->query("SELECT 1 FROM `{$tabla}` LIMIT 1");
    } catch (\PDOException $e) {
        log_api("soporte: tabla {$tabla} no encontrada (¿falta migracion_2026_11_20_of7a_soporte.sql?) -> " . $e->getMessage());
        respond(['success' => false, 'error' => 'El soporte dentro de la plataforma aún no está instalado en la base de datos. Pide al administrador de EduPago aplicar las migraciones pendientes (Diagnóstico → Base de datos).']);
    }
}

/** Error de BD → mensaje que sirva (migración pendiente vs. texto largo vs. otro). */
function soporte_error_bd(\Throwable $e, $donde) {
    $estado = (string) $e->getCode();
    log_api("soporte: error de BD en {$donde} (SQLSTATE {$estado}) -> " . $e->getMessage());
    if ($estado === '42S02' || $estado === '42S22') {
        respond(['success' => false, 'error' => 'El soporte dentro de la plataforma aún no está instalado en la base de datos. Pide al administrador de EduPago aplicar las migraciones pendientes (Diagnóstico → Base de datos).']);
    }
    http_response_code(500);
    respond(['success' => false, 'error' => 'No se pudo completar la operación (ya quedó registrado en el log).']);
}

/**
 * Carga un ticket validando rol Y propiedad. La escuela SIEMPRE sale de la fila
 * del ticket, nunca de $input. Un colegio que pide el ticket de otro recibe el
 * mismo 404 que si no existiera (no se le confirma que ese id existe).
 *
 * @param bool $para_actualizar true agrega FOR UPDATE (dentro de una transacción).
 * @return array la fila de soporte_tickets (ids como int) + escuela_nombre.
 */
function soporte_ticket_cargar($pdo, $usuario_actual, $ticket_id, $para_actualizar = false) {
    $rol = $usuario_actual['rol'] ?? '';
    requerir_rol($rol, array_merge(SOPORTE_ROLES_COLEGIO, SOPORTE_ROLES_PLATAFORMA), 'No tienes permiso para ver tickets de soporte.');

    $ticket_id = intval($ticket_id);
    if ($ticket_id <= 0) respond(['success' => false, 'error' => 'Falta indicar el ticket.']);

    $sql = "SELECT t.*, e.nombre AS escuela_nombre
              FROM soporte_tickets t LEFT JOIN escuelas e ON e.id = t.escuela_id
             WHERE t.id = ?";
    if ($para_actualizar) $sql .= " FOR UPDATE";
    $st = $pdo->prepare($sql);
    $st->execute([$ticket_id]);
    $t = $st->fetch();

    $propio = $t && (soporte_es_plataforma($rol)
        || (!empty($usuario_actual['escuela_id']) && intval($t['escuela_id']) === intval($usuario_actual['escuela_id'])));
    if (!$propio) {
        http_response_code(404);
        respond(['success' => false, 'error' => 'Ticket no encontrado.']);
    }
    foreach (['id', 'escuela_id', 'creado_por'] as $k) $t[$k] = intval($t[$k]);
    $t['asignado_a'] = $t['asignado_a'] ? intval($t['asignado_a']) : null;
    return $t;
}

/** Marca el ticket como leído por este usuario hasta $hasta (el último mensaje que se le mostró). */
function soporte_marcar_leido($pdo, $ticket_id, $usuario_id, $hasta) {
    $pdo->prepare(
        "INSERT INTO soporte_lecturas (ticket_id, usuario_id, leido_en) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE leido_en = GREATEST(leido_en, VALUES(leido_en))"
    )->execute([intval($ticket_id), intval($usuario_id), $hasta]);
}

/** Texto obligatorio de un mensaje: recorta, quita caracteres de control (salvo saltos), valida largo. */
function soporte_texto_mensaje($valor, $etiqueta = 'mensaje') {
    $v = expediente_texto($valor, SOPORTE_MAX_TEXTO, $etiqueta, true);
    if ($v === null) respond(['success' => false, 'error' => "Escribe el {$etiqueta}."]);
    return $v;
}

// ── Adjuntos ────────────────────────────────────────────────────────────────

/** $_FILES[$campo] (uno o varios, con o sin []) → lista de archivos con la forma de un elemento de $_FILES. */
function soporte_archivos_subidos($campo = 'archivos') {
    if (empty($_FILES[$campo])) return [];
    $f = $_FILES[$campo];
    if (!is_array($f['name'])) return ($f['error'] === UPLOAD_ERR_NO_FILE) ? [] : [$f];
    $out = [];
    foreach ($f['name'] as $i => $nombre) {
        if (($f['error'][$i] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) continue;   // campo vacío
        $out[] = ['name' => $nombre, 'type' => $f['type'][$i] ?? '', 'tmp_name' => $f['tmp_name'][$i] ?? '',
                  'error' => $f['error'][$i], 'size' => $f['size'][$i] ?? 0];
    }
    return $out;
}

/**
 * Extensión que corresponde a lo que el archivo ES de verdad, leída de sus primeros
 * bytes (firma / magic bytes), no de su nombre. null si no es imagen ni PDF.
 * Pura salvo por leer el archivo (acepta una cadena con los bytes en $_cabecera).
 */
function soporte_extension_por_firma($ruta, $_cabecera = null) {
    $b = $_cabecera;
    if ($b === null) {
        $fh = @fopen($ruta, 'rb');
        if (!$fh) return null;
        $b = fread($fh, 16);
        fclose($fh);
    }
    if (strncmp($b, "\xFF\xD8\xFF", 3) === 0) return 'jpg';
    if (strncmp($b, "\x89PNG\r\n\x1A\n", 8) === 0) return 'png';
    if (strncmp($b, '%PDF-', 5) === 0) return 'pdf';
    if (strlen($b) >= 12 && substr($b, 0, 4) === 'RIFF' && substr($b, 8, 4) === 'WEBP') return 'webp';
    return null;
}

/**
 * Valida y guarda los adjuntos de un mensaje (en uploads_privados/, sin URL directa).
 * Se llama ANTES de la transacción; si algo falla después hay que borrar lo ya
 * guardado con soporte_borrar_archivos(). El tipo lo decide la FIRMA del archivo:
 * se le pasa a guardar_archivo_privado() la extensión real, así el nombre que mande
 * el navegador no cuenta (guardar_archivo_privado además cruza con finfo).
 *
 * @return array lista de ['ruta_relativa','nombre_original','mime_real','tamano_bytes']
 */
function soporte_guardar_adjuntos(array $archivos, $escuela_id, $ticket_id_o_null) {
    if (count($archivos) > SOPORTE_MAX_ADJUNTOS_MENSAJE) {
        respond(['success' => false, 'error' => 'Puedes adjuntar hasta ' . SOPORTE_MAX_ADJUNTOS_MENSAJE . ' archivos por mensaje.']);
    }
    $subcarpeta = 'escuela_' . intval($escuela_id) . '/soporte' . ($ticket_id_o_null ? '/' . intval($ticket_id_o_null) : '/nuevos');
    $guardados = [];
    foreach ($archivos as $f) {
        $fallo = null;
        $tmp = $f['tmp_name'] ?? '';
        $ext = ($f['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK && is_uploaded_file($tmp) ? soporte_extension_por_firma($tmp) : null;
        if (($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            $fallo = uploads_error_texto($f['error'] ?? UPLOAD_ERR_NO_FILE);
        } elseif ($ext === null || !in_array($ext, SOPORTE_EXT_ADJUNTO, true)) {
            $fallo = 'Solo se aceptan imágenes (JPG, PNG, WEBP) y PDF. Revisa «' . (expediente_nombre_archivo($f['name'] ?? '') ?: 'el archivo') . '».';
        } else {
            $nombreOriginal = expediente_nombre_archivo($f['name'] ?? '');
            $f['name'] = 'adjunto.' . $ext;   // la extensión ya no viene del navegador
            $res = guardar_archivo_privado($f, $subcarpeta, SOPORTE_EXT_ADJUNTO, UPLOADS_MAX_BYTES_DOCUMENTO);
            if ($res['ok']) {
                $guardados[] = [
                    'ruta_relativa'   => $res['ruta_relativa'],
                    'nombre_original' => $nombreOriginal,
                    'mime_real'       => $res['mime_real'],
                    'tamano_bytes'    => intval($res['tamano_bytes']),
                ];
                continue;
            }
            $fallo = $res['error'];
        }
        soporte_borrar_archivos($guardados);
        respond(['success' => false, 'error' => $fallo]);
    }
    return $guardados;
}

/** Borra archivos ya guardados (rutas relativas a uploads_privados/) cuando la inserción falló. */
function soporte_borrar_archivos(array $guardados) {
    foreach ($guardados as $g) {
        $abs = expediente_ruta_documento($g['ruta_relativa'] ?? '');
        if ($abs) @unlink($abs);
    }
}

// ── Correo ──────────────────────────────────────────────────────────────────

/** URL base de la plataforma, igual que en reenviar_credenciales.php. */
function soporte_url_plataforma() {
    return (defined('APP_URL') && APP_URL)
        ? rtrim(APP_URL, '/')
        : ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http')
            . '://' . ($_SERVER['HTTP_HOST'] ?? '')
            . rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? ''), '/'));
}

/** Correos de los usuarios activos con rol soporte o superadmin. */
function soporte_correos_plataforma($pdo) {
    $st = $pdo->query("SELECT email FROM usuarios WHERE rol IN ('soporte', 'superadmin') AND activo = 1 AND email IS NOT NULL AND email <> ''");
    return array_values(array_unique(array_column($st->fetchAll(), 'email')));
}

/** Correos del creador del ticket y de quienes del colegio han escrito en él. */
function soporte_correos_colegio($pdo, $ticket_id, $creado_por) {
    $st = $pdo->prepare(
        "SELECT DISTINCT u.email FROM usuarios u
          WHERE u.activo = 1 AND u.email IS NOT NULL AND u.email <> ''
            AND (u.id = ? OR u.id IN (SELECT m.usuario_id FROM soporte_mensajes m WHERE m.ticket_id = ? AND m.interno = 0 AND m.rol_autor IN ('admin', 'cajero')))"
    );
    $st->execute([intval($creado_por), intval($ticket_id)]);
    return array_column($st->fetchAll(), 'email');
}

/**
 * Aviso por correo. NUNCA lleva el asunto ni el texto del ticket (pueden traer
 * datos sensibles): solo el número, el colegio y una liga a la plataforma. Un fallo
 * del correo no debe tumbar la acción: se anota y se sigue.
 */
function soporte_enviar_aviso($pdo, $destinatarios, $asunto_correo, $titulo, $linea, $ticket_id) {
    try {
        if (!$destinatarios) return false;
        $liga = soporte_url_plataforma() . '/';
        $esc = function ($s) { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); };
        $html = "<p>Hola,</p><p><strong>" . $esc($titulo) . "</strong></p><p>" . $esc($linea) . "</p>"
              . "<p>Entra a la plataforma para verlo: <a href=\"" . $esc($liga) . "\">" . $esc($liga) . "</a></p>"
              . "<p style=\"color:#666;font-size:12px\">Por seguridad este correo no incluye el contenido del mensaje.</p>"
              . "<p>— Pagalaescuela</p>";
        $r = enviar_correo($destinatarios, $asunto_correo, $html);
        if (empty($r['success'])) {
            log_api("soporte: falló el aviso del ticket #{$ticket_id} -> " . ($r['error'] ?? 'desconocido'));
            return false;
        }
        return true;
    } catch (\Throwable $e) {
        log_api("soporte: excepción al avisar del ticket #{$ticket_id} -> " . $e->getMessage());
        return false;
    }
}
