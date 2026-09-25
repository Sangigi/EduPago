<?php
        requerir_rol($usuario_actual['rol'] ?? '', ['superadmin'], 'Solo el super admin puede editar referidos.');
        $idRef = intval($input['id'] ?? 0);
        if (!$idRef) respond(['success' => false, 'error' => 'id requerido']);
        $estados_validos_ref = ['prospecto', 'demo_agendada', 'implementacion', 'activo'];
        $sets = []; $vals = [];
        // EL PORCENTAJE YA NO SE PISA (24-sep-2026).
        //
        // Antes esto hacía `SET comision_pct = ?` a secas. Como
        // distribuidor_comisiones.php calculaba los 12 meses de historia con
        // el porcentaje ACTUAL, cambiarlo aquí reescribía todo el pasado: un
        // mes que valió 25 pesos al 5% pasaba a mostrar 15 al bajarlo a 3%,
        // aunque ya se hubiera pagado.
        //
        // Ahora se registra una VIGENCIA con fecha de inicio. Los meses ya
        // cerrados conservan su porcentaje congelado en comision_devengos y no
        // se mueven. Ver lib/helpers_comisiones.php.
        $vigenciaResultado = null;
        if (array_key_exists('comision_pct', $input)) {
            $pctRef = floatval($input['comision_pct']);
            if ($pctRef < 0 || $pctRef > 100) respond(['success' => false, 'error' => 'La comisión debe estar entre 0 y 100']);

            // Por omisión el cambio entra el día 1 del mes que viene. Es lo
            // normal en la práctica y evita partir el mes en dos tramos; quien
            // de verdad necesite otra fecha la manda explícita.
            $vigDesde = trim($input['comision_vigente_desde'] ?? '');
            if ($vigDesde === '') $vigDesde = date('Y-m-01', strtotime('first day of next month'));

            $vigenciaResultado = comision_registrar_vigencia(
                $pdo, $idRef, $pctRef, $vigDesde,
                intval($usuario_actual['user_id'] ?? 0) ?: null,
                'edicion_superadmin'
            );
            if (!$vigenciaResultado['ok']) {
                respond(['success' => false, 'error' => $vigenciaResultado['error']]);
            }
            // comision_pct NO se agrega a $sets: comision_registrar_vigencia()
            // ya actualizó esa columna cacheada si la vigencia rige hoy.
        }
        if (array_key_exists('estado', $input)) {
            if (!in_array($input['estado'], $estados_validos_ref, true)) respond(['success' => false, 'error' => 'Estado inválido']);
            $sets[] = 'estado = ?'; $vals[] = $input['estado'];
        }
        if (array_key_exists('escuela_id', $input)) {
            $escIdRef = intval($input['escuela_id'] ?? 0) ?: null;
            $sets[] = 'escuela_id = ?'; $vals[] = $escIdRef;
        // CUARTO camino de alta (25-sep-2026): asignarle colegio a un prospecto.
        //
        // No crea la fila de distribuidor_referidos, pero sí es el momento en
        // que ese referido EMPIEZA A DEVENGAR — comision_calcular_periodo()
        // filtra por `escuela_id IS NOT NULL`. Si no tiene vigencia, devenga
        // $0 en silencio, igual que los otros tres caminos.
        //
        // Se siembra DESPUÉS del UPDATE, más abajo, cuando escuela_id ya está
        // escrito: comision_sembrar_vigencia_inicial() lo copia de la fila.
        $sembrarPorEscuela = $escIdRef !== null;
        }
        if (array_key_exists('num_alumnos', $input)) {
            $sets[] = 'num_alumnos = ?'; $vals[] = intval($input['num_alumnos'] ?? 0) ?: null;
        }
        if (array_key_exists('notas', $input)) {
            $sets[] = 'notas = ?'; $vals[] = trim($input['notas'] ?? '') ?: null;
        }
        // Ahora un cambio de SOLO el porcentaje deja $sets vacío, porque la
        // vigencia ya se registró por su cuenta. Eso no es "sin campos".
        if (empty($sets) && !$vigenciaResultado) {
            respond(['success' => false, 'error' => 'Sin campos a actualizar']);
        }
        if (!empty($sets)) {
            $vals[] = $idRef;
            $pdo->prepare("UPDATE distribuidor_referidos SET " . implode(', ', $sets) . " WHERE id = ?")->execute($vals);
        }
        // Siembra de la vigencia si este UPDATE acaba de darle colegio a un
        // prospecto. Es idempotente: si ya tenía vigencia, no hace nada.
        if (!empty($sembrarPorEscuela)) {
            comision_sembrar_vigencia_inicial($pdo, $idRef, intval($usuario_actual['user_id'] ?? 0) ?: null);
        }

        // El log decía solo "Referido #N actualizado": ni el valor viejo ni el
        // nuevo. Para una comisión, que es dinero, eso no sirve de nada el día
        // que alguien pregunte con qué porcentaje se le pagó un mes.
        $detalleLog = "Referido #$idRef actualizado";
        if ($vigenciaResultado) {
            $detalleLog .= sprintf(
                ' · comisión %.2f -> %.2f vigente desde %s',
                $vigenciaResultado['anterior'], floatval($input['comision_pct']), $vigDesde
            );
        }
        registrar_log($pdo, $usuario_actual, 'referido_editado', $detalleLog);
        $stmt2Ref = $pdo->prepare(
            "SELECT r.*, u.nombre AS distribuidor_nombre, e.nombre AS escuela_nombre
             FROM distribuidor_referidos r
             LEFT JOIN usuarios u ON u.id = r.distribuidor_id
             LEFT JOIN escuelas e ON e.id = r.escuela_id
             WHERE r.id = ?"
        );
        $stmt2Ref->execute([$idRef]);
        $refActualizado = $stmt2Ref->fetch();
        if ($refActualizado) {
            $refActualizado['id'] = intval($refActualizado['id']);
            $refActualizado['distribuidor_id'] = intval($refActualizado['distribuidor_id']);
            $refActualizado['escuela_id'] = $refActualizado['escuela_id'] ? intval($refActualizado['escuela_id']) : null;
            $refActualizado['comision_pct'] = floatval($refActualizado['comision_pct']);
        }
        respond(['success' => true, 'referido' => $refActualizado]);
