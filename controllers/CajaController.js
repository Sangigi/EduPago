/**
 * CONTROLLER — CajaController v1
 * Apertura, cierre, historial y resumen de cortes de caja.
 * Sigue el mismo patrón que CobroController.js.
 */
const CajaController = (() => {
  const API = 'api.php';

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

  async function listarSucursales(escuela_id) {
    const resultado = await apiPost('caja_sucursales', { escuela_id });
    if (!resultado.success) throw new Error(resultado.error || 'No se pudieron cargar las sucursales');
    return resultado.sucursales;
  }

  async function estadoActual(sucursal_id) {
    const resultado = await apiPost('caja_estado', { sucursal_id });
    if (!resultado.success) throw new Error(resultado.error || 'Error al consultar la caja');
    return resultado.caja; // null si no hay caja abierta
  }

  async function abrir({ sucursal_id, monto_apertura, observaciones }) {
    const resultado = await apiPost('caja_abrir', { sucursal_id, monto_apertura, observaciones });
    if (!resultado.success) throw new Error(resultado.error || 'No se pudo abrir la caja');
    return resultado.caja;
  }

  async function registrarMovimiento({ caja_id, tipo, concepto, total }) {
    const resultado = await apiPost('caja_movimiento', { caja_id, tipo, concepto, total });
    if (!resultado.success) throw new Error(resultado.error || 'No se pudo registrar el movimiento');
    return resultado;
  }

  async function cerrar({ caja_id, monto_cierre, observaciones }) {
    const resultado = await apiPost('caja_cerrar', { caja_id, monto_cierre, observaciones });
    if (!resultado.success) throw new Error(resultado.error || 'No se pudo cerrar la caja');
    return resultado.caja;
  }

  async function historial({ sucursal_id, escuela_id }) {
    const resultado = await apiPost('caja_historial', { sucursal_id, escuela_id });
    if (!resultado.success) throw new Error(resultado.error || 'No se pudo cargar el historial');
    return resultado.historial;
  }

  async function resumen(caja_id) {
    const resultado = await apiPost('caja_resumen', { caja_id });
    if (!resultado.success) throw new Error(resultado.error || 'No se pudo cargar el resumen');
    return resultado; // { caja, ventas, movimientos }
  }

  return {
    listarSucursales, estadoActual, abrir, registrarMovimiento, cerrar, historial, resumen,
  };
})();
