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
    activo: true
  };
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [q, setQ] = useState('');
  const lista = data.productos.filter(p => !q || p.nombre.toLowerCase().includes(q.toLowerCase()) || p.categoria.toLowerCase().includes(q.toLowerCase()));
  const guardar = () => {
    if (!form.nombre || form.precio === undefined) return;
    let newProductos;
    if (form.id) {
      newProductos = data.productos.map(p => p.id === form.id ? {
        ...p,
        ...form
      } : p);
    } else {
      const nuevo = {
        ...form,
        id: AppModel.nextId(data.productos),
        escuela_id
      };
      newProductos = [...data.productos, nuevo];
    }
    const newData = {
      ...data,
      productos: newProductos
    };
    setData(newData);
    AppModel.save(newData);
    setModal(null);
    setForm(EMPTY);
  };
  const toggleActivo = id => {
    const newData = {
      ...data,
      productos: data.productos.map(p => p.id === id ? {
        ...p,
        activo: !p.activo
      } : p)
    };
    setData(newData);
    AppModel.save(newData);
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
                  ...p
                });
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
          }, void 0, true)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-footer",
          children: [/*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-secondary",
            onClick: () => setModal(null),
            children: "Cancelar"
          }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-primary",
            onClick: guardar,
            disabled: !form.nombre,
            children: "Guardar"
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true)
    }, void 0, false)]
  }, void 0, true);
}