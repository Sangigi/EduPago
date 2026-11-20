var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};
// [OF-2] IVA, clave SAT y unidad por concepto.
// El precio capturado es SIEMPRE el precio final (con impuesto incluido); estas
// opciones solo definen cómo se DESGLOSA en la factura (CFDI). La tasa correcta
// la decide el contador del colegio. Espejo de impuestos_sugerencia_categoria()
// en lib/helpers_impuestos.php.
const _IVA_OPCIONES = [
  { value: 'exento', label: 'Exento' },
  { value: '0', label: 'Tasa 0%' },
  { value: '16', label: '16% (incluido en el precio)' }
];
const _IVA_CORTO = { exento: 'IVA exento', '0': 'IVA tasa 0%', '16': 'IVA 16%' };
const _CLAVE_SAT_DEFECTO = '86101800';
const _UNIDADES_COMUNES = [
  { value: 'E48', label: 'E48 · Servicio' },
  { value: 'H87', label: 'H87 · Pieza' }
];
function _prodSugerenciaImpuestos(categoria) {
  if (['colegiatura', 'inscripcion', 'anualidad', 'examen'].includes(categoria)) return { iva_tasa: 'exento', clave_unidad: 'E48' };
  if (categoria === 'uniforme') return { iva_tasa: '16', clave_unidad: 'H87' };
  return { iva_tasa: '16', clave_unidad: 'E48' };
}
// Aviso de "revisa tus tasas": se oculta solo cuando algún concepto ya tiene
// una tasa distinta de 16 (señal de que alguien ya lo revisó) o si el admin lo
// cierra (se recuerda por colegio en este navegador).
function _prodAvisoCerrado(escuelaId) {
  try { return localStorage.getItem('of2_aviso_iva_' + escuelaId) === '1'; } catch (e) { return false; }
}
/* views/Productos.jsx v2 */
function Productos({
  data,
  setData,
  escuela_id
}) {
  const {
    useState
  } = React;
  const CATS = ['colegiatura', 'anualidad', 'inscripcion', 'examen', 'uniforme', 'material', 'transporte', 'comedor', 'extracurricular', 'beca', 'otro'];
  const EMPTY = {
    nombre: '',
    categoria: 'colegiatura',
    precio: 0,
    emoji: '',
    activo: true,
    tipo: 'unico',
    periodicidad_meses: 1,
    fecha_inicio: '',
    dia_ventana_fin: 5,
    penalizacion_tipo: '',
    penalizacion_valor: 0,
    // [F5] A quién se le genera el cobro recurrente: 'todos' | 'grados' | 'grupos'.
    alcance: 'todos',
    alcance_ids: [],
    // [OF-2] Sugerencia para la categoría inicial (colegiatura → exento). Se
    // vuelve a sugerir al cambiar la categoría mientras el admin no toque el IVA.
    iva_tasa: 'exento',
    clave_sat: _CLAVE_SAT_DEFECTO,
    clave_unidad: 'E48',
    _impTocado: false,
    _unidadOtra: false,
    maneja_existencias: false // [OF-6]
  };
  const rolSesion = (typeof AuthController !== 'undefined' && AuthController.getSession && (AuthController.getSession() || {}).rol) || '';
  const [avisoCerrado, setAvisoCerrado] = useState(() => _prodAvisoCerrado(escuela_id));
  const hayTasaEditada = (data.productos || []).some(p => p.iva_tasa !== undefined && p.iva_tasa !== null && String(p.iva_tasa) !== '16');
  const mostrarAvisoIva = rolSesion === 'admin' && !avisoCerrado && !hayTasaEditada;
  const cerrarAvisoIva = () => {
    try { localStorage.setItem('of2_aviso_iva_' + escuela_id, '1'); } catch (e) { /* sin almacenamiento: solo se cierra ahora */ }
    setAvisoCerrado(true);
  };
  const PERIODICIDADES = [
    { value: 1, label: 'Mensual' },
    { value: 6, label: 'Semestral' },
    { value: 12, label: 'Anual' }
  ];
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [q, setQ] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errForm, setErrForm] = useState('');
  // [F5] Catálogo de grados (F3) y grupos del ciclo actual, sacado de
  // escolar_catalogos para el selector "Se cobra a" y para poner nombre a los
  // ids en la lista. null = cargando. Si falla (módulo escolar apagado o sin
  // instalar) el concepto se puede seguir guardando como "Todos los alumnos".
  const [catAlc, setCatAlc] = useState(null);
  // [F5] Vista previa: a cuántos alumnos activos se les generaría hoy el cobro.
  const [previa, setPrevia] = useState(null);
  React.useEffect(() => {
    if (!escuela_id) {
      setCatAlc({ grados: null, grupos: [], ciclo: null, error: 'Selecciona un colegio.' });
      return;
    }
    let vivo = true;
    setCatAlc(null);
    ApiClient.post('escolar_catalogos', { escuela_id }).then(res => {
      if (!vivo) return;
      if (!res || !res.success) {
        setCatAlc({ grados: null, grupos: [], ciclo: null, error: (res && res.error) || 'No se pudo cargar el control escolar.' });
        return;
      }
      const ciclo = (res.ciclos || []).find(c => Number(c.id) === Number(res.ciclo_id)) || null;
      setCatAlc({ grados: Array.isArray(res.grados) ? res.grados : null, grupos: res.grupos || [], ciclo, error: '' });
    }).catch(e => {
      if (!vivo) return;
      const msg = /HTTP 403/.test(e.message) ? 'el control escolar no está habilitado para este colegio.' : e.message;
      setCatAlc({ grados: null, grupos: [], ciclo: null, error: msg });
    });
    return () => { vivo = false; };
  }, [escuela_id]);
  const idsForm = _prodAlcanceIds(form.alcance_ids);
  const idsFormClave = idsForm.join(',');
  React.useEffect(() => {
    if (modal !== 'form' || form.tipo !== 'recurrente') {
      setPrevia(null);
      return;
    }
    let vivo = true;
    setPrevia(p => ({ ...(p || {}), cargando: true }));
    // Se espera un momento para no pedir una cuenta por cada clic en los chips.
    const t = setTimeout(() => {
      ApiClient.post('producto_alcance_vista_previa', { escuela_id, alcance: form.alcance || 'todos', alcance_ids: idsForm })
        .then(res => {
          if (!vivo) return;
          setPrevia(res && res.success ? { ...res, cargando: false } : { cargando: false, error: (res && res.error) || 'No se pudo calcular a cuántos alumnos aplica.' });
        })
        .catch(e => { if (vivo) setPrevia({ cargando: false, error: e.message }); });
    }, 350);
    return () => { vivo = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal, form.tipo, form.alcance, idsFormClave, escuela_id]);
  // [F5] Abre el formulario con un concepto existente (alcance_ids llega como
  // texto JSON desde cargar_datos y como arreglo desde editar_producto).
  const formDeProducto = p => ({
    ...EMPTY,
    ...p,
    fecha_inicio: p.fecha_inicio || '',
    penalizacion_tipo: p.penalizacion_tipo || '',
    penalizacion_valor: p.penalizacion_valor || 0,
    alcance: p.alcance || 'todos',
    alcance_ids: _prodAlcanceIds(p.alcance_ids),
    // [OF-2] Un concepto anterior a la migración no trae estos campos: se
    // muestra con lo que se facturaba antes (16%, 86101800, E48), no con la sugerencia.
    iva_tasa: p.iva_tasa != null ? String(p.iva_tasa) : '16',
    clave_sat: p.clave_sat || _CLAVE_SAT_DEFECTO,
    clave_unidad: p.clave_unidad || 'E48',
    _impTocado: true,
    _unidadOtra: !!p.clave_unidad && !_UNIDADES_COMUNES.some(u => u.value === p.clave_unidad)
  });
  // [OF-6] "Maneja existencias" solo para conceptos físicos y únicos (el servidor lo exige igual:
  // inventario_concepto_elegible en lib/helpers_inventario.php). Una colegiatura o un servicio nunca.
  const _CATS_FISICAS_INV = ['uniforme', 'material', 'comedor', 'otro'];
  const elegibleInv = _CATS_FISICAS_INV.includes(form.categoria) && form.tipo !== 'recurrente' && !(Number(form.precio) < 0);
  const lista = data.productos.filter(p => !q || p.nombre.toLowerCase().includes(q.toLowerCase()) || p.categoria.toLowerCase().includes(q.toLowerCase()));
  const guardar = async () => {
    setErrForm('');
    if (!form.nombre || form.precio === undefined) return;
    if (form.tipo === 'recurrente') {
      if (!form.fecha_inicio) return setErrForm('Define la fecha de inicio del cobro recurrente.');
      const diaInicioDerivado = new Date(form.fecha_inicio + 'T00:00:00').getDate();
      if (diaInicioDerivado > 28) return setErrForm('Elige un día 1-28 en "Empieza a cobrarse" (los días 29-31 no existen en todos los meses).');
      if (form.dia_ventana_fin < diaInicioDerivado) return setErrForm(`El día de cierre debe ser igual o posterior al día ${diaInicioDerivado} (el día en que abre, según la fecha de inicio).`);
      if (form.penalizacion_tipo && (!form.penalizacion_valor || form.penalizacion_valor <= 0)) return setErrForm('Define un valor de penalización mayor a cero, o quita el tipo de penalización.');
      // [F5]
      if ((form.alcance === 'grados' || form.alcance === 'grupos') && idsForm.length === 0) return setErrForm(form.alcance === 'grados' ? 'Elige al menos un grado al que se le cobrará este concepto.' : 'Elige al menos un grupo al que se le cobrará este concepto.');
    }
    // [F5] El alcance solo aplica a recurrentes; un concepto único va siempre a 'todos'.
    const esRecurrente = form.tipo === 'recurrente';
    const alcanceEnvio = esRecurrente ? (form.alcance || 'todos') : 'todos';
    // [OF-2] Validación de los campos fiscales (el servidor vuelve a validar).
    const claveSat = String(form.clave_sat || '').trim();
    const unidad = String(form.clave_unidad || '').trim().toUpperCase();
    if (!/^[0-9]{8}$/.test(claveSat)) return setErrForm('La clave SAT debe tener exactamente 8 dígitos (por ejemplo 86101800).');
    if (!/^[A-Z0-9]{2,3}$/.test(unidad)) return setErrForm('La unidad debe ser una clave SAT de 2 o 3 caracteres (por ejemplo E48 o H87).');
    const { _impTocado, _unidadOtra, ...formLimpio } = form;
    // [OF-6] Solo se manda la casilla si el concepto es físico (o ya la traía): un concepto que no
    // es elegible nunca queda con existencias, y un formulario sin la clave no toca el control.
    const payloadInv = (form.maneja_existencias === undefined && !elegibleInv) ? {} : { maneja_existencias: elegibleInv ? !!form.maneja_existencias : false };
    const payload = { ...formLimpio, clave_sat: claveSat, clave_unidad: unidad, alcance: alcanceEnvio, alcance_ids: alcanceEnvio === 'todos' ? [] : idsForm, ...payloadInv };
    setGuardando(true);
    let lastAviso = ''; // [OF-2] aviso del servidor (p. ej. falta correr la migración)
    try {
      if (form.id) {
        const res = await ProductosController.editar(payload); // [F5] antes: form
        lastAviso = res.aviso || '';
        const newData = {
          ...data,
          productos: data.productos.map(p => p.id === form.id ? { ...p, ...res.producto } : p)
        };
        setData(newData);
        AppModel.save(newData);
      } else {
        const res = await ProductosController.crear({ ...payload, escuela_id }); // [F5] antes: form
        lastAviso = res.aviso || '';
        const newData = {
          ...data,
          productos: [...data.productos, res.producto]
        };
        setData(newData);
        AppModel.save(newData);
      }
      setModal(null);
      setForm(EMPTY);
      if (lastAviso) alert(lastAviso);
    } catch (e) {
      alert('No se pudo guardar el concepto: ' + e.message);
    } finally {
      setGuardando(false);
    }
  };
  const toggleActivo = async id => {
    try {
      const res = await ProductosController.toggleActivo(id);
      const newData = {
        ...data,
        productos: data.productos.map(p => p.id === id ? { ...p, activo: res.activo } : p)
      };
      setData(newData);
      AppModel.save(newData);
    } catch (e) {
      alert('No se pudo actualizar el concepto: ' + e.message);
    }
  };
  const CAT_LABELS = {
    colegiatura: 'Colegiatura',
    anualidad: 'Anualidad',
    inscripcion: 'Inscripción',
    examen: 'Examen',
    uniforme: 'Uniforme',
    material: 'Material',
    transporte: 'Transporte',
    comedor: 'Comedor',
    extracurricular: 'Extracurricular',
    beca: 'Beca / Descuento',
    otro: 'Otro'
  };
  return /*#__PURE__*/_jsxDEV("div", {
    children: [mostrarAvisoIva && /*#__PURE__*/_jsxDEV("div", {
      // [OF-2] Solo admin; se va solo cuando algún concepto ya tiene otra tasa, o al cerrarlo.
      style: {
        display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14, padding: '12px 14px',
        background: 'var(--yellow-glow, rgba(245,158,11,.12))', border: '1px solid var(--yellow, #f59e0b)',
        borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--ink)'
      },
      children: [/*#__PURE__*/_jsxDEV("div", {
        style: { flex: 1 },
        children: "Hoy todos tus conceptos se facturan con IVA 16%. Revisa con tu contador cuáles van exentos o a tasa 0 y ajústalos aquí."
      }, 't', false), /*#__PURE__*/_jsxDEV("button", {
        className: "btn btn-ghost btn-sm",
        onClick: cerrarAvisoIva,
        children: "Cerrar"
      }, 'x', false)]
    }, 'aviso-iva', true), /*#__PURE__*/_jsxDEV("div", {
      className: "card",
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "card-header",
        children: [/*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "card-title",
            children: "Conceptos de pago"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "card-sub",
            children: [data.productos.filter(p => p.activo).length, " activos"]
          }, void 0, true)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
          className: "btn btn-primary",
          onClick: () => {
            setForm(EMPTY);
            setErrForm('');
            setModal('form');
          },
          children: "+ Nuevo concepto"
        }, void 0, false)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        className: "search-bar",
        style: {
          marginBottom: 16
        },
        children: [/*#__PURE__*/_jsxDEV("span", {
          className: "search-icon",
          children: /*#__PURE__*/_jsxDEV(Icon, {
            name: "search",
            size: 15,
            color: "currentColor"
          }, void 0, false)
        }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
          placeholder: "Buscar conceptos…",
          value: q,
          onChange: e => setQ(e.target.value)
        }, void 0, false)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        style: {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))',
          gap: 12
        },
        children: [lista.length === 0 && /*#__PURE__*/_jsxDEV("div", {
          className: "empty-state",
          style: {
            gridColumn: '1/-1'
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "empty-icon",
            children: /*#__PURE__*/_jsxDEV(Icon, {
              name: "productos",
              size: 36,
              color: "currentColor"
            }, void 0, false)
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "empty-text",
            children: "Sin conceptos"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "empty-sub",
            children: "Crea los conceptos de pago de esta escuela"
          }, void 0, false)]
        }, void 0, true), lista.map(p => /*#__PURE__*/_jsxDEV("div", {
          onClick: () => {
            setForm(formDeProducto(p)); // [F5] incluye alcance / alcance_ids
            setErrForm('');
            setModal('form');
          },
          style: {
            background: 'var(--glass-light)',
            border: '1px solid var(--border-glow)',
            borderRadius: 'var(--radius)',
            padding: '14px 16px',
            opacity: p.activo ? 1 : .5,
            transition: 'all .2s',
            cursor: 'pointer'
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 10
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'var(--accent-glow)',
                border: '1px solid var(--border-active)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                flexShrink: 0
              },
              children: p.emoji
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                flex: 1,
                minWidth: 0
              },
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontWeight: 600,
                  fontSize: 13,
                  color: 'var(--ink)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                },
                children: p.nombre
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 11,
                  color: 'var(--ink-4)',
                  marginTop: 1
                },
                children: CAT_LABELS[p.categoria] || p.categoria
              }, void 0, false), p.iva_tasa != null && /*#__PURE__*/_jsxDEV("div", {
                // [OF-2] Cómo se factura este concepto.
                style: { fontSize: 10.5, color: 'var(--ink-3)', marginTop: 2 },
                children: (_IVA_CORTO[String(p.iva_tasa)] || p.iva_tasa) + ' · ' + (p.clave_unidad || 'E48')
              }, void 0, false), p.tipo === 'recurrente' &&/*#__PURE__*/_jsxDEV("div", {
                style: { fontSize: 10.5, color: 'var(--accent, #bdcf00)', marginTop: 2, fontWeight: 600 },
                children: "🔁 " + (PERIODICIDADES.find(pe => pe.value === p.periodicidad_meses)?.label || 'Recurrente') + ` · día ${p.dia_ventana_inicio}-${p.dia_ventana_fin}`
              }, void 0, false), p.tipo === 'recurrente' && /*#__PURE__*/_jsxDEV("div", {
                // [F5] A quién se le cobra (todos / grados / grupos).
                title: _prodAlcanceTexto(p, catAlc, true),
                style: { fontSize: 10.5, color: 'var(--ink-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
                children: _prodAlcanceTexto(p, catAlc, false)
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              fontFamily: 'var(--mono)',
              fontSize: p.precio < 0 ? 16 : 18,
              fontWeight: 700,
              color: p.precio < 0 ? 'var(--amber)' : p.precio === 0 ? 'var(--ink-4)' : 'var(--green)',
              marginBottom: 10
            },
            children: [p.precio < 0 ? '-' : '', fmt(Math.abs(p.precio)), p.precio < 0 && /*#__PURE__*/_jsxDEV("span", {
              style: {
                fontSize: 12,
                fontFamily: 'var(--font)',
                color: 'var(--ink-4)',
                marginLeft: 4
              },
              children: "descuento"
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            onClick: e => e.stopPropagation(),
            style: {
              display: 'flex',
              gap: 6
            },
            children: [/*#__PURE__*/_jsxDEV("button", {
              className: "btn btn-ghost btn-sm",
              style: {
                flex: 1
              },
              onClick: () => {
                setForm(formDeProducto(p)); // [F5] incluye alcance / alcance_ids
                setErrForm('');
                setModal('form');
              },
              children: [/*#__PURE__*/_jsxDEV(Icon, {
                name: "edit",
                size: 14,
                color: "currentColor"
              }, void 0, false), " Editar"]
            }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
              className: "btn btn-ghost btn-sm",
              onClick: () => toggleActivo(p.id),
              children: p.activo ? /*#__PURE__*/_jsxDEV(Icon, {
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
        }, p.id, true))]
      }, void 0, true)]
    }, void 0, true), modal === 'form' && /*#__PURE__*/_jsxDEV("div", {
      className: "modal-backdrop",
      onClick: e => e.target === e.currentTarget && setModal(null),
      children: /*#__PURE__*/_jsxDEV("div", {
        className: "modal",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "modal-header",
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "modal-title",
            children: [form.id ? 'Editar' : 'Nuevo', " concepto"]
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
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: 12,
              alignItems: 'start',
              marginBottom: 12
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Emoji"
              }, void 0, false), /*#__PURE__*/_jsxDEV(EmojiPicker, {
                value: form.emoji,
                onChange: v => setForm(f => ({
                  ...f,
                  emoji: v
                })),
                size: 22
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Nombre del concepto *"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "form-input",
                placeholder: "Ej: Colegiatura Mensual",
                value: form.nombre,
                onChange: e => setForm(f => ({
                  ...f,
                  nombre: e.target.value
                }))
              }, void 0, false)]
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
                children: "Categoría"
              }, void 0, false), /*#__PURE__*/_jsxDEV("select", {
                className: "form-select",
                value: form.categoria,
                onChange: e => setForm(f => ({
                  ...f,
                  categoria: e.target.value,
                  // [OF-2] Al CREAR, la categoría sugiere IVA y unidad mientras el admin no los toque.
                  ...(!f.id && !f._impTocado ? _prodSugerenciaImpuestos(e.target.value) : {}),
                  ...(!f.id && !f._impTocado ? { _unidadOtra: false } : {})
                })),
                children: CATS.map(c => /*#__PURE__*/_jsxDEV("option", {
                  value: c,
                  children: CAT_LABELS[c] || c
                }, c, false))
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Precio (negativo = descuento)"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "form-input",
                type: "number",
                placeholder: "0.00",
                value: form.precio,
                onChange: e => setForm(f => ({
                  ...f,
                  precio: parseFloat(e.target.value) || 0
                })),
                style: {
                  fontFamily: 'var(--mono)'
                }
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true), elegibleInv && /*#__PURE__*/_jsxDEV("div", {
            // [OF-6] Inventario: solo conceptos físicos (uniforme, material, comedor, otro) y únicos.
            style: { marginTop: 12, padding: 12, border: '1px solid var(--border, #e5e7eb)', borderRadius: 'var(--radius-sm)' },
            children: [/*#__PURE__*/_jsxDEV("label", {
              style: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' },
              children: [/*#__PURE__*/_jsxDEV("input", {
                type: "checkbox",
                checked: !!form.maneja_existencias,
                onChange: e => setForm(f => ({ ...f, maneja_existencias: e.target.checked }))
              }, 'c', false), "Maneja existencias (inventario)"]
            }, 'l', true), /*#__PURE__*/_jsxDEV("div", {
              style: { fontSize: 11, color: 'var(--ink-4)', marginTop: 6, lineHeight: 1.4 },
              children: "Las ventas en Caja descuentan piezas y verás \"Agotado\" en rojo (sin bloquear la venta). Cada talla es su propio concepto (\"Playera deportiva T8\"). La existencia se captura y se cuenta en Inventario; el concepto de una colegiatura o un servicio nunca la maneja."
            }, 'n', false)]
          }, 'inv', true), /*#__PURE__*/_jsxDEV("div", {
            // [OF-2] Datos fiscales del concepto (cómo se desglosa en la factura).
            style: { marginTop: 12, padding: 12, border: '1px solid var(--border, #e5e7eb)', borderRadius: 'var(--radius-sm)' },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: { fontSize: 12, fontWeight: 600, marginBottom: 8 },
              children: "Facturación (CFDI)"
            }, 'ft', false), /*#__PURE__*/_jsxDEV("div", {
              style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
              children: [/*#__PURE__*/_jsxDEV("div", {
                className: "form-group",
                children: [/*#__PURE__*/_jsxDEV("label", { className: "form-label", children: "IVA" }, 'l', false),
                /*#__PURE__*/_jsxDEV("select", {
                  className: "form-select",
                  value: form.iva_tasa,
                  onChange: e => setForm(f => ({ ...f, iva_tasa: e.target.value, _impTocado: true })),
                  children: _IVA_OPCIONES.map(o => /*#__PURE__*/_jsxDEV("option", { value: o.value, children: o.label }, o.value, false))
                }, 's', false)]
              }, 'iva', true), /*#__PURE__*/_jsxDEV("div", {
                className: "form-group",
                children: [/*#__PURE__*/_jsxDEV("label", { className: "form-label", children: "Unidad" }, 'l', false),
                /*#__PURE__*/_jsxDEV("select", {
                  className: "form-select",
                  value: (form._unidadOtra || !_UNIDADES_COMUNES.some(u => u.value === form.clave_unidad)) ? 'otra' : form.clave_unidad,
                  onChange: e => setForm(f => e.target.value === 'otra'
                    ? { ...f, _unidadOtra: true, _impTocado: true, clave_unidad: '' }
                    : { ...f, _unidadOtra: false, _impTocado: true, clave_unidad: e.target.value }),
                  children: _UNIDADES_COMUNES.map(u => /*#__PURE__*/_jsxDEV("option", { value: u.value, children: u.label }, u.value, false))
                    .concat([/*#__PURE__*/_jsxDEV("option", { value: 'otra', children: 'Otra (escribir clave)' }, 'otra', false)])
                }, 's', false), (form._unidadOtra || !_UNIDADES_COMUNES.some(u => u.value === form.clave_unidad)) && /*#__PURE__*/_jsxDEV("input", {
                  className: "form-input",
                  style: { marginTop: 6, fontFamily: 'var(--mono)', textTransform: 'uppercase' },
                  placeholder: "Clave de 2 o 3 caracteres (ej. ACT)",
                  maxLength: 3,
                  value: form.clave_unidad,
                  onChange: e => setForm(f => ({ ...f, clave_unidad: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''), _impTocado: true }))
                }, 'u', false)]
              }, 'uni', true)]
            }, 'g', true), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", { className: "form-label", children: "Clave SAT (8 dígitos)" }, 'l', false),
              /*#__PURE__*/_jsxDEV("input", {
                className: "form-input",
                style: { fontFamily: 'var(--mono)' },
                inputMode: "numeric",
                maxLength: 8,
                placeholder: _CLAVE_SAT_DEFECTO,
                value: form.clave_sat,
                onChange: e => setForm(f => ({ ...f, clave_sat: e.target.value.replace(/[^0-9]/g, ''), _impTocado: true }))
              }, 'i', false)]
            }, 'cs', true), /*#__PURE__*/_jsxDEV("div", {
              style: { fontSize: 11, color: 'var(--ink-4)', marginTop: 6, lineHeight: 1.4 },
              children: "El precio que capturas es siempre el precio final: el IVA se desglosa dentro de él, no se suma. Qué tasa corresponde a cada concepto lo decide el contador del colegio. La clave SAT se toma del catálogo c_ClaveProdServ (86101800 = servicios educativos)."
            }, 'nota', false)]
          }, 'fiscal', true), /*#__PURE__*/_jsxDEV("div", {
            className: "form-group",
            style: { marginTop: 12 },
            children: [/*#__PURE__*/_jsxDEV("label", {
              className: "form-label",
              children: "Tipo de concepto"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: { display: 'flex', gap: 8 },
              children: [
                { value: 'unico', label: 'Único (se agrega en caja)' },
                { value: 'recurrente', label: 'Recurrente (automático)' }
              ].map(op => /*#__PURE__*/_jsxDEV("button", {
                type: "button",
                className: "btn btn-sm " + (form.tipo === op.value ? 'btn-primary' : 'btn-secondary'),
                style: { flex: 1 },
                onClick: () => setForm(f => ({ ...f, tipo: op.value })),
                children: op.label
              }, op.value, false))
            }, void 0, true)]
          }, void 0, true), form.tipo === 'recurrente' && /*#__PURE__*/_jsxDEV("div", {
            style: { marginTop: 12, padding: 12, borderRadius: 'var(--radius-sm)', background: 'var(--glass-light)', display: 'flex', flexDirection: 'column', gap: 12 },
            children: [
              /*#__PURE__*/_jsxDEV("div", {
                style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
                children: [/*#__PURE__*/_jsxDEV("div", {
                  className: "form-group",
                  children: [/*#__PURE__*/_jsxDEV("label", { className: "form-label", children: "Periodicidad" }, void 0, false), /*#__PURE__*/_jsxDEV("select", {
                    className: "form-select",
                    value: form.periodicidad_meses,
                    onChange: e => setForm(f => ({ ...f, periodicidad_meses: parseInt(e.target.value) })),
                    children: PERIODICIDADES.map(p => /*#__PURE__*/_jsxDEV("option", { value: p.value, children: p.label }, p.value, false))
                  }, void 0, false)]
                }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                  className: "form-group",
                  children: [/*#__PURE__*/_jsxDEV("label", { className: "form-label", children: "Empieza a cobrarse" }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                    className: "form-input",
                    type: "date",
                    value: form.fecha_inicio,
                    onChange: e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))
                  }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                    style: { fontSize: 10.5, color: 'var(--ink-4)', marginTop: 4 },
                    children: form.fecha_inicio ? `La ventana sin recargo abre cada mes el día ${new Date(form.fecha_inicio + 'T00:00:00').getDate()} (el mismo día del mes que elegiste aquí).` : 'El día del mes que elijas será también el día en que abre la ventana sin recargo, cada periodo.'
                  }, void 0, false)]
                }, void 0, true)]
              }, void 0, true),
              /*#__PURE__*/_jsxDEV("div", {
                className: "form-group",
                style: { maxWidth: 220 },
                children: [/*#__PURE__*/_jsxDEV("label", { className: "form-label", children: "Pagar sin recargo hasta el día" }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                  className: "form-input", type: "number", min: 1, max: 28,
                  value: form.dia_ventana_fin,
                  onChange: e => setForm(f => ({ ...f, dia_ventana_fin: parseInt(e.target.value) || 5 }))
                }, void 0, false)]
              }, void 0, true),
              /*#__PURE__*/_jsxDEV("div", {
                style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
                children: [/*#__PURE__*/_jsxDEV("div", {
                  className: "form-group",
                  children: [/*#__PURE__*/_jsxDEV("label", { className: "form-label", children: "Penalización por pago tardío" }, void 0, false), /*#__PURE__*/_jsxDEV("select", {
                    className: "form-select",
                    value: form.penalizacion_tipo,
                    onChange: e => setForm(f => ({ ...f, penalizacion_tipo: e.target.value })),
                    children: [
                      /*#__PURE__*/_jsxDEV("option", { value: "", children: "Sin penalización" }, "", false),
                      /*#__PURE__*/_jsxDEV("option", { value: "porcentaje", children: "Porcentaje del pago" }, "porcentaje", false),
                      /*#__PURE__*/_jsxDEV("option", { value: "monto_fijo", children: "Monto fijo (MXN)" }, "monto_fijo", false)
                    ]
                  }, void 0, false)]
                }, void 0, true), form.penalizacion_tipo && /*#__PURE__*/_jsxDEV("div", {
                  className: "form-group",
                  children: [/*#__PURE__*/_jsxDEV("label", { className: "form-label", children: form.penalizacion_tipo === 'porcentaje' ? '% de recargo' : 'Monto fijo de recargo' }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                    className: "form-input", type: "number", min: 0, step: "0.01",
                    value: form.penalizacion_valor,
                    onChange: e => setForm(f => ({ ...f, penalizacion_valor: parseFloat(e.target.value) || 0 })),
                    style: { fontFamily: 'var(--mono)' }
                  }, void 0, false)]
                }, void 0, true)]
              }, void 0, true),
              // [F5] "Se cobra a": todos / ciertos grados / ciertos grupos.
              /*#__PURE__*/_jsxDEV(ProdAlcanceSelector, {
                form: form,
                setForm: setForm,
                cat: catAlc,
                previa: previa,
                productos: data.productos,
                catLabels: CAT_LABELS
              }, void 0, false),
              /*#__PURE__*/_jsxDEV("div", {
                style: { fontSize: 11.5, color: 'var(--ink-4)' },
                // [F5] el texto depende del alcance, y aclara qué pasa con las altas a medio periodo.
                children: "Se genera un cobro pendiente para cada alumno activo" + ((form.alcance || 'todos') === 'todos' ? '' : (form.alcance === 'grados' ? ' de los grados elegidos' : ' inscrito en los grupos elegidos')) + " en la fecha que toque, y se avisa por correo al padre/tutor (o al alumno si tiene correo propio). Se genera una vez por periodo: a quien se dé de alta o cambie de grado/grupo después de esa fecha no se le genera el de ese periodo."
              }, void 0, false)
            ]
          }, void 0, true), errForm && /*#__PURE__*/_jsxDEV("div", {
            style: { marginTop: 10, fontSize: 12.5, color: 'var(--red, #e5484d)' },
            children: errForm
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-footer",
          children: [/*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-secondary",
            onClick: () => setModal(null),
            children: "Cancelar"
          }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-primary",
            onClick: guardar,
            disabled: !form.nombre || guardando,
            children: guardando ? 'Guardando…' : 'Guardar'
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true)
    }, void 0, false)]
  }, void 0, true);
}

/* ══════════════════════════════════════════════════════════════════════════
 * [F5] Colegiatura por grado/grupo — selector "Se cobra a" y sus helpers.
 * Viven fuera de Productos() porque no dependen de su estado. Prefijo
 * _prod / Prod: todas las vistas comparten el scope global de window.
 * ══════════════════════════════════════════════════════════════════════════ */

// Normaliza alcance_ids a enteros positivos, únicos y ordenados. Acepta el
// arreglo que devuelven crear/editar_producto o el texto JSON tal como llega
// de cargar_datos (SELECT * de productos). Misma regla que
// producto_alcance_ids() en lib/helpers_alcance_producto.php.
function _prodAlcanceIds(v) {
  let arr = v;
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr.trim() || '[]'); } catch (e) { arr = []; }
  }
  if (!Array.isArray(arr)) return [];
  const vistos = {};
  const out = [];
  arr.forEach(x => {
    const n = Math.trunc(Number(x));
    if (Number.isFinite(n) && n > 0 && !vistos[n]) { vistos[n] = true; out.push(n); }
  });
  return out.sort((a, b) => a - b);
}

