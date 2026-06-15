/**
 * CONTROLLER — ClienteController v3
 * Maneja alumnos y familias por escuela.
 * Cada alumno activo recibe una CLABE SPEI individual (CLABE INDIVIDUAL),
 * que queda asignada al alumno hasta que se da de baja (sale de la escuela).
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
      // CLABE SPEI individual: se asigna justo después del alta (ver
      // ClienteController.asignarClabe). 'pendiente' indica que aún no
      // se ha recibido respuesta de Pagadetodo/STP.
      clabe_individual:        null,
      clabe_individual_estado: 'pendiente',
      clabe_individual_fecha:  null,
    };
    return { ...data, clientes: [...data.clientes, nuevo] };
  }

  function editar(data, form) {
    return {
      ...data,
      clientes: data.clientes.map(c => c.id === form.id ? { ...c, ...form } : c),
    };
  }

  // Marca al alumno como activo/inactivo. Al INACTIVAR (alumno que sale),
  // la CLABE individual se libera; al REACTIVAR, queda pendiente de
  // generar una nueva CLABE.
  function toggleActivo(data, id) {
    return {
      ...data,
      clientes: data.clientes.map(c => {
        if (c.id !== id) return c;
        const seraActivo = !c.activo;
        if (seraActivo) {
          // Reingreso: limpiar CLABE anterior, quedará pendiente de re-generar
          return { ...c, activo: true, clabe_individual: null, clabe_individual_estado: 'pendiente', clabe_individual_fecha: null };
        }
        // Baja: liberar la CLABE asignada (si tenía)
        return { ...c, activo: false, clabe_individual_estado: c.clabe_individual ? 'liberada' : c.clabe_individual_estado };
      }),
    };
  }

  // ── CLABE individual ───────────────────────────────────────────────────────

  // Aplica el resultado exitoso de generar_clabe_individual al alumno.
  function asignarClabe(data, alumnoId, clabe) {
    return {
      ...data,
      clientes: data.clientes.map(c => c.id === alumnoId
        ? { ...c, clabe_individual: clabe, clabe_individual_estado: 'activa', clabe_individual_fecha: new Date().toISOString().slice(0,10) }
        : c),
    };
  }

  // Marca el intento como fallido para reintentar luego (no bloquea el alta del alumno).
  function marcarClabeError(data, alumnoId) {
    return {
      ...data,
      clientes: data.clientes.map(c => c.id === alumnoId
        ? { ...c, clabe_individual_estado: 'error' }
        : c),
    };
  }

  // Libera explícitamente la CLABE de un alumno (ej. al darlo de baja
  // o al eliminarlo definitivamente).
  function liberarClabe(data, alumnoId) {
    return {
      ...data,
      clientes: data.clientes.map(c => c.id === alumnoId
        ? { ...c, clabe_individual_estado: 'liberada' }
        : c),
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

  return {
    agregar, editar, toggleActivo,
    asignarClabe, marcarClabeError, liberarClabe,
    agregarFamilia, editarFamilia, saldoFamilia, hijosDeFamily,
  };
})();
