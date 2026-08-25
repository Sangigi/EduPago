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
  rol
}) {
  const {
    useState
  } = React;
  const puedeEditar = rol !== 'cajero'; // el cajero puede dar de alta pero no editar/desactivar
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
  const [form, setForm] = useState(EMPTY);
  const [q, setQ] = useState('');
  // Términos acumulados del buscador. Se mandan al servidor separados por '|'
  // porque el filtrado debe ocurrir en SQL: la lista viene paginada y filtrar
  // solo en el navegador daría resultados falsos (ver api_busqueda_etiquetas.md).
  const [etiquetas, setEtiquetas] = useState([]);
  const [clabeLoadingId, setClabeLoadingId] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [buscando, setBuscando] = useState(false);
  const [qFamilia, setQFamilia] = useState('');
  const [familiaAbierta, setFamiliaAbierta] = useState(false);

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
      });
      const res = await fetch('api.php?' + params.toString(), {
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

  // Toma la primera CLABE libre del pool y la asigna al alumno
  const asignarClabeDesdePool = async (alumno, dataBase) => {
    const eid = escuela_id || dataBase.escuelas?.[0]?.id;
    if (!eid || !alumno?.id) return;
    setClabeLoadingId(alumno.id);
    try {
      const res = await _apiPost('asignar_clabe_pool', { escuela_id: eid, cliente_id: alumno.id });
      if (!res.success) {
        // Sin CLABEs disponibles (u otro error) — guardamos el mensaje real del
        // servidor para mostrarlo, en vez de un "Error" genérico sin contexto.
        const upd = {
          ...dataBase,
          clientes: dataBase.clientes.map(c => c.id === alumno.id ? {
            ...c, clabe_individual_estado: 'error', clabe_individual_error_msg: res.error || 'No hay CLABEs SPEI disponibles'
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
      console.error('Error al asignar CLABE del pool:', e.message);
    } finally {
      setClabeLoadingId(null);
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
    // Alta nueva: registrar en DB, luego asignar CLABE del pool automáticamente
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
      // Asignar CLABE del pool de inmediato
      await asignarClabeDesdePool(alumnoNuevo, newData);
    } catch (e) { alert('Error al dar de alta alumno: ' + e.message); }
  };

  // ── Activar/Desactivar alumno ──────────────────────────────────────────────
  const toggle = async cliente => {
    const eraActivo = cliente.activo;
    try { await ClienteController.toggleActivo(cliente.id, eraActivo); } catch(e) {}
    const newData = {
      ...data,
      clientes: data.clientes.map(c => c.id === cliente.id ? { ...c, activo: !eraActivo } : c)
    };
    setData(newData);
    AppModel.save(newData);
    if (eraActivo) {
      // Dar de baja: liberar CLABE al pool
      if (cliente.clabe_individual) await liberarClabePool(cliente, newData);
    } else {
      // Reactivar: asignar nueva CLABE del pool
      const alumnoActualizado = newData.clientes.find(c => c.id === cliente.id);
      await asignarClabeDesdePool(alumnoActualizado, newData);
    }
  };
  const regenerarClabe = async cliente => {
    await asignarClabeDesdePool(cliente, data);
  };
  const familiaDeAlumno = fid => fid ? data.familias.find(f => f.id === fid)?.nombre : null;
  const fmtCLABE = clabe => clabe ? clabe.match(/.{1,4}/g).join(' ') : '—';
  return _jsxDEV("div", {
    children: [ficha && typeof FichaTecnica !== 'undefined' && _jsxDEV(FichaTecnica, {
      tipo: 'alumno',
      registro: ficha,
      extra: {
        familia: (data.familias || []).find(f => f.id === ficha.familia_id) || null,
        saldo: ficha.saldo_pendiente || 0,
        saldoTexto: '$' + Number(ficha.saldo_pendiente || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })
      },
      onCerrar: () => setFicha(null),
      // Guarda solo el enlace de la foto, sin abrir el formulario completo
      onGuardarFoto: async url => {
        const res = await _apiPost('editar_cliente', { id: ficha.id, foto_url: url });
        if (res && res.success !== false) {
          setFicha(f => f ? { ...f, foto_url: url } : f);
          setData(prev => ({
            ...prev,
            clientes: (prev.clientes || []).map(c => c.id === ficha.id ? { ...c, foto_url: url } : c)
          }));
        }
        return res;
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
              typeof data.clientes_total === 'number' ? data.clientes_total : data.clientes.length,
              " [DEBUG temporal: total=" + JSON.stringify(data.clientes_total) + " activos_total=" + JSON.stringify(data.clientes_activos_total) + " pagina=" + JSON.stringify(data.clientes_pagina) + " por_pagina=" + JSON.stringify(data.clientes_por_pagina) + " lista.length=" + data.clientes.length + "]"
            ]
          }, void 0, true)]
        }, void 0, true), _jsxDEV("div", {
          style: { display: 'flex', gap: 8 },
          children: [_jsxDEV("button", {
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
          }, void 0, true), _jsxDEV("button", {
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
          }, void 0, false)]
        }, void 0, true)
      }, void 0, false), _jsxDEV("div", {
        className: "table-wrap",
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
              }, void 0, false), _jsxDEV("th", {
                children: "CLABE SPEI individual"
              }, void 0, false), _jsxDEV("th", {
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
                colSpan: 8,
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
                children: _jsxDEV("span", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 12
                  },
                  children: c.matricula || '—'
                }, void 0, false)
              }, void 0, false), _jsxDEV("td", {
                style: {
                  color: 'var(--ink-3)',
                  fontSize: 12
                },
                children: c.grado || '—'
              }, void 0, false), _jsxDEV("td", {
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
              }, void 0, false), _jsxDEV("td", {
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
                    title: "Asignar CLABE del pool",
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
              }, void 0, false), _jsxDEV("td", {
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
                children: c.activo ? _jsxDEV("span", {
                  className: "badge badge-green",
                  children: "Activo"
                }, void 0, false) : _jsxDEV("span", {
                  className: "badge badge-gray",
                  children: "Inactivo"
                }, void 0, false)
              }, void 0, false), _jsxDEV("td", {
                children: !puedeEditar ? _jsxDEV("span", {
                  style: { fontSize: 11, color: 'var(--ink-4)' },
                  children: "Sin edición"
                }, void 0, false) : _jsxDEV("div", {
                  style: {
                    display: 'flex',
                    gap: 5
                  },
                  children: [_jsxDEV("button", {
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
                  }, void 0, false), _jsxDEV("button", {
                    className: "btn btn-ghost btn-sm",
                    onClick: () => toggle(c),
                    title: c.activo ? 'Dar de baja (libera su CLABE)' : 'Reactivar (genera nueva CLABE)',
                    children: c.activo ? _jsxDEV(Icon, {
                      name: "shield",
                      size: 14,
                      color: "currentColor"
                    }, void 0, false) : _jsxDEV(Icon, {
                      name: "eyeOff",
                      size: 14,
                      color: "currentColor"
                    }, void 0, false)
                  }, void 0, false)]
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
              gridTemplateColumns: '1fr 1fr',
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
              gridTemplateColumns: '1fr 1fr',
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
                gridTemplateColumns: '1fr 1fr',
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
            children: [_jsxDEV("div", { style: { fontWeight: 600, fontSize: 13, marginBottom: 6 }, children: "Cuentas de acceso nuevas — compártelas con cada tutor:" }, void 0, false),
            _jsxDEV("div", { className: "table-wrap", style: { maxHeight: 200, overflowY: 'auto' }, children: _jsxDEV("table", { className: "table", children: [
              _jsxDEV("thead", { children: _jsxDEV("tr", { children: [_jsxDEV("th", { children: "Tutor" }, void 0, false), _jsxDEV("th", { children: "Correo" }, void 0, false), _jsxDEV("th", { children: "Contraseña temporal" }, void 0, false)] }, void 0, true) }, void 0, false),
              _jsxDEV("tbody", { children: resultadoImport.cuentas_creadas.map((c, i) => _jsxDEV("tr", { children: [
                _jsxDEV("td", { style: { fontSize: 12.5 }, children: c.nombre || '—' }, void 0, false),
                _jsxDEV("td", { style: { fontSize: 12.5 }, children: c.email }, void 0, false),
                _jsxDEV("td", { style: { fontSize: 12.5, fontFamily: 'var(--mono)' }, children: c.password_temporal }, void 0, false)
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
