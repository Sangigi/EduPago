<?php
// acciones/abonos_sin_complemento_listar.php
//
// Abonos de cobros YA facturados como PPD a los que todavía les falta su
// CFDI de pago (complemento de recepción de pagos).
//
// POR QUÉ ES UNA PANTALLA Y NO UN REPORTE OCASIONAL
//
// Una factura PPD sin sus complementos queda colgada: para el SAT el pago no
// existe y el cliente no puede deducir. El hueco no avisa solo — nadie se
// entera hasta que el contador del colegio reclama. Esta lista es lo que hace
// visible ese pendiente.

$rol = $usuario_actual['rol'] ?? '';
requerir_rol($rol, ['superadmin', 'admin', 'cajero'], 'No tienes permiso para ver esto.');

$escuela_id = intval($input['escuela_id'] ?? 0);
if (!$escuela_id) respond(['success' => false, 'error' => 'escuela_id requerido']);
requerir_escuela_propia($rol, $escuela_id, $usuario_actual, 'No tienes permiso sobre este colegio.');

try {
    $stmt = $pdo->prepare(
        "SELECT a.id, a.cobro_id, a.monto, a.metodo, a.creado_en,
                c.folio AS cobro_folio, c.total AS cobro_total,
                c.factura_uuid AS cobro_factura_uuid,
                COALESCE(cl.nombre, 'Cliente general') AS cliente
           FROM cobro_abonos a
           JOIN cobros c    ON c.id = a.cobro_id
      LEFT JOIN clientes cl ON cl.id = c.cliente_id
          WHERE a.escuela_id = ?
            AND c.factura_uuid IS NOT NULL AND c.factura_uuid <> ''
            AND (a.cfdi_complemento_uuid IS NULL OR a.cfdi_complemento_uuid = '')
          ORDER BY a.creado_en ASC, a.id ASC
          LIMIT 200"
    );
    $stmt->execute([$escuela_id]);
    $abonos = array_map(function ($a) {
        $a['monto'] = floatval($a['monto']);
        $a['cobro_total'] = floatval($a['cobro_total']);
        return $a;
    }, $stmt->fetchAll());
} catch (\PDOException $e) {
    // Las columnas cfdi_complemento_* son nuevas: si falta la migración esto
    // devuelve una lista vacía con aviso, en vez de un 500 que rompería toda
    // la pantalla de Facturación.
    log_api("abonos_sin_complemento_listar: no se pudo leer (¿falta migrar cobro_abonos?) -> " . $e->getMessage());
    respond([
        'success' => true,
        'abonos'  => [],
        'aviso'   => 'Falta aplicar una actualización de la base de datos para poder listar los complementos pendientes.',
    ]);
}

respond(['success' => true, 'abonos' => $abonos]);
