<?php
        // Solo superadmin (10-sep-2026): esto marca un cobro como pagado sin
        // que el banco haya confirmado nada real. Antes solo exigía la
        // sección "facturación" habilitada, así que CUALQUIER admin o
        // cajero de CUALQUIER escuela podía llamarlo directo (sin pasar por
        // el botón) y "pagarse" sus propios cobros gratis -- un hueco de
        // fraude real, no solo una herramienta de prueba visible de más.
        requerir_rol($usuario_actual['rol'] ?? '', ['superadmin'], 'Esta herramienta es solo para el equipo de soporte.');
        $referencia    = strtoupper(trim($input['referencia'] ?? ''));
        $monto         = intval(floatval($input['monto'] ?? 0) * 100);
        $emisor        = $input['emisor'] ?? 'PADRE DE FAMILIA DEMO';
        $clabe_destino = trim($input['clabe_destino'] ?? '') ?: SPEI_CLABE_FIJA;
        if (!$referencia || $monto <= 0) {
            respond(['success' => false, 'error' => 'referencia y monto requeridos']);
        }
        $archivo  = __DIR__ . '/pagos_spei.json';
        $fp       = fopen($archivo, 'c+');
        flock($fp, LOCK_EX);
        $contenido = stream_get_contents($fp);
        $pagos     = $contenido ? (json_decode($contenido, true) ?? []) : [];
        $autorizacion = rand(10000000, 99999999);
        $pagos[$referencia] = [
            'concepto'       => $referencia,
            'concepto_raw'   => $referencia,
            'clabe_destino'  => $clabe_destino,
            'monto'          => $monto,
            'monto_pesos'    => number_format($monto / 100, 2),
            'clave_rastreo'  => 'SIM-' . date('YmdHis'),
            'autorizacion'   => $autorizacion,
            'nombre_emisor'  => $emisor,
            'fecha'          => date('Y-m-d'),
            'recibido_en'    => date('Y-m-d H:i:s'),
            'pagado'         => true,
            'simulado'       => true,
        ];
        rewind($fp);
        ftruncate($fp, 0);
        fwrite($fp, json_encode($pagos, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        flock($fp, LOCK_UN);
        fclose($fp);
        log_api("simular_spei -> ref={$referencia} clabe={$clabe_destino} monto=" . number_format($monto/100,2));
        respond(['success' => true, 'autorizacion' => $autorizacion, 'mensaje' => 'Pago simulado OK']);
