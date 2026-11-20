var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};
/* views/Alumnos.jsx — Alumnos con CLABE SPEI individual por alumno */
function Alumnos({
  data,
  setData,
  escuela_id,
  rol,
  soloLectura // [F4] dirección: consulta, no edita (lo pasa app.js)
}) {
  const {
    useState
  } = React;
  // [F4] soloLectura = dirección: ve alumnos y expediente, no edita nada.
  const puedeEditar = rol !== 'cajero' && !soloLectura; // el cajero puede dar de alta pero no editar/desactivar
  // [F4] control_escolar y direccion no ven dinero: cargar_datos ya no les manda CLABE ni saldo, y
  // aquí se esconden esas columnas y los botones de CLABE (el servidor los rechazaría con 403).
  const sinFinanzas = rol === 'control_escolar' || rol === 'direccion';
  // [F4] Quién administra la cuenta de acceso de un alumno (coincide con crear_usuario.php).
  const puedeAccesoAlumno = rol === 'admin' || rol === 'superadmin' || rol === 'control_escolar';
  const [modalAcceso, setModalAcceso] = useState(null); // [F4] alumno cuyo "Acceso del alumno" está abierto
  // [OF-3] Becas por alumno: solo admin y superadmin (el servidor lo vuelve a validar).
  const puedeBecas = (rol === 'admin' || rol === 'superadmin') && !soloLectura;
  const [becasAlumno, setBecasAlumno] = useState(null);   // [OF-3] alumno cuyas becas se editan
  const [becasColegioAbierto, setBecasColegioAbierto] = useState(false); // [OF-3] vista "Becas del colegio"
  const [importarSaldosAbierto, setImportarSaldosAbierto] = useState(false); // [OF-5] asistente "Importar adeudos"
  const EMPTY = {
    tipo: 'alumno',
    nombre: '',
    grado: '',
    matricula: '',
    curp: '',
    email: '',
    tel: '',
    familia_id: null,
    // Campos extendidos (reunión jun-10)
    direccion: '',
    contacto_emergencia: '',
    tel_emergencia: '',
    doc_curp_url: '',
    doc_acta_url: '',
    doc_ine_tutor_url: '',
    foto_url: ''
  };
  const [modal, setModal] = useState(null);
  const [ficha, setFicha] = useState(null);   // alumno cuya credencial se muestra
  const [expediente, setExpediente] = useState(null); // [F2] alumno cuyo expediente está abierto
  const [form, setForm] = useState(EMPTY);
  const [q, setQ] = useState('');
  // Términos acumulados del buscador. Se mandan al servidor separados por '|'
  // porque el filtrado debe ocurrir en SQL: la lista viene paginada y filtrar
  // solo en el navegador daría resultados falsos (ver api_busqueda_etiquetas.md).
  const [etiquetas, setEtiquetas] = useState([]);
  const [clabeLoadingId, setClabeLoadingId] = useState(null);
  const [asignandoClabesMasivo, setAsignandoClabesMasivo] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [buscando, setBuscando] = useState(false);
  const [qFamilia, setQFamilia] = useState('');
  const [familiaAbierta, setFamiliaAbierta] = useState(false);
  // [F1] Ciclo de vida: filtro de la lista por estatus y alumno al que se le
  // está cambiando el estatus (modal "Cambiar estatus").
  const [estatusFiltro, setEstatusFiltro] = useState('');
  const [modalEstatus, setModalEstatus] = useState(null);

  // Importar CSV (alta masiva de alumnos + tutores/familias)
  const [modalImport, setModalImport] = useState(null); // null | 'upload' | 'preview' | 'resultado'
  const [csvFilas, setCsvFilas] = useState([]);
  const [csvErrorParse, setCsvErrorParse] = useState('');
  const [importando, setImportando] = useState(false);
  const [resultadoImport, setResultadoImport] = useState(null);
  const CSV_COLUMNAS = ['alumno_nombre', 'matricula', 'grado', 'curp', 'alumno_email', 'alumno_telefono', 'nivel_educativo_sat', 'tutor_nombre', 'tutor_email', 'tutor_telefono'];

  const familiasFiltradas = React.useMemo(() => {
    const texto = qFamilia.trim().toLowerCase();
    const todas = data.familias.map(fam => ({
      fam,
      exacta: texto !== '' && fam.nombre.toLowerCase() === texto,
    }));
    const lista = texto === ''
      ? todas
      : todas.filter(({ fam }) => fam.nombre.toLowerCase().includes(texto));
    // Exactas primero, luego el resto en orden alfabético
    return lista.sort((a, b) => (b.exacta - a.exacta) || a.fam.nombre.localeCompare(b.fam.nombre)).slice(0, 30);
  }, [qFamilia, data.familias]);
  const escuela = data.escuelas.find(e => e.id === escuela_id);
  const porPagina = data.clientes_por_pagina || 500;
  const totalAlumnos = typeof data.clientes_total === 'number' ? data.clientes_total : data.clientes.length;
  const totalPaginas = Math.max(1, Math.ceil(totalAlumnos / porPagina));

  const token = () => AuthController.getToken();

  // Escuelas con muchos alumnos: la búsqueda y la paginación se resuelven en el
  // backend (endpoint cargar_datos con buscar_clientes/pagina_clientes), no
  // filtrando en el navegador un arreglo que ya no llega completo.
  const buscarEnServidor = async (texto, paginaBuscar) => {
    if (!escuela_id) return;
    setBuscando(true);
    try {
      const params = new URLSearchParams({
        action: 'cargar_datos',
        escuela_id_ver: escuela_id,
        buscar_clientes: texto || '',
        pagina_clientes: paginaBuscar || 1,
        estatus_clientes: estatusFiltro || '', // [F1] filtro por estatus (se resuelve en SQL)
      });
      const res = await fetch('api.php?' + params.toString(), {
        cache: 'no-store',
        headers: { 'Authorization': 'Bearer ' + token() },
      });
      const json = await res.json();
      if (json.success) {
        const actualizado = {
          ...data,
          clientes: json.clientes || [],
          clientes_total: json.clientes_total,
          clientes_activos_total: json.clientes_activos_total,
          clientes_pagina: json.clientes_pagina,
          clientes_por_pagina: json.clientes_por_pagina,
        };
        setData(actualizado);
        AppModel.save(actualizado);
      }
    } catch (e) {
      // Sin red: se sigue mostrando lo que ya había en memoria (fallback offline)
    } finally {
      setBuscando(false);
    }
  };

  // Debounce de 400ms para no disparar una query por cada tecla
  React.useEffect(() => {
    const t = setTimeout(() => {
      setPagina(1);
      buscarEnServidor(q, 1);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, escuela_id]);

  React.useEffect(() => {
    setPagina(1);
    buscarEnServidor(etiquetas.join('|'), 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etiquetas, escuela_id]);

  // [F1] Cambiar el filtro de estatus vuelve a pedir la página 1. Se salta el
  // primer render: las dos búsquedas de arriba ya cargan la lista al montar.
  const _f1PrimerFiltro = React.useRef(true);
  React.useEffect(() => {
    if (_f1PrimerFiltro.current) { _f1PrimerFiltro.current = false; return; }
    setPagina(1);
    buscarEnServidor(etiquetas.length ? etiquetas.join('|') : q, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estatusFiltro]);

  const irAPagina = p => {
    const destino = Math.min(Math.max(1, p), totalPaginas);
    setPagina(destino);
    buscarEnServidor(etiquetas.length ? etiquetas.join('|') : q, destino);
  };

  // La lista ya viene filtrada/paginada del backend; se mantiene un filtro
  // local ligero como respaldo mientras la búsqueda del servidor está en vuelo.
  const lista = data.clientes;

  const _apiPost = async (action, body) => {
    const res = await fetch('api.php?action=' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token() },
      body: JSON.stringify(body),
    });
    return res.json();
  };

  // ── Importar CSV: parser simple (RFC4180: comillas dobles, comas y saltos
  // de línea dentro de campos entrecomillados) — sin depender de librerías
  // externas, ya que el proyecto no usa ningún bundler/CDN. ──
  const _parsearCSV = texto => {
    const filas = [];
    let fila = [], campo = '', enComillas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i], sig = texto[i + 1];
      if (enComillas) {
        if (c === '"' && sig === '"') { campo += '"'; i++; }
        else if (c === '"') { enComillas = false; }
        else { campo += c; }
      } else if (c === '"') {
        enComillas = true;
      } else if (c === ',') {
        fila.push(campo); campo = '';
      } else if (c === '\r') {
        // ignorado, \n cierra la fila
      } else if (c === '\n') {
        fila.push(campo); filas.push(fila); fila = []; campo = '';
      } else {
        campo += c;
      }
    }
    if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
    return filas.filter(f => !(f.length === 1 && f[0].trim() === ''));
  };

  const descargarPlantillaCSV = () => {
    const encabezado = CSV_COLUMNAS.join(',');
    const ejemplo1 = 'Juan Pérez López,A-1023,3er Primaria,,,,Primaria,María López,mama.juan@example.com,5512345678';
    const ejemplo2 = 'Ana Pérez López,A-1024,1er Secundaria,,,,Secundaria,María López,mama.juan@example.com,5512345678';
    const contenido = [encabezado, ejemplo1, ejemplo2].join('\r\n');
    const blob = new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_alumnos.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const onArchivoCSV = e => {
    const archivo = e.target.files && e.target.files[0];
    if (!archivo) return;
    setCsvErrorParse('');
    const lector = new FileReader();
    lector.onload = ev => {
      try {
        const filasCrudas = _parsearCSV(String(ev.target.result || ''));
        if (filasCrudas.length < 2) { setCsvErrorParse('El archivo no tiene filas de datos (solo encabezado, o está vacío).'); return; }
        const encabezado = filasCrudas[0].map(h => h.trim().toLowerCase());
        const faltantes = ['alumno_nombre'].filter(c => !encabezado.includes(c));
        if (faltantes.length) { setCsvErrorParse('Falta la columna obligatoria: ' + faltantes.join(', ')); return; }
        const filas = filasCrudas.slice(1).map(cols => {
          const obj = {};
          encabezado.forEach((col, i) => { obj[col] = (cols[i] || '').trim(); });
          return obj;
        }).filter(f => f.alumno_nombre);
        if (!filas.length) { setCsvErrorParse('No se encontró ninguna fila con alumno_nombre.'); return; }
        setCsvFilas(filas);
        setModalImport('preview');
      } catch (err) {
        setCsvErrorParse('No se pudo leer el archivo: ' + err.message);
      }
    };
    lector.readAsText(archivo, 'UTF-8');
    e.target.value = '';
  };

  const confirmarImportacion = async () => {
    if (!escuela_id) { alert('Selecciona una escuela antes de importar.'); return; }
    setImportando(true);
    try {
      const res = await _apiPost('importar_alumnos', { escuela_id, filas: csvFilas });
      if (!res.success) { alert(res.error || 'No se pudo importar'); setImportando(false); return; }
      setData(prev => ({
        ...prev,
        clientes: [...prev.clientes, ...(res.clientes_detalle || [])],
        familias: [...prev.familias, ...(res.familias_detalle || [])],
        // Sin esto, el total quedaba desactualizado hasta recargar la página
        // completa — el Dashboard (barra de "Tu plan") seguía mostrando el
        // conteo de antes de importar.
        clientes_total: (typeof prev.clientes_total === 'number' ? prev.clientes_total : prev.clientes.length) + (res.clientes_detalle || []).length,
        clientes_activos_total: (typeof prev.clientes_activos_total === 'number' ? prev.clientes_activos_total : prev.clientes.filter(c => c.activo).length) + (res.clientes_detalle || []).length,
      }));
      setResultadoImport(res);
      setModalImport('resultado');
    } catch (e) {
      alert('Error de conexión al importar: ' + e.message);
    }
    setImportando(false);
  };

  const cerrarModalImport = () => {
    setModalImport(null);
    setCsvFilas([]);
    setCsvErrorParse('');
    setResultadoImport(null);
  };

  // Aplica CLABE asignada al state local
  const _aplicarClabe = (dataBase, alumnoId, clabe) => ({
    ...dataBase,
    clientes: dataBase.clientes.map(c => c.id === alumnoId ? {
      ...c,
      clabe_individual: clabe,
      clabe_individual_estado: 'activa',
      clabe_individual_fecha: new Date().toISOString().slice(0, 10)
    } : c)
  });

  // Genera una CLABE SPEI real en vivo vía Pagadetodo (antes tomaba la
  // primera CLABE libre de un pool subido a mano — ya no hace falta:
  // la pasarela con la que ya está conectado el sistema genera la CLABE
  // al momento).
  const asignarClabeDesdePool = async (alumno, dataBase) => {
    const eid = escuela_id || dataBase.escuelas?.[0]?.id;
    if (!eid || !alumno?.id) return;
    setClabeLoadingId(alumno.id);
    try {
      const res = await _apiPost('generar_clabe_individual', {
        alumno_id: alumno.id,
        matricula: alumno.matricula || '',
        nombre: alumno.nombre || '',
        email: alumno.email || '',
      });
      if (!res.success) {
        // Sin poder generar (u otro error) — guardamos el mensaje real del
        // servidor para mostrarlo, en vez de un "Error" genérico sin contexto.
        const upd = {
          ...dataBase,
          clientes: dataBase.clientes.map(c => c.id === alumno.id ? {
            ...c, clabe_individual_estado: 'error', clabe_individual_error_msg: res.error || 'No se pudo generar la CLABE SPEI'
          } : c)
        };
        setData(upd);
        AppModel.save(upd);
        return;
      }
      const conClabe = _aplicarClabe(dataBase, alumno.id, res.clabe);
      setData(conClabe);
      AppModel.save(conClabe);
    } catch (e) {
      console.error('Error al generar CLABE:', e.message);
    } finally {
      setClabeLoadingId(null);
    }
  };

  // Genera CLABEs SPEI reales en vivo vía Pagadetodo para TODOS los alumnos
  // activos de la escuela que todavía no tienen una — antes tomaba del pool
  // manual, ahora llama a la pasarela alumno por alumno (más lento porque
  // cada uno es una llamada de red real, pero ya no depende de tener CLABEs
  // pre-cargadas a mano). El backend regresa solo conteos (no toca cuál
  // CLABE le tocó a cuál alumno en la respuesta), así que al terminar se
  // refresca la página actual para ver los resultados.
  const asignarClabesMasivo = async () => {
    if (!escuela_id) return;
    if (!confirm('¿Generar una CLABE SPEI real para todos los alumnos activos que aún no tienen una? Esto llama a la pasarela de pagos y puede tardar según cuántos alumnos falten.')) return;
    setAsignandoClabesMasivo(true);
    try {
      const res = await _apiPost('generar_clabes_individual_masivo', { escuela_id });
      if (!res.success) {
        alert(res.error || 'No se pudieron generar las CLABEs.');
        return;
      }
      alert(res.mensaje || `Se generaron ${res.generadas} CLABEs.`);
      await buscarEnServidor(etiquetas.length ? etiquetas.join('|') : q, pagina);
    } catch (e) {
      alert('Error de conexión: ' + e.message);
    } finally {
      setAsignandoClabesMasivo(false);
    }
  };

  // Libera la CLABE del alumno y la devuelve al pool
  const liberarClabePool = async (alumno, dataBase) => {
    try {
      await _apiPost('liberar_clabe_pool', { cliente_id: alumno.id });
    } catch(e) { /* no bloquear */ }
    const upd = {
      ...dataBase,
      clientes: dataBase.clientes.map(c => c.id === alumno.id ? {
        ...c, clabe_individual: null, clabe_individual_estado: 'liberada'
      } : c)
    };
    setData(upd);
    AppModel.save(upd);
  };

  const guardar = async () => {
    if (!form.nombre) { alert('El nombre del alumno es requerido'); return; }
    const eid = escuela_id || (data.escuelas && data.escuelas[0]?.id);
    if (!eid) { alert('Selecciona una escuela antes de dar de alta alumnos'); return; }
    if (form.id) {
      try {
        const clienteActualizado = await ClienteController.editar(form);
        const newData = {
          ...data,
          clientes: data.clientes.map(c => c.id === clienteActualizado.id ? { ...c, ...clienteActualizado } : c)
        };
        setData(newData);
        AppModel.save(newData);
      } catch (e) { alert('Error al editar alumno: ' + e.message); }
      setModal(null);
      setForm(EMPTY);
      setQFamilia('');
      return;
    }
    // Alta nueva: registrar en DB, luego generar CLABE SPEI real automáticamente
    try {
      const alumnoNuevo = await ClienteController.agregar(form, eid);
      const newData = {
        ...data,
        clientes: [...data.clientes, {
          ...alumnoNuevo, activo: true, saldo_pendiente: 0, clabe_individual_estado: 'pendiente'
        }]
      };
      setData(newData);
      AppModel.save(newData);
      setModal(null);
      setForm(EMPTY);
      setQFamilia('');
      // Generar CLABE SPEI real de inmediato
      if (!sinFinanzas) await asignarClabeDesdePool(alumnoNuevo, newData); // [F4] la CLABE la genera quien ve cobranza
    } catch (e) { alert('Error al dar de alta alumno: ' + e.message); }
  };

  // ── [F1] Cambiar estatus del alumno ────────────────────────────────────────
  // Antes un solo botón alternaba activo/inactivo: no pedía motivo ni fecha,
  // si el servidor lo rechazaba igual lo marcaba en pantalla, y al dar de baja
  // liberaba la CLABE en automático (un SPEI posterior de la familia para
  // liquidar adeudos ya no se ligaba al alumno). Ahora abre el modal
  // AlumnoCambioEstatusModalF1 (al final de este archivo): estatus, motivo,
  // fecha y qué hacer con adeudos y CLABE, que por defecto se CONSERVAN. El
  // servidor (alumno_cambiar_estatus) hace todo en una transacción y deja
  // bitácora.
  const abrirCambioEstatus = cliente => setModalEstatus(cliente);
  const alCambiarEstatus = async res => {
    const actualizado = res.cliente || {};
    const cancelados = (res.cobros_cancelados || []).map(Number);
    const delta = res.estatus_nuevo === 'activo' ? 1 : (res.estatus_anterior === 'activo' ? -1 : 0);
    const newData = {
      ...data,
      clientes: data.clientes.map(c => c.id === actualizado.id ? { ...c, ...actualizado } : c),
      cobros: cancelados.length && Array.isArray(data.cobros)
        ? data.cobros.map(co => cancelados.includes(Number(co.id)) ? { ...co, estado: 'cancelado' } : co)
        : data.cobros,
      clientes_activos_total: typeof data.clientes_activos_total === 'number'
        ? data.clientes_activos_total + delta
        : data.clientes_activos_total,
    };
    setData(newData);
    AppModel.save(newData);
    // Reingreso de un alumno al que en su baja se le liberó la CLABE: se le
    // genera una nueva, como hacía el botón anterior. Si la conservó, nada.
    if (!sinFinanzas && res.estatus_nuevo === 'activo' && actualizado.id && !actualizado.clabe_individual) { // [F4]
      const alumnoActualizado = newData.clientes.find(c => c.id === actualizado.id);
      if (alumnoActualizado) await asignarClabeDesdePool(alumnoActualizado, newData);
    }
  };
  const regenerarClabe = async cliente => {
    await asignarClabeDesdePool(cliente, data);
  };
  const familiaDeAlumno = fid => fid ? data.familias.find(f => f.id === fid)?.nombre : null;
  const fmtCLABE = clabe => clabe ? clabe.match(/.{1,4}/g).join(' ') : '—';
  return _jsxDEV("div", {
    children: [
    // [F1] Modal "Cambiar estatus" (baja, egreso, traslado, reactivación).
    modalEstatus && _jsxDEV(AlumnoCambioEstatusModalF1, {
      alumno: modalEstatus,
      rol: rol,
      escuelaId: escuela_id || modalEstatus.escuela_id,
      apiPost: _apiPost,
      cobrosRespaldo: (data.cobros || []).filter(co => Number(co.cliente_id) === Number(modalEstatus.id) && co.estado === 'pendiente'),
      onCerrar: () => setModalEstatus(null),
      onGuardado: alCambiarEstatus
    }, 'f1-estatus-' + modalEstatus.id, false),
    // [F2] Expediente del alumno (views/components/ExpedienteAlumno.js). Al
    // guardar solo sincroniza los campos que ya viajan en cargar_datos; los
    // datos médicos se quedan dentro del modal.
    expediente && typeof ExpedienteAlumno !== 'undefined' && _jsxDEV(ExpedienteAlumno, {
      alumno: expediente,
      onCerrar: () => setExpediente(null),
      onActualizado: p => setData(prev => ({
        ...prev,
        clientes: (prev.clientes || []).map(x => String(x.id) === String(p.id) ? { ...x, ...p } : x)
      }))
    }, 'f2-expediente', false),
    // [OF-3] Becas del alumno y "Becas del colegio" (views/components/BecasAlumno.js).
    puedeBecas && becasAlumno && typeof BecasAlumno !== 'undefined' && _jsxDEV(BecasAlumno, {
      alumno: becasAlumno,
      productos: data.productos || [],
      onCerrar: () => setBecasAlumno(null)
    }, 'of3-becas-' + becasAlumno.id, false),
    puedeBecas && becasColegioAbierto && typeof BecasColegio !== 'undefined' && _jsxDEV(BecasColegio, {
      escuelaId: escuela_id,
      onCerrar: () => setBecasColegioAbierto(false)
    }, 'of3-becas-colegio', false),
    // [OF-5] Importar adeudos y saldos iniciales (views/components/ImportarSaldos.js). Solo admin y superadmin.
    puedeBecas && importarSaldosAbierto && typeof ImportarSaldos !== 'undefined' && _jsxDEV(ImportarSaldos, {
      escuelaId: escuela_id,
      onCerrar: () => setImportarSaldosAbierto(false)
    }, 'of5-importar-saldos', false),
    // [F4] Modal "Acceso del alumno" (crear la cuenta del portal, reenviar activación, desactivar).
    modalAcceso && _jsxDEV(AlumnoAccesoModalF4, {
      alumno: modalAcceso,
      escuelaId: escuela_id || modalAcceso.escuela_id,
      familia: (data.familias || []).find(f => f.id === modalAcceso.familia_id) || null,
      apiPost: _apiPost,
      onCerrar: () => setModalAcceso(null)
    }, 'f4-acceso-' + modalAcceso.id, false),
    ficha && typeof FichaTecnica !== 'undefined' && _jsxDEV(FichaTecnica, {
      puedeEditar: !soloLectura, // [F4] dirección no cambia la foto (subir_foto_cliente le daría 403)
      tipo: 'alumno',
      registro: ficha,
      extra: {
        // [F1] Sección "Historial" (bitácora alumno_movimientos) al pie de la
        // ficha. El cajero no la ve: su rol no tiene acceso a esa consulta.
        seccionExtra: rol !== 'cajero'
          ? _jsxDEV(HistorialAlumnoF1, { clienteId: ficha.id, apiPost: _apiPost }, 'f1-hist-' + ficha.id, false)
          : null,
        familia: (data.familias || []).find(f => f.id === ficha.familia_id) || null,
        saldo: ficha.saldo_pendiente || 0,
        saldoTexto: '$' + Number(ficha.saldo_pendiente || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })
      },
      onCerrar: () => setFicha(null),
      // La foto ya se subió como archivo real vía subir_foto_cliente.php
      // (llamado desde dentro de FichaTecnica) antes de invocar esto —
      // aquí solo se sincroniza el estado local, sin volver a escribir.
      onGuardarFoto: async url => {
        setFicha(f => f ? { ...f, foto_url: url } : f);
        setData(prev => ({
          ...prev,
          clientes: (prev.clientes || []).map(c => c.id === ficha.id ? { ...c, foto_url: url } : c)
        }));
        return { success: true };
      }
    }, 'ficha', false), _jsxDEV("div", {
      className: "card",
      children: [_jsxDEV("div", {
        className: "card-header",
        children: [_jsxDEV("div", {
          children: [_jsxDEV("div", {
            className: "card-title",
            children: "Alumnos"
          }, void 0, false), _jsxDEV("div", {
            className: "card-sub",
            children: [
              typeof data.clientes_activos_total === 'number' ? data.clientes_activos_total : data.clientes.filter(c => c.activo).length,
              " activos de ",
              typeof data.clientes_total === 'number' ? data.clientes_total : data.clientes.length
            ]
          }, void 0, true)]
        }, void 0, true), _jsxDEV("div", {
          style: { display: 'flex', gap: 8, flexWrap: 'wrap' },
          children: [puedeBecas && typeof BecasColegio !== 'undefined' && _jsxDEV("button", {
            className: "btn btn-secondary",
            disabled: !escuela_id,
            title: !escuela_id ? 'Selecciona una escuela arriba' : 'Todas las becas activas del colegio y el descuento mensual estimado', // [OF-3]
            onClick: () => setBecasColegioAbierto(true),
            children: "Becas del colegio"
          }, 'of3-becas-colegio-btn', false), puedeBecas && typeof ImportarSaldos !== 'undefined' && _jsxDEV("button", { // [OF-5]
            className: "btn btn-secondary",
            disabled: !escuela_id,
            title: !escuela_id ? 'Selecciona una escuela arriba' : 'Carga de un archivo lo que las familias ya deben al empezar a usar la plataforma',
            onClick: () => setImportarSaldosAbierto(true),
            children: "Importar adeudos"
          }, 'of5-importar-saldos-btn', false), !soloLectura && _jsxDEV("button", {
            className: "btn btn-secondary",
            disabled: !escuela_id,
            title: !escuela_id ? 'Selecciona una escuela arriba antes de importar' : undefined,
            onClick: () => {
              if (!escuela_id) {
                alert('Selecciona primero una escuela en el selector de arriba (estás en "Vista global").');
                return;
              }
              setModalImport('upload');
            },
            children: [_jsxDEV(Icon, { name: "download", size: 14, color: "currentColor" }, void 0, false), " Importar CSV"]
          }, void 0, true), !soloLectura && !sinFinanzas && _jsxDEV("button", {
            className: "btn btn-secondary",
            disabled: !escuela_id || asignandoClabesMasivo,
            title: !escuela_id ? 'Selecciona una escuela arriba' : 'Genera una CLABE SPEI real a todos los alumnos que aún no tienen una',
            onClick: asignarClabesMasivo,
            children: asignandoClabesMasivo
              ? _jsxDEV("span", { style: { display: 'flex', alignItems: 'center', gap: 6 }, children: [_jsxDEV("span", { className: "spinner", style: { width: 12, height: 12 } }, void 0, false), " Asignando…"] }, void 0, true)
              : "Generar CLABE a todos"
          }, void 0, true), !soloLectura && _jsxDEV("button", {
            className: "btn btn-primary",
            disabled: !escuela_id,
            title: !escuela_id ? 'Selecciona una escuela arriba antes de dar de alta un alumno' : undefined,
            onClick: () => {
              if (!escuela_id) {
                alert('Selecciona primero una escuela en el selector de arriba (estás en "Vista global").');
                return;
              }
              setForm(EMPTY);
              setQFamilia('');
              setModal('form');
            },
            children: "+ Alta de alumno"
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true), !escuela_id && _jsxDEV("div", {
        style: {
          marginBottom: 16,
          padding: '10px 12px',
          background: 'var(--amber-glow)',
          border: '1px solid rgba(245,158,11,.2)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 12.5,
          color: 'var(--ink-2)'
        },
        children: "Estás en \"Vista global\": selecciona una escuela en el selector de arriba para poder dar de alta alumnos."
      }, void 0, false), _jsxDEV("div", {
        style: {
          marginBottom: 16
        },
        children: _jsxDEV("div", {
          children: [_jsxDEV(BuscadorEtiquetas, {
            etiquetas: etiquetas,
            onCambio: setEtiquetas,
            placeholder: "Escribe un dato y presiona Enter…",
            sugerencias: ['nombre', 'matrícula', 'grado', 'correo', 'teléfono']
          }, void 0, false), buscando && _jsxDEV("span", {
            style: { fontSize: 12, color: 'var(--ink-3)', marginTop: 6, display: 'block' },
            children: "Buscando…"
          }, void 0, false),
          // [F1] Filtro por estatus del alumno (se aplica en el servidor).
          _jsxDEV("div", {
            style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12.5, color: 'var(--ink-3)' },
            children: [_jsxDEV("label", { htmlFor: 'f1-filtro-estatus', children: "Estatus:" }, void 0, false),
              _jsxDEV("select", {
                id: 'f1-filtro-estatus',
                className: "form-select",
                style: { width: 'auto', padding: '4px 28px 4px 8px', fontSize: 12.5 },
                value: estatusFiltro,
                onChange: e => setEstatusFiltro(e.target.value),
                children: alumnoFiltroEstatusOpcionesF1().map(o => _jsxDEV("option", { value: o[0], children: o[1] }, o[0], false))
              }, void 0, false)]
          }, void 0, true)]
        }, void 0, true)
      }, void 0, false), _jsxDEV("div", {
        className: "table-wrap cards-mobile",
        children: _jsxDEV("table", {
          children: [_jsxDEV("thead", {
            children: _jsxDEV("tr", {
              children: [_jsxDEV("th", {
                children: "Nombre"
              }, void 0, false), _jsxDEV("th", {
                children: "Matrícula"
              }, void 0, false), _jsxDEV("th", {
                children: "Grado"
              }, void 0, false), _jsxDEV("th", {
                children: "Familia"
              }, void 0, false), !sinFinanzas && _jsxDEV("th", {
                children: "CLABE SPEI individual"
              }, void 0, false), !sinFinanzas && _jsxDEV("th", {
                children: "Saldo pendiente"
              }, void 0, false), _jsxDEV("th", {
                children: "Estado"
              }, void 0, false), _jsxDEV("th", {
                children: "Acciones"
              }, void 0, false)]
            }, void 0, true)
          }, void 0, false), _jsxDEV("tbody", {
            children: [lista.length === 0 && _jsxDEV("tr", {
              children: _jsxDEV("td", {
                colSpan: sinFinanzas ? 6 : 8,
                children: _jsxDEV("div", {
                  className: "empty-state",
                  children: [_jsxDEV("div", {
                    className: "empty-icon",
                    children: _jsxDEV(Icon, {
                      name: "alumnos",
                      size: 36,
                      color: "currentColor"
                    }, void 0, false)
                  }, void 0, false), _jsxDEV("div", {
                    className: "empty-text",
                    children: "Sin alumnos"
                  }, void 0, false)]
                }, void 0, true)
              }, void 0, false)
            }, void 0, false), lista.map(c => _jsxDEV("tr", {
              style: {
                opacity: c.activo ? 1 : .5,
                cursor: 'pointer'
              },
              title: "Ver ficha técnica",
              // Abrir la ficha, salvo que el clic haya sido sobre un control
              // de la fila (botones de editar, desactivar, CLABE, etc.)
              onClick: e => {
                if (e.target.closest('button, a, input, select, label')) return;
                setFicha(c);
              },
              children: [_jsxDEV("td", {
                "data-label": "Nombre",
                children: _jsxDEV("div", {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10
                  },
                  children: [(typeof FotoPerfil !== 'undefined'
                    ? _jsxDEV(FotoPerfil, { url: c.foto_url, tam: 30, radio: '50%' }, 'foto', false)
                    : _jsxDEV("div", {
                        className: "avatar avatar-admin",
                        style: { width: 30, height: 30, fontSize: 11 },
                        children: c.nombre.charAt(0)
                      }, 'ini', false)), _jsxDEV("span", {
                    style: {
                      fontWeight: 500
                    },
                    children: c.nombre
                  }, void 0, false)]
                }, void 0, true)
              }, void 0, false), _jsxDEV("td", {
                "data-label": "Matrícula",
                children: _jsxDEV("span", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 12
                  },
                  children: c.matricula || '—'
                }, void 0, false)
              }, void 0, false), _jsxDEV("td", {
                "data-label": "Grado",
                style: {
                  color: 'var(--ink-3)',
                  fontSize: 12
                },
                children: c.grado || '—'
              }, void 0, false), _jsxDEV("td", {
                "data-label": "Familia",
                children: c.familia_id ? _jsxDEV("span", {
                  style: {
                    fontSize: 12,
                    color: 'var(--ink-2)'
                  },
                  children: [_jsxDEV(Icon, {
                    name: "familias",
                    size: 14,
                    color: "currentColor"
                  }, void 0, false), " ", familiaDeAlumno(c.familia_id)?.split(' ').slice(1).join(' ') || '—']
                }, void 0, true) : _jsxDEV("span", {
                  style: {
                    fontSize: 12,
                    color: 'var(--ink-4)'
                  },
                  children: "—"
                }, void 0, false)
              }, void 0, false), !sinFinanzas && _jsxDEV("td", {
                "data-label": "CLABE SPEI individual",
                children: clabeLoadingId === c.id ? _jsxDEV("span", {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11.5,
                    color: 'var(--ink-3)'
                  },
                  children: [_jsxDEV("span", {
                    className: "spinner",
                    style: {
                      width: 12,
                      height: 12
                    }
                  }, void 0, false), " Generando…"]
                }, void 0, true) : c.clabe_individual_estado === 'activa' && c.clabe_individual ? _jsxDEV("span", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 11.5,
                    color: 'var(--ink-2)',
                    letterSpacing: .5
                  },
                  title: `Asignada: ${c.clabe_individual_fecha || ''}`,
                  children: fmtCLABE(c.clabe_individual)
                }, void 0, false) : c.clabe_individual_estado === 'liberada' ? _jsxDEV("div", {
                  style: { display: 'flex', alignItems: 'center', gap: 6 },
                  children: [_jsxDEV("span", {
                    style: { fontSize: 11.5, color: 'var(--ink-4)' },
                    children: "Sin CLABE"
                  }, void 0, false), _jsxDEV("button", {
                    className: "btn btn-primary btn-sm",
                    style: { fontSize: 10.5, padding: '2px 8px' },
                    onClick: e => { e.stopPropagation(); asignarClabeDesdePool(c, data); },
                    title: "Generar CLABE SPEI",
                    children: "Asignar"
                  }, void 0, false)]
                }, void 0, false) : c.clabe_individual_estado === 'error' ? _jsxDEV("span", {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  },
                  title: c.clabe_individual_error_msg || 'No hay CLABEs SPEI disponibles',
                  children: [_jsxDEV("span", {
                    style: {
                      fontSize: 11.5,
                      color: 'var(--red)'
                    },
                    children: [_jsxDEV(Icon, {
                      name: "warning",
                      size: 12,
                      color: "currentColor"
                    }, void 0, false), " ", c.clabe_individual_error_msg || 'No hay CLABEs SPEI disponibles']
                  }, void 0, true), _jsxDEV("button", {
                    className: "btn btn-ghost btn-sm",
                    style: {
                      padding: '2px 6px',
                      fontSize: 11
                    },
                    onClick: () => regenerarClabe(c),
                    children: "Reintentar"
                  }, void 0, false)]
                }, void 0, true) : c.activo ? _jsxDEV("span", {
                  style: {
                    fontSize: 11.5,
                    color: 'var(--ink-4)'
                  },
                  children: ["Pendiente", _jsxDEV("button", {
                    className: "btn btn-ghost btn-sm",
                    style: {
                      padding: '2px 6px',
                      fontSize: 11,
                      marginLeft: 6
                    },
                    onClick: () => regenerarClabe(c),
                    children: "Generar"
                  }, void 0, false)]
                }, void 0, true) : _jsxDEV("span", {
                  style: {
                    fontSize: 11.5,
                    color: 'var(--ink-4)'
                  },
                  children: "—"
                }, void 0, false)
              }, void 0, false), !sinFinanzas && _jsxDEV("td", {
                "data-label": "Saldo pendiente",
                children: c.saldo_pendiente > 0 ? _jsxDEV("span", {
                  style: {
                    color: 'var(--red)',
                    fontFamily: 'var(--mono)',
                    fontWeight: 600,
                    fontSize: 13
                  },
                  children: fmt(c.saldo_pendiente)
                }, void 0, false) : _jsxDEV("span", {
                  style: {
                    color: 'var(--green)',
                    fontSize: 12
                  },
                  children: [_jsxDEV(Icon, {
                    name: "check",
                    size: 11,
                    color: "currentColor"
                  }, void 0, false), " Al corriente"]
                }, void 0, true)
              }, void 0, false), _jsxDEV("td", {
                "data-label": "Estado",
                // [F1] Estatus con detalle (antes solo Activo/Inactivo).
                children: alumnoBadgeEstatusF1(c)
              }, void 0, false), _jsxDEV("td", {
                "data-label": "Acciones",
                children: (!puedeEditar && !soloLectura) ? _jsxDEV("span", {
                  style: { fontSize: 11, color: 'var(--ink-4)' },
                  children: "Sin edición"
                }, void 0, false) : _jsxDEV("div", {
                  style: {
                    display: 'flex',
                    gap: 5
                  },
                  children: [puedeEditar && _jsxDEV("button", {
                    className: "btn btn-ghost btn-sm",
                    onClick: () => {
                      setForm({
                        ...EMPTY,
                        ...c
                      });
                      setQFamilia('');
                      setModal('form');
                    },
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    },
                    children: _jsxDEV(Icon, {
                      name: "edit",
                      size: 14,
                      color: "currentColor"
                    }, void 0, false)
                  }, void 0, false), puedeEditar && _jsxDEV("button", {
                    className: "btn btn-ghost btn-sm",
                    // [F1] Abre el modal "Cambiar estatus" (antes: toggle que liberaba la CLABE).
                    onClick: () => abrirCambioEstatus(c),
                    title: c.activo ? 'Cambiar estatus: baja, egreso o traslado' : 'Cambiar estatus: reactivar o corregir la baja',
                    children: c.activo ? _jsxDEV(Icon, {
                      name: "shield",
                      size: 14,
                      color: "currentColor"
                    }, void 0, false) : _jsxDEV(Icon, {
                      name: "eyeOff",
                      size: 14,
                      color: "currentColor"
                    }, void 0, false)
                  }, void 0, false),
                  // [F2] Expediente (datos médicos, tutores, documentos). El
                  // servidor vuelve a validar rol y escuela en cada acción.
                  typeof ExpedienteAlumno !== 'undefined' && typeof expedientePuedeVer === 'function' && expedientePuedeVer(rol) && _jsxDEV("button", {
                    className: "btn btn-ghost btn-sm",
                    onClick: () => setExpediente(c),
                    title: "Expediente: datos personales y médicos, tutores y documentos",
                    style: { fontSize: 11.5 },
                    children: "Expediente"
                  }, 'f2-exp', false),
                  // [OF-3] Becas del alumno (solo admin y superadmin).
                  puedeBecas && typeof BecasAlumno !== 'undefined' && _jsxDEV("button", {
                    className: "btn btn-ghost btn-sm",
                    onClick: () => setBecasAlumno(c),
                    title: "Becas y descuentos guardados en el alumno",
                    style: { fontSize: 11.5 },
                    children: "Becas"
                  }, 'of3-becas', false),
                  // [F4] Cuenta de acceso del alumno al portal (crear, reenviar activación, desactivar).
                  puedeAccesoAlumno && c.activo && _jsxDEV("button", {
                    className: "btn btn-ghost btn-sm",
                    onClick: () => setModalAcceso(c),
                    title: "Crear o administrar la cuenta con la que el alumno entra a su portal",
                    style: { fontSize: 11.5 },
                    children: "Acceso del alumno"
                  }, 'f4-acceso', false)]
                }, void 0, true)
              }, void 0, false)]
            }, c.id, true))]
          }, void 0, true)]
        }, void 0, true)
      }, void 0, false), totalPaginas > 1 && _jsxDEV("div", {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          flexWrap: 'wrap',
          gap: 10,
          marginTop: 12,
          fontSize: 13,
          color: 'var(--ink-3)',
        },
        children: [
          _jsxDEV("span", {
            children: `Página ${pagina} de ${totalPaginas} · ${totalAlumnos} alumnos`
          }, void 0, false),
          _jsxDEV("button", {
            className: "btn btn-ghost btn-sm",
            disabled: pagina <= 1 || buscando,
            onClick: () => irAPagina(pagina - 1),
            children: "‹ Anterior"
          }, void 0, false),
          _jsxDEV("button", {
            className: "btn btn-ghost btn-sm",
            disabled: pagina >= totalPaginas || buscando,
            onClick: () => irAPagina(pagina + 1),
            children: "Siguiente ›"
          }, void 0, false),
        ],
      }, void 0, true)]
    }, void 0, true), modal === 'form' && _jsxDEV("div", {
      className: "modal-backdrop",
      onClick: e => e.target === e.currentTarget && setModal(null),
      children: _jsxDEV("div", {
        className: "modal modal-lg",
        children: [_jsxDEV("div", {
          className: "modal-header",
          children: [_jsxDEV("div", {
            className: "modal-title",
            children: form.id ? 'Editar alumno' : 'Alta de alumno'
          }, void 0, false), _jsxDEV("button", {
            className: "btn btn-ghost btn-sm",
            onClick: () => setModal(null),
            children: _jsxDEV(Icon, {
              name: "close",
              size: 16,
              color: "currentColor"
            }, void 0, false)
          }, void 0, false)]
        }, void 0, true), _jsxDEV("div", {
          className: "modal-body",
          children: [_jsxDEV("div", {
            style: {
              fontSize: 11,
              color: 'var(--ink-4)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '.4px',
              marginBottom: 10
            },
            children: "Datos generales"
          }, void 0, false), _jsxDEV("div", {
            className: "form-group",
            style: { position: 'relative' },
            children: [_jsxDEV("label", {
              className: "form-label",
              children: "Familia (opcional)"
            }, void 0, false), _jsxDEV("input", {
              className: "form-input",
              placeholder: "Buscar familia por nombre…",
              value: qFamilia,
              onChange: e => { setQFamilia(e.target.value); setFamiliaAbierta(true); },
              onFocus: () => setFamiliaAbierta(true),
              onBlur: () => setTimeout(() => setFamiliaAbierta(false), 150),
            }, void 0, false), form.familia_id && !familiaAbierta && _jsxDEV("div", {
              style: { fontSize: 12, color: 'var(--ink-3)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 },
              children: [_jsxDEV(Icon, {
                name: "escuelas",
                size: 14,
                color: "var(--lime)",
                style: { display: 'inline' }
              }, void 0, false), "Seleccionada: ", data.familias.find(f => f.id === form.familia_id)?.nombre, _jsxDEV("button", {
                type: "button",
                className: "btn btn-ghost btn-sm",
                style: { padding: '2px 8px', fontSize: 11 },
                onClick: () => { setForm(f => ({ ...f, familia_id: null })); setQFamilia(''); },
                children: "Quitar"
              }, void 0, false)]
            }, void 0, true), familiaAbierta && _jsxDEV("div", {
              style: {
                position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0,
                marginTop: 4, maxHeight: 220, overflowY: 'auto',
                background: 'var(--bg-2, #17181c)', border: '1px solid var(--glass-light)',
                borderRadius: 'var(--radius-sm)', boxShadow: '0 8px 24px rgba(0,0,0,.35)'
              },
              children: familiasFiltradas.length === 0 ? _jsxDEV("div", {
                style: { padding: 12, fontSize: 12.5, color: 'var(--ink-3)' },
                children: "Sin coincidencias"
              }, void 0, false) : familiasFiltradas.map(({ fam, exacta }) => _jsxDEV("div", {
                onMouseDown: () => { setForm(f => ({ ...f, familia_id: fam.id })); setQFamilia(''); setFamiliaAbierta(false); },
                style: {
                  padding: '9px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 13, borderBottom: '1px solid var(--glass-light)'
                },
                children: [exacta && _jsxDEV(Icon, {
                  name: "escuelas",
                  size: 16,
                  color: "var(--lime)",
                  style: { display: 'inline' }
                }, void 0, false), _jsxDEV("span", {
                  children: fam.nombre
                }, void 0, false)]
              }, fam.id, true))
            }, void 0, false)]
          }, void 0, true), _jsxDEV("div", {
            className: "form-group",
            children: [_jsxDEV("label", {
              className: "form-label",
              children: "Nombre completo *"
            }, void 0, false), _jsxDEV("input", {
              className: "form-input",
              placeholder: "Nombre completo",
              value: form.nombre,
              onChange: e => setForm(f => ({
                ...f,
                nombre: e.target.value
              }))
            }, void 0, false)]
          }, void 0, true), _jsxDEV("div", {
            style: {
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
              gap: 12
            },
            children: [_jsxDEV("div", {
              className: "form-group",
              children: [_jsxDEV("label", {
                className: "form-label",
                children: "Grado / Grupo"
              }, void 0, false), _jsxDEV("input", {
                className: "form-input",
                placeholder: "3° Primaria",
                value: form.grado,
                onChange: e => setForm(f => ({
                  ...f,
                  grado: e.target.value
                }))
              }, void 0, false)]
            }, void 0, true), _jsxDEV("div", {
              className: "form-group",
              children: [_jsxDEV("label", {
                className: "form-label",
                children: "Matrícula"
              }, void 0, false), _jsxDEV("input", {
                className: "form-input",
                placeholder: "ITM-2024-001",
                value: form.matricula,
                onChange: e => setForm(f => ({
                  ...f,
                  matricula: e.target.value.toUpperCase()
                })),
                style: {
                  fontFamily: 'var(--mono)'
                }
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true), _jsxDEV("div", {
            className: "form-group",
            children: [_jsxDEV("label", {
              className: "form-label",
              children: "CURP"
            }, void 0, false), _jsxDEV("input", {
              className: "form-input",
              placeholder: "GALA090315MDFPNB08",
              value: form.curp,
              onChange: e => setForm(f => ({
                ...f,
                curp: e.target.value.toUpperCase()
              })),
              style: {
                fontFamily: 'var(--mono)'
              }
            }, void 0, false)]
          }, void 0, true), _jsxDEV("div", {
            style: {
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
              gap: 12
            },
            children: [_jsxDEV("div", {
              className: "form-group",
              children: [_jsxDEV("label", {
                className: "form-label",
                children: "Correo electrónico"
              }, void 0, false), _jsxDEV("input", {
                className: "form-input",
                type: "email",
                placeholder: "correo@mail.com",
                value: form.email,
                onChange: e => setForm(f => ({
                  ...f,
                  email: e.target.value
                }))
              }, void 0, false)]
            }, void 0, true), _jsxDEV("div", {
              className: "form-group",
              children: [_jsxDEV("label", {
                className: "form-label",
                children: "Teléfono"
              }, void 0, false), _jsxDEV("input", {
                className: "form-input",
                placeholder: "9991234567",
                value: form.tel,
                onChange: e => setForm(f => ({
                  ...f,
                  tel: e.target.value
                })),
                style: {
                  fontFamily: 'var(--mono)'
                }
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true), _jsxDEV("div", {
            style: {
              marginTop: 18,
              paddingTop: 14,
              borderTop: '1px solid var(--border-glow)'
            },
            children: [_jsxDEV("div", {
              style: {
                fontSize: 11,
                color: 'var(--ink-4)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '.4px',
                marginBottom: 10
              },
              children: "Dirección"
            }, void 0, false), _jsxDEV("div", {
              className: "form-group",
              children: [_jsxDEV("label", {
                className: "form-label",
                children: "Domicilio del alumno"
              }, void 0, false), _jsxDEV("input", {
                className: "form-input",
                placeholder: "Calle, Número, Colonia, Ciudad, Estado, CP",
                value: form.direccion || '',
                onChange: e => setForm(f => ({
                  ...f,
                  direccion: e.target.value
                }))
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true), _jsxDEV("div", {
            style: {
              marginTop: 18,
              paddingTop: 14,
              borderTop: '1px solid var(--border-glow)'
            },
            children: [_jsxDEV("div", {
              style: {
                fontSize: 11,
                color: 'var(--ink-4)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '.4px',
                marginBottom: 10
              },
              children: "Contacto de emergencia"
            }, void 0, false), _jsxDEV("div", {
              style: {
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
                gap: 12
              },
              children: [_jsxDEV("div", {
                className: "form-group",
                children: [_jsxDEV("label", {
                  className: "form-label",
                  children: "Nombre del contacto"
                }, void 0, false), _jsxDEV("input", {
                  className: "form-input",
                  placeholder: "Nombre del familiar",
                  value: form.contacto_emergencia || '',
                  onChange: e => setForm(f => ({
                    ...f,
                    contacto_emergencia: e.target.value
                  }))
                }, void 0, false)]
              }, void 0, true), _jsxDEV("div", {
                className: "form-group",
                children: [_jsxDEV("label", {
                  className: "form-label",
                  children: "Teléfono de emergencia"
                }, void 0, false), _jsxDEV("input", {
                  className: "form-input",
                  placeholder: "9991234567",
                  value: form.tel_emergencia || '',
                  onChange: e => setForm(f => ({
                    ...f,
                    tel_emergencia: e.target.value
                  })),
                  style: {
                    fontFamily: 'var(--mono)'
                  }
                }, void 0, false)]
              }, void 0, true)]
            }, void 0, true)]
          }, void 0, true), _jsxDEV("div", {
            style: {
              marginTop: 18,
              paddingTop: 14,
              borderTop: '1px solid var(--border-glow)'
            },
            children: [_jsxDEV("div", {
              style: {
                fontSize: 11,
                color: 'var(--ink-4)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '.4px',
                marginBottom: 6
              },
              children: "Digitalización de documentos oficiales"
            }, void 0, false), _jsxDEV("div", {
              style: {
                marginBottom: 12,
                padding: '8px 12px',
                background: 'var(--accent-glow)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 11.5,
                color: 'var(--ink-2)',
                lineHeight: 1.6
              },
              children: [_jsxDEV(Icon, {
                name: "bank",
                size: 13,
                color: "currentColor"
              }, void 0, false), " Pega la URL o ruta del documento digitalizado (Google Drive, servidor, etc.)"]
            }, void 0, true), _jsxDEV("div", {
              style: {
                display: 'grid',
                gridTemplateColumns: '1fr',
                gap: 10
              },
              children: [_jsxDEV("div", {
                className: "form-group",
                children: [_jsxDEV("label", {
                  className: "form-label",
                  children: "CURP (documento PDF/imagen)"
                }, void 0, false), _jsxDEV("input", {
                  className: "form-input",
                  placeholder: "https://drive.google.com/…",
                  value: form.doc_curp_url || '',
                  onChange: e => setForm(f => ({
                    ...f,
                    doc_curp_url: e.target.value
                  })),
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 12
                  }
                }, void 0, false)]
              }, void 0, true), _jsxDEV("div", {
                className: "form-group",
                children: [_jsxDEV("label", {
                  className: "form-label",
                  children: "Acta de nacimiento"
                }, void 0, false), _jsxDEV("input", {
                  className: "form-input",
                  placeholder: "https://drive.google.com/…",
                  value: form.doc_acta_url || '',
                  onChange: e => setForm(f => ({
                    ...f,
                    doc_acta_url: e.target.value
                  })),
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 12
                  }
                }, void 0, false)]
              }, void 0, true), _jsxDEV("div", {
                className: "form-group",
                children: [_jsxDEV("label", {
                  className: "form-label",
                  children: "INE / Identificación oficial del padre/tutor"
                }, void 0, false), _jsxDEV("input", {
                  className: "form-input",
                  placeholder: "https://drive.google.com/…",
                  value: form.doc_ine_tutor_url || '',
                  onChange: e => setForm(f => ({
                    ...f,
                    doc_ine_tutor_url: e.target.value
                  })),
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 12
                  }
                }, void 0, false)]
              }, void 0, true)]
            }, void 0, true), _jsxDEV("div", {
              style: {
                display: 'flex',
                gap: 16,
                marginTop: 6,
                flexWrap: 'wrap'
              },
              children: [form.doc_curp_url && _jsxDEV("a", {
                href: form.doc_curp_url,
                target: "_blank",
                rel: "noopener noreferrer",
                className: "btn btn-ghost btn-sm",
                style: {
                  fontSize: 11
                },
                children: [_jsxDEV(Icon, {
                  name: "eye",
                  size: 12,
                  color: "currentColor"
                }, void 0, false), " Ver CURP"]
              }, void 0, true), form.doc_acta_url && _jsxDEV("a", {
                href: form.doc_acta_url,
                target: "_blank",
                rel: "noopener noreferrer",
                className: "btn btn-ghost btn-sm",
                style: {
                  fontSize: 11
                },
                children: [_jsxDEV(Icon, {
                  name: "eye",
                  size: 12,
                  color: "currentColor"
                }, void 0, false), " Ver Acta"]
              }, void 0, true), form.doc_ine_tutor_url && _jsxDEV("a", {
                href: form.doc_ine_tutor_url,
                target: "_blank",
                rel: "noopener noreferrer",
                className: "btn btn-ghost btn-sm",
                style: {
                  fontSize: 11
                },
                children: [_jsxDEV(Icon, {
                  name: "eye",
                  size: 12,
                  color: "currentColor"
                }, void 0, false), " Ver INE"]
              }, void 0, true)]
            }, void 0, true)]
          }, void 0, true), !form.id && _jsxDEV("div", {
            style: {
              marginTop: 16,
              padding: '8px 12px',
              background: 'var(--accent-glow)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 11.5,
              color: 'var(--ink-2)',
              lineHeight: 1.6
            },
            children: [_jsxDEV(Icon, {
              name: "bank",
              size: 13,
              color: "currentColor"
            }, void 0, false), " Al guardar, se generará automáticamente una CLABE SPEI individual para este alumno."]
          }, void 0, true)]
        }, void 0, true), _jsxDEV("div", {
          className: "modal-footer",
          children: [_jsxDEV("button", {
            className: "btn btn-secondary",
            onClick: () => setModal(null),
            children: "Cancelar"
          }, void 0, false), _jsxDEV("button", {
            className: "btn btn-primary",
            onClick: guardar,
            disabled: !form.nombre,
            children: "Guardar"
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true)
    }, void 0, false), modalImport === 'upload' && _jsxDEV("div", {
      className: "modal-backdrop",
      onClick: e => e.target === e.currentTarget && cerrarModalImport(),
      children: _jsxDEV("div", {
        className: "modal",
        children: [_jsxDEV("div", {
          className: "modal-header",
          children: [_jsxDEV("div", { className: "modal-title", children: "Importar alumnos por CSV" }, void 0, false),
          _jsxDEV("button", { className: "btn btn-ghost btn-sm", onClick: cerrarModalImport, children: _jsxDEV(Icon, { name: "close", size: 16, color: "currentColor" }, void 0, false) }, void 0, false)]
        }, void 0, true), _jsxDEV("div", {
          className: "modal-body",
          children: [_jsxDEV("div", {
            style: { fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 14 },
            children: ["Cada fila del CSV es un alumno. Si dos filas comparten el mismo ", _jsxDEV("strong", { children: "tutor_email" }, void 0, false), ", se agrupan como hermanos de la misma familia — y si ese correo no tiene cuenta todavía, se crea una automáticamente con contraseña temporal."]
          }, void 0, true), _jsxDEV("button", {
            className: "btn btn-secondary btn-sm",
            style: { marginBottom: 16 },
            onClick: descargarPlantillaCSV,
            children: [_jsxDEV(Icon, { name: "download", size: 13, color: "currentColor" }, void 0, false), " Descargar plantilla de ejemplo"]
          }, void 0, true), _jsxDEV("div", {
            style: { fontSize: 11.5, color: 'var(--ink-4)', marginBottom: 10 },
            children: ["Columnas: ", CSV_COLUMNAS.join(', '), ". Solo ", _jsxDEV("strong", { children: "alumno_nombre" }, void 0, false), " es obligatoria."]
          }, void 0, true), _jsxDEV("input", {
            type: "file", accept: ".csv,text/csv", onChange: onArchivoCSV,
            className: "form-input"
          }, void 0, false), csvErrorParse && _jsxDEV("div", {
            style: { fontSize: 12.5, color: 'var(--red)', marginTop: 10 },
            children: csvErrorParse
          }, void 0, false)]
        }, void 0, true), _jsxDEV("div", {
          className: "modal-footer",
          children: _jsxDEV("button", { className: "btn btn-secondary", onClick: cerrarModalImport, children: "Cerrar" }, void 0, false)
        }, void 0, true)]
      }, void 0, true)
    }, void 0, false), modalImport === 'preview' && _jsxDEV("div", {
      className: "modal-backdrop",
      children: _jsxDEV("div", {
        className: "modal modal-lg",
        children: [_jsxDEV("div", {
          className: "modal-header",
          children: [_jsxDEV("div", { className: "modal-title", children: ["Revisar antes de importar (", csvFilas.length, " filas)"] }, void 0, true),
          _jsxDEV("button", { className: "btn btn-ghost btn-sm", onClick: cerrarModalImport, children: _jsxDEV(Icon, { name: "close", size: 16, color: "currentColor" }, void 0, false) }, void 0, false)]
        }, void 0, true), _jsxDEV("div", {
          className: "modal-body",
          children: _jsxDEV("div", {
            className: "table-wrap",
            style: { maxHeight: 380, overflowY: 'auto' },
            children: _jsxDEV("table", {
              className: "table",
              children: [_jsxDEV("thead", {
                children: _jsxDEV("tr", { children: CSV_COLUMNAS.map(c => _jsxDEV("th", { children: c }, c, false)) }, void 0, false)
              }, void 0, false), _jsxDEV("tbody", {
                children: csvFilas.slice(0, 200).map((f, i) => _jsxDEV("tr", {
                  children: CSV_COLUMNAS.map(c => _jsxDEV("td", { style: { fontSize: 12 }, children: f[c] || '—' }, c, false))
                }, i, true))
              }, void 0, false)]
            }, void 0, true)
          }, void 0, false)
        }, void 0, true), csvFilas.length > 200 && _jsxDEV("div", {
          style: { fontSize: 11.5, color: 'var(--ink-4)', padding: '0 20px' },
          children: ["Mostrando las primeras 200 de ", csvFilas.length, " filas — se importarán todas."]
        }, void 0, true), _jsxDEV("div", {
          className: "modal-footer",
          children: [_jsxDEV("button", { className: "btn btn-secondary", onClick: () => setModalImport('upload'), children: "Atrás" }, void 0, false),
          _jsxDEV("button", { className: "btn btn-primary", disabled: importando, onClick: confirmarImportacion, children: importando ? 'Importando…' : `Importar ${csvFilas.length} alumno(s)` }, void 0, false)]
        }, void 0, true)]
      }, void 0, true)
    }, void 0, false), modalImport === 'resultado' && resultadoImport && _jsxDEV("div", {
      className: "modal-backdrop",
      children: _jsxDEV("div", {
        className: "modal",
        children: [_jsxDEV("div", {
          className: "modal-header",
          children: _jsxDEV("div", { className: "modal-title", children: "Importación completada" }, void 0, false)
        }, void 0, false), _jsxDEV("div", {
          className: "modal-body",
          children: [_jsxDEV("div", {
            style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 },
            children: [_jsxDEV("span", { className: "badge badge-green", children: [resultadoImport.alumnos_creados, " alumnos creados"] }, void 0, true),
            _jsxDEV("span", { className: "badge badge-blue", children: [resultadoImport.familias_creadas, " familias nuevas"] }, void 0, true),
            _jsxDEV("span", { className: "badge badge-gray", children: [resultadoImport.familias_reutilizadas, " familias reutilizadas"] }, void 0, true),
            resultadoImport.errores.length > 0 && _jsxDEV("span", { className: "badge badge-red", children: [resultadoImport.errores.length, " con error"] }, void 0, true)]
          }, void 0, true), resultadoImport.cuentas_creadas.length > 0 && _jsxDEV("div", {
            style: { marginBottom: 14 },
            children: [_jsxDEV("div", { style: { fontWeight: 600, fontSize: 13, marginBottom: 6 }, children: "Cuentas de acceso nuevas — a cada tutor se le mandó (o falta compartir) su enlace para activar su cuenta:" }, void 0, false),
            _jsxDEV("div", { className: "table-wrap", style: { maxHeight: 200, overflowY: 'auto' }, children: _jsxDEV("table", { className: "table", children: [
              _jsxDEV("thead", { children: _jsxDEV("tr", { children: [_jsxDEV("th", { children: "Tutor" }, void 0, false), _jsxDEV("th", { children: "Correo" }, void 0, false), _jsxDEV("th", { children: "Estado" }, void 0, false)] }, void 0, true) }, void 0, false),
              _jsxDEV("tbody", { children: resultadoImport.cuentas_creadas.map((c, i) => _jsxDEV("tr", { children: [
                _jsxDEV("td", { style: { fontSize: 12.5 }, children: c.nombre || '—' }, void 0, false),
                _jsxDEV("td", { style: { fontSize: 12.5 }, children: c.email }, void 0, false),
                _jsxDEV("td", { style: { fontSize: 12.5 }, children: c.correo_enviado
                  ? _jsxDEV("span", { className: "badge badge-green", children: "Correo enviado" }, void 0, false)
                  : _jsxDEV("div", { style: { display: 'flex', gap: 6, alignItems: 'center' }, children: [
                      _jsxDEV("span", { className: "badge badge-gray", children: "Comparte el enlace" }, void 0, false),
                      _jsxDEV("button", {
                        type: 'button',
                        className: 'btn btn-secondary',
                        style: { fontSize: 11, padding: '2px 8px' },
                        onClick: () => navigator.clipboard && navigator.clipboard.writeText(c.activacion_liga || ''),
                        children: 'Copiar enlace'
                      }, void 0, false)
                    ] }, void 0, true)
                } , void 0, false)
              ] }, i, true)) }, void 0, false)
            ] }, void 0, true) }, void 0, false)]
          }, void 0, true), resultadoImport.errores.length > 0 && _jsxDEV("div", {
            children: [_jsxDEV("div", { style: { fontWeight: 600, fontSize: 13, marginBottom: 6, color: 'var(--red)' }, children: "Filas no importadas:" }, void 0, false),
            _jsxDEV("div", { style: { maxHeight: 160, overflowY: 'auto' }, children: resultadoImport.errores.map((er, i) => _jsxDEV("div", {
              style: { fontSize: 12, color: 'var(--ink-2)', padding: '4px 0', borderBottom: '1px solid var(--glass-light)' },
              children: ["Fila ", er.fila, ": ", er.error]
            }, i, true)) }, void 0, false)]
          }, void 0, true)]
        }, void 0, true), _jsxDEV("div", {
          className: "modal-footer",
          children: _jsxDEV("button", { className: "btn btn-primary", onClick: cerrarModalImport, children: "Cerrar" }, void 0, false)
        }, void 0, true)]
      }, void 0, true)
    }, void 0, false)]
  }, void 0, true);
}


// ═══════════════════════════════════════════════════════════════════════════
// [F1] Ciclo de vida del alumno: estatus, modal "Cambiar estatus" e historial.
// Espejo en el navegador de ALUMNO_ESTATUS / ALUMNO_TRANSICIONES de
// lib/helpers_alumnos.php: si cambia allá, cambia aquí.
// ═══════════════════════════════════════════════════════════════════════════
var ALUMNO_ESTATUS_INFO = {
  activo:          { etiqueta: 'Activo',          badge: 'badge-green' },
  baja_temporal:   { etiqueta: 'Baja temporal',   badge: 'badge-amber' },
  baja_definitiva: { etiqueta: 'Baja definitiva', badge: 'badge-red' },
  egresado:        { etiqueta: 'Egresado',        badge: 'badge-blue' },
  traslado:        { etiqueta: 'Traslado',        badge: 'badge-purple' }
};
var ALUMNO_TRANSICIONES_F1 = {
  activo:          ['baja_temporal', 'baja_definitiva', 'egresado', 'traslado'],
  baja_temporal:   ['activo', 'baja_definitiva', 'traslado'],
  baja_definitiva: ['activo', 'traslado'],
  traslado:        ['activo', 'baja_definitiva'],
  egresado:        ['activo']
};
var ALUMNO_MOVIMIENTO_ETIQUETA_F1 = {
  alta: 'Alta', edicion: 'Edición de datos', baja_temporal: 'Baja temporal',
  baja_definitiva: 'Baja definitiva', egreso: 'Egreso', traslado: 'Traslado',
  reactivacion: 'Reactivación', cambio_grado: 'Cambio de grado',
  reinscripcion: 'Reinscripción', cambio_grupo: 'Cambio de grupo'
};

// Misma regla que alumno_estatus_de_fila() del servidor: manda `activo`; sin la
// columna `estatus` (migración sin correr) un inactivo se trata como baja temporal.
function alumnoEstatusDeF1(c) {
  if (!c) return 'activo';
  if (c.activo) return 'activo';
  return (c.estatus && c.estatus !== 'activo' && ALUMNO_ESTATUS_INFO[c.estatus]) ? c.estatus : 'baja_temporal';
}

function alumnoBadgeEstatusF1(c) {
  var est = alumnoEstatusDeF1(c);
  var info = ALUMNO_ESTATUS_INFO[est];
  var detalle = est !== 'activo'
    ? [c.estatus_fecha ? 'Desde ' + String(c.estatus_fecha).slice(0, 10) : '', c.estatus_motivo || ''].filter(Boolean).join(' · ')
    : '';
  return _jsxDEV("span", { className: 'badge ' + info.badge, title: detalle || undefined, children: info.etiqueta }, void 0, false);
}

// [valor del filtro, etiqueta]. Los valores los entiende cargar_datos.php
// ('activo' y 'inactivos' filtran por `activo`, funcionan sin la migración).
function alumnoFiltroEstatusOpcionesF1() {
  return [
    ['', 'Todos'],
    ['activo', 'Activos'],
    ['inactivos', 'Bajas, egresados y traslados'],
    ['baja_temporal', '— Baja temporal'],
    ['baja_definitiva', '— Baja definitiva'],
    ['egresado', '— Egresados'],
    ['traslado', '— Traslados']
  ];
}

function _alumnoFechaHoyF1() {
  var d = new Date();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + dd;
}
function _alumnoMontoF1(n) {
  return '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
}

// Modal "Cambiar estatus". Llama alumno_cambiar_estatus (todo o nada en el
// servidor) y entrega la respuesta a onGuardado. Por defecto NO se cancela
// ningún adeudo y la CLABE se conserva: se decide caso por caso.
function AlumnoCambioEstatusModalF1({ alumno, rol, apiPost, cobrosRespaldo, onCerrar, onGuardado }) {
  const { useState, useEffect } = React;
  const actual = alumnoEstatusDeF1(alumno);
  const destinos = ALUMNO_TRANSICIONES_F1[actual] || [];
  const puedeDinero = rol === 'admin' || rol === 'superadmin';
  const [estatus, setEstatus] = useState(destinos[0] || '');
  const [motivo, setMotivo] = useState('');
  const [fecha, setFecha] = useState(_alumnoFechaHoyF1());
  const [pendientes, setPendientes] = useState(null); // null = cargando
  const [avisoPend, setAvisoPend] = useState('');
  const [cancelar, setCancelar] = useState({});
  const [clabe, setClabe] = useState('conservar');
  const [sacar, setSacar] = useState(true);
  const [sacarTocado, setSacarTocado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const reactivar = estatus === 'activo';
  // Los adeudos y la CLABE solo se tocan al dar de baja a un alumno activo.
  const mostrarAdeudos = puedeDinero && !reactivar && actual === 'activo';

  // Cobros pendientes del alumno (TODOS, no solo los últimos 90 días de data.cobros).
  useEffect(() => {
    if (!mostrarAdeudos) { setPendientes([]); return; }
    let vivo = true;
    apiPost('alumno_cobros_pendientes', { cliente_id: alumno.id }).then(res => {
      if (!vivo) return;
      if (res && res.success) { setPendientes(res.cobros_pendientes || []); return; }
      throw new Error((res && res.error) || 'sin respuesta');
    }).catch(() => {
      if (!vivo) return;
      // Respaldo: los cobros que ya trae la pantalla (últimos 90 días).
      setPendientes((cobrosRespaldo || []).map(c => ({
        id: Number(c.id), folio: c.folio, total: Number(c.total || 0),
        monto_pagado: Number(c.monto_pagado || 0), fecha: c.fecha,
        conceptos: (c.items || []).map(i => i.nombre).filter(Boolean)
      })));
      setAvisoPend('No se pudo consultar la lista completa de adeudos: se muestran solo los de los últimos 90 días.');
    });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const elegirEstatus = v => {
    setEstatus(v);
    if (!sacarTocado) setSacar(v !== 'activo');
  };

  const guardar = async () => {
    setError('');
    if (!estatus) { setError('Elige el nuevo estatus.'); return; }
    if (!reactivar && !motivo.trim()) { setError('Escribe el motivo: queda en el historial del alumno.'); return; }
    const ids = Object.keys(cancelar).filter(k => cancelar[k]).map(Number);
    const cuerpo = { cliente_id: alumno.id, estatus: estatus, motivo: motivo.trim(), fecha: fecha };
    if (!reactivar) {
      cuerpo.sacar_de_grupos = sacar;
      if (puedeDinero) {
        cuerpo.cobros_cancelar = ids;
        cuerpo.clabe = clabe;
      }
    }
    setGuardando(true);
    try {
      const res = await apiPost('alumno_cambiar_estatus', cuerpo);
      if (!res || !res.success) {
        setError((res && res.error) || 'No se pudo cambiar el estatus.');
        setGuardando(false);
        return;
      }
      await onGuardado(res);
      onCerrar();
    } catch (e) {
      setError('Error de conexión: ' + e.message);
      setGuardando(false);
    }
  };

  const nota = { fontSize: 12, color: 'var(--ink-3)', marginTop: 4, lineHeight: 1.5 };
  const info = ALUMNO_ESTATUS_INFO[actual];

  return _jsxDEV("div", {
    className: "modal-backdrop",
    onClick: e => e.target === e.currentTarget && !guardando && onCerrar(),
    children: _jsxDEV("div", {
      className: "modal",
      children: [
        _jsxDEV("div", {
          className: "modal-header",
          children: [
            _jsxDEV("div", { className: "modal-title", children: "Cambiar estatus de " + alumno.nombre }, void 0, false),
            _jsxDEV("button", {
              className: "btn btn-ghost btn-sm", onClick: onCerrar, disabled: guardando,
              children: _jsxDEV(Icon, { name: "close", size: 16, color: "currentColor" }, void 0, false)
            }, void 0, false)
          ]
        }, void 0, true),
        _jsxDEV("div", {
          className: "modal-body",
          children: destinos.length === 0
            ? _jsxDEV("div", { style: nota, children: "Este alumno no admite cambios de estatus." }, void 0, false)
            : [
              _jsxDEV("div", { key: 'act', style: { fontSize: 13, marginBottom: 12 }, children: ["Estatus actual: ", _jsxDEV("span", { className: 'badge ' + info.badge, children: info.etiqueta }, void 0, false)] }, void 0, true),
              _jsxDEV("div", { key: 'est', className: "form-group", children: [
                _jsxDEV("label", { className: "form-label", children: "Nuevo estatus" }, void 0, false),
                _jsxDEV("select", {
                  className: "form-select", value: estatus, onChange: e => elegirEstatus(e.target.value),
                  children: destinos.map(d => _jsxDEV("option", { value: d, children: ALUMNO_ESTATUS_INFO[d].etiqueta }, d, false))
                }, void 0, false)
              ] }, void 0, true),
              _jsxDEV("div", { key: 'mot', className: "form-group", children: [
                _jsxDEV("label", { className: "form-label", children: reactivar ? "Motivo (opcional)" : "Motivo *" }, void 0, false),
                _jsxDEV("input", {
                  className: "form-input", value: motivo, maxLength: 255,
                  placeholder: reactivar ? "Ej. Reingreso" : "Ej. Cambio de domicilio, terminó el ciclo, falta de pago…",
                  onChange: e => setMotivo(e.target.value)
                }, void 0, false)
              ] }, void 0, true),
              _jsxDEV("div", { key: 'fec', className: "form-group", children: [
                _jsxDEV("label", { className: "form-label", children: "Fecha efectiva" }, void 0, false),
                _jsxDEV("input", {
                  className: "form-input", type: "date", value: fecha, max: _alumnoFechaHoyF1(),
                  onChange: e => setFecha(e.target.value)
                }, void 0, false)
              ] }, void 0, true),
              !reactivar && _jsxDEV("div", { key: 'gru', className: "form-group", children: [
                _jsxDEV("label", { style: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }, children: [
                  _jsxDEV("input", { type: "checkbox", checked: sacar, onChange: e => { setSacar(e.target.checked); setSacarTocado(true); } }, void 0, false),
                  "Sacar de sus grupos"
                ] }, void 0, true),
                _jsxDEV("div", { style: nota, children: "Cierra sus inscripciones a grupos; el historial académico se conserva." }, void 0, false)
              ] }, void 0, true),
              !reactivar && !puedeDinero && _jsxDEV("div", { key: 'sindin', style: nota, children: "Sus adeudos y su CLABE se conservan tal como están. Cancelar adeudos o liberar la CLABE lo hace la administración del colegio." }, void 0, false),
              mostrarAdeudos && _jsxDEV("div", { key: 'cob', className: "form-group", children: [
                _jsxDEV("label", { className: "form-label", children: "Adeudos pendientes" }, void 0, false),
                pendientes === null
                  ? _jsxDEV("div", { style: nota, children: "Cargando adeudos…" }, void 0, false)
                  : pendientes.length === 0
                    ? _jsxDEV("div", { style: nota, children: "No tiene cobros pendientes." }, void 0, false)
                    : _jsxDEV("div", { style: { border: '1px solid var(--glass-light)', borderRadius: 'var(--radius-sm)', maxHeight: 200, overflowY: 'auto' }, children: pendientes.map(p => {
                        const conAbonos = Number(p.monto_pagado) > 0;
                        return _jsxDEV("label", {
                          style: { display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', borderBottom: '1px solid var(--glass-light)', fontSize: 12.5, opacity: conAbonos ? .65 : 1 },
                          children: [
                            _jsxDEV("input", {
                              type: "checkbox", disabled: conAbonos, checked: !!cancelar[p.id],
                              onChange: e => setCancelar({ ...cancelar, [p.id]: e.target.checked })
                            }, void 0, false),
                            _jsxDEV("span", { style: { flex: 1 }, children: [
                              _jsxDEV("strong", { children: (p.folio || ('#' + p.id)) }, void 0, false),
                              " · ", _alumnoMontoF1(p.total),
                              p.fecha ? " · " + String(p.fecha).slice(0, 10) : "",
                              (p.conceptos && p.conceptos.length) ? _jsxDEV("div", { style: { color: 'var(--ink-3)' }, children: p.conceptos.join(', ') }, void 0, false) : null,
                              conAbonos ? _jsxDEV("div", { style: { color: 'var(--amber)' }, children: "Tiene abonos (" + _alumnoMontoF1(p.monto_pagado) + "): no se puede cancelar desde aquí." }, void 0, false) : null
                            ] }, void 0, true),
                            _jsxDEV("span", { style: { fontSize: 11.5, color: 'var(--ink-3)' }, children: conAbonos ? "" : "cancelar" }, void 0, false)
                          ]
                        }, p.id, true);
                      }) }, void 0, false),
                avisoPend ? _jsxDEV("div", { style: { ...nota, color: 'var(--amber)' }, children: avisoPend }, void 0, false) : null,
                _jsxDEV("div", { style: nota, children: "Los cobros que no marques se conservan como adeudo de la familia." }, void 0, false)
              ] }, void 0, true),
              mostrarAdeudos && alumno.clabe_individual && _jsxDEV("div", { key: 'clb', className: "form-group", children: [
                _jsxDEV("label", { className: "form-label", children: "CLABE SPEI del alumno" }, void 0, false),
                _jsxDEV("select", {
                  className: "form-select", value: clabe, onChange: e => setClabe(e.target.value),
                  children: [
                    _jsxDEV("option", { value: 'conservar', children: "Conservar (la familia puede seguir pagando adeudos por SPEI)" }, 'c', false),
                    _jsxDEV("option", { value: 'liberar', children: "Liberar (regresa al pool; los SPEI posteriores ya no se ligarán)" }, 'l', false)
                  ]
                }, void 0, false)
              ] }, void 0, true),
              error ? _jsxDEV("div", { key: 'err', style: { marginTop: 8, padding: '8px 11px', borderRadius: 'var(--radius-sm)', background: 'var(--red-glow)', color: 'var(--red)', fontSize: 12.5 }, children: error }, void 0, false) : null
            ]
        }, void 0, false),
        _jsxDEV("div", {
          className: "modal-footer",
          children: [
            _jsxDEV("button", { className: "btn btn-secondary", onClick: onCerrar, disabled: guardando, children: "Cancelar" }, void 0, false),
            destinos.length > 0 && _jsxDEV("button", {
              className: "btn btn-primary", onClick: guardar,
              disabled: guardando || (mostrarAdeudos && pendientes === null),
              children: guardando ? "Guardando…" : "Guardar cambio"
            }, void 0, false)
          ]
        }, void 0, true)
      ]
    }, void 0, true)
  }, void 0, false);
}

// Sección "Historial" de la ficha del alumno (bitácora alumno_movimientos).
function HistorialAlumnoF1({ clienteId, apiPost }) {
  const { useState, useEffect } = React;
  const [estado, setEstado] = useState({ cargando: true, movs: [], error: '', aviso: '' });
  useEffect(() => {
    let vivo = true;
    setEstado({ cargando: true, movs: [], error: '', aviso: '' });
    apiPost('alumno_movimientos_listar', { cliente_id: clienteId, limite: 100 }).then(res => {
      if (!vivo) return;
      if (res && res.success) setEstado({ cargando: false, movs: res.movimientos || [], error: '', aviso: res.aviso || '' });
      else setEstado({ cargando: false, movs: [], error: (res && res.error) || 'No se pudo cargar el historial.', aviso: '' });
    }).catch(e => { if (vivo) setEstado({ cargando: false, movs: [], error: 'Error de conexión: ' + e.message, aviso: '' }); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  const fmtFecha = s => s ? String(s).replace('T', ' ').slice(0, 16) : '';
  const etq = e => (ALUMNO_ESTATUS_INFO[e] ? ALUMNO_ESTATUS_INFO[e].etiqueta : e);
  const chico = { fontSize: 12, color: 'var(--ink-3)' };

  return _jsxDEV("div", {
    style: { marginTop: 18 },
    children: [
      _jsxDEV("div", { style: { fontWeight: 600, fontSize: 13, marginBottom: 8 }, children: "Historial" }, 'h', false),
      estado.cargando ? _jsxDEV("div", { style: chico, children: "Cargando historial…" }, 'c', false)
        : estado.error ? _jsxDEV("div", { style: { ...chico, color: 'var(--red)' }, children: estado.error }, 'e', false)
        : estado.movs.length === 0 ? _jsxDEV("div", { style: chico, children: estado.aviso || "Sin movimientos registrados." }, 'v', false)
        : _jsxDEV("div", { style: { maxHeight: 240, overflowY: 'auto' }, children: estado.movs.map(m => _jsxDEV("div", {
            style: { padding: '7px 0', borderBottom: '1px solid var(--glass-light)', fontSize: 12.5 },
            children: [
              _jsxDEV("div", { style: { display: 'flex', justifyContent: 'space-between', gap: 8 }, children: [
                _jsxDEV("strong", { children: ALUMNO_MOVIMIENTO_ETIQUETA_F1[m.tipo] || m.tipo }, void 0, false),
                _jsxDEV("span", { style: chico, children: fmtFecha(m.creado_en) }, void 0, false)
              ] }, void 0, true),
              (m.estatus_anterior || m.estatus_nuevo) && m.estatus_anterior !== m.estatus_nuevo
                ? _jsxDEV("div", { children: [m.estatus_anterior ? etq(m.estatus_anterior) : '—', " → ", m.estatus_nuevo ? etq(m.estatus_nuevo) : '—'] }, void 0, true) : null,
              m.motivo ? _jsxDEV("div", { style: { color: 'var(--ink-2)' }, children: "Motivo: " + m.motivo }, void 0, false) : null,
              _jsxDEV("div", { style: chico, children: "Por " + (m.usuario_nombre || 'sistema') }, void 0, false)
            ]
          }, m.id, true)) }, 'l', false)
    ]
  }, void 0, true);
}

// [F4] Acceso del alumno al portal (views/PortalAlumno.js). Una cuenta por alumno, con su propio
// correo o con el de un tutor; entra con un enlace de activación por correo (igual que el resto
// de las cuentas) y desde ahí ve SU horario, asistencia y calificaciones publicadas (y su
// monedero). No ve adeudos ni cobranza de la familia.
//
// Todo lo valida el servidor (crear_usuario / reenviar_credenciales / toggle_usuario / listar_usuarios):
// aquí solo se arma la pantalla. Si el correo elegido ya tiene otra cuenta (p. ej. el tutor ya entra
// a su portal con él), crear_usuario responde "El correo ya está registrado": hay que usar otro.
function AlumnoAccesoModalF4({ alumno, escuelaId, familia, apiPost, onCerrar }) {
  const { useState, useEffect } = React;
  const [cargando, setCargando] = useState(true);
  const [cuentas, setCuentas] = useState([]);       // cuentas de alumno de ESTE alumno (puede haber una desactivada)
  const [correos, setCorreos] = useState([]);       // opciones: alumno, familia, tutores
  const [correoSel, setCorreoSel] = useState('');
  const [correoOtro, setCorreoOtro] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [liga, setLiga] = useState('');             // enlace de activación si el correo no salió

  const cargar = async () => {
    setCargando(true);
    try {
      const r = await apiPost('listar_usuarios', { solo_alumnos: true });
      if (r && r.success) {
        setCuentas((r.usuarios || []).filter(u => Number(u.cliente_id) === Number(alumno.id)));
      } else {
        setError((r && r.error) || 'No se pudo consultar la cuenta del alumno.');
      }
    } catch (e) { setError('No se pudo consultar la cuenta del alumno.'); }
    setCargando(false);
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [alumno.id]);

  // Opciones de correo: el del alumno, el de su familia y los de sus tutores (si el expediente existe).
  useEffect(() => {
    let vivo = true;
    const base = [];
    const agrega = (email, etiqueta) => {
      const e = (email || '').trim();
      if (e && !base.some(x => x.email.toLowerCase() === e.toLowerCase())) base.push({ email: e, etiqueta: etiqueta + ' · ' + e });
    };
    agrega(alumno.email, 'Alumno');
    if (familia) agrega(familia.email, 'Familia ' + (familia.nombre || ''));
    setCorreos(base.slice());
    setCorreoSel(base[0] ? base[0].email : '__otro__');
    apiPost('alumno_tutores_listar', { cliente_id: alumno.id }).then(r => {
      if (!vivo || !r || !r.success) return;
      (r.tutores || []).forEach(t => agrega(t.email, 'Tutor ' + (t.nombre || '')));
      setCorreos(base.slice());
    }).catch(() => {});
    return () => { vivo = false; };
    // eslint-disable-next-line
  }, [alumno.id]);

  const cuenta = cuentas.find(u => u.activo) || cuentas[0] || null;

  const ejecutar = async (fn) => {
    setTrabajando(true); setError(''); setAviso(''); setLiga('');
    try { await fn(); } catch (e) { setError('Error de conexión: ' + e.message); }
    setTrabajando(false);
  };
  const crear = () => ejecutar(async () => {
    const email = (correoSel === '__otro__' ? correoOtro : correoSel).trim();
    if (!email) { setError('Elige o escribe el correo con el que entrará el alumno.'); return; }
    const r = await apiPost('crear_usuario', {
      nombre: alumno.nombre, email, rol: 'alumno', cliente_id: alumno.id, escuela_id: escuelaId,
    });
    if (!r.success) { setError(r.error || 'No se pudo crear la cuenta.'); return; }
    setAviso(r.correo_enviado === false
      ? 'La cuenta se creó, pero el correo no salió: comparte este enlace con el alumno.'
      : 'Cuenta creada. Se envió el enlace de activación a ' + email + ' (vence en 72 horas).');
    if (r.correo_enviado === false && r.activacion_liga) setLiga(r.activacion_liga);
    await cargar();
  });
  const reenviar = () => ejecutar(async () => {
    const r = await apiPost('reenviar_credenciales', { id: cuenta.id });
    if (!r.success) { setError(r.error || 'No se pudo reenviar la activación.'); return; }
    setAviso(r.correo_enviado === false
      ? 'El correo no salió: comparte este enlace con el alumno.'
      : 'Se reenvió el enlace de activación a ' + r.email + '.');
    if (r.correo_enviado === false && r.activacion_liga) setLiga(r.activacion_liga);
  });
  const alternar = () => {
    if (!window.confirm(cuenta.activo ? '¿Desactivar el acceso de este alumno? Ya no podrá entrar a su portal.' : '¿Reactivar el acceso de este alumno?')) return;
    return ejecutar(async () => {
      const r = await apiPost('toggle_usuario', { id: cuenta.id });
      if (!r.success) { setError(r.error || 'No se pudo cambiar el estado de la cuenta.'); return; }
      await cargar();
    });
  };

  const nota = { fontSize: 12, color: 'var(--ink-3)', marginTop: 4, lineHeight: 1.5 };
  const cuerpo = cargando
    ? [_jsxDEV("div", { key: 'cg', style: nota, children: "Consultando…" }, void 0, false)]
    : [
        cuenta
          ? _jsxDEV("div", { key: 'cta', children: [
              _jsxDEV("div", { key: 'e', style: { fontSize: 13, marginBottom: 6 }, children: ["Cuenta: ", _jsxDEV("strong", { children: cuenta.email }, void 0, false)] }, void 0, true),
              _jsxDEV("div", { key: 's', style: { marginBottom: 10 }, children: _jsxDEV("span", { className: 'badge ' + (cuenta.activo ? 'badge-green' : 'badge-gray'), children: cuenta.activo ? 'Activa' : 'Desactivada' }, void 0, false) }, void 0, false),
              _jsxDEV("div", { key: 'n', style: nota, children: "El alumno entra con ese correo y la contraseña que cree desde el enlace de activación. Si no le llegó, reenvíalo." }, void 0, false)
            ] }, void 0, true)
          : _jsxDEV("div", { key: 'nueva', children: [
              _jsxDEV("div", { key: 'i', style: { fontSize: 13, marginBottom: 10 }, children: "Este alumno todavía no tiene acceso. Elige con qué correo entrará; se le enviará un enlace para crear su contraseña." }, void 0, false),
              _jsxDEV("div", { key: 'c', className: "form-group", children: [
                _jsxDEV("label", { key: 'l', className: "form-label", children: "Correo" }, void 0, false),
                _jsxDEV("select", {
                  key: 's', className: "form-select", value: correoSel, onChange: e => setCorreoSel(e.target.value),
                  children: correos.map(c => _jsxDEV("option", { value: c.email, children: c.etiqueta }, c.email, false))
                    .concat([_jsxDEV("option", { value: '__otro__', children: "Otro correo…" }, '__otro__', false)])
                }, void 0, false)
              ] }, void 0, true),
              correoSel === '__otro__' && _jsxDEV("div", { key: 'o', className: "form-group", children: _jsxDEV("input", {
                className: "form-input", type: "email", value: correoOtro, placeholder: "correo@ejemplo.com",
                onChange: e => setCorreoOtro(e.target.value)
              }, void 0, false) }, void 0, false),
              _jsxDEV("div", { key: 'n', style: nota, children: "Si el correo ya tiene otra cuenta (por ejemplo, el del tutor que ya entra a su portal), el sistema lo rechazará: usa el del alumno u otro distinto." }, void 0, false)
            ] }, void 0, true),
        error && _jsxDEV("div", { key: 'err', style: { marginTop: 10, fontSize: 12.5, color: 'var(--red)' }, children: error }, void 0, false),
        aviso && _jsxDEV("div", { key: 'ok', style: { marginTop: 10, fontSize: 12.5, color: 'var(--green)' }, children: aviso }, void 0, false),
        liga && _jsxDEV("div", { key: 'liga', style: { marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }, children: [
          _jsxDEV("input", { key: 'i', className: "form-input", readOnly: true, value: liga, onFocus: e => e.target.select() }, void 0, false),
          _jsxDEV("button", { key: 'b', className: "btn btn-secondary btn-sm", onClick: () => navigator.clipboard && navigator.clipboard.writeText(liga), children: "Copiar" }, void 0, false)
        ] }, void 0, true)
      ];

  return _jsxDEV("div", {
    className: "modal-backdrop",
    onClick: e => e.target === e.currentTarget && !trabajando && onCerrar(),
    children: _jsxDEV("div", {
      className: "modal",
      children: [
        _jsxDEV("div", {
          key: 'h', className: "modal-header",
          children: [
            _jsxDEV("div", { key: 't', className: "modal-title", children: "Acceso del alumno: " + alumno.nombre }, void 0, false),
            _jsxDEV("button", {
              key: 'x', className: "btn btn-ghost btn-sm", onClick: onCerrar, disabled: trabajando,
              children: _jsxDEV(Icon, { name: "close", size: 16, color: "currentColor" }, void 0, false)
            }, void 0, false)
          ]
        }, void 0, true),
        _jsxDEV("div", { key: 'b', className: "modal-body", children: cuerpo }, void 0, false),
        _jsxDEV("div", {
          key: 'f', className: "modal-footer",
          children: [
            _jsxDEV("button", { key: 'c', className: "btn btn-secondary", onClick: onCerrar, disabled: trabajando, children: "Cerrar" }, void 0, false),
            !cargando && cuenta && _jsxDEV("button", { key: 't', className: "btn btn-ghost", onClick: alternar, disabled: trabajando, children: cuenta.activo ? 'Desactivar acceso' : 'Reactivar acceso' }, void 0, false),
            !cargando && cuenta && cuenta.activo && _jsxDEV("button", { key: 'r', className: "btn btn-primary", onClick: reenviar, disabled: trabajando, children: "Reenviar activación" }, void 0, false),
            !cargando && !cuenta && _jsxDEV("button", { key: 'n', className: "btn btn-primary", onClick: crear, disabled: trabajando, children: trabajando ? 'Creando…' : 'Crear acceso' }, void 0, false)
          ]
        }, void 0, true)
      ]
    }, void 0, true)
  }, void 0, true);
}
