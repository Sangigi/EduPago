<?php
// acciones/listar_pagos_no_aplicados.php
//
// Lista los depósitos que llegaron a los webhooks pero NO se pudieron aplicar
// a ningún cobro (monto distinto, referencia desconocida, CLABE reciclada,
// cargo de tarjeta huérfano). Ver por qué existe esta tabla y el caso real
// que la originó en migracion_2026_09_21_pagos_no_aplicados.sql.
//
// Sin esta pantalla, los registros que ahora sí guardan los webhooks serían
// invisibles para el colegio — que es justo el problema que se está
// corrigiendo.

$rol = $usuario_actual['rol'] ?? '';
requerir_rol($rol, ['admin', 'superadmin', 'contador'], 'No tienes permiso para ver los pagos sin aplicar.');

$estado = strtolower(trim($input['estado'] ?? 'pendiente'));
if (!in_array($estado, ['pendiente', 'resuelto', 'descartado', 'todos'], true)) {
    $estado = 'pendiente';
}

$where  = [];
$params = [];

if ($estado !== 'todos') {
    $where[]  = 'p.estado = ?';
    $params[] = $estado;
}

// Alcance por rol. Un admin solo ve lo de SU escuela; los depósitos que no se
// pudieron atribuir a ninguna (escuela_id NULL: referencia o CLABE que no
// reconocimos) quedan fuera de su vista a propósito — nadie puede reclamarlos
// como propios sin revisarlos primero desde superadmin/contador.
if ($rol === 'admin') {
    $escuela_id = intval($usuario_actual['escuela_id'] ?? 0);
    if (!$escuela_id) respond(['success' => true, 'pagos' => [], 'conteos' => []]);
    $where[]  = 'p.escuela_id = ?';
    $params[] = $escuela_id;
}

$sqlWhere = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

try {
    $sql = "SELECT p.id, p.canal, p.motivo, p.referencia, p.clabe, p.transaccion_proveedor,
                   p.auth_code, p.monto_recibido, p.monto_esperado, p.cliente_id, p.cobro_id,
                   p.escuela_id, p.intentos, p.estado, p.notas, p.resuelto_en, p.creado_en,
                   c.nombre AS cliente_nombre, c.matricula AS cliente_matricula,
                   e.nombre AS escuela_nombre,
                   cb.folio AS cobro_folio
              FROM pagos_no_aplicados p
              LEFT JOIN clientes c ON c.id = p.cliente_id
              LEFT JOIN escuelas e ON e.id = p.escuela_id
              LEFT JOIN cobros  cb ON cb.id = p.cobro_id
              {$sqlWhere}
             ORDER BY p.creado_en DESC
             LIMIT 300";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $pagos = $stmt->fetchAll();

    // Conteo por estado para los filtros de la UI (respetando el alcance).
    $whereConteo  = [];
    $paramsConteo = [];
    if ($rol === 'admin') {
        $whereConteo[]  = 'escuela_id = ?';
        $paramsConteo[] = intval($usuario_actual['escuela_id'] ?? 0);
    }
    $sqlWhereConteo = $whereConteo ? ('WHERE ' . implode(' AND ', $whereConteo)) : '';
    $stmtC = $pdo->prepare("SELECT estado, COUNT(*) AS n, COALESCE(SUM(monto_recibido),0) AS monto
                              FROM pagos_no_aplicados {$sqlWhereConteo} GROUP BY estado");
    $stmtC->execute($paramsConteo);
    $conteos = $stmtC->fetchAll();

    respond(['success' => true, 'pagos' => $pagos, 'conteos' => $conteos]);
} catch (\Throwable $e) {
    // Mensaje explícito: el error más probable aquí es que todavía no se haya
    // corrido migracion_2026_09_21_pagos_no_aplicados.sql en este servidor.
    log_api('listar_pagos_no_aplicados ERROR: ' . $e->getMessage());
    respond([
        'success' => false,
        'error'   => 'No se pudo leer la lista. Si es la primera vez, falta correr migracion_2026_09_21_pagos_no_aplicados.sql. Detalle: ' . $e->getMessage(),
    ]);
}
