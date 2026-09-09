const ProveedoresController = (() => {
  const apiPost = ApiClient.post;

  async function crear(proveedor) {
    const resultado = await apiPost('crear_proveedor', proveedor);
    if (!resultado.success) throw new Error(resultado.error || 'Error al crear el proveedor');
    return resultado;
  }

  async function editar(proveedor) {
    const resultado = await apiPost('editar_proveedor', proveedor);
    if (!resultado.success) throw new Error(resultado.error || 'Error al editar el proveedor');
    return resultado;
  }

  async function toggleActivo(id) {
    const resultado = await apiPost('toggle_proveedor_activo', { id });
    if (!resultado.success) throw new Error(resultado.error || 'Error al actualizar el proveedor');
    return resultado;
  }

  return { crear, editar, toggleActivo };
})();
