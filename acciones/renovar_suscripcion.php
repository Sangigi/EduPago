<?php
        // El superadmin marca la suscripción de un colegio como pagada/renovada.
        // No hay cobro automático de la mensualidad SaaS en este sistema (se
        // factura/cobra aparte); esto solo mueve la fecha de vencimiento un mes
        // calendario hacia adelante y reactiva los recordatorios para el próximo ciclo.
        requerir_rol($usuario_actual['rol'] ?? '', ['superadmin'], 'Solo el super admin puede renovar una suscripción.');
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        $chk = $pdo->prepare("SELECT nombre, fecha_vencimiento_plan FROM escuelas WHERE id = ? AND es_plantel = 0");
        $chk->execute([$id]);
        $esc = $chk->fetch();
        if (!$esc) respond(['success' => false, 'error' => 'Colegio no encontrado']);
        // Si ya vencía desde hace tiempo, no se acumulan meses atrasados: se
        // renueva un mes completo a partir de hoy, no desde la fecha vieja.
        $base = $esc['fecha_vencimiento_plan'];
        if (!$base || strtotime($base) < strtotime(date('Y-m-d'))) $base = date('Y-m-d');
        $nuevo_vencimiento = siguiente_vencimiento_mensual($base);
        $pdo->prepare("UPDATE escuelas SET fecha_vencimiento_plan = ?, ultimo_recordatorio_plan = NULL WHERE id = ?")
            ->execute([$nuevo_vencimiento, $id]);
        // Queda en el historial aunque NO haya habido cobro (25-sep-2026).
        //
        // Este camino solo mueve la fecha de vencimiento a mano. Si no se
        // registrara, el colegio vería un salto inexplicable: su suscripción
        // se extendió un mes y no hay nada que lo explique. Con monto NULL
        // —no 0, que se leería como "pagó cero"— la fila dice exactamente lo
        // que pasó: se renovó sin cobro de por medio, y quién lo hizo.
        registrar_pago_suscripcion($pdo, [
            'escuela_id'     => $id,
            'origen'         => 'manual',
            'monto'          => null,
            'cubre_desde'    => $base,
            'cubre_hasta'    => $nuevo_vencimiento,
            'registrado_por' => $usuario_actual['user_id'] ?? null,
        ]);
        registrar_log($pdo, $usuario_actual, 'suscripcion_renovada', "Colegio '{$esc['nombre']}' #$id: vencimiento → $nuevo_vencimiento", $id);
        respond(['success' => true, 'id' => $id, 'fecha_vencimiento_plan' => $nuevo_vencimiento]);
