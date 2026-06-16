import { jsxDEV as _jsxDEV, Fragment as _Fragment } from "react/jsx-dev-runtime";
/* views/PortalFamilia.jsx — Portal para padres · v4 · SVG icons · logo real */
function PortalFamilia({
  data,
  setData,
  user,
  escuela,
  onLogout
}) {
  const {
    useState,
    useEffect,
    useRef
  } = React;
  const [misHijos, setMisHijos] = useState([]);
  const [misCobros, setMisCobros] = useState([]);
  const [saldoTotal, setSaldoTotal] = useState(0);
  const [metodo, setMetodo] = useState('SPEI');
  const [modal, setModal] = useState(null);
  const [cobroActivo, setCobroActivo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('inicio');
  const [copied, setCopied] = useState('');
  const [pollStatus, setPollStatus] = useState(null);
  const pollRef = useRef(null);
  const PLC = {
    navy: '#282d65',
    navyDk: '#1c2050',
    lime: '#bdcf00',
    limeDk: '#9eb000',
    green: '#49af54',
    white: '#ffffff',
    bg: '#f2f4f9',
    card: '#ffffff',
    border: '#e2e8f0',
    text: '#1e2546',
    muted: '#64748b',
    red: '#ef4444'
  };
  useEffect(() => {
    if (user.familia_id) {
      const hijos = data.clientes.filter(c => c.familia_id === user.familia_id && c.activo);
      const ids = hijos.map(h => h.id);
      const cobros = data.cobros.filter(c => ids.includes(c.cliente_id));
      const saldo = hijos.reduce((a, c) => a + (c.saldo_pendiente || 0), 0);
      setMisHijos(hijos);
      setMisCobros(cobros);
      setSaldoTotal(saldo);
    }
  }, [data, user.familia_id]);
  const copiar = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    });
  };
  const iniciarPolling = cobro => {
    setPollStatus('waiting');
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const params = new URLSearchParams();
        if (cobro.referencia_spei || cobro.referencia) params.set('referencia', cobro.referencia_spei || cobro.referencia);
        if (cobro.clabe) params.set('clabe', cobro.clabe);
        const r = await fetch(`api.php?action=verificar_spei&${params.toString()}`);
        const json = await r.json();
        if (json.pagado) {
          clearInterval(pollRef.current);
          setPollStatus('confirmed');
          setData(AppModel.load());
        }
      } catch (_) {}
    }, 10000);
  };
  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);
  const pagarSaldo = async () => {
    if (saldoTotal <= 0) return;
    setLoading(true);
    const conceptoTemporal = [{
      id: 'SALDO_GLOBAL',
      nombre: `Liquidación de saldo — ${user.nombre}`,
      precio: saldoTotal,
      qty: 1,
      emoji: ''
    }];
    const escuela_id = escuela?.id ?? 1;
    const {
      data: newData,
      cobro
    } = CobroController.iniciarCobro(data, {
      carrito: conceptoTemporal,
      cliente: {
        nombre: user.nombre,
        tipo: 'familia',
        id: user.familia_id
      },
      metodo,
      escuela_id
    });
    if (metodo === 'SPEI') {
      try {
        // Si la familia tiene un solo hijo activo, su CLABE individual representa
        // correctamente este pago. Con varios hijos, el saldo es agregado y no
        // corresponde a una sola CLABE individual → se usa la CLABE fija de la escuela.
        const hijoUnico = misHijos.length === 1 ? misHijos[0] : null;
        const spei = await CobroController.iniciarSPEI(cobro, escuela, hijoUnico);
        const cobrosUp = newData.cobros.map(c => c.id === cobro.id ? {
          ...c,
          clabe: spei.clabe,
          banco: spei.banco,
          referencia_spei: spei.referencia,
          clabe_es_individual: !!spei.esIndividual
        } : c);
        const dataFinal = {
          ...newData,
          cobros: cobrosUp
        };
        setData(dataFinal);
        AppModel.save(dataFinal);
        const cobroFinal = {
          ...cobro,
          clabe: spei.clabe,
          referencia_spei: spei.referencia,
          banco: spei.banco,
          clabe_es_individual: !!spei.esIndividual
        };
        setCobroActivo(cobroFinal);
        setModal('spei');
        iniciarPolling(cobroFinal);
      } catch (err) {
        alert('Error al generar instrucciones SPEI: ' + err.message);
      }
    } else if (metodo === 'TC') {
      try {
        setData(newData);
        AppModel.save(newData);
        const liga = await CobroController.iniciarTC(cobro);
        window.location.href = liga.url;
      } catch (err) {
        alert('Error al conectar con la pasarela de pago');
      }
    }
    setLoading(false);
  };

  /* ─── helpers de estilo ─── */
  const card = (extra = {}) => ({
    background: PLC.card,
    borderRadius: 14,
    border: `1px solid ${PLC.border}`,
    boxShadow: '0 2px 12px rgba(40,45,101,.06)',
    marginBottom: 18,
    overflow: 'hidden',
    ...extra
  });
  const fieldBox = (highlight = false) => ({
    background: highlight ? `rgba(189,207,0,.09)` : `rgba(40,45,101,.04)`,
    border: `1px solid ${highlight ? PLC.lime : PLC.border}`,
    borderRadius: 9,
    padding: '10px 14px',
    marginBottom: 10
  });
  const badgeStyle = ok => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '3px 10px',
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
    background: ok ? 'rgba(73,175,84,.12)' : 'rgba(239,68,68,.09)',
    color: ok ? PLC.green : PLC.red
  });
  const tabBtn = (id, label, iconName) => {
    const active = tab === id;
    return /*#__PURE__*/_jsxDEV("button", {
      onClick: () => setTab(id),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        padding: '10px 16px',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 13,
        fontWeight: active ? 700 : 400,
        color: active ? PLC.navy : PLC.muted,
        borderBottom: `2px solid ${active ? PLC.lime : 'transparent'}`,
        marginBottom: -2,
        transition: 'all .15s'
      },
      children: [/*#__PURE__*/_jsxDEV(Icon, {
        name: iconName,
        size: 15,
        color: active ? PLC.navy : PLC.muted
      }, void 0, false), label]
    }, void 0, true);
  };
  const cobrosHijo = id => misCobros.filter(c => c.cliente_id === id);
  const pendientesHj = id => cobrosHijo(id).filter(c => c.estado === 'pendiente');
  return /*#__PURE__*/_jsxDEV("div", {
    style: {
      minHeight: '100vh',
      background: PLC.bg,
      fontFamily: "'DM Sans',system-ui,sans-serif"
    },
    children: [/*#__PURE__*/_jsxDEV("div", {
      style: {
        background: PLC.navy,
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 64,
        boxShadow: `0 2px 16px rgba(28,32,80,.35)`,
        position: 'sticky',
        top: 0,
        zIndex: 100
      },
      children: [/*#__PURE__*/_jsxDEV("img", {
        src: "assets/logo.jpeg",
        alt: "paga la escuela",
        style: {
          height: 42,
          objectFit: 'contain',
          display: 'block',
          borderRadius: '10px'
        },
        onError: e => {
          e.target.style.display = 'none';
          e.target.nextSibling.style.display = 'flex';
        }
      }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
        style: {
          display: 'none',
          alignItems: 'center',
          gap: 8
        },
        children: [/*#__PURE__*/_jsxDEV("span", {
          style: {
            color: PLC.white,
            fontWeight: 800,
            fontSize: 17,
            letterSpacing: '-.5px'
          },
          children: "paga la escuela"
        }, void 0, false), /*#__PURE__*/_jsxDEV("span", {
          style: {
            color: PLC.lime,
            fontSize: 11,
            fontWeight: 600
          },
          children: "by Libertyfin"
        }, void 0, false)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 10
        },
        children: [escuela && /*#__PURE__*/_jsxDEV("div", {
          style: {
            padding: '4px 12px',
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 600,
            background: 'rgba(189,207,0,.15)',
            color: PLC.lime,
            marginRight: 4
          },
          children: escuela.nombre
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          style: {
            textAlign: 'right',
            lineHeight: 1.3
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              color: PLC.white,
              fontSize: 13,
              fontWeight: 600
            },
            children: user.nombre
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            style: {
              color: 'rgba(255,255,255,.5)',
              fontSize: 11
            },
            children: "Portal Familiar"
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          style: {
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: `linear-gradient(135deg,${PLC.lime},${PLC.green})`,
            color: PLC.navy,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 14,
            flexShrink: 0
          },
          children: user.nombre.charAt(0).toUpperCase()
        }, void 0, false), onLogout && /*#__PURE__*/_jsxDEV("button", {
          onClick: onLogout,
          title: "Cerrar sesión",
          style: {
            background: 'rgba(255,255,255,.1)',
            border: 'none',
            color: PLC.white,
            width: 34,
            height: 34,
            borderRadius: 8,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          },
          children: /*#__PURE__*/_jsxDEV(Icon, {
            name: "logout",
            size: 16,
            color: "currentColor"
          }, void 0, false)
        }, void 0, false)]
      }, void 0, true)]
    }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
      style: {
        maxWidth: 880,
        margin: '0 auto',
        padding: '28px 20px 60px'
      },
      children: [/*#__PURE__*/_jsxDEV("div", {
        style: {
          background: `linear-gradient(135deg, ${PLC.navyDk} 0%, ${PLC.navy} 100%)`,
          borderRadius: 18,
          padding: '28px 28px 24px',
          marginBottom: 20,
          position: 'relative',
          overflow: 'hidden',
          border: `1px solid rgba(189,207,0,.15)`
        },
        children: [/*#__PURE__*/_jsxDEV("div", {
          style: {
            position: 'absolute',
            top: -40,
            right: -40,
            width: 180,
            height: 180,
            borderRadius: '50%',
            background: PLC.lime,
            opacity: .06,
            pointerEvents: 'none'
          }
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          style: {
            position: 'absolute',
            bottom: -20,
            right: 100,
            width: 90,
            height: 90,
            borderRadius: '50%',
            background: PLC.green,
            opacity: .09,
            pointerEvents: 'none'
          }
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          style: {
            fontSize: 12,
            color: 'rgba(255,255,255,.45)',
            marginBottom: 3,
            textTransform: 'uppercase',
            letterSpacing: .5
          },
          children: "Bienvenido/a"
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          style: {
            fontSize: 22,
            fontWeight: 700,
            color: PLC.white,
            marginBottom: 22
          },
          children: user.nombre
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          style: {
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap'
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              flex: 1,
              minWidth: 100,
              background: 'rgba(255,255,255,.08)',
              borderRadius: 10,
              padding: '14px 16px'
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 6
              },
              children: [/*#__PURE__*/_jsxDEV(Icon, {
                name: "alumnos",
                size: 14,
                color: "rgba(255,255,255,.5)"
              }, void 0, false), /*#__PURE__*/_jsxDEV("span", {
                style: {
                  fontSize: 10,
                  color: 'rgba(255,255,255,.5)',
                  textTransform: 'uppercase',
                  letterSpacing: .4
                },
                children: "Alumnos"
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 26,
                fontWeight: 700,
                color: PLC.white
              },
              children: misHijos.length
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 11,
                color: 'rgba(255,255,255,.45)',
                marginTop: 2
              },
              children: misHijos.map(h => h.nombre.split(' ')[0]).join(' · ') || '—'
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              flex: 1,
              minWidth: 100,
              background: saldoTotal > 0 ? 'rgba(189,207,0,.14)' : 'rgba(73,175,84,.14)',
              borderRadius: 10,
              padding: '14px 16px',
              border: `1px solid ${saldoTotal > 0 ? 'rgba(189,207,0,.25)' : 'rgba(73,175,84,.25)'}`
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 6
              },
              children: [/*#__PURE__*/_jsxDEV(Icon, {
                name: "pay",
                size: 14,
                color: "rgba(255,255,255,.5)"
              }, void 0, false), /*#__PURE__*/_jsxDEV("span", {
                style: {
                  fontSize: 10,
                  color: 'rgba(255,255,255,.5)',
                  textTransform: 'uppercase',
                  letterSpacing: .4
                },
                children: "Saldo total"
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 26,
                fontWeight: 700,
                color: saldoTotal > 0 ? PLC.lime : PLC.green
              },
              children: fmt(saldoTotal)
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 11,
                color: 'rgba(255,255,255,.55)',
                marginTop: 2
              },
              children: saldoTotal > 0 ? 'Pagos pendientes' : 'Todo al corriente'
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              flex: 1,
              minWidth: 100,
              background: 'rgba(255,255,255,.08)',
              borderRadius: 10,
              padding: '14px 16px'
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 6
              },
              children: [/*#__PURE__*/_jsxDEV(Icon, {
                name: "cobros",
                size: 14,
                color: "rgba(255,255,255,.5)"
              }, void 0, false), /*#__PURE__*/_jsxDEV("span", {
                style: {
                  fontSize: 10,
                  color: 'rgba(255,255,255,.5)',
                  textTransform: 'uppercase',
                  letterSpacing: .4
                },
                children: "Cobros"
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 26,
                fontWeight: 700,
                color: PLC.white
              },
              children: misCobros.length
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 11,
                color: 'rgba(255,255,255,.45)',
                marginTop: 2
              },
              children: [misCobros.filter(c => c.estado === 'pagado').length, " pagados"]
            }, void 0, true)]
          }, void 0, true)]
        }, void 0, true)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        style: {
          display: 'flex',
          gap: 2,
          borderBottom: `2px solid ${PLC.border}`,
          marginBottom: 22
        },
        children: [tabBtn('inicio', 'Inicio', 'home'), tabBtn('hijos', 'Mis hijos', 'alumnos'), tabBtn('historial', 'Historial', 'history'), tabBtn('pagar', 'Pagar en línea', 'card')]
      }, void 0, true), tab === 'inicio' && /*#__PURE__*/_jsxDEV("div", {
        children: [saldoTotal > 0 && /*#__PURE__*/_jsxDEV("div", {
          style: {
            ...card(),
            border: `2px solid ${PLC.lime}`,
            background: `linear-gradient(135deg,rgba(189,207,0,.07),rgba(73,175,84,.05))`
          },
          children: /*#__PURE__*/_jsxDEV("div", {
            style: {
              padding: '18px 22px',
              display: 'flex',
              alignItems: 'center',
              gap: 16
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                width: 50,
                height: 50,
                borderRadius: 12,
                flexShrink: 0,
                background: `linear-gradient(135deg,${PLC.lime},${PLC.green})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              },
              children: /*#__PURE__*/_jsxDEV(Icon, {
                name: "bell",
                size: 22,
                color: PLC.navy
              }, void 0, false)
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                flex: 1
              },
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontWeight: 700,
                  fontSize: 15,
                  color: PLC.text,
                  marginBottom: 3
                },
                children: ["Tienes ", fmt(saldoTotal), " pendiente de pago"]
              }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 13,
                  color: PLC.muted
                },
                children: "Paga con transferencia SPEI o tarjeta de crédito/débito de forma segura."
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
              onClick: () => setTab('pagar'),
              style: {
                flexShrink: 0,
                padding: '10px 18px',
                borderRadius: 9,
                border: 'none',
                background: `linear-gradient(135deg,${PLC.navy},${PLC.navyDk})`,
                color: PLC.white,
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 7
              },
              children: ["Pagar ahora ", /*#__PURE__*/_jsxDEV(Icon, {
                name: "arrowRight",
                size: 15,
                color: PLC.white
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true)
        }, void 0, false), misHijos.map(hijo => {
          const pends = pendientesHj(hijo.id);
          return /*#__PURE__*/_jsxDEV("div", {
            style: card(),
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                padding: '16px 20px',
                borderBottom: `1px solid ${PLC.border}`,
                display: 'flex',
                alignItems: 'center',
                gap: 13
              },
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  width: 44,
                  height: 44,
                  borderRadius: 11,
                  flexShrink: 0,
                  background: `rgba(40,45,101,.08)`,
                  border: `2px solid rgba(40,45,101,.12)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                },
                children: /*#__PURE__*/_jsxDEV(Icon, {
                  name: "alumnos",
                  size: 20,
                  color: PLC.navy
                }, void 0, false)
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  flex: 1
                },
                children: [/*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontWeight: 700,
                    fontSize: 14,
                    color: PLC.text
                  },
                  children: hijo.nombre
                }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontSize: 12,
                    color: PLC.muted
                  },
                  children: [hijo.grado, " · Mat: ", /*#__PURE__*/_jsxDEV("code", {
                    style: {
                      fontSize: 11
                    },
                    children: hijo.matricula || '—'
                  }, void 0, false)]
                }, void 0, true)]
              }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                style: badgeStyle(hijo.saldo_pendiente === 0),
                children: [/*#__PURE__*/_jsxDEV(Icon, {
                  name: hijo.saldo_pendiente === 0 ? 'check' : 'warning',
                  size: 11,
                  color: "currentColor"
                }, void 0, false), hijo.saldo_pendiente === 0 ? 'Al corriente' : fmt(hijo.saldo_pendiente)]
              }, void 0, true)]
            }, void 0, true), pends.length > 0 && /*#__PURE__*/_jsxDEV("div", {
              style: {
                padding: '14px 20px'
              },
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 11,
                  color: PLC.muted,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: .4,
                  marginBottom: 10
                },
                children: "Cobros pendientes"
              }, void 0, false), pends.map(cob => /*#__PURE__*/_jsxDEV("div", {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 8,
                  marginBottom: 6,
                  background: 'rgba(40,45,101,.04)',
                  border: `1px solid ${PLC.border}`
                },
                children: [/*#__PURE__*/_jsxDEV(Icon, {
                  name: "cobros",
                  size: 16,
                  color: PLC.muted
                }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    flex: 1
                  },
                  children: [/*#__PURE__*/_jsxDEV("div", {
                    style: {
                      fontSize: 13,
                      fontWeight: 500,
                      color: PLC.text
                    },
                    children: cob.items.map(i => i.nombre).join(', ')
                  }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                    style: {
                      fontSize: 11,
                      color: PLC.muted,
                      marginTop: 2
                    },
                    children: ["Folio: ", /*#__PURE__*/_jsxDEV("code", {
                      style: {
                        fontSize: 11
                      },
                      children: cob.folio
                    }, void 0, false), " · ", cob.fecha]
                  }, void 0, true)]
                }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    color: PLC.navy,
                    fontSize: 14
                  },
                  children: fmt(cob.total)
                }, void 0, false)]
              }, cob.id, true))]
            }, void 0, true)]
          }, hijo.id, true);
        }), misHijos.length === 0 && /*#__PURE__*/_jsxDEV("div", {
          style: {
            ...card(),
            padding: 40,
            textAlign: 'center'
          },
          children: [/*#__PURE__*/_jsxDEV(Icon, {
            name: "escuelas",
            size: 44,
            color: PLC.muted,
            style: {
              margin: '0 auto 14px',
              opacity: .4
            }
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            style: {
              fontSize: 15,
              fontWeight: 600,
              color: PLC.text,
              marginBottom: 6
            },
            children: "Sin alumnos asignados"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            style: {
              fontSize: 13,
              color: PLC.muted
            },
            children: "Comunícate con la administración de tu escuela."
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true), tab === 'hijos' && /*#__PURE__*/_jsxDEV("div", {
        children: misHijos.map(hijo => /*#__PURE__*/_jsxDEV("div", {
          style: card(),
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              padding: '16px 20px',
              borderBottom: `1px solid ${PLC.border}`,
              display: 'flex',
              alignItems: 'center',
              gap: 13,
              background: `rgba(40,45,101,.03)`
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                width: 50,
                height: 50,
                borderRadius: 12,
                flexShrink: 0,
                background: `linear-gradient(135deg,${PLC.navy},${PLC.navyDk})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              },
              children: /*#__PURE__*/_jsxDEV(Icon, {
                name: "alumnos",
                size: 22,
                color: PLC.white
              }, void 0, false)
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                flex: 1
              },
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontWeight: 700,
                  fontSize: 15,
                  color: PLC.text
                },
                children: hijo.nombre
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 12,
                  color: PLC.muted,
                  marginTop: 2
                },
                children: hijo.grado
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              style: badgeStyle(hijo.saldo_pendiente === 0),
              children: [/*#__PURE__*/_jsxDEV(Icon, {
                name: hijo.saldo_pendiente === 0 ? 'check' : 'warning',
                size: 11,
                color: "currentColor"
              }, void 0, false), hijo.saldo_pendiente === 0 ? 'Al corriente' : fmt(hijo.saldo_pendiente)]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              padding: '16px 20px'
            },
            children: /*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10
              },
              children: [{
                l: 'Matrícula',
                v: hijo.matricula || '—',
                mono: true
              }, {
                l: 'CURP',
                v: hijo.curp || '—',
                mono: true
              }, {
                l: 'Correo',
                v: hijo.email || '—'
              }, {
                l: 'Teléfono',
                v: hijo.tel || '—',
                mono: true
              }, {
                l: 'Saldo pendiente',
                v: fmt(hijo.saldo_pendiente),
                color: hijo.saldo_pendiente > 0 ? PLC.red : PLC.green
              }, {
                l: 'Cobros totales',
                v: cobrosHijo(hijo.id).length + ' cobros'
              }].map(row => /*#__PURE__*/_jsxDEV("div", {
                style: {
                  padding: '10px 12px',
                  background: 'rgba(40,45,101,.03)',
                  borderRadius: 8,
                  border: `1px solid ${PLC.border}`
                },
                children: [/*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontSize: 10.5,
                    color: PLC.muted,
                    marginBottom: 3,
                    textTransform: 'uppercase',
                    letterSpacing: .4
                  },
                  children: row.l
                }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontSize: 13,
                    fontWeight: 500,
                    color: row.color || PLC.text,
                    fontFamily: row.mono ? 'monospace' : 'inherit'
                  },
                  children: row.v
                }, void 0, false)]
              }, row.l, true))
            }, void 0, false)
          }, void 0, false)]
        }, hijo.id, true))
      }, void 0, false), tab === 'historial' && /*#__PURE__*/_jsxDEV("div", {
        style: card(),
        children: [/*#__PURE__*/_jsxDEV("div", {
          style: {
            padding: '16px 20px',
            borderBottom: `1px solid ${PLC.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: 12
          },
          children: [/*#__PURE__*/_jsxDEV(Icon, {
            name: "history",
            size: 20,
            color: PLC.navy
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                fontWeight: 700,
                fontSize: 14,
                color: PLC.text
              },
              children: "Historial de cobros"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 12,
                color: PLC.muted
              },
              children: [misCobros.length, " registros"]
            }, void 0, true)]
          }, void 0, true)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          style: {
            overflowX: 'auto'
          },
          children: /*#__PURE__*/_jsxDEV("table", {
            style: {
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13
            },
            children: [/*#__PURE__*/_jsxDEV("thead", {
              children: /*#__PURE__*/_jsxDEV("tr", {
                style: {
                  borderBottom: `2px solid ${PLC.border}`
                },
                children: ['Folio', 'Alumno', 'Concepto', 'Método', 'Total', 'Estado', 'Fecha'].map(h => /*#__PURE__*/_jsxDEV("th", {
                  style: {
                    padding: '10px 16px',
                    textAlign: 'left',
                    fontSize: 11,
                    fontWeight: 600,
                    color: PLC.muted,
                    textTransform: 'uppercase',
                    letterSpacing: .4,
                    whiteSpace: 'nowrap'
                  },
                  children: h
                }, h, false))
              }, void 0, false)
            }, void 0, false), /*#__PURE__*/_jsxDEV("tbody", {
              children: [misCobros.length === 0 && /*#__PURE__*/_jsxDEV("tr", {
                children: /*#__PURE__*/_jsxDEV("td", {
                  colSpan: 7,
                  style: {
                    padding: 40,
                    textAlign: 'center',
                    color: PLC.muted
                  },
                  children: "Sin cobros registrados"
                }, void 0, false)
              }, void 0, false), misCobros.map((cob, i) => /*#__PURE__*/_jsxDEV("tr", {
                style: {
                  borderBottom: `1px solid ${PLC.border}`,
                  background: i % 2 === 0 ? 'transparent' : 'rgba(40,45,101,.02)'
                },
                children: [/*#__PURE__*/_jsxDEV("td", {
                  style: {
                    padding: '11px 16px',
                    fontFamily: 'monospace',
                    fontSize: 12,
                    color: PLC.muted
                  },
                  children: cob.folio
                }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                  style: {
                    padding: '11px 16px',
                    fontWeight: 500,
                    color: PLC.text
                  },
                  children: cob.cliente
                }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                  style: {
                    padding: '11px 16px',
                    color: PLC.muted,
                    maxWidth: 180
                  },
                  children: cob.items.map(i => i.nombre).join(', ')
                }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                  style: {
                    padding: '11px 16px'
                  },
                  children: /*#__PURE__*/_jsxDEV("span", {
                    style: {
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '2px 9px',
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 600,
                      background: 'rgba(40,45,101,.08)',
                      color: PLC.navy
                    },
                    children: [/*#__PURE__*/_jsxDEV(Icon, {
                      name: cob.metodo === 'SPEI' ? 'bank' : 'card',
                      size: 11,
                      color: "currentColor"
                    }, void 0, false), cob.metodo]
                  }, void 0, true)
                }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                  style: {
                    padding: '11px 16px',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    color: PLC.navy
                  },
                  children: fmt(cob.total)
                }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                  style: {
                    padding: '11px 16px'
                  },
                  children: /*#__PURE__*/_jsxDEV("span", {
                    style: badgeStyle(cob.estado === 'pagado'),
                    children: [/*#__PURE__*/_jsxDEV(Icon, {
                      name: cob.estado === 'pagado' ? 'check' : 'warning',
                      size: 11,
                      color: "currentColor"
                    }, void 0, false), cob.estado === 'pagado' ? 'Pagado' : 'Pendiente']
                  }, void 0, true)
                }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                  style: {
                    padding: '11px 16px',
                    color: PLC.muted,
                    fontSize: 12,
                    whiteSpace: 'nowrap'
                  },
                  children: cob.fecha
                }, void 0, false)]
              }, cob.id, true))]
            }, void 0, true)]
          }, void 0, true)
        }, void 0, false)]
      }, void 0, true), tab === 'pagar' && /*#__PURE__*/_jsxDEV("div", {
        children: saldoTotal <= 0 ? /*#__PURE__*/_jsxDEV("div", {
          style: {
            ...card(),
            padding: 50,
            textAlign: 'center'
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: `rgba(73,175,84,.12)`,
              margin: '0 auto 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            },
            children: /*#__PURE__*/_jsxDEV(Icon, {
              name: "check",
              size: 32,
              color: PLC.green
            }, void 0, false)
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            style: {
              fontSize: 18,
              fontWeight: 700,
              color: PLC.green,
              marginBottom: 8
            },
            children: "¡Todo al corriente!"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            style: {
              fontSize: 14,
              color: PLC.muted
            },
            children: "No tienes pagos pendientes en este momento."
          }, void 0, false)]
        }, void 0, true) : /*#__PURE__*/_jsxDEV(_Fragment, {
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: card(),
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                padding: '16px 20px',
                borderBottom: `1px solid ${PLC.border}`,
                display: 'flex',
                alignItems: 'center',
                gap: 12
              },
              children: [/*#__PURE__*/_jsxDEV(Icon, {
                name: "cobros",
                size: 20,
                color: PLC.navy
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontWeight: 700,
                  fontSize: 14,
                  color: PLC.text
                },
                children: "Resumen de pago"
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              style: {
                padding: '16px 20px'
              },
              children: [misHijos.filter(h => h.saldo_pendiente > 0).map(h => /*#__PURE__*/_jsxDEV("div", {
                style: {
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: `1px solid ${PLC.border}`
                },
                children: [/*#__PURE__*/_jsxDEV("div", {
                  children: [/*#__PURE__*/_jsxDEV("div", {
                    style: {
                      fontWeight: 500,
                      color: PLC.text
                    },
                    children: h.nombre
                  }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                    style: {
                      fontSize: 12,
                      color: PLC.muted
                    },
                    children: h.grado
                  }, void 0, false)]
                }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    color: PLC.red
                  },
                  children: fmt(h.saldo_pendiente)
                }, void 0, false)]
              }, h.id, true)), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '14px 0 0'
                },
                children: [/*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontWeight: 700,
                    fontSize: 15,
                    color: PLC.text
                  },
                  children: "Total a pagar"
                }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontFamily: 'monospace',
                    fontWeight: 800,
                    fontSize: 20,
                    color: PLC.navy
                  },
                  children: fmt(saldoTotal)
                }, void 0, false)]
              }, void 0, true)]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: card(),
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                padding: '16px 20px',
                borderBottom: `1px solid ${PLC.border}`,
                display: 'flex',
                alignItems: 'center',
                gap: 12
              },
              children: [/*#__PURE__*/_jsxDEV(Icon, {
                name: "card",
                size: 20,
                color: PLC.navy
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontWeight: 700,
                  fontSize: 14,
                  color: PLC.text
                },
                children: "Método de pago"
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              style: {
                padding: '20px'
              },
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  display: 'flex',
                  gap: 12,
                  marginBottom: 22
                },
                children: [/*#__PURE__*/_jsxDEV("div", {
                  onClick: () => setMetodo('SPEI'),
                  style: {
                    flex: 1,
                    padding: '14px 16px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    border: `2px solid ${metodo === 'SPEI' ? PLC.navy : PLC.border}`,
                    background: metodo === 'SPEI' ? 'rgba(40,45,101,.05)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    transition: 'all .15s'
                  },
                  children: [/*#__PURE__*/_jsxDEV("div", {
                    style: {
                      width: 40,
                      height: 40,
                      borderRadius: 9,
                      background: metodo === 'SPEI' ? PLC.navy : '#f0f2f8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all .15s',
                      flexShrink: 0
                    },
                    children: /*#__PURE__*/_jsxDEV(Icon, {
                      name: "bank",
                      size: 20,
                      color: metodo === 'SPEI' ? PLC.white : PLC.muted
                    }, void 0, false)
                  }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                    style: {
                      flex: 1
                    },
                    children: [/*#__PURE__*/_jsxDEV("div", {
                      style: {
                        fontWeight: 600,
                        fontSize: 13,
                        color: PLC.text
                      },
                      children: "Transferencia SPEI"
                    }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                      style: {
                        fontSize: 11,
                        color: PLC.muted
                      },
                      children: "Sin comisión adicional"
                    }, void 0, false)]
                  }, void 0, true), metodo === 'SPEI' && /*#__PURE__*/_jsxDEV(Icon, {
                    name: "check",
                    size: 18,
                    color: PLC.green
                  }, void 0, false)]
                }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                  onClick: () => setMetodo('TC'),
                  style: {
                    flex: 1,
                    padding: '14px 16px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    border: `2px solid ${metodo === 'TC' ? PLC.navy : PLC.border}`,
                    background: metodo === 'TC' ? 'rgba(40,45,101,.05)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    transition: 'all .15s'
                  },
                  children: [/*#__PURE__*/_jsxDEV("div", {
                    style: {
                      width: 40,
                      height: 40,
                      borderRadius: 9,
                      background: metodo === 'TC' ? PLC.navy : '#f0f2f8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all .15s',
                      flexShrink: 0
                    },
                    children: /*#__PURE__*/_jsxDEV(Icon, {
                      name: "card",
                      size: 20,
                      color: metodo === 'TC' ? PLC.white : PLC.muted
                    }, void 0, false)
                  }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                    style: {
                      flex: 1
                    },
                    children: [/*#__PURE__*/_jsxDEV("div", {
                      style: {
                        fontWeight: 600,
                        fontSize: 13,
                        color: PLC.text
                      },
                      children: "Tarjeta Crédito / Débito"
                    }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                      style: {
                        fontSize: 11,
                        color: PLC.muted
                      },
                      children: "Visa, Mastercard, Amex"
                    }, void 0, false)]
                  }, void 0, true), metodo === 'TC' && /*#__PURE__*/_jsxDEV(Icon, {
                    name: "check",
                    size: 18,
                    color: PLC.green
                  }, void 0, false)]
                }, void 0, true)]
              }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
                onClick: pagarSaldo,
                disabled: loading,
                style: {
                  width: '100%',
                  padding: '14px 0',
                  borderRadius: 10,
                  border: 'none',
                  background: `linear-gradient(135deg,${PLC.lime},${PLC.green})`,
                  color: PLC.navy,
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  opacity: loading ? .7 : 1,
                  transition: 'all .18s',
                  fontFamily: 'inherit',
                  letterSpacing: .2
                },
                children: loading ? /*#__PURE__*/_jsxDEV(_Fragment, {
                  children: [/*#__PURE__*/_jsxDEV("span", {
                    className: "spinner",
                    style: {
                      borderColor: 'rgba(40,45,101,.25)',
                      borderTopColor: PLC.navy,
                      width: 18,
                      height: 18
                    }
                  }, void 0, false), "Procesando…"]
                }, void 0, true) : /*#__PURE__*/_jsxDEV(_Fragment, {
                  children: [/*#__PURE__*/_jsxDEV(Icon, {
                    name: "pay",
                    size: 18,
                    color: PLC.navy
                  }, void 0, false), "Pagar ", fmt(saldoTotal), " con ", metodo === 'SPEI' ? 'SPEI' : 'Tarjeta']
                }, void 0, true)
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  marginTop: 14,
                  fontSize: 11.5,
                  color: PLC.muted,
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                },
                children: [/*#__PURE__*/_jsxDEV(Icon, {
                  name: "shield",
                  size: 13,
                  color: PLC.muted
                }, void 0, false), "Pago seguro procesado por Pagadetodo.mx · Powered by STP"]
              }, void 0, true)]
            }, void 0, true)]
          }, void 0, true)]
        }, void 0, true)
      }, void 0, false)]
    }, void 0, true), modal === 'spei' && cobroActivo && /*#__PURE__*/_jsxDEV("div", {
      style: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(28,32,80,.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20
      },
      onClick: e => e.target === e.currentTarget && setModal(null),
      children: /*#__PURE__*/_jsxDEV("div", {
        style: {
          background: PLC.card,
          borderRadius: 18,
          width: '100%',
          maxWidth: 460,
          boxShadow: `0 28px 70px rgba(28,32,80,.35)`,
          overflow: 'hidden'
        },
        children: [/*#__PURE__*/_jsxDEV("div", {
          style: {
            background: `linear-gradient(135deg,${PLC.navyDk},${PLC.navy})`,
            padding: '20px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 12
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'rgba(189,207,0,.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              },
              children: /*#__PURE__*/_jsxDEV(Icon, {
                name: "bank",
                size: 20,
                color: PLC.lime
              }, void 0, false)
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontWeight: 700,
                  fontSize: 16,
                  color: PLC.white
                },
                children: "Datos para transferir"
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 11.5,
                  color: 'rgba(255,255,255,.5)',
                  marginTop: 2
                },
                children: "Incluye el concepto exacto"
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
            onClick: () => setModal(null),
            style: {
              background: 'rgba(255,255,255,.1)',
              border: 'none',
              color: PLC.white,
              width: 32,
              height: 32,
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            },
            children: /*#__PURE__*/_jsxDEV(Icon, {
              name: "close",
              size: 18,
              color: "currentColor"
            }, void 0, false)
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          style: {
            padding: 24
          },
          children: pollStatus === 'confirmed' ? /*#__PURE__*/_jsxDEV("div", {
            style: {
              textAlign: 'center',
              padding: '20px 0'
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: `rgba(73,175,84,.12)`,
                margin: '0 auto 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              },
              children: /*#__PURE__*/_jsxDEV(Icon, {
                name: "check",
                size: 32,
                color: PLC.green
              }, void 0, false)
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 18,
                fontWeight: 700,
                color: PLC.green,
                marginBottom: 8
              },
              children: "¡Pago confirmado!"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 13,
                color: PLC.muted
              },
              children: "Tu pago fue recibido y procesado. Gracias."
            }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
              onClick: () => {
                setModal(null);
                setPollStatus(null);
              },
              style: {
                marginTop: 20,
                padding: '10px 28px',
                borderRadius: 9,
                border: 'none',
                background: PLC.navy,
                color: PLC.white,
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: 13
              },
              children: "Cerrar"
            }, void 0, false)]
          }, void 0, true) : /*#__PURE__*/_jsxDEV(_Fragment, {
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                marginBottom: 14,
                padding: '10px 14px',
                background: `rgba(189,207,0,.09)`,
                borderRadius: 9,
                fontSize: 12.5,
                color: PLC.navy,
                border: `1px solid rgba(189,207,0,.3)`,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8
              },
              children: [/*#__PURE__*/_jsxDEV(Icon, {
                name: "warning",
                size: 16,
                color: PLC.limeDk,
                style: {
                  flexShrink: 0,
                  marginTop: 1
                }
              }, void 0, false), cobroActivo.clabe_es_individual ? /*#__PURE__*/_jsxDEV(_Fragment, {
                children: ["Esta CLABE es ", /*#__PURE__*/_jsxDEV("strong", {
                  children: "exclusiva de tu cuenta"
                }, void 0, false), " — tu pago se detecta automáticamente aunque no incluyas concepto"]
              }, void 0, true) : /*#__PURE__*/_jsxDEV(_Fragment, {
                children: ["El ", /*#__PURE__*/_jsxDEV("strong", {
                  children: "concepto es obligatorio"
                }, void 0, false), " — sin él tu pago no se confirma automáticamente"]
              }, void 0, true)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              style: fieldBox(),
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 10,
                  color: PLC.muted,
                  textTransform: 'uppercase',
                  letterSpacing: .4,
                  marginBottom: 5
                },
                children: cobroActivo.clabe_es_individual ? 'CLABE individual de tu cuenta' : 'CLABE interbancaria'
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                },
                children: [/*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontFamily: 'monospace',
                    fontSize: 15,
                    fontWeight: 600,
                    color: PLC.text,
                    letterSpacing: .5,
                    flex: 1
                  },
                  children: cobroActivo.clabe || '646180633010000055'
                }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
                  onClick: () => copiar(cobroActivo.clabe || '646180633010000055', 'clabe'),
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '5px 10px',
                    borderRadius: 7,
                    border: `1px solid ${PLC.border}`,
                    background: 'white',
                    fontSize: 11,
                    cursor: 'pointer',
                    color: PLC.muted,
                    flexShrink: 0,
                    color: copied === 'clabe' ? PLC.green : PLC.muted,
                    borderColor: copied === 'clabe' ? PLC.green : PLC.border
                  },
                  children: [/*#__PURE__*/_jsxDEV(Icon, {
                    name: copied === 'clabe' ? 'check' : 'copy',
                    size: 13,
                    color: "currentColor"
                  }, void 0, false), copied === 'clabe' ? 'Copiado' : 'Copiar']
                }, void 0, true)]
              }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 11,
                  color: PLC.muted,
                  marginTop: 4
                },
                children: ["Banco: ", /*#__PURE__*/_jsxDEV("strong", {
                  children: cobroActivo.banco || 'STP'
                }, void 0, false)]
              }, void 0, true)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              style: fieldBox(true),
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 10,
                  color: PLC.limeDk,
                  textTransform: 'uppercase',
                  letterSpacing: .4,
                  marginBottom: 5,
                  fontWeight: 700
                },
                children: cobroActivo.clabe_es_individual ? 'Concepto / Referencia (opcional)' : 'Concepto / Referencia (obligatorio)'
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                },
                children: [/*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontFamily: 'monospace',
                    fontSize: 18,
                    fontWeight: 700,
                    color: PLC.navy,
                    flex: 1,
                    letterSpacing: .5
                  },
                  children: cobroActivo.referencia_spei || cobroActivo.referencia
                }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
                  onClick: () => copiar(cobroActivo.referencia_spei || cobroActivo.referencia, 'ref'),
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '6px 12px',
                    borderRadius: 7,
                    border: `2px solid ${copied === 'ref' ? PLC.green : PLC.lime}`,
                    background: copied === 'ref' ? `rgba(73,175,84,.12)` : PLC.lime,
                    color: copied === 'ref' ? PLC.green : PLC.navy,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: 'pointer',
                    flexShrink: 0
                  },
                  children: [/*#__PURE__*/_jsxDEV(Icon, {
                    name: copied === 'ref' ? 'check' : 'copy',
                    size: 13,
                    color: "currentColor"
                  }, void 0, false), copied === 'ref' ? 'Copiado' : 'Copiar']
                }, void 0, true)]
              }, void 0, true)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              style: fieldBox(),
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 10,
                  color: PLC.muted,
                  textTransform: 'uppercase',
                  letterSpacing: .4,
                  marginBottom: 5
                },
                children: "Monto exacto"
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontFamily: 'monospace',
                  fontSize: 19,
                  fontWeight: 700,
                  color: PLC.navy
                },
                children: fmt(cobroActivo.total)
              }, void 0, false)]
            }, void 0, true), pollStatus === 'waiting' && /*#__PURE__*/_jsxDEV("div", {
              style: {
                marginTop: 14,
                padding: '10px 14px',
                background: 'rgba(40,45,101,.05)',
                borderRadius: 9,
                fontSize: 12,
                color: PLC.muted,
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8
              },
              children: [/*#__PURE__*/_jsxDEV("span", {
                className: "spinner",
                style: {
                  borderColor: 'rgba(40,45,101,.2)',
                  borderTopColor: PLC.navy,
                  width: 14,
                  height: 14
                }
              }, void 0, false), "Verificando pago automáticamente cada 10 segundos…"]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              style: {
                marginTop: 16,
                fontSize: 11.5,
                color: PLC.muted,
                lineHeight: 1.6,
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              },
              children: [/*#__PURE__*/_jsxDEV(Icon, {
                name: "shield",
                size: 13,
                color: PLC.muted
              }, void 0, false), "El sistema detectará tu transferencia automáticamente."]
            }, void 0, true)]
          }, void 0, true)
        }, void 0, false)]
      }, void 0, true)
    }, void 0, false)]
  }, void 0, true);
}
