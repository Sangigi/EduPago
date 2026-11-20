<?php
// lib/helpers_diagnostico.php
//
// [OF-4a] DETECTOR DE INCOHERENCIAS (19-nov-2026). SOLO LECTURA.
//
// El dinero se guarda en varios lugares a la vez (cobros.monto_pagado ←
// cobro_abonos, clientes.saldo_pendiente ← cobros, monederos.saldo ←
// monedero_movimientos). Si una escritura falla a medias, o un script
// manual toca solo uno, las copias se desfasan y NADIE se entera hasta que una
// familia reclama. Esto las compara y lista lo que no cuadra, con hasta 20
// ejemplos por regla para ir directo al registro.
//
// REGLAS DE DISEÑO
//   · Solo SELECT. Nunca corrige nada: decidir QUÉ cifra es la buena es trabajo
//     de una persona (casi siempre manda el libro: abonos / movimientos).
//   · Cada regla corre en su propio try/catch. Si falta una tabla o columna
//     (la base aún no tiene esa migración), esa regla dice "no disponible" y
//     las demás siguen.
//   · Comparaciones de dinero con tolerancia de medio centavo (DECIMAL(12,2)).
//   · Con escuela_id solo mira ese colegio; sin él, toda la plataforma.
//   · Cada consulta lleva un tope de tiempo (max_execution_time) para que, en
//     una base grande, un diagnóstico no se coma la base en horario de cobro.
//
// CÓMO AGREGAR UNA REGLA: añade un arreglo a diagnostico_reglas(). Su 'sql'
// devuelve al menos `id` (y `escuela_id` si se puede); '%ESC%' se sustituye por
// "AND <alias>.escuela_id = ?" (o nada) según 'esc'. Ver las que ya hay.

const DIAGNOSTICO_MAX_EJEMPLOS = 20;

/**
 * Definición de las reglas. Se arma con la base conectada para elegir el SQL
 * (p. ej. si cobros.es_recarga_monedero existe).
 *
 * Cada regla: id, titulo, problema (qué causa), severidad (alta|media|baja),
 * sql (SELECT con `id` primero), esc (alias.columna del filtro de colegio, o
 * null si la regla no se puede filtrar), nota (aclaración opcional).
 */
