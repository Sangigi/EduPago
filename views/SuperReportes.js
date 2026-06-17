var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};
/* views/SuperReportes.jsx — Reportes globales para super admin */
function SuperReportes({
  data
}) {
  const {
    useState
  } = React;
  const [filtroEsc, setFiltroEsc] = useState('todas');
  const stats = AppModel.getEstadisticasGlobales(data);
  const filtradas = filtroEsc === 'todas' ? stats : stats.filter(s => s.escuela_id === parseInt(filtroEsc));
  const totalGlobal = stats.reduce((a, s) => a + s.totalCobrado, 0);
  const pendGlobal = stats.reduce((a, s) => a + s.totalPendiente, 0);
  const alumnosGlobal = stats.reduce((a, s) => a + s.numAlumnos, 0);
  const cobrosGlobal = stats.reduce((a, s) => a + s.numCobros, 0);

  // Totales por método (todas las escuelas)
  const metodos = ['TC', 'SPEI', 'CoDi', 'Efectivo'];
  const metodoGlobal = {};
  metodos.forEach(m => {
    metodoGlobal[m] = stats.reduce((a, s) => a + (s.porMetodo[m] || 0), 0);
  });
  const totalMetodos = Object.values(metodoGlobal).reduce((a, b) => a + b, 0) || 1;
  const METODO_ICONS = {
    TC: 'card',
    SPEI: 'bank',
    CoDi: 'phone',
    Efectivo: 'pay'
  };
  const METODO_COLORS = {
    TC: 'var(--accent)',
    SPEI: 'var(--purple)',
    CoDi: 'var(--green)',
    Efectivo: 'var(--amber)'
  };
  const PLAN_BADGE = {
    free: 'badge-gray',
    pro: 'badge-blue',
    enterprise: 'badge-purple'
  };
  const exportarCSV = () => {
    const rows = [['Escuela', 'Plan', 'Alumnos', 'Cobros', 'Total cobrado', 'Pendiente', 'TC', 'SPEI', 'CoDi', 'Efectivo'], ...stats.map(s => [s.nombre, s.plan, s.numAlumnos, s.numCobros, s.totalCobrado, s.totalPendiente, s.porMetodo.TC, s.porMetodo.SPEI, s.porMetodo.CoDi, s.porMetodo.Efectivo])];
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `edupago-global-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };
  return /*#__PURE__*/_jsxDEV("div", {
    children: [/*#__PURE__*/_jsxDEV("div", {
      className: "stats-grid",
      style: {
        marginBottom: 24
      },
      children: [{
        label: 'Total cobrado',
        val: fmt(totalGlobal),
        icon: 'pay',
        bg: 'var(--accent-glow)',
        iconColor: 'var(--navy)',
        meta: `${data.escuelas.length} escuelas`
      }, {
        label: 'Por cobrar',
        val: fmt(pendGlobal),
        icon: 'history',
        bg: 'var(--amber-glow)',
        iconColor: 'var(--amber)',
        meta: 'Pendiente en sistema'
      }, {
        label: 'Total alumnos',
        val: alumnosGlobal,
        icon: 'alumnos',
        bg: 'var(--lime-glow)',
        iconColor: 'var(--lime-dark)',
        meta: 'Activos en el sistema'
      }, {
        label: 'Total cobros',
        val: cobrosGlobal,
        icon: 'cobros',
        bg: 'var(--green-glow)',
        iconColor: 'var(--green)',
        meta: 'Transacciones'
      }].map(s => /*#__PURE__*/_jsxDEV("div", {
        className: "stat-card",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "stat-icon",
          style: {
            background: s.bg
          },
          children: /*#__PURE__*/_jsxDEV(Icon, {
            name: s.icon,
            size: 19,
            color: s.iconColor
          }, void 0, false)
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          className: "stat-label",
          children: s.label
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          className: "stat-value",
          style: {
            fontSize: 20
          },
          children: s.val
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          className: "stat-meta",
          children: s.meta
        }, void 0, false)]
      }, s.label, true))
    }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 20,
        marginBottom: 20
      },
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "card",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "card-header",
          children: /*#__PURE__*/_jsxDEV("div", {
            className: "card-title",
            children: "Métodos de pago (todas las escuelas)"
          }, void 0, false)
        }, void 0, false), metodos.map(m => {
          const val = metodoGlobal[m] || 0;
          const pct = Math.round(val / totalMetodos * 100);
          return /*#__PURE__*/_jsxDEV("div", {
            style: {
              marginBottom: 14
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 4
              },
              children: [/*#__PURE__*/_jsxDEV("span", {
                style: {
                  fontSize: 13,
                  color: 'var(--ink-2)'
                },
                children: [METODO_ICONS[m], " ", m]
              }, void 0, true), /*#__PURE__*/_jsxDEV("span", {
                style: {
                  fontSize: 12,
                  fontFamily: 'var(--mono)',
                  color: 'var(--ink-3)'
                },
                children: [fmt(val), " · ", pct, "%"]
              }, void 0, true)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "progress-bar",
              children: /*#__PURE__*/_jsxDEV("div", {
                className: "progress-fill",
                style: {
                  width: pct + '%',
                  background: METODO_COLORS[m]
                }
              }, void 0, false)
            }, void 0, false)]
          }, m, true);
        })]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        className: "card",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "card-header",
          children: /*#__PURE__*/_jsxDEV("div", {
            className: "card-title",
            children: "Cobrado por escuela"
          }, void 0, false)
        }, void 0, false), stats.length === 0 && /*#__PURE__*/_jsxDEV("div", {
          className: "empty-state",
          children: /*#__PURE__*/_jsxDEV("div", {
            className: "empty-text",
            children: "Sin datos"
          }, void 0, false)
        }, void 0, false), stats.map(s => {
          const pct = Math.round(s.totalCobrado / (totalGlobal || 1) * 100);
          return /*#__PURE__*/_jsxDEV("div", {
            style: {
              marginBottom: 14
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 4
              },
              children: [/*#__PURE__*/_jsxDEV("span", {
                style: {
                  fontSize: 13,
                  color: 'var(--ink-2)'
                },
                children: [s.emoji, " ", s.nombre.split(' ').slice(0, 2).join(' ')]
              }, void 0, true), /*#__PURE__*/_jsxDEV("span", {
                style: {
                  fontSize: 12,
                  fontFamily: 'var(--mono)',
                  color: 'var(--ink-3)'
                },
                children: fmt(s.totalCobrado)
              }, void 0, false)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "progress-bar",
              children: /*#__PURE__*/_jsxDEV("div", {
                className: "progress-fill",
                style: {
                  width: pct + '%',
                  background: s.color
                }
              }, void 0, false)
            }, void 0, false)]
          }, s.escuela_id, true);
        })]
      }, void 0, true)]
    }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
      className: "card",
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "card-header",
        children: [/*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "card-title",
            children: "Desglose por escuela"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "card-sub",
            children: "Todas las instituciones registradas"
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          style: {
            display: 'flex',
            gap: 8
          },
          children: [/*#__PURE__*/_jsxDEV("select", {
            className: "form-select",
            style: {
              fontSize: 12,
              padding: '6px 10px',
              width: 'auto'
            },
            value: filtroEsc,
            onChange: e => setFiltroEsc(e.target.value),
            children: [/*#__PURE__*/_jsxDEV("option", {
              value: "todas",
              children: "Todas"
            }, void 0, false), data.escuelas.map(e => /*#__PURE__*/_jsxDEV("option", {
              value: e.id,
              children: e.nombre
            }, e.id, false))]
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
        }, void 0, true)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        className: "table-wrap",
        children: /*#__PURE__*/_jsxDEV("table", {
          children: [/*#__PURE__*/_jsxDEV("thead", {
            children: /*#__PURE__*/_jsxDEV("tr", {
              children: [/*#__PURE__*/_jsxDEV("th", {
                children: "Escuela"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Plan"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Alumnos"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Cobros"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Total cobrado"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Pendiente"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "SPEI"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Tarjeta"
              }, void 0, false)]
            }, void 0, true)
          }, void 0, false), /*#__PURE__*/_jsxDEV("tbody", {
            children: filtradas.map(s => /*#__PURE__*/_jsxDEV("tr", {
              children: [/*#__PURE__*/_jsxDEV("td", {
                children: /*#__PURE__*/_jsxDEV("div", {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10
                  },
                  children: [/*#__PURE__*/_jsxDEV("span", {
                    style: {
                      fontSize: 18
                    },
                    children: s.emoji
                  }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                    children: [/*#__PURE__*/_jsxDEV("div", {
                      style: {
                        fontWeight: 500,
                        fontSize: 13
                      },
                      children: s.nombre
                    }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                      style: {
                        fontSize: 11,
                        color: 'var(--ink-4)',
                        fontFamily: 'var(--mono)'
                      },
                      children: s.clave
                    }, void 0, false)]
                  }, void 0, true)]
                }, void 0, true)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                children: /*#__PURE__*/_jsxDEV("span", {
                  className: `badge ${PLAN_BADGE[s.plan]}`,
                  children: s.plan
                }, void 0, false)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                style: {
                  fontFamily: 'var(--mono)',
                  fontSize: 13
                },
                children: s.numAlumnos
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                style: {
                  fontFamily: 'var(--mono)',
                  fontSize: 13
                },
                children: s.numCobros
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                style: {
                  fontFamily: 'var(--mono)',
                  fontWeight: 600,
                  color: 'var(--green)'
                },
                children: fmt(s.totalCobrado)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                style: {
                  fontFamily: 'var(--mono)',
                  color: s.totalPendiente > 0 ? 'var(--amber)' : 'var(--ink-4)'
                },
                children: fmt(s.totalPendiente)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                style: {
                  fontFamily: 'var(--mono)',
                  fontSize: 12,
                  color: 'var(--purple)'
                },
                children: fmt(s.porMetodo.SPEI)
              }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                style: {
                  fontFamily: 'var(--mono)',
                  fontSize: 12,
                  color: 'var(--accent)'
                },
                children: fmt(s.porMetodo.TC)
              }, void 0, false)]
            }, s.escuela_id, true))
          }, void 0, false)]
        }, void 0, true)
      }, void 0, false)]
    }, void 0, true)]
  }, void 0, true);
}