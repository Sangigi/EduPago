<?php
// acciones/mantenimiento_estado.php
//
// Devuelve el estado actual del mantenimiento global de secciones (con
// motivo y ventana de tiempo) y los métodos de pago apagados globalmente —
// lo que necesita el panel del superadmin para mostrar/editar ambos.

requerir_rol($usuario_actual['rol'] ?? '', ['superadmin'], 'Solo el super admin puede ver esta información.');

$mantenimiento = null;
try {
    $stmt = $pdo->prepare("SELECT valor FROM config_sistema WHERE clave = 'mantenimiento_secciones' LIMIT 1");
    $stmt->execute();
    $row = $stmt->fetch();
    if ($row && $row['valor']) {
        $mantenimiento = json_decode($row['valor'], true);
    }
} catch (\PDOException $e) {
    // config_sistema todavía no migrada.
}

$metodosGlobal = [];
try {
    $stmt2 = $pdo->prepare("SELECT valor FROM config_sistema WHERE clave = 'metodos_pago_global' LIMIT 1");
    $stmt2->execute();
    $row2 = $stmt2->fetch();
    if ($row2 && $row2['valor']) {
        $tmp = json_decode($row2['valor'], true);
        if (is_array($tmp) && !empty($tmp['deshabilitados'])) $metodosGlobal = $tmp['deshabilitados'];
    }
} catch (\PDOException $e) {
    // config_sistema todavía no migrada.
}

// Apagado global simple de secciones (no-mantenimiento) -- ver
// superadmin_toggle_seccion_global.php.
$seccionesGlobal = [];
try {
    $stmt3 = $pdo->prepare("SELECT valor FROM config_sistema WHERE clave = 'secciones_deshabilitadas_global' LIMIT 1");
    $stmt3->execute();
    $row3 = $stmt3->fetch();
    if ($row3 && $row3['valor']) {
        $tmp3 = json_decode($row3['valor'], true);
        if (is_array($tmp3) && !empty($tmp3['deshabilitadas'])) $seccionesGlobal = $tmp3['deshabilitadas'];
    }
} catch (\PDOException $e) {
    // config_sistema todavía no migrada.
}

respond([
    'success' => true,
    'mantenimiento' => $mantenimiento,
    'metodos_pago_global' => $metodosGlobal,
    'secciones_deshabilitadas_global' => $seccionesGlobal,
]);