function diagnostico_reglas(PDO $pdo): array
{
    $con_recargas = false;
    try {
        $con_recargas = (bool) $pdo->query("SHOW COLUMNS FROM cobros LIKE 'es_recarga_monedero'")->fetch();
    } catch (Throwable $e) { /* sin tabla cobros: la regla fallará sola y dirá no disponible */ }
    // Misma exclusión que recalcular_saldo_pendiente(): una recarga de monedero
    // pendiente NO es adeudo de la familia.
    $sin_recargas = $con_recargas ? ' AND es_recarga_monedero = 0' : '';

    // [OF-6] Los cobros de una importación de saldos (OF-5) no descuentan inventario
    // por diseño: se excluyen de la regla de ventas sin movimiento si esa tabla existe.
    $sin_importados = '';
    try {
        if ($pdo->query("SHOW TABLES LIKE 'importaciones_saldos_filas'")->fetch()) {
            $sin_importados = ' AND NOT EXISTS (SELECT 1 FROM importaciones_saldos_filas isf WHERE isf.cobro_id = c.id)';
        }
    } catch (Throwable $e) { /* sin esa tabla: no hay nada que excluir */ }

    return [
        [
            'id' => 'saldo_pendiente_cliente',
            'titulo' => 'Saldo pendiente del alumno no cuadra con sus cobros',
            'problema' => 'La familia ve (y se le cobra) un adeudo distinto al real. Se arregla recalculando con recalcular_saldo_pendiente() para ese alumno.',
            'severidad' => 'alta',
            'esc' => 'c.escuela_id',
            'sql' => "SELECT c.id, c.escuela_id, c.nombre,
                             c.saldo_pendiente AS registrado, COALESCE(x.s, 0) AS esperado
                        FROM clientes c
                   LEFT JOIN (SELECT cliente_id, SUM(total - monto_pagado) AS s
                                FROM cobros
                               WHERE estado = 'pendiente'{$sin_recargas}
                            GROUP BY cliente_id) x ON x.cliente_id = c.id
                       WHERE ABS(COALESCE(c.saldo_pendiente, 0) - COALESCE(x.s, 0)) > 0.005 %ESC%",
        ],
        [
            'id' => 'cobro_pagado_de_mas',
            'titulo' => 'Cobros con monto pagado MAYOR que el total',
            'problema' => 'Se abonó más de lo que valía el cobro (un pago duplicado o un reparto mal hecho). Hay dinero de más que devolver o aplicar a otro cobro.',
            'severidad' => 'alta',
            'esc' => 'escuela_id',
            'sql' => "SELECT id, escuela_id, folio, estado, total, monto_pagado
                        FROM cobros
                       WHERE monto_pagado > total + 0.005 %ESC%",
        ],
        [
            'id' => 'cobro_pagado_incompleto',
            'titulo' => 'Cobros marcados como pagados pero con monto pagado MENOR al total (posteriores al libro de abonos)',
            'problema' => 'El cobro figura saldado pero el libro de abonos no suma el total: o falta un abono, o se marcó pagado sin recibir todo el dinero.',
            'severidad' => 'alta',
            'esc' => 'escuela_id',
            'sql' => "SELECT id, escuela_id, folio, fecha, total, monto_pagado
                        FROM cobros
                       WHERE estado = 'pagado' AND monto_pagado < total - 0.005
                         AND fecha >= COALESCE((SELECT DATE(MIN(creado_en)) FROM cobro_abonos), '1000-01-01') %ESC%",
        ],
        [
            'id' => 'cobro_pagado_incompleto_antiguo',
            'titulo' => 'Cobros pagados con monto pagado menor al total (ANTERIORES al libro de abonos)',
            'problema' => 'Son cobros de antes de que existieran los abonos; la migración les copió el total, así que un hallazgo aquí es un dato histórico raro, no un fallo reciente.',
            'severidad' => 'baja',
            'esc' => 'escuela_id',
            'sql' => "SELECT id, escuela_id, folio, fecha, total, monto_pagado
                        FROM cobros
                       WHERE estado = 'pagado' AND monto_pagado < total - 0.005
                         AND fecha < COALESCE((SELECT DATE(MIN(creado_en)) FROM cobro_abonos), '1000-01-01') %ESC%",
            'nota' => 'La frontera es la fecha del primer abono registrado en cobro_abonos.',
        ],
        [
            'id' => 'abonos_vs_monto_pagado',
            'titulo' => 'La suma de abonos no coincide con el monto pagado del cobro',
            'problema' => 'cobros.monto_pagado es una copia calculada del libro cobro_abonos. Si difieren, el saldo que ve la familia no es el del libro (manda el libro).',
            'severidad' => 'alta',
            'esc' => 'c.escuela_id',
            'sql' => "SELECT c.id, c.escuela_id, c.folio, c.estado,
                             c.monto_pagado AS registrado, a.s AS esperado
                        FROM cobros c
                        JOIN (SELECT cobro_id, SUM(monto) AS s FROM cobro_abonos GROUP BY cobro_id) a ON a.cobro_id = c.id
                       WHERE ABS(c.monto_pagado - a.s) > 0.005 %ESC%",
            'nota' => 'Solo cobros que tienen al menos un abono.',
        ],
        [
            'id' => 'monedero_vs_libro',
            'titulo' => 'Saldo del monedero distinto de la suma de su libro de movimientos',
            'problema' => 'Un alumno vería (y podría gastar) un saldo distinto al que dice el libro mayor. El libro es la fuente de verdad.',
            'severidad' => 'alta',
            'esc' => 'm.escuela_id',
            'sql' => "SELECT m.cliente_id AS id, m.escuela_id, m.saldo AS registrado, COALESCE(l.s, 0) AS esperado
                        FROM monederos m
                   LEFT JOIN (SELECT cliente_id, SUM(signo * monto) AS s FROM monedero_movimientos GROUP BY cliente_id) l
                          ON l.cliente_id = m.cliente_id
                       WHERE ABS(m.saldo - COALESCE(l.s, 0)) > 0.005 %ESC%",
            'nota' => 'En este listado `id` es el id del alumno (clientes.id).',
        ],
        [
            'id' => 'items_vs_total',
            'titulo' => 'Conceptos con snapshot completo cuya suma no es el total del cobro',
            'problema' => 'La factura (CFDI) se arma desde los conceptos: si no suman el total, la factura cae a un solo renglón o sale con importe distinto al cobrado.',
            'severidad' => 'media',
            'esc' => 'c.escuela_id',
            'sql' => "SELECT c.id, c.escuela_id, c.folio, c.estado, c.total AS registrado, i.s AS esperado
                        FROM cobros c
                        JOIN (SELECT cobro_id, SUM(subtotal) AS s, COUNT(*) AS n, SUM(iva_tasa IS NOT NULL) AS con_snapshot
                                FROM cobro_items GROUP BY cobro_id) i ON i.cobro_id = c.id
                       WHERE i.n = i.con_snapshot AND ABS(c.total - i.s) > 0.005 %ESC%",
            'nota' => 'Solo cobros cuyos conceptos TODOS tienen snapshot de IVA (OF-2); los anteriores se ignoran.',
        ],
        [
            'id' => 'alumno_activo_vs_estatus',
            'titulo' => 'Alumnos con activo y estatus incoherentes',
            'problema' => 'Invariante de F1: activo = 1 si y solo si estatus = "activo". Si no se cumple, el alumno cuenta (o no) para el límite del plan, el cron de cobros y el portal de forma distinta según quién lo lea.',
            'severidad' => 'media',
            'esc' => 'escuela_id',
            'sql' => "SELECT id, escuela_id, nombre, activo, estatus
                        FROM clientes
                       WHERE tipo = 'alumno'
                         AND ((activo = 1 AND estatus <> 'activo') OR (activo = 0 AND estatus = 'activo')) %ESC%",
        ],
        [
            'id' => 'cuenta_alumno_de_alumno_inactivo',
            'titulo' => 'Cuentas de acceso de alumno ACTIVAS cuyo alumno está inactivo',
            'problema' => 'Un alumno dado de baja (o egresado) sigue pudiendo entrar al portal, ver su boleta y gastar su monedero.',
            'severidad' => 'media',
            'esc' => 'u.escuela_id',
            'sql' => "SELECT u.id, u.escuela_id, u.nombre, u.cliente_id, c.nombre AS alumno
                        FROM usuarios u
                        JOIN clientes c ON c.id = u.cliente_id
                       WHERE u.rol = 'alumno' AND u.activo = 1 AND c.activo = 0 %ESC%",
        ],
        [
            'id' => 'cajas_abiertas_24h',
            'titulo' => 'Cajas abiertas hace más de 24 horas',
            'problema' => 'Una caja olvidada abierta mezcla en un mismo corte el dinero de varios días y bloquea abrir otra al mismo cajero.',
            'severidad' => 'baja',
            'esc' => 's.escuela_id',
            'sql' => "SELECT ca.id, s.escuela_id, ca.sucursal_id, ca.usuario_id, ca.fecha_apertura
                        FROM caja ca
                        JOIN sucursales s ON s.id = ca.sucursal_id
                       WHERE ca.estado = 'abierta' AND ca.fecha_apertura < (NOW() - INTERVAL 24 HOUR) %ESC%",
        ],
        [
            'id' => 'pagos_no_aplicados_7d',
            'titulo' => 'Pagos no aplicados pendientes de más de 7 días',
            'problema' => 'Es dinero que el proveedor ya depositó y que el sistema no supo a quién abonar. Mientras nadie lo resuelva, la familia sigue "debiendo".',
            'severidad' => 'alta',
            'esc' => 'escuela_id',
            'sql' => "SELECT id, escuela_id, canal, motivo, monto_recibido, creado_en
                        FROM pagos_no_aplicados
                       WHERE estado = 'pendiente' AND creado_en < (NOW() - INTERVAL 7 DAY) %ESC%",
            'nota' => 'Los pagos que no se pudieron ligar a ningún colegio (escuela_id vacío) solo aparecen sin filtro de colegio.',
        ],
        [
            'id' => 'abonos_sin_complemento_30d',
            'titulo' => 'Abonos sin complemento de pago de más de 30 días (cobros facturados)',
            'problema' => 'Una factura PPD sin sus complementos queda colgada: para el SAT el pago no existe y el colegio no puede deducirlo. Es un problema fiscal.',
            'severidad' => 'media',
            'esc' => 'c.escuela_id',
            'sql' => "SELECT a.id, c.escuela_id, a.cobro_id, c.folio, a.monto, a.creado_en
                        FROM cobro_abonos a
                        JOIN cobros c ON c.id = a.cobro_id
                       WHERE c.factura_uuid IS NOT NULL AND c.factura_uuid <> ''
                         AND (c.factura_metodo_pago IS NULL OR c.factura_metodo_pago <> 'PUE')
                         AND (a.cfdi_complemento_uuid IS NULL OR a.cfdi_complemento_uuid = '')
                         AND a.creado_en < (NOW() - INTERVAL 30 DAY) %ESC%",
            'nota' => 'Igual que la lista de Facturación > complementos pendientes: no cuenta facturas PUE.',
        ],
        // [OF-6] Inventario. Cada regla corre en su propio try/catch: sin la migración
        // de inventario dicen "no disponible" y no afectan a las demás.
        [
            'id' => 'inventario_vs_libro',
            'titulo' => 'Existencia de inventario distinta de la suma de su libro de movimientos',
            'problema' => 'La pantalla de Inventario (y los avisos "se acabó / queda poco") muestran una existencia que no es la del libro. El libro es la fuente de verdad: el siguiente movimiento del producto la corrige, o un conteo físico la fija.',
            'severidad' => 'media',
            'esc' => 'e.escuela_id',
            'sql' => "SELECT e.id, e.escuela_id, e.tipo, e.item_id, e.existencia AS registrado, COALESCE(l.s, 0) AS esperado
                        FROM inventario_existencias e
                   LEFT JOIN (SELECT tipo, item_id, SUM(cantidad) AS s FROM inventario_movimientos GROUP BY tipo, item_id) l
                          ON l.tipo = e.tipo AND l.item_id = e.item_id
                       WHERE e.existencia <> COALESCE(l.s, 0) %ESC%",
            'nota' => 'En este listado `id` es el id del renglón de existencias; `tipo` = concepto o tienda, `item_id` = el producto.',
        ],
        [
            'id' => 'inventario_venta_sin_movimiento',
            'titulo' => 'Ventas de productos con existencias que NO movieron el inventario',
            'problema' => 'Se vendió (cobro en Caja o venta de la tiendita) un producto que maneja existencias después de que empezó a moverse, pero no hay su movimiento de venta: el inventario falló en ese momento (ver el log, líneas INVENTARIO) y la existencia quedó de más. Se corrige con un ajuste o con el siguiente conteo físico.',
            'severidad' => 'media',
            'esc' => 'u.escuela_id',
            'sql' => "SELECT * FROM (
                        SELECT ci.cobro_id AS id, c.escuela_id, 'cobro' AS origen, c.folio AS documento,
                               ci.producto_id AS item_id, SUM(ci.cantidad) AS piezas
                          FROM cobro_items ci
                          JOIN cobros c ON c.id = ci.cobro_id
                          JOIN productos p ON p.id = ci.producto_id AND p.escuela_id = c.escuela_id AND p.maneja_existencias = 1
                          JOIN (SELECT item_id, MIN(creado_en) AS desde FROM inventario_movimientos WHERE tipo = 'concepto' GROUP BY item_id) f
                            ON f.item_id = p.id
                         WHERE c.fecha >= DATE(f.desde)
                           AND NOT EXISTS (SELECT 1 FROM inventario_movimientos m
                                            WHERE m.idem_key = CONCAT('venta_cobro:', ci.cobro_id, ':', ci.producto_id)){$sin_importados}
                      GROUP BY ci.cobro_id, c.escuela_id, c.folio, ci.producto_id
                        UNION ALL
                        SELECT tv.id, tv.escuela_id, 'tienda' AS origen, CONCAT('Venta #', tv.id) AS documento,
                               tvi.producto_id AS item_id, SUM(tvi.cantidad) AS piezas
                          FROM tienda_venta_items tvi
                          JOIN tienda_ventas tv ON tv.id = tvi.venta_id
                          JOIN tienda_productos tp ON tp.id = tvi.producto_id AND tp.escuela_id = tv.escuela_id AND tp.maneja_existencias = 1
                          JOIN (SELECT item_id, MIN(creado_en) AS desde FROM inventario_movimientos WHERE tipo = 'tienda' GROUP BY item_id) f
                            ON f.item_id = tp.id
                         WHERE tv.creado_en >= f.desde
                           AND NOT EXISTS (SELECT 1 FROM inventario_movimientos m
                                            WHERE m.idem_key = CONCAT('venta_tienda:', tv.id, ':', tvi.producto_id))
                      GROUP BY tv.id, tv.escuela_id, tvi.producto_id
                      ) u WHERE 1 = 1 %ESC%",
            'nota' => 'Solo cuenta ventas desde el primer movimiento del producto (el día que empezó a controlarse); los cobros de importaciones de saldos no descuentan inventario y se excluyen. En ese primer día puede haber un falso positivo (un cobro de la mañana, anterior a la entrada de la tarde). `id` = cobro o venta; `item_id` = el producto.',
        ],
    ];
}

