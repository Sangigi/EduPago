<?php
// acciones/suscripcion_pagos_listar.php
//
// Historial de pagos de la suscripción de un colegio (su mensualidad al
// sistema). Es lo que alimenta la tarjeta "Historial de tu suscripción" de
// views/MiSuscripcion.js.
//
// Existe porque hasta el 25-sep-2026 no había forma de ver esto: los pagos de
// renovación se guardaban en columnas de `escuelas` que el propio webhook
// ponía en NULL al confirmar el cobro. Ver migraciones/
// migracion_2026_09_25_suscripcion_pagos.sql para el detalle.

$rol = $usuario_actual['rol'] ?? '';
requerir_rol($rol, ['superadmin', 'admin', 'soporte'], 'No tienes permiso para ver el historial de suscripción.');

// El admin solo ve LA SUYA. Sin esto, mandando otro escuela_id podría leer
// montos, referencias y códigos de autorización de cualquier otro colegio.
$escuela_id = intval($input['escuela_id'] ?? 0);
if (!$escuela_id) respond(['success' => false, 'error' => 'escuela_id requerido']);
// 'soporte' mira cualquier colegio para poder atender aclaraciones; es un rol
// de solo lectura (ver el allowlist de api.php). Bypass local, igual que en
// listar_documentos_escuela.php: no se toca requerir_escuela_propia global,
// que comparten decenas de acciones no relacionadas.
if ($rol !== 'soporte') {
    requerir_escuela_propia($rol, $escuela_id, $usuario_actual, 'No tienes permiso sobre este colegio.');
}

try {
    $stmt = $pdo->prepare(
        "SELECT sp.id, sp.origen, sp.metodo, sp.plan, sp.monto, sp.referencia, sp.folio,
                sp.auth_code, sp.cubre_desde, sp.cubre_hasta, sp.pagado_en,
                u.nombre AS registrado_por_nombre
           FROM suscripcion_pagos sp
           LEFT JOIN usuarios u ON u.id = sp.registrado_por
          WHERE sp.escuela_id = ?
          ORDER BY sp.pagado_en DESC, sp.id DESC
          LIMIT 200"
    );
    $stmt->execute([$escuela_id]);
    $pagos = array_map(function ($p) {
        // El monto se castea a float SOLO cuando existe: un 'manual' viene con
        // NULL a propósito (no hubo cobro) y floatval(null) daría 0.0, que la
        // pantalla mostraría como "$0.00 pagados" — falso.
        $p['monto'] = ($p['monto'] === null || $p['monto'] === '') ? null : floatval($p['monto']);
        return $p;
    }, $stmt->fetchAll());
} catch (\PDOException $e) {
    // La tabla es nueva: si todavía no se corre la migración, esto devuelve
    // una lista vacía con un aviso en vez de un 500. Mismo criterio que
    // cargar_datos.php con cobro_items.
    log_api("suscripcion_pagos_listar: no se pudo leer (¿falta migrar suscripcion_pagos?) -> " . $e->getMessage());
    respond([
        'success' => true,
        'pagos'   => [],
        'aviso'   => 'El historial todavía no está disponible. Falta aplicar una actualización de la base de datos.',
    ]);
}

respond(['success' => true, 'pagos' => $pagos]);
