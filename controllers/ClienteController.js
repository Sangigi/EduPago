/**
 * CONTROLLER — ClienteController
 */
const ClienteController = (() => {
  function agregar(data, cliente) {
    const nuevo = { ...cliente, id: AppModel.nextId(data.clientes), saldo_pendiente: 0, activo: true };
    return { ...data, clientes: [...data.clientes, nuevo] };
  }
  function editar(data, cliente) {
    return { ...data, clientes: data.clientes.map(c => c.id === cliente.id ? { ...c, ...cliente } : c) };
  }
  function toggleActivo(data, id) {
    return { ...data, clientes: data.clientes.map(c => c.id === id ? { ...c, activo: !c.activo } : c) };
  }
  return { agregar, editar, toggleActivo };
})();