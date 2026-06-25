var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};
var _Fragment = React.Fragment;
/* views/Facturacion.jsx v3 — CFDI 4.0 + Simulador SPEI */
function Facturacion({
  data,
  setData,
  escuela
}) {
  const {
    useState
  } = React;
  const [tab, setTab] = useState('pendientes');
  const [q, setQ] = useState('');
  const [modal, setModal] = useState(null);
  const [cobroSel, setCobroSel] = useState(null);
  const [cfdiVisor, setCfdiVisor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [formFact, setFormFact] = useState({
    rfc: '',
    razon_social: '',
    uso_cfdi: 'D10',
    regimen: '616',
    email: '',
    cp_receptor: '',
    domicilio: ''
  });
  const [simRef, setSimRef] = useState('');
  const [simMonto, setSimMonto] = useState('');
  const [simEmisor, setSimEmisor] = useState('PADRE DE FAMILIA PRUEBA');
  const [simStatus, setSimStatus] = useState(null);
  const [simMsg, setSimMsg] = useState('');
  const [simLoading, setSimLoading] = useState(false);
  const cobrosEscuela = data.cobros.filter(c => c.estado === 'pagado');
  const pendientesFact = cobrosEscuela.filter(c => !c.factura_cfdi);
  const emitidas = cobrosEscuela.filter(c => c.factura_cfdi);
  const speiPendientes = data.cobros.filter(c => c.metodo === 'SPEI' && c.estado === 'pendiente');
  const USO_CFDI = {
    'D10': 'D10 — Pagos por servicios educativos (recomendado)',
    'G01': 'G01 — Adquisición de mercancias',
    'G03': 'G03 — Gastos en general',
    'D01': 'D01 — Honorarios médicos',
    'S01': 'S01 — Sin efectos fiscales'
  };
  const REGIMENES = {
    '616': '616 — Sin obligaciones fiscales (personas físicas)',
    '601': '601 — General Personas Morales',
    '612': '612 — Personas Físicas con Actividades Empresariales',
    '626': '626 — RESICO'
  };
  const abrirSolicitar = cobro => {
    // Bug fix: buscar cliente por cliente_id; si es null (cobro sin cliente),
    // intentar por nombre como fallback, y si tampoco, dejar form vacío.
    let cli = cobro.cliente_id ? data.clientes.find(c => c.id === cobro.cliente_id) : data.clientes.find(c => c.nombre === cobro.cliente);

    // Si el cobro es de tipo familia, buscar también los datos fiscales
    // en la familia vinculada al alumno
    if (!cli?.rfc_factura && cli?.familia_id) {
      const fam = data.familias?.find(f => f.id === cli.familia_id);
      if (fam?.rfc_factura) {
        // Mezclar datos fiscales de la familia sobre el cliente
        cli = {
          ...cli,
          ...fam
        };
      }
    }
    const tieneDatos = !!(cli?.rfc_factura && cli?.razon_social_factura && cli?.cp_factura);
    setCobroSel(cobro);
    setFormFact({
      rfc: cli?.rfc_factura || '',
      razon_social: cli?.razon_social_factura || '',
      cp_receptor: cli?.cp_factura || '',
      domicilio: cli?.domicilio_factura || '',
      regimen: cli?.regimen_factura || '616',
      uso_cfdi: cli?.uso_cfdi_defecto || 'D10',
      email: cli?.email || '',
      _preLlenado: tieneDatos // bandera interna para mostrar/ocultar el banner
    });
    setErrMsg('');
    setModal('solicitar');
  };
  const generarCFDI = async () => {
    if (!formFact.rfc || !formFact.razon_social || !formFact.cp_receptor) {
      setErrMsg('RFC, Razón Social y Código Postal son obligatorios');
      return;
    }
    const rfcReg = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;
    if (!rfcReg.test(formFact.rfc)) {
      setErrMsg('RFC inválido. Ejemplo válido: XAXX010101000');
      return;
    }
    setLoading(true);
    setErrMsg('');
    try {
      const token = AuthController.getToken ? AuthController.getToken() : '';
      const res = await fetch('api.php?action=generar_cfdi', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({
          cobro_id: cobroSel.id,
          rfc: formFact.rfc,
          razon_social: formFact.razon_social,
          cp_receptor: formFact.cp_receptor,
          domicilio: formFact.domicilio,
          // <-- domicilio fiscal
          uso_cfdi: formFact.uso_cfdi,
          regimen: formFact.regimen,
          email: formFact.email,
          total: cobroSel.total,
          descripcion: (cobroSel.items || []).map(i => i.nombre).join(', '),
          escuela_rfc: escuela?.rfc || 'EDU000101AAA',
          escuela_nombre: escuela?.nombre || 'EduPago S.C.'
        })
      });
      const cfdi = await res.json();
      if (!cfdi.success) throw new Error(cfdi.error || 'Error al generar CFDI');
      const newCobros = data.cobros.map(c => c.id === cobroSel.id ? {
        ...c,
        factura: true,
        factura_cfdi: {
          uuid: cfdi.uuid,
          folio_fiscal: cfdi.folio_fiscal,
          serie: cfdi.serie,
          folio: cfdi.folio,
          fecha_timbrado: cfdi.fecha_timbrado,
          subtotal: cfdi.subtotal,
          iva: cfdi.iva,
          total: cfdi.total,
          rfc_receptor: formFact.rfc,
          razon: formFact.razon_social,
          uso_cfdi: formFact.uso_cfdi,
          cp_receptor: formFact.cp_receptor,
          // <-- GUARDAR EN EL ESTADO
          email: formFact.email,
          xml: cfdi.xml,
          // Facturapi no devuelve el XML en crudo en la respuesta inicial. Te sugiero ignorar esto o cambiar el flujo de descarga (ver más abajo)
          qr_url: cfdi.qr_url,
          facturapi_id: cfdi.facturapi_id // <-- GUARDAR EL ID DE FACTURAPI
        }
      } : c);
      const newData = {
        ...data,
        cobros: newCobros
      };
      setData(newData);
      AppModel.save(newData);
      setCfdiVisor({
        ...cfdi,
        rfc_receptor: formFact.rfc,
        razon: formFact.razon_social,
        cobro: cobroSel
      });
      setModal('visor');
    } catch (e) {
      setErrMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Simulador SPEI — llama a api.php?action=simular_spei
  const simularSPEI = async () => {
    if (!simRef || !simMonto) {
      setSimStatus('error');
      setSimMsg('Referencia y monto requeridos');
      return;
    }
    setSimLoading(true);
    setSimStatus(null);
    try {
      const res = await fetch('api.php?action=simular_spei', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          referencia: simRef.toUpperCase(),
          monto: parseFloat(simMonto),
          emisor: simEmisor
        })
      });
      const r = await res.json();
      if (r.success) {
        setSimStatus('ok');
        setSimMsg('Pago simulado. Auth: ' + r.autorizacion + '. El polling de la Caja lo detectará en ~10s.');
      } else throw new Error(r.error);
    } catch (e) {
      setSimStatus('error');
      setSimMsg(e.message || 'Error de conexión con el servidor PHP');
    } finally {
      setSimLoading(false);
    }
  };

  // ─── NUEVO: DESCAGAR XML Y PDF DESDE FACTURAPI ───
  // Facturapi no te da el string del XML cuando lo creas. Te da URLs públicas 
  // para descargar el XML y PDF, o debes hacer un GET a su API para obtener el binario.
  const descargarDocumento = async (cfdi, tipo) => {
    // tipo = 'xml' o 'pdf'
    if (!cfdi.facturapi_id) {
      alert("Este CFDI es simulado o antiguo y no tiene ID de Facturapi");
      return;
    }

    // Lo más sencillo es descargar directamente desde la URL de descarga de Facturapi (si la tienes configurada en tu dashboard)
    // O puedes crear un pequeño endpoint en api.php?action=descargar_cfdi&id=...&tipo=xml que haga el curl a Facturapi y devuelva el archivo
    // Para simplificar aquí, asumo que tienes habilitada la URL pública (verifica tu dashboard de Facturapi).
    // Si no, Facturapi te pide hacer un request a: https://www.facturapi.io/v2/invoices/{id}/xml

    // Una implementación simple que abre en nueva pestaña un hipotético endpoint tuyo
    window.open(`api.php?action=descargar_cfdi&id=${cfdi.facturapi_id}&tipo=${tipo}`, '_blank');
  };
  const filtrar = lista => !q ? lista : lista.filter(c => c.cliente.toLowerCase().includes(q.toLowerCase()) || c.folio.toLowerCase().includes(q.toLowerCase()));
  const tabStyle = active => ({
    padding: '8px 18px',
    borderRadius: 'var(--radius-sm)',
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
    border: 'none',
    background: 'transparent',
    color: active ? 'var(--accent)' : 'var(--ink-3)',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
    transition: 'all .15s'
  });
  return /*#__PURE__*/_jsxDEV("div", {
    children: [/*#__PURE__*/_jsxDEV("div", {
      style: {
        marginBottom: 20,
        padding: '16px 20px',
        background: 'linear-gradient(135deg,#1e3a8a 0%,#312e81 100%)',
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12
      },
      children: [/*#__PURE__*/_jsxDEV("div", {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 14
        },
        children: [/*#__PURE__*/_jsxDEV("div", {
          style: {
            display: "flex",
            justifyContent: "center"
          },
          children: /*#__PURE__*/_jsxDEV(Icon, {
            name: "facturacion2",
            size: 36,
            color: "var(--ink-4)"
          }, void 0, false)
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              fontWeight: 700,
              fontSize: 15,
              color: '#fff'
            },
            children: "Facturación CFDI 4.0"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            style: {
              fontSize: 12,
              color: 'rgba(255,255,255,.6)',
              marginTop: 2
            },
            children: "Generación de XML timbrable · Listo para conectar a Facturama / SW SAPiens"
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        style: {
          display: 'flex',
          gap: 8
        },
        children: [/*#__PURE__*/_jsxDEV("div", {
          style: {
            textAlign: 'center',
            padding: '8px 16px',
            background: 'rgba(255,255,255,.1)',
            borderRadius: 'var(--radius-sm)'
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              fontSize: 18,
              fontWeight: 700,
              color: '#fff'
            },
            children: emitidas.length
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            style: {
              fontSize: 10,
              color: 'rgba(255,255,255,.6)',
              textTransform: 'uppercase'
            },
            children: "Emitidas"
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          style: {
            textAlign: 'center',
            padding: '8px 16px',
            background: 'rgba(255,255,255,.1)',
            borderRadius: 'var(--radius-sm)'
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              fontSize: 18,
              fontWeight: 700,
              color: '#fbbf24'
            },
            children: pendientesFact.length
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            style: {
              fontSize: 10,
              color: 'rgba(255,255,255,.6)',
              textTransform: 'uppercase'
            },
            children: "Sin factura"
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true)]
    }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
      style: {
        display: 'flex',
        gap: 4,
        marginBottom: 20,
        borderBottom: '1px solid var(--border-glow)'
      },
      children: [/*#__PURE__*/_jsxDEV("button", {
        style: tabStyle(tab === 'pendientes'),
        onClick: () => setTab('pendientes'),
        children: ["Por facturar (", pendientesFact.length, ")"]
      }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
        style: tabStyle(tab === 'emitidas'),
        onClick: () => setTab('emitidas'),
        children: ["Emitidas (", emitidas.length, ")"]
      }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
        style: tabStyle(tab === 'spei_sim'),
        onClick: () => setTab('spei_sim'),
        children: "Simulador SPEI"
      }, void 0, false)]
    }, void 0, true), tab === 'pendientes' && /*#__PURE__*/_jsxDEV("div", {
      className: "card",
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "card-header",
        children: /*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "card-title",
            children: "Cobros sin factura"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "card-sub",
            children: [pendientesFact.length, " cobros pagados sin CFDI"]
          }, void 0, true)]
        }, void 0, true)
      }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
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
          placeholder: "Buscar por folio o cliente…",
          value: q,
          onChange: e => setQ(e.target.value)
        }, void 0, false)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        className: "table-wrap",
        children: /*#__PURE__*/_jsxDEV("table", {
          children: [/*#__PURE__*/_jsxDEV("thead", {
            children: /*#__PURE__*/_jsxDEV("tr", {
              children: [/*#__PURE__*/_jsxDEV("th", {
                children: "Folio"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Fecha"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Cliente"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Método"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Total"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Acción"
              }, void 0, false)]
            }, void 0, true)
          }, void 0, false), /*#__PURE__*/_jsxDEV("tbody", {
            children: [filtrar(pendientesFact).length === 0 && /*#__PURE__*/_jsxDEV("tr", {
              children: /*#__PURE__*/_jsxDEV("td", {
                colSpan: 6,
                children: /*#__PURE__*/_jsxDEV("div", {
                  className: "empty-state",
                  children: [/*#__PURE__*/_jsxDEV("div", {
                    className: "empty-icon",
                    children: /*#__PURE__*/_jsxDEV(Icon, {
                      name: "check",
                      size: 36,
                      color: "currentColor"
                    }, void 0, false)
                  }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                    className: "empty-text",
                    children: "¡Todo facturado!"
                  }, void 0, false)]
                }, void 0, true)
              }, void 0, false)
            }, void 0, false), filtrar(pendientesFact).map(c => /*#__PURE__*/_jsxDEV("tr", {
              children: [/*#__PURE__*/_jsxDEV("td", {
                children: /*#__PURE__*/_jsxDEV("span", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 12
                  },
                  children: c.folio
                }, void 0, false)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                style: {
                  color: 'var(--ink-3)',
                  fontSize: 12
                },
                children: c.fecha
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                style: {
                  fontSize: 13
                },
                children: c.cliente
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: /*#__PURE__*/_jsxDEV(MetodoBadge, {
                  metodo: c.metodo
                }, void 0, false)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: /*#__PURE__*/_jsxDEV("span", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontWeight: 600
                  },
                  children: fmt(c.total)
                }, void 0, false)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: /*#__PURE__*/_jsxDEV("button", {
                  className: "btn btn-primary btn-sm",
                  onClick: () => abrirSolicitar(c),
                  children: "Generar CFDI"
                }, void 0, false)
              }, void 0, false)]
            }, c.id, true))]
          }, void 0, true)]
        }, void 0, true)
      }, void 0, false)]
    }, void 0, true), tab === 'emitidas' && /*#__PURE__*/_jsxDEV("div", {
      className: "card",
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "card-header",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "card-title",
          children: "CFDIs emitidos"
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          className: "card-sub",
          children: [emitidas.length, " facturas generadas"]
        }, void 0, true)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        className: "table-wrap",
        children: /*#__PURE__*/_jsxDEV("table", {
          children: [/*#__PURE__*/_jsxDEV("thead", {
            children: /*#__PURE__*/_jsxDEV("tr", {
              children: [/*#__PURE__*/_jsxDEV("th", {
                children: "Folio"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Cliente / RFC"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "UUID Fiscal"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Fecha"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Total"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Acciones"
              }, void 0, false)]
            }, void 0, true)
          }, void 0, false), /*#__PURE__*/_jsxDEV("tbody", {
            children: [emitidas.length === 0 && /*#__PURE__*/_jsxDEV("tr", {
              children: /*#__PURE__*/_jsxDEV("td", {
                colSpan: 6,
                children: /*#__PURE__*/_jsxDEV("div", {
                  className: "empty-state",
                  children: /*#__PURE__*/_jsxDEV("div", {
                    className: "empty-text",
                    children: "Sin facturas emitidas aún"
                  }, void 0, false)
                }, void 0, false)
              }, void 0, false)
            }, void 0, false), emitidas.map(c => /*#__PURE__*/_jsxDEV("tr", {
              children: [/*#__PURE__*/_jsxDEV("td", {
                children: /*#__PURE__*/_jsxDEV("span", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 12
                  },
                  children: c.folio
                }, void 0, false)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: [/*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontSize: 13,
                    fontWeight: 500
                  },
                  children: c.cliente
                }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontSize: 11,
                    color: 'var(--ink-4)',
                    fontFamily: 'var(--mono)'
                  },
                  children: c.factura_cfdi?.rfc_receptor
                }, void 0, false)]
              }, void 0, true), /*#__PURE__*/_jsxDEV("td", {
                children: /*#__PURE__*/_jsxDEV("span", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 10.5,
                    color: 'var(--ink-3)'
                  },
                  children: [c.factura_cfdi?.uuid?.slice(0, 18), "…"]
                }, void 0, true)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                style: {
                  fontSize: 12,
                  color: 'var(--ink-3)'
                },
                children: c.factura_cfdi?.fecha_timbrado?.slice(0, 10)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: /*#__PURE__*/_jsxDEV("span", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontWeight: 600,
                    color: 'var(--green)'
                  },
                  children: fmt(c.total)
                }, void 0, false)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    display: 'flex',
                    gap: 5
                  },
                  children: [/*#__PURE__*/_jsxDEV("button", {
                    className: "btn btn-ghost btn-sm",
                    onClick: () => {
                      setCfdiVisor({
                        ...c.factura_cfdi,
                        cobro: c
                      });
                      setModal('visor');
                    },
                    children: "Ver"
                  }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
                    className: "btn btn-ghost btn-sm",
                    onClick: () => descargarDocumento(c.factura_cfdi, 'xml'),
                    children: "⬇ XML"
                  }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
                    className: "btn btn-ghost btn-sm",
                    onClick: () => descargarDocumento(c.factura_cfdi, 'pdf'),
                    children: "⬇ PDF"
                  }, void 0, false)]
                }, void 0, true)
              }, void 0, false)]
            }, c.id, true))]
          }, void 0, true)]
        }, void 0, true)
      }, void 0, false)]
    }, void 0, true), tab === 'spei_sim' && /*#__PURE__*/_jsxDEV("div", {
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "card",
        style: {
          marginBottom: 16,
          borderLeft: '4px solid var(--amber)'
        },
        children: /*#__PURE__*/_jsxDEV("div", {
          style: {
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start'
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              flexShrink: 0
            },
            children: /*#__PURE__*/_jsxDEV(Icon, {
              name: "settings",
              size: 28,
              color: "var(--amber)"
            }, void 0, false)
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                fontWeight: 600,
                fontSize: 14,
                color: 'var(--ink)',
                marginBottom: 4
              },
              children: "Simulador de pago SPEI"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 13,
                color: 'var(--ink-2)',
                lineHeight: 1.6
              },
              children: "Simula una transferencia SPEI entrante sin webhook real. Escribe la matrícula del cobro y el monto. El sistema guarda el pago y el polling de la Caja lo detecta automáticamente en ~10 segundos."
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                marginTop: 8,
                fontSize: 12,
                color: 'var(--amber)',
                background: 'var(--amber-glow)',
                padding: '6px 10px',
                borderRadius: 'var(--radius-sm)',
                display: 'inline-block'
              },
              children: "Solo para ambiente de pruebas"
            }, void 0, false)]
          }, void 0, true)]
        }, void 0, true)
      }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
        className: "card",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "card-header",
          children: /*#__PURE__*/_jsxDEV("div", {
            className: "card-title",
            children: "Simular transferencia entrante"
          }, void 0, false)
        }, void 0, false), speiPendientes.length > 0 && /*#__PURE__*/_jsxDEV("div", {
          style: {
            marginBottom: 18
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              fontSize: 11,
              color: 'var(--ink-4)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '.4px',
              marginBottom: 8
            },
            children: "Cobros SPEI pendientes — clic para seleccionar"
          }, void 0, false), speiPendientes.map(c => /*#__PURE__*/_jsxDEV("div", {
            onClick: () => {
              setSimRef(c.referencia || c.folio);
              setSimMonto(String(c.total));
              setSimStatus(null);
            },
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 14px',
              background: 'var(--glass-light)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 6,
              cursor: 'pointer',
              border: '1px solid var(--border-glow)',
              transition: 'all .15s'
            },
            onMouseEnter: e => e.currentTarget.style.borderColor = 'var(--border-active)',
            onMouseLeave: e => e.currentTarget.style.borderColor = 'var(--border-glow)',
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                flex: 1,
                minWidth: 0
              },
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 13,
                  fontWeight: 500
                },
                children: c.cliente
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 11,
                  color: 'var(--ink-3)',
                  fontFamily: 'var(--mono)',
                  marginTop: 2
                },
                children: ["Ref: ", c.referencia || c.folio]
              }, void 0, true)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontFamily: 'var(--mono)',
                fontWeight: 700,
                color: 'var(--amber)',
                flexShrink: 0
              },
              children: fmt(c.total)
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 11,
                color: 'var(--accent)',
                flexShrink: 0
              },
              children: "→ Seleccionar"
            }, void 0, false)]
          }, c.id, true))]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          style: {
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            marginBottom: 16
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "form-group",
            style: {
              gridColumn: '1/-1'
            },
            children: [/*#__PURE__*/_jsxDEV("label", {
              className: "form-label",
              children: "Referencia / Matrícula (concepto SPEI) *"
            }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
              className: "form-input",
              placeholder: "Ej: ITM-2024-001",
              value: simRef,
              onChange: e => {
                setSimRef(e.target.value.toUpperCase());
                setSimStatus(null);
              },
              style: {
                fontFamily: 'var(--mono)',
                letterSpacing: 1
              }
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            className: "form-group",
            children: [/*#__PURE__*/_jsxDEV("label", {
              className: "form-label",
              children: "Monto en pesos *"
            }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
              className: "form-input",
              type: "number",
              placeholder: "2800.00",
              value: simMonto,
              onChange: e => {
                setSimMonto(e.target.value);
                setSimStatus(null);
              },
              style: {
                fontFamily: 'var(--mono)'
              }
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            className: "form-group",
            children: [/*#__PURE__*/_jsxDEV("label", {
              className: "form-label",
              children: "Nombre del emisor"
            }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
              className: "form-input",
              placeholder: "NOMBRE PADRE DE FAMILIA",
              value: simEmisor,
              onChange: e => setSimEmisor(e.target.value.toUpperCase())
            }, void 0, false)]
          }, void 0, true)]
        }, void 0, true), simStatus === 'ok' && /*#__PURE__*/_jsxDEV("div", {
          style: {
            marginBottom: 14,
            padding: '12px 16px',
            background: 'var(--green-glow)',
            border: '1px solid var(--green)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 13,
            color: 'var(--green)'
          },
          children: simMsg
        }, void 0, false), simStatus === 'error' && /*#__PURE__*/_jsxDEV("div", {
          style: {
            marginBottom: 14,
            padding: '12px 16px',
            background: 'var(--red-glow)',
            border: '1px solid var(--red)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 13,
            color: 'var(--red)'
          },
          children: simMsg
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          style: {
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap'
          },
          children: [/*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-primary",
            onClick: simularSPEI,
            disabled: simLoading || !simRef || !simMonto,
            children: simLoading ? /*#__PURE__*/_jsxDEV(_Fragment, {
              children: [/*#__PURE__*/_jsxDEV("span", {
                className: "spinner",
                style: {
                  borderTopColor: '#fff',
                  marginRight: 8
                }
              }, void 0, false), "Enviando…"]
            }, void 0, true) : 'Simular transferencia SPEI'
          }, void 0, false), simStatus === 'ok' && /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-secondary",
            onClick: () => {
              SpeiPoller.verificarAhora();
              setSimMsg(prev => prev + ' (verificando ahora…)');
            },
            children: "Verificar ahora"
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          style: {
            marginTop: 20,
            padding: '14px 16px',
            background: 'var(--glass-light)',
            borderRadius: 'var(--radius-sm)'
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              fontSize: 11,
              color: 'var(--ink-4)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '.4px',
              marginBottom: 10
            },
            children: "¿Cómo funciona la detección con CLABE individual?"
          }, void 0, false), ['Cada alumno tiene su propia CLABE SPEI asignada desde el pool de la escuela.', 'El padre transfiere a la CLABE individual — sin necesidad de escribir concepto.', 'STP/Pagadetodo recibe el dinero y llama al webhook (webhook_spei.php).', 'El webhook identifica al alumno por su CLABE y confirma el cobro automáticamente.', 'El sistema actualiza el saldo del alumno y registra el pago.'].map((txt, n) => /*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'flex',
              gap: 10,
              marginBottom: 8,
              alignItems: 'flex-start'
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: 'var(--accent)',
                color: 'var(--navy)',
                fontSize: 11,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              },
              children: n + 1
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 12.5,
                color: 'var(--ink-2)',
                lineHeight: 1.5
              },
              children: txt
            }, void 0, false)]
          }, n, true))]
        }, void 0, true)]
      }, void 0, true)]
    }, void 0, true), modal === 'solicitar' && cobroSel && /*#__PURE__*/_jsxDEV("div", {
      className: "modal-backdrop",
      onClick: e => e.target === e.currentTarget && setModal(null),
      children: /*#__PURE__*/_jsxDEV("div", {
        className: "modal modal-lg",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "modal-header",
          children: [/*#__PURE__*/_jsxDEV("div", {
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "modal-title",
              children: "Generar CFDI 4.0"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 12,
                color: 'var(--ink-3)',
                marginTop: 2
              },
              children: [cobroSel.folio, " · ", cobroSel.cliente, " · ", /*#__PURE__*/_jsxDEV("span", {
                style: {
                  fontFamily: 'var(--mono)'
                },
                children: fmt(cobroSel.total)
              }, void 0, false)]
            }, void 0, true)]
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
          children: [errMsg && /*#__PURE__*/_jsxDEV("div", {
            style: {
              marginBottom: 14,
              padding: '10px 14px',
              background: 'var(--red-glow)',
              border: '1px solid var(--red)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
              color: 'var(--red)'
            },
            children: errMsg
          }, void 0, false), formFact._preLlenado && /*#__PURE__*/_jsxDEV("div", {
            style: {
              marginBottom: 14,
              padding: '10px 14px',
              background: 'var(--green-glow)',
              border: '1px solid rgba(16,185,129,.25)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              color: 'var(--green)',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            },
            children: "Datos fiscales pre-llenados desde el perfil del cliente. Verifica antes de generar."
          }, void 0, false), !formFact._preLlenado && cobroSel && /*#__PURE__*/_jsxDEV("div", {
            style: {
              marginBottom: 14,
              padding: '10px 14px',
              background: 'var(--amber-glow)',
              border: '1px solid rgba(245,158,11,.25)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              color: 'var(--amber)',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            },
            children: "Este cliente no tiene datos fiscales guardados. Llena el formulario o registra sus datos en Clientes → ."
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "RFC del receptor *"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "form-input",
                placeholder: "XAXX010101000",
                value: formFact.rfc,
                onChange: e => setFormFact(f => ({
                  ...f,
                  rfc: e.target.value.toUpperCase().replace(/\s/g, '')
                })),
                style: {
                  fontFamily: 'var(--mono)',
                  letterSpacing: 1
                }
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 10.5,
                  color: 'var(--ink-4)',
                  marginTop: 3
                },
                children: "Público en general: XAXX010101000"
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Código Postal *"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "form-input",
                placeholder: "Ej. 97000",
                value: formFact.cp_receptor,
                onChange: e => setFormFact(f => ({
                  ...f,
                  cp_receptor: e.target.value
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
                children: "Razón social *"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "form-input",
                placeholder: "NOMBRE COMPLETO O RAZÓN SOCIAL",
                value: formFact.razon_social,
                onChange: e => setFormFact(f => ({
                  ...f,
                  razon_social: e.target.value.toUpperCase()
                }))
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              style: {
                gridColumn: '1/-1'
              },
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Domicilio fiscal"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "form-input",
                placeholder: "Calle, Número, Colonia, Ciudad, Estado, CP",
                value: formFact.domicilio,
                onChange: e => setFormFact(f => ({
                  ...f,
                  domicilio: e.target.value
                }))
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 10.5,
                  color: 'var(--ink-4)',
                  marginTop: 3
                },
                children: "Opcional — se imprime en el comprobante"
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Correo para envío"
              }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                className: "form-input",
                type: "email",
                placeholder: "padre@mail.com",
                value: formFact.email,
                onChange: e => setFormFact(f => ({
                  ...f,
                  email: e.target.value
                }))
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Uso del CFDI"
              }, void 0, false), /*#__PURE__*/_jsxDEV("select", {
                className: "form-select",
                value: formFact.uso_cfdi,
                onChange: e => setFormFact(f => ({
                  ...f,
                  uso_cfdi: e.target.value
                })),
                children: Object.entries(USO_CFDI).map(([k, v]) => /*#__PURE__*/_jsxDEV("option", {
                  value: k,
                  children: v
                }, k, false))
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "form-group",
              children: [/*#__PURE__*/_jsxDEV("label", {
                className: "form-label",
                children: "Régimen fiscal del receptor"
              }, void 0, false), /*#__PURE__*/_jsxDEV("select", {
                className: "form-select",
                value: formFact.regimen,
                onChange: e => setFormFact(f => ({
                  ...f,
                  regimen: e.target.value
                })),
                children: Object.entries(REGIMENES).map(([k, v]) => /*#__PURE__*/_jsxDEV("option", {
                  value: k,
                  children: v
                }, k, false))
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              marginTop: 16,
              padding: '14px 16px',
              background: 'var(--glass-light)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border-glow)'
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 11,
                color: 'var(--ink-4)',
                textTransform: 'uppercase',
                letterSpacing: '.4px',
                marginBottom: 10
              },
              children: "Vista previa del comprobante"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 12
              },
              children: [{
                l: 'Subtotal',
                v: fmt(cobroSel.total / 1.16)
              }, {
                l: 'IVA 16%',
                v: fmt(cobroSel.total - cobroSel.total / 1.16)
              }, {
                l: 'Total',
                v: fmt(cobroSel.total),
                bold: true
              }].map(s => /*#__PURE__*/_jsxDEV("div", {
                children: [/*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontSize: 10.5,
                    color: 'var(--ink-4)',
                    marginBottom: 2
                  },
                  children: s.l
                }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 14,
                    fontWeight: s.bold ? 700 : 400,
                    color: s.bold ? 'var(--green)' : 'var(--ink)'
                  },
                  children: s.v
                }, void 0, false)]
              }, s.l, true))
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                marginTop: 10,
                fontSize: 11.5,
                color: 'var(--ink-3)'
              },
              children: ["Conceptos: ", (cobroSel.items || []).map(i => i.nombre).join(', ')]
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
            onClick: generarCFDI,
            disabled: loading || !formFact.rfc || !formFact.razon_social || !formFact.cp_receptor,
            children: loading ? /*#__PURE__*/_jsxDEV(_Fragment, {
              children: [/*#__PURE__*/_jsxDEV("span", {
                className: "spinner",
                style: {
                  borderTopColor: '#fff',
                  marginRight: 8
                }
              }, void 0, false), "Generando…"]
            }, void 0, true) : 'Generar CFDI'
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true)
    }, void 0, false), modal === 'visor' && cfdiVisor && /*#__PURE__*/_jsxDEV("div", {
      className: "modal-backdrop",
      onClick: e => e.target === e.currentTarget && setModal(null),
      children: /*#__PURE__*/_jsxDEV("div", {
        className: "modal modal-lg",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "modal-header",
          children: [/*#__PURE__*/_jsxDEV("div", {
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "modal-title",
              style: {
                display: "flex",
                alignItems: "center",
                gap: 8
              },
              children: [/*#__PURE__*/_jsxDEV(Icon, {
                name: "check",
                size: 18,
                color: "var(--green)"
              }, void 0, false), " CFDI Generado"]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 12,
                color: 'var(--green)',
                marginTop: 2
              },
              children: "Listo para timbrado con PAC"
            }, void 0, false)]
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
              padding: '12px 16px',
              marginBottom: 16,
              background: 'linear-gradient(135deg,#1e3a8a,#312e81)',
              borderRadius: 'var(--radius)'
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 10,
                color: 'rgba(255,255,255,.5)',
                marginBottom: 4,
                textTransform: 'uppercase',
                letterSpacing: '.5px'
              },
              children: "Folio Fiscal (UUID)"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontFamily: 'var(--mono)',
                fontSize: 13,
                fontWeight: 600,
                color: '#fff',
                letterSpacing: .5,
                wordBreak: 'break-all'
              },
              children: cfdiVisor.uuid || cfdiVisor.folio_fiscal
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'flex',
                gap: 20,
                marginTop: 8,
                flexWrap: 'wrap'
              },
              children: [/*#__PURE__*/_jsxDEV("div", {
                children: [/*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontSize: 10,
                    color: 'rgba(255,255,255,.4)'
                  },
                  children: "Serie / Folio"
                }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    color: 'rgba(255,255,255,.85)'
                  },
                  children: [cfdiVisor.serie || 'A', "-", cfdiVisor.folio]
                }, void 0, true)]
              }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                children: [/*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontSize: 10,
                    color: 'rgba(255,255,255,.4)'
                  },
                  children: "Fecha timbrado"
                }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    color: 'rgba(255,255,255,.85)'
                  },
                  children: cfdiVisor.fecha_timbrado
                }, void 0, false)]
              }, void 0, true)]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              marginBottom: 16
            },
            children: [{
              l: 'RFC Receptor',
              v: cfdiVisor.rfc_receptor
            }, {
              l: 'Código Postal',
              v: cfdiVisor.cp_receptor
            }, {
              l: 'Domicilio fiscal',
              v: cfdiVisor.domicilio || '—',
              col: '1/-1'
            }, {
              l: 'Uso CFDI',
              v: cfdiVisor.uso_cfdi
            }, {
              l: 'Subtotal',
              v: fmt(cfdiVisor.subtotal)
            }, {
              l: 'IVA 16%',
              v: fmt(cfdiVisor.iva)
            }, {
              l: 'Total',
              v: fmt(cfdiVisor.total),
              bold: true,
              color: 'var(--green)'
            }, {
              l: 'Correo envío',
              v: cfdiVisor.email || '—'
            }].map(s => /*#__PURE__*/_jsxDEV("div", {
              style: s.col ? {
                gridColumn: s.col
              } : {},
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 10.5,
                  color: 'var(--ink-4)',
                  marginBottom: 2
                },
                children: s.l
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 13,
                  fontWeight: s.bold ? 700 : 400,
                  color: s.color || 'var(--ink)',
                  fontFamily: s.bold ? 'var(--mono)' : undefined
                },
                children: s.v
              }, void 0, false)]
            }, s.l, true))
          }, void 0, false), cfdiVisor.qr_url && /*#__PURE__*/_jsxDEV("div", {
            style: {
              textAlign: 'center',
              marginBottom: 16
            },
            children: [/*#__PURE__*/_jsxDEV("img", {
              src: cfdiVisor.qr_url,
              alt: "QR SAT",
              style: {
                width: 120,
                height: 120,
                border: '1px solid var(--border-glow)',
                borderRadius: 'var(--radius-sm)'
              },
              onError: e => e.target.style.display = 'none'
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 10.5,
                color: 'var(--ink-4)',
                marginTop: 4
              },
              children: "QR verificación SAT"
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              background: 'var(--amber-glow)',
              border: '1px solid rgba(245,158,11,.2)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 14px',
              fontSize: 12,
              color: 'var(--ink-2)'
            },
            children: [/*#__PURE__*/_jsxDEV("strong", {
              style: {
                color: 'var(--amber)'
              },
              children: "Nota:"
            }, void 0, false), " XML con estructura CFDI 4.0 válida. El archivo XML no se descarga automáticamente desde Facturapi de esta forma. Descargalo desde la pestaña de \"Emitidas\""]
          }, void 0, true)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-footer",
          children: /*#__PURE__*/_jsxDEV("button", {
            className: "btn className=btn-secondary",
            onClick: () => setModal(null),
            children: "Cerrar"
          }, void 0, false)
        }, void 0, false)]
      }, void 0, true)
    }, void 0, false)]
  }, void 0, true);
}