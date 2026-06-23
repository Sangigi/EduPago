/**
 * CONTROLLER — CobroController v4 (Conectado a DB)
 */
const CobroController = (() => {
  const API = 'api.php';
  const SPEI_BANCO_DEFAULT = 'STP — Sistema de Transferencias y Pagos';

  async function apiPost(action, body) {
    const token = AuthController.getToken();
    const res = await fetch(`${API}?action=${action}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      body: JSON.stringify(body),
    });
    if (res.status === 401) { AuthController.logout(); window.location.reload(); throw new Error('Sesión expirada. Inicia sesión de nuevo.'); }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function iniciarCobro({ carrito, cliente, metodo, escuela_id }) {
    // La API debe tener un endpoint `crear_cobro` que reciba esto e inserte en MySQL
    const resultado = await apiPost('crear_cobro', {
      carrito,
      cliente_id: cliente?.id,
      metodo,
      escuela_id,
      referencia: cliente?.matricula
    });
    if (!resultado.success) throw new Error(resultado.error || 'Error al crear cobro');
    return resultado.cobro; // Devuelve el cobro insertado con su ID real
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

    const resultado = await apiPost('obtener_clabe', {
      referencia: cobro.referencia,
      total:      cobro.total,
    });
    if (resultado.success) return resultado;
    throw new Error('No se pudo obtener CLABE');
  }

  async function verificarSPEI(referencia, clabe) {
    const resultado = await apiPost('verificar_spei', { referencia, clabe });
    if (!resultado.success) throw new Error(resultado.error || 'Error al verificar');
    return { pagado: resultado.pagado, monto: resultado.monto_pesos };
  }

  async function iniciarTC(cobro) {
    const resultado = await apiPost('generar_liga', {
      folio:       cobro.folio,
      total:       cobro.total,
      descripcion: `Pago escolar ${cobro.folio}`,
    });
    if (!resultado.success) throw new Error(resultado.error || 'Error al generar liga');
    return { url: resultado.url, qr_url: resultado.qr_url, referencia: resultado.referencia };
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

  return {
    iniciarCobro, iniciarSPEI, verificarSPEI, iniciarTC, confirmarPago, cancelarCobro,
    generarClabeIndividual, liberarClabeIndividual,
  };
})();