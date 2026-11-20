<?php
// lib/helpers_suplantacion.php
//
// [OF-7c] "VER COMO": entrar como otro usuario SIN pedirle su contraseña.
//
// PARA QUÉ
//   "Al cajero no le aparece el botón", "a la mamá no le sale el adeudo". Verlo con
//   los ojos del usuario obligaba a pedirle su contraseña, y una contraseña prestada
//   deja de ser de nadie: la bitácora dice "Lupita hizo esto" cuando lo hizo el jefe.
//   Aquí el que entra escribe LA SUYA, y queda anotado quién entró como quién.
//
// QUÉ ES (y qué NO es) EL TOKEN DE SUPLANTACIÓN
//   Es una sesión DISTINTA de la normal, no un token normal con un campo extra:
//       base64( "sup" . objetivo . real . modo . emitido . vence . firma )
//       firma = HMAC-SHA256( "sup.objetivo.real.modo.emitido.vence", APP_TOKEN_SECRET )
//   · Lleva 7 partes; el token normal lleva 3 ("id.vence.firma"), así que un token
//     normal NUNCA se confunde con uno de suplantación ni al revés (verificar_token_auth
//     distingue por la cantidad de partes y la primera es literalmente "sup").
//   · Dura 30 MINUTOS como máximo (SUPLANTACION_TTL). Aunque alguien firmara uno más
//     largo, aquí se rechaza: vence - emitido no puede pasar de 30 min.
//   · En CADA petición se leen frescos de la base el usuario real y el objetivo, y se
//     vuelve a evaluar suplantacion_decision(): si al real le quitaron el rol, si el
//     objetivo ya no es de su escuela o está apagado, la sesión muere en ese momento.
//     Si cualquiera de los dos cambió su contraseña o se le cerraron las sesiones
//     (sesion_valida_desde) DESPUÉS de emitido el token, también.
//   · Vencer no cierra la sesión real: el navegador solo suelta este token y sigue
//     con el suyo (ver controllers/AuthController.js).
//
// QUÉ NO SE PUEDE HACER SUPLANTANDO
//   Dos listas explícitas, abajo: SUPLANTACION_ACCIONES_NUNCA (ni en modo normal) y
//   SUPLANTACION_ACCIONES_SOLO_LECTURA (lo único que pasa en modo lectura). Las dos las
//   valida herramientas/revisar-permisos.php (toda acción nombrada existe, ninguna de
//   solo lectura aparece en NUNCA, y ninguna de solo lectura escribe en la base).
//
// Este archivo NO toca la base ni $_SERVER salvo en suplantacion_verificar_token()
// (que vive aquí porque la llama verificar_token_auth() de api.php). Todo lo demás
// es PURO para poder probarlo sin servidor (herramientas/pruebas.php).

const SUPLANTACION_TTL = 1800; // 30 minutos
const SUPLANTACION_MENSAJE_LECTURA = 'Estás viendo como otro usuario en modo de solo lectura';
const SUPLANTACION_MENSAJE_PROHIBIDA = 'Esta acción no se puede hacer mientras estás viendo como otro usuario';

// Roles de PLATAFORMA (sin colegio) + superadmin. Debe ser rol_sin_escuela() de api.php
// más 'superadmin'; revisar-permisos.php lo compara para que no se desvíen.
const SUPLANTACION_ROLES_PLATAFORMA = ['superadmin', 'distribuidor', 'contador', 'soporte', 'provision', 'tesoreria', 'promotor'];
// Roles del colegio a los que un admin puede entrar en modo normal (opera como ellos).
const SUPLANTACION_ADMIN_NORMAL = ['cajero', 'control_escolar', 'direccion', 'docente', 'tienda'];
// Roles de clientes del colegio: SIEMPRE solo lectura, para cualquiera que entre.
const SUPLANTACION_ROLES_SIEMPRE_LECTURA = ['familia', 'alumno'];

/**
 * Lo que NO se puede hacer suplantando, ni siquiera en modo normal.
 * Razón por grupo:
 *   · cuenta del objetivo: contraseña, perfil propio, altas/bajas/sesiones de usuarios y
 *     "guía vista" (si no, el que entra a mirar le marcaría la guía como vista al otro);
 *   · suplantar de nuevo: sin encadenar sesiones;
 *   · pagar en nombre de una familia: liga de tarjeta, referencia de efectivo, pago
 *     agrupado, recarga de monedero, cobro/cancelación de domiciliación (CAI) y el NIP y
 *     límites del monedero del alumno;
 *   · aceptar el aviso de privacidad: es un consentimiento legal de la familia;
 *   · cancelar facturas (CFDI): es irreversible ante el SAT.
 */
