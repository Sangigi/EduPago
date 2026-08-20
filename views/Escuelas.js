var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};
/* views/Escuelas.jsx — Super Admin: gestión de escuelas */
function Escuelas({
  data,
  setData,
  onSeleccionar
}) {
  const {
    useState
  } = React;
  const EMPTY = {
    nombre: '',
    clave: '',
    rfc: '',
    telefono: '',
    email: '',
    direccion: '',
    logo_emoji: '',
    plan: 'pro',
    clabe_fija: '', // mantenido para compatibilidad con BD existente, no se muestra en UI
    color: '#282d65',
    permite_planteles: false
  };
  const EMPTY_PLT = {
    nombre: '',
    direccion: '',
    nivel_educativo: '',
    zona: '',
    zona_id: '',
    responsable: '',
    tel: '',
    email: ''
  };
  const NIVELES_EDUCATIVOS = [
    { value: '', label: 'Sin especificar' },
    { value: 'preescolar', label: 'Preescolar' },
    { value: 'primaria', label: 'Primaria' },
    { value: 'secundaria', label: 'Secundaria' },
    { value: 'preparatoria', label: 'Preparatoria' },
    { value: 'universidad', label: 'Universidad' },
    { value: 'mixto', label: 'Mixto' },
  ];
  const [modal, setModal] = useState(null);
  const [qEsc, setQEsc] = useState('');
  const [filtroPlanEsc, setFiltroPlanEsc] = useState('');
  const [filtroEstadoEsc, setFiltroEstadoEsc] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [escuelaPltId, setEscuelaPltId] = useState(null); // escuela cuyo modal de planteles está abierto
  const [plantelesPanel, setPlantelesPanel] = useState(null); // null = cargando/no pedido aún; [] = ya cargó y no hay
  const [cargandoPlt, setCargandoPlt] = useState(false);
  const [filtroNivelPlt, setFiltroNivelPlt] = useState('');
  const [filtroZonaPlt, setFiltroZonaPlt] = useState('');
  const [zonasCatalogo, setZonasCatalogo] = useState([]); // catálogo compartido de zonas ({id,nombre,activa})

  const cargarZonas = async () => {
    try {
      const res = await apiPost('listar_zonas', {});
      if (res.success) setZonasCatalogo(res.zonas || []);
    } catch (e) {
      // silencioso: el select simplemente quedará vacío
    }
  };

  const cargarPlantelesDe = async (escId) => {
    setCargandoPlt(true);
    setPlantelesPanel(null);
    cargarZonas();
    try {
      const res = await apiPost('planteles_de_escuela', { escuela_id: escId });
      setPlantelesPanel(res.success ? (res.planteles || []) : []);
    } catch (e) {
      setPlantelesPanel([]);
    } finally {
      setCargandoPlt(false);
    }
  };
  const [modalPlt, setModalPlt] = useState(null); // null | 'list' | 'form'
  const [formPlt, setFormPlt] = useState(EMPTY_PLT);
  const [guardandoPlt, setGuardandoPlt] = useState(false);
  const [errorPlt, setErrorPlt] = useState('');
  const [guardandoEsc, setGuardandoEsc] = useState(false);
  const [errorEsc, setErrorEsc] = useState('');
  const guardar = async () => {
    if (!form.nombre || !form.clave) return;
    if (!form.id && !form.email) { setErrorEsc('El correo es obligatorio: con él se crea la cuenta admin del colegio.'); return; }
    setErrorEsc('');
    setGuardandoEsc(true);
    const payload = {
      nombre: form.nombre,
      clave: form.clave,
      rfc: form.rfc,
      telefono: form.telefono,
      email: form.email,
      direccion: form.direccion,
      logo_emoji: form.logo_emoji,
      plan: form.plan,
    };
    try {
      const res = form.id
        ? await apiPost('editar_escuela', { id: form.id, ...payload })
        : await apiPost('crear_escuela', payload);
      if (!res.success) {
        setErrorEsc(res.error || 'No se pudo guardar el colegio');
        setGuardandoEsc(false);
        return;
      }
      const newEscuelas = form.id
        ? data.escuelas.map(e => e.id === form.id ? { ...e, ...res.escuela } : e)
        : [...data.escuelas, res.escuela];
      const newData = { ...data, escuelas: newEscuelas };
      setData(newData);
      AppModel.save(newData);
      setModal(null);
      setForm(EMPTY);
      if (!form.id && res.admin_email) {
        alert(
          'Colegio creado. Cuenta de acceso:\n\n' +
          'Correo: ' + res.admin_email + '\n' +
          'Contraseña temporal: ' + res.admin_password_temporal +
          '\n\nCompártela con el admin del colegio; puede cambiarla después.'
        );
      }
    } catch (e) {
      setErrorEsc('Error de conexión al guardar el colegio: ' + e.message);
    }
    setGuardandoEsc(false);
  };
  const guardarPlantel = async () => {
    if (!formPlt.nombre) return;
    setErrorPlt('');

    if (formPlt.id) {
      // Editar plantel existente: se guarda en el servidor (planteles + escuela-cuenta
      // + correo de acceso del usuario, si se modificó).
      if (!formPlt.email) {
        setErrorPlt('El correo es obligatorio: con él inicia sesión la cuenta del plantel.');
        return;
      }
      setGuardandoPlt(true);
      try {
        const res = await apiPost('editar_plantel', {
          id: formPlt.id,
          nombre: formPlt.nombre,
          direccion: formPlt.direccion,
          nivel_educativo: formPlt.nivel_educativo,
          zona: formPlt.zona,
          zona_id: formPlt.zona_id ? parseInt(formPlt.zona_id) : null,
          responsable: formPlt.responsable,
          tel: formPlt.tel,
          email: formPlt.email
        });
        if (!res.success) {
          setErrorPlt(res.error || 'No se pudo guardar el plantel');
          setGuardandoPlt(false);
          return;
        }
        // res.plantel (respuesta del backend) aún no incluye zona_id, solo el
        // texto legado `zona` ya resuelto; completamos zona_id localmente con
        // lo que se acaba de guardar para que el filtro/selector no quede obsoleto.
        const zonaIdGuardada = formPlt.zona_id ? parseInt(formPlt.zona_id) : null;
        const plantelActualizado = { ...res.plantel, zona_id: zonaIdGuardada };
        const planteles = data.planteles || [];
        const newPlanteles = planteles.map(p => p.id === formPlt.id ? { ...p, ...plantelActualizado } : p);
        setPlantelesPanel(prev => (prev || []).map(p => p.id === formPlt.id ? { ...p, ...plantelActualizado } : p));
        let newEscuelas = data.escuelas || [];
        if (res.escuela_plantel) {
          newEscuelas = newEscuelas.map(e => e.id === res.escuela_plantel.id ? {
            ...e,
            ...res.escuela_plantel
          } : e);
        }
        const newData = { ...data, escuelas: newEscuelas, planteles: newPlanteles };
        setData(newData);
        AppModel.save(newData);
        setFormPlt(EMPTY_PLT);
        setModalPlt('list');
      } catch (e) {
        setErrorPlt('Error de conexión al guardar el plantel: ' + e.message);
      }
      setGuardandoPlt(false);
      return;
    }

    // Nuevo plantel: se crea en el servidor (escuela + planteles + usuario real)
    if (!formPlt.email) {
      setErrorPlt('El correo es obligatorio: con él inicia sesión la cuenta del plantel.');
      return;
    }
    setGuardandoPlt(true);
    try {
      const res = await apiPost('crear_plantel', {
        escuela_id: escuelaPltId,
        nombre: formPlt.nombre,
        direccion: formPlt.direccion,
        nivel_educativo: formPlt.nivel_educativo,
        zona: formPlt.zona,
        zona_id: formPlt.zona_id ? parseInt(formPlt.zona_id) : null,
        responsable: formPlt.responsable,
        tel: formPlt.tel,
        email: formPlt.email
      });
      if (!res.success) {
        setErrorPlt(res.error || 'No se pudo crear el plantel');
        setGuardandoPlt(false);
        return;
      }
      const newEscuelas = [...(data.escuelas || []), {
        ...res.escuela_plantel,
        rfc: '', telefono: formPlt.tel || '', email: formPlt.email,
        direccion: formPlt.direccion || '', logo_emoji: '', clabe_fija: '',
        color: '#282d65', plan: 'pro', fecha_alta: new Date().toISOString().slice(0, 10)
      }];
      // res.plantel (respuesta del backend) aún no incluye zona_id, solo el
      // texto legado `zona`; completamos zona_id localmente con lo enviado.
      const plantelCreado = { ...res.plantel, zona_id: formPlt.zona_id ? parseInt(formPlt.zona_id) : null };
      const newPlanteles = [...(data.planteles || []), plantelCreado];
      setPlantelesPanel(prev => [...(prev || []), plantelCreado]);
      const newData = { ...data, escuelas: newEscuelas, planteles: newPlanteles };
      setData(newData);
      AppModel.save(newData);
      setFormPlt(EMPTY_PLT);
      setModalPlt('list');
      alert(
        'Plantel creado. Cuenta de acceso:\n\n' +
        'Correo: ' + res.cuenta.email + '\n' +
        'Contraseña temporal: ' + res.cuenta.password_temporal +
        '\n\nCompártela con el responsable del plantel; puede cambiarla después.'
      );
    } catch (e) {
      setErrorPlt('Error de conexión al crear el plantel: ' + e.message);
    }
    setGuardandoPlt(false);
  };
  const togglePlantel = async pid => {
    // Optimista + persistido: antes solo mutaba el estado local y nunca
    // llegaba a la BD, así que el cambio se perdía en el siguiente refresh.
    const anteriorPanel = plantelesPanel;
    const anteriorData = data.planteles;
    setPlantelesPanel(prev => (prev || []).map(p => p.id === pid ? { ...p, activo: !p.activo } : p));
    setData({ ...data, planteles: (data.planteles || []).map(p => p.id === pid ? { ...p, activo: !p.activo } : p) });
    try {
      const res = await apiPost('toggle_plantel', { id: pid });
      if (!res.success) throw new Error(res.error || 'No se pudo actualizar');
    } catch (e) {
      // Revertir si falló de verdad en el servidor
      setPlantelesPanel(anteriorPanel);
      setData({ ...data, planteles: anteriorData });
      alert('No se pudo cambiar el estado del plantel: ' + e.message);
    }
  };
  const toggleActiva = async id => {
    // Optimista: refleja el cambio de inmediato en la UI
    const newData = {
      ...data,
      escuelas: data.escuelas.map(e => e.id === id ? {
        ...e,
        activa: !e.activa
      } : e)
    };
    setData(newData);
    try {
      await AuthController.toggleEscuela(id);
      AppModel.save(newData);
    } catch (e) {
      // Falló en el servidor: revertir el cambio local y avisar
      setData(data);
      alert('No se pudo actualizar el estado de la escuela: ' + e.message);
    }
  };
  const metricasEscuela = id => {
    const cobros = data.cobros.filter(c => c.escuela_id === id);
    const alumnos = data.clientes.filter(c => c.escuela_id === id && c.activo);
    const pagados = cobros.filter(c => c.estado === 'pagado').reduce((a, c) => a + c.total, 0);
    return {
      cobros: cobros.length,
      alumnos: alumnos.length,
      cobrado: pagados
    };
  };
  const PLANES = {
    basico: 'Básico',
    avanzado: 'Avanzado',
    pro: 'Pro'
  };
  const PLAN_COLORS = {
    basico: 'badge-gray',
    avanzado: 'badge-blue',
    pro: 'badge-purple'
  };
  // ── Pool CLABEs ─────────────────────────────────────────────────────────────
  const [poolEscId,   setPoolEscId]   = useState(null);  // escuela cuyo pool se gestiona
  const [modalPool,   setModalPool]   = useState(false);
  const [poolData,    setPoolData]    = useState(null);   // { pool, totales }
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolImportTxt, setPoolImportTxt] = useState('');
  const [poolImportMsg, setPoolImportMsg] = useState('');

  const tkn = () => AuthController.getToken();
  const apiPost = async (action, body) => {
    const r = await fetch('api.php?action=' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tkn() },
      body: JSON.stringify(body),
    });
    return r.json();
  };

  const abrirPool = async escId => {
    setPoolEscId(escId);
    setModalPool(true);
    setPoolData(null);
    setPoolImportTxt('');
    setPoolImportMsg('');
    setPoolLoading(true);
    try {
      const res = await apiPost('listar_clabes_pool', { escuela_id: escId });
      if (res.success) setPoolData(res);
    } catch(e) {}
    setPoolLoading(false);
  };

  // Envía una lista ya parseada de CLABEs al backend e informa el resultado
  const _importarLista = async clabes => {
    if (!clabes.length) { setPoolImportMsg('⚠ No se encontraron CLABEs válidas (deben ser 18 dígitos)'); return; }
    setPoolLoading(true);
    try {
      const res = await apiPost('importar_clabes', { escuela_id: poolEscId, clabes });
      if (res.success) {
        setPoolImportMsg(`✅ ${res.insertadas} importadas, ${res.duplicadas} duplicadas ignoradas`);
        setPoolImportTxt('');
        const res2 = await apiPost('listar_clabes_pool', { escuela_id: poolEscId });
        if (res2.success) setPoolData(res2);
      } else {
        setPoolImportMsg('❌ ' + res.error);
      }
    } catch(e) { setPoolImportMsg('❌ Error de red'); }
    setPoolLoading(false);
  };

  // Importar desde el textarea (pegado manual)
  const importarClabes = async () => {
    if (!poolImportTxt.trim()) return;
    // Parsear: acepta una CLABE por línea, o separadas por coma/espacio/tab
    const clabes = poolImportTxt
      .split(/[\n,;\t ]+/)
      .map(s => s.replace(/\s/g,'').trim())
      .filter(s => /^\d{18}$/.test(s));
    await _importarLista(clabes);
  };

  // Importar desde archivo Excel (.xlsx, .xls) o CSV usando SheetJS
  const manejarArchivoExcel = e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (typeof XLSX === 'undefined') {
      setPoolImportMsg('❌ No se pudo cargar el lector de Excel. Revisa tu conexión e intenta de nuevo.');
      e.target.value = '';
      return;
    }
    setPoolLoading(true);
    setPoolImportMsg('');
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const hoja = wb.Sheets[wb.SheetNames[0]];
        // Convierte a filas de arrays (sin asumir encabezados ni columna fija)
        const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: '' });
        // Junta TODAS las celdas de TODAS las columnas y filas, y extrae secuencias de 18 dígitos
        const textoCompleto = filas.flat().join(' ');
        const clabes = (textoCompleto.match(/\d{18}/g) || []);
        e.target.value = ''; // permitir re-subir el mismo archivo
        await _importarLista(clabes);
      } catch (err) {
        setPoolImportMsg('❌ No se pudo leer el archivo: ' + err.message);
        setPoolLoading(false);
        e.target.value = '';
      }
    };
    reader.onerror = () => {
      setPoolImportMsg('❌ Error al leer el archivo');
      setPoolLoading(false);
      e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const eliminarLibres = async ids => {
    if (!confirm('¿Eliminar ' + ids.length + ' CLABE(s) del pool?')) return;
    setPoolLoading(true);
    try {
      await apiPost('eliminar_clabes_pool', { escuela_id: poolEscId, ids });
      const res2 = await apiPost('listar_clabes_pool', { escuela_id: poolEscId });
      if (res2.success) setPoolData(res2);
    } catch(e) {}
    setPoolLoading(false);
  };

  return /*#__PURE__*/_jsxDEV("div", {
    children: [/*#__PURE__*/_jsxDEV("div", {
      style: {
        marginBottom: 20,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      },
      children: [/*#__PURE__*/_jsxDEV("div", {
        children: [/*#__PURE__*/_jsxDEV("h2", {
          style: {
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--ink)'
          },
          children: "Escuelas registradas"
        }, void 0, false), /*#__PURE__*/_jsxDEV("p", {
          style: {
            fontSize: 13,
            color: 'var(--ink-3)',
            marginTop: 3
          },
          children: [data.escuelas.filter(e => e.activa).length, " activas"]
        }, void 0, true)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
        className: "btn btn-primary",
        onClick: () => {
          setForm(EMPTY);
          setErrorEsc('');
          setModal('form');
        },
        children: "+ Nueva escuela"
      }, void 0, false)]
    }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
      style: { display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
      children: [/*#__PURE__*/_jsxDEV("input", {
        className: "form-input",
        style: { maxWidth: 260 },
        placeholder: "Buscar por nombre o clave…",
        value: qEsc,
        onChange: e => setQEsc(e.target.value)
      }, void 0, false), /*#__PURE__*/_jsxDEV("select", {
        className: "form-select",
        style: { maxWidth: 160, fontSize: 12.5 },
        value: filtroPlanEsc,
        onChange: e => setFiltroPlanEsc(e.target.value),
        children: [/*#__PURE__*/_jsxDEV("option", { value: "", children: "Todos los planes" }, void 0, false),
        /*#__PURE__*/_jsxDEV("option", { value: "basico", children: "Básico" }, void 0, false),
        /*#__PURE__*/_jsxDEV("option", { value: "avanzado", children: "Avanzado" }, void 0, false),
        /*#__PURE__*/_jsxDEV("option", { value: "pro", children: "Pro" }, void 0, false)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("select", {
        className: "form-select",
        style: { maxWidth: 150, fontSize: 12.5 },
        value: filtroEstadoEsc,
        onChange: e => setFiltroEstadoEsc(e.target.value),
        children: [/*#__PURE__*/_jsxDEV("option", { value: "", children: "Todos los estados" }, void 0, false),
        /*#__PURE__*/_jsxDEV("option", { value: "activa", children: "Activas" }, void 0, false),
        /*#__PURE__*/_jsxDEV("option", { value: "inactiva", children: "Inactivas" }, void 0, false)]
      }, void 0, true)]
    }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
        gap: 18
      },
      children: data.escuelas.filter(esc => !esc.es_plantel).filter(esc => {
        const texto = qEsc.trim().toLowerCase();
        if (texto && !esc.nombre.toLowerCase().includes(texto) && !(esc.clave || '').toLowerCase().includes(texto)) return false;
        if (filtroPlanEsc && (esc.plan || '').toLowerCase() !== filtroPlanEsc) return false;
        if (filtroEstadoEsc === 'activa' && !esc.activa) return false;
        if (filtroEstadoEsc === 'inactiva' && esc.activa) return false;
        return true;
      }).map(esc => {
        const m = metricasEscuela(esc.id);
        return /*#__PURE__*/_jsxDEV("div", {
          className: "card",
          style: {
            borderLeft: `4px solid ${esc.color}`,
            opacity: esc.activa ? 1 : .55,
            transition: 'all .2s'
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14,
              marginBottom: 16
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                width: 48,
                height: 48,
                borderRadius: 12,
                flexShrink: 0,
                background: `${esc.color}22`,
                border: `1px solid ${esc.color}44`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24
              },
              children: esc.logo_emoji
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                flex: 1,
                minWidth: 0
              },
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontWeight: 700,
                  fontSize: 15,
                  color: 'var(--ink)',
                  marginBottom: 2
                },
                children: esc.nombre
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  display: 'flex',
                  gap: 6,
                  alignItems: 'center',
                  flexWrap: 'wrap'
                },
                children: [/*#__PURE__*/_jsxDEV("span", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    color: 'var(--ink-4)'
                  },
                  children: esc.clave
                }, void 0, false), /*#__PURE__*/_jsxDEV("span", {
                  className: `badge ${PLAN_COLORS[esc.plan]}`,
                  children: PLANES[esc.plan]
                }, void 0, false), !esc.activa && /*#__PURE__*/_jsxDEV("span", {
                  className: "badge badge-red",
                  children: "Inactiva"
                }, void 0, false)]
              }, void 0, true)]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 10,
              marginBottom: 16
            },
            children: [{
              label: 'Alumnos',
              val: m.alumnos,
              icon: 'alumnos'
            }, {
              label: 'Cobros',
              val: m.cobros,
              icon: 'cobros'
            }, {
              label: 'Cobrado',
              val: fmt(m.cobrado).replace('MX$', '$'),
              icon: 'pay'
            }].map(stat => /*#__PURE__*/_jsxDEV("div", {
              style: {
                background: 'var(--glass-light)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 10px',
                textAlign: 'center'
              },
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  marginBottom: 4,
                  display: 'flex',
                  justifyContent: 'center'
                },
                children: /*#__PURE__*/_jsxDEV(Icon, {
                  name: stat.icon,
                  size: 16,
                  color: "var(--navy)"
                }, void 0, false)
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--ink)',
                  fontFamily: stat.label === 'Cobrado' ? 'var(--mono)' : undefined
                },
                children: stat.val
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 10,
                  color: 'var(--ink-4)',
                  textTransform: 'uppercase',
                  letterSpacing: '.4px'
                },
                children: stat.label
              }, void 0, false)]
            }, stat.label, true))
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            style: {
              fontSize: 12,
              color: 'var(--ink-3)',
              marginBottom: 14
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 6
              },
              children: [/*#__PURE__*/_jsxDEV(Icon, {
                name: "emails",
                size: 13,
                color: "var(--ink-4)"
              }, void 0, false), " ", esc.email]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              style: {
                marginTop: 4,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              },
              children: [/*#__PURE__*/_jsxDEV(Icon, {
                name: "globe",
                size: 13,
                color: "var(--ink-4)"
              }, void 0, false), " ", esc.direccion]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'flex',
              gap: 8
            },
            children: [/*#__PURE__*/_jsxDEV("button", {
              className: "btn btn-primary btn-sm",
              style: {
                flex: 1
              },
              onClick: () => onSeleccionar(esc.id),
              children: "Entrar →"
            }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
              className: "btn btn-secondary btn-sm",
              title: "Pool de CLABEs SPEI",
              onClick: () => abrirPool(esc.id),
              style: { display:'flex', alignItems:'center', gap:4, fontSize:11, fontWeight:600 },
              children: [/*#__PURE__*/_jsxDEV(Icon, { name: "bank", size: 13, color: "currentColor" }, void 0, false), "CLABEs"]
            }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
              className: "btn btn-secondary btn-sm",
              title: "Gestionar planteles",
              onClick: () => {
                setEscuelaPltId(esc.id);
                setModalPlt('list');
                cargarPlantelesDe(esc.id);
              },
              children: /*#__PURE__*/_jsxDEV(Icon, {
                name: "escuelas",
                size: 14,
                color: "currentColor"
              }, void 0, false)
            }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
              className: "btn btn-secondary btn-sm",
              onClick: () => {
                setForm({
                  ...esc
                });
                setErrorEsc('');
                setModal('form');
              },
              style: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              },
              children: /*#__PURE__*/_jsxDEV(Icon, {
                name: "edit",
                size: 14,
                color: "currentColor"
              }, void 0, false)
            }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
              className: "btn btn-secondary btn-sm",
              onClick: () => toggleActiva(esc.id),
              children: esc.activa ? /*#__PURE__*/_jsxDEV(Icon, {
                name: "shield",
                size: 14,
                color: "currentColor"
              }, void 0, false) : /*#__PURE__*/_jsxDEV(Icon, {
                name: "eyeOff",
                size: 14,
                color: "currentColor"
              }, void 0, false)
            }, void 0, false)]
          }, void 0, true)]
        }, esc.id, true);
      })
    }, void 0, false), modal === 'form' && /*#__PURE__*/_jsxDEV("div", {
      className: "modal-backdrop",
      onClick: e => e.target === e.currentTarget && setModal(null),
      children: /*#__PURE__*/_jsxDEV("div", {
        className: "modal modal-lg",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "modal-header",
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "modal-title",
            children: [form.id ? 'Editar' : 'Nueva', " escuela"]
          }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-ghost btn-sm",
            onClick: () => setModal(null),
            children: /*#__PURE__*/_jsxDEV(Icon, {
              name: "close",
              size: 16,
              color: "currentColor"
            }, void 0, false)
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-body",
          children: /*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Nombre de la escuela *"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "form-input",
                placeholder: "Instituto Tecnológico Mérida",
                value: form.nombre,
                onChange: e => setForm(f => ({
                  ...f,
                  nombre: e.target.value
                }))
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Clave / Abreviatura *"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "form-input",
                placeholder: "ITM",
                value: form.clave,
                onChange: e => setForm(f => ({
                  ...f,
                  clave: e.target.value.toUpperCase()
                })),
                style: {
                  fontFamily: 'var(--mono)'
                }
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "RFC"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "form-input",
                placeholder: "ITM9301015XA",
                value: form.rfc,
                onChange: e => setForm(f => ({
                  ...f,
                  rfc: e.target.value.toUpperCase()
                })),
                style: {
                  fontFamily: 'var(--mono)'
                }
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Plan"
              }, void 0, false), /*#__PURE__*/_jsxDEV("select", {
                className: "form-select",
                value: form.plan,
                onChange: e => setForm(f => ({
                  ...f,
                  plan: e.target.value
                })),
                children: [/*#__PURE__*/_jsxDEV("option", {
                  value: "basico",
                  children: "Básico"
                }, void 0, false), /*#__PURE__*/_jsxDEV("option", {
                  value: "avanzado",
                  children: "Avanzado"
                }, void 0, false), /*#__PURE__*/_jsxDEV("option", {
                  value: "pro",
                  children: "Pro"
                }, void 0, false)]
              }, void 0, true)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: form.id ? "Email de contacto" : "Email de contacto * (con él se crea la cuenta admin)"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "form-input",
                type: "email",
                value: form.email,
                onChange: e => setForm(f => ({
                  ...f,
                  email: e.target.value
                }))
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Teléfono"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "form-input",
                value: form.telefono,
                onChange: e => setForm(f => ({
                  ...f,
                  telefono: e.target.value
                })),
                style: {
                  fontFamily: 'var(--mono)'
                }
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              style: {
                gridColumn: '1/-1'
              },
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Dirección"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "form-input",
                placeholder: "Calle, colonia, ciudad, estado",
                value: form.direccion,
                onChange: e => setForm(f => ({
                  ...f,
                  direccion: e.target.value
                }))
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Emoji / Logo"
              }, void 0, false), /*#__PURE__*/_jsxDEV(EmojiPicker, {
                value: form.logo_emoji,
                onChange: v => setForm(f => ({
                  ...f,
                  logo_emoji: v
                }))
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Color de acento"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                type: "color",
                value: form.color,
                onChange: e => setForm(f => ({
                  ...f,
                  color: e.target.value
                })),
                style: {
                  width: '100%',
                  height: 42,
                  border: '1px solid var(--border-glow)',
                  borderRadius: 'var(--radius)',
                  cursor: 'pointer',
                  background: 'transparent'
                }
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true)
        }, void 0, false), errorEsc && /*#__PURE__*/_jsxDEV("div", {
          style: { padding: '0 20px 8px', color: 'var(--red)', fontSize: 12.5 },
          children: errorEsc
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-footer",
          children: [/*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-secondary",
            onClick: () => setModal(null),
            children: "Cancelar"
          }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-primary",
            onClick: guardar,
            disabled: !form.nombre || !form.clave || guardandoEsc || (!form.id && !form.email),
            children: guardandoEsc ? 'Guardando…' : 'Guardar escuela'
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true)
    }, void 0, false), modalPlt === 'list' && escuelaPltId && /*#__PURE__*/_jsxDEV("div", {
      className: "modal-backdrop",
      onClick: e => e.target === e.currentTarget && setModalPlt(null),
      children: /*#__PURE__*/_jsxDEV("div", {
        className: "modal modal-lg",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "modal-header",
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "modal-title",
            children: [/*#__PURE__*/_jsxDEV(Icon, {
              name: "escuelas",
              size: 16,
              color: "currentColor"
            }, void 0, false), " Planteles — ", data.escuelas.find(e => e.id === escuelaPltId)?.nombre]
          }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-ghost btn-sm",
            onClick: () => setModalPlt(null),
            children: /*#__PURE__*/_jsxDEV(Icon, {
              name: "close",
              size: 16,
              color: "currentColor"
            }, void 0, false)
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-body",
          children: [(() => {
            const plantelesFiltrados = (plantelesPanel || []).filter(p =>
              (!filtroNivelPlt || p.nivel_educativo === filtroNivelPlt) &&
              (!filtroZonaPlt || Number(p.zona_id) === Number(filtroZonaPlt))
            );
            return /*#__PURE__*/_jsxDEV(_Fragment, {
              children: [!cargandoPlt && (plantelesPanel || []).length > 0 && /*#__PURE__*/_jsxDEV("div", {
                style: { display: 'flex', gap: 8, marginBottom: 12 },
                children: [/*#__PURE__*/_jsxDEV("select", {
                  className: "form-select",
                  style: { fontSize: 12.5, padding: '6px 10px' },
                  value: filtroNivelPlt,
                  onChange: e => setFiltroNivelPlt(e.target.value),
                  children: NIVELES_EDUCATIVOS.map(n => /*#__PURE__*/_jsxDEV("option", {
                    value: n.value,
                    children: n.value ? n.label : 'Todos los niveles'
                  }, n.value, false))
                }, void 0, false), zonasCatalogo.length > 0 && /*#__PURE__*/_jsxDEV("select", {
                  className: "form-select",
                  style: { fontSize: 12.5, padding: '6px 10px' },
                  value: filtroZonaPlt,
                  onChange: e => setFiltroZonaPlt(e.target.value),
                  children: [/*#__PURE__*/_jsxDEV("option", { value: "", children: "Todas las zonas" }, void 0, false),
                  ...zonasCatalogo.map(z => /*#__PURE__*/_jsxDEV("option", { value: z.id, children: z.nombre }, z.id, false))]
                }, void 0, true)]
              }, void 0, true), cargandoPlt && /*#__PURE__*/_jsxDEV("div", {
            className: "empty-state",
            children: /*#__PURE__*/_jsxDEV("div", { className: "empty-text", children: "Cargando planteles…" }, void 0, false)
          }, void 0, false), !cargandoPlt && plantelesFiltrados.length === 0 && /*#__PURE__*/_jsxDEV("div", {
            className: "empty-state",
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "empty-icon",
              children: /*#__PURE__*/_jsxDEV(Icon, {
                name: "escuelas",
                size: 32,
                color: "currentColor"
              }, void 0, false)
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              className: "empty-text",
              children: "Sin planteles registrados"
            }, void 0, false)]
          }, void 0, true), plantelesFiltrados.map(plt => /*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 0',
              borderBottom: '1px solid var(--glass-light)'
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                flex: 1
              },
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontWeight: 600,
                  fontSize: 13,
                  color: 'var(--ink)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                },
                children: [plt.nombre, !plt.activo && /*#__PURE__*/_jsxDEV("span", {
                  className: "badge badge-gray",
                  children: "Inactivo"
                }, void 0, false), plt.nivel_educativo && /*#__PURE__*/_jsxDEV("span", {
                  className: "badge badge-gray",
                  style: { fontWeight: 400, textTransform: 'capitalize' },
                  children: plt.nivel_educativo
                }, void 0, false), plt.zona && /*#__PURE__*/_jsxDEV("span", {
                  style: { fontSize: 11, color: 'var(--ink-4)', fontWeight: 400 },
                  children: ["📍 ", plt.zona]
                }, void 0, true)]
              }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 11.5,
                  color: 'var(--ink-3)',
                  marginTop: 2
                },
                children: plt.direccion
              }, void 0, false), plt.responsable && /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 11,
                  color: 'var(--ink-4)',
                  marginTop: 1
                },
                children: ["Resp: ", plt.responsable, " · ", plt.tel]
              }, void 0, true)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
              className: "btn btn-ghost btn-sm",
              onClick: () => {
                const escPlt = (data.escuelas || []).find(e => e.id === plt.escuela_plantel_id);
                setFormPlt({
                  ...plt,
                  email: escPlt?.email || ''
                });
                setModalPlt('form');
              },
              children: /*#__PURE__*/_jsxDEV(Icon, {
                name: "edit",
                size: 13,
                color: "currentColor"
              }, void 0, false)
            }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
              className: "btn btn-ghost btn-sm",
              onClick: () => togglePlantel(plt.id),
              children: plt.activo ? /*#__PURE__*/_jsxDEV(Icon, {
                name: "shield",
                size: 13,
                color: "currentColor"
              }, void 0, false) : /*#__PURE__*/_jsxDEV(Icon, {
                name: "eyeOff",
                size: 13,
                color: "currentColor"
              }, void 0, false)
            }, void 0, false)]
          }, plt.id, true))]
            }, void 0, true);
          })()]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-footer",
          children: [/*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-secondary",
            onClick: () => setModalPlt(null),
            children: "Cerrar"
          }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-primary",
            onClick: () => {
              setFormPlt(EMPTY_PLT);
              setModalPlt('form');
            },
            children: "+ Nuevo plantel"
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true)
    }, void 0, false), modalPlt === 'form' && /*#__PURE__*/_jsxDEV("div", {
      className: "modal-backdrop",
      onClick: e => e.target === e.currentTarget && setModalPlt('list'),
      children: /*#__PURE__*/_jsxDEV("div", {
        className: "modal",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "modal-header",
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "modal-title",
            children: formPlt.id ? 'Editar plantel' : 'Nuevo plantel'
          }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-ghost btn-sm",
            onClick: () => setModalPlt('list'),
            children: /*#__PURE__*/_jsxDEV(Icon, {
              name: "close",
              size: 16,
              color: "currentColor"
            }, void 0, false)
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-body",
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "form-group",
            children: [/*#__PURE__*/_jsxDEV("label", {
              className: "form-label",
              children: "Nombre del plantel *"
            }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
              className: "form-input",
              placeholder: "Ej: Campus Norte",
              value: formPlt.nombre,
              onChange: e => setFormPlt(p => ({
                ...p,
                nombre: e.target.value
              }))
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            className: "form-group",
            children: [/*#__PURE__*/_jsxDEV("label", {
              className: "form-label",
              children: "Dirección"
            }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
              className: "form-input",
              placeholder: "Calle, Número, Colonia, Ciudad",
              value: formPlt.direccion || '',
              onChange: e => setFormPlt(p => ({
                ...p,
                direccion: e.target.value
              }))
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Nivel educativo"
              }, void 0, false), /*#__PURE__*/_jsxDEV("select", {
                className: "form-select",
                value: formPlt.nivel_educativo || '',
                onChange: e => setFormPlt(p => ({ ...p, nivel_educativo: e.target.value })),
                children: NIVELES_EDUCATIVOS.map(n => /*#__PURE__*/_jsxDEV("option", {
                  value: n.value,
                  children: n.label
                }, n.value, false))
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Zona"
              }, void 0, false), /*#__PURE__*/_jsxDEV("select", {
                className: "form-select",
                value: formPlt.zona_id || '',
                onChange: e => {
                  const zid = e.target.value;
                  const zSel = zonasCatalogo.find(z => String(z.id) === String(zid));
                  setFormPlt(p => ({ ...p, zona_id: zid, zona: zSel ? zSel.nombre : '' }));
                },
                children: [/*#__PURE__*/_jsxDEV("option", { value: "", children: "— Sin zona —" }, void 0, false),
                ...zonasCatalogo.map(z => /*#__PURE__*/_jsxDEV("option", { value: z.id, children: z.nombre }, z.id, false))]
              }, void 0, true)]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Responsable"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "form-input",
                placeholder: "Nombre del director/coordinador",
                value: formPlt.responsable || '',
                onChange: e => setFormPlt(p => ({
                  ...p,
                  responsable: e.target.value
                }))
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Teléfono directo"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "form-input",
                placeholder: "9991234560",
                value: formPlt.tel || '',
                onChange: e => setFormPlt(p => ({
                  ...p,
                  tel: e.target.value
                })),
                style: {
                  fontFamily: 'var(--mono)'
                }
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            className: "form-group",
            children: [/*#__PURE__*/_jsxDEV("label", {
              className: "form-label",
              children: "Correo de acceso *"
            }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
              className: "form-input",
              type: "email",
              placeholder: "plantel@correo.com",
              value: formPlt.email || '',
              onChange: e => setFormPlt(p => ({
                ...p,
                email: e.target.value
              }))
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 11,
                color: 'var(--ink-4)',
                marginTop: 4
              },
              children: formPlt.id
                ? "Con este correo el responsable del plantel inicia sesión. Si lo cambias, deberá usar el nuevo correo la próxima vez."
                : "Con este correo el responsable del plantel iniciará sesión. Se generará una contraseña temporal."
            }, void 0, false)]
          }, void 0, true), errorPlt && /*#__PURE__*/_jsxDEV("div", {
            style: {
              color: 'var(--red, #d33)',
              fontSize: 12,
              marginTop: 8
            },
            children: errorPlt
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-footer",
          children: [/*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-secondary",
            onClick: () => setModalPlt('list'),
            children: "Cancelar"
          }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-primary",
            onClick: guardarPlantel,
            disabled: !formPlt.nombre || guardandoPlt || !formPlt.email,
            children: guardandoPlt ? 'Guardando…' : 'Guardar plantel'
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true)
    }, void 0, false), modalPool && /*#__PURE__*/_jsxDEV("div", {
      className: "modal-backdrop",
      onClick: e => e.target === e.currentTarget && setModalPool(false),
      children: /*#__PURE__*/_jsxDEV("div", {
        className: "modal modal-lg",
        style: { maxWidth: 700 },
        children: [
          /*#__PURE__*/_jsxDEV("div", { className: "modal-header",
            children: [
              /*#__PURE__*/_jsxDEV("span", { className: "modal-title", children: "Pool de CLABEs SPEI — " + (data.escuelas.find(e=>e.id===poolEscId)?.nombre||'') }, void 0, false),
              /*#__PURE__*/_jsxDEV("button", { className: "modal-close", onClick: ()=>setModalPool(false), children: "✕" }, void 0, false)
            ]
          }, void 0, true),
          /*#__PURE__*/_jsxDEV("div", { className: "modal-body",
            children: [
              /* Contadores */
              poolData && /*#__PURE__*/_jsxDEV("div", {
                style: { display:'flex', gap:10, marginBottom:18, flexWrap:'wrap' },
                children: [
                  /*#__PURE__*/_jsxDEV("div", { style:{background:'var(--green-glow)',border:'1px solid var(--green)',borderRadius:10,padding:'10px 18px',flex:1,textAlign:'center'},
                    children: [/*#__PURE__*/_jsxDEV("div", {style:{fontSize:22,fontWeight:700,color:'var(--green)'}, children: poolData.totales.libre}, void 0, false), /*#__PURE__*/_jsxDEV("div", {style:{fontSize:11,color:'var(--ink-3)'}, children:"Libres"}, void 0, false)]
                  }, void 0, true),
                  /*#__PURE__*/_jsxDEV("div", { style:{background:'var(--accent-glow)',border:'1px solid var(--accent)',borderRadius:10,padding:'10px 18px',flex:1,textAlign:'center'},
                    children: [/*#__PURE__*/_jsxDEV("div", {style:{fontSize:22,fontWeight:700,color:'var(--accent)'}, children: poolData.totales.asignada}, void 0, false), /*#__PURE__*/_jsxDEV("div", {style:{fontSize:11,color:'var(--ink-3)'}, children:"Asignadas"}, void 0, false)]
                  }, void 0, true),
                  /*#__PURE__*/_jsxDEV("div", { style:{background:'var(--glass)',border:'1px solid var(--glass-light)',borderRadius:10,padding:'10px 18px',flex:1,textAlign:'center'},
                    children: [/*#__PURE__*/_jsxDEV("div", {style:{fontSize:22,fontWeight:700,color:'var(--ink-3)'}, children: poolData.totales.liberada}, void 0, false), /*#__PURE__*/_jsxDEV("div", {style:{fontSize:11,color:'var(--ink-3)'}, children:"Liberadas"}, void 0, false)]
                  }, void 0, true)
                ]
              }, void 0, true),
              /* Importar */
              /*#__PURE__*/_jsxDEV("div", {
                style:{background:'var(--glass)',border:'1px solid var(--glass-light)',borderRadius:12,padding:16,marginBottom:16},
                children: [
                  /*#__PURE__*/_jsxDEV("div", {style:{fontWeight:600,fontSize:13,marginBottom:8,color:'var(--ink-1)'}, children:"Importar CLABEs al pool"}, void 0, false),
                  /*#__PURE__*/_jsxDEV("div", {style:{fontSize:11,color:'var(--ink-3)',marginBottom:8}, children:"Pega las CLABEs (18 dígitos cada una), una por línea o separadas por coma. Puedes copiarlas desde Excel."}, void 0, false),
                  /*#__PURE__*/_jsxDEV("textarea", {
                    className:"form-input", rows:4,
                    placeholder:"646180633010000100\n646180633010000101\n646180633010000102",
                    value: poolImportTxt,
                    onChange: e => setPoolImportTxt(e.target.value),
                    style:{fontFamily:'monospace',fontSize:12,marginBottom:8}
                  }, void 0, false),
                  /*#__PURE__*/_jsxDEV("div", {
                    style:{display:'flex',alignItems:'center',gap:10,margin:'10px 0'},
                    children: [
                      /*#__PURE__*/_jsxDEV("div", {style:{flex:1,height:1,background:'var(--glass-light)'}}, void 0, false),
                      /*#__PURE__*/_jsxDEV("span", {style:{fontSize:11,color:'var(--ink-3)'}, children:"o"}, void 0, false),
                      /*#__PURE__*/_jsxDEV("div", {style:{flex:1,height:1,background:'var(--glass-light)'}}, void 0, false)
                    ]
                  }, void 0, true),
                  /*#__PURE__*/_jsxDEV("label", {
                    htmlFor: "input-clabes-excel",
                    className: "btn btn-secondary btn-sm",
                    style: { display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer', marginBottom:8 },
                    children: [/*#__PURE__*/_jsxDEV(Icon, { name: "upload", size: 13, color: "currentColor" }, void 0, false), "Subir archivo Excel (.xlsx, .csv)"]
                  }, void 0, true),
                  /*#__PURE__*/_jsxDEV("input", {
                    id: "input-clabes-excel",
                    type: "file",
                    accept: ".xlsx,.xls,.csv",
                    onChange: manejarArchivoExcel,
                    style: { display: 'none' }
                  }, void 0, false),
                  /*#__PURE__*/_jsxDEV("div", {style:{fontSize:11,color:'var(--ink-3)',marginBottom:8}, children:"El archivo puede tener las CLABEs en cualquier columna o fila; el sistema las detecta automáticamente (18 dígitos)."}, void 0, false),
                  poolImportMsg && /*#__PURE__*/_jsxDEV("div", {style:{fontSize:12,marginBottom:8,color: poolImportMsg.startsWith('✅') ? 'var(--green)':'var(--red)'}, children: poolImportMsg}, void 0, false),
                  /*#__PURE__*/_jsxDEV("button", {
                    className:"btn btn-primary btn-sm",
                    onClick: importarClabes,
                    disabled: poolLoading || !poolImportTxt.trim(),
                    children: poolLoading ? "Importando…" : "Importar CLABEs pegadas"
                  }, void 0, false)
                ]
              }, void 0, true),
              /* Tabla del pool */
              poolLoading && !poolData && /*#__PURE__*/_jsxDEV("div", {style:{textAlign:'center',padding:24,color:'var(--ink-3)'}, children:"Cargando pool…"}, void 0, false),
              poolData && poolData.pool.length === 0 && /*#__PURE__*/_jsxDEV("div", {style:{textAlign:'center',padding:24,color:'var(--ink-3)'}, children:"No hay CLABEs en el pool. Importa CLABEs arriba."}, void 0, false),
              poolData && poolData.pool.length > 0 && /*#__PURE__*/_jsxDEV("div", {
                style:{maxHeight:280,overflowY:'auto',border:'1px solid var(--glass-light)',borderRadius:10},
                children: [
                  /*#__PURE__*/_jsxDEV("table", { style:{width:'100%',borderCollapse:'collapse',fontSize:12},
                    children: [
                      /*#__PURE__*/_jsxDEV("thead", {
                        children: /*#__PURE__*/_jsxDEV("tr", {
                          style:{background:'var(--glass)',position:'sticky',top:0},
                          children: ["CLABE","Estado","Alumno","Fecha asign.",""].map((h,i)=>
                            /*#__PURE__*/_jsxDEV("th", {style:{padding:'8px 12px',textAlign:'left',fontWeight:600,color:'var(--ink-2)',borderBottom:'1px solid var(--glass-light)'}, children:h}, i, false)
                          )
                        }, void 0, true)
                      }, void 0, false),
                      /*#__PURE__*/_jsxDEV("tbody", {
                        children: poolData.pool.map((row,i) =>
                          /*#__PURE__*/_jsxDEV("tr", {
                            style:{borderBottom:'1px solid var(--glass-light)',background: i%2===0?'transparent':'var(--glass)'},
                            children: [
                              /*#__PURE__*/_jsxDEV("td", {style:{padding:'7px 12px',fontFamily:'monospace',letterSpacing:1}, children: row.clabe.match(/.{1,4}/g).join(' ')}, void 0, false),
                              /*#__PURE__*/_jsxDEV("td", {style:{padding:'7px 12px'}, children:
                                /*#__PURE__*/_jsxDEV("span", {
                                  style:{
                                    padding:'2px 8px',borderRadius:20,fontSize:11,fontWeight:600,
                                    background: row.estado==='libre'?'var(--green-glow)':row.estado==='asignada'?'var(--accent-glow)':'var(--glass)',
                                    color: row.estado==='libre'?'var(--green)':row.estado==='asignada'?'var(--accent)':'var(--ink-3)'
                                  },
                                  children: row.estado==='libre'?'Libre':row.estado==='asignada'?'Asignada':'Liberada'
                                }, void 0, false)
                              }, void 0, false),
                              /*#__PURE__*/_jsxDEV("td", {style:{padding:'7px 12px',color:'var(--ink-2)'}, children: row.alumno || '—'}, void 0, false),
                              /*#__PURE__*/_jsxDEV("td", {style:{padding:'7px 12px',color:'var(--ink-3)'}, children: row.fecha_asign || '—'}, void 0, false),
                              /*#__PURE__*/_jsxDEV("td", {style:{padding:'7px 12px'},
                                children: row.estado !== 'asignada' && /*#__PURE__*/_jsxDEV("button", {
                                  style:{background:'none',border:'none',cursor:'pointer',color:'var(--red)',fontSize:13},
                                  title:"Eliminar del pool",
                                  onClick: () => eliminarLibres([row.id]),
                                  children: "✕"
                                }, void 0, false)
                              }, void 0, false)
                            ]
                          }, row.id, true)
                        )
                      }, void 0, false)
                    ]
                  }, void 0, true)
                ]
              }, void 0, true)
            ]
          }, void 0, true),
          /*#__PURE__*/_jsxDEV("div", { className: "modal-footer",
            children: /*#__PURE__*/_jsxDEV("button", { className:"btn btn-secondary", onClick:()=>setModalPool(false), children:"Cerrar"}, void 0, false)
          }, void 0, false)
        ]
      }, void 0, true)
    }, void 0, false)]
  }, void 0, true);
}