<?php
        // Blindaje (11-sep-2026): este archivo no tenía requerir_rol ni
        // verificación de pertenencia de escuela -- cualquier sesión válida
        // (incluida una familia, o un admin de OTRO colegio) podía timbrar
        // el cobro de cualquier colegio, consumiendo timbres reales.
        $rol_cfdi = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_cfdi, ['superadmin', 'admin', 'cajero'], 'No tienes permiso para facturar.');

        $cobro_id    = $input['cobro_id']    ?? '';
        $rfc         = strtoupper(trim($input['rfc'] ?? ''));
        $razon       = strtoupper(trim($input['razon_social'] ?? ''));
        $uso         = $input['uso_cfdi']    ?? 'D10';
        $regimen     = $input['regimen']     ?? '616';
        $email       = $input['email']       ?? '';
        $total       = floatval($input['total']   ?? 0);
        // Antes se podía facturar sin cobro_id (un CFDI "suelto" sin dueño
        // verificable) -- ningún consumidor real (Caja.js, Facturacion.js) lo
        // hace así, y esa vía era justo la que impedía validar a qué escuela
        // pertenecía el cobro.
        if (!$cobro_id) {
            respond(['success' => false, 'error' => 'cobro_id requerido']);
        }
        // OJO: usar ?? no basta, porque si el frontend manda "" (cadena vacía),
        // ?? NO la reemplaza (solo actúa cuando es null/no existe), y Facturapi
        // rechaza con "items[0].product.description is not allowed to be empty".
        $descripcion = trim($input['descripcion'] ?? '');
        if ($descripcion === '') {
            $descripcion = 'Servicios educativos';
        }
        // CFDI 4.0 exige el Código Postal del receptor. 
        // Si no lo pides en el frontend, Facturapi arrojará error si no coincide con el RFC.
        $cp_receptor = $input['cp_receptor'] ?? '97000'; 
        if (!$rfc || !$razon || $total <= 0) {
            respond(['success' => false, 'error' => 'RFC, razón social y total son requeridos']);
        }
        // ── Complemento IEDU (Instituciones Educativas Privadas) ───────────
        // Facturapi lo exige para escuelas: nombreAlumno, CURP, nivelEducativo
        // y autRVOE. Se arma con datos del alumno (cliente) + de la escuela.
        // Si al cobro no se le puede asociar un alumno con estos 3 datos
        // completos, se omite el complemento (ej. "cliente general" sin CURP)
        // para no bloquear el timbrado por un campo que Facturapi solo exige
        // cuando SÍ envías el complemento.
        $iedu_complement = null;
        if ($cobro_id) {
            $stmtAl = $pdo->prepare(
                "SELECT c.nombre AS alumno_nombre, c.curp, c.nivel_educativo_sat,
                        e.rvoe AS escuela_rvoe, e.id AS escuela_id, e.es_plantel,
                        cb.escuela_id AS cobro_escuela_id, cb.factura AS cobro_ya_facturado
                 FROM cobros cb
                 JOIN clientes c ON c.id = cb.cliente_id
                 JOIN escuelas e ON e.id = c.escuela_id
                 WHERE cb.id = ?"
            );
            $stmtAl->execute([$cobro_id]);
            $al = $stmtAl->fetch();
            if (!$al) {
                respond(['success' => false, 'error' => 'Cobro no encontrado.']);
            }
            // El check de sección de abajo (requerir_seccion_habilitada) solo
            // valida si "facturacion"/"caja" está apagada para LA ESCUELA DEL
            // COBRO -- nunca compara contra la escuela del usuario. Este es
            // el check de pertenencia que faltaba.
            requerir_escuela_propia($rol_cfdi, $al['cobro_escuela_id'], $usuario_actual, 'No tienes permiso para facturar cobros de otra escuela.');
            if ($al['cobro_ya_facturado']) {
                respond(['success' => false, 'error' => 'Este cobro ya fue facturado.']);
            }
            if ($al) {
                $rvoe = $al['escuela_rvoe'];
                // Si el alumno pertenece a un plantel (escuelas.es_plantel=1),
                // preferimos el RVOE registrado en `planteles`, que vincula a
                // esa escuela-plantel por escuela_plantel_id.
                if (!empty($al['es_plantel'])) {
                    $stmtPl = $pdo->prepare("SELECT rvoe FROM planteles WHERE escuela_plantel_id = ? LIMIT 1");
                    $stmtPl->execute([$al['escuela_id']]);
                    $pl = $stmtPl->fetch();
                    if ($pl && !empty($pl['rvoe'])) $rvoe = $pl['rvoe'];
                }
                // Permitir que el frontend mande overrides puntuales (ej. si
                // el usuario corrigió el nivel educativo en el modal de CFDI).
                $nivel_educativo = trim($input['nivel_educativo'] ?? '') ?: $al['nivel_educativo_sat'];
                $curp_alumno     = trim($input['curp_alumno'] ?? '') ?: $al['curp'];
                $rvoe            = trim($input['rvoe'] ?? '') ?: $rvoe;
                $nombre_alumno   = trim($input['nombre_alumno'] ?? '') ?: $al['alumno_nombre'];
                if ($curp_alumno && $nivel_educativo && $rvoe && $nombre_alumno) {
                    $iedu_complement = [
                        'nombreAlumno'   => $nombre_alumno,
                        'CURP'           => strtoupper($curp_alumno),
                        'nivelEducativo' => $nivel_educativo,
                        'autRVOE'        => $rvoe,
                    ];
                    // rfcPago: solo si quien paga (el RFC de la factura) es
                    // distinto del alumno/tutor dado de alta — típico cuando
                    // la abuela o la empresa paga la colegiatura.
                    if (!empty($input['rfc_pago']) && strtoupper(trim($input['rfc_pago'])) !== $rfc) {
                        $iedu_complement['rfcPago'] = strtoupper(trim($input['rfc_pago']));
                    }
                } else {
                    log_api("generar_cfdi -> IEDU omitido por datos incompletos (cobro:{$cobro_id}) curp:" . ($curp_alumno ? 'ok' : 'falta') . " nivel:" . ($nivel_educativo ? 'ok' : 'falta') . " rvoe:" . ($rvoe ? 'ok' : 'falta'));
                }
            }
            requerir_seccion_habilitada($pdo, $usuario_actual['rol'] ?? '', $al ? $al['escuela_id'] : null, ['caja', 'facturacion']);
        }
        // 1. Estructuramos el payload para Facturapi
        // Facturapi calcula automáticamente el subtotal e IVA a partir del precio final
        // si le indicas que el precio incluye impuestos, o puedes enviarlo desglosado.
        // Aquí enviamos el subtotal y le decimos que agregue el IVA del 16%.
        $subtotal = round($total / 1.16, 2);
        // Domicilio fiscal: Facturapi CFDI 4.0 requiere customer.address.zip
        // Poner "zip" en el root del customer produce "customer.address is required"
        $domicilio = $input['domicilio'] ?? '';
        $customer_address = [
            "zip"     => $cp_receptor,
            "country" => "MEX"
        ];
        if ($domicilio) {
            $customer_address["street"] = $domicilio;
        }
        $item_producto = [
            "quantity" => 1,
            "product" => [
                "description" => $descripcion,
                "product_key" => "86101800", // Servicios educativos
                "price"       => $subtotal,
                "taxes"       => [
                    [
                        "type" => "IVA",
                        "rate" => 0.16
                    ]
                ]
            ]
        ];
        if ($iedu_complement) {
            $item_producto['complement'] = $iedu_complement;
        }
        $payload_facturapi = [
            "customer" => [
                "legal_name" => $razon,
                "tax_id"     => $rfc,
                "tax_system" => $regimen,
                "address"    => $customer_address,
                "email"      => $email ?: null
            ],
            "items" => [$item_producto],
            "use"          => $uso,
            "payment_form" => "03", // Transferencia electrónica
            "payment_method" => "PUE"
        ];
        // 2. Ejecutamos la petición cURL a Facturapi
        $res = facturapi_request('invoices', 'POST', $payload_facturapi);
        $http_code = $res['http_code'];
        if ($res['error']) {
            log_api("ERROR cURL Facturapi: " . $res['error']);
            respond(['success' => false, 'error' => 'Error de red al contactar al PAC.']);
        }
        $response_data = json_decode($res['body'], true);
        // 3. Manejo de la respuesta
        if ($http_code >= 200 && $http_code < 300 && isset($response_data['id'])) {
            $uuid = $response_data['uuid'] ?? 'PENDIENTE';
            // Guardar datos fiscales para pre-rellenar futuros CFDIs. El dato
            // fiscal (RFC/razón social/domicilio) es del tutor que paga, no
            // del alumno — se guarda en `familias` cuando el cliente tiene
            // familia_id; solo se guarda en `clientes` como respaldo para
            // clientes "generales" sin familia asociada.
            if ($cobro_id) {
                $cobro_row = $pdo->prepare("SELECT c.cliente_id, cl.familia_id FROM cobros c LEFT JOIN clientes cl ON cl.id = c.cliente_id WHERE c.id = ?");
                $cobro_row->execute([$cobro_id]);
                $cr = $cobro_row->fetch();
                if ($cr && $cr['familia_id']) {
                    try {
                        $pdo->prepare(
                            "UPDATE familias SET
                                rfc_factura           = ?,
                                razon_social_factura  = ?,
                                cp_factura            = ?,
                                domicilio_factura     = ?,
                                regimen_factura       = ?,
                                uso_cfdi_defecto      = ?
                             WHERE id = ?"
                        )->execute([$rfc, $razon, $cp_receptor, $domicilio, $regimen, $uso, $cr['familia_id']]);
                    } catch (\PDOException $e) {
                        log_api("generar_cfdi -> no se pudo guardar fiscal en familias (¿falta migrar columnas?): " . $e->getMessage());
                    }
                } elseif ($cr && $cr['cliente_id']) {
                    $pdo->prepare(
                        "UPDATE clientes SET
                            rfc_factura           = ?,
                            razon_social_factura  = ?,
                            cp_factura            = ?,
                            domicilio_factura     = ?,
                            regimen_factura       = ?,
                            uso_cfdi_defecto      = ?
                         WHERE id = ?"
                    )->execute([$rfc, $razon, $cp_receptor, $domicilio, $regimen, $uso, $cr['cliente_id']]);
                }
                // Marcar cobro como facturado y guardar el facturapi_id — sin
                // esto no había forma de volver a descargar la factura después.
                // El resto de estas columnas (11-sep-2026) es lo que antes solo
                // vivía en localStorage del navegador: sin persistirlas aquí,
                // la pestaña "Emitidas" quedaba vacía en cada recarga y el
                // mismo cobro se podía volver a timbrar por error (ya pasó).
                $pdo->prepare(
                    "UPDATE cobros SET
                        factura = 1,
                        facturapi_id           = ?,
                        factura_uuid           = ?,
                        factura_serie          = ?,
                        factura_folio          = ?,
                        factura_fecha_timbrado = ?,
                        factura_subtotal       = ?,
                        factura_iva            = ?,
                        factura_rfc_receptor   = ?,
                        factura_razon_social   = ?,
                        factura_uso_cfdi       = ?,
                        factura_cp_receptor    = ?,
                        factura_email_receptor = ?,
                        factura_qr_url         = ?
                     WHERE id = ?"
                )->execute([
                    $response_data['id'],
                    $uuid,
                    'F',
                    $response_data['folio_number'] ?? '',
                    $response_data['created_at'] ?? date('Y-m-d H:i:s'),
                    $subtotal,
                    round($total - $subtotal, 2),
                    $rfc,
                    $razon,
                    $uso,
                    $cp_receptor,
                    $email ?: null,
                    'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' . urlencode($response_data['verification_url'] ?? ''),
                    $cobro_id,
                ]);
            }
            log_api("generar_cfdi -> EXITOSO cobro:{$cobro_id} uuid:{$uuid}");
            respond([
                'success'        => true,
                'facturapi_id'   => $response_data['id'],
                'uuid'           => $uuid,
                'folio_fiscal'   => $uuid,
                'serie'          => 'F',
                'folio'          => $response_data['folio_number'] ?? '',
                'fecha_timbrado' => $response_data['created_at'] ?? date('Y-m-d\TH:i:s'),
                'subtotal'       => $subtotal,
                'iva'            => round($total - $subtotal, 2),
                'total'          => $total,
                // Facturapi permite descargar el XML con una URL pública si configuras tu cuenta,
                // o haciendo un GET a https://www.facturapi.io/v2/invoices/{id}/xml
                'xml'            => '',
                'qr_url'         => 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' . urlencode($response_data['verification_url'] ?? ''),
                'nota'           => 'Timbrado exitoso con Facturapi.',
            ]);
        } else {
            // Error devuelto por Facturapi (ej. CP no coincide con RFC)
            $mensaje_error = $response_data['message'] ?? 'Error desconocido al timbrar';
            // Bug previo: logueaba "$result", variable que no existe en este
            // archivo -- un fallo de timbrado no dejaba ningún rastro útil.
            log_api("ERROR Facturapi: http={$http_code} body=" . $res['body']);
            respond(['success' => false, 'error' => $mensaje_error]);
        }
