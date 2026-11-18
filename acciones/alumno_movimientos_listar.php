<?php
        // [F1] Historial (bitácora) de un alumno: alta, ediciones, bajas, egreso,
        // traslado, reactivaciones y lo que registren otras fases (cambio de
        // grado, reinscripción, cambio de grupo). Solo lectura.
        //
        // Body/GET: { cliente_id, limite? (default 100, máx. 500) }
        //
        // Roles de lectura académica. El cajero no: su trabajo es la caja.
        $rol_ml = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_ml, ['superadmin', 'admin', 'control_escolar', 'direccion'], 'No tienes permiso para ver el historial de alumnos.');
        $cliente_id_ml = intval($input['cliente_id'] ?? $_GET['cliente_id'] ?? 0);
        if (!$cliente_id_ml) respond(['success' => false, 'error' => 'cliente_id requerido']);

        $chk_ml = $pdo->prepare("SELECT * FROM clientes WHERE id = ?");
        $chk_ml->execute([$cliente_id_ml]);
        $fila_ml = $chk_ml->fetch();
        if (!$fila_ml) {
            http_response_code(404);
            respond(['success' => false, 'error' => 'No encontramos a ese alumno.']);
        }
        requerir_escuela_propia($rol_ml, $fila_ml['escuela_id'], $usuario_actual, 'No tienes permiso sobre este alumno.');
        requerir_seccion_habilitada($pdo, $rol_ml, $fila_ml['escuela_id'], ['alumnos', 'familias']);

        $limite_ml = intval($input['limite'] ?? $_GET['limite'] ?? 100);
        $limite_ml = max(1, min($limite_ml, 500));

        // Resumen del estatus actual (para el encabezado del historial).
        $estatus_ml = [
            'activo'         => (bool) $fila_ml['activo'],
            'estatus'        => alumno_estatus_de_fila($fila_ml),
            'estatus_fecha'  => $fila_ml['estatus_fecha'] ?? null,
            'estatus_motivo' => $fila_ml['estatus_motivo'] ?? null,
        ];

        try {
            // LIMIT interpolado como entero: con ATTR_EMULATE_PREPARES = false
            // (lib/db.php) MySQL no acepta un placeholder de texto en LIMIT.
            $st_ml = $pdo->prepare(
                "SELECT m.id, m.tipo, m.estatus_anterior, m.estatus_nuevo, m.motivo, m.detalle,
                        m.usuario_id, m.creado_en, u.nombre AS usuario_nombre
                   FROM alumno_movimientos m
                   LEFT JOIN usuarios u ON u.id = m.usuario_id
                  WHERE m.cliente_id = ? AND m.escuela_id = ?
                  ORDER BY m.creado_en DESC, m.id DESC
                  LIMIT $limite_ml"
            );
            $st_ml->execute([$cliente_id_ml, intval($fila_ml['escuela_id'])]);
            $movimientos_ml = array_map(function ($m) {
                $det = null;
                if ($m['detalle'] !== null && $m['detalle'] !== '') {
                    $dec = json_decode($m['detalle'], true);
                    $det = is_array($dec) ? $dec : $m['detalle'];
                }
                return [
                    'id'               => intval($m['id']),
                    'tipo'             => $m['tipo'],
                    'estatus_anterior' => $m['estatus_anterior'],
                    'estatus_nuevo'    => $m['estatus_nuevo'],
                    'motivo'           => $m['motivo'],
                    'detalle'          => $det,
                    'usuario_id'       => $m['usuario_id'] !== null ? intval($m['usuario_id']) : null,
                    'usuario_nombre'   => $m['usuario_nombre'],
                    'creado_en'        => $m['creado_en'],
                ];
            }, $st_ml->fetchAll());
        } catch (\PDOException $e) {
            // Falta la migración: el historial se muestra vacío con un aviso, en
            // vez de romper la ficha del alumno.
            log_api("alumno_movimientos_listar: tabla no disponible (¿falta migracion_2026_11_18_f1_ciclo_vida.sql?) -> " . $e->getMessage());
            respond([
                'success'     => true,
                'movimientos' => [],
                'estatus'     => $estatus_ml,
                'aviso'       => 'El historial de alumnos aún no está instalado en la base de datos.',
            ]);
        }

        respond([
            'success'     => true,
            'movimientos' => $movimientos_ml,
            'estatus'     => $estatus_ml,
        ]);
