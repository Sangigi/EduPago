var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};
var _Fragment = React.Fragment;
/* views/Login.jsx — Pagalaescuela branding · v4 · SVG icons */
function Login({
  onLogin
}) {
  const {
    useState
  } = React;
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [recordar, setRecordar] = useState(false);
  const [modoRecuperar, setModoRecuperar] = useState(false);
  const [emailRecuperar, setEmailRecuperar] = useState('');
  const [recuperando, setRecuperando] = useState(false);
  const [mensajeRecuperar, setMensajeRecuperar] = useState('');
  const [errorRecuperar, setErrorRecuperar] = useState('');
  const enviarRecuperacion = async e => {
    e.preventDefault();
    setRecuperando(true);
    setErrorRecuperar('');
    setMensajeRecuperar('');
    const res = await AuthController.recuperarPassword(emailRecuperar.trim());
    setRecuperando(false);
    if (res.ok) {
      setMensajeRecuperar(res.mensaje || 'Si el correo está registrado, te enviamos un enlace.');
    } else {
      setErrorRecuperar(res.error || 'No se pudo procesar la solicitud.');
    }
  };
  const submit = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await AuthController.login(u, p, recordar);
      if (result.ok) onLogin(result.user);else {
        setErr(result.error || 'Credenciales incorrectas');
        setLoading(false);
      }
    } catch (ex) {
      setErr('Error de conexión con el servidor');
      setLoading(false);
    }
  };
  // Modo desarrollo: localhost, 127.0.0.1, file:// o ?dev=1 en la URL.
  // En cualquier otro dominio (producción) el acceso rápido demo se oculta.
  const esDev = (() => {
    try {
      const h = window.location.hostname;
      if (window.EDUPAGO_ENV === 'production') return false;
      if (window.EDUPAGO_ENV === 'development') return true;
      if (new URLSearchParams(window.location.search).get('dev') === '1') return true;
      return h === 'localhost' || h === '127.0.0.1' || h === '' || window.location.protocol === 'file:';
    } catch (e) { return false; }
  })();
  const demos = esDev && Array.isArray(AuthController.DEMO_USERS) ? AuthController.DEMO_USERS : [];
  return /*#__PURE__*/_jsxDEV("div", {
    className: "login-screen",
    children: /*#__PURE__*/_jsxDEV("div", {
      style: {
        width: '100%',
        maxWidth: 420,
        padding: '0 16px'
      },
      children: [/*#__PURE__*/_jsxDEV("div", {
        style: {
          textAlign: 'center',
          marginBottom: 28
        },
        children: [/*#__PURE__*/_jsxDEV("img", {
          src: "assets/logo.jpeg",
          alt: "paga la escuela",
          style: {
            height: 90,
            maxWidth: 280,
            objectFit: 'contain',
            borderRadius: 14,
            display: 'inline-block'
          },
          onError: e => {
            e.target.style.display = 'none';
            e.target.nextSibling.style.display = 'block';
          }
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          style: {
            display: 'none'
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              fontSize: 30,
              fontWeight: 800,
              color: '#f1f5f9',
              letterSpacing: '-1px',
              lineHeight: 1
            },
            children: "paga la escuela"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            style: {
              fontSize: 12,
              color: '#bdcf00',
              marginTop: 6,
              fontWeight: 600
            },
            children: "by Libertyfin"
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        className: "login-card",
        children: [/*#__PURE__*/_jsxDEV("div", {
          style: {
            marginBottom: 22
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--ink)',
              letterSpacing: '-.3px'
            },
            children: modoRecuperar ? "Restablecer contraseña" : "Iniciar sesión"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            style: {
              fontSize: 12.5,
              color: 'var(--ink-3)',
              marginTop: 3
            },
            children: modoRecuperar ? "Te mandaremos un enlace a tu correo para poner una contraseña nueva" : "Sistema de cobros escolar · Multi-institución"
          }, void 0, false)]
        }, void 0, true), modoRecuperar ? /*#__PURE__*/_jsxDEV("form", {
          onSubmit: enviarRecuperacion,
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "form-group",
            children: [/*#__PURE__*/_jsxDEV("label", {
              className: "login-label",
              children: "Correo electrónico"
            }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
              className: "login-input",
              type: "email",
              value: emailRecuperar,
              autoFocus: true,
              required: true,
              onChange: e => { setEmailRecuperar(e.target.value); setErrorRecuperar(''); setMensajeRecuperar(''); },
              placeholder: "usuario@escuela.mx"
            }, void 0, false)]
          }, void 0, true),
          mensajeRecuperar && /*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(34,197,94,.10)', border: '1px solid rgba(34,197,94,.22)',
              borderRadius: 'var(--radius-sm)', padding: '9px 12px', marginBottom: 14
            },
            children: /*#__PURE__*/_jsxDEV("span", { style: { fontSize: 12.5, color: 'var(--ink-2)' }, children: mensajeRecuperar }, void 0, false)
          }, void 0, false),
          errorRecuperar && /*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(239,68,68,.10)', border: '1px solid rgba(239,68,68,.22)',
              borderRadius: 'var(--radius-sm)', padding: '9px 12px', marginBottom: 14
            },
            children: /*#__PURE__*/_jsxDEV("span", { style: { fontSize: 12.5, color: '#f87171' }, children: errorRecuperar }, void 0, false)
          }, void 0, false),
          /*#__PURE__*/_jsxDEV("button", {
            className: "login-btn",
            type: "submit",
            disabled: recuperando,
            style: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 },
            children: recuperando ? "Enviando…" : "Enviar enlace"
          }, void 0, false),
          /*#__PURE__*/_jsxDEV("button", {
            type: "button",
            onClick: () => { setModoRecuperar(false); setErrorRecuperar(''); setMensajeRecuperar(''); },
            style: {
              width: '100%', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12.5, color: 'var(--ink-3)', textDecoration: 'underline'
            },
            children: 'Volver a iniciar sesión'
          }, void 0, false)]
        }, void 0, true) : /*#__PURE__*/_jsxDEV("form", {
          onSubmit: submit,
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "form-group",
            children: [/*#__PURE__*/_jsxDEV("label", {
              className: "login-label",
              children: "Correo electrónico"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                position: 'relative'
              },
              children: [/*#__PURE__*/_jsxDEV(Icon, {
                name: "emails",
                size: 16,
                color: "var(--ink-4)",
                style: {
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none'
                }
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "login-input",
                type: "email",
                value: u,
                autoFocus: true,
                required: true,
                onChange: e => {
                  setU(e.target.value);
                  setErr('');
                },
                placeholder: "usuario@escuela.mx",
                style: {
                  paddingLeft: 38
                }
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            className: "form-group",
            children: [/*#__PURE__*/_jsxDEV("label", {
              className: "login-label",
              children: "Contraseña"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                position: 'relative'
              },
              children: [/*#__PURE__*/_jsxDEV(Icon, {
                name: "shield",
                size: 16,
                color: "var(--ink-4)",
                style: {
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none'
                }
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "login-input",
                type: showPass ? 'text' : 'password',
                value: p,
                required: true,
                onChange: e => {
                  setP(e.target.value);
                  setErr('');
                },
                placeholder: "••••••••",
                style: {
                  paddingLeft: 38,
                  paddingRight: 42
                }
              }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
                type: "button",
                onClick: () => setShowPass(s => !s),
                style: {
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 4,
                  color: 'var(--ink-4)',
                  display: 'flex',
                  alignItems: 'center'
                },
                tabIndex: -1,
                children: /*#__PURE__*/_jsxDEV(Icon, {
                  name: showPass ? 'eyeOff' : 'eye',
                  size: 17,
                  color: "currentColor"
                }, void 0, false)
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: { textAlign: 'right', marginBottom: 14, marginTop: -6 },
            children: /*#__PURE__*/_jsxDEV("button", {
              type: 'button',
              onClick: () => {
                setModoRecuperar(true);
                setEmailRecuperar(u);
                setErrorRecuperar('');
                setMensajeRecuperar('');
              },
              style: {
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                fontSize: 12, color: 'var(--ink-3)', textDecoration: 'underline'
              },
              children: '¿No recuerdas tu contraseña?'
            }, void 0, false)
          }, void 0, false), /*#__PURE__*/_jsxDEV("label", {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 14,
              fontSize: 12.5,
              color: 'var(--ink-3)',
              cursor: 'pointer',
              userSelect: 'none'
            },
            children: [/*#__PURE__*/_jsxDEV("input", {
              type: "checkbox",
              checked: recordar,
              onChange: e => setRecordar(e.target.checked),
              style: {
                width: 15,
                height: 15,
                cursor: 'pointer',
                accentColor: 'var(--lime)'
              }
            }, void 0, false), "Recordar sesión en este dispositivo"]
          }, void 0, true), err && /*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(239,68,68,.10)',
              border: '1px solid rgba(239,68,68,.22)',
              borderRadius: 'var(--radius-sm)',
              padding: '9px 12px',
              marginBottom: 14
            },
            children: [/*#__PURE__*/_jsxDEV(Icon, {
              name: "warning",
              size: 15,
              color: "#f87171"
            }, void 0, false), /*#__PURE__*/_jsxDEV("span", {
              style: {
                fontSize: 12.5,
                color: '#f87171'
              },
              children: err
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
            className: "login-btn",
            type: "submit",
            disabled: loading,
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            },
            children: loading ? /*#__PURE__*/_jsxDEV(_Fragment, {
              children: [/*#__PURE__*/_jsxDEV("span", {
                className: "spinner",
                style: {
                  borderColor: 'rgba(40,45,101,.25)',
                  borderTopColor: '#282d65',
                  width: 16,
                  height: 16
                }
              }, void 0, false), "Verificando…"]
            }, void 0, true) : /*#__PURE__*/_jsxDEV(_Fragment, {
              children: ["Entrar al sistema ", /*#__PURE__*/_jsxDEV(Icon, {
                name: "arrowRight",
                size: 16,
                color: "var(--navy)"
              }, void 0, false)]
            }, void 0, true)
          }, void 0, false)]
        }, void 0, true), !modoRecuperar && demos.length > 0 && /*#__PURE__*/_jsxDEV("div", {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            margin: '20px 0 14px'
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              flex: 1,
              height: 1,
              background: 'var(--border-glow)'
            }
          }, void 0, false), /*#__PURE__*/_jsxDEV("span", {
            style: {
              fontSize: 10.5,
              color: 'var(--ink-4)',
              textTransform: 'uppercase',
              letterSpacing: '.6px',
              whiteSpace: 'nowrap'
            },
            children: "Acceso rápido demo"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            style: {
              flex: 1,
              height: 1,
              background: 'var(--border-glow)'
            }
          }, void 0, false)]
        }, void 0, true), !modoRecuperar && demos.length > 0 && /*#__PURE__*/_jsxDEV("div", {
          style: {
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 6
          },
          children: demos.map(d => /*#__PURE__*/_jsxDEV("div", {
            className: "demo-pill",
            onClick: () => {
              setU(d.email);
              setP(d.pass);
              setErr('');
            },
            children: d.label
          }, d.email, false))
        }, void 0, false)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        style: {
          textAlign: 'center',
          marginTop: 16,
          fontSize: 11,
          color: 'var(--ink-4)'
        },
        children: "© 2026 Pagalaescuela.com · by Libertyfin · Todos los derechos reservados"
      }, void 0, false)]
    }, void 0, true)
  }, void 0, false);
}
