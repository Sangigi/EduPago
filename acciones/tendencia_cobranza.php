<?php
        // Serie de cobranza por día para la gráfica "Tendencia de cobranza" del
        // Dashboard, con rango de fechas elegido por el usuario (antes eran
        // siempre los últimos 30 días calculados en el navegador a partir de
        // `data.cobros`, que solo trae 90 días — un rango de "1 año" o incluso
        // "6 meses" se habría visto vacío más allá de esos 90 días). Se agrega
        // con SUM/GROUP BY en el servidor: funciona igual de rápido para 7
        // días que para 1 año, sin mandar cada cobro individual al navegador.
        $escuela_id_tc = intval($input['escuela_id'] ?? $_GET['escuela_id'] ?? 0);
        if (!$escuela_id_tc) respond(['success' => false, 'error' => 'escuela_id requerido']);
        requerir_escuela_propia($usuario_actual['rol'], $escuela_id_tc, $usuario_actual, 'No tienes permiso para ver la cobranza de esa escuela.');

        $desde_tc = trim($input['desde'] ?? $_GET['desde'] ?? '');
        $hasta_tc = trim($input['hasta'] ?? $_GET['hasta'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $desde_tc) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $hasta_tc)) {
            respond(['success' => false, 'error' => 'desde/hasta requeridos en formato YYYY-MM-DD']);
        }
        if (strtotime($hasta_tc) < strtotime($desde_tc)) {
            respond(['success' => false, 'error' => 'El rango de fechas es inválido']);
        }
        // Tope defensivo: evita que una petición manipulada pida un rango de
        // décadas y fuerce un GROUP BY gigante. 400 días cubre el preset más
        // largo del filtro (1 año) con margen.
        if ((strtotime($hasta_tc) - strtotime($desde_tc)) / 86400 > 400) {
            respond(['success' => false, 'error' => 'El rango máximo permitido es de 400 días']);
        }

        $where_tc = 'escuela_id = ? AND estado = ? AND fecha BETWEEN ? AND ?';
        $params_tc = [$escuela_id_tc, 'pagado', $desde_tc, $hasta_tc];
        // Método opcional — para que la "Tendencia del periodo" de Cobros.js
        // pueda respetar el mismo filtro de método que ya tiene la vista.
        $metodo_tc = trim($input['metodo'] ?? $_GET['metodo'] ?? '');
        $metodos_validos_tc = ['Efectivo', 'EfectivoRef', 'TC', 'SPEI', 'CoDi', 'Cheque', 'Pendiente'];
        if ($metodo_tc !== '' && in_array($metodo_tc, $metodos_validos_tc, true)) {
            $where_tc .= ' AND metodo = ?';
            $params_tc[] = $metodo_tc;
        }
        // Misma restricción que listar_cobros/cargar_datos: una familia solo ve
        // la tendencia de SUS PROPIOS hijos, no la de toda la escuela.
        if (($usuario_actual['rol'] ?? '') === 'familia') {
            $where_tc .= ' AND cliente_id IN (SELECT id FROM clientes WHERE familia_id = ?)';
            $params_tc[] = $usuario_actual['familia_id'] ?? -1;
        }
        $stmt = $pdo->prepare(
            "SELECT fecha, SUM(total) AS total FROM cobros
             WHERE $where_tc
             GROUP BY fecha ORDER BY fecha"
        );
        $stmt->execute($params_tc);
        $porDia = [];
        foreach ($stmt->fetchAll() as $row) {
            $porDia[$row['fecha']] = floatval($row['total']);
        }
        respond(['success' => true, 'desde' => $desde_tc, 'hasta' => $hasta_tc, 'por_dia' => $porDia]);
