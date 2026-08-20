/**
 * CONTROLLER — ProductosController (Conectado a DB)
 * Antes, Productos.js solo guardaba en AppModel (localStorage), por lo que
 * los conceptos de pago vivían aislados por navegador y nunca llegaban a la
 * base de datos.
 */
const ProductosController = (() => {
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

  async function crear(producto) {
    const resultado = await apiPost('crear_producto', producto);
    if (!resultado.success) throw new Error(resultado.error || 'Error al crear el concepto de pago');
    return resultado;
  }

  async function editar(producto) {
    const resultado = await apiPost('editar_producto', producto);
    if (!resultado.success) throw new Error(resultado.error || 'Error al editar el concepto de pago');
    return resultado;
  }

  async function toggleActivo(id) {
    const resultado = await apiPost('toggle_producto_activo', { id });
    if (!resultado.success) throw new Error(resultado.error || 'Error al actualizar el concepto de pago');
    return resultado;
  }

  return { crear, editar, toggleActivo };
})();