const SUPLANTACION_ACCIONES_NUNCA = [
    // Cuenta del objetivo.
    'cambiar_password_propio', 'editar_usuario', 'crear_usuario', 'eliminar_usuario',
    'toggle_usuario', 'cerrar_sesiones_usuario', 'reenviar_credenciales', 'guia_marcar_vista',
    // Encadenar suplantaciones.
    'suplantar_iniciar',
    // Pagar en nombre de una familia.
    'generar_liga', 'generar_referencia_efectivo', 'iniciar_pago_agrupado', 'monedero_recargar',
    'cobrar_cai', 'cancelar_cai', 'iniciar_firma_cai', 'monedero_config_guardar',
    // Consentimiento legal de la familia.
    'alumno_aviso_privacidad_aceptar',
    // Facturas: irreversible ante el SAT.
    'cancelar_cfdi', 'cancelar_cfdi_actualizar',
    // [integración OF-7b/7c] Avisos push: suscribir el navegador de quien suplanta
    // haría que le lleguen los avisos del otro usuario a SU dispositivo.
    'push_suscribir', 'push_quitar', 'push_probar',
    // [integración OF-7a/7c] Tickets de soporte: escribirle a soporte "como" el
    // cajero firma un mensaje que no escribió; y marcar novedades o tickets como
    // vistos le cambia al otro lo que todavía no ha leído.
    'soporte_ticket_crear', 'soporte_ticket_responder', 'soporte_ticket_actualizar',
    'ayuda_novedades_vistas',
];

/**
 * LO ÚNICO que pasa cuando la sesión es de solo lectura. Lista EXPLÍCITA (no por
 * prefijo): una acción nueva nace bloqueada hasta que alguien la revise y la agregue
 * aquí. Cada una se revisó UNA POR UNA el 20-nov-2026 leyendo su código: ninguna escribe
 * en la base (solo registran una línea en archivo/bitácora). Las dos únicas con efecto
 * lateral están anotadas:
 *   · caja_sucursales: crearía la sucursal "Principal" si el colegio no tuviera ninguna;
 *     en modo lectura esa rama se omite (acciones/caja_sucursales.php, marcada [OF-7c]).
 *   · alumno_documento_descargar: deja una línea en logs_sistema de quién bajó el
 *     documento (es la bitácora, no un dato del alumno).
 * Dudosas que quedaron FUERA a propósito: escolar_mapear_grados (tiene modo 'aplicar'),
 * importar_saldos_aplicar, invitaciones_listar (marca como vencidas las invitaciones caducadas al
 * listar: el comprobador revisar-permisos.php lo detectó) y todo lo que crea, edita, cancela o marca.
 */
const SUPLANTACION_ACCIONES_SOLO_LECTURA = [
    // Arranque y búsquedas.
    'cargar_datos', 'buscar_global',
    // [integración OF-7a/7c] Ayuda: listar tickets, su resumen y los artículos no
    // escriben nada. soporte_ticket_ver queda FUERA: marca el ticket como leído a
    // nombre del usuario suplantado.
    'soporte_tickets_listar', 'soporte_resumen', 'ayuda_listar',
    // Cobros, caja y cobranza (consulta).
    'listar_cobros', 'detalle_cobro', 'tendencia_cobranza', 'verificar_spei', 'verificar_saldo_alumno',
    'caja_estado', 'caja_historial', 'caja_resumen', 'caja_sucursales',
    'abonos_sin_complemento_listar', 'cfdi_cancelaciones_listar', 'listar_pagos_no_aplicados',
    'compromisos_pago_listar', 'familia_notas_listar',
    'descargar_cfdi', 'descargar_complemento_pago',
    // Alumnos, expediente, becas, tutores.
    'alumno_resumen', 'alumno_becas_listar', 'alumno_cobros_pendientes', 'alumno_documentos_listar',
    'alumno_documento_descargar', 'alumno_expediente_obtener', 'alumno_movimientos_listar',
    'alumno_tutores_listar',
    // Control escolar (consulta).
    'escolar_asistencia_obtener', 'escolar_asistencia_reporte', 'escolar_boleta', 'escolar_buscar_alumnos',
    'escolar_calificaciones_obtener', 'escolar_catalogos', 'escolar_familia_resumen', 'escolar_grupo_detalle',
    'escolar_horario_docente', 'escolar_kardex', 'escolar_resumen_grupo',
    // Equipo, gastos, catálogos, colegio.
    'listar_usuarios', 'listar_gastos', 'listar_zonas', 'planteles_de_escuela', 'producto_alcance_vista_previa',
    'listar_documentos_escuela', 'descargar_documento_escuela', 'descargar_contrato_firmado',
    'escuela_obtener_datos_pago', 'suscripcion_pagos_listar',
    // Importación (el análisis no escribe) e inventario.
    'importar_saldos_analizar', 'importar_saldos_listar',
    'inventario_listar', 'inventario_movimientos',
    // Monedero y tiendita (consulta).
    'monedero_saldo', 'monedero_movimientos', 'monedero_reporte',
    'tienda_buscar_alumno', 'tienda_productos_listar', 'tienda_ventas_dia',
    // Plataforma (consulta).
    'listar_logs', 'listar_clabes_pool', 'diagnostico_incoherencias', 'migraciones_estado', 'mantenimiento_estado',
    'contador_listar_escuelas', 'provision_listar_pendientes', 'tesoreria_cuentas_por_pagar',
    'superadmin_listar_referidos', 'comisiones_estado_cuenta', 'comisiones_historial_tasas',
    'distribuidor_comisiones', 'distribuidor_datos', 'distribuidor_datos_pago',
    // [OF-7c] Bitácora de auditoría y agenda (consulta).
    'auditoria_listar', 'agenda_listar',
];

