var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};
var _Fragment = React.Fragment;
/* views/Facturacion.jsx v3 — Facturación */
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
    domicilio: '',
    // Complemento IEDU (Instituciones Educativas Privadas) — Facturapi
    nombre_alumno: '',
    curp_alumno: '',
    nivel_educativo: '',
    rvoe: ''
  });
  const cobrosEscuela = data.cobros.filter(c => c.estado === 'pagado');
  const pendientesFact = cobrosEscuela.filter(c => !c.factura_cfdi);
  const emitidas = cobrosEscuela.filter(c => c.factura_cfdi);
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
  const NIVELES_EDUCATIVOS_SAT = ['Preescolar', 'Primaria', 'Secundaria', 'Profesional técnico', 'Bachillerato o su equivalente'];
  const abrirSolicitar = cobro => {
    // Bug fix: buscar cliente por cliente_id; si es null (cobro sin cliente),
    // intentar por nombre como fallback, y si tampoco, dejar form vacío.
    let cli = cobro.cliente_id ? data.clientes.find(c => c.id === cobro.cliente_id) : data.clientes.find(c => c.nombre === cobro.cliente);

    // El dato fiscal (RFC/razón social) vive a nivel FAMILIA (el tutor que
    // paga, compartido entre todos sus hijos), no por alumno — por eso la
    // familia tiene prioridad sobre cualquier rfc_factura que haya quedado
    // en el alumno de un timbrado antiguo (de antes de este cambio), que si
    // no se ignora, un hermano con una factura vieja "gana" sobre el dato
    // real y compartido de la familia.
    if (cli?.familia_id) {
      const fam = data.familias?.find(f => f.id === cli.familia_id);
      if (fam?.rfc_factura) {
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
      _preLlenado: tieneDatos, // bandera interna para mostrar/ocultar el banner
      // IEDU: se prellena con lo que ya tenga el alumno; si falta algo
      // (nivel educativo o RVOE nuevos en el catálogo), queda editable.
      nombre_alumno: cli?.nombre || '',
      curp_alumno: cli?.curp || '',
      nivel_educativo: cli?.nivel_educativo_sat || '',
      rvoe: cli?.rvoe || escuela?.rvoe || ''
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
          descripcion: ((cobroSel.items || []).map(i => i.nombre).filter(Boolean).join(', ')) || 'Servicios educativos',
          escuela_rfc: escuela?.rfc || 'EDU000101AAA',
          escuela_nombre: escuela?.nombre || 'EduPago S.C.',
          // Complemento IEDU — si se deja vacío el backend lo omite y timbra
          // sin complemento (evita bloquear el CFDI por un dato faltante).
          nombre_alumno: formFact.nombre_alumno,
          curp_alumno: formFact.curp_alumno,
          nivel_educativo: formFact.nivel_educativo,
          rvoe: formFact.rvoe
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

  // ─── DESCARGAR XML Y PDF DESDE FACTURAPI (vía nuestro backend, autenticado) ───
  const descargarDocumento = async (cobro, tipo) => {
    // tipo = 'xml' o 'pdf'
    if (!cobro.factura_cfdi && !cobro.facturapi_id) {
      alert("Este CFDI es simulado o antiguo y no tiene ID de Facturapi");
      return;
    }
    try {
      const token = AuthController.getToken();
      const params = new URLSearchParams({ action: 'descargar_cfdi', cobro_id: cobro.id, tipo });
      const res = await fetch('api.php?' + params.toString(), {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      // Chequeo doble: por status Y por Content-Type real. Si el backend
      // regresa un error (aunque venga con HTTP 200 por accidente), el
      // Content-Type sigue siendo JSON — así nunca se descarga un JSON de
      // error disfrazado de PDF/XML.
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || contentType.includes('application/json')) {
        const json = await res.json().catch(() => null);
        alert('No se pudo descargar: ' + (json?.error || 'Error desconocido'));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cfdi-${cobro.folio || cobro.id}.${tipo}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Error de conexión al descargar: ' + e.message);
    }
  };
  const filtrar = lista => !q ? lista : lista.filter(c => c.cliente.toLowerCase().includes(q.toLowerCase()) || c.folio.toLowerCase().includes(q.toLowerCase()));
  // Paginación de las dos listas (25-sep-2026). Con 120 cobros por facturar la
  // tabla se volvía un scroll interminable y no había forma de llegar al final
  // sin rodar. Se usa el hook que ya existe (views/components/Paginador.js),
  // el mismo que usan las demás listas locales del sistema.
  //
  // Se paginan las listas YA FILTRADAS: paginar antes de filtrar daría páginas
  // con huecos —una página de 25 que muestra 3 porque el resto no pasó el
  // filtro— y el contador de páginas mentiría.
  const pendFiltrados = filtrar(pendientesFact);
  const emitFiltradas = filtrar(emitidas);
  const pgPend = usePaginacion(pendFiltrados, 25);
  const pgEmit = usePaginacion(emitFiltradas, 25);
  return /*#__PURE__*/_jsxDEV("div", {
    children: [
    // ── Franja de cabecera ───────────────────────────────────────────────
    //
    // Historia corta, porque tuvo dos intentos fallidos y conviene no repetirlos:
    //
    //   1. Original: franja con degradado azul-índigo a mano (#1e3a8a ->
    //      #312e81) y texto blanco. La ESTRUCTURA era buena —título a la
    //      izquierda, cifras a la derecha, todo en una sola banda— pero esos
    //      azules no existen en la paleta y no reaccionaban al tema: en modo
    //      claro quedaba un bloque oscuro en medio de una pantalla clara.
    //   2. Segundo intento: quitar la franja y dejar una línea de texto suelta
    //      con las cifras en stats-grid. Peor: .stats-grid estira dos tarjetas
    //      a todo el ancho (dos números chicos en dos cajas enormes) y sin la
    //      banda la pantalla perdía toda jerarquía.
    //
    // Esto conserva la estructura del original y cambia SOLO los colores por
    // tokens del tema. Las cifras se quedan: sí dicen algo que las pestañas no
    // —"cuánto llevas emitido" frente a "qué pestaña estoy viendo"— y a la
    // derecha aprovechan el ancho que antes quedaba vacío.
    /*#__PURE__*/_jsxDEV("div", {
      className: "card",
      style: {
        marginBottom: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 16
      },
      children: [
        /*#__PURE__*/_jsxDEV("div", {
          style: { display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 },
          children: [
            // Cuadro con el acento de marca en vez del icono suelto: le da
            // peso a la franja sin recurrir a un fondo de color inventado.
            /*#__PURE__*/_jsxDEV("div", {
              style: {
                width: 46, height: 46, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 'var(--radius)',
                background: 'var(--accent-glow, var(--glass-light))'
              },
              children: /*#__PURE__*/_jsxDEV(Icon, { name: "facturacion2", size: 24, color: "var(--accent)" }, 'ic', false)
            }, 'box', false),
            /*#__PURE__*/_jsxDEV("div", {
              style: { minWidth: 0 },
              children: [
                /*#__PURE__*/_jsxDEV("div", { style: { fontWeight: 700, fontSize: 16, color: 'var(--ink)' }, children: "Facturación" }, 't', false),
                /*#__PURE__*/_jsxDEV("div", { style: { fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }, children: "Genera y administra tus comprobantes fiscales" }, 's', false)
              ]
            }, 'tx', true)
          ]
        }, 'izq', true),
        /*#__PURE__*/_jsxDEV("div", {
          style: { display: 'flex', gap: 10, flexWrap: 'wrap' },
          children: [
            { label: 'Emitidas',    val: emitidas.length,       alerta: false },
            { label: 'Sin factura', val: pendientesFact.length, alerta: pendientesFact.length > 0 }
          ].map((s, i) => /*#__PURE__*/_jsxDEV("div", {
            style: {
              minWidth: 96, textAlign: 'center',
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--glass-light)',
              border: '1px solid var(--border-glow)'
            },
            children: [
              /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 20, fontWeight: 800, fontFamily: 'var(--mono)',
                  // Ámbar solo cuando de verdad hay algo sin facturar. Antes
                  // este número estaba SIEMPRE en #fbbf24, avisara o no.
                  color: s.alerta ? 'var(--amber)' : 'var(--ink)'
                },
                children: s.val
              }, 'v', false),
              /*#__PURE__*/_jsxDEV("div", {
                style: { fontSize: 10, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '.4px', marginTop: 2 },
                children: s.label
              }, 'l', false)
            ]
          }, i, true))
        }, 'der', false)
      ]
    }, void 0, true),
    // Pestañas con las clases de botón del sistema, como en views/Comisiones.js
    // (25-sep-2026).
    //
    // Antes eran botones con esquinas redondeadas Y ADEMÁS una barra de 2px
    // debajo del activo: las dos formas se peleaban —una raya recta colgando
    // de una pastilla redonda— y encima el contenedor llevaba su propia línea
    // inferior, así que había tres bordes distintos en la misma franja.
    // Ahora el activo simplemente se llena, que es como se ve en el resto.
    /*#__PURE__*/_jsxDEV("div", {
      style: { display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
      children: [
        { id: 'pendientes', label: 'Por facturar', n: pendientesFact.length },
        { id: 'emitidas',   label: 'Emitidas',     n: emitidas.length }
      ].map(t => /*#__PURE__*/_jsxDEV("button", {
        className: 'btn btn-sm ' + (tab === t.id ? 'btn-primary' : 'btn-secondary'),
        onClick: () => setTab(t.id),
        children: [t.label, ' (', t.n, ')']
      }, t.id, true))
    }, void 0, false),
    tab === 'pendientes' && /*#__PURE__*/_jsxDEV("div", {
      className: "card",
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "card-header",
        children: [/*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "card-title",
            children: "Cobros sin factura"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "card-sub",
            children: [pendientesFact.length, " cobros pagados sin CFDI"]
          }, void 0, true)]
        }, void 0, true),
        typeof Paginacion !== 'undefined' ? /*#__PURE__*/_jsxDEV(Paginacion, {
          pagina: pgPend.n,
          totalPaginas: pgPend.totalPaginas,
          onCambiar: pgPend.ir,
          etiqueta: pgPend.total + ' cobros'
        }, 'pag', false) : null
      ]
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
            children: [pgPend.total === 0 && /*#__PURE__*/_jsxDEV("tr", {
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
            }, void 0, false), pgPend.pagina.map(c => /*#__PURE__*/_jsxDEV("tr", {
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
        }, void 0, true),
        typeof Paginacion !== 'undefined' ? /*#__PURE__*/_jsxDEV(Paginacion, {
          pagina: pgEmit.n,
          totalPaginas: pgEmit.totalPaginas,
          onCambiar: pgEmit.ir,
          etiqueta: pgEmit.total + ' facturas'
        }, 'pag', false) : null]
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
            }, void 0, false), pgEmit.pagina.map(c => /*#__PURE__*/_jsxDEV("tr", {
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
                    onClick: () => descargarDocumento(c, 'xml'),
                    children: "⬇ XML"
                  }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
                    className: "btn btn-ghost btn-sm",
                    onClick: () => descargarDocumento(c, 'pdf'),
                    children: "⬇ PDF"
                  }, void 0, false)]
                }, void 0, true)
              }, void 0, false)]
            }, c.id, true))]
          }, void 0, true)]
        }, void 0, true)
      }, void 0, false)]
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
              children: "Generar factura"
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
              marginTop: 14,
              paddingTop: 14,
              borderTop: '1px dashed var(--border-glow)'
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 11.5,
                fontWeight: 600,
                color: 'var(--ink-3)',
                marginBottom: 8
              },
              children: "Complemento IEDU (instituciones educativas privadas) — requerido para deducibilidad de colegiaturas"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              className: "form-grid",
              children: [/*#__PURE__*/_jsxDEV("div", {
                className: "form-group",
                children: [/*#__PURE__*/_jsxDEV("label", {
                  className: "form-label",
                  children: "Nombre del alumno"
                }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                  className: "form-input",
                  placeholder: "Nombre completo del alumno",
                  value: formFact.nombre_alumno,
                  onChange: e => setFormFact(f => ({
                    ...f,
                    nombre_alumno: e.target.value
                  }))
                }, void 0, false)]
              }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                className: "form-group",
                children: [/*#__PURE__*/_jsxDEV("label", {
                  className: "form-label",
                  children: "CURP del alumno"
                }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                  className: "form-input",
                  placeholder: "18 caracteres",
                  maxLength: 18,
                  value: formFact.curp_alumno,
                  onChange: e => setFormFact(f => ({
                    ...f,
                    curp_alumno: e.target.value.toUpperCase()
                  }))
                }, void 0, false)]
              }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                className: "form-group",
                children: [/*#__PURE__*/_jsxDEV("label", {
                  className: "form-label",
                  children: "Nivel educativo"
                }, void 0, false), /*#__PURE__*/_jsxDEV("select", {
                  className: "form-select",
                  value: formFact.nivel_educativo,
                  onChange: e => setFormFact(f => ({
                    ...f,
                    nivel_educativo: e.target.value
                  })),
                  children: [/*#__PURE__*/_jsxDEV("option", {
                    value: "",
                    children: "— Seleccionar —"
                  }, "", false), ...NIVELES_EDUCATIVOS_SAT.map(n => /*#__PURE__*/_jsxDEV("option", {
                    value: n,
                    children: n
                  }, n, false))]
                }, void 0, true)]
              }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                className: "form-group",
                children: [/*#__PURE__*/_jsxDEV("label", {
                  className: "form-label",
                  children: "RVOE / clave del centro de trabajo"
                }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
                  className: "form-input",
                  placeholder: "Ej. 20PP0001X",
                  value: formFact.rvoe,
                  onChange: e => setFormFact(f => ({
                    ...f,
                    rvoe: e.target.value
                  }))
                }, void 0, false)]
              }, void 0, true)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 10.5,
                color: 'var(--ink-4)',
                marginTop: 6
              },
              children: "Si dejas algún campo vacío, el CFDI se timbra sin el complemento IEDU (el padre de familia no podrá deducir la colegiatura, pero el CFDI seguirá siendo válido)."
            }, void 0, false)]
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
                  // currentColor y no '#fff': el spinner sigue al color del
                  // botón, así no hay que acordarse de cambiarlo si el botón
                  // primario deja de ser de texto blanco.
                  borderTopColor: 'currentColor',
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
              // Mismo criterio que la cabecera: fondo del tema en vez de un
              // degradado azul fijo que en modo claro queda como un bloque
              // oscuro suelto dentro de un modal claro.
              background: 'var(--glass-light)',
              border: '1px solid var(--border-glow)',
              borderRadius: 'var(--radius)'
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 10,
                color: 'var(--ink-3)',
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
                color: 'var(--ink)',
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
                    color: 'var(--ink-4)'
                  },
                  children: "Serie / Folio"
                }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    color: 'var(--ink-2)'
                  },
                  children: [cfdiVisor.serie || 'A', "-", cfdiVisor.folio]
                }, void 0, true)]
              }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
                children: [/*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontSize: 10,
                    color: 'var(--ink-4)'
                  },
                  children: "Fecha timbrado"
                }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 12,
                    color: 'var(--ink-2)'
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
            }, void 0, false), " El comprobante no se descarga automáticamente desde aquí. Descárgalo desde la pestaña de \"Emitidas\""]
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
