<?php
// acciones/descargar_complemento_pago.php
//
// Descarga el PDF/XML del CFDI DE PAGO (tipo "P") de UN abono — la parte que
// faltaba tras generar_complemento_pago.php: hasta hoy, la única constancia
// que veía el usuario era la ventana de alert() en el momento de emitirlo, con
// el UUID. Si se cerraba esa alerta, el folio fiscal quedaba solo en la base
// de datos, sin ninguna forma de recuperarlo desde la interfaz.
//
// Mismo patrón que acciones/descargar_cfdi.php (cobro_id -> facturapi_id),
// pero aquí la llave es abono_id -> cfdi_complemento_id, y la autorización
// agrega al padre de familia dueño del cobro (no solo admin/cajero/superadmin
// de la escuela), porque el complemento también debe poder verlo el que pagó.

$abono_id_cp = intval($_GET['abono_id'] ?? $input['abono_id'] ?? 0);
$tipo_cp     = strtolower(trim($_GET['tipo'] ?? $input['tipo'] ?? 'pdf'));
if (!$abono_id_cp) {
    respond(['success' => false, 'error' => 'abono_id requerido']);
}
if (!in_array($tipo_cp, ['xml', 'pdf'])) {
    respond(['success' => false, 'error' => 'tipo debe ser xml o pdf']);
}

$chkCp = $pdo->prepare(
    "SELECT a.cfdi_complemento_id, a.escuela_id AS abono_escuela_id,
            c.escuela_id AS cobro_escuela_id, c.cliente_id,
            cl.familia_id
       FROM cobro_abonos a
       JOIN cobros c    ON c.id = a.cobro_id
  LEFT JOIN clientes cl ON cl.id = c.cliente_id
      WHERE a.id = ?"
);
$chkCp->execute([$abono_id_cp]);
$abCp = $chkCp->fetch();
if (!$abCp) { http_response_code(404); respond(['success' => false, 'error' => 'Abono no encontrado']); }
if (!$abCp['cfdi_complemento_id']) {
    http_response_code(400);
    respond(['success' => false, 'error' => 'Este abono no tiene complemento de pago emitido.']);
}
// La escuela real es la del COBRO: a.escuela_id admite NULL (mismo caso ya
// documentado en abonos_sin_complemento_listar.php), así que no es confiable
// para autorizar.
$escuelaCp = $abCp['cobro_escuela_id'];

$rolCp = $usuario_actual['rol'] ?? '';
$autorizadoCp = false;
if ($rolCp === 'superadmin') {
    $autorizadoCp = true;
} elseif (in_array($rolCp, ['admin', 'cajero'])) {
    $autorizadoCp = intval($escuelaCp) === intval($usuario_actual['escuela_id'] ?? -1);
    if ($autorizadoCp) {
        requerir_seccion_habilitada($pdo, $rolCp, $escuelaCp, ['facturacion']);
    }
} elseif ($rolCp === 'familia') {
    $autorizadoCp = $abCp['familia_id'] !== null && intval($abCp['familia_id']) === intval($usuario_actual['familia_id'] ?? -1);
}
if (!$autorizadoCp) {
    http_response_code(403);
    respond(['success' => false, 'error' => 'No tienes permiso para descargar este complemento de pago.']);
}

$facturapi_id_cp = $abCp['cfdi_complemento_id'];
$resCp = facturapi_request("invoices/{$facturapi_id_cp}/{$tipo_cp}");
$binaryCp   = $resCp['body'];
$httpCodeCp = $resCp['http_code'];
if ($resCp['error']) {
    http_response_code(502);
    respond(['success' => false, 'error' => 'Error de red: ' . $resCp['error']]);
}
if ($httpCodeCp !== 200) {
    http_response_code($httpCodeCp >= 400 && $httpCodeCp < 600 ? $httpCodeCp : 502);
    header('Content-Type: application/json; charset=UTF-8');
    $decodedCp = json_decode($binaryCp, true);
    $msgCp = $decodedCp['message'] ?? "Facturapi respondió HTTP {$httpCodeCp}";
    respond(['success' => false, 'error' => $msgCp]);
}

header_remove('Content-Type');
$mimeCp     = ($tipo_cp === 'pdf') ? 'application/pdf' : 'application/xml; charset=UTF-8';
$filenameCp = "complemento-pago-{$facturapi_id_cp}.{$tipo_cp}";
header("Content-Type: {$mimeCp}");
header("Content-Disposition: attachment; filename=\"{$filenameCp}\"");
header('Content-Length: ' . strlen($binaryCp));
header('Cache-Control: no-cache, must-revalidate');
log_api("descargar_complemento_pago -> abono={$abono_id_cp} id={$facturapi_id_cp} tipo={$tipo_cp} http={$httpCodeCp}");
echo $binaryCp;
exit;