/** Acciones que existen SOLO para la suplantación y se declaran aparte en revisar-permisos.php. */
const SUPLANTACION_ACCIONES_PROPIAS = ['suplantar_iniciar', 'suplantar_terminar'];

function suplantacion_es_rol_plataforma($rol): bool
{
    return in_array((string) $rol, SUPLANTACION_ROLES_PLATAFORMA, true);
}

/**
 * ¿Puede $real ver como $objetivo, y en qué modo?
 *
 * PURA. $real y $objetivo son filas de `usuarios` (id, rol, escuela_id, activo).
 * Devuelve ['ok' => bool, 'modo' => 'normal'|'lectura'|null, 'motivo' => string].
 *
 *   superadmin → cualquier usuario que no sea superadmin;
 *   soporte    → cualquier usuario de colegio (no de plataforma), SIEMPRE lectura;
 *   admin      → de SU escuela: cajero, control_escolar, direccion, docente, tienda
 *                (normal); familia y alumno (SIEMPRE lectura);
 *   nadie más.
 * Además, para cualquiera: si el objetivo es familia o alumno, el modo es lectura
 * (nadie paga ni consiente en nombre de una familia), y ambos deben estar activos.
 */
function suplantacion_decision(array $real, array $objetivo): array
{
    $no = function (string $motivo): array { return ['ok' => false, 'modo' => null, 'motivo' => $motivo]; };

    $rolReal = (string) ($real['rol'] ?? '');
    $rolObj  = (string) ($objetivo['rol'] ?? '');
    if (empty($real['id']) || empty($objetivo['id'])) return $no('Falta el usuario.');
    if (intval($real['id']) === intval($objetivo['id'])) return $no('Esa ya es tu cuenta.');
    if (empty($real['activo'])) return $no('Tu cuenta no está activa.');
    if (empty($objetivo['activo'])) return $no('Esa cuenta está apagada.');
    if ($rolObj === 'superadmin') return $no('No se puede ver como un superadministrador.');

    $modo = null;
    if ($rolReal === 'superadmin') {
        $modo = 'normal';
    } elseif ($rolReal === 'soporte') {
        if (suplantacion_es_rol_plataforma($rolObj) || empty($objetivo['escuela_id'])) {
            return $no('Soporte solo puede ver como usuarios de un colegio.');
        }
        $modo = 'lectura';
    } elseif ($rolReal === 'admin') {
        $miEscuela = intval($real['escuela_id'] ?? 0);
        if ($miEscuela <= 0 || intval($objetivo['escuela_id'] ?? 0) !== $miEscuela) {
            return $no('Solo puedes ver como usuarios de tu escuela.');
        }
        if (in_array($rolObj, SUPLANTACION_ADMIN_NORMAL, true)) {
            $modo = 'normal';
        } elseif (in_array($rolObj, SUPLANTACION_ROLES_SIEMPRE_LECTURA, true)) {
            $modo = 'lectura';
        } else {
            return $no('Ese rol no está disponible para "Ver como".');
        }
    } else {
        return $no('Tu rol no puede ver como otro usuario.');
    }
    if (in_array($rolObj, SUPLANTACION_ROLES_SIEMPRE_LECTURA, true)) $modo = 'lectura';
    return ['ok' => true, 'modo' => $modo, 'motivo' => ''];
}

