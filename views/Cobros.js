var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};
var _Fragment = React.Fragment;
/* views/Cobros.jsx v2 */
function Cobros({
  data,
  setData,
  escuela_id,
  rol
}) {
  const {
    useState
  } = React;
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroMetodo, setFiltroMetodo] = useState('todos');
  const [filtroPeriodo, setFiltroPeriodo] = useState('todo');
  const [q, setQ] = useState('');
  const [detalle, setDetalle] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [buscando, setBuscando] = useState(false);
  // Página actual traída del backend (independiente del data.cobros global,
  // que solo trae un resumen de 90 días para el dashboard). null = aún no
  // se ha buscado en el servidor -> se usa el fallback local de data.cobros.
  const [paginaBackend, setPaginaBackend] = useState(null);
  const [itemsDetalle, setItemsDetalle] = useState(null); // null = cargando/no pedido; [] = ya cargó y no hay

  React.useEffect(() => {
    if (!detalle) { setItemsDetalle(null); return; }
    let cancelado = false;
    setItemsDetalle(null);
    (async () => {
      try {
        const params = new URLSearchParams({ action: 'detalle_cobro', cobro_id: detalle.id });
        const res = await fetch('api.php?' + params.toString(), {
          headers: { 'Authorization': 'Bearer ' + token() },
        });
        const json = await res.json();
        if (!cancelado) setItemsDetalle(json.success ? (json.items || []) : []);
      } catch (e) {
        if (!cancelado) setItemsDetalle([]);
      }
    })();
    return () => { cancelado = true; };
  }, [detalle]);

  const token = () => AuthController.getToken();

  const buscarEnServidor = async (pag) => {
    if (!escuela_id) return;
    setBuscando(true);
    try {
      const params = new URLSearchParams({
        action: 'listar_cobros',
        escuela_id,
        pagina: pag,
        por_pagina: 25,
      });
      if (filtroEstado !== 'todos') params.set('estado', filtroEstado);
      if (q) params.set('buscar', q);
      const res = await fetch('api.php?' + params.toString(), {
        headers: { 'Authorization': 'Bearer ' + token() },
      });
      const json = await res.json();
      if (json.success) {
        setPaginaBackend(json);
      }
    } catch (e) {
      // sin red: se sigue mostrando el fallback local
    } finally {
      setBuscando(false);
    }
  };

  // Debounce de 400ms ante cambios de búsqueda/filtro/escuela; resetea a página 1
  React.useEffect(() => {
    const t = setTimeout(() => {
      setPagina(1);
      buscarEnServidor(1);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, filtroEstado, escuela_id]);

  const irAPagina = p => {
    const totalPaginas = paginaBackend ? Math.max(1, Math.ceil(paginaBackend.total / paginaBackend.por_pagina)) : 1;
    const destino = Math.min(Math.max(1, p), totalPaginas);
    setPagina(destino);
    buscarEnServidor(destino);
  };

  // filtroMetodo se sigue aplicando en cliente sobre la página ya traída
  // (filtrar por método no justifica otro roundtrip; es solo la vista actual).
  const fuente = paginaBackend ? paginaBackend.cobros : [...data.cobros].reverse();
  // Rango del periodo elegido. Se calcula una sola vez, no por cobro.
  const rangoPeriodo = (() => {
    if (filtroPeriodo === 'todo') return null;
    const hoy = new Date();
    const desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    if (filtroPeriodo === 'semana') {
      desde.setDate(desde.getDate() - ((hoy.getDay() + 6) % 7));  // lunes de esta semana
    } else if (filtroPeriodo === 'mes') {
      desde.setMonth(hoy.getMonth(), 1);
    } else if (filtroPeriodo === 'anio') {
      desde.setFullYear(hoy.getFullYear(), 0, 1);
    }
    const p = n => String(n).padStart(2, '0');
    return desde.getFullYear() + '-' + p(desde.getMonth() + 1) + '-' + p(desde.getDate());
  })();

  const lista = fuente.filter(c => {
    if (filtroMetodo !== 'todos' && c.metodo !== filtroMetodo) return false;
    if (rangoPeriodo) {
      const f = String(c.fecha || '').slice(0, 10);
      if (!f || f < rangoPeriodo) return false;
    }
    if (!paginaBackend && filtroEstado !== 'todos' && c.estado !== filtroEstado) return false;
    if (!paginaBackend && q) {
      const busq = q.toLowerCase();
      return c.cliente.toLowerCase().includes(busq) || c.folio.toLowerCase().includes(busq) || c.referencia && c.referencia.toLowerCase().includes(busq);
    }
    return true;
  });
  const totalPaginas = paginaBackend ? Math.max(1, Math.ceil(paginaBackend.total / paginaBackend.por_pagina)) : 1;
  const totales = {
    todos: data.cobros.length,
    pagado: data.cobros.filter(c => c.estado === 'pagado').length,
    pendiente: data.cobros.filter(c => c.estado === 'pendiente').length,
    cancelado: data.cobros.filter(c => c.estado === 'cancelado').length
  };
  const cancelar = async id => {
    if (loadingId) return;
    setLoadingId(id);
    try {
      const res = await CobroController.cancelarCobro(id);
      if (res && res.success === false) throw new Error(res.error || 'Error al cancelar');
      const clientesUpd = (res && res.cliente_id != null)
        ? data.clientes.map(c => c.id === res.cliente_id ? { ...c, saldo_pendiente: res.nuevo_saldo ?? 0 } : c)
        : data.clientes;
      const upd = { ...data, cobros: data.cobros.map(c => c.id === id ? { ...c, estado: 'cancelado' } : c), clientes: clientesUpd };
      AppModel.save(upd);
      setData(upd);
      setDetalle(null);
      if (paginaBackend) buscarEnServidor(pagina);
    } catch(e) {
      alert('Error al cancelar: ' + (e.message || 'Intenta de nuevo'));
    } finally {
      setLoadingId(null);
    }
  };
  const confirmarManual = async id => {
    if (loadingId) return;
    setLoadingId(id);
    const auth_code = 'MANUAL-' + Date.now();
    try {
      const res = await CobroController.confirmarPago(id, { auth_code });
      if (res && res.success === false) throw new Error(res.error || 'Error al confirmar');
      const clientesUpd = (res && res.cliente_id != null)
        ? data.clientes.map(c => c.id === res.cliente_id ? { ...c, saldo_pendiente: res.nuevo_saldo ?? 0 } : c)
        : data.clientes;
      const upd = { ...data, cobros: data.cobros.map(c => c.id === id ? { ...c, estado: 'pagado', auth_code } : c), clientes: clientesUpd };
      AppModel.save(upd);
      setData(upd);
      setDetalle(prev => prev ? { ...prev, estado: 'pagado', auth_code } : null);
      if (paginaBackend) buscarEnServidor(pagina);
    } catch(e) {
      alert('Error al confirmar: ' + (e.message || 'Intenta de nuevo'));
    } finally {
      setLoadingId(null);
    }
  };
  const rebotar = async id => {
    if (loadingId) return;
    if (!confirm('¿Marcar este cheque como rebotado? El cobro regresará a pendiente.')) return;
    setLoadingId(id);
    try {
      const res = await CobroController.marcarChequeRebotado(id);
      if (res && res.success === false) throw new Error(res.error || 'Error al marcar rebotado');
      const clientesUpd = (res && res.cliente_id != null)
        ? data.clientes.map(c => c.id === res.cliente_id ? { ...c, saldo_pendiente: res.nuevo_saldo ?? 0 } : c)
        : data.clientes;
      const upd = { ...data, cobros: data.cobros.map(c => c.id === id ? { ...c, estado: 'pendiente', estatus_cheque: 'rebotado' } : c), clientes: clientesUpd };
      AppModel.save(upd);
      setData(upd);
      setDetalle(prev => prev ? { ...prev, estado: 'pendiente', estatus_cheque: 'rebotado' } : null);
      if (paginaBackend) buscarEnServidor(pagina);
    } catch(e) {
      alert('Error al marcar rebotado: ' + (e.message || 'Intenta de nuevo'));
    } finally {
      setLoadingId(null);
    }
  };
  const exportarCSV = () => {
    const rows = [['Folio', 'Fecha', 'Cliente', 'Total', 'Método', 'Estado', 'Referencia', 'Auth'], ...lista.map(c => [c.folio, c.fecha, `"${c.cliente}"`, c.total, c.metodo, c.estado, c.referencia || '', c.auth_code || ''])];
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `cobros-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };
  return _jsxDEV("div", {
    children: [_jsxDEV("div", {
      className: "stats-grid",
      children: (() => {
        // Resumen del listado que se está viendo, con los datos ya cargados.
        const pagados  = lista.filter(c => c.estado === 'pagado');
        const pends    = lista.filter(c => c.estado === 'pendiente');
        const cobrado  = pagados.reduce((a, c) => a + (Number(c.total) || 0), 0);
        const porCobrar = pends.reduce((a, c) => a + (Number(c.total) || 0), 0);
        const ticket   = pagados.length ? cobrado / pagados.length : 0;
        // Tendencia por día para la mini gráfica de la tarjeta destacada
        const porDia = {};
        pagados.forEach(c => { const d = (c.fecha || '').slice(0, 10); if (d) porDia[d] = (porDia[d] || 0) + (Number(c.total) || 0); });
        const serie = Object.keys(porDia).sort().map(k => porDia[k]);
        const tarjetas = [
          { destacada: true, tinte: '', icono: 'pay', valor: fmt(cobrado), etiqueta: 'Cobrado en este listado', meta: pagados.length + ' cobros pagados', chispa: serie },
          { tinte: 'tint-amber', icono: 'history', valor: fmt(porCobrar), etiqueta: 'Por cobrar', meta: pends.length + ' pendientes' },
          { tinte: 'tint-cyan',  icono: 'cobros',  valor: fmt(ticket),    etiqueta: 'Ticket promedio', meta: 'Sobre los cobros pagados' },
          { tinte: 'tint-green', icono: 'check',   valor: (lista.length ? Math.round(pagados.length / lista.length * 100) : 0) + '%', etiqueta: 'Tasa de cobro', meta: pagados.length + ' de ' + lista.length }
        ];
        return tarjetas.map(t => _jsxDEV("div", {
          className: "stat-card" + (t.destacada ? " is-featured" : ""),
          children: [
            _jsxDEV("div", { className: "stat-icon" + (t.tinte ? " " + t.tinte : ""),
              children: _jsxDEV(Icon, { name: t.icono, size: 19, color: "currentColor" }, void 0, false) }, void 0, false),
            _jsxDEV("div", { className: "stat-value", children: t.valor }, void 0, false),
            _jsxDEV("div", { className: "stat-label", children: t.etiqueta }, void 0, false),
            _jsxDEV("div", { className: "stat-meta", children: t.meta }, void 0, false),
            (t.chispa && t.chispa.length > 2 && typeof Sparkline !== 'undefined')
              ? _jsxDEV("div", { className: "stat-spark", style: { opacity: .9, color: '#fff' },
                  children: _jsxDEV(Sparkline, { datos: t.chispa, alto: 34, color: '#fff' }, void 0, false) }, void 0, false)
              : null
          ]
        }, t.etiqueta, true));
      })()
    }, void 0, false), (() => {
      // Tendencia del listado que se está viendo. Respeta los filtros activos:
      // al filtrar por método o estado, la gráfica se recalcula sola.
      const pagados = lista.filter(c => c.estado === 'pagado' && c.fecha);
      if (pagados.length < 3) return null;

      const fechas = pagados.map(c => String(c.fecha).slice(0, 10)).sort();
      const desde = new Date(fechas[0] + 'T00:00:00');
      const hasta = new Date(fechas[fechas.length - 1] + 'T00:00:00');
      const dias = Math.round((hasta - desde) / 86400000) + 1;
      if (dias < 2 || dias > 400) return null;

      // Con muchos días se agrupa por semana para que la línea siga siendo legible
      const porSemana = dias > 70;
      const cubos = [];
      const idx = {};
      for (let k = 0; k < dias; k++) {
        const d = new Date(desde);
        d.setDate(d.getDate() + k);
        const iso = d.toISOString().slice(0, 10);
        if (porSemana) {
          const lunes = new Date(d);
          lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7));
          const clave = lunes.toISOString().slice(0, 10);
          if (idx[clave] === undefined) {
            idx[clave] = cubos.length;
            cubos.push({ label: lunes.getDate() + '/' + (lunes.getMonth() + 1), valor: 0 });
          }
          idx[iso] = idx[clave];
        } else {
          idx[iso] = cubos.length;
          cubos.push({ label: d.getDate() + '/' + (d.getMonth() + 1), valor: 0 });
        }
      }
      pagados.forEach(c => {
        const n = idx[String(c.fecha).slice(0, 10)];
        if (n !== undefined) cubos[n].valor += Number(c.total) || 0;
      });
      const suma = cubos.reduce((a, c) => a + c.valor, 0);

      return _jsxDEV("div", {
        className: "card",
        style: { marginBottom: 20 },
        children: [
          _jsxDEV("div", {
            className: "card-header",
            children: [
              _jsxDEV("div", {
                children: [
                  _jsxDEV("div", { className: "card-title", children: "Tendencia del periodo" }, void 0, false),
                  _jsxDEV("div", {
                    className: "card-sub",
                    children: porSemana
                      ? cubos.length + ' semanas · según los filtros aplicados'
                      : dias + ' días · según los filtros aplicados'
                  }, void 0, false)
                ]
              }, void 0, true),
              _jsxDEV("div", {
                style: { fontSize: 19, fontWeight: 700, color: 'var(--violet)', letterSpacing: '-.6px' },
                children: fmt(suma)
              }, void 0, false)
            ]
          }, 'h', true),
          (typeof AreaChart !== 'undefined')
            ? _jsxDEV(AreaChart, { datos: cubos, alto: 200, color: 'var(--violet)', formato: fmt }, 'c', false)
            : null
        ]
      }, void 0, true);
    })(), _jsxDEV("div", {
      className: "card",
      children: [_jsxDEV("div", {
        className: "card-header",
        children: [_jsxDEV("div", {
          children: [_jsxDEV("div", {
            className: "card-title",
            children: "Historial de cobros"
          }, void 0, false), _jsxDEV("div", {
            className: "card-sub",
            children: [paginaBackend ? paginaBackend.total : lista.length, " resultados", buscando && ' · buscando…']
          }, void 0, true)]
        }, void 0, true), rol !== 'cajero' && _jsxDEV("button", {
          className: "btn btn-secondary btn-sm",
          onClick: exportarCSV,
          style: {
            display: "flex",
            alignItems: "center",
            gap: 6
          },
          children: [_jsxDEV(Icon, {
            name: "download",
            size: 14,
            color: "currentColor"
          }, void 0, false), " Exportar CSV"]
        }, void 0, true)]
      }, void 0, true), _jsxDEV("div", {
        style: {
          display: 'flex',
          gap: 8,
          marginBottom: 14,
          flexWrap: 'wrap'
        },
        children: [[['todos', 'Todos', 'badge-gray'], ['pagado', 'Pagados', 'badge-green'], ['pendiente', 'Pendientes', 'badge-amber'], ['cancelado', 'Cancelados', 'badge-red']].map(([val, label, cls]) => _jsxDEV("button", {
          className: `badge ${filtroEstado === val ? cls : 'badge-gray'}`,
          style: {
            cursor: 'pointer',
            padding: '5px 12px',
            fontSize: 12,
            border: filtroEstado === val ? '1px solid currentColor' : '1px solid transparent'
          },
          onClick: () => setFiltroEstado(val),
          children: [label, " (", totales[val] ?? lista.filter(c => c.estado === val).length, ")"]
        }, val, true)), _jsxDEV("div", {
          className: "pill-group",
          style: { marginLeft: 'auto' },
          children: [
            { id: 'hoy',    label: 'Hoy' },
            { id: 'semana', label: 'Semana' },
            { id: 'mes',    label: 'Mes' },
            { id: 'anio',   label: 'Año' },
            { id: 'todo',   label: 'Todo' }
          ].map(op => _jsxDEV("button", {
            className: "pill" + (filtroPeriodo === op.id ? " active" : ""),
            style: { padding: '6px 13px', fontSize: 12 },
            onClick: () => { setFiltroPeriodo(op.id); setPagina(1); },
            children: op.label
          }, op.id, false))
        }, 'periodo', false), _jsxDEV("select", {
          className: "form-select",
          style: {
            fontSize: 12,
            padding: '4px 10px',
            width: 'auto'
          },
          value: filtroMetodo,
          onChange: e => setFiltroMetodo(e.target.value),
          children: [_jsxDEV("option", {
            value: "todos",
            children: "Todos los métodos"
          }, void 0, false), _jsxDEV("option", {
            value: "TC",
            children: "Tarjeta"
          }, void 0, false), _jsxDEV("option", {
            value: "SPEI",
            children: "SPEI"
          }, void 0, false), _jsxDEV("option", {
            value: "CoDi",
            children: "CoDi"
          }, void 0, false), _jsxDEV("option", {
            value: "Efectivo",
            children: "Efectivo"
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true), _jsxDEV("div", {
        className: "search-bar",
        style: {
          marginBottom: 16
        },
        children: [_jsxDEV("span", {
          className: "search-icon",
          children: _jsxDEV(Icon, {
            name: "search",
            size: 15,
            color: "currentColor"
          }, void 0, false)
        }, void 0, false), _jsxDEV("input", {
          placeholder: "Buscar por folio, cliente, matrícula…",
          value: q,
          onChange: e => setQ(e.target.value)
        }, void 0, false)]
      }, void 0, true), _jsxDEV("div", {
        className: "table-wrap",
        children: _jsxDEV("table", {
          children: [_jsxDEV("thead", {
            children: _jsxDEV("tr", {
              children: [_jsxDEV("th", {
                children: "Folio"
              }, void 0, false), _jsxDEV("th", {
                children: "Fecha"
              }, void 0, false), _jsxDEV("th", {
                children: "Cliente"
              }, void 0, false), _jsxDEV("th", {
                children: "Referencia"
              }, void 0, false), _jsxDEV("th", {
                children: "Total"
              }, void 0, false), _jsxDEV("th", {
                children: "Método"
              }, void 0, false), _jsxDEV("th", {
                children: "Estado"
              }, void 0, false), _jsxDEV("th", {
                children: "Acción"
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
                      name: "cobros",
                      size: 36,
                      color: "currentColor"
                    }, void 0, false)
                  }, void 0, false), _jsxDEV("div", {
                    className: "empty-text",
                    children: "Sin cobros en este filtro"
                  }, void 0, false)]
                }, void 0, true)
              }, void 0, false)
            }, void 0, false), lista.map(c => _jsxDEV("tr", {
              style: {
                cursor: 'pointer'
              },
              onClick: () => setDetalle(c),
              children: [_jsxDEV("td", {
                children: _jsxDEV("span", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 12
                  },
                  children: c.folio
                }, void 0, false)
              }, void 0, false), _jsxDEV("td", {
                style: {
                  color: 'var(--ink-3)',
                  fontSize: 12
                },
                children: c.fecha
              }, void 0, false), _jsxDEV("td", {
                style: {
                  maxWidth: 160,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: 13
                },
                children: c.cliente
              }, void 0, false), _jsxDEV("td", {
                children: _jsxDEV("span", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    color: 'var(--ink-4)'
                  },
                  children: c.referencia || '—'
                }, void 0, false)
              }, void 0, false), _jsxDEV("td", {
                children: _jsxDEV("span", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontWeight: 600
                  },
                  children: fmt(c.total)
                }, void 0, false)
              }, void 0, false), _jsxDEV("td", {
                children: _jsxDEV(MetodoBadge, {
                  metodo: c.metodo
                }, void 0, false)
              }, void 0, false), _jsxDEV("td", {
                children: _jsxDEV(EstadoBadge, {
                  estado: c.estado
                }, void 0, false)
              }, void 0, false), _jsxDEV("td", {
                onClick: e => e.stopPropagation(),
                children: _jsxDEV("div", {
                  style: {
                    display: 'flex',
                    gap: 4
                  },
                  children: [c.estado === 'pendiente' && _jsxDEV(_Fragment, {
                    children: [_jsxDEV("button", {
                      className: "btn btn-primary btn-sm",
                      onClick: () => confirmarManual(c.id),
                      disabled: loadingId === c.id,
                      title: "Confirmar",
                      children: loadingId === c.id ? '…' : _jsxDEV(Icon, {
                        name: "check",
                        size: 14,
                        color: "currentColor"
                      }, void 0, false)
                    }, void 0, false), _jsxDEV("button", {
                      className: "btn btn-ghost btn-sm",
                      onClick: () => cancelar(c.id),
                      disabled: loadingId === c.id,
                      title: "Cancelar",
                      children: _jsxDEV(Icon, {
                        name: "close",
                        size: 16,
                        color: "currentColor"
                      }, void 0, false)
                    }, void 0, false)]
                  }, void 0, true), c.estado === 'pagado' && c.metodo === 'Cheque' && c.estatus_cheque !== 'rebotado' && _jsxDEV("button", {
                    className: "btn btn-ghost btn-sm",
                    onClick: () => rebotar(c.id),
                    disabled: loadingId === c.id,
                    title: "Marcar cheque como rebotado",
                    style: { color: 'var(--red)' },
                    children: loadingId === c.id ? '…' : _jsxDEV(Icon, {
                      name: "warning",
                      size: 14,
                      color: "currentColor"
                    }, void 0, false)
                  }, void 0, false), c.estado === 'pagado' && _jsxDEV("button", {
                    className: "btn btn-ghost btn-sm",
                    onClick: () => setDetalle(c),
                    children: _jsxDEV(Icon, {
                      name: "cobros",
                      size: 15,
                      color: "currentColor"
                    }, void 0, false)
                  }, void 0, false)]
                }, void 0, true)
              }, void 0, false)]
            }, c.id, true))]
          }, void 0, true)]
        }, void 0, true)
      }, void 0, false), paginaBackend && totalPaginas > 1 && _jsxDEV("div", {
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
            children: `Página ${pagina} de ${totalPaginas} · ${paginaBackend.total} cobros`
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
    }, void 0, true), detalle && _jsxDEV("div", {
      className: "modal-backdrop",
      onClick: e => e.target === e.currentTarget && setDetalle(null),
      children: _jsxDEV("div", {
        className: "modal",
        children: [_jsxDEV("div", {
          className: "modal-header",
          children: [_jsxDEV("div", {
            children: [_jsxDEV("div", {
              className: "modal-title",
              children: detalle.folio
            }, void 0, false), _jsxDEV("div", {
              style: {
                fontSize: 12,
                color: 'var(--ink-3)',
                marginTop: 2
              },
              children: [detalle.fecha, " · ", _jsxDEV(EstadoBadge, {
                estado: detalle.estado
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true), _jsxDEV("button", {
            className: "btn btn-ghost btn-sm",
            onClick: () => setDetalle(null),
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
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              marginBottom: 16
            },
            children: [_jsxDEV("div", {
              children: [_jsxDEV("div", {
                style: {
                  fontSize: 11,
                  color: 'var(--ink-4)',
                  textTransform: 'uppercase',
                  letterSpacing: '.4px',
                  marginBottom: 3
                },
                children: "Cliente"
              }, void 0, false), _jsxDEV("div", {
                style: {
                  fontSize: 13,
                  fontWeight: 500
                },
                children: detalle.cliente
              }, void 0, false)]
            }, void 0, true), _jsxDEV("div", {
              children: [_jsxDEV("div", {
                style: {
                  fontSize: 11,
                  color: 'var(--ink-4)',
                  textTransform: 'uppercase',
                  letterSpacing: '.4px',
                  marginBottom: 3
                },
                children: "Método de pago"
              }, void 0, false), _jsxDEV(MetodoBadge, {
                metodo: detalle.metodo
              }, void 0, false)]
            }, void 0, true), _jsxDEV("div", {
              children: [_jsxDEV("div", {
                style: {
                  fontSize: 11,
                  color: 'var(--ink-4)',
                  textTransform: 'uppercase',
                  letterSpacing: '.4px',
                  marginBottom: 3
                },
                children: "Referencia / Concepto SPEI"
              }, void 0, false), _jsxDEV("div", {
                style: {
                  fontFamily: 'var(--mono)',
                  fontSize: 13
                },
                children: detalle.referencia || '—'
              }, void 0, false)]
            }, void 0, true), detalle.auth_code && _jsxDEV("div", {
              children: [_jsxDEV("div", {
                style: {
                  fontSize: 11,
                  color: 'var(--ink-4)',
                  textTransform: 'uppercase',
                  letterSpacing: '.4px',
                  marginBottom: 3
                },
                children: "Autorización"
              }, void 0, false), _jsxDEV("div", {
                style: {
                  fontFamily: 'var(--mono)',
                  fontSize: 13
                },
                children: detalle.auth_code
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true), (() => {
            // ── Datos para completar el pago ──
            // Estas columnas YA existen en la tabla `cobros` y se guardaban,
            // pero el detalle nunca las mostraba: por eso al dejar un cobro
            // pendiente se "perdía" la liga de pago o la referencia.
            const esPendiente = detalle.estado === 'pendiente';
            const filas = [];

            if (detalle.referencia) {
              filas.push({ etiqueta: 'Referencia de pago', valor: detalle.referencia, copiable: true, mono: true });
            }
            if (detalle.ref_vencimiento) {
              filas.push({ etiqueta: 'Vence', valor: String(detalle.ref_vencimiento).slice(0, 10) });
            }
            if (detalle.ref_transaccion) {
              filas.push({ etiqueta: 'ID de transacción', valor: detalle.ref_transaccion, copiable: true, mono: true });
            }
            // Cheque
            if (detalle.num_cheque) {
              filas.push({ etiqueta: 'Cheque núm.', valor: detalle.num_cheque, mono: true });
            }
            if (detalle.banco_cheque) {
              filas.push({ etiqueta: 'Banco', valor: detalle.banco_cheque });
            }
            if (detalle.titular_cheque) {
              filas.push({ etiqueta: 'Titular', valor: detalle.titular_cheque });
            }
            if (detalle.num_cuenta_cheque) {
              filas.push({ etiqueta: 'Cuenta', valor: detalle.num_cuenta_cheque, mono: true });
            }
            if (detalle.fecha_cheque) {
              filas.push({ etiqueta: 'Fecha del cheque', valor: String(detalle.fecha_cheque).slice(0, 10) });
            }
            if (detalle.estatus_cheque) {
              filas.push({ etiqueta: 'Estatus del cheque', valor: detalle.estatus_cheque });
            }

            const ligas = [];
            if (detalle.ref_payformat_url) {
              ligas.push({ url: detalle.ref_payformat_url, label: 'Abrir formato de pago', icono: 'download', principal: true });
            }
            if (detalle.ref_barcode_url) {
              ligas.push({ url: detalle.ref_barcode_url, label: 'Ver código de barras / QR', icono: 'eye' });
            }

            if (filas.length === 0 && ligas.length === 0) {
              // Solo se avisa si está pendiente: en un cobro ya pagado es normal
              // que no queden datos de cobranza.
              if (!esPendiente) return null;
              return _jsxDEV("div", {
                style: {
                  borderTop: '1px solid var(--border-glow)', paddingTop: 12, marginBottom: 12,
                  fontSize: 12, color: 'var(--ink-4)'
                },
                children: "Este cobro no tiene referencia ni liga de pago registrada."
              }, 'sinpago', false);
            }

            return _jsxDEV("div", {
              style: { borderTop: '1px solid var(--border-glow)', paddingTop: 12, marginBottom: 12 },
              children: [
                _jsxDEV("div", {
                  style: {
                    fontSize: 11, color: 'var(--ink-4)', textTransform: 'uppercase',
                    letterSpacing: '.4px', marginBottom: 10
                  },
                  children: esPendiente ? 'Para completar el pago' : 'Datos del pago'
                }, 'tit', false),

                filas.length > 0 ? _jsxDEV("div", {
                  style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginBottom: ligas.length ? 14 : 0 },
                  children: filas.map((f, i) => _jsxDEV("div", {
                    children: [
                      _jsxDEV("div", {
                        style: { fontSize: 10.5, color: 'var(--ink-4)', marginBottom: 3 },
                        children: f.etiqueta
                      }, void 0, false),
                      _jsxDEV("div", {
                        style: { display: 'flex', alignItems: 'center', gap: 7 },
                        children: [
                          _jsxDEV("span", {
                            style: {
                              fontSize: 13, color: 'var(--ink)', wordBreak: 'break-all',
                              fontFamily: f.mono ? 'var(--mono)' : 'inherit'
                            },
                            children: String(f.valor)
                          }, void 0, false),
                          f.copiable ? _jsxDEV("button", {
                            className: "btn-ghost",
                            title: "Copiar",
                            style: { padding: 4, flexShrink: 0 },
                            onClick: () => {
                              try { navigator.clipboard.writeText(String(f.valor)); } catch (e) {}
                            },
                            children: _jsxDEV(Icon, { name: 'copy', size: 13, color: 'currentColor' }, void 0, false)
                          }, void 0, false) : null
                        ]
                      }, void 0, true)
                    ]
                  }, f.etiqueta + i, true))
                }, 'filas', false) : null,

                ligas.length > 0 ? _jsxDEV("div", {
                  style: { display: 'flex', gap: 9, flexWrap: 'wrap' },
                  children: ligas.map((l, i) => _jsxDEV("a", {
                    href: l.url,
                    target: "_blank",
                    rel: "noopener noreferrer",
                    className: "btn " + (l.principal ? "btn-primary" : "btn-secondary"),
                    style: { textDecoration: 'none' },
                    children: [
                      _jsxDEV(Icon, { name: l.icono, size: 14, color: 'currentColor' }, void 0, false),
                      l.label
                    ]
                  }, 'liga' + i, true))
                }, 'ligas', false) : null
              ]
            }, 'pago', true);
          })(), _jsxDEV("div", {
            style: {
              borderTop: '1px solid var(--border-glow)',
              paddingTop: 12,
              marginBottom: 12
            },
            children: [_jsxDEV("div", {
              style: {
                fontSize: 11,
                color: 'var(--ink-4)',
                textTransform: 'uppercase',
                letterSpacing: '.4px',
                marginBottom: 8
              },
              children: "Conceptos"
            }, void 0, false), itemsDetalle === null ? _jsxDEV("div", {
              style: { fontSize: 12.5, color: 'var(--ink-3)', padding: '6px 0' },
              children: "Cargando…"
            }, void 0, false) : itemsDetalle.length === 0 ? _jsxDEV("div", {
              style: { fontSize: 12.5, color: 'var(--ink-4)', padding: '6px 0' },
              children: "Sin desglose disponible para este cobro."
            }, void 0, false) : itemsDetalle.map((item, i) => _jsxDEV("div", {
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                padding: '6px 0',
                borderBottom: '1px solid var(--glass-light)',
                fontSize: 13
              },
              children: [_jsxDEV("span", {
                children: [item.nombre, " ", item.cantidad > 1 && _jsxDEV("span", {
                  style: {
                    color: 'var(--ink-4)'
                  },
                  children: ["×", item.cantidad]
                }, void 0, true)]
              }, void 0, true), _jsxDEV("span", {
                style: {
                  fontFamily: 'var(--mono)',
                  fontWeight: 500
                },
                children: fmt(item.subtotal)
              }, void 0, false)]
            }, item.id || i, true)), _jsxDEV("div", {
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                padding: '10px 0 0',
                fontWeight: 700,
                fontSize: 15
              },
              children: [_jsxDEV("span", {
                children: "Total"
              }, void 0, false), _jsxDEV("span", {
                style: {
                  fontFamily: 'var(--mono)',
                  color: 'var(--green)'
                },
                children: fmt(detalle.total)
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true)]
        }, void 0, true), _jsxDEV("div", {
          className: "modal-footer",
          children: [detalle.estado === 'pendiente' && _jsxDEV(_Fragment, {
            children: [_jsxDEV("button", {
              className: "btn btn-secondary",
              onClick: () => cancelar(detalle.id),
              disabled: !!loadingId,
              children: loadingId ? 'Procesando…' : "Cancelar cobro"
            }, void 0, false), _jsxDEV("button", {
              className: "btn btn-primary",
              onClick: () => confirmarManual(detalle.id),
              disabled: !!loadingId,
              style: {
                display: "flex",
                alignItems: "center",
                gap: 6
              },
              children: loadingId ? 'Procesando…' : [_jsxDEV(Icon, {
                name: "check",
                size: 15,
                color: "currentColor"
              }, void 0, false), " Confirmar pago"]
            }, void 0, true)]
          }, void 0, true), detalle.estado === 'pagado' && detalle.metodo === 'Cheque' && detalle.estatus_cheque !== 'rebotado' && _jsxDEV("button", {
            className: "btn btn-secondary",
            onClick: () => rebotar(detalle.id),
            disabled: !!loadingId,
            style: {
              color: 'var(--red)',
              display: "flex",
              alignItems: "center",
              gap: 6
            },
            children: loadingId ? 'Procesando…' : [_jsxDEV(Icon, {
              name: "warning",
              size: 15,
              color: "currentColor"
            }, void 0, false), " Marcar cheque rebotado"]
          }, void 0, true), detalle.estado !== 'pendiente' && _jsxDEV("button", {
            className: "btn btn-secondary",
            onClick: () => setDetalle(null),
            children: "Cerrar"
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true)
    }, void 0, false)]
  }, void 0, true);
}
