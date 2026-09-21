<?php
// acciones/resolver_pago_no_aplicado.php
//
// Marca un depósito no aplicado como 'resuelto' o 'descartado', con una nota
// de quién lo atendió y qué se hizo. NO mueve dinero ni toca `cobros`: si el
// depósito corresponde a un cobro real, aplicarlo sigue siendo un paso
// aparte y deliberado (confirmar_pago.php), para que nunca se marque un cobro
// como pagado desde esta pantalla por accidente.

$rol = $usuario_actual['rol'] ?? '';
requerir_rol($rol, ['admin', 'superadmin', 'contador'], 'No tienes permiso para resolver pagos sin aplicar.');

$id     = intval($input['id'] ?? 0);
$estado = strtolower(trim($input['estado'] ?? ''));
$notas  = trim($input['notas'] ?? '');

if (!$id) respond(['success' => false, 'error' => 'id requerido']);
if (!in_array($estado, ['resuelto', 'descartado', 'pendiente'], true)) {
    respond(['success' => false, 'error' => 'estado inválido (resuelto | descartado | pendiente)']);
}
if ($estado === 'descartado' && $notas === '') {
    respond(['success' => false, 'error' => 'Para descartar un depósito hay que escribir el motivo.']);
}

try {
    $stmt = $pdo->prepare("SELECT id, escuela_id, canal, monto_recibido, referencia, clabe FROM pagos_no_aplicados WHERE id = ?");
    $stmt->execute([$id]);
    $pago = $stmt->fetch();
    if (!$pago) respond(['success' => false, 'error' => 'No existe ese registro']);

    // Un admin solo puede tocar lo de su propia escuela. Los no atribuidos
    // (escuela_id NULL) quedan reservados a superadmin/contador, que son
    // quienes pueden ver el panorama completo para decidir de quién son.
    if ($rol === 'admin') {
        if (!$pago['escuela_id']) {
            respond(['success' => false, 'error' => 'Este depósito no está asignado a tu escuela; lo revisa la administración central.']);
        }
        requerir_escuela_propia($rol, intval($pago['escuela_id']), $usuario_actual, 'No tienes permiso sobre este registro.');
    }

    $pdo->prepare(
        "UPDATE pagos_no_aplicados
            SET estado = ?, notas = ?, resuelto_por = ?, resuelto_en = ?, actualizado_en = NOW()
          WHERE id = ?"
    )->execute([
        $estado,
        $notas !== '' ? $notas : null,
        intval($usuario_actual['id'] ?? 0) ?: null,
        $estado === 'pendiente' ? null : date('Y-m-d H:i:s'),
        $id,
    ]);

    $ref = $pago['referencia'] ?: ($pago['clabe'] ?: 's/ref');
    registrar_log(
        $pdo, $usuario_actual, 'pago_no_aplicado_' . $estado,
        "Depósito #{$id} ({$pago['canal']}, \${$pago['monto_recibido']}, {$ref}) -> {$estado}" . ($notas !== '' ? " | {$notas}" : ''),
        $pago['escuela_id'] ?: null
    );

    respond(['success' => true]);
} catch (\Throwable $e) {
    log_api('resolver_pago_no_aplicado ERROR: ' . $e->getMessage());
    respond(['success' => false, 'error' => 'No se pudo actualizar: ' . $e->getMessage()]);
}