/** El modo final: el que pidió el usuario solo puede ser MÁS estricto que el que le toca. */
function suplantacion_modo_final($modo_decision, $modo_pedido): string
{
    if ($modo_decision === 'lectura' || (string) $modo_pedido === 'lectura') return 'lectura';
    return 'normal';
}

/**
 * ¿Se bloquea esta acción en una sesión de suplantación? Devuelve null si pasa, o el
 * motivo: 'prohibida' (en la lista NUNCA, en cualquier modo) o 'lectura' (modo lectura
 * y la acción no está en el conjunto de consulta). PURA.
 * 'suplantar_terminar' siempre pasa: es la salida.
 */
function suplantacion_accion_bloqueada($accion, $modo): ?string
{
    $accion = (string) $accion;
    if ($accion === 'suplantar_terminar') return null;
    if (in_array($accion, SUPLANTACION_ACCIONES_NUNCA, true)) return 'prohibida';
    if ($modo === 'lectura' && !in_array($accion, SUPLANTACION_ACCIONES_SOLO_LECTURA, true)) return 'lectura';
    return null;
}

/** El mensaje que se le enseña al usuario según el motivo del bloqueo. */
function suplantacion_mensaje_bloqueo($motivo): string
{
    return $motivo === 'lectura' ? SUPLANTACION_MENSAJE_LECTURA : SUPLANTACION_MENSAJE_PROHIBIDA;
}

// ── Token ───────────────────────────────────────────────────────────────

/** El texto que se firma. Separado para probarlo. */
function suplantacion_payload($objetivo_id, $real_id, $modo, $emitido, $vence): string
{
    return 'sup.' . intval($objetivo_id) . '.' . intval($real_id) . '.' . ($modo === 'lectura' ? 'lectura' : 'normal')
        . '.' . intval($emitido) . '.' . intval($vence);
}

/** Genera el token (base64) de una sesión de suplantación. $ahora se puede fijar en pruebas. */
function suplantacion_generar_token($objetivo_id, $real_id, $modo, $secreto, $ahora = null): array
{
    $ahora = $ahora === null ? time() : intval($ahora);
    $vence = $ahora + SUPLANTACION_TTL;
    $payload = suplantacion_payload($objetivo_id, $real_id, $modo, $ahora, $vence);
    $firma = hash_hmac('sha256', $payload, (string) $secreto);
    return ['token' => base64_encode($payload . '.' . $firma), 'emitido' => $ahora, 'vence' => $vence];
}

/**
 * Lee y valida la FIRMA y los tiempos de un token de suplantación (sin tocar la base).
 * Devuelve ['objetivo_id','real_id','modo','emitido','vence'] o null si no es válido
 * (formato, firma, vencido o con una duración mayor a SUPLANTACION_TTL). PURA.
 */
function suplantacion_leer_token($token_b64, $secreto, $ahora = null): ?array
{
    $ahora = $ahora === null ? time() : intval($ahora);
    $dec = base64_decode((string) $token_b64, true);
    if ($dec === false) return null;
    $p = explode('.', $dec);
    if (count($p) !== 7 || $p[0] !== 'sup') return null;
    [, $objetivo, $real, $modo, $emitido, $vence, $firma] = $p;
    if (!ctype_digit($objetivo) || !ctype_digit($real) || !ctype_digit($emitido) || !ctype_digit($vence)) return null;
    if ($modo !== 'normal' && $modo !== 'lectura') return null;
    $esperada = hash_hmac('sha256', suplantacion_payload($objetivo, $real, $modo, $emitido, $vence), (string) $secreto);
    if (!hash_equals($esperada, (string) $firma)) return null;
    if (intval($vence) < $ahora) return null;
    if (intval($vence) - intval($emitido) > SUPLANTACION_TTL + 5) return null; // nadie firma una sesión más larga
    if (intval($emitido) > $ahora + 60) return null;                           // emitida en el futuro
    return ['objetivo_id' => intval($objetivo), 'real_id' => intval($real), 'modo' => $modo,
            'emitido' => intval($emitido), 'vence' => intval($vence)];
}

/** Minutos que le quedan (redondeados hacia arriba), para la barra. */
function suplantacion_minutos_restantes($vence, $ahora = null): int
{
    $ahora = $ahora === null ? time() : intval($ahora);
    return max(0, (int) ceil((intval($vence) - $ahora) / 60));
}

// ── Rastro ──────────────────────────────────────────────────────────────

/**
 * Normaliza el contexto de suplantación de $usuario_actual: devuelve
 * ['real' => id, 'modo' => 'normal'|'lectura'] o null si la sesión es normal. PURA.
 */
