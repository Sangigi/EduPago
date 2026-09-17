const GastosController = (() => {
  const apiPost = ApiClient.post;

  async function crear(gasto) {
    const resultado = await apiPost('crear_gasto', gasto);
    if (!resultado.success) throw new Error(resultado.error || 'Error al registrar el gasto');
    return resultado;
  }

  async function editar(gasto) {
    const resultado = await apiPost('editar_gasto', gasto);
    if (!resultado.success) throw new Error(resultado.error || 'Error al editar el gasto');
    return resultado;
  }

  async function eliminar(id) {
    const resultado = await apiPost('eliminar_gasto', { id });
    if (!resultado.success) throw new Error(resultado.error || 'Error al eliminar el gasto');
    return resultado;
  }

  // Multipart: ApiClient.post siempre serializa a JSON, no sirve aquí. Mismo
  // patrón que la subida de foto de alumno en FichaTecnica.js.
  async function subirComprobante(gasto_id, archivo) {
    const token = AuthController.getToken();
    const fd = new FormData();
    fd.append('gasto_id', gasto_id);
    fd.append('archivo', archivo);
    const res = await fetch('api.php?action=subir_comprobante_gasto', {
      method: 'POST',
      headers: { 'Authorization': token ? ('Bearer ' + token) : '' },
      body: fd,
    });
    if (res.status === 401) { AuthController.logout(); window.location.reload(); throw new Error('Sesión expirada.'); }
    const resultado = await res.json();
    if (!resultado.success) throw new Error(resultado.error || 'Error al subir el comprobante');
    return resultado;
  }

  return { crear, editar, eliminar, subirComprobante };
})();
