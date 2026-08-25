<?php
        $rol_actual = $usuario_actual['rol']       ?? '';
        $esc_actual = $usuario_actual['escuela_id'] ?? null;
        // zona_id es columna nueva (migracion_zonas.sql); si aún no corrió en
        // esta base, se reintenta sin ella en vez de romper el listado.
        try {
            if ($rol_actual === 'superadmin') {
                $stmt = $pdo->query(
                    "SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.escuela_id, u.fecha_alta,
                            u.familia_id, u.creado_por, u.zona, u.zona_id,
                            e.nombre AS escuela_nombre
                     FROM usuarios u LEFT JOIN escuelas e ON e.id = u.escuela_id
                     ORDER BY u.rol, u.nombre"
                );
            } else {
                $stmt = $pdo->prepare(
                    "SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.escuela_id, u.fecha_alta,
                            u.familia_id, u.creado_por, u.zona, u.zona_id,
                            e.nombre AS escuela_nombre
                     FROM usuarios u LEFT JOIN escuelas e ON e.id = u.escuela_id
                     WHERE u.escuela_id = ? AND u.rol != 'superadmin'
                     ORDER BY u.rol, u.nombre"
                );
                $stmt->execute([$esc_actual]);
            }
        } catch (\PDOException $e) {
            if ($rol_actual === 'superadmin') {
                $stmt = $pdo->query(
                    "SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.escuela_id, u.fecha_alta,
                            u.familia_id, u.creado_por, u.zona,
                            e.nombre AS escuela_nombre
                     FROM usuarios u LEFT JOIN escuelas e ON e.id = u.escuela_id
                     ORDER BY u.rol, u.nombre"
                );
            } else {
                $stmt = $pdo->prepare(
                    "SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.escuela_id, u.fecha_alta,
                            u.familia_id, u.creado_por, u.zona,
                            e.nombre AS escuela_nombre
                     FROM usuarios u LEFT JOIN escuelas e ON e.id = u.escuela_id
                     WHERE u.escuela_id = ? AND u.rol != 'superadmin'
                     ORDER BY u.rol, u.nombre"
                );
                $stmt->execute([$esc_actual]);
            }
        }
        $usuarios = $stmt->fetchAll();
        respond(['success' => true, 'usuarios' => $usuarios]);
