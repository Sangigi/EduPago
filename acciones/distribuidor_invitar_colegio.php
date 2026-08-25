<?php
        requerir_rol($usuario_actual['rol'] ?? '', ['distribuidor'], 'Solo distribuidores pueden invitar colegios.');
        $dist_id = intval($usuario_actual['user_id'] ?? 0);
        $nombre_colegio = trim($input['nombre_colegio'] ?? '');
        $num_alumnos = intval($input['num_alumnos'] ?? 0) ?: null;
        $notas = trim($input['notas'] ?? '') ?: null;
        if (!$nombre_colegio) {
            respond(['success' => false, 'error' => 'El nombre del colegio es obligatorio']);
        }
        $stmt = $pdo->prepare(
            "INSERT INTO distribuidor_referidos (distribuidor_id, nombre_colegio, num_alumnos, estado, comision_pct, fecha_alta, notas)
             VALUES (?, ?, ?, 'prospecto', 5.00, CURDATE(), ?)"
        );
        $stmt->execute([$dist_id, $nombre_colegio, $num_alumnos, $notas]);
        $nuevo_id = intval($pdo->lastInsertId());
        registrar_log($pdo, $usuario_actual, 'colegio_referido', "Distribuidor invitó a '$nombre_colegio'", null);
        respond(['success' => true, 'referido' => [
            'id' => $nuevo_id, 'escuela_id' => null, 'nombre' => $nombre_colegio,
            'num_alumnos' => $num_alumnos, 'estado' => 'prospecto', 'comision_pct' => 5.00,
            'fecha_alta' => date('Y-m-d'), 'notas' => $notas,
        ]]);
