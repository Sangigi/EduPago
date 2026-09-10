var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};
/* views/Reportes.jsx v2 — Por escuela */
function Reportes({
  data,
  escuela
}) {
  const {
    useState
  } = React;
  const [periodo, setPeriodo] = useState('mes');
  const hoy = new Date();
  const mesActual = hoy.getMonth();
  const anioActual = hoy.getFullYear();
  const filtrarPorPeriodo = cobros => {
    return cobros.filter(c => {
      if (c.estado !== 'pagado') return false;
      const d = new Date(c.fecha);
      if (periodo === 'hoy') return c.fecha === hoy.toISOString().slice(0, 10);
      if (periodo === 'semana') return (hoy - d) / 86400000 <= 7;
      if (periodo === 'mes') return d.getMonth() === mesActual && d.getFullYear() === anioActual;
      if (periodo === 'anio') return d.getFullYear() === anioActual;
      return true;
    });
  };
  const cobrosFilt = filtrarPorPeriodo(data.cobros);
  const totalFilt = cobrosFilt.reduce((a, c) => a + c.total, 0);
  const metodos = ['TC', 'SPEI', 'CoDi', 'Efectivo', 'Cheque', 'Otro'];
  const metodoIconos = {
    TC: 'card',
    SPEI: 'bank',
    CoDi: 'phone',
    Efectivo: 'pay',
    Cheque: 'edit',
    Otro: 'info'
  };
  const metodoColors = {
    TC: 'var(--violet)',
    SPEI: 'var(--cyan)',
    CoDi: 'var(--magenta)',
    Efectivo: 'var(--green)',
    Cheque: 'var(--amber)',
    Otro: 'var(--red)'
  };
  // Misma agrupación que AppModel: 'Tarjeta' cuenta como TC y todo método
  // vacío o no catalogado cae en 'Otro', para que la suma cuadre con el total.
  const claseMetodo = c => {
    const m = String(c.metodo || '').trim();
    if (m === 'Tarjeta') return 'TC';
    // 'EfectivoRef' es el valor real que queda en `cobros.metodo` para pagos
    // en efectivo con referencia/código de barras -- sin este caso caían en
    // 'Otro' en vez de 'Efectivo' (10-sep-2026).
    if (m === 'EfectivoRef') return 'Efectivo';
    return metodos.indexOf(m) >= 0 ? m : 'Otro';
  };
  const porMetodo = metodos.map(m => ({
    metodo: m,
    total: cobrosFilt.filter(c => claseMetodo(c) === m).reduce((a, c) => a + c.total, 0),
    count: cobrosFilt.filter(c => c.metodo === m).length
  }));
  const maxMetodo = Math.max(...porMetodo.map(m => m.total), 1);

  // Top alumnos con más pagos
  const porAlumno = {};
  cobrosFilt.forEach(c => {
    porAlumno[c.cliente] = (porAlumno[c.cliente] || 0) + c.total;
  });
  const topAlumnos = Object.entries(porAlumno).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const exportarExcel = () => {
    const totalListado = cobrosFilt.reduce((a, c) => a + (Number(c.total) || 0), 0);
    const filas = [
      { estilo: 'titulo', celdas: [`Reporte — ${escuela?.nombre || 'Escuela'} — ${new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}`], colspanPrimera: 6 },
      { celdas: [] },
      { estilo: 'header', celdas: ['Folio', 'Fecha', 'Cliente', 'Total', 'Método', 'Referencia'] },
      ...cobrosFilt.map(c => ({ estilo: 'dato', celdas: [c.folio, c.fecha, c.cliente, CSVExport.money(c.total), c.metodo, c.referencia || ''] })),
      { celdas: [] },
      { estilo: 'granTotal', celdas: ['TOTAL', '', '', CSVExport.money(totalListado), '', ''] },
    ];
    ExcelExport.descargar(`reporte-${escuela?.clave || 'esc'}-${new Date().toISOString().slice(0, 10)}`, filas);
  };
  return _jsxDEV("div", {
    children: [_jsxDEV("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        flexWrap: 'wrap',
        gap: 10
      },
      children: [_jsxDEV("div", {
        children: [escuela && _jsxDEV("span", {
          style: {
            color: escuela.color,
            marginRight: 8
          },
          children: escuela.logo_emoji
        }, void 0, false), _jsxDEV("span", {
          style: {
            fontWeight: 700,
            fontSize: 16,
            color: 'var(--ink)'
          },
          children: ["Reporte de cobros — ", escuela?.nombre || 'Esta escuela', escuela && !escuela.activa ? ' (Inactiva)' : '']
        }, void 0, true)]
      }, void 0, true), _jsxDEV("div", {
        style: {
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap'
        },
        children: [_jsxDEV("div", {
          style: {
            display: 'flex',
            gap: 4
          },
          children: [['hoy', 'Hoy'], ['semana', 'Semana'], ['mes', 'Mes'], ['anio', 'Año'], ['todo', 'Todo']].map(([val, label]) => _jsxDEV("button", {
            className: periodo === val ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm',
            onClick: () => setPeriodo(val),
            children: label
          }, val, false))
        }, void 0, false), _jsxDEV("button", {
          className: "btn btn-secondary btn-sm",
          onClick: exportarExcel,
          style: {
            display: "flex",
            alignItems: "center",
            gap: 6
          },
          children: [_jsxDEV(Icon, {
            name: "download",
            size: 14,
            color: "currentColor"
          }, void 0, false), " Exportar"]
        }, void 0, true)]
      }, void 0, true)]
    }, void 0, true), _jsxDEV("div", {
      className: "stats-grid",
      style: {
        marginBottom: 20
      },
      children: [_jsxDEV("div", {
        className: "stat-card is-featured",
        children: [_jsxDEV("div", {
          className: "stat-icon",
          children: _jsxDEV(Icon, {
            name: "pay",
            size: 19,
            color: "currentColor"
          }, void 0, false)
        }, void 0, false), _jsxDEV("div", {
          className: "stat-label",
          children: "Total cobrado"
        }, void 0, false), _jsxDEV("div", {
          className: "stat-value",
          children: fmt(totalFilt)
        }, void 0, false), _jsxDEV("div", {
          className: "stat-meta",
          children: [cobrosFilt.length, " transacciones"]
        }, void 0, true)]
      }, void 0, true), _jsxDEV("div", {
        className: "stat-card",
        children: [_jsxDEV("div", {
          className: "stat-icon tint-amber",
          children: _jsxDEV(Icon, {
            name: "history",
            size: 19,
            color: "currentColor"
          }, void 0, false)
        }, void 0, false), _jsxDEV("div", {
          className: "stat-label",
          children: "Pendiente total"
        }, void 0, false), _jsxDEV("div", {
          className: "stat-value",
          style: {
            fontSize: 20,
            color: 'var(--amber)'
          },
          children: fmt(data.cobros.filter(c => c.estado === 'pendiente').reduce((a, c) => a + c.total, 0))
        }, void 0, false), _jsxDEV("div", {
          className: "stat-meta",
          children: [data.cobros.filter(c => c.estado === 'pendiente').length, " cobros"]
        }, void 0, true)]
      }, void 0, true), _jsxDEV("div", {
        className: "stat-card",
        children: [_jsxDEV("div", {
          className: "stat-icon",
          style: {
            background: 'var(--purple-glow)'
          },
          children: _jsxDEV(Icon, {
            name: "familias",
            size: 20,
            color: "currentColor"
          }, void 0, false)
        }, void 0, false), _jsxDEV("div", {
          className: "stat-label",
          children: "Familias activas"
        }, void 0, false), _jsxDEV("div", {
          className: "stat-value",
          children: data.familias.filter(f => f.activa).length
        }, void 0, false), _jsxDEV("div", {
          className: "stat-meta",
          children: [data.clientes.filter(c => c.familia_id).length, " alumnos agrupados"]
        }, void 0, true)]
      }, void 0, true), _jsxDEV("div", {
        className: "stat-card",
        children: [_jsxDEV("div", {
          className: "stat-icon tint-green",
          children: _jsxDEV(Icon, {
            name: "alumnos",
            size: 19,
            color: "currentColor"
          }, void 0, false)
        }, void 0, false), _jsxDEV("div", {
          className: "stat-label",
          children: "Alumnos activos"
        }, void 0, false), _jsxDEV("div", {
          className: "stat-value",
          children: typeof data.clientes_activos_total === 'number' ? data.clientes_activos_total : data.clientes.filter(c => c.activo).length
        }, void 0, false), _jsxDEV("div", {
          className: "stat-meta",
          children: [data.clientes.filter(c => c.activo && c.saldo_pendiente > 0).length, " con adeudo"]
        }, void 0, true)]
      }, void 0, true)]
    }, void 0, true), _jsxDEV("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 20,
        marginBottom: 20
      },
      children: [_jsxDEV("div", {
        className: "card",
        children: [_jsxDEV("div", {
          className: "card-header",
          children: [_jsxDEV("div", {
            className: "card-title",
            children: "Por método de pago"
          }, void 0, false), _jsxDEV("div", {
            className: "card-sub",
            children: [cobrosFilt.length, " transacciones"]
          }, void 0, true)]
        }, void 0, true), _jsxDEV("div", {
          style: { display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' },
          children: (() => {
            /* Dona con la misma información que antes mostraban las barras */
            const paleta = { TC: 'var(--violet)', SPEI: 'var(--cyan)', Efectivo: 'var(--green)', Cheque: 'var(--amber)', Otro: 'var(--red)' };
            const etiquetas = { TC: 'Tarjeta', SPEI: 'SPEI', Efectivo: 'Efectivo', Cheque: 'Cheque', Otro: 'Otro / sin método' };
            // CoDi se suma a "Otro" en vez de tener su propia rebanada
            // (10-sep-2026, a pedido) -- se sigue contando en la suma total.
            const porMetodoMostrado = porMetodo
              .filter(m => m.metodo !== 'CoDi' && m.metodo !== 'Otro')
              .concat([{ metodo: 'Otro', total: (porMetodo.find(m => m.metodo === 'Otro')?.total || 0) + (porMetodo.find(m => m.metodo === 'CoDi')?.total || 0) }]);
            const serie = porMetodoMostrado
              .filter(m => m.total > 0)
              .map(m => ({ label: etiquetas[m.metodo] || m.metodo, valor: m.total, color: paleta[m.metodo] }));
            const suma = serie.reduce((a, d) => a + d.valor, 0);
            const compacto = v => v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M'
                                : v >= 1e3 ? '$' + Math.round(v / 1e3) + 'k'
                                : '$' + Math.round(v);
            return [
              _jsxDEV(DonutChart, {
                datos: serie, tamano: 180,
                centro: { valor: compacto(suma), etiqueta: 'Total del periodo' }
              }, 'd', false),
              _jsxDEV(DonutLeyenda, { datos: serie }, 'l', false)
            ];
          })()
        }, void 0, false)]
      }, void 0, true), _jsxDEV("div", {
        className: "card",
        children: [_jsxDEV("div", {
          className: "card-header",
          children: [_jsxDEV("div", {
            className: "card-title",
            children: "Top por monto"
          }, void 0, false), _jsxDEV("div", {
            className: "card-sub",
            children: "Alumnos con más cobros"
          }, void 0, false)]
        }, void 0, true), topAlumnos.length === 0 && _jsxDEV("div", {
          className: "empty-state",
          children: _jsxDEV("div", {
            className: "empty-text",
            children: "Sin datos en este período"
          }, void 0, false)
        }, void 0, false), topAlumnos.map(([nombre, total], i) => _jsxDEV("div", {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '9px 0',
            borderBottom: '1px solid var(--glass-light)'
          },
          children: [_jsxDEV("div", {
            style: {
              width: 26,
              height: 26,
              borderRadius: 6,
              background: 'var(--glass-hover)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              color: i === 0 ? 'var(--amber)' : 'var(--ink-3)',
              flexShrink: 0
            },
            children: i + 1
          }, void 0, false), _jsxDEV("div", {
            style: {
              flex: 1,
              minWidth: 0
            },
            children: _jsxDEV("div", {
              style: {
                fontSize: 13,
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              },
              children: nombre
            }, void 0, false)
          }, void 0, false), _jsxDEV("div", {
            style: {
              fontFamily: 'var(--mono)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--green)',
              flexShrink: 0
            },
            children: fmt(total)
          }, void 0, false)]
        }, nombre, true))]
      }, void 0, true)]
    }, void 0, true), _jsxDEV("div", {
      className: "card",
      children: [_jsxDEV("div", {
        className: "card-header",
        children: [_jsxDEV("div", {
          className: "card-title",
          children: "Alumnos con saldo pendiente"
        }, void 0, false), _jsxDEV("div", {
          className: "card-sub",
          children: [data.clientes.filter(c => c.saldo_pendiente > 0 && c.activo).length, " alumnos"]
        }, void 0, true)]
      }, void 0, true), _jsxDEV("div", {
        className: "table-wrap",
        children: _jsxDEV("table", {
          children: [_jsxDEV("thead", {
            children: _jsxDEV("tr", {
              children: [_jsxDEV("th", {
                children: "Alumno"
              }, void 0, false), _jsxDEV("th", {
                children: "Matrícula"
              }, void 0, false), _jsxDEV("th", {
                children: "Grado"
              }, void 0, false), _jsxDEV("th", {
                children: "Familia"
              }, void 0, false), _jsxDEV("th", {
                children: "Adeudo"
              }, void 0, false)]
            }, void 0, true)
          }, void 0, false), _jsxDEV("tbody", {
            children: [data.clientes.filter(c => c.saldo_pendiente > 0 && c.activo).map(c => _jsxDEV("tr", {
              children: [_jsxDEV("td", {
                style: {
                  fontWeight: 500,
                  fontSize: 13
                },
                children: c.nombre
              }, void 0, false), _jsxDEV("td", {
                children: _jsxDEV("span", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontSize: 11
                  },
                  children: c.matricula || '—'
                }, void 0, false)
              }, void 0, false), _jsxDEV("td", {
                style: {
                  color: 'var(--ink-3)',
                  fontSize: 12
                },
                children: c.grado || '—'
              }, void 0, false), _jsxDEV("td", {
                style: {
                  fontSize: 12,
                  color: 'var(--ink-3)'
                },
                children: c.familia_id ? data.familias.find(f => f.id === c.familia_id)?.nombre : '—'
              }, void 0, false), _jsxDEV("td", {
                children: _jsxDEV("span", {
                  style: {
                    fontFamily: 'var(--mono)',
                    fontWeight: 700,
                    color: 'var(--red)'
                  },
                  children: fmt(c.saldo_pendiente)
                }, void 0, false)
              }, void 0, false)]
            }, c.id, true)), data.clientes.filter(c => c.saldo_pendiente > 0 && c.activo).length === 0 && _jsxDEV("tr", {
              children: _jsxDEV("td", {
                colSpan: 5,
                children: _jsxDEV("div", {
                  className: "empty-state",
                  children: [_jsxDEV("div", {
                    className: "empty-icon",
                    children: _jsxDEV(Icon, {
                      name: "check",
                      size: 36,
                      color: "currentColor"
                    }, void 0, false)
                  }, void 0, false), _jsxDEV("div", {
                    className: "empty-text",
                    children: "¡Todos al corriente!"
                  }, void 0, false)]
                }, void 0, true)
              }, void 0, false)
            }, void 0, false)]
          }, void 0, true)]
        }, void 0, true)
      }, void 0, false)]
    }, void 0, true)]
  }, void 0, true);
}
