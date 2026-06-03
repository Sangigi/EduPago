/**
 * CONTROLLER — ClienteController v2
 * Maneja alumnos y familias por escuela.
 */
const ClienteController = (() => {

  function agregar(data, form, escuela_id) {
    const nuevo = {
      id: AppModel.nextId(data.clientes),
      escuela_id,
      familia_id:      form.familia_id || null,
      tipo:            form.tipo || 'alumno',
      nombre:          form.nombre,
      grado:           form.grado || '',
      matricula:       form.matricula || '',
      curp:            form.curp || '',
      email:           form.email || '',
      tel:             form.tel || '',
      saldo_pendiente: 0,
      activo:          true,
    };
    return { ...data, clientes: [...data.clientes, nuevo] };
  }

  function editar(data, form) {
    return {
      ...data,
      clientes: data.clientes.map(c => c.id === form.id ? { ...c, ...form } : c),
    };
  }

  function toggleActivo(data, id) {
    return {
      ...data,
      clientes: data.clientes.map(c => c.id === id ? { ...c, activo: !c.activo } : c),
    };
  }

  // Familiias
  function agregarFamilia(data, form, escuela_id) {
    const nueva = {
      id:        AppModel.nextId(data.familias),
      escuela_id,
      nombre:    form.nombre,
      contacto:  form.contacto || '',
      tel:       form.tel || '',
      email:     form.email || '',
      activa:    true,
    };
    return { ...data, familias: [...data.familias, nueva] };
  }

  function editarFamilia(data, form) {
    return {
      ...data,
      familias: data.familias.map(f => f.id === form.id ? { ...f, ...form } : f),
    };
  }

  // Saldo total de una familia (suma de saldos de sus hijos)
  function saldoFamilia(data, familia_id) {
    return data.clientes
      .filter(c => c.familia_id === familia_id && c.activo)
      .reduce((a, c) => a + (c.saldo_pendiente || 0), 0);
  }

  // Hijos de una familia
  function hijosDeFamily(data, familia_id) {
    return data.clientes.filter(c => c.familia_id === familia_id);
  }

  return { agregar, editar, toggleActivo, agregarFamilia, editarFamilia, saldoFamilia, hijosDeFamily };
})();