/** Una regla, en su propio try/catch. Devuelve la ficha de resultado. */
function diagnostico_correr_regla(PDO $pdo, array $r, ?int $escuela_id): array
{
    $ficha = [
        'id' => $r['id'], 'titulo' => $r['titulo'], 'problema' => $r['problema'],
        'severidad' => $r['severidad'], 'nota' => $r['nota'] ?? null,
        'disponible' => true, 'total' => 0, 'ejemplos' => [], 'error' => null,
    ];
    $filtro = '';
    $params = [];
    if ($escuela_id) {
        $filtro = ' AND ' . $r['esc'] . ' = ?';
        $params[] = $escuela_id;
    }
    $sql = str_replace('%ESC%', $filtro, $r['sql']);

    try {
        $cuenta = $pdo->prepare("SELECT COUNT(*) FROM ($sql) t");
        $cuenta->execute($params);
        $ficha['total'] = (int) $cuenta->fetchColumn();

        if ($ficha['total'] > 0) {
            $ej = $pdo->prepare("SELECT * FROM ($sql) t ORDER BY id LIMIT " . DIAGNOSTICO_MAX_EJEMPLOS);
            $ej->execute($params);
            $ficha['ejemplos'] = $ej->fetchAll(PDO::FETCH_ASSOC);
        }
    } catch (Throwable $e) {
        // Falta una tabla/columna (migración sin correr) o se acabó el tiempo.
        $ficha['disponible'] = false;
        $ficha['total'] = 0;
        $ficha['ejemplos'] = [];
        $m = $e->getMessage();
        $ficha['error'] = (stripos($m, 'execution time') !== false || stripos($m, 'max_execution_time') !== false)
            ? 'La consulta tardó demasiado y se canceló. Pruébalo por colegio.'
            : 'No disponible en esta base (probablemente falta una migración).';
        // El detalle técnico va al log del servidor, no al navegador.
        error_log('[diagnostico:' . $r['id'] . '] ' . $m);
    }
    return $ficha;
}