// activo puede llegar como bool, 0/1 o '0'/'1' según la acción que lo mande.
function _prodEsActivo(v) {
  return !(v === false || v === 0 || v === '0');
}

function _prodNombreGrado(g) {
  if (!g) return '';
  return g.nombre_corto || [g.grado, g.nivel].filter(Boolean).join(' ') || ('Grado #' + g.id);
}

function _prodNombreGrupo(g) {
  if (!g) return '';
  return g.nombre || ('Grupo #' + g.id);
}

// Texto "a quién se cobra" de la tarjeta del concepto. cat = catálogo ya
// cargado, o null mientras carga (entonces solo se dice cuántos son).
// largo = true devuelve la lista completa (para el tooltip).
function _prodAlcanceTexto(p, cat, largo) {
  const alcance = (p && p.alcance) || 'todos';
  if (alcance !== 'grados' && alcance !== 'grupos') return 'Se cobra a todos los alumnos activos';
  const esGrado = alcance === 'grados';
  const ids = _prodAlcanceIds(p.alcance_ids);
  if (!ids.length) return esGrado ? 'Por grado, sin grados elegidos: no se genera a nadie' : 'Por grupo, sin grupos elegidos: no se genera a nadie';
  // Sin catálogo (cargando, error o sin grados de F3) no se inventan
  // nombres: solo se dice cuántos son.
  const fuente = (cat && !cat.error) ? (esGrado ? cat.grados : cat.grupos) : null;
  if (!Array.isArray(fuente)) return 'Solo ' + ids.length + ' ' + (esGrado ? (ids.length === 1 ? 'grado' : 'grados') : (ids.length === 1 ? 'grupo' : 'grupos'));
  const porId = {};
  fuente.forEach(x => { porId[Number(x.id)] = x; });
  // Un id que ya no está en el catálogo: grado borrado, o grupo de otro ciclo
  // (escolar_catalogos solo trae los grupos del ciclo actual).
  const nombres = ids.map(id => porId[id]
    ? (esGrado ? _prodNombreGrado(porId[id]) : _prodNombreGrupo(porId[id]))
    : (esGrado ? 'grado #' + id : 'grupo #' + id + ' (otro ciclo)'));
  const MAX = 3;
  const lista = (largo || nombres.length <= MAX)
    ? nombres.join(', ')
    : nombres.slice(0, MAX).join(', ') + ' y ' + (nombres.length - MAX) + ' más';
  return (esGrado ? 'Solo grados: ' : 'Solo grupos: ') + lista;
}

