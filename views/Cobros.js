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
  setData
}) {
  const {
    useState
  } = React;
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroMetodo, setFiltroMetodo] = useState('todos');
  const [q, setQ] = useState('');
  const [detalle, setDetalle] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const lista = [...data.cobros].reverse().filter(c => {
    if (filtroEstado !== 'todos' && c.estado !== filtroEstado) return false;
    if (filtroMetodo !== 'todos' && c.metodo !== filtroMetodo) return false;
    if (q) {
      const busq = q.toLowerCase();
      return c.cliente.toLowerCase().includes(busq) || c.folio.toLowerCase().includes(busq) || c.referencia && c.referencia.toLowerCase().includes(busq);
    }
    return true;
  });
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
    } catch(e) {
      alert('Error al confirmar: ' + (e.message || 'Intenta de nuevo'));
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
  return /*#__PURE__*/_jsxDEV("div", {
    children: [/*#__PURE__*/_jsxDEV("div", {
      className: "card",
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "card-header",
        children: [/*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "card-title",
            children: "Historial de cobros"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "card-sub",
            children: [lista.length, " resultados"]
          }, void 0, true)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
          className: "btn btn-secondary btn-sm",
          onClick: exportarCSV,
          style: {
            display: "flex",
            alignItems: "center",
            gap: 6
          },
          children: [/*#__PURE__*/_jsxDEV(Icon, {
            name: "download",
            size: 14,
            color: "currentColor"
          }, void 0, false), " Exportar CSV"]
        }, void 0, true)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        style: {
          display: 'flex',
          gap: 8,
          marginBottom: 14,
          flexWrap: 'wrap'
        },
        children: [[['todos', 'Todos', 'badge-gray'], ['pagado', 'Pagados', 'badge-green'], ['pendiente', 'Pendientes', 'badge-amber'], ['cancelado', 'Cancelados', 'badge-red']].map(([val, label, cls]) => /*#__PURE__*/_jsxDEV("button", {
          className: `badge ${filtroEstado === val ? cls : 'badge-gray'}`,
          style: {
            cursor: 'pointer',
            padding: '5px 12px',
            fontSize: 12,
            border: filtroEstado === val ? '1px solid currentColor' : '1px solid transparent'
          },
          onClick: () => setFiltroEstado(val),
          children: [label, " (", totales[val] ?? lista.filter(c => c.estado === val).length, ")"]
        }, val, true)), /*#__PURE__*/_jsxDEV("select", {
          className: "form-select",
          style: {
            fontSize: 12,
            padding: '4px 10px',
            width: 'auto',
            marginLeft: 'auto'
          },
          value: filtroMetodo,
          onChange: e => setFiltroMetodo(e.target.value),
          children: [/*#__PURE__*/_jsxDEV("option", {
            value: "todos",
            children: "Todos los métodos"
          }, void 0, false), /*#__PURE__*/_jsxDEV("option", {
            value: "TC",
            children: "Tarjeta"
          }, void 0, false), /*#__PURE__*/_jsxDEV("option", {
            value: "SPEI",
            children: "SPEI"
          }, void 0, false), /*#__PURE__*/_jsxDEV("option", {
            value: "CoDi",
            children: "CoDi"
          }, void 0, false), /*#__PURE__*/_jsxDEV("option", {
            value: "Efectivo",
            children: "Efectivo"
          }, void 0, false)]
        }, void 0, true)]
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
          placeholder: "Buscar por folio, cliente, matrícula…",
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
                children: "Referencia"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Total"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Método"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Estado"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Acción"
              }, void 0, false)]
            }, void 0, true)
          }, void 0, false), /*#__PURE__*/_jsxDEV("tbody", {
            children: [lista.length === 0 && /*#__PURE__*/_jsxDEV("tr", {
              children: /*#__PURE__*/_jsxDEV("td", {
                colSpan: 8,
                children: /*#__PURE__*/_jsxDEV("div", {
                  className: "empty-state",
                  children: [/*#__PURE__*/_jsxDEV("div", {
                    className: "empty-icon",
                    children: /*#__PURE__*/_jsxDEV(Icon, {
                      name: "cobros",
                      size: 36,
                      color: "currentColor"
                    }, void 0, false)
                  }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                    className: "empty-text",
                    children: "Sin cobros en este filtro"
                  }, void 0, false)]
                }, void 0, true)
              }, void 0, false)
            }, void 0, false), lista.map(c => /*#__PURE__*/_jsxDEV("tr", {
              style: {
                cursor: 'pointer'
              },
              onClick: () => setDetalle(c),
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
                  maxWidth: 160,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: 13
                },
                children: c.cliente
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: /*#__PURE__*/_jsxDEV("span", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 11,
                    color: 'var(--ink-4)'
                  },
                  children: c.referencia || '—'
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
                children: /*#__PURE__*/_jsxDEV(MetodoBadge, {
                  metodo: c.metodo
                }, void 0, false)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: /*#__PURE__*/_jsxDEV(EstadoBadge, {
                  estado: c.estado
                }, void 0, false)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                onClick: e => e.stopPropagation(),
                children: /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    display: 'flex',
                    gap: 4
                  },
                  children: [c.estado === 'pendiente' && /*#__PURE__*/_jsxDEV(_Fragment, {
                    children: [/*#__PURE__*/_jsxDEV("button", {
                      className: "btn btn-primary btn-sm",
                      onClick: () => confirmarManual(c.id),
                      disabled: loadingId === c.id,
                      title: "Confirmar",
                      children: loadingId === c.id ? '…' : /*#__PURE__*/_jsxDEV(Icon, {
                        name: "check",
                        size: 14,
                        color: "currentColor"
                      }, void 0, false)
                    }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
                      className: "btn btn-ghost btn-sm",
                      onClick: () => cancelar(c.id),
                      disabled: loadingId === c.id,
                      title: "Cancelar",
                      children: /*#__PURE__*/_jsxDEV(Icon, {
                        name: "close",
                        size: 16,
                        color: "currentColor"
                      }, void 0, false)
                    }, void 0, false)]
                  }, void 0, true), c.estado === 'pagado' && /*#__PURE__*/_jsxDEV("button", {
                    className: "btn btn-ghost btn-sm",
                    onClick: () => setDetalle(c),
                    children: /*#__PURE__*/_jsxDEV(Icon, {
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
      }, void 0, false)]
    }, void 0, true), detalle && /*#__PURE__*/_jsxDEV("div", {
      className: "modal-backdrop",
      onClick: e => e.target === e.currentTarget && setDetalle(null),
      children: /*#__PURE__*/_jsxDEV("div", {
        className: "modal",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "modal-header",
          children: [/*#__PURE__*/_jsxDEV("div", {
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "modal-title",
              children: detalle.folio
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 12,
                color: 'var(--ink-3)',
                marginTop: 2
              },
              children: [detalle.fecha, " · ", /*#__PURE__*/_jsxDEV(EstadoBadge, {
                estado: detalle.estado
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-ghost btn-sm",
            onClick: () => setDetalle(null),
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
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              marginBottom: 16
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 11,
                  color: 'var(--ink-4)',
                  textTransform: 'uppercase',
                  letterSpacing: '.4px',
                  marginBottom: 3
                },
                children: "Cliente"
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 13,
                  fontWeight: 500
                },
                children: detalle.cliente
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 11,
                  color: 'var(--ink-4)',
                  textTransform: 'uppercase',
                  letterSpacing: '.4px',
                  marginBottom: 3
                },
                children: "Método de pago"
              }, void 0, false), /*#__PURE__*/_jsxDEV(MetodoBadge, {
                metodo: detalle.metodo
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 11,
                  color: 'var(--ink-4)',
                  textTransform: 'uppercase',
                  letterSpacing: '.4px',
                  marginBottom: 3
                },
                children: "Referencia / Concepto SPEI"
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontFamily: 'var(--mono)',
                  fontSize: 13
                },
                children: detalle.referencia || '—'
              }, void 0, false)]
            }, void 0, true), detalle.auth_code && /*#__PURE__*/_jsxDEV("div", {
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 11,
                  color: 'var(--ink-4)',
                  textTransform: 'uppercase',
                  letterSpacing: '.4px',
                  marginBottom: 3
                },
                children: "Autorización"
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontFamily: 'var(--mono)',
                  fontSize: 13
                },
                children: detalle.auth_code
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              borderTop: '1px solid var(--border-glow)',
              paddingTop: 12,
              marginBottom: 12
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 11,
                color: 'var(--ink-4)',
                textTransform: 'uppercase',
                letterSpacing: '.4px',
                marginBottom: 8
              },
              children: "Conceptos"
            }, void 0, false), (detalle.items || []).map((item, i) => /*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                padding: '6px 0',
                borderBottom: '1px solid var(--glass-light)',
                fontSize: 13
              },
              children: [/*#__PURE__*/_jsxDEV("span", {
                children: [item.nombre, " ", item.qty > 1 && /*#__PURE__*/_jsxDEV("span", {
                  style: {
                    color: 'var(--ink-4)'
                  },
                  children: ["×", item.qty]
                }, void 0, true)]
              }, void 0, true), /*#__PURE__*/_jsxDEV("span", {
                style: {
                  fontFamily: 'var(--mono)',
                  fontWeight: 500
                },
                children: fmt(item.precio * item.qty)
              }, void 0, false)]
            }, i, true)), /*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                padding: '10px 0 0',
                fontWeight: 700,
                fontSize: 15
              },
              children: [/*#__PURE__*/_jsxDEV("span", {
                children: "Total"
              }, void 0, false), /*#__PURE__*/_jsxDEV("span", {
                style: {
                  fontFamily: 'var(--mono)',
                  color: 'var(--green)'
                },
                children: fmt(detalle.total)
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-footer",
          children: [detalle.estado === 'pendiente' && /*#__PURE__*/_jsxDEV(_Fragment, {
            children: [/*#__PURE__*/_jsxDEV("button", {
              className: "btn btn-secondary",
              onClick: () => cancelar(detalle.id),
              disabled: !!loadingId,
              children: loadingId ? 'Procesando…' : "Cancelar cobro"
            }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
              className: "btn btn-primary",
              onClick: () => confirmarManual(detalle.id),
              disabled: !!loadingId,
              style: {
                display: "flex",
                alignItems: "center",
                gap: 6
              },
              children: loadingId ? 'Procesando…' : [/*#__PURE__*/_jsxDEV(Icon, {
                name: "check",
                size: 15,
                color: "currentColor"
              }, void 0, false), " Confirmar pago"]
            }, void 0, true)]
          }, void 0, true), detalle.estado !== 'pendiente' && /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-secondary",
            onClick: () => setDetalle(null),
            children: "Cerrar"
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true)
    }, void 0, false)]
  }, void 0, true);
}