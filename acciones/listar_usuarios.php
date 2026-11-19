<?php
        $rol_actual = $usuario_actual['rol']       ?? '';
        $esc_actual = $usuario_actual['escuela_id'] ?? null;
        // [OF-4] Antes la rama final le entregaba el equipo del colegio
        // (nombres, correos y roles) a CUALQUIER rol con escuela: un cajero, o
        // una familia mientras su allowlist siga en modo registro. Solo lo usan
        // "Mi equipo" (admin), las cuentas de alumno (admin y control escolar)
        // y soporte; getUsuarios() en AuthController ya trata el error como [].
        requerir_rol($rol_actual, ['superadmin', 'admin', 'control_escolar', 'soporte'], 'No tienes permiso para ver el equipo del colegio.');
        requerir_seccion_habilitada($pdo, $rol_actual, $esc_actual, ['miequipo']);
        // [F4] Las cuentas de alumno pueden ser cientos: "Mi equipo" no las
        // lista salvo que se pidan (solo_alumnos = true, lo usa la vista de
        // Alumnos para saber quién ya tiene acceso). Así el listado del equipo
        // sigue siendo del PERSONAL del colegio, como hasta hoy.
        $solo_alumnos = !empty($input['solo_alumnos']);
        // [F4] control_escolar ve únicamente docentes y cuentas de alumno de su
        // escuela (lo que puede administrar); nada de admin/cajero/dirección.
        if ($rol_actual === 'control_escolar' && !$esc_actual) {
            http_response_code(403);
            respond(['success' => false, 'error' => 'Tu cuenta no está ligada a ningún colegio.']);
        }
        // zona_id es columna nueva (migracion_zonas.sql) y cliente_id también
        // (migracion_2026_11_18_f4_roles.sql); si aún no corren en esta base, se
        // reintenta con menos columnas en vez de romper el listado.
        $variantes_columnas = [
            'u.zona, u.zona_id, u.cliente_id',
            'u.zona, u.zona_id',
            'u.zona',
        ];
        $stmt = null;
        foreach ($variantes_columnas as $i => $cols) {
            try {
                $select = "SELECT u.id, u.nombre, u.email, u.rol, u.activo, u.escuela_id, u.fecha_alta,
                                  u.familia_id, u.creado_por, $cols,
                                  e.nombre AS escuela_nombre
                           FROM usuarios u LEFT JOIN escuelas e ON e.id = u.escuela_id";
                $params = [];
                if ($rol_actual === 'superadmin') {
                    $where = $solo_alumnos ? " WHERE u.rol = 'alumno'" : " WHERE u.rol != 'alumno'";
                } elseif ($rol_actual === 'control_escolar') {
                    $where = " WHERE u.escuela_id = ? AND u.rol = ?";
                    $params = [$esc_actual, $solo_alumnos ? 'alumno' : 'docente'];
                } else {
                    $where = " WHERE u.escuela_id = ? AND u.rol != 'superadmin' AND u.rol " . ($solo_alumnos ? "= 'alumno'" : "!= 'alumno'");
                    $params = [$esc_actual];
                }
                $stmt = $pdo->prepare($select . $where . " ORDER BY u.rol, u.nombre");
                $stmt->execute($params);
                break;
            } catch (\PDOException $e) {
                // Última variante sin columnas nuevas: si aun así falla, no es la migración.
                if ($i === count($variantes_columnas) - 1) throw $e;
            }
        }
        $usuarios = $stmt->fetchAll();
        respond(['success' => true, 'usuarios' => $usuarios]);
