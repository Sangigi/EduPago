var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};
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
    penalizacion_valor: 0
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
    }
    setGuardando(true);
    try {
      if (form.id) {
        const res = await ProductosController.editar(form);
        const newData = {
          ...data,
          productos: data.productos.map(p => p.id === form.id ? { ...p, ...res.producto } : p)
        };
        setData(newData);
        AppModel.save(newData);
      } else {
        const res = await ProductosController.crear({ ...form, escuela_id });
        const newData = {
          ...data,
          productos: [...data.productos, res.producto]
        };
        setData(newData);
        AppModel.save(newData);
      }
      setModal(null);
      setForm(EMPTY);
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
    children: [/*#__PURE__*/_jsxDEV("div", {
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
          style: {
            background: 'var(--glass-light)',
            border: '1px solid var(--border-glow)',
            borderRadius: 'var(--radius)',
            padding: '14px 16px',
            opacity: p.activo ? 1 : .5,
            transition: 'all .2s'
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
              }, void 0, false), p.tipo === 'recurrente' && /*#__PURE__*/_jsxDEV("div", {
                style: { fontSize: 10.5, color: 'var(--accent, #bdcf00)', marginTop: 2, fontWeight: 600 },
                children: "🔁 " + (PERIODICIDADES.find(pe => pe.value === p.periodicidad_meses)?.label || 'Recurrente') + ` · día ${p.dia_ventana_inicio}-${p.dia_ventana_fin}`
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
                setForm({
                  ...EMPTY,
                  ...p,
                  fecha_inicio: p.fecha_inicio || '',
                  penalizacion_tipo: p.penalizacion_tipo || '',
                  penalizacion_valor: p.penalizacion_valor || 0
                });
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
                  categoria: e.target.value
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
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
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
              /*#__PURE__*/_jsxDEV("div", {
                style: { fontSize: 11.5, color: 'var(--ink-4)' },
                children: "Se genera un cobro pendiente para cada alumno activo en la fecha que toque, y se avisa por correo al padre/tutor (o al alumno si tiene correo propio)."
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