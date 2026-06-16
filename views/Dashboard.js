import { jsxDEV as _jsxDEV } from "react/jsx-dev-runtime";
/* views/Dashboard.jsx v2 — Multi-escuela */
function Dashboard({
  data,
  user,
  escuela,
  allData
}) {
  const esSuper = AuthController.isSuperAdmin(user);
  const stats = AppModel.getEstadisticas(data.cobros);
  const pendientes = data.cobros.filter(c => c.estado === 'pendiente');
  const recientes = [...data.cobros].reverse().slice(0, 6);
  const totalMetodos = Object.values(stats.cobradosPorMetodo).reduce((a, b) => a + b, 0) || 1;

  // Si superadmin sin escuela seleccionada → mostrar overview global
  if (esSuper && !escuela) {
    const globalStats = AppModel.getEstadisticasGlobales(allData);
    const totalCobrado = globalStats.reduce((a, s) => a + s.totalCobrado, 0);
    const totalPend = globalStats.reduce((a, s) => a + s.totalPendiente, 0);
    const totalAlumnos = globalStats.reduce((a, s) => a + s.numAlumnos, 0);
    return /*#__PURE__*/_jsxDEV("div", {
      children: [/*#__PURE__*/_jsxDEV("div", {
        style: {
          marginBottom: 24
        },
        children: [/*#__PURE__*/_jsxDEV("h2", {
          style: {
            fontSize: 20,
            fontWeight: 700,
            color: 'var(--ink)',
            letterSpacing: '-.3px'
          },
          children: "Panel Global — Paga la Escuela"
        }, void 0, false), /*#__PURE__*/_jsxDEV("p", {
          style: {
            fontSize: 13,
            color: 'var(--ink-3)',
            marginTop: 3
          },
          children: new Date().toLocaleDateString('es-MX', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          })
        }, void 0, false)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        className: "stats-grid",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "stat-card",
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "stat-icon",
            style: {
              background: 'var(--accent-glow)'
            },
            children: /*#__PURE__*/_jsxDEV(Icon, {
              name: "escuelas",
              size: 19,
              color: "var(--lime)"
            }, void 0, false)
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "stat-label",
            children: "Escuelas activas"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "stat-value",
            style: {
              fontSize: 20
            },
            children: allData.escuelas.filter(e => e.activa).length
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "stat-card",
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "stat-icon",
            style: {
              background: 'var(--green-glow)'
            },
            children: /*#__PURE__*/_jsxDEV(Icon, {
              name: "pay",
              size: 19,
              color: "currentColor"
            }, void 0, false)
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "stat-label",
            children: "Total cobrado"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "stat-value",
            style: {
              fontSize: 20
            },
            children: fmt(totalCobrado)
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "stat-card",
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "stat-icon",
            style: {
              background: 'var(--amber-glow)'
            },
            children: /*#__PURE__*/_jsxDEV(Icon, {
              name: "history",
              size: 19,
              color: "currentColor"
            }, void 0, false)
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "stat-label",
            children: "Por cobrar"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "stat-value",
            style: {
              fontSize: 20
            },
            children: fmt(totalPend)
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "stat-card",
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "stat-icon",
            style: {
              background: 'var(--purple-glow)'
            },
            children: /*#__PURE__*/_jsxDEV(Icon, {
              name: "alumnos",
              size: 19,
              color: "currentColor"
            }, void 0, false)
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "stat-label",
            children: "Alumnos totales"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "stat-value",
            style: {
              fontSize: 20
            },
            children: totalAlumnos
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        style: {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))',
          gap: 16
        },
        children: globalStats.map(s => /*#__PURE__*/_jsxDEV("div", {
          className: "card",
          style: {
            borderLeft: `3px solid ${s.color}`
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 14
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 28
              },
              children: s.emoji
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontWeight: 600,
                  fontSize: 14,
                  color: 'var(--ink)'
                },
                children: s.nombre
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 12,
                  color: 'var(--ink-3)'
                },
                children: [s.numAlumnos, " alumnos · ", s.numCobros, " cobros"]
              }, void 0, true)]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            style: {
              display: 'flex',
              justifyContent: 'space-between'
            },
            children: [/*#__PURE__*/_jsxDEV("div", {
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 11,
                  color: 'var(--ink-4)',
                  textTransform: 'uppercase',
                  letterSpacing: '.4px'
                },
                children: "Cobrado"
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontFamily: 'var(--mono)',
                  fontWeight: 700,
                  color: 'var(--green)',
                  fontSize: 15
                },
                children: fmt(s.totalCobrado)
              }, void 0, false)]
            }, void 0, true), s.totalPendiente > 0 && /*#__PURE__*/_jsxDEV("div", {
              style: {
                textAlign: 'right'
              },
              children: [/*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontSize: 11,
                  color: 'var(--ink-4)',
                  textTransform: 'uppercase',
                  letterSpacing: '.4px'
                },
                children: "Pendiente"
              }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                style: {
                  fontFamily: 'var(--mono)',
                  fontWeight: 700,
                  color: 'var(--amber)',
                  fontSize: 15
                },
                children: fmt(s.totalPendiente)
              }, void 0, false)]
            }, void 0, true)]
          }, void 0, true)]
        }, s.escuela_id, true))
      }, void 0, false)]
    }, void 0, true);
  }
  return /*#__PURE__*/_jsxDEV("div", {
    children: [/*#__PURE__*/_jsxDEV("div", {
      style: {
        marginBottom: 24
      },
      children: [/*#__PURE__*/_jsxDEV("h2", {
        style: {
          fontSize: 20,
          fontWeight: 700,
          color: 'var(--ink)',
          letterSpacing: '-.3px'
        },
        children: ["Buenos días, ", user.nombre.split(' ')[0]]
      }, void 0, true), /*#__PURE__*/_jsxDEV("p", {
        style: {
          fontSize: 13,
          color: 'var(--ink-3)',
          marginTop: 3
        },
        children: [escuela && /*#__PURE__*/_jsxDEV("span", {
          style: {
            color: escuela.color,
            marginRight: 6
          },
          children: [escuela.logo_emoji, " ", escuela.nombre, " ·"]
        }, void 0, true), new Date().toLocaleDateString('es-MX', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric'
        })]
      }, void 0, true)]
    }, void 0, true), escuela?.clabe_fija && /*#__PURE__*/_jsxDEV("div", {
      style: {
        marginBottom: 20,
        padding: '14px 18px',
        background: 'linear-gradient(135deg, #1e3a8a 0%, #312e81 100%)',
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12
      },
      children: [/*#__PURE__*/_jsxDEV("div", {
        children: [/*#__PURE__*/_jsxDEV("div", {
          style: {
            fontSize: 11,
            color: 'rgba(255,255,255,.6)',
            textTransform: 'uppercase',
            letterSpacing: '.5px',
            marginBottom: 4
          },
          children: /*#__PURE__*/_jsxDEV("span", {
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7
            },
            children: [/*#__PURE__*/_jsxDEV(Icon, {
              name: "bank",
              size: 16,
              color: "currentColor"
            }, void 0, false), " CLABE SPEI fija de esta escuela"]
          }, void 0, true)
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          style: {
            fontFamily: 'var(--mono)',
            fontSize: 18,
            fontWeight: 700,
            color: '#fff',
            letterSpacing: 3
          },
          children: escuela.clabe_fija
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          style: {
            fontSize: 11,
            color: 'rgba(255,255,255,.55)',
            marginTop: 3
          },
          children: "STP — Sistema de Transferencias y Pagos"
        }, void 0, false)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
        className: "copy-btn",
        style: {
          width: 'auto',
          padding: '7px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 6
        },
        onClick: () => navigator.clipboard.writeText(escuela.clabe_fija),
        children: [/*#__PURE__*/_jsxDEV(Icon, {
          name: "copy",
          size: 13,
          color: "currentColor"
        }, void 0, false), " Copiar CLABE"]
      }, void 0, true)]
    }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
      className: "stats-grid",
      children: [{
        label: 'Total cobrado',
        val: fmt(stats.totalCobrado),
        icon: 'pay',
        bg: 'var(--accent-glow)',
        iconColor: 'var(--navy)',
        meta: `${data.cobros.filter(c => c.estado === 'pagado').length} cobros pagados`,
        color: ''
      }, {
        label: 'Por cobrar',
        val: fmt(stats.totalPendiente),
        icon: 'history',
        bg: 'var(--amber-glow)',
        iconColor: 'var(--amber)',
        meta: `${pendientes.length} cobros pendientes`,
        color: 'var(--amber)'
      }, {
        label: 'Cobrado hoy',
        val: fmt(stats.cobrosHoy),
        icon: 'cobros',
        bg: 'var(--green-glow)',
        iconColor: 'var(--green)',
        meta: `${data.cobros.filter(c => c.fecha === new Date().toISOString().slice(0, 10) && c.estado === 'pagado').length} transacciones hoy`,
        color: ''
      }, {
        label: 'Alumnos activos',
        val: data.clientes.filter(c => c.activo).length,
        icon: 'alumnos',
        bg: 'var(--lime-glow)',
        iconColor: 'var(--lime-dark)',
        meta: `${data.clientes.filter(c => c.activo && c.saldo_pendiente > 0).length} con saldo pendiente`,
        color: ''
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
            fontSize: 20,
            color: s.color || undefined
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
        gridTemplateColumns: '1fr 320px',
        gap: 20
      },
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "card",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "card-header",
          children: /*#__PURE__*/_jsxDEV("div", {
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "card-title",
              children: "Cobros recientes"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              className: "card-sub",
              children: "Últimas transacciones"
            }, void 0, false)]
          }, void 0, true)
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          className: "table-wrap",
          children: /*#__PURE__*/_jsxDEV("table", {
            children: [/*#__PURE__*/_jsxDEV("thead", {
              children: /*#__PURE__*/_jsxDEV("tr", {
                children: [/*#__PURE__*/_jsxDEV("th", {
                  children: "Folio"
                }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                  children: "Cliente"
                }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                  children: "Total"
                }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                  children: "Método"
                }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                  children: "Estado"
                }, void 0, false)]
              }, void 0, true)
            }, void 0, false), /*#__PURE__*/_jsxDEV("tbody", {
              children: [recientes.length === 0 && /*#__PURE__*/_jsxDEV("tr", {
                children: /*#__PURE__*/_jsxDEV("td", {
                  colSpan: 5,
                  children: /*#__PURE__*/_jsxDEV("div", {
                    className: "empty-state",
                    style: {
                      padding: '20px 0'
                    },
                    children: /*#__PURE__*/_jsxDEV("div", {
                      className: "empty-text",
                      children: "Sin cobros aún"
                    }, void 0, false)
                  }, void 0, false)
                }, void 0, false)
              }, void 0, false), recientes.map(c => /*#__PURE__*/_jsxDEV("tr", {
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
                    maxWidth: 160,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  },
                  children: c.cliente
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
                }, void 0, false)]
              }, c.id, true))]
            }, void 0, true)]
          }, void 0, true)
        }, void 0, false)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        className: "card",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "card-header",
          children: /*#__PURE__*/_jsxDEV("div", {
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "card-title",
              children: "Por método de pago"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              className: "card-sub",
              children: "Distribución del mes"
            }, void 0, false)]
          }, void 0, true)
        }, void 0, false), [{
          key: 'TC',
          label: 'Tarjeta',
          icon: 'card',
          color: 'var(--accent)'
        }, {
          key: 'SPEI',
          label: 'SPEI',
          icon: 'bank',
          color: 'var(--purple)'
        }, {
          key: 'CoDi',
          label: 'CoDi / QR',
          icon: 'phone',
          color: 'var(--green)'
        }, {
          key: 'Efectivo',
          label: 'Efectivo',
          icon: 'pay',
          color: 'var(--amber)'
        }].map(m => {
          const val = stats.cobradosPorMetodo[m.key] || 0;
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
                  fontSize: 12.5,
                  color: 'var(--ink-2)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                },
                children: [m.icon, " ", m.label]
              }, void 0, true), /*#__PURE__*/_jsxDEV("span", {
                style: {
                  fontSize: 12,
                  fontFamily: 'var(--mono)',
                  color: 'var(--ink-3)'
                },
                children: [pct, "%"]
              }, void 0, true)]
            }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
              className: "progress-bar",
              children: /*#__PURE__*/_jsxDEV("div", {
                className: "progress-fill",
                style: {
                  width: pct + '%',
                  background: m.color
                }
              }, void 0, false)
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 11,
                color: 'var(--ink-4)',
                marginTop: 2,
                fontFamily: 'var(--mono)'
              },
              children: fmt(val)
            }, void 0, false)]
          }, m.key, true);
        }), pendientes.length > 0 && /*#__PURE__*/_jsxDEV("div", {
          style: {
            marginTop: 16,
            padding: '10px 12px',
            background: 'var(--amber-glow)',
            border: '1px solid rgba(245,158,11,.2)',
            borderRadius: 'var(--radius-sm)'
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              fontSize: 12,
              fontWeight: 600,
              color: '#fbbf24',
              marginBottom: 4,
              display: "flex",
              alignItems: "center",
              gap: 6
            },
            children: [/*#__PURE__*/_jsxDEV(Icon, {
              name: "warning",
              size: 13,
              color: "#fbbf24"
            }, void 0, false), " Cobros pendientes"]
          }, void 0, true), pendientes.slice(0, 3).map(c => /*#__PURE__*/_jsxDEV("div", {
            style: {
              fontSize: 11.5,
              color: 'var(--ink-3)',
              marginBottom: 2
            },
            children: [c.folio, " · ", c.cliente.split(' ')[0], " · ", fmt(c.total)]
          }, c.id, true))]
        }, void 0, true)]
      }, void 0, true)]
    }, void 0, true)]
  }, void 0, true);
}
