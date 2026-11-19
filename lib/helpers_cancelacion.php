<?php
/**
 * lib/helpers_cancelacion.php — [OF-2] Cancelación de facturas (CFDI).
 *
 * Lo comparten acciones/cancelar_cfdi.php (pide la cancelación al PAC) y
 * acciones/cancelar_cfdi_actualizar.php (consulta si el receptor ya aceptó).
 *
 * CANCELAR UNA FACTURA NO CANCELA EL COBRO NI MUEVE DINERO. Lo único que
 * cambia en `cobros` es que deja de tener factura vigente (para poder volver a
 * facturarlo); el historial completo queda en `facturas_canceladas`.
 *
 * Forma de la API de Facturapi (https://docs.facturapi.io/api/ → "Cancelar
 * factura", y el SDK oficial facturapi-node, tipos CancellationQueryInput e
 * InvoiceCancellationStatus):
 *   DELETE /v2/invoices/{id}?motive=01|02|03|04[&substitution=<UUID o id>]
 *   · motive 01 y 04 EXIGEN substitution; 02 y 03 no.
 *   · Respuesta 200 = objeto Invoice. Puede venir con status "canceled"
 *     (cancelada), o con status "valid" + cancellation_status "pending" (el
 *     receptor debe aceptar la cancelación; Facturapi actualiza el estado
 *     después). cancellation_status ∈ none | pending | accepted | rejected |
 *     expired | verifying.
 */

/** Motivos de cancelación del SAT (catálogo c_MotivoCancelacion). */
const CFDI_MOTIVOS_CANCELACION = ['01', '02', '03', '04'];

/** Motivos que exigen UUID de la factura sustituta (según Facturapi). */
const CFDI_MOTIVOS_CON_SUSTITUCION = ['01', '04'];

/** ¿Existen la tabla de historial y la columna de estado en cobros? */
function cancelacion_migracion_lista(PDO $pdo): bool
{
    static $listo = null;
    if ($listo !== null) return $listo;
    try {
        $t = $pdo->query("SHOW TABLES LIKE 'facturas_canceladas'")->fetch();
        $c = $pdo->query("SHOW COLUMNS FROM cobros LIKE 'factura_cancelacion_estado'")->fetch();
        $listo = (bool) ($t && $c);
    } catch (\Throwable $e) {
        $listo = false;
    }
    return $listo;
}

/**
 * Estado normalizado de una factura de Facturapi:
 *   'canceled' (cancelada), 'pending' (esperando al receptor),
 *   'rejected', 'expired' (la factura SIGUE vigente) o 'valid' (sin cancelación).
 */
function cancelacion_estado_pac(array $inv): string
{
    $st = (string) ($inv['status'] ?? '');
    $cs = (string) ($inv['cancellation_status'] ?? ($inv['cancellation']['status'] ?? 'none'));
    if ($st === 'canceled' || $cs === 'accepted') return 'canceled';
    if ($cs === 'pending' || $cs === 'verifying') return 'pending';
    if ($cs === 'rejected') return 'rejected';
    if ($cs === 'expired') return 'expired';
    return 'valid';
}

/**
 * Deja el cobro sin factura vigente: lista para volver a facturar. NO toca
 * total, estado, monto_pagado ni abonos (el dinero no se mueve). Los datos del
 * receptor guardados en familias/clientes se conservan para prellenar la
 * nueva factura.
 *
 * facturapi_id se pone en '' (no NULL) porque la definición original de esa
 * columna no está en el repositorio y no se sabe si admite NULL; todo el
 * código la evalúa como "vacía = sin factura".
 */
function cancelacion_liberar_cobro(PDO $pdo, int $cobro_id): void
{
    $pdo->prepare(
        "UPDATE cobros SET
            factura = 0, facturapi_id = '', factura_uuid = NULL, factura_serie = NULL,
            factura_folio = NULL, factura_fecha_timbrado = NULL, factura_subtotal = NULL,
            factura_iva = NULL, factura_rfc_receptor = NULL, factura_razon_social = NULL,
            factura_uso_cfdi = NULL, factura_metodo_pago = NULL, factura_cp_receptor = NULL,
            factura_email_receptor = NULL, factura_qr_url = NULL,
            factura_impuestos_json = NULL, factura_cancelacion_estado = NULL
         WHERE id = ?"
    )->execute([$cobro_id]);
}

/**
 * Aplica un estado de cancelación nuevo (el que devolvió el PAC) a una fila
 * del historial y al cobro. Devuelve el estado aplicado.
 *   canceled → historial 'canceled' + cobro liberado
 *   pending  → historial 'pending'  + cobro marcado 'pendiente' (sigue facturado)
 *   rejected / expired → historial con ese estado + el cobro vuelve a
 *                        mostrarse como facturado normal (la factura sigue vigente)
 */
function cancelacion_aplicar_estado(PDO $pdo, int $historial_id, int $cobro_id, string $estado, ?string $respuesta_json): string
{
    $pdo->prepare(
        "UPDATE facturas_canceladas SET estado = ?, respuesta_pac = COALESCE(?, respuesta_pac), actualizada_en = NOW() WHERE id = ?"
    )->execute([$estado, $respuesta_json, $historial_id]);
    if ($estado === 'canceled') {
        cancelacion_liberar_cobro($pdo, $cobro_id);
    } elseif ($estado === 'pending') {
        $pdo->prepare("UPDATE cobros SET factura_cancelacion_estado = 'pendiente' WHERE id = ?")->execute([$cobro_id]);
    } else {
        $pdo->prepare("UPDATE cobros SET factura_cancelacion_estado = NULL WHERE id = ?")->execute([$cobro_id]);
    }
    return $estado;
}
