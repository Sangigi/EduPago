<?php
        // Búsqueda cruzando TODAS las escuelas — solo superadmin. Sirve para
        // soporte: "no encuentro a mi hijo/mi cuenta" sin adivinar en qué
        // colegio está.
        requerir_rol($usuario_actual['rol'] ?? '', ['superadmin'], 'Solo el super admin puede usar la búsqueda global.');
        $q = trim($input['q'] ?? $_GET['q'] ?? '');
        if (mb_strlen($q) < 3) {
            respond(['success' => false, 'error' => 'Escribe al menos 3 caracteres para buscar.']);
        }
        $like = "%$q%";
        $stmtCli = $pdo->prepare(
            "SELECT cl.id, cl.nombre, cl.matricula, cl.email, cl.escuela_id, es.nombre AS escuela_nombre
             FROM clientes cl JOIN escuelas es ON es.id = cl.escuela_id
             WHERE cl.nombre LIKE ? OR cl.matricula LIKE ? OR cl.email LIKE ? OR cl.curp LIKE ?
             LIMIT 20"
        );
        $stmtCli->execute([$like, $like, $like, $like]);
        $alumnos = $stmtCli->fetchAll();
        $stmtUsu = $pdo->prepare(
            "SELECT u.id, u.nombre, u.email, u.rol, u.escuela_id, u.activo, es.nombre AS escuela_nombre
             FROM usuarios u LEFT JOIN escuelas es ON es.id = u.escuela_id
             WHERE u.nombre LIKE ? OR u.email LIKE ?
             LIMIT 20"
        );
        $stmtUsu->execute([$like, $like]);
        $usuarios = $stmtUsu->fetchAll();
        respond(['success' => true, 'alumnos' => $alumnos, 'usuarios' => $usuarios]);
