<?php
        requerir_rol($usuario_actual['rol'] ?? '', ['superadmin'], 'Solo el super admin puede ver esto.');
        $stmtRef = $pdo->prepare(
            "SELECT r.id, r.distribuidor_id, r.escuela_id, r.nombre_colegio, r.num_alumnos, r.estado,
                    r.comision_pct, r.fecha_alta, r.notas,
                    u.nombre AS distribuidor_nombre, u.email AS distribuidor_email,
                    e.nombre AS escuela_nombre
             FROM distribuidor_referidos r
             LEFT JOIN usuarios u ON u.id = r.distribuidor_id
             LEFT JOIN escuelas e ON e.id = r.escuela_id
             ORDER BY r.fecha_alta DESC, r.id DESC"
        );
        $stmtRef->execute();
        $referidosTodos = array_map(function($r) {
            return [
                'id'                 => intval($r['id']),
                'distribuidor_id'    => intval($r['distribuidor_id']),
                'distribuidor_nombre'=> $r['distribuidor_nombre'],
                'distribuidor_email' => $r['distribuidor_email'],
                'escuela_id'         => $r['escuela_id'] ? intval($r['escuela_id']) : null,
                'escuela_nombre'     => $r['escuela_nombre'],
                'nombre_colegio'     => $r['nombre_colegio'],
                'num_alumnos'        => $r['num_alumnos'] !== null ? intval($r['num_alumnos']) : null,
                'estado'             => $r['estado'],
                'comision_pct'       => floatval($r['comision_pct']),
                'fecha_alta'         => $r['fecha_alta'],
                'notas'              => $r['notas'],
            ];
        }, $stmtRef->fetchAll());
        respond(['success' => true, 'referidos' => $referidosTodos]);
