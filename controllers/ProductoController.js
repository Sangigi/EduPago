/**
 * CONTROLLER — ProductoController
 */
const ProductoController = (() => {
  function agregar(data, prod) {
    const nuevo = { ...prod, id: AppModel.nextId(data.productos), activo: true };
    return { ...data, productos: [...data.productos, nuevo] };
  }
  function editar(data, prod) {
    return { ...data, productos: data.productos.map(p => p.id === prod.id ? { ...p, ...prod } : p) };
  }
  function toggleActivo(data, id) {
    return { ...data, productos: data.productos.map(p => p.id === id ? { ...p, activo: !p.activo } : p) };
  }
  return { agregar, editar, toggleActivo };
})();