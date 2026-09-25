<?php
// acciones/enviar_recordatorio_correo.php
//
// Manda el recordatorio de pago POR CORREO desde el propio sistema.
//
// Antes el botón "Correo" de views/Recordatorios.js era un enlace `mailto:`.
// Eso no manda nada: abre el cliente de correo del equipo (Outlook, la app de
// Correo de Windows, o nada si no hay ninguno configurado) con el texto ya
// escrito, y el usuario todavía tiene que darle enviar. En una máquina sin
// cliente de correo el botón simplemente no hacía nada visible — y el sistema
// igual registraba el recordatorio como enviado, así que el historial decía
// que se avisó cuando no se avisó.
//
// El sistema ya manda correos solo (lib/mailer.php, y cron_recordatorios.php
// manda recordatorios de pago todas las noches), así que no había razón para
// delegar esto en el equipo del usuario.
//
// SEGURIDAD: el DESTINATARIO y el CONTENIDO salen de la base de datos, nunca
// de lo que mande el navegador. Aceptar un destinatario o un cuerpo del
// cliente convertiría este endpoint en un relay: cualquiera con una sesión
// podría mandar correo arbitrario a direcciones arbitrarias desde el dominio
// del sistema, quemando su reputación de envío.

$rol = $usuario_actual['rol'] ?? '';
requerir_rol($rol, ['superadmin', 'admin', 'cajero'], 'No tienes permiso para mandar recordatorios.');

$cobro_id = intval($input['cobro_id'] ?? 0);
if (!$cobro_id) respond(['success' => false, 'error' => 'cobro_id requerido']);

// Mismos datos que la pantalla usa para armar el mensaje (contactoDe en
// views/Recordatorios.js): el contacto de la familia manda sobre el del
// alumno, porque es quien paga.
// co.* y no una lista de columnas: `cobros.fecha_vencimiento` NO existe en
// ninguna migracion (solo `gastos` la tiene), y el propio front la lee de
// forma defensiva con `c.fecha_vencimiento || c.fecha`. Enumerarla aqui
// tumbaria la peticion con un 500 en cuanto el esquema no la tuviera.
$stmt = $pdo->prepare(
    "SELECT co.*,
            cl.nombre  AS cliente_nombre,  cl.email AS cliente_email,
            fa.nombre  AS familia_nombre,  fa.email AS familia_email, fa.contacto AS familia_contacto,
            es.nombre  AS escuela_nombre
       FROM cobros co
       LEFT JOIN clientes cl ON cl.id = co.cliente_id
       LEFT JOIN familias fa ON fa.id = cl.familia_id
       LEFT JOIN escuelas es ON es.id = co.escuela_id
      WHERE co.id = ?"
);
$stmt->execute([$cobro_id]);
$c = $stmt->fetch();
if (!$c) respond(['success' => false, 'error' => 'Cobro no encontrado']);

requerir_escuela_propia($rol, $c['escuela_id'], $usuario_actual, 'No tienes permiso sobre este cobro.');
requerir_seccion_habilitada($pdo, $rol, $c['escuela_id'], ['recordatorios']);

if (($c['estado'] ?? '') === 'pagado') {
    respond(['success' => false, 'error' => 'Este cobro ya está pagado; no tiene caso mandar un recordatorio.']);
}

$destino = trim((string) ($c['familia_email'] ?: $c['cliente_email']));
if ($destino === '') {
    respond(['success' => false,
             'codigo'  => 'sin_correo',
             'error'   => 'Este alumno no tiene correo registrado (ni él ni su familia). Agrégalo en su ficha para poder mandarle recordatorios.']);
}

// Nombre para el saludo: el contacto de la familia si existe, si no el alumno.
$nombre    = trim((string) ($c['familia_contacto'] ?: $c['cliente_nombre'] ?: ''));
$primer    = $nombre !== '' ? explode(' ', $nombre)[0] : '';
$saludo    = 'Hola' . ($primer !== '' ? ' ' . htmlspecialchars($primer) : '') . ',';

