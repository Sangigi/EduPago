import { jsxDEV as _jsxDEV, Fragment as _Fragment } from "react/jsx-dev-runtime";
/* views/Emails.jsx */
function Emails({
  data,
  setData
}) {
  const {
    useState
  } = React;
  const TIPOS = [{
    id: 'comprobante',
    label: 'Comprobante de pago',
    icon: 'check'
  }, {
    id: 'recordatorio',
    label: 'Recordatorio de pago',
    icon: 'bell'
  }, {
    id: 'bienvenida',
    label: 'Bienvenida a EduPago',
    icon: 'home'
  }];
  const EMPTY = {
    para: '',
    asunto: '',
    cuerpo: '',
    tipo: 'comprobante'
  };
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState('enviados'); // enviados | recibidos

  const pendientes = data.cobros.filter(c => c.estado === 'pendiente');
  const enviados = data.emails.filter(e => e.tipo === 'enviado');
  const recibidos = data.emails.filter(e => e.tipo === 'recibido');
  const enviar = () => {
    if (!form.para || !form.asunto) return;
    setSending(true);
    setTimeout(() => {
      const email = {
        id: AppModel.nextId(data.emails),
        tipo: 'enviado',
        asunto: form.asunto,
        para: form.para,
        fecha: new Date().toISOString().slice(0, 10),
        estado: 'entregado'
      };
      const newData = {
        ...data,
        emails: [...data.emails, email]
      };
      setData(newData);
      AppModel.save(newData);
      setSending(false);
      setModal(false);
      setForm(EMPTY);
    }, 1800);
  };
  const marcarLeido = id => {
    const newData = {
      ...data,
      emails: data.emails.map(e => e.id === id ? {
        ...e,
        leido: true
      } : e)
    };
    setData(newData);
    AppModel.save(newData);
  };
  return /*#__PURE__*/_jsxDEV("div", {
    children: [/*#__PURE__*/_jsxDEV("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: '1fr 320px',
        gap: 20
      },
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "card",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "card-header",
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'flex',
              gap: 8
            },
            children: [['enviados', 'Enviados'], ['recibidos', 'Recibidos']].map(([k, l]) => /*#__PURE__*/_jsxDEV("button", {
              className: `btn ${tab === k ? 'btn-primary' : 'btn-secondary'} btn-sm`,
              onClick: () => setTab(k),
              children: l
            }, k, false))
          }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-primary btn-sm",
            onClick: () => {
              setForm(EMPTY);
              setModal(true);
            },
            children: "+ Nuevo correo"
          }, void 0, false)]
        }, void 0, true), tab === 'enviados' && /*#__PURE__*/_jsxDEV("div", {
          children: [enviados.length === 0 && /*#__PURE__*/_jsxDEV("div", {
            className: "empty-state",
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "empty-icon",
              children: /*#__PURE__*/_jsxDEV(Icon, {
                name: "emails",
                size: 36,
                color: "currentColor"
              }, void 0, false)
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              className: "empty-text",
              children: "Sin correos enviados"
            }, void 0, false)]
          }, void 0, true), [...enviados].reverse().map(e => /*#__PURE__*/_jsxDEV("div", {
            style: {
              padding: '12px 0',
              borderBottom: '1px solid var(--glass-light)',
              display: 'flex',
              alignItems: 'center',
              gap: 12
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                width: 36,
                height: 36,
                background: 'var(--accent-glow)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                flexShrink: 0
              },
              children: /*#__PURE__*/_jsxDEV(Icon, {
                name: "emails",
                size: 18,
                color: "var(--lime)"
              }, void 0, false)
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                flex: 1,
                minWidth: 0
              },
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--ink)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                },
                children: e.asunto
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 11.5,
                  color: 'var(--ink-3)',
                  marginTop: 2
                },
                children: ["Para: ", e.para, " · ", fmtDate(e.fecha)]
              }, void 0, true)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("span", {
              className: "badge badge-green",
              children: e.estado
            }, void 0, false)]
          }, e.id, true))]
        }, void 0, true), tab === 'recibidos' && /*#__PURE__*/_jsxDEV("div", {
          children: [recibidos.length === 0 && /*#__PURE__*/_jsxDEV("div", {
            className: "empty-state",
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "empty-icon",
              children: /*#__PURE__*/_jsxDEV(Icon, {
                name: "download",
                size: 36,
                color: "currentColor"
              }, void 0, false)
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              className: "empty-text",
              children: "Sin correos recibidos"
            }, void 0, false)]
          }, void 0, true), [...recibidos].reverse().map(e => /*#__PURE__*/_jsxDEV("div", {
            onClick: () => marcarLeido(e.id),
            style: {
              padding: '12px 0',
              borderBottom: '1px solid var(--glass-light)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
              opacity: e.leido ? .85 : 1
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                width: 36,
                height: 36,
                background: e.leido ? 'var(--glass-light)' : 'var(--accent-glow)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                flexShrink: 0
              },
              children: e.leido ? /*#__PURE__*/_jsxDEV(Icon, {
                name: "emails",
                size: 14,
                color: "currentColor"
              }, void 0, false) : /*#__PURE__*/_jsxDEV(Icon, {
                name: "bell",
                size: 14,
                color: "currentColor"
              }, void 0, false)
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                flex: 1,
                minWidth: 0
              },
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 13,
                  fontWeight: e.leido ? 400 : 600,
                  color: 'var(--ink)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                },
                children: e.asunto
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 11.5,
                  color: 'var(--ink-3)',
                  marginTop: 2
                },
                children: ["De: ", e.de, " · ", fmtDate(e.fecha)]
              }, void 0, true)]
            }, void 0, true), !e.leido && /*#__PURE__*/_jsxDEV("div", {
              style: {
                width: 8,
                height: 8,
                background: 'var(--accent)',
                borderRadius: '50%',
                flexShrink: 0
              }
            }, void 0, false)]
          }, e.id, true))]
        }, void 0, true)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        children: /*#__PURE__*/_jsxDEV("div", {
          className: "card",
          style: {
            marginBottom: 16
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "card-header",
            children: /*#__PURE__*/_jsxDEV("div", {
              className: "card-title",
              children: "Cobros pendientes"
            }, void 0, false)
          }, void 0, false), pendientes.length === 0 && /*#__PURE__*/_jsxDEV("div", {
            className: "empty-state",
            children: /*#__PURE__*/_jsxDEV("div", {
              className: "empty-text",
              children: "Sin pendientes check"
            }, void 0, false)
          }, void 0, false), pendientes.map(c => /*#__PURE__*/_jsxDEV("div", {
            style: {
              padding: '8px 0',
              borderBottom: '1px solid var(--glass-light)'
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 12.5,
                fontWeight: 500,
                color: 'var(--ink)'
              },
              children: c.cliente
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 4
              },
              children: [/*#__PURE__*/_jsxDEV("span", {
                style: {
                  fontSize: 11.5,
                  color: 'var(--ink-3)'
                },
                children: [c.folio, " · ", c.metodo]
              }, void 0, true), /*#__PURE__*/_jsxDEV("span", {
                style: {
                  fontFamily: 'var(--mono)',
                  fontSize: 12,
                  color: 'var(--amber)',
                  fontWeight: 600
                },
                children: fmt(c.total)
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
              className: "btn btn-secondary btn-sm",
              style: {
                width: '100%',
                marginTop: 6
              },
              onClick: () => {
                const cli = data.clientes.find(cl => cl.id === c.cliente_id);
                setForm({
                  para: cli?.email || '',
                  asunto: `Recordatorio de pago — ${c.folio}`,
                  cuerpo: `Estimado/a ${c.cliente}, le recordamos que tiene un cobro pendiente por ${fmt(c.total)} (${c.folio}).`,
                  tipo: 'recordatorio'
                });
                setModal(true);
              },
              children: "Enviar recordatorio"
            }, void 0, false)]
          }, c.id, true))]
        }, void 0, true)
      }, void 0, false)]
    }, void 0, true), modal && /*#__PURE__*/_jsxDEV("div", {
      className: "modal-backdrop",
      onClick: e => e.target === e.currentTarget && setModal(false),
      children: /*#__PURE__*/_jsxDEV("div", {
        className: "modal modal-lg",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "modal-header",
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "modal-title",
            style: {
              display: "flex",
              alignItems: "center",
              gap: 8
            },
            children: [/*#__PURE__*/_jsxDEV(Icon, {
              name: "emails",
              size: 17,
              color: "currentColor"
            }, void 0, false), " Nuevo correo"]
          }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-ghost btn-sm",
            onClick: () => setModal(false),
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
              display: 'flex',
              gap: 8,
              marginBottom: 16
            },
            children: TIPOS.map(t => /*#__PURE__*/_jsxDEV("button", {
              className: `btn ${form.tipo === t.id ? 'btn-primary' : 'btn-secondary'} btn-sm`,
              onClick: () => setForm(f => ({
                ...f,
                tipo: t.id
              })),
              children: [t.icon, " ", t.label]
            }, t.id, true))
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "form-group",
            children: [/*#__PURE__*/_jsxDEV("label", {
              className: "form-label",
              children: "Para *"
            }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
              className: "form-input",
              type: "email",
              placeholder: "correo@ejemplo.com",
              value: form.para,
              onChange: e => setForm(f => ({
                ...f,
                para: e.target.value
              }))
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            className: "form-group",
            children: [/*#__PURE__*/_jsxDEV("label", {
              className: "form-label",
              children: "Asunto *"
            }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
              className: "form-input",
              placeholder: "Asunto del correo",
              value: form.asunto,
              onChange: e => setForm(f => ({
                ...f,
                asunto: e.target.value
              }))
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            className: "form-group",
            children: [/*#__PURE__*/_jsxDEV("label", {
              className: "form-label",
              children: "Mensaje"
            }, void 0, false), /*#__PURE__*/_jsxDEV("textarea", {
              className: "form-input",
              rows: 5,
              placeholder: "Escribe el mensaje…",
              value: form.cuerpo,
              onChange: e => setForm(f => ({
                ...f,
                cuerpo: e.target.value
              })),
              style: {
                resize: 'vertical'
              }
            }, void 0, false)]
          }, void 0, true), sending && /*#__PURE__*/_jsxDEV("div", {
            className: "verif-row",
            children: [/*#__PURE__*/_jsxDEV("span", {
              className: "spinner",
              style: {
                borderTopColor: 'var(--accent)'
              }
            }, void 0, false), /*#__PURE__*/_jsxDEV("span", {
              style: {
                fontSize: 12.5
              },
              children: "Enviando correo…"
            }, void 0, false)]
          }, void 0, true)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-footer",
          children: [/*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-secondary",
            onClick: () => setModal(false),
            disabled: sending,
            children: "Cancelar"
          }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-primary",
            onClick: enviar,
            disabled: sending || !form.para || !form.asunto,
            children: sending ? /*#__PURE__*/_jsxDEV(_Fragment, {
              children: [/*#__PURE__*/_jsxDEV("span", {
                className: "spinner"
              }, void 0, false), " Enviando…"]
            }, void 0, true) : /*#__PURE__*/_jsxDEV(_Fragment, {
              children: [/*#__PURE__*/_jsxDEV(Icon, {
                name: "upload",
                size: 14,
                color: "currentColor"
              }, void 0, false), " Enviar"]
            }, void 0, true)
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true)
    }, void 0, false)]
  }, void 0, true);
}
