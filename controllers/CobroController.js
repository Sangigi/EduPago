/**
 * CONTROLLER — CobroController v4 (Conectado a DB)
 */
const CobroController = (() => {
  const SPEI_BANCO_DEFAULT = 'STP — Sistema de Transferencias y Pagos';

  const apiPost = ApiClient.post;

  async function iniciarCobro({ carrito, cliente, metodo, escuela_id, caja_id, sucursal_id }) {
    // La API debe tener un endpoint `crear_cobro` que reciba esto e inserte en MySQL
    const resultado = await apiPost('crear_cobro', {
      carrito,
      cliente_id: cliente?.id,
      metodo,
      escuela_id,
      referencia: cliente?.matricula,
      caja_id,
      sucursal_id,
    });
    if (!resultado.success) throw new Error(resultado.error || 'Error al crear cobro');
    // Propagar saldo actualizado para que Caja.js pueda actualizarlo en el estado
    const cobro = resultado.cobro;
    cobro._cliente_id = resultado.cliente_id ?? null;
    cobro._nuevo_saldo = resultado.nuevo_saldo ?? null;
    return cobro; // Devuelve el cobro insertado con su ID real
  }

  async function iniciarSPEI(cobro, escuela, cliente) {
    const tieneClabeIndividual = cliente?.clabe_individual && cliente?.clabe_individual_estado === 'activa';

    if (tieneClabeIndividual) {
      return {
        clabe:        cliente.clabe_individual,
        banco:        SPEI_BANCO_DEFAULT,
        beneficiario: escuela?.nombre || 'Paga la Escuela',
        referencia:   cobro.referencia,
        instruccion:  `Esta CLABE es exclusiva de ${cliente.nombre}. Puedes transferir sin escribir concepto.`,
        esIndividual: true,
      };
    }

    // Sin CLABE individual activa — no hay fallback
    const motivo = !cliente
      ? 'No hay alumno seleccionado.'
      : !cliente.clabe_individual
        ? `${cliente.nombre} no tiene CLABE SPEI asignada.`
        : `La CLABE de ${cliente.nombre} está ${cliente.clabe_individual_estado || 'inactiva'}.`;

    throw new Error(`SPEI no disponible: ${motivo} Asigna una CLABE individual desde la ficha del alumno.`);
  }

  async function verificarSPEI(referencia, clabe, cobro_id) {
    const resultado = await apiPost('verificar_spei', { referencia, clabe, cobro_id });
    if (!resultado.success) throw new Error(resultado.error || 'Error al verificar');
    return { pagado: resultado.pagado, monto: resultado.monto_pesos };
  }

  // Verificación genérica por cobro_id — sirve para cualquier método (TC,
  // SPEI, etc.), ya que solo revisa cobros.estado en el servidor. No manda
  // referencia/clabe, así que nunca puede cruzarse con el pago de otro cobro
  // del mismo alumno (a diferencia de verificar por referencia/matrícula).
  async function verificarCobro(cobroId) {
    const resultado = await apiPost('verificar_spei', { cobro_id: cobroId });
    if (!resultado.success) throw new Error(resultado.error || 'Error al verificar');
    return { pagado: resultado.pagado, monto: resultado.monto_pesos, autorizacion: resultado.autorizacion };
  }

  async function iniciarTC(cobro) {
    const resultado = await apiPost('generar_liga', {
      folio:       cobro.folio,
      total:       cobro.total,
      descripcion: `Pago escolar ${cobro.folio}`,
      cliente_id:  cobro._cliente_id ?? null,
    });
    if (!resultado.success) throw new Error(resultado.error || 'Error al generar liga');
    return { url: resultado.url, qr_url: resultado.qr_url, referencia: resultado.referencia, con_cai: resultado.con_cai !== false };
  }

  // CAI: cobro con tarjeta ya tokenizada de un pago previo (sin volver a
  // pedir tarjeta). Solo funciona si el alumno tiene token_tarjeta activo.
  async function cobrarCAI(cobro) {
    const resultado = await apiPost('cobrar_cai', {
      cliente_id: cobro._cliente_id ?? null,
      folio:      cobro.folio,
      total:      cobro.total,
    });
    if (!resultado.success) throw new Error(resultado.error || 'Error al cobrar con tarjeta domiciliada');
    return resultado;
  }

  async function cancelarCAI(cliente_id) {
    const resultado = await apiPost('cancelar_cai', { cliente_id });
    if (!resultado.success) throw new Error(resultado.error || 'No se pudo desvincular la tarjeta');
    return resultado;
  }

  // Efectivo por referencia (OXXO / terceros vía Cobroscontarjeta.com).
  async function iniciarEfectivoRef(cobro) {
    const resultado = await apiPost('generar_referencia_efectivo', {
      folio:       cobro.folio,
      total:       cobro.total,
      descripcion: `Pago escolar ${cobro.folio}`,
    });
    if (!resultado.success) throw new Error(resultado.error || 'Error al generar referencia de pago');
    return resultado; // { referencia, barcode_url, payformat_url, vencimiento }
  }

  async function confirmarPago(cobroId, extra = {}) {
    const resultado = await apiPost('confirmar_pago', { cobro_id: cobroId, ...extra });
    if (!resultado.success) throw new Error(resultado.error);
    return resultado;
  }

  async function cancelarCobro(cobroId) {
    const resultado = await apiPost('cancelar_cobro', { cobro_id: cobroId });
    if (!resultado.success) throw new Error(resultado.error);
    return resultado;
  }

  async function marcarChequeRebotado(cobroId) {
    const resultado = await apiPost('marcar_cheque_rebotado', { cobro_id: cobroId });
    if (!resultado.success) throw new Error(resultado.error);
    return resultado;
  }

  async function generarClabeIndividual({ alumno_id, matricula, nombre, email, escuela }) {
    const resultado = await apiPost('generar_clabe_individual', {
      alumno_id, matricula, nombre, email, escuela,
    });
    if (!resultado.success) throw new Error(resultado.error || 'No se pudo generar la CLABE individual');
    return resultado;
  }

  async function liberarClabeIndividual({ alumno_id, clabe }) {
    if (!clabe) return { success: true, mensaje: 'Sin CLABE que liberar' };
    return await apiPost('liberar_clabe_individual', { alumno_id, clabe });
  }

  // Timbra un CFDI para un cobro ya pagado (reusa el mismo endpoint que
  // views/Facturacion.js, para no duplicar la lógica de Facturapi).
  async function generarCFDI(payload) {
    const resultado = await apiPost('generar_cfdi', payload);
    if (!resultado.success) throw new Error(resultado.error || 'Error al generar la factura');
    return resultado;
  }

  async function enviarFacturaCorreo(cobroId, email) {
    const resultado = await apiPost('enviar_factura_correo', { cobro_id: cobroId, email });
    if (!resultado.success) throw new Error(resultado.error || 'Error al enviar la factura por correo');
    return resultado;
  }

  return {
    iniciarCobro, iniciarSPEI, verificarSPEI, verificarCobro, iniciarTC, confirmarPago, cancelarCobro,
    generarClabeIndividual, liberarClabeIndividual,
    cobrarCAI, cancelarCAI, iniciarEfectivoRef, marcarChequeRebotado,
    generarCFDI, enviarFacturaCorreo,
  };
})();
