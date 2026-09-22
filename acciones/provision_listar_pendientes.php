<?php
// acciones/provision_listar_pendientes.php
//
// La cola de trabajo del rol 'provision': colegios cuyos documentos YA aprobó
// el contador y a los que todavía les falta el identificador que
// Cobroscontarjeta.com asigna después de esa aprobación.
//
// Por qué es un rol aparte y no parte de 'contador': son dos revisiones
// distintas hechas por dos personas distintas. El contador dice "los papeles
// están bien"; quien provisiona hace el trámite con el proveedor, recibe el
// identificador y lo captura. Separarlos deja el rastro de quién hizo cada
// cosa, que es justo lo que se necesita cuando un colegio reclama que lleva
// semanas sin poder cobrar.
//
// Ver migracion_2026_09_22_provision_y_cuentas_por_pagar.sql.

requerir_rol($usuario_actual['rol'] ?? '', ['superadmin', 'provision'], 'No tienes permiso para ver la cola de provisión.');

// `filtro` decide qué pila se pide:
//   'pendientes' (default) -> aprobadas SIN id: lo que hay que trabajar hoy
//   'listas'                -> aprobadas CON id: para consultar o corregir
//   'todas'                 -> ambas
$filtro = trim($input['filtro'] ?? 'pendientes');
if (!in_array($filtro, ['pendientes', 'listas', 'todas'], true)) $filtro = 'pendientes';

$where = "e.documentacion_estado = 'aprobada'";
if ($filtro === 'pendientes') {
    $where .= " AND (e.proveedor_school_id IS NULL OR e.proveedor_school_id = '')";
} elseif ($filtro === 'listas') {
    $where .= " AND e.proveedor_school_id IS NOT NULL AND e.proveedor_school_id <> ''";
}

try {
    // El LEFT JOIN a distribuidor_referidos trae el estado del embudo comercial
    // cuando el colegio llegó por un distribuidor. Es LEFT y no INNER porque
    // ese estado solo existe para colegios referidos: uno que se dio de alta
    // directo no tiene renglón ahí, y aun así hay que provisionarlo.
    $stmt = $pdo->prepare(
        "SELECT e.id, e.nombre, e.clave, e.tipo_persona, e.razon_social,
                e.documentacion_estado, e.proveedor_school_id,
                e.proveedor_school_id_en, e.proveedor_school_id_por,
                u.nombre AS capturado_por_nombre,
                r.id     AS referido_id,
                r.estado AS referido_estado,
                (SELECT COUNT(*) FROM escuela_documentos d
                  WHERE d.escuela_id = e.id AND d.estado = 'aprobado') AS documentos_aprobados,
                (SELECT MAX(d2.revisado_en) FROM escuela_documentos d2
                  WHERE d2.escuela_id = e.id) AS ultima_revision
           FROM escuelas e
           LEFT JOIN usuarios u ON u.id = e.proveedor_school_id_por
           LEFT JOIN distribuidor_referidos r ON r.escuela_id = e.id
          WHERE $where
          ORDER BY ultima_revision ASC, e.nombre ASC"
    );
    $stmt->execute();
    $filas = $stmt->fetchAll();
} catch (\PDOException $e) {
    // Si la migración del 22-sep todavía no corre, las columnas
    // proveedor_school_id* no existen y esta consulta truena. Se responde un
    // error explicativo en vez de un 500 mudo — mismo criterio que
    // contador_listar_escuelas.php con documentacion_estado.
    respond(['success' => false,
             'error' => 'Falta correr migracion_2026_09_22_provision_y_cuentas_por_pagar.sql en la base de datos.',
             'detalle' => $e->getMessage()]);
}

foreach ($filas as &$f) {
    $f['id']                   = intval($f['id']);
    $f['documentos_aprobados'] = intval($f['documentos_aprobados']);
    $f['referido_id']          = $f['referido_id'] !== null ? intval($f['referido_id']) : null;
    $f['tiene_id']             = !empty($f['proveedor_school_id']);
}
unset($f);

respond(['success' => true, 'escuelas' => $filas, 'filtro' => $filtro]);
