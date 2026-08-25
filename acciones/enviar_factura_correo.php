<?php
        $cobro_id_mail = intval($input['cobro_id'] ?? 0);
        $email_destino = trim($input['email'] ?? '');
        if (!$cobro_id_mail) respond(['success' => false, 'error' => 'cobro_id requerido']);
        if (!$email_destino || !filter_var($email_destino, FILTER_VALIDATE_EMAIL)) {
            respond(['success' => false, 'error' => 'Correo destino inválido']);
        }
        $chkMail = $pdo->prepare(
            "SELECT co.facturapi_id, co.escuela_id, co.folio, co.total, cl.familia_id, e.nombre AS escuela_nombre
             FROM cobros co
             LEFT JOIN clientes cl ON cl.id = co.cliente_id
             LEFT JOIN escuelas e ON e.id = co.escuela_id
             WHERE co.id = ?"
        );
        $chkMail->execute([$cobro_id_mail]);
        $cobroMail = $chkMail->fetch();
        if (!$cobroMail) { http_response_code(404); respond(['success' => false, 'error' => 'Cobro no encontrado']); }
        if (!$cobroMail['facturapi_id']) { http_response_code(400); respond(['success' => false, 'error' => 'Este cobro no tiene factura generada.']); }
        $rolMail = $usuario_actual['rol'] ?? '';
        $autorizadoMail = false;
        if ($rolMail === 'superadmin') {
            $autorizadoMail = true;
        } elseif (in_array($rolMail, ['admin', 'cajero'])) {
            $autorizadoMail = intval($cobroMail['escuela_id']) === intval($usuario_actual['escuela_id'] ?? -1);
        } elseif ($rolMail === 'familia') {
            $autorizadoMail = $cobroMail['familia_id'] !== null && intval($cobroMail['familia_id']) === intval($usuario_actual['familia_id'] ?? -1);
        }
        if (!$autorizadoMail) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'No tienes permiso para enviar esta factura.']);
        }
        $res = facturapi_request("invoices/{$cobroMail['facturapi_id']}/pdf");
        $pdfBinario   = $res['body'];
        $httpCodeMail = $res['http_code'];
        $errMail      = $res['error'];
        if ($errMail || $httpCodeMail !== 200) {
            log_api("enviar_factura_correo -> error al descargar PDF de Facturapi: " . ($errMail ?: "http {$httpCodeMail}"));
            respond(['success' => false, 'error' => 'No se pudo obtener el PDF de la factura para enviarlo.']);
        }
        $escuelaNombreMail = $cobroMail['escuela_nombre'] ?: 'tu escuela';
        $htmlMail = '<p>Hola,</p>' .
            '<p>Adjunto encontrarás la factura de tu pago con folio <strong>' . htmlspecialchars($cobroMail['folio']) . '</strong> ' .
            'por un total de <strong>$' . number_format(floatval($cobroMail['total']), 2) . ' MXN</strong> en ' . htmlspecialchars($escuelaNombreMail) . '.</p>' .
            '<p>Este es un correo automático, por favor no respondas a esta dirección.</p>';
        $resMail = enviar_correo(
            $email_destino,
            'Tu factura de ' . $escuelaNombreMail . ' — folio ' . $cobroMail['folio'],
            $htmlMail,
            [[ 'nombre' => "cfdi-{$cobroMail['facturapi_id']}.pdf", 'contenido' => $pdfBinario, 'mime' => 'application/pdf' ]]
        );
        if (!$resMail['success']) {
            log_api("enviar_factura_correo -> FALLÓ envío a {$email_destino}: " . $resMail['error']);
            respond(['success' => false, 'error' => $resMail['error']]);
        }
        log_api("enviar_factura_correo -> OK cobro:{$cobro_id_mail} destino:{$email_destino}");
        respond(['success' => true]);