/**
 * Corre todas las reglas.
 *
 * @return array{generado_en:string, escuela_id:?int, reglas:array, con_hallazgos:int, no_disponibles:int}
 */
function diagnostico_incoherencias(PDO $pdo, ?int $escuela_id = null): array
{
    // Tope por consulta (MySQL 5.7.8+, solo SELECT). Si no existe, se ignora.
    try { $pdo->exec('SET SESSION max_execution_time = 20000'); } catch (Throwable $e) { /* opcional */ }

    $reglas = [];
    foreach (diagnostico_reglas($pdo) as $r) {
        $reglas[] = diagnostico_correr_regla($pdo, $r, $escuela_id);
    }

    // Nombre del colegio de cada ejemplo, en UNA consulta.
    $ids = [];
    foreach ($reglas as $r) foreach ($r['ejemplos'] as $e) {
        if (!empty($e['escuela_id'])) $ids[(int) $e['escuela_id']] = true;
    }
    if ($ids) {
        try {
            $in = implode(',', array_fill(0, count($ids), '?'));
            $st = $pdo->prepare("SELECT id, nombre FROM escuelas WHERE id IN ($in)");
            $st->execute(array_keys($ids));
            $nombres = [];
            foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $f) $nombres[(int) $f['id']] = $f['nombre'];
            foreach ($reglas as $i => $r) foreach ($r['ejemplos'] as $j => $e) {
                $reglas[$i]['ejemplos'][$j]['escuela'] = $nombres[(int) ($e['escuela_id'] ?? 0)] ?? null;
            }
        } catch (Throwable $e) { /* el nombre es adorno */ }
    }

    $con = 0; $nd = 0;
    foreach ($reglas as $r) {
        if (!$r['disponible']) $nd++; elseif ($r['total'] > 0) $con++;
    }
    return [
        'generado_en'    => date('Y-m-d H:i:s'),
        'escuela_id'     => $escuela_id,
        'reglas'         => $reglas,
        'con_hallazgos'  => $con,
        'no_disponibles' => $nd,
    ];
}
