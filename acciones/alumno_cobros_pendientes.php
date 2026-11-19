<?php
        // [F1] Cobros PENDIENTES de un alumno (con lo ya abonado y sus
        // conceptos), para que el modal "Cambiar estatus" de views/Alumnos.js
        // muestre TODOS los adeudos, no solo los de los últimos 90 días que
        // trae cargar_datos. Solo lectura.
        //
        // Body/GET: { cliente_id }
        $rol_cp = $usuario_actual['rol'] ?? '';
        // [F4] Solo administración: 'control_escolar' no ve cobranza (el modal
        // de Cambiar estatus ya solo le muestra adeudos a admin/superadmin, y el
        // comodín 'alumno_*' de su allowlist no debe abrirle este dato).
        requerir_rol($rol_cp, ['superadmin', 'admin'], 'No tienes permiso para ver los adeudos de este alumno.');
        $cliente_id_cp = intval($input['cliente_id'] ?? $_GET['cliente_id'] ?? 0);
        if (!$cliente_id_cp) respond(['success' => false, 'error' => 'cliente_id requerido']);

        $chk_cp = $pdo->prepare("SELECT escuela_id FROM clientes WHERE id = ?");
        $chk_cp->execute([$cliente_id_cp]);
        $fila_cp = $chk_cp->fetch();
        if (!$fila_cp) {
            http_response_code(404);
            respond(['success' => false, 'error' => 'No encontramos a ese alumno.']);
        }
        requerir_escuela_propia($rol_cp, $fila_cp['escuela_id'], $usuario_actual, 'No tienes permiso sobre este alumno.');
        requerir_seccion_habilitada($pdo, $rol_cp, $fila_cp['escuela_id'], ['alumnos', 'familias']);

        respond([
            'success'           => true,
            'cobros_pendientes' => alumno_cobros_pendientes($pdo, $cliente_id_cp),
        ]);