// El saldo, no el total: si ya hay abonos, pedir el total completo sería
// pedirle de más a alguien que ya pagó una parte (ver cobro_abonos).
$saldo     = max(0, floatval($c['total']) - floatval($c['monto_pagado'] ?? 0));
$saldoFmt  = '$' . number_format($saldo, 2) . ' MXN';
$escuela   = htmlspecialchars($c['escuela_nombre'] ?: 'tu colegio');
$alumno    = htmlspecialchars($c['cliente_nombre'] ?: '');
// El concepto NO es una columna de `cobros`: vive en `cobro_items` (ver el
// comentario de acciones/cargar_datos.php, que los adjunta aparte). Se toma
// el primero, que es el que la pantalla muestra. En try/catch porque
// cargar_datos ya contempla que la tabla pueda no existir todavia: un
// recordatorio no debe fallar por no poder decorar el mensaje.
$concepto = '';
try {
    $stmtIt = $pdo->prepare("SELECT nombre FROM cobro_items WHERE cobro_id = ? ORDER BY id LIMIT 1");
    $stmtIt->execute([$cobro_id]);
    $concepto = htmlspecialchars((string) ($stmtIt->fetchColumn() ?: ''));
} catch (\PDOException $e) {
    log_api("enviar_recordatorio_correo: no se pudo leer cobro_items del cobro #$cobro_id -> " . $e->getMessage());
}

$venc = ($c['fecha_vencimiento'] ?? null) ?: ($c['fecha'] ?? null);
$lineaVenc = '';
if ($venc) {
    $diasVenc = (int) floor((strtotime(date('Y-m-d')) - strtotime(substr($venc, 0, 10))) / 86400);
    $vencFmt  = date('d/m/Y', strtotime($venc));
    if ($diasVenc > 0)       $lineaVenc = "<p>Venció el <strong>$vencFmt</strong> (hace $diasVenc día" . ($diasVenc === 1 ? '' : 's') . ").</p>";
    elseif ($diasVenc === 0) $lineaVenc = "<p><strong>Vence hoy.</strong></p>";
    else                     $lineaVenc = "<p>Vence el <strong>$vencFmt</strong>.</p>";
}

$detalle = 'el pago de <strong>' . $saldoFmt . '</strong>';
if ($concepto !== '') $detalle .= ' por ' . $concepto;
if ($alumno   !== '') $detalle .= ' de ' . $alumno;

$asunto = 'Recordatorio de pago' . ($c['folio'] ? ' · ' . $c['folio'] : '') . ' — ' . ($c['escuela_nombre'] ?: 'Pagalaescuela');
$html = "
    <p>$saludo</p>
    <p>Te recordamos $detalle.</p>
    $lineaVenc
    <p>Si ya lo pagaste, ignora este mensaje.</p>
    <p>— $escuela</p>
";

$r = enviar_correo([$destino], $asunto, $html);
if (!($r['success'] ?? false)) {
    log_api("enviar_recordatorio_correo: fallo el envio del cobro #$cobro_id a $destino -> " . ($r['error'] ?? 'desconocido'));
    respond(['success' => false, 'error' => 'No se pudo mandar el correo: ' . ($r['error'] ?? 'error desconocido')]);
}

// El recordatorio se registra SOLO si el correo salió. Con el mailto: se
// registraba siempre, aunque no se hubiera mandado nada — el historial
// afirmaba que se avisó sin que fuera cierto.
//
// Idempotente: un recordatorio por cobro por día (índice uq_recordatorio_dia),
// igual que marcar_recordatorio.php.
try {
    $pdo->prepare(
        "INSERT INTO recordatorios (escuela_id, cobro_id, cliente, fecha, canal, usuario_id)
         VALUES (?, ?, ?, ?, 'email', ?)
         ON DUPLICATE KEY UPDATE canal = 'email'"
    )->execute([
        $c['escuela_id'], $cobro_id,
        $c['cliente_nombre'] ?: 'Cliente general',
        date('Y-m-d'), $usuario_actual['user_id'] ?? null,
    ]);
} catch (\PDOException $e) {
    // El correo YA salió: no se puede deshacer, así que no se falla la
    // respuesta por no haber podido anotarlo. Queda en el log.
    log_api("enviar_recordatorio_correo: el correo del cobro #$cobro_id salió pero no se pudo registrar -> " . $e->getMessage());
}

registrar_log($pdo, $usuario_actual, 'recordatorio_email_enviado',
    "Cobro #$cobro_id: recordatorio por correo a $destino", $c['escuela_id']);

respond(['success' => true, 'destino' => $destino]);
