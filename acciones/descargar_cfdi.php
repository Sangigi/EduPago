<?php
        // Ahora requiere login (ya no está en $acciones_publicas) y recibe
        // cobro_id en vez de facturapi_id crudo — antes cualquiera con el ID
        // de Facturapi (que ni siquiera se guardaba en BD) podía descargar
        // el CFDI de cualquier escuela sin autenticarse.
        $cobro_id_cfdi = intval($_GET['cobro_id'] ?? $input['cobro_id'] ?? 0);
        $tipo          = strtolower(trim($_GET['tipo'] ?? $input['tipo'] ?? 'pdf'));
        if (!$cobro_id_cfdi) {
            respond(['success' => false, 'error' => 'cobro_id requerido']);
        }
        if (!in_array($tipo, ['xml', 'pdf'])) {
            respond(['success' => false, 'error' => 'tipo debe ser xml o pdf']);
        }
        $chkCfdi = $pdo->prepare(
            "SELECT co.facturapi_id, co.escuela_id, cl.familia_id
             FROM cobros co LEFT JOIN clientes cl ON cl.id = co.cliente_id
             WHERE co.id = ?"
        );
        $chkCfdi->execute([$cobro_id_cfdi]);
        $cobroCfdi = $chkCfdi->fetch();
        if (!$cobroCfdi) { http_response_code(404); respond(['success' => false, 'error' => 'Cobro no encontrado']); }
        if (!$cobroCfdi['facturapi_id']) { http_response_code(400); respond(['success' => false, 'error' => 'Este cobro no tiene factura generada.']); }
        $rolCfdi = $usuario_actual['rol'] ?? '';
        $autorizado = false;
        if ($rolCfdi === 'superadmin') {
            $autorizado = true;
        } elseif (in_array($rolCfdi, ['admin', 'cajero'])) {
            $autorizado = intval($cobroCfdi['escuela_id']) === intval($usuario_actual['escuela_id'] ?? -1);
        } elseif ($rolCfdi === 'familia') {
            $autorizado = $cobroCfdi['familia_id'] !== null && intval($cobroCfdi['familia_id']) === intval($usuario_actual['familia_id'] ?? -1);
        }
        if (!$autorizado) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'No tienes permiso para descargar esta factura.']);
        }
        $facturapi_id = $cobroCfdi['facturapi_id'];
        $res = facturapi_request("invoices/{$facturapi_id}/{$tipo}");
        $binary    = $res['body'];
        $http_code = $res['http_code'];
        if ($res['error']) {
            http_response_code(502);
            respond(['success' => false, 'error' => 'Error de red: ' . $res['error']]);
        }
        if ($http_code !== 200) {
            // Facturapi devolvió un error JSON — lo relay como JSON, con el
            // mismo código de estado para que el frontend no lo confunda
            // con una descarga exitosa (antes siempre regresaba HTTP 200
            // aunque el cuerpo fuera un error, y el navegador intentaba
            // "abrir" ese JSON como si fuera el PDF).
            http_response_code($http_code >= 400 && $http_code < 600 ? $http_code : 502);
            header('Content-Type: application/json; charset=UTF-8');
            $decoded = json_decode($binary, true);
            $msg = $decoded['message'] ?? "Facturapi respondió HTTP {$http_code}";
            respond(['success' => false, 'error' => $msg]);
        }
        // Éxito: stream the file to the browser
        // Reemplaza el Content-Type JSON que se mandó al inicio del archivo
        header_remove('Content-Type');
        $mime     = ($tipo === 'pdf') ? 'application/pdf' : 'application/xml; charset=UTF-8';
        $filename = "cfdi-{$facturapi_id}.{$tipo}";
        header("Content-Type: {$mime}");
        header("Content-Disposition: attachment; filename=\"{$filename}\"");
        header('Content-Length: ' . strlen($binary));
        header('Cache-Control: no-cache, must-revalidate');
        log_api("descargar_cfdi -> id={$facturapi_id} tipo={$tipo} http={$http_code}");
        echo $binary;
        exit;