// Selector "Se cobra a" del formulario de un concepto recurrente.
//   form / setForm : estado del formulario de Productos()
//   cat            : null (cargando) | { grados: [] | null, grupos: [], ciclo, error }
//                    grados === null → escolar_catalogos no devolvió 'grados'
//                    (el catálogo de grados de Control escolar aún no existe).
//   previa         : respuesta de producto_alcance_vista_previa (+ cargando / error)
//   productos      : todos los conceptos, para avisar de posibles cobros dobles
//   catLabels      : nombres de las categorías
function ProdAlcanceSelector({ form, setForm, cat, previa, productos, catLabels }) {
  const alcance = form.alcance || 'todos';
  const ids = _prodAlcanceIds(form.alcance_ids);
  const cargando = cat === null;
  const gradosDisp = !cargando && Array.isArray(cat.grados);
  const gruposDisp = !cargando && !cat.error;
  const grupos = (!cargando && cat.grupos) || [];

  // Cambiar de opción borra la selección: los ids de grados y los de grupos
  // son de tablas distintas y no se pueden reutilizar entre sí.
  const elegir = v => setForm(f => ((f.alcance || 'todos') === v ? f : { ...f, alcance: v, alcance_ids: [] }));
  const alternar = id => setForm(f => {
    const act = _prodAlcanceIds(f.alcance_ids);
    return { ...f, alcance_ids: act.includes(id) ? act.filter(x => x !== id) : act.concat([id]).sort((a, b) => a - b) };
  });
  const ponerVarios = (lista, encender) => setForm(f => {
    const act = _prodAlcanceIds(f.alcance_ids).filter(x => !lista.includes(x));
    return { ...f, alcance_ids: (encender ? act.concat(lista) : act).sort((a, b) => a - b) };
  });

  const AVISO = 'var(--amber, #d97706)';
  const nota = (texto, color, key) => /*#__PURE__*/_jsxDEV("div", {
    style: { fontSize: 11.5, color: color || 'var(--ink-4)', marginTop: 6, lineHeight: 1.4 },
    children: texto
  }, key, false);
  const chip = (id, texto, titulo) => /*#__PURE__*/_jsxDEV("button", {
    type: "button",
    className: "btn btn-sm " + (ids.includes(id) ? 'btn-primary' : 'btn-secondary'),
    style: { padding: '4px 10px', fontSize: 12 },
    title: titulo || undefined,
    "aria-pressed": ids.includes(id),
    onClick: () => alternar(id),
    children: texto
  }, id, false);
  const filaChips = (children, key) => /*#__PURE__*/_jsxDEV("div", {
    style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 },
    children: children
  }, key, true);

  // Opciones. Una opción que el concepto YA tiene guardada no se deshabilita
  // aunque su catálogo no cargue: así se ve qué tiene y se puede cambiar a
  // "Todos" a propósito, en vez de quedar atorado.
  const opciones = [
    { value: 'todos', label: 'Todos los alumnos', disabled: false, title: '' },
    { value: 'grados', label: 'Ciertos grados', disabled: !gradosDisp && alcance !== 'grados',
      title: cargando ? 'Cargando…' : (!gradosDisp ? 'Primero configura el catálogo de grados en Control escolar.' : '') },
    { value: 'grupos', label: 'Ciertos grupos', disabled: !gruposDisp && alcance !== 'grupos',
      title: cargando ? 'Cargando…' : (!gruposDisp ? 'No se pudo cargar el control escolar: ' + cat.error : '') }
  ];

  const cuerpo = [];
  if (alcance === 'grados') {
    if (cargando) {
      cuerpo.push(nota('Cargando grados…', null, 'carg'));
    } else if (!gradosDisp) {
      cuerpo.push(nota('Primero configura el catálogo de grados en Control escolar. Mientras tanto puedes cobrar a todos los alumnos o por grupos.', AVISO, 'sin'));
    } else {
      const lista = cat.grados
        .filter(g => _prodEsActivo(g.activo) || ids.includes(Number(g.id)))
        .slice()
        .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0) || Number(a.id) - Number(b.id));
      if (!lista.length) {
        cuerpo.push(nota('El catálogo de grados está vacío. Agrega los grados en Control escolar.', AVISO, 'vacio'));
      }
      // Agrupados por nivel, en el orden del catálogo; el botón del nivel
      // marca o desmarca todos sus grados de un jalón.
      const niveles = [];
      const porNivel = {};
      lista.forEach(g => {
        const n = g.nivel || 'Sin nivel';
        if (!porNivel[n]) { porNivel[n] = []; niveles.push(n); }
        porNivel[n].push(g);
      });
      niveles.forEach(n => {
        const idsNivel = porNivel[n].map(g => Number(g.id));
        const todosNivel = idsNivel.every(x => ids.includes(x));
        cuerpo.push(/*#__PURE__*/_jsxDEV("div", {
          style: { marginTop: 8 },
          children: [/*#__PURE__*/_jsxDEV("button", {
            type: "button",
            className: "btn btn-ghost btn-sm",
            style: { padding: '2px 6px', fontSize: 11, fontWeight: 600 },
            title: todosNivel ? 'Quitar todos los grados de ' + n : 'Elegir todos los grados de ' + n,
            onClick: () => ponerVarios(idsNivel, !todosNivel),
            children: n + (todosNivel ? ' · quitar todos' : ' · elegir todos')
          }, "h", false), filaChips(porNivel[n].map(g => chip(Number(g.id), _prodNombreGrado(g) + (_prodEsActivo(g.activo) ? '' : ' (inactivo)'))), "c")]
        }, 'niv-' + n, true));
      });
      // Ids guardados que ya no están en el catálogo: el backend no deja
      // guardar con ellos, así que se muestran para poder quitarlos.
      const conocidos = cat.grados.map(g => Number(g.id));
      const huerfanos = ids.filter(id => !conocidos.includes(id));
      if (huerfanos.length) {
        cuerpo.push(nota('Estos grados ya no están en el catálogo; quítalos para poder guardar:', AVISO, 'hn'));
        cuerpo.push(filaChips(huerfanos.map(id => chip(id, 'Grado #' + id + ' ×')), 'hc'));
      }
    }
  } else if (alcance === 'grupos') {
    if (cargando) {
      cuerpo.push(nota('Cargando grupos…', null, 'carg'));
    } else if (!gruposDisp) {
      cuerpo.push(nota('No se pudieron cargar los grupos: ' + cat.error, AVISO, 'err'));
    } else {
      const lista = grupos.filter(g => _prodEsActivo(g.activo) || ids.includes(Number(g.id)));
      cuerpo.push(nota(cat.ciclo ? 'Grupos del ciclo ' + cat.ciclo.nombre + ':' : 'Grupos del ciclo actual:', null, 'ciclo'));
      if (!lista.length) {
        cuerpo.push(nota('No hay grupos en el ciclo actual. Créalos en Control escolar.', AVISO, 'vacio'));
      } else {
        cuerpo.push(filaChips(lista.map(g => chip(
          Number(g.id),
          _prodNombreGrupo(g) + ' · ' + (Number(g.num_alumnos) || 0),
          [g.nivel, g.grado, g.turno].filter(Boolean).join(' · ') + ' — ' + (Number(g.num_alumnos) || 0) + ' alumnos inscritos'
        )), 'chips'));
      }
      // Grupos guardados que no son del ciclo actual (o ya se borraron): se
      // muestran para poder quitarlos. Mientras sigan en el concepto, el cron
      // los respeta para los alumnos que sigan inscritos (activo) en ellos.
      const conocidos = grupos.map(g => Number(g.id));
      const otros = ids.filter(id => !conocidos.includes(id));
      if (otros.length) {
        cuerpo.push(nota('Grupos guardados que no son del ciclo actual:', AVISO, 'on'));
        cuerpo.push(filaChips(otros.map(id => chip(id, 'Grupo #' + id + ' ×')), 'oc'));
      }
      cuerpo.push(nota('Los grupos cambian cada ciclo: al empezar el siguiente tendrás que actualizar este concepto. Para una colegiatura por grado conviene "Ciertos grados".', null, 'tip'));
    }
  }

  // Vista previa: el mismo filtro que usa el cron, para que el número que ve
  // el colegio sea el que de verdad se cobra.
  if (previa) {
    if (previa.cargando) {
      cuerpo.push(nota('Calculando a cuántos alumnos aplica…', null, 'pv'));
    } else if (previa.error) {
      cuerpo.push(nota(previa.error, AVISO, 'pv'));
    } else if (alcance !== 'todos' && !ids.length) {
      cuerpo.push(nota(alcance === 'grados' ? 'Elige al menos un grado.' : 'Elige al menos un grupo.', null, 'pv'));
    } else if (previa.alumnos_activos != null) {
      const n = Number(previa.alumnos_alcanzados) || 0;
      cuerpo.push(nota(/*#__PURE__*/_jsxDEV("span", {
        children: ['Hoy se le generaría a ', /*#__PURE__*/_jsxDEV("strong", { children: String(n) }, "n", false),
          ' de ' + (Number(previa.alumnos_activos) || 0) + ' alumnos activos.']
      }, void 0, true), alcance !== 'todos' && n === 0 ? AVISO : 'var(--ink-3)', 'pv'));
      const sinGrado = Number(previa.activos_sin_grado) || 0;
      if (alcance === 'grados' && sinGrado > 0) {
        cuerpo.push(nota('Ojo: ' + sinGrado + (sinGrado === 1 ? ' alumno activo no tiene' : ' alumnos activos no tienen') + ' grado asignado y no entra' + (sinGrado === 1 ? '' : 'n') + ' en ningún concepto por grado. Asígnaselo en Control escolar para que se le genere.', AVISO, 'sg'));
      }
    }
  }

  // Posible cobro doble: otro concepto recurrente activo de la misma
  // categoría que alcanza (o podría alcanzar) a los mismos alumnos. Grado
  // contra grupo no se puede saber aquí, así que se avisa como "podría".
  if (alcance === 'todos' || ids.length) {
    const choca = (productos || []).filter(p => {
      if (!p || !p.activo || p.tipo !== 'recurrente') return false;
      if (form.id != null && String(p.id) === String(form.id)) return false;
      if (p.categoria !== form.categoria) return false;
      const a2 = p.alcance || 'todos';
      if (alcance === 'todos' || a2 === 'todos' || a2 !== alcance) return true;
      return _prodAlcanceIds(p.alcance_ids).some(x => ids.includes(x));
    });
    if (choca.length) {
      cuerpo.push(nota('Ojo: ' + (choca.length === 1 ? 'el concepto ' : 'los conceptos ') + choca.map(p => '"' + p.nombre + '"').join(', ')
        + ' también ' + (choca.length === 1 ? 'es' : 'son') + ' de ' + ((catLabels && catLabels[form.categoria]) || form.categoria)
        + ' y podría' + (choca.length === 1 ? '' : 'n') + ' cobrarse a los mismos alumnos: a quien entre en los dos se le generarán ambos cargos.', AVISO, 'doble'));
    }
  }

  return /*#__PURE__*/_jsxDEV("div", {
    className: "form-group",
    children: [/*#__PURE__*/_jsxDEV("label", {
      className: "form-label",
      children: "Se cobra a"
    }, "l", false), /*#__PURE__*/_jsxDEV("div", {
      style: { display: 'flex', gap: 8, flexWrap: 'wrap' },
      children: opciones.map(op => /*#__PURE__*/_jsxDEV("button", {
        type: "button",
        className: "btn btn-sm " + (alcance === op.value ? 'btn-primary' : 'btn-secondary'),
        style: { flex: '1 1 120px' },
        disabled: op.disabled,
        title: op.title || undefined,
        onClick: () => elegir(op.value),
        children: op.label
      }, op.value, false))
    }, "o", true), (!cargando && !gradosDisp && alcance !== 'grados') ? nota('Para cobrar por grado, primero configura el catálogo de grados en Control escolar.', null, 'ng') : null].concat(cuerpo)
  }, void 0, true);
}
