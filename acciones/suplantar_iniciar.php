<?php
// suplantar_iniciar — "Ver como": entrar como otro usuario SIN pedirle su contraseña (OF-7c).
//
// Entrada: usuario_id (a quién), password (LA PROPIA del que entra, nunca la del otro),
//          modo? ('lectura' pide solo lectura aunque le tocara normal; nunca al revés).
// Devuelve un token de suplantación (30 min máx.) y el usuario objetivo con la misma forma
// que login, más los datos de la sesión (modo, vencimiento, quién es el real).
//
// QUIÉN PUEDE VER COMO QUIÉN lo decide suplantacion_decision() (lib/helpers_suplantacion.php),
// siempre aquí en el servidor: superadmin → cualquiera que no sea superadmin; soporte →
// usuarios de colegio, siempre lectura; admin → los de su escuela (cajero, control_escolar,
// direccion, docente, tienda en modo normal; familia y alumno siempre lectura).
//
// LA CONTRASEÑA es la del usuario REAL, con el mismo freno de intentos que login.php
// (15 fallos por IP o 5 por usuario en 15 minutos). Un intento fallido queda en
// logs_sistema como 'suplantar_fallido'.
//
// No se puede iniciar una suplantación desde otra suplantación (el filtro de api.php ya
// bloquea 'suplantar_iniciar' con un token de suplantación; aquí se vuelve a rechazar).
requerir_rol($usuario_actual['rol'] ?? '', ['superadmin', 'soporte', 'admin'], 'No tienes permiso para usar "Ver como".');
if (suplantacion_contexto($usuario_actual) !== null) {
    http_response_code(403);
    respond(['success' => false, 'error' => SUPLANTACION_MENSAJE_PROHIBIDA]);
}
$real_id = intval($usuario_actual['user_id'] ?? 0);
$objetivo_id = intval($input['usuario_id'] ?? 0);
$clave_real = (string) ($input['password'] ?? '');
if ($objetivo_id <= 0) respond(['success' => false, 'error' => 'Elige a quién quieres ver.']);
if ($clave_real === '') respond(['success' => false, 'error' => 'Escribe tu contraseña para continuar.']);

// Freno de intentos (mismo criterio que login.php: logs_sistema, sin tabla nueva).
$detalle_intento = "Intento de ver como con contraseña incorrecta (usuario #{$real_id})";
try {
    $ip_sup = $_SERVER['REMOTE_ADDR'] ?? '';
    $porIp = $pdo->prepare("SELECT COUNT(*) FROM logs_sistema WHERE accion = 'suplantar_fallido' AND ip = ? AND fecha >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)");
    $porIp->execute([$ip_sup]);
    $porUsuario = $pdo->prepare("SELECT COUNT(*) FROM logs_sistema WHERE accion = 'suplantar_fallido' AND detalle = ? AND fecha >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)");
    $porUsuario->execute([$detalle_intento]);
    if (intval($porIp->fetchColumn()) >= 15 || intval($porUsuario->fetchColumn()) >= 5) {
        respond(['success' => false, 'error' => 'Demasiados intentos fallidos. Espera unos minutos antes de volver a intentar.']);
    }
} catch (\PDOException $e) {
    // Sin logs_sistema no se bloquea por eso (igual que login.php).
}

// La contraseña PROPIA: se verifica contra el renglón del usuario real, nunca contra el del objetivo.
$stReal = $pdo->prepare("SELECT id, nombre, email, rol, escuela_id, activo, password_hash FROM usuarios WHERE id = ?");
$stReal->execute([$real_id]);
$real = $stReal->fetch(PDO::FETCH_ASSOC);
if (!$real || empty($real['activo']) || !password_verify($clave_real, (string) $real['password_hash'])) {
    registrar_log($pdo, $usuario_actual, 'suplantar_fallido', $detalle_intento);
    respond(['success' => false, 'error' => 'Tu contraseña no es correcta.']);
}

$stObj = $pdo->prepare("SELECT id, nombre, email, rol, escuela_id, familia_id, activo FROM usuarios WHERE id = ?");
$stObj->execute([$objetivo_id]);
$objetivo = $stObj->fetch(PDO::FETCH_ASSOC);
$decision = $objetivo ? suplantacion_decision($real, $objetivo) : ['ok' => false, 'motivo' => 'no existe'];
if (!$decision['ok']) {
    // Mensaje genérico a propósito: no confirma si ese id existe en otro colegio.
    log_api("suplantar_iniciar DENEGADO real={$real_id} objetivo={$objetivo_id}: " . $decision['motivo']);
    http_response_code(403);
    respond(['success' => false, 'error' => 'No tienes permiso para ver como esa cuenta.']);
}
if (!empty($objetivo['escuela_id'])) {
    $stEsc = $pdo->prepare("SELECT activa FROM escuelas WHERE id = ?");
    $stEsc->execute([$objetivo['escuela_id']]);
    $escRow = $stEsc->fetch();
    if ($escRow && !$escRow['activa']) respond(['success' => false, 'error' => 'El colegio de esa cuenta está inactivo.']);
}

$modo = suplantacion_modo_final($decision['modo'], $input['modo'] ?? '');
$tk = suplantacion_generar_token($objetivo['id'], $real_id, $modo, APP_TOKEN_SECRET);

// Rastro: bitácora de auditoría (a nombre del que entra) y logs_sistema.
auditar($pdo, $usuario_actual, 'suplantar.inicio', 'usuario', $objetivo['id'], [],
    ['entra_como' => $objetivo['nombre'], 'rol_objetivo' => $objetivo['rol'], 'modo' => $modo, 'vence' => date('Y-m-d H:i:s', $tk['vence'])],
    $objetivo['escuela_id'], ['evento' => true]);
registrar_log($pdo, $usuario_actual, 'suplantar_inicio',
    "Entró como el usuario #{$objetivo['id']} ({$objetivo['rol']}) en modo {$modo}", $objetivo['escuela_id']);

respond([
    'success' => true,
    'user' => [
        'id' => intval($objetivo['id']), 'nombre' => $objetivo['nombre'], 'email' => $objetivo['email'],
        'rol' => $objetivo['rol'], 'escuela_id' => $objetivo['escuela_id'],
        'familia_id' => $objetivo['familia_id'] ? intval($objetivo['familia_id']) : null,
        // La guía de primer uso del OBJETIVO no se dispara (ni se marca como vista) al mirarlo.
        'guia_pendiente' => false,
        'token' => $tk['token'],
    ],
    'suplantacion' => [
        'modo' => $modo, 'emitido' => $tk['emitido'], 'vence' => $tk['vence'],
        'real' => ['id' => $real_id, 'nombre' => $real['nombre'], 'rol' => $real['rol']],
    ],
]);
