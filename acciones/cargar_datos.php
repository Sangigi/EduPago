<?php
        // Carga el estado del usuario actual desde la DB.
        // Respeta el scope: superadmin ve todo lo "ligero" (escuelas + conteos);
        // admin/cajero/familia ven el detalle completo de SU escuela.
        // Para no reventar con cuentas grandes: clientes y cobros van paginados
        // con un tope duro (MAX_FILA), y el superadmin solo trae detalle
        // completo (clientes/familias/productos/cobros) si manda escuela_id_ver.
        $MAX_FILA = 1000; // tope duro por página, sin importar lo que pida el cliente
        $rol       = $usuario_actual['rol']       ?? 'cajero';
        $user_id   = $usuario_actual['user_id']   ?? 0;
        $escuela_id_usuario = null;
        $su = $pdo->prepare("SELECT escuela_id, rol FROM usuarios WHERE id = ?");
        $su->execute([$user_id]);
        $urow = $su->fetch();
        if ($urow) {
            $escuela_id_usuario = $urow['escuela_id'];
            $rol = $urow['rol'];
        }
        // Paginación de clientes (alumnos)
        $pagina_clientes    = max(1, intval($input['pagina_clientes'] ?? $_GET['pagina_clientes'] ?? 1));
        $por_pagina_clientes = intval($input['por_pagina_clientes'] ?? $_GET['por_pagina_clientes'] ?? 25);
        $por_pagina_clientes = max(1, min($por_pagina_clientes, $MAX_FILA));
        $offset_clientes    = ($pagina_clientes - 1) * $por_pagina_clientes;
        $busqueda_clientes  = trim($input['buscar_clientes'] ?? $_GET['buscar_clientes'] ?? '');
        // Superadmin: si no especifica una escuela concreta, solo recibe el
        // catálogo de escuelas + conteos por escuela (resumen liviano), no el
        // detalle de alumnos/familias/productos/cobros de TODAS las escuelas.
        $escuela_id_ver = $rol === 'superadmin'
            ? (intval($input['escuela_id_ver'] ?? $_GET['escuela_id_ver'] ?? 0) ?: null)
            : $escuela_id_usuario;
        // ── Escuelas ──
        if ($rol === 'superadmin') {
            $stmt = $pdo->query("SELECT * FROM escuelas ORDER BY id");
        } else {
            $stmt = $pdo->prepare("SELECT * FROM escuelas WHERE id = ? OR escuela_padre_id = ?");
            $stmt->execute([$escuela_id_usuario, $escuela_id_usuario]);
        }
        $escuelas = $stmt->fetchAll();
        // ── Resumen liviano por escuela (siempre se manda, sirve para el dashboard
        //    de superadmin y para el desglose por plantel sin cargar el detalle
        //    completo de cada escuela) ──
        $resumen_escuelas = [];
        if ($rol === 'superadmin') {
            $rs = $pdo->query(
                "SELECT escuela_id, COUNT(*) AS total_alumnos, SUM(saldo_pendiente) AS saldo_total
                 FROM clientes GROUP BY escuela_id"
            );
            foreach ($rs->fetchAll() as $row) {
                $resumen_escuelas[intval($row['escuela_id'])] = [
                    'total_alumnos' => intval($row['total_alumnos']),
                    'saldo_total'   => floatval($row['saldo_total']),
                    'cobrado_90d'   => 0,
                    'pendiente_90d' => 0,
                    'num_cobros_90d' => 0,
                ];
            }
            // Cobrado/pendiente por escuela en los últimos 90 días (para desglosar
            // por plantel en SuperReportes/Dashboard sin otro roundtrip por escuela)
            $rs2 = $pdo->query(
                "SELECT escuela_id, estado, COUNT(*) AS n, COALESCE(SUM(total),0) AS suma
                 FROM cobros WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
                 GROUP BY escuela_id, estado"
            );
            foreach ($rs2->fetchAll() as $row) {
                $eid = intval($row['escuela_id']);
                if (!isset($resumen_escuelas[$eid])) {
                    $resumen_escuelas[$eid] = ['total_alumnos' => 0, 'saldo_total' => 0, 'cobrado_90d' => 0, 'pendiente_90d' => 0, 'num_cobros_90d' => 0];
                }
                if ($row['estado'] === 'pagado') {
                    $resumen_escuelas[$eid]['cobrado_90d'] += floatval($row['suma']);
                } elseif ($row['estado'] === 'pendiente') {
                    $resumen_escuelas[$eid]['pendiente_90d'] += floatval($row['suma']);
                }
                $resumen_escuelas[$eid]['num_cobros_90d'] += intval($row['n']);
            }
        }
        if ($escuela_id_ver === null && $rol === 'superadmin') {
            // Superadmin sin escuela seleccionada: responde solo lo liviano.
            respond([
                'success'          => true,
                'escuelas'         => $escuelas,
                'resumen_escuelas' => $resumen_escuelas,
                'clientes'         => [],
                'planteles'        => [],
                'familias'         => [],
                'productos'        => [],
                'cobros'           => [],
                'requiere_escuela_id_ver' => true,
            ]);
        }
        // ── Clientes (alumnos) — paginado y con búsqueda opcional ──
        // Si el rol es 'familia', se restringe a SUS propios hijos: antes se
        // mandaban todos los alumnos de la escuela completa y el filtro "solo
        // mis hijos" solo existía en el frontend (PortalFamilia.js), así que
        // cualquier padre podía leer el listado completo llamando a la API
        // directamente (nombre, teléfono, email, saldo_pendiente de terceros).
        $where_cli = 'escuela_id = ?';
        $params_cli = [$escuela_id_ver];
        if ($rol === 'familia') {
            $where_cli .= ' AND familia_id = ?';
            $params_cli[] = $usuario_actual['familia_id'] ?? -1;
        }
        if ($busqueda_clientes !== '') {
            // Busqueda por etiquetas: el frontend manda los terminos separados
            // por "|". Cada termino debe coincidir (Y logica) en alguno de los
            // campos, para poder acotar combinando apellido + matricula + etc.
            $terminos = array_filter(array_map('trim', explode('|', $busqueda_clientes)), function ($t) {
                return $t !== '';
            });
            // Tope defensivo: evita que una peticion manipulada arme una
            // consulta enorme con cientos de LIKE encadenados.
            $terminos = array_slice($terminos, 0, 8);

            foreach ($terminos as $t) {
                $where_cli .= ' AND (nombre LIKE ? OR email LIKE ? OR matricula LIKE ?'
                            . ' OR telefono LIKE ? OR curp LIKE ? OR grado LIKE ?)';
                $like = "%$t%";
                $params_cli[] = $like;  // nombre
                $params_cli[] = $like;  // email
                $params_cli[] = $like;  // matricula
                $params_cli[] = $like;  // telefono
                $params_cli[] = $like;  // curp
                $params_cli[] = $like;  // grado
            }
        }
        $cnt = $pdo->prepare("SELECT COUNT(*) AS n FROM clientes WHERE $where_cli");
        $cnt->execute($params_cli);
        $clientes_total = intval($cnt->fetch()['n'] ?? 0);
        $stmt = $pdo->prepare(
            "SELECT * FROM clientes WHERE $where_cli ORDER BY nombre LIMIT $por_pagina_clientes OFFSET $offset_clientes"
        );
        $stmt->execute($params_cli);
        $clientes_raw = $stmt->fetchAll();
        $clientes = array_map(function($c) {
            $c['activo']          = (bool)$c['activo'];
            $c['saldo_pendiente'] = floatval($c['saldo_pendiente']);
            $c['familia_id']      = $c['familia_id'] ? intval($c['familia_id']) : null;
            // El frontend (Alumnos.js, Familias.js, PortalFamilia.js) siempre
            // lee `tel`, pero la columna real es `telefono` — sin este alias
            // el teléfono del alumno se mostraba vacío en todas las vistas.
            $c['tel'] = $c['telefono'] ?? null;
            return $c;
        }, $clientes_raw);
        // ── Planteles (sub escuelas) ──
        $stmt = $pdo->prepare("SELECT * FROM planteles WHERE escuela_id = ? ORDER BY id");
        $stmt->execute([$escuela_id_ver]);
        $planteles_raw = $stmt->fetchAll();
        $planteles = array_map(function($p) {
            $p['activo'] = (bool)$p['activo'];
            return $p;
        }, $planteles_raw);
        // ── Métricas por plantel (alumnos + cobros 90 días de su escuela-cuenta
        //    hija). Disponible para admin/superadmin, no solo superadmin, para
        //    que el dashboard de cada escuela vea sus propios planteles. ──
        $resumen_planteles = [];
        if (!empty($planteles)) {
            $ids_hijos = array_column($planteles, 'escuela_plantel_id');
            $ids_hijos = array_values(array_unique(array_filter($ids_hijos)));
            if (!empty($ids_hijos)) {
                $in = implode(',', array_fill(0, count($ids_hijos), '?'));
                $rp1 = $pdo->prepare("SELECT escuela_id, COUNT(*) AS n FROM clientes WHERE escuela_id IN ($in) GROUP BY escuela_id");
                $rp1->execute($ids_hijos);
                foreach ($rp1->fetchAll() as $row) {
                    $resumen_planteles[intval($row['escuela_id'])]['num_alumnos'] = intval($row['n']);
                }
                $rp2 = $pdo->prepare(
                    "SELECT escuela_id, estado, COUNT(*) AS n, COALESCE(SUM(total),0) AS suma
                     FROM cobros WHERE escuela_id IN ($in) AND fecha >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
                     GROUP BY escuela_id, estado"
                );
                $rp2->execute($ids_hijos);
                foreach ($rp2->fetchAll() as $row) {
                    $eid = intval($row['escuela_id']);
                    if (!isset($resumen_planteles[$eid]['cobrado_90d'])) $resumen_planteles[$eid]['cobrado_90d'] = 0;
                    if (!isset($resumen_planteles[$eid]['pendiente_90d'])) $resumen_planteles[$eid]['pendiente_90d'] = 0;
                    if ($row['estado'] === 'pagado') $resumen_planteles[$eid]['cobrado_90d'] += floatval($row['suma']);
                    if ($row['estado'] === 'pendiente') $resumen_planteles[$eid]['pendiente_90d'] += floatval($row['suma']);
                }
            }
            // Rellenar defaults para los que no tuvieron ni alumnos ni cobros
            foreach ($ids_hijos as $eid) {
                $resumen_planteles[$eid] = array_merge(
                    ['num_alumnos' => 0, 'cobrado_90d' => 0, 'pendiente_90d' => 0],
                    $resumen_planteles[$eid] ?? []
                );
            }
        }
        // ── Familias ── (rol 'familia': solo la propia — antes veían el
        // contacto/teléfono/email de TODAS las familias de la escuela)
        if ($rol === 'familia') {
            $stmt = $pdo->prepare("SELECT * FROM familias WHERE id = ? AND escuela_id = ?");
            $stmt->execute([$usuario_actual['familia_id'] ?? -1, $escuela_id_ver]);
        } else {
            $stmt = $pdo->prepare("SELECT * FROM familias WHERE escuela_id = ? ORDER BY nombre LIMIT $MAX_FILA");
            $stmt->execute([$escuela_id_ver]);
        }
        $familias_raw = $stmt->fetchAll();
        $familias = array_map(function($f) {
            $f['activa'] = (bool)$f['activa'];
            return $f;
        }, $familias_raw);
        // ── Productos ──
        $stmt = $pdo->prepare("SELECT * FROM productos WHERE escuela_id = ? ORDER BY nombre LIMIT $MAX_FILA");
        $stmt->execute([$escuela_id_ver]);
        $productos_raw = $stmt->fetchAll();
        $productos = array_map(function($p) {
            $p['activo'] = (bool)$p['activo'];
            $p['precio'] = floatval($p['precio']);
            return $p;
        }, $productos_raw);
        // ── Cobros (últimos 90 días, con tope duro adicional) ──
        // Nota: este campo alimenta también Dashboard.js y el badge de
        // "pendientes" en app.js, que necesitan el conjunto agregado, no una
        // página. La tabla paginada de Cobros.js usa el endpoint aparte
        // 'listar_cobros' (ver más abajo en el switch).
        // Rol 'familia': solo cobros de SUS propios hijos — antes se mandaban
        // los cobros (folios, montos, método, qué se compró) de TODAS las
        // familias de la escuela, filtrado solo en el frontend.
        $where_co_familia = '';
        $params_co = [$escuela_id_ver];
        if ($rol === 'familia') {
            $where_co_familia = ' AND cl.familia_id = ?';
            $params_co[] = $usuario_actual['familia_id'] ?? -1;
        }
        $stmt = $pdo->prepare(
            "SELECT co.*, COALESCE(cl.nombre, 'Cliente general') AS cliente
             FROM cobros co
             LEFT JOIN clientes cl ON cl.id = co.cliente_id
             WHERE co.escuela_id = ? AND co.fecha >= DATE_SUB(CURDATE(), INTERVAL 90 DAY){$where_co_familia}
             ORDER BY co.id DESC LIMIT $MAX_FILA"
        );
        $stmt->execute($params_co);
        $cobros_raw = $stmt->fetchAll();
        $cobros = array_map(function($c) {
            $c['total']   = floatval($c['total']);
            $c['factura'] = (bool)$c['factura'];
            $c['cliente'] = $c['cliente'] ?? 'Cliente general';
            return $c;
        }, $cobros_raw);
        // Adjuntar los conceptos (cobro_items) de cada cobro en UNA sola query
        // extra (no una por fila), para que el portal de familia y los
        // reportes puedan mostrar "qué se compró" sin otro roundtrip.
        // Try/catch: si la tabla aún no existe (falta migrar), simplemente no
        // se adjuntan items — no debe tumbar cargar_datos.
        if (!empty($cobros)) {
            try {
                $ids_cobros = array_column($cobros, 'id');
                $in = implode(',', array_fill(0, count($ids_cobros), '?'));
                $stmtIt = $pdo->prepare("SELECT * FROM cobro_items WHERE cobro_id IN ($in) ORDER BY id");
                $stmtIt->execute($ids_cobros);
                $itemsPorCobro = [];
                foreach ($stmtIt->fetchAll() as $it) {
                    $it['cantidad']        = intval($it['cantidad']);
                    $it['precio_unitario'] = floatval($it['precio_unitario']);
                    $it['subtotal']        = floatval($it['subtotal']);
                    $itemsPorCobro[intval($it['cobro_id'])][] = $it;
                }
                foreach ($cobros as &$c) {
                    $c['items'] = $itemsPorCobro[intval($c['id'])] ?? [];
                }
                unset($c);
            } catch (\PDOException $e) {
                // Tabla cobro_items aún no migrada — se omite silenciosamente
            }
        }
        // Resumen agregado exacto (no depende del tope $MAX_FILA de arriba,
        // así el badge de "pendientes" y los totales del dashboard son
        // correctos aunque la escuela tenga más de $MAX_FILA cobros en 90 días).
        $res_co = $pdo->prepare(
            "SELECT co.estado AS estado, COUNT(*) AS n, COALESCE(SUM(co.total),0) AS suma
             FROM cobros co
             LEFT JOIN clientes cl ON cl.id = co.cliente_id
             WHERE co.escuela_id = ? AND co.fecha >= DATE_SUB(CURDATE(), INTERVAL 90 DAY){$where_co_familia}
             GROUP BY co.estado"
        );
        $res_co->execute($params_co);
        $cobros_resumen = ['pagado' => ['n'=>0,'suma'=>0], 'pendiente' => ['n'=>0,'suma'=>0], 'cancelado' => ['n'=>0,'suma'=>0]];
        foreach ($res_co->fetchAll() as $row) {
            $cobros_resumen[$row['estado']] = ['n' => intval($row['n']), 'suma' => floatval($row['suma'])];
        }
        // ── Recordatorios (últimos 60 días, ya reales desde la BD) ──
        // Envuelto en try/catch: si la tabla `recordatorios` (ver
        // optimizacion_bd.sql, Bloque 0) todavía no se migró, cargar_datos
        // no se debe caer completo por eso.
        $recordatorios = [];
        try {
            $stmt = $pdo->prepare(
                "SELECT id, escuela_id, cobro_id, cliente, fecha, canal, usuario_id
                 FROM recordatorios WHERE escuela_id = ? AND fecha >= DATE_SUB(CURDATE(), INTERVAL 60 DAY)
                 ORDER BY fecha DESC LIMIT $MAX_FILA"
            );
            $stmt->execute([$escuela_id_ver]);
            $recordatorios = $stmt->fetchAll();
        } catch (\PDOException $e) {
            file_put_contents(__DIR__ . '/api_log.txt', date('Y-m-d H:i:s') . " | recordatorios no disponible (¿falta migrar tabla?): " . $e->getMessage() . "\n", FILE_APPEND);
        }
        respond([
            'success'           => true,
            'escuelas'          => $escuelas,
            'resumen_escuelas'  => $resumen_escuelas,
            'clientes'          => $clientes,
            'clientes_total'    => $clientes_total,
            'clientes_pagina'   => $pagina_clientes,
            'clientes_por_pagina' => $por_pagina_clientes,
            'planteles'         => $planteles,
            'resumen_planteles' => $resumen_planteles,
            'familias'          => $familias,
            'productos'         => $productos,
            'cobros'            => $cobros,
            'cobros_resumen'    => $cobros_resumen,
            'recordatorios'     => $recordatorios,
            'escuela_id_ver'    => $escuela_id_ver,
        ]);
