<?php
        $folio       = trim($input['folio'] ?? '');
        $total       = floatval($input['total'] ?? 0);
        $descripcion = $input['descripcion'] ?? 'Pago escolar';
        if (!$folio) respond(['success' => false, 'error' => 'folio requerido']);
        if ($total < 50 || $total > 15000) respond(['success' => false, 'error' => 'Monto fuera de rango ($50.00 - $15,000.00)']);
        $stmtCob = $pdo->prepare("SELECT id, cliente_id, escuela_id FROM cobros WHERE folio = ? AND estado = 'pendiente'");
        $stmtCob->execute([$folio]);
        $cobroRow = $stmtCob->fetch();
        if (!$cobroRow) respond(['success' => false, 'error' => 'No existe un cobro pendiente con ese folio']);
        // Verificar pertenencia: admin/cajero solo de su propia escuela (antes
        // no se validaba nada de esto — mismo hueco que tenía generar_liga.php).
        $rolRefEfvo = $usuario_actual['rol'] ?? '';
        requerir_escuela_propia($rolRefEfvo, $cobroRow['escuela_id'], $usuario_actual, 'No tienes permiso sobre este cobro.');
        requerir_seccion_habilitada($pdo, $rolRefEfvo, $cobroRow['escuela_id'], ['caja']);
        // Reference: usa el id del cobro (autoincrement, único de por vida,
        // nunca se reutiliza), zero-padded a REFERENCIA_DIGITOS (13 en
        // Pagalaescuela, que es donde corre este servicio ahora — ver más
        // abajo). A propósito NO se reusa construir_referencia_pago(): esa
        // función checa unicidad contra el valor actual de `cobros.referencia`,
        // pero AQUÍ esa columna se sobreescribe más abajo con la Reference
        // ENVUELTA que regresa el proveedor (necesaria para que
        // consulta_referencia.php/pago_referencia.php encuentren el cobro) —
        // así que un cobro exitoso "olvida" su $ref original en cuanto se
        // sobreescribe, y construir_referencia_pago() podría reasignar ese
        // mismo valor a un cobro futuro sin darse cuenta. Usar el id del
        // cobro evita el problema de raíz: nunca se repite, sin necesitar
        // checar nada en BD. Además, la doc del proveedor
        // (IntegracionesReferencias_V1_4) confirma que repetir la MISMA
        // referencia en un reintento del MISMO cobro es intencional y
        // soportado ("retornaremos los mismos datos vinculados a dicha
        // referencia"), así que tampoco hace falta variar el valor entre
        // reintentos de un mismo folio.
        $ref = str_pad(strval($cobroRow['id']), REFERENCIA_DIGITOS, '0', STR_PAD_LEFT);
        // Se guarda YA, antes de llamar al proveedor, para que quede algo
        // registrado contra este cobro aunque la llamada falle o truene a
        // medias (se sobreescribe con la Reference envuelta real si la
        // llamada tiene éxito, ver abajo).
        $pdo->prepare("UPDATE cobros SET referencia = ? WHERE id = ?")->execute([$ref, $cobroRow['id']]);
        // Cobroscontarjeta.com movió este servicio de Pagadetodo (125) a
        // Pagalaescuela (09-sep-2026) — usa las credenciales de Pagalaescuela
        // (PLE_INT_ID/PLE_SCHOOL_ID) Y la URL de Pagalaescuela
        // (PLE_URL_REFERENCIA). Antes solo se habían cambiado las
        // credenciales dejando la URL vieja de Pagadetodo, lo que causaba el
        // error 26 "no está vinculado este comercio a su integración" —
        // Osbel confirmó que el error era justo por eso: hay que llamar a la
        // plataforma de Pagalaescuela, no solo mandarle sus credenciales a
        // Pagadetodo.
        $payload = [
            'User'           => PDT_USER,
            'Password'       => PDT_PASS,
            'IntegrationID'  => PLE_INT_ID,
            // SchoolID: el backend de Pagalaescuela regresó código 8 "El ID
            // de la escuela es obligatorio" cuando solo se mandaba
            // BusinessID (vocabulario de Pagadetodo) — se mandan ambos con
            // el mismo valor para cubrir los dos vocabularios, mismo patrón
            // ya usado en generar_liga.php.
            'SchoolID'       => PLE_SCHOOL_ID,
            'BusinessID'     => PLE_SCHOOL_ID,
            'Description'    => substr($descripcion, 0, 50),
            'Amount'         => intval(round($total * 100)),
            'Reference'      => $ref,
            'CustomerEmail'  => '',
            'CustomerName'   => '',
            'ExpirationDate' => date('Y-m-d', strtotime('+3 days')),
        ];
        log_api("generar_referencia_efectivo -> folio={$folio} total={$total} ref={$ref}");
        $res = curl_post(PLE_URL_REFERENCIA, $payload);
        if ($res['error']) respond(['success' => false, 'error' => 'Error de red: ' . $res['error']]);
        $raw = json_decode($res['body'], true) ?? [];
        $referencia_cct = $raw['Reference'] ?? null;
        if (!$referencia_cct || !empty($raw['Error'])) {
            log_api("generar_referencia_efectivo FALLÓ -> " . json_encode($raw, JSON_UNESCAPED_UNICODE));
            respond(['success' => false, 'error' => $raw['Error'] ?? ($raw['Message'] ?? 'No se pudo generar la referencia')]);
        }
        if (empty($raw['PayFormat'])) {
            log_api("generar_referencia_efectivo OK sin PayFormat -> " . json_encode($raw, JSON_UNESCAPED_UNICODE));
        }
        // IMPORTANTE: aquí SÍ hay que sobreescribir "referencia" otra vez,
        // ahora con $referencia_cct (la Reference ENVUELTA que regresa el
        // proveedor), no dejar el $ref interno de arriba. webhooks/
        // consulta_referencia.php y pago_referencia.php buscan el cobro
        // por `referencia = ?` usando el valor que el CLIENTE presenta en
        // la tienda (el que trae el ticket/código de barras), que es
        // $referencia_cct — no nuestro $ref de 13/15 dígitos. El $ref de
        // arriba solo sirve para "quemar" el intento localmente antes de
        // llamar al proveedor; una vez que la llamada tuvo éxito, la
        // referencia real para conciliar el pago es esta.
        $pdo->prepare(
            "UPDATE cobros SET metodo = 'EfectivoRef', referencia = ?, ref_barcode_url = ?, ref_payformat_url = ?, ref_vencimiento = ? WHERE id = ?"
        )->execute([
            $referencia_cct,
            $raw['BarCode'] ?? null,
            $raw['PayFormat'] ?? null,
            date('Y-m-d', strtotime('+3 days')),
            $cobroRow['id'],
        ]);
        registrar_log($pdo, $usuario_actual, 'referencia_efectivo_generada', "Cobro #{$cobroRow['id']} folio {$folio}, total \${$total}, ref {$referencia_cct}");
        respond([
            'success'      => true,
            'cobro_id'     => intval($cobroRow['id']),
            'referencia'   => $referencia_cct,
            'barcode_url'  => $raw['BarCode'] ?? null,
            'payformat_url'=> $raw['PayFormat'] ?? null,
            'vencimiento'  => date('Y-m-d', strtotime('+3 days')),
        ]);
