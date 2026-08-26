var _jsxDEV = function(type,props,key,_s,_src,_self){

  var p = Object.assign({key:key||undefined},props);

  var ch = p.children; delete p.children;

  return ch===undefined ? React.createElement(type,p)

       : Array.isArray(ch) ? React.createElement(type,p,...ch)

       : React.createElement(type,p,ch);

};

var _Fragment = React.Fragment;

/* views/SuperReportes.jsx — Reportes globales para super admin */

function SuperReportes({

  data

}) {

  const {

    useState

  } = React;

  const [filtroEsc, setFiltroEsc] = useState('todas');

  const statsRaw = AppModel.getEstadisticasGlobales(data);

  const hayResumenLigero = statsRaw.some(s => s.resumenLigero);

  // En modo resumen ligero (sin escuela seleccionada) el backend no manda el

  // detalle de cobros: se normalizan a 0/objeto vacío para que las sumas y el

  // render no truenen; el aviso de abajo le explica al usuario por qué.

  const stats = statsRaw.map(s => ({

    ...s,

    totalCobrado: s.totalCobrado ?? 0,

    numCobros: s.numCobros ?? 0,

    porMetodo: s.porMetodo || { TC: 0, SPEI: 0, CoDi: 0, Efectivo: 0 },

    subplanteles: s.subplanteles || [],

  }));

  const [expandidas, setExpandidas] = useState({});

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

    const sum = campo => stats.reduce((a, s) => a + (Number(campo(s)) || 0), 0);

    const rows = [
      ['Escuela', 'Plan', 'Alumnos', 'Cobros', 'Total cobrado', 'Pendiente', 'TC', 'SPEI', 'CoDi', 'Efectivo'],
      ...stats.map(s => [s.nombre, s.plan, s.numAlumnos, s.numCobros, CSVExport.money(s.totalCobrado), CSVExport.money(s.totalPendiente), CSVExport.money(s.porMetodo.TC), CSVExport.money(s.porMetodo.SPEI), CSVExport.money(s.porMetodo.CoDi), CSVExport.money(s.porMetodo.Efectivo)]),
      ['TOTAL', '', sum(s => s.numAlumnos), sum(s => s.numCobros), CSVExport.money(sum(s => s.totalCobrado)), CSVExport.money(sum(s => s.totalPendiente)), CSVExport.money(sum(s => s.porMetodo.TC)), CSVExport.money(sum(s => s.porMetodo.SPEI)), CSVExport.money(sum(s => s.porMetodo.CoDi)), CSVExport.money(sum(s => s.porMetodo.Efectivo))],
    ];

    CSVExport.descargar(`edupago-global-${new Date().toISOString().slice(0, 10)}.csv`, rows);

  };

  return _jsxDEV("div", {

    children: [hayResumenLigero && _jsxDEV("div", {

      style: {

        marginBottom: 16,

        padding: '10px 12px',

        background: 'var(--amber-glow)',

        border: '1px solid rgba(245,158,11,.2)',

        borderRadius: 'var(--radius-sm)',

        fontSize: 12.5,

        color: 'var(--ink-2)'

      },

      children: "Vista global: se muestran alumnos y saldo pendiente por escuela. Para ver el detalle de cobros y desglose por método de pago, selecciona una escuela en el selector de arriba."

    }, void 0, false), _jsxDEV("div", {

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

      }].map(s => _jsxDEV("div", {

        className: "stat-card",

        children: [_jsxDEV("div", {

          className: "stat-icon",

          children: _jsxDEV(Icon, {

            name: s.icon,

            size: 19,

            color: "currentColor"

          }, void 0, false)

        }, void 0, false), _jsxDEV("div", {

          className: "stat-label",

          children: s.label

        }, void 0, false), _jsxDEV("div", {

          className: "stat-value",

          children: s.val

        }, void 0, false), _jsxDEV("div", {

          className: "stat-meta",

          children: s.meta

        }, void 0, false)]

      }, s.label, true))

    }, void 0, false), _jsxDEV("div", {

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

          children: _jsxDEV("div", {

            className: "card-title",

            children: "Métodos de pago (todas las escuelas)"

          }, void 0, false)

        }, void 0, false), metodos.map(m => {

          const val = metodoGlobal[m] || 0;

          const pct = Math.round(val / totalMetodos * 100);

          return _jsxDEV("div", {

            style: {

              marginBottom: 14

            },

            children: [_jsxDEV("div", {

              style: {

                display: 'flex',

                justifyContent: 'space-between',

                marginBottom: 4

              },

              children: [_jsxDEV("span", {

                style: {

                  fontSize: 13,

                  color: 'var(--ink-2)'

                },

                children: [METODO_ICONS[m], " ", m]

              }, void 0, true), _jsxDEV("span", {

                style: {

                  fontSize: 12,

                  fontFamily: 'var(--mono)',

                  color: 'var(--ink-3)'

                },

                children: [fmt(val), " · ", pct, "%"]

              }, void 0, true)]

            }, void 0, true), _jsxDEV("div", {

              className: "progress-bar",

              children: _jsxDEV("div", {

                className: "progress-fill",

                style: {

                  width: pct + '%',

                  background: METODO_COLORS[m]

                }

              }, void 0, false)

            }, void 0, false)]

          }, m, true);

        })]

      }, void 0, true), _jsxDEV("div", {

        className: "card",

        children: [_jsxDEV("div", {

          className: "card-header",

          children: _jsxDEV("div", {

            className: "card-title",

            children: "Cobrado por escuela"

          }, void 0, false)

        }, void 0, false), stats.length === 0 && _jsxDEV("div", {

          className: "empty-state",

          children: _jsxDEV("div", {

            className: "empty-text",

            children: "Sin datos"

          }, void 0, false)

        }, void 0, false), stats.map(s => {

          const pct = Math.round(s.totalCobrado / (totalGlobal || 1) * 100);

          return _jsxDEV("div", {

            style: {

              marginBottom: 14

            },

            children: [_jsxDEV("div", {

              style: {

                display: 'flex',

                justifyContent: 'space-between',

                marginBottom: 4

              },

              children: [_jsxDEV("span", {

                style: {

                  fontSize: 13,

                  color: 'var(--ink-2)'

                },

                children: [s.emoji, " ", s.nombre.split(' ').slice(0, 2).join(' ')]

              }, void 0, true), _jsxDEV("span", {

                style: {

                  fontSize: 12,

                  fontFamily: 'var(--mono)',

                  color: 'var(--ink-3)'

                },

                children: fmt(s.totalCobrado)

              }, void 0, false)]

            }, void 0, true), _jsxDEV("div", {

              className: "progress-bar",

              children: _jsxDEV("div", {

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

    }, void 0, true), _jsxDEV("div", {

      className: "card",

      children: [_jsxDEV("div", {

        className: "card-header",

        children: [_jsxDEV("div", {

          children: [_jsxDEV("div", {

            className: "card-title",

            children: "Desglose por escuela"

          }, void 0, false), _jsxDEV("div", {

            className: "card-sub",

            children: "Todas las instituciones registradas"

          }, void 0, false)]

        }, void 0, true), _jsxDEV("div", {

          style: {

            display: 'flex',

            gap: 8

          },

          children: [_jsxDEV("select", {

            className: "form-select",

            style: {

              fontSize: 12,

              padding: '6px 10px',

              width: 'auto'

            },

            value: filtroEsc,

            onChange: e => setFiltroEsc(e.target.value),

            children: [_jsxDEV("option", {

              value: "todas",

              children: "Todas"

            }, void 0, false), data.escuelas.map(e => _jsxDEV("option", {

              value: e.id,

              children: e.nombre + (e.activa ? '' : ' (Inactiva)')

            }, e.id, false))]

          }, void 0, true), _jsxDEV("button", {

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

        }, void 0, true)]

      }, void 0, true), _jsxDEV("div", {

        className: "table-wrap",

        children: _jsxDEV("table", {

          children: [_jsxDEV("thead", {

            children: _jsxDEV("tr", {

              children: [_jsxDEV("th", {

                children: "Escuela"

              }, void 0, false), _jsxDEV("th", {

                children: "Plan"

              }, void 0, false), _jsxDEV("th", {

                children: "Alumnos"

              }, void 0, false), _jsxDEV("th", {

                children: "Cobros"

              }, void 0, false), _jsxDEV("th", {

                children: "Total cobrado"

              }, void 0, false), _jsxDEV("th", {

                children: "Pendiente"

              }, void 0, false), _jsxDEV("th", {

                children: "SPEI"

              }, void 0, false), _jsxDEV("th", {

                children: "Tarjeta"

              }, void 0, false)]

            }, void 0, true)

          }, void 0, false), _jsxDEV("tbody", {

            children: filtradas.map(s => _jsxDEV(_Fragment, {

              children: [_jsxDEV("tr", {

              children: [_jsxDEV("td", {

                children: _jsxDEV("div", {

                  style: {

                    display: 'flex',

                    alignItems: 'center',

                    gap: 10

                  },

                  children: [s.numPlanteles > 0 ? _jsxDEV("button", {

                    onClick: () => setExpandidas(prev => ({ ...prev, [s.escuela_id]: !prev[s.escuela_id] })),

                    className: "btn btn-ghost btn-sm",

                    style: { padding: 4, width: 22, height: 22, flexShrink: 0 },

                    title: expandidas[s.escuela_id] ? 'Ocultar planteles' : `Ver ${s.numPlanteles} plantel(es)`,

                    children: _jsxDEV(Icon, {

                      name: "chevronDown",

                      size: 14,

                      color: "currentColor",

                      style: { transform: expandidas[s.escuela_id] ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }

                    }, void 0, false)

                  }, void 0, false) : _jsxDEV("span", { style: { width: 22, flexShrink: 0 } }, void 0, false), _jsxDEV("span", {

                    style: {

                      fontSize: 18

                    },

                    children: s.emoji

                  }, void 0, false), _jsxDEV("div", {

                    children: [_jsxDEV("div", {

                      style: {

                        fontWeight: 500,

                        fontSize: 13

                      },

                      children: s.nombre

                    }, void 0, false), _jsxDEV("div", {

                      style: {

                        fontSize: 11,

                        color: 'var(--ink-4)',

                        fontFamily: 'var(--mono)'

                      },

                      children: [s.clave, s.numPlanteles > 0 && ` · ${s.numPlanteles} plantel(es)`]

                    }, void 0, true)]

                  }, void 0, true)]

                }, void 0, true)

              }, void 0, false), _jsxDEV("td", {

                children: _jsxDEV("span", {

                  className: `badge ${PLAN_BADGE[s.plan]}`,

                  children: s.plan

                }, void 0, false)

              }, void 0, false), _jsxDEV("td", {

                style: {

                  fontFamily: 'var(--mono)',

                  fontSize: 13

                },

                children: s.numAlumnos

              }, void 0, false), _jsxDEV("td", {

                style: {

                  fontFamily: 'var(--mono)',

                  fontSize: 13

                },

                children: s.numCobros

              }, void 0, false), _jsxDEV("td", {

                style: {

                  fontFamily: 'var(--mono)',

                  fontWeight: 600,

                  color: 'var(--green)'

                },

                children: fmt(s.totalCobrado)

              }, void 0, false), _jsxDEV("td", {

                style: {

                  fontFamily: 'var(--mono)',

                  color: s.totalPendiente > 0 ? 'var(--amber)' : 'var(--ink-4)'

                },

                children: fmt(s.totalPendiente)

              }, void 0, false), _jsxDEV("td", {

                style: {

                  fontFamily: 'var(--mono)',

                  fontSize: 12,

                  color: 'var(--purple)'

                },

                children: fmt(s.porMetodo.SPEI)

              }, void 0, false), _jsxDEV("td", {

                style: {

                  fontFamily: 'var(--mono)',

                  fontSize: 12,

                  color: 'var(--accent)'

                },

                children: fmt(s.porMetodo.TC)

              }, void 0, false)]

              }, void 0, true), expandidas[s.escuela_id] && s.numPlanteles > 0 && _jsxDEV("tr", {

                children: _jsxDEV("td", {

                  colSpan: 8,

                  style: { padding: 0, background: 'rgba(0,0,0,.15)' },

                  children: _jsxDEV("table", {

                    style: { width: '100%' },

                    children: [_jsxDEV("thead", {

                      children: _jsxDEV("tr", {

                        children: [_jsxDEV("th", { style: { fontSize: 11, paddingLeft: 46 }, children: "Plantel" }, void 0, false),

                        _jsxDEV("th", { style: { fontSize: 11 }, children: "Alumnos" }, void 0, false),

                        _jsxDEV("th", { style: { fontSize: 11 }, children: "Cobros (90d)" }, void 0, false),

                        _jsxDEV("th", { style: { fontSize: 11 }, children: "Cobrado (90d)" }, void 0, false),

                        _jsxDEV("th", { style: { fontSize: 11 }, children: "Pendiente" }, void 0, false)]

                      }, void 0, true)

                    }, void 0, false), _jsxDEV("tbody", {

                      children: (s.subplanteles || []).length === 0 ? _jsxDEV("tr", {

                        children: _jsxDEV("td", { colSpan: 5, style: { padding: '10px 46px', fontSize: 12, color: 'var(--ink-3)' }, children: "Sin datos de planteles todavía." }, void 0, false)

                      }, void 0, false) : s.subplanteles.map(p => _jsxDEV("tr", {

                        children: [_jsxDEV("td", { style: { fontSize: 12.5, paddingLeft: 46 }, children: p.nombre }, void 0, false),

                        _jsxDEV("td", { style: { fontFamily: 'var(--mono)', fontSize: 12 }, children: p.numAlumnos }, void 0, false),

                        _jsxDEV("td", { style: { fontFamily: 'var(--mono)', fontSize: 12 }, children: p.numCobros90d }, void 0, false),

                        _jsxDEV("td", { style: { fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--green)' }, children: fmt(p.totalCobrado90d) }, void 0, false),

                        _jsxDEV("td", { style: { fontFamily: 'var(--mono)', fontSize: 12, color: p.totalPendienteSaldo > 0 ? 'var(--amber)' : 'var(--ink-4)' }, children: fmt(p.totalPendienteSaldo) }, void 0, false)]

                      }, p.escuela_id, true))

                    }, void 0, false)]

                  }, void 0, true)

                }, void 0, false)

              }, void 0, false)]

            }, s.escuela_id, true))

          }, void 0, false)]

        }, void 0, true)

      }, void 0, false)]

    }, void 0, true)]

  }, void 0, true);

}