function suplantacion_contexto($usuario_actual): ?array
{
    if (!is_array($usuario_actual) || empty($usuario_actual['suplantado_por'])) return null;
    return ['real' => intval($usuario_actual['suplantado_por']),
            'modo' => ($usuario_actual['suplantacion_modo'] ?? 'lectura') === 'normal' ? 'normal' : 'lectura'];
}

// ── Verificación contra la base (la llama verificar_token_auth de api.php) ─

/** Corta la petición con 401, dejando la causa en api_log (igual que verificar_token_auth). */
function suplantacion_rechazar_401($accionLog, $causa, $mensaje = 'Sesión de "Ver como" no válida o vencida.')
{
    log_api("AUTH FALLÓ ({$accionLog}) -> suplantación: {$causa}");
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => $mensaje, 'codigo' => 'suplantacion_vencida']);
    exit;
}

/** Lee una fila de usuarios (con cliente_id si la columna ya existe). */
function suplantacion_fila_usuario(PDO $pdo, $id): ?array
{
    try {
        $st = $pdo->prepare("SELECT id, nombre, rol, escuela_id, familia_id, cliente_id, activo, sesion_valida_desde FROM usuarios WHERE id = ?");
        $st->execute([intval($id)]);
    } catch (\PDOException $e) {
        $st = $pdo->prepare("SELECT id, nombre, rol, escuela_id, familia_id, activo, sesion_valida_desde FROM usuarios WHERE id = ?");
        $st->execute([intval($id)]);
    }
    $f = $st->fetch();
    return $f ?: null;
}

/**
 * Valida un token de suplantación contra la base y devuelve el $usuario_actual del
 * OBJETIVO con 'suplantado_por', 'suplantacion_modo' y 'suplantacion_vence'. Si algo
 * falla corta con 401 (la sesión propia del navegador sigue viva: solo se pierde esta).
 * $token_b64 es el token tal como llegó en el encabezado (verificar_token_auth() de api.php).
 */
function suplantacion_verificar_token(PDO $pdo, string $token_b64, string $accionLog): array
{
    if (!defined('APP_TOKEN_SECRET')) suplantacion_rechazar_401($accionLog, 'sin secreto configurado');
    $t = suplantacion_leer_token($token_b64, APP_TOKEN_SECRET);
    if ($t === null) suplantacion_rechazar_401($accionLog, 'firma inválida, formato incorrecto o vencida');

    $real = suplantacion_fila_usuario($pdo, $t['real_id']);
    $obj  = suplantacion_fila_usuario($pdo, $t['objetivo_id']);
    if (!$real || !$obj) suplantacion_rechazar_401($accionLog, "real={$t['real_id']} u objetivo={$t['objetivo_id']} no existe");

    // Las dos cuentas deben estar vivas y no haber cerrado sesiones después de emitido el token.
    foreach ([['real', $real], ['objetivo', $obj]] as [$quien, $fila]) {
        if (empty($fila['activo'])) suplantacion_rechazar_401($accionLog, "{$quien} inactivo");
        if (!empty($fila['sesion_valida_desde']) && $t['emitido'] < strtotime($fila['sesion_valida_desde'])) {
            suplantacion_rechazar_401($accionLog, "{$quien} con sesiones cerradas después de emitido el token");
        }
        if (!empty($fila['escuela_id'])) {
            $esc = $pdo->prepare("SELECT activa FROM escuelas WHERE id = ?");
            $esc->execute([$fila['escuela_id']]);
            $e = $esc->fetch();
            if ($e && !$e['activa']) suplantacion_rechazar_401($accionLog, "{$quien}: escuela {$fila['escuela_id']} inactiva");
        }
    }

    // La regla se vuelve a evaluar en CADA petición (el rol o la escuela pudieron cambiar).
    $dec = suplantacion_decision($real, $obj);
    if (!$dec['ok']) suplantacion_rechazar_401($accionLog, 'ya no está permitido: ' . $dec['motivo']);
    $modo = suplantacion_modo_final($dec['modo'], $t['modo']); // nunca menos estricto que la decisión actual

    return [
        'user_id'    => intval($obj['id']),
        'rol'        => $obj['rol'],
        'escuela_id' => $obj['escuela_id'],
        'familia_id' => $obj['familia_id'] ? intval($obj['familia_id']) : null,
        'cliente_id' => !empty($obj['cliente_id']) ? intval($obj['cliente_id']) : null,
        // [OF-7c] Contexto de la suplantación.
        'suplantado_por'     => intval($real['id']),
        'suplantado_por_nombre' => (string) ($real['nombre'] ?? ''),
        'suplantacion_modo'  => $modo,
        'suplantacion_vence' => $t['vence'],
    ];
}
