<?php
        // [F1] Se conserva por compatibilidad (ClienteController.toggleActivo,
        // views/Familias.js), pero ya NO escribe `activo` a mano: pasa por
        // alumno_cambiar_estatus() (lib/helpers_alumnos.php), así que:
        //   · activar   -> estatus 'activo', validando el límite de alumnos del
        //                  plan (antes reactivar no validaba nada y servía para
        //                  pasarse del plan);
        //   · desactivar -> 'baja_temporal' con motivo 'Baja rápida', y queda en
        //                  la bitácora del alumno.
        // Para elegir motivo, fecha, adeudos o CLABE se usa alumno_cambiar_estatus
        // (modal "Cambiar estatus" de Alumnos).
        $rolToggleCli = $usuario_actual['rol'] ?? '';
        requerir_rol($rolToggleCli, ['superadmin', 'admin', 'control_escolar'], 'El cajero no puede activar/desactivar alumnos.');
        $id = intval($input['id'] ?? 0);
        if (!$id) respond(['success' => false, 'error' => 'id requerido']);
        // [F1] 'activar' debe venir EXPLÍCITO. Antes `$input['activar'] ? 1 : 0`
        // daba de baja al alumno si el campo faltaba (o venía mal escrito).
        if (!array_key_exists('activar', $input) || $input['activar'] === null || $input['activar'] === '') {
            respond(['success' => false, 'error' => "Falta indicar 'activar' (true para reactivar, false para dar de baja)."]);
        }
        $activar = filter_var($input['activar'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($activar === null) {
            respond(['success' => false, 'error' => "El valor de 'activar' no es válido (usa true o false)."]);
        }
        // Pertenencia: la escuela sale de la fila, nunca del input. Antes solo se
        // revisaba para 'admin'; ahora también para 'control_escolar'.
        $chkEscToggle = $pdo->prepare("SELECT escuela_id, activo FROM clientes WHERE id = ?");
        $chkEscToggle->execute([$id]);
        $objetivoToggle = $chkEscToggle->fetch();
        if (!$objetivoToggle) {
            http_response_code(404);
            respond(['success' => false, 'error' => 'No encontramos a ese alumno.']);
        }
        requerir_escuela_propia($rolToggleCli, $objetivoToggle['escuela_id'], $usuario_actual, 'No tienes permiso sobre este alumno.');
        requerir_seccion_habilitada($pdo, $rolToggleCli, $objetivoToggle['escuela_id'], ['alumnos', 'familias']);

        // Idempotente como antes: pedir "dar de baja" a quien ya está inactivo (en
        // cualquier tipo de baja) o "activar" a quien ya está activo no es error
        // ni genera movimiento; solo devuelve la fila como está.
        if ((bool) $objetivoToggle['activo'] === $activar) {
            respond(['success' => true, 'cliente' => alumno_fila_para_respuesta($pdo, $id), 'sin_cambios' => true]);
        }

        $resToggle = alumno_cambiar_estatus(
            $pdo,
            $id,
            $activar ? 'activo' : 'baja_temporal',
            $activar ? null : 'Baja rápida',
            $usuario_actual,
            // Mismo comportamiento que la baja de siempre en lo que toca a dinero:
            // no cancela adeudos y conserva la CLABE.
            []
        );
        if (empty($resToggle['success'])) {
            log_api("toggle_cliente_activo RECHAZADO cliente #{$id} activar=" . ($activar ? '1' : '0') . ': ' . ($resToggle['error'] ?? ''));
        }
        respond($resToggle);
