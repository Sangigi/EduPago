<?php
        // [F5] Vista previa del alcance de un concepto recurrente: "¿a cuántos
        // alumnos se les generaría hoy este cobro?". Solo lectura.
        //
        // Existe porque el error caro de cobrar por grado es silencioso: un
        // alumno activo SIN grado asignado (clientes.grado_id NULL) no entra en
        // ningún concepto por grado, así que el cron simplemente no le genera
        // colegiatura y nadie se entera hasta que falta el dinero. Con esto el
        // admin lo ve ANTES de guardar.
        //
        // Usa EXACTAMENTE el mismo filtro que el cron (producto_alcance_filtro_sql)
        // para que el número que ve el colegio sea el que de verdad se cobra.
        require_once __DIR__ . '/../lib/helpers_alcance_producto.php';
        $rol_actual = $usuario_actual['rol'] ?? '';
        requerir_rol($rol_actual, ['superadmin', 'admin'], 'No tienes permiso para consultar conceptos de pago.');
        // La escuela sale del usuario; solo el superadmin la elige (y para él
        // el input es la única fuente, porque no pertenece a ningún colegio).
        $escuela_id = $rol_actual === 'superadmin'
            ? intval($input['escuela_id'] ?? 0)
            : intval($usuario_actual['escuela_id'] ?? 0);
        if (!$escuela_id) respond(['success' => false, 'error' => 'Selecciona un colegio primero.']);
        requerir_seccion_habilitada($pdo, $rol_actual, $escuela_id, ['productos']);

        $alcance = $input['alcance'] ?? 'todos';
        $ids = $input['alcance_ids'] ?? [];
        if (!is_string($alcance)) respond(['success' => false, 'error' => 'Alcance inválido.']);

        // Total de alumnos activos del colegio (la misma base que usa el cron).
        $stTotal = $pdo->prepare("SELECT COUNT(*) FROM clientes WHERE escuela_id = ? AND tipo = 'alumno' AND activo = 1");
        $stTotal->execute([$escuela_id]);
        $total = intval($stTotal->fetchColumn());

        // Sin selección todavía: no es un error, solo "a nadie por ahora".
        if ($alcance !== 'todos' && !producto_alcance_ids($ids)) {
            respond(['success' => true, 'alcance' => $alcance, 'alumnos_activos' => $total, 'alumnos_alcanzados' => 0, 'activos_sin_grado' => null]);
        }

        $alc = producto_alcance_normalizar($pdo, $escuela_id, $alcance, $ids);
        if (!$alc['ok']) respond(['success' => false, 'error' => $alc['error']]);

        $filtro = producto_alcance_filtro_sql(['alcance' => $alc['alcance'], 'alcance_ids' => $alc['alcance_ids']], 'clientes');
        try {
            $st = $pdo->prepare("SELECT COUNT(*) FROM clientes WHERE escuela_id = ? AND tipo = 'alumno' AND activo = 1" . $filtro['sql']);
            $st->execute(array_merge([$escuela_id], $filtro['params']));
            $alcanzados = intval($st->fetchColumn());
        } catch (\PDOException $e) {
            log_api("producto_alcance_vista_previa: no se pudo contar (escuela_id={$escuela_id}, alcance={$alc['alcance']}) -> " . $e->getMessage());
            respond(['success' => false, 'error' => 'No se pudo calcular a cuántos alumnos aplica. Revisa que el catálogo de grados de Control escolar esté instalado.']);
        }

        // Para 'grados': cuántos activos no tienen grado y por lo tanto NO
        // entran en ningún concepto por grado. null si no aplica o si la
        // columna aún no existe.
        $sinGrado = null;
        if ($alc['alcance'] === 'grados') {
            try {
                $st = $pdo->prepare("SELECT COUNT(*) FROM clientes WHERE escuela_id = ? AND tipo = 'alumno' AND activo = 1 AND grado_id IS NULL");
                $st->execute([$escuela_id]);
                $sinGrado = intval($st->fetchColumn());
            } catch (\PDOException $e) {
                $sinGrado = null;
            }
        }

        respond([
            'success'            => true,
            'alcance'            => $alc['alcance'],
            'alumnos_activos'    => $total,
            'alumnos_alcanzados' => $alcanzados,
            'activos_sin_grado'  => $sinGrado,
        ]);
