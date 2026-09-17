/**
 * CONTROLLER — ClienteController v4 (Conectado a DB)
 */
const ClienteController = (() => {
  const apiPost = ApiClient.post;

  async function agregar(form, escuela_id) {
    const res = await apiPost('crear_cliente', { ...form, escuela_id });
    if (!res.success) throw new Error(res.error);
    return res.cliente; // Retorna el cliente con el ID de la base de datos
  }

  async function editar(form) {
    const res = await apiPost('editar_cliente', form);
    if (!res.success) throw new Error(res.error);
    return res.cliente;
  }

  async function toggleActivo(id, estadoActual) {
    const res = await apiPost('toggle_cliente_activo', { id, activar: !estadoActual });
    if (!res.success) throw new Error(res.error);
    return res.cliente;
  }

  async function agregarFamilia(form, escuela_id) {
    const res = await apiPost('crear_familia', { ...form, escuela_id });
    if (!res.success) throw new Error(res.error);
    return res.familia;
  }

  async function editarFamilia(form) {
    const res = await apiPost('editar_familia', form);
    if (!res.success) throw new Error(res.error);
    return res.familia;
  }

  return {
    agregar, editar, toggleActivo, agregarFamilia, editarFamilia,
  };
})();