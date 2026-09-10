var _jsxDEV = function(type,props,key,_s,_src,_self){

  var p = Object.assign({key:key||undefined},props);

  var ch = p.children; delete p.children;

  return ch===undefined ? React.createElement(type,p)

       : Array.isArray(ch) ? React.createElement(type,p,...ch)

       : React.createElement(type,p,ch);

};

/* views/Dashboard.jsx v2 — Multi-escuela */

// Debe reflejar PLANES_LIMITES en api.php (única fuente de verdad real).

// Protección: si views/components/Charts.js no se cargó (porque no se subió o
// falta la línea en index.html), la vista sigue funcionando en vez de romperse.
var _sinGrafica = function (texto) {
  return function () {
    return React.createElement('div', {
      style: {
        padding: '18px', textAlign: 'center', fontSize: 12.5, color: 'var(--ink-4)',
        border: '1px dashed var(--border-glow)', borderRadius: 'var(--radius)'
      }
    }, texto);
  };
};
if (typeof AreaChart === 'undefined')    var AreaChart    = _sinGrafica('Falta cargar Charts.js');
if (typeof DonutChart === 'undefined')   var DonutChart   = _sinGrafica('Falta cargar Charts.js');
if (typeof DonutLeyenda === 'undefined') var DonutLeyenda = _sinGrafica('');

const PLANES_INFO_DASH = {

  basico:   { label: 'Básico',   max_alumnos: 400, max_planteles: 1,    color: 'var(--ink-3)' },

  avanzado: { label: 'Avanzado', max_alumnos: 800, max_planteles: 1,    color: 'var(--accent)' },

  pro:      { label: 'Pro',      max_alumnos: null, max_planteles: null, color: 'var(--magenta)' },

};

function Dashboard({

  data,

  user,

  escuela,

  allData

}) {

  const { useState, useEffect, useMemo } = React;

  const [filtroEscEstado, setFiltroEscEstado] = useState('todas'); // 'todas' | 'activas' | 'inactivas'

  // ── Tendencia de cobranza: rango de fechas elegido por el usuario ──
  // Antes eran siempre los últimos 30 días, calculados en el navegador a
  // partir de data.cobros (que solo trae 90 días) — un rango de "6 meses" o
  // "1 año" se habría visto vacío más allá de esos 90 días. Ahora se pide
  // agregado por día directo al servidor (acciones/tendencia_cobranza.php),
  // que funciona igual de rápido sin importar qué tan largo sea el rango.
  const RANGOS_TENDENCIA = [
    { id: '1d', label: '1 día', dias: 1 },
    { id: '5d', label: '5 días', dias: 5 },
    { id: '7d', label: '7 días', dias: 7 },
    { id: '1m', label: '1 mes', dias: 30 },
    { id: '3m', label: '3 meses', dias: 90 },
    { id: '6m', label: '6 meses', dias: 180 },
    { id: '1y', label: '1 año', dias: 365 },
  ];
  const [rangoTendencia, setRangoTendencia] = useState('1m');
  const [customDesde, setCustomDesde] = useState('');
  const [customHasta, setCustomHasta] = useState('');
  const [tendenciaPorDia, setTendenciaPorDia] = useState(null);
  const [cargandoTendencia, setCargandoTendencia] = useState(false);

  const hoyISO = new Date().toISOString().slice(0, 10);
  const { desdeTendencia, hastaTendencia } = useMemo(() => {
    if (rangoTendencia === 'custom') {
      return { desdeTendencia: customDesde, hastaTendencia: customHasta };
    }
    const preset = RANGOS_TENDENCIA.find(r => r.id === rangoTendencia) || RANGOS_TENDENCIA[3];
    const d = new Date();
    d.setDate(d.getDate() - (preset.dias - 1));
    return { desdeTendencia: d.toISOString().slice(0, 10), hastaTendencia: hoyISO };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangoTendencia, customDesde, customHasta]);

  useEffect(() => {
    if (!escuela || !escuela.id) return;
    if (!desdeTendencia || !hastaTendencia) return; // rango personalizado incompleto
    setCargandoTendencia(true);
    const params = new URLSearchParams({
      action: 'tendencia_cobranza', escuela_id: escuela.id,
      desde: desdeTendencia, hasta: hastaTendencia,
    });
    fetch('api.php?' + params.toString(), {
      headers: { 'Authorization': 'Bearer ' + AuthController.getToken() },
    })
      .then(r => r.json())
      .then(json => { if (json.success) setTendenciaPorDia(json.por_dia || {}); })
      .catch(() => {})
      .finally(() => setCargandoTendencia(false));
  }, [escuela && escuela.id, desdeTendencia, hastaTendencia]);

  const esSuper = AuthController.isSuperAdmin(user);

  

  // VERIFICACIÓN DE CAJERO

  const esCajero = user && user.rol === 'cajero'; 



  const stats = AppModel.getEstadisticas(data.cobros);

  const pendientes = data.cobros.filter(c => c.estado === 'pendiente');

  const recientes = [...data.cobros].reverse().slice(0, 6);

  const totalMetodos = Object.values(stats.cobradosPorMetodo).reduce((a, b) => a + b, 0) || 1;

  // Planteles (sub-escuelas) asociados a la escuela principal que se está viendo

  const plantelesEscuela = escuela ? (data.planteles || []).filter(p => p.escuela_id === escuela.id) : [];



  // Si superadmin sin escuela seleccionada → mostrar overview global

  if (esSuper && !escuela) {

    const globalStats = AppModel.getEstadisticasGlobales(allData);

    const statsFiltrados = globalStats.filter(s =>

      filtroEscEstado === 'todas' ? true :

      filtroEscEstado === 'activas' ? s.activa :

      !s.activa

    );

    const totalCobrado = statsFiltrados.reduce((a, s) => a + s.totalCobrado, 0);

    const totalPend = statsFiltrados.reduce((a, s) => a + s.totalPendiente, 0);

    const totalAlumnos = statsFiltrados.reduce((a, s) => a + s.numAlumnos, 0);

    return _jsxDEV("div", {

      children: [_jsxDEV("div", {

        style: {

          marginBottom: 24

        },

        children: [_jsxDEV("h2", {

          style: {

            fontSize: 23,

            fontWeight: 700,

            color: 'var(--ink)',

            letterSpacing: '-.7px'

          },

          children: "Panel Global — Paga la Escuela"

        }, void 0, false), _jsxDEV("p", {

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

      }, void 0, true), _jsxDEV("div", {

        className: "stats-grid",

        children: [_jsxDEV("div", {

          className: "stat-card is-featured",

          children: [_jsxDEV("div", {

            className: "stat-icon",

            children: _jsxDEV(Icon, {

              name: "escuelas",

              size: 19,

              color: "currentColor"

            }, void 0, false)

          }, void 0, false), _jsxDEV("div", {

            className: "stat-label",

            children: filtroEscEstado === 'todas' ? 'Escuelas' : filtroEscEstado === 'activas' ? 'Escuelas activas' : 'Escuelas inactivas'

          }, void 0, false), _jsxDEV("div", {

            className: "stat-value",

            style: {

              fontSize: 20

            },

            children: statsFiltrados.length

          }, void 0, false)]

        }, void 0, true), _jsxDEV("div", {

          className: "stat-card",

          children: [_jsxDEV("div", {

            className: "stat-icon tint-green",

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

            style: {

              fontSize: 20

            },

            children: fmt(totalCobrado)

          }, void 0, false)]

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

            children: "Por cobrar"

          }, void 0, false), _jsxDEV("div", {

            className: "stat-value",

            style: {

              fontSize: 20

            },

            children: fmt(totalPend)

          }, void 0, false)]

        }, void 0, true), _jsxDEV("div", {

          className: "stat-card",

          children: [_jsxDEV("div", {

            className: "stat-icon tint-cyan",

            children: _jsxDEV(Icon, {

              name: "alumnos",

              size: 19,

              color: "currentColor"

            }, void 0, false)

          }, void 0, false), _jsxDEV("div", {

            className: "stat-label",

            children: "Alumnos totales"

          }, void 0, false), _jsxDEV("div", {

            className: "stat-value",

            style: {

              fontSize: 20

            },

            children: totalAlumnos

          }, void 0, false)]

        }, void 0, true)]

      }, void 0, true), _jsxDEV("div", {

        style: {

          display: 'flex',

          justifyContent: 'space-between',

          alignItems: 'center',

          marginBottom: 14

        },

        children: [_jsxDEV("h3", {

          style: { fontSize: 14, fontWeight: 700, color: 'var(--ink)' },

          children: "Escuelas"

        }, void 0, false), _jsxDEV("div", {

          style: { display: 'flex', gap: 6 },

          children: [

            { id: 'todas',     label: `Todas (${globalStats.length})` },

            { id: 'activas',   label: `Activas (${globalStats.filter(s => s.activa).length})` },

            { id: 'inactivas', label: `Inactivas (${globalStats.filter(s => !s.activa).length})` }

          ].map(f => _jsxDEV("button", {

            key: f.id,

            className: `btn btn-sm ${filtroEscEstado === f.id ? 'btn-primary' : 'btn-secondary'}`,

            onClick: () => setFiltroEscEstado(f.id),

            children: f.label

          }, f.id, false))

        }, void 0, true)]

      }, void 0, true), _jsxDEV("div", {

        style: {

          display: 'grid',

          gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))',

          gap: 16

        },

        children: statsFiltrados.length ? statsFiltrados.map(s => _jsxDEV("div", {

          className: "card",

          style: {

            borderLeft: `3px solid ${s.color}`,

            opacity: s.activa ? 1 : .6

          },

          children: [_jsxDEV("div", {

            style: {

              display: 'flex',

              alignItems: 'center',

              gap: 12,

              marginBottom: 14

            },

            children: [_jsxDEV("div", {

              style: {

                fontSize: 28

              },

              children: s.emoji

            }, void 0, false), _jsxDEV("div", {

              style: { flex: 1, minWidth: 0 },

              children: [_jsxDEV("div", {

                style: {

                  fontWeight: 600,

                  fontSize: 14,

                  color: 'var(--ink)',

                  display: 'flex',

                  alignItems: 'center',

                  gap: 6

                },

                children: [s.nombre, !s.activa && _jsxDEV("span", {

                  className: "badge badge-red",

                  children: "Inactiva"

                }, void 0, false), s.numPlanteles > 0 && _jsxDEV("span", {

                  className: "badge badge-gray",

                  title: "Planteles asociados",

                  style: { display: 'flex', alignItems: 'center', gap: 3 },

                  children: [_jsxDEV(Icon, {

                    name: "escuelas",

                    size: 10,

                    color: "currentColor"

                  }, void 0, false), s.numPlanteles]

                }, void 0, true)]

              }, void 0, true), _jsxDEV("div", {

                style: {

                  fontSize: 12,

                  color: 'var(--ink-3)'

                },

                children: [s.numAlumnos, " alumnos · ", s.numCobros, " cobros", s.numPlanteles > 0 ? ` · incluye ${s.numPlanteles} plantel${s.numPlanteles > 1 ? 'es' : ''}` : '']

              }, void 0, true)]

            }, void 0, true)]

          }, void 0, true), _jsxDEV("div", {

            style: {

              display: 'flex',

              justifyContent: 'space-between'

            },

            children: [_jsxDEV("div", {

              children: [_jsxDEV("div", {

                style: {

                  fontSize: 11,

                  color: 'var(--ink-4)',

                  textTransform: 'uppercase',

                  letterSpacing: '.4px'

                },

                children: "Cobrado"

              }, void 0, false), _jsxDEV("div", {

                style: {

                  fontFamily: 'var(--mono)',

                  fontWeight: 700,

                  color: 'var(--green)',

                  fontSize: 15

                },

                children: fmt(s.totalCobrado)

              }, void 0, false)]

            }, void 0, true), s.totalPendiente > 0 && _jsxDEV("div", {

              style: {

                textAlign: 'right'

              },

              children: [_jsxDEV("div", {

                style: {

                  fontSize: 11,

                  color: 'var(--ink-4)',

                  textTransform: 'uppercase',

                  letterSpacing: '.4px'

                },

                children: "Pendiente"

              }, void 0, false), _jsxDEV("div", {

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

        }, s.escuela_id, true)) : _jsxDEV("div", {

          className: "card",

          style: { textAlign: 'center', color: 'var(--ink-4)', padding: 24, gridColumn: '1 / -1' },

          children: "No hay escuelas que coincidan con este filtro."

        }, void 0, false)

      }, void 0, false)]

    }, void 0, true);

  }

  return _jsxDEV("div", {

    children: [_jsxDEV("div", {

      style: {

        marginBottom: 24

      },

      children: [_jsxDEV("h2", {

        style: {

          fontSize: 23,

          fontWeight: 700,

          color: 'var(--ink)',

          letterSpacing: '-.7px'

        },

        children: ["Buenos días, ", user.nombre.split(' ')[0]]

      }, void 0, true), _jsxDEV("p", {

        style: {

          fontSize: 13,

          color: 'var(--ink-3)',

          marginTop: 3

        },

        children: [escuela && _jsxDEV("span", {

          style: {

            color: escuela.color,

            marginRight: 6

          },

          children: [escuela.logo_emoji, " ", escuela.nombre, " ·"]

        }, void 0, true), escuela && !escuela.activa && _jsxDEV("span", {

          className: "badge badge-red",

          style: { marginRight: 6 },

          children: "Inactiva"

        }, void 0, false), 

        

        escuela && !esCajero && (() => {

          const planKey = (escuela.plan || '').toLowerCase();

          const info = PLANES_INFO_DASH[planKey] || PLANES_INFO_DASH.basico;

          if (!info) return null;

          return _jsxDEV("span", {

            className: "badge",

            style: { marginRight: 6, color: info.color, borderColor: info.color },

            title: `Plan ${info.label} — ${info.max_alumnos === null ? 'alumnos ilimitados' : `hasta ${info.max_alumnos} alumnos`}, ${info.max_planteles === null ? 'planteles ilimitados' : `hasta ${info.max_planteles} plantel(es)`}`,

            children: ["Plan ", info.label]

          }, void 0, true);

        })(), new Date().toLocaleDateString('es-MX', {

          weekday: 'long',

          day: 'numeric',

          month: 'long',

          year: 'numeric'

        })]

      }, void 0, true)]

    }, void 0, true), 

    

    escuela && !esCajero && (() => {

      const planKey = (escuela.plan || '').toLowerCase();

      const info = PLANES_INFO_DASH[planKey] || PLANES_INFO_DASH.basico;

      if (!info) return null;

      const totalAlumnos = typeof data.clientes_total === 'number' ? data.clientes_total : data.clientes.length;

      const pct = info.max_alumnos ? Math.min(100, Math.round(totalAlumnos / info.max_alumnos * 100)) : null;

      const excedido = info.max_alumnos !== null && totalAlumnos > info.max_alumnos;

      const excedidoPlt = info.max_planteles !== null && plantelesEscuela.length > info.max_planteles;

      return _jsxDEV("div", {

        className: "card",

        style: { marginBottom: 22, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' },

        children: [_jsxDEV("div", {

          children: [_jsxDEV("div", { style: { fontSize: 11, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '.4px' }, children: "Tu plan" }, void 0, false),

          _jsxDEV("div", { style: { fontSize: 15, fontWeight: 700, color: info.color }, children: info.label }, void 0, false)]

        }, void 0, true), _jsxDEV("div", {

          style: { flex: 1, minWidth: 180 },

          children: [_jsxDEV("div", {

            style: { fontSize: 12, color: excedido ? 'var(--red)' : 'var(--ink-3)', marginBottom: 4 },

            children: info.max_alumnos === null

              ? `${totalAlumnos} alumnos (sin límite)`

              : `${totalAlumnos} / ${info.max_alumnos} alumnos${excedido ? ' — superaste el límite' : ''}`

          }, void 0, false), pct !== null && _jsxDEV("div", {

            style: { width: '100%', maxWidth: 260, height: 6, background: 'var(--glass-light)', borderRadius: 3, overflow: 'hidden' },

            children: _jsxDEV("div", { style: { width: `${pct}%`, height: '100%', background: excedido ? 'var(--red)' : 'var(--grad-cool)' } }, void 0, false)

          }, void 0, false)]

        }, void 0, true), _jsxDEV("div", {

          style: { fontSize: 12, color: excedidoPlt ? 'var(--red)' : 'var(--ink-3)' },

          children: info.max_planteles === null

            ? `${plantelesEscuela.length} planteles (sin límite)`

            : `${plantelesEscuela.length} / ${info.max_planteles} plantel(es)${excedidoPlt ? ' ⚠' : ''}`

        }, void 0, false), (excedido || excedidoPlt) && _jsxDEV("span", {

          style: { fontSize: 11.5, color: 'var(--red)' },

          children: "Contacta a soporte para subir de plan."

        }, void 0, false)]

      }, void 0, true);

    })(), 

    

    // CONDICIÓN AÑADIDA: !esCajero para ocultar la sección de planteles

    !esCajero && plantelesEscuela.length > 0 && _jsxDEV("div", {

      style: { marginBottom: 22 },

      children: [_jsxDEV("div", {

        style: {

          display: 'flex',

          alignItems: 'center',

          gap: 8,

          marginBottom: 10

        },

        children: [_jsxDEV(Icon, {

          name: "escuelas",

          size: 14,

          color: "var(--ink-3)"

        }, void 0, false), _jsxDEV("h3", {

          style: { fontSize: 13, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.4px' },

          children: ["Planteles de ", escuela.nombre, " (", plantelesEscuela.length, ")"]

        }, void 0, true)]

      }, void 0, true), _jsxDEV("div", {

        style: {

          display: 'grid',

          gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))',

          gap: 12

        },

        children: plantelesEscuela.map(p => {
          const r = (data.resumen_planteles || {})[p.escuela_plantel_id] || null;
          const cobrado   = r ? (r.cobrado_90d   || 0) : 0;
          const pendiente = r ? (r.pendiente_90d || 0) : 0;
          const alumnos   = r ? (r.num_alumnos   || 0) : 0;
          const meta = cobrado + pendiente;
          const pct = meta > 0 ? Math.round(cobrado / meta * 100) : 0;
          const palabras = (p.nombre || '?').trim().split(/\s+/).filter(w => w.length > 2);
          const iniciales = palabras.slice(0, 2).map(w => w[0].toUpperCase()).join('')
            || (p.nombre || '?')[0].toUpperCase();
          const etiqueta = { fontSize: 10.5, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 };
          const cifra = c => ({ fontSize: 17, fontWeight: 700, color: c, fontVariantNumeric: 'tabular-nums', lineHeight: 1 });
          return _jsxDEV("div", {
            className: "card",
            style: { padding: 0, overflow: 'hidden', opacity: p.activo ? 1 : .55 },
            children: [
              _jsxDEV("div", {
                style: { display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px 12px' },
                children: [
                  _jsxDEV("div", {
                    style: {
                      width: 42, height: 42, borderRadius: 13, flexShrink: 0,
                      background: 'var(--violet-soft)', color: 'var(--violet)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: 14, letterSpacing: '-.3px'
                    },
                    children: iniciales
                  }, void 0, false),
                  _jsxDEV("div", {
                    style: { minWidth: 0, flex: 1 },
                    children: [
                      _jsxDEV("div", {
                        style: {
                          fontWeight: 700, fontSize: 14, color: 'var(--ink)', letterSpacing: '-.2px',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                        },
                        children: p.nombre
                      }, void 0, false),
                      p.direccion ? _jsxDEV("div", {
                        style: {
                          fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                        },
                        children: p.direccion
                      }, void 0, false) : null
                    ]
                  }, void 0, true),
                  !p.activo ? _jsxDEV("span", { className: "badge badge-gray", children: "Inactivo" }, void 0, false) : null
                ]
              }, void 0, true),

              p.responsable ? _jsxDEV("div", {
                style: {
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '0 18px 14px', fontSize: 12, color: 'var(--ink-3)', minWidth: 0
                },
                children: [
                  _jsxDEV(Icon, { name: 'usuarios', size: 13, color: 'var(--ink-4)' }, void 0, false),
                  _jsxDEV("span", {
                    style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
                    children: p.responsable
                  }, void 0, false),
                  p.tel ? _jsxDEV("span", {
                    style: { color: 'var(--ink-4)', flexShrink: 0 },
                    children: '\u00b7 ' + p.tel
                  }, void 0, false) : null
                ]
              }, void 0, true) : null,

              r ? _jsxDEV("div", {
                style: {
                  padding: '14px 18px 16px', borderTop: '1px solid var(--border-glow)',
                  background: 'var(--glass-light)'
                },
                children: [
                  _jsxDEV("div", {
                    style: { display: 'flex', gap: 20, marginBottom: meta > 0 ? 12 : 0, flexWrap: 'wrap' },
                    children: [
                      _jsxDEV("div", {
                        children: [
                          _jsxDEV("div", { style: etiqueta, children: "Alumnos" }, void 0, false),
                          _jsxDEV("div", { style: cifra('var(--ink)'), children: alumnos }, void 0, false)
                        ]
                      }, 'al', true),
                      _jsxDEV("div", {
                        children: [
                          _jsxDEV("div", { style: etiqueta, children: "Cobrado 90d" }, void 0, false),
                          _jsxDEV("div", { style: cifra(cobrado > 0 ? 'var(--green-dark)' : 'var(--ink-4)'), children: fmt(cobrado) }, void 0, false)
                        ]
                      }, 'co', true),
                      pendiente > 0 ? _jsxDEV("div", {
                        children: [
                          _jsxDEV("div", { style: etiqueta, children: "Pendiente" }, void 0, false),
                          _jsxDEV("div", { style: cifra('var(--amber)'), children: fmt(pendiente) }, void 0, false)
                        ]
                      }, 'pe', true) : null
                    ]
                  }, void 0, true),
                  meta > 0 ? _jsxDEV("div", {
                    children: [
                      _jsxDEV("div", {
                        className: "progress-bar", style: { height: 6 },
                        children: _jsxDEV("div", { className: "progress-fill", style: { width: pct + '%' } }, void 0, false)
                      }, void 0, false),
                      _jsxDEV("div", {
                        style: { fontSize: 10.5, color: 'var(--ink-4)', marginTop: 5 },
                        children: pct + '% recuperado en los \u00faltimos 90 d\u00edas'
                      }, void 0, false)
                    ]
                  }, void 0, true) : null
                ]
              }, void 0, true) : _jsxDEV("div", {
                style: {
                  padding: '12px 18px 16px', borderTop: '1px solid var(--border-glow)',
                  fontSize: 11.5, color: 'var(--ink-4)'
                },
                children: "Sin movimientos registrados"
              }, void 0, false)
            ]
          }, p.id, true);
        })

      }, void 0, true)]

    }, void 0, true), _jsxDEV("div", {

      className: "stats-grid",

      children: [{

        /* Tarjeta destacada con degradado — el número principal del panel */

        featured: true,

        label: 'Total cobrado',

        val: fmt(stats.totalCobrado),

        icon: 'pay',

        tint: '',

        meta: (() => {

          // Tasa de recuperación REAL, calculada con los datos ya cargados. No se inventan variaciones: el backend no envía histórico.

          const base = stats.totalCobrado + stats.totalPendiente;

          const pct = base > 0 ? Math.round(stats.totalCobrado / base * 100) : 0;

          const pagados = data.cobros.filter(c => c.estado === 'pagado').length;

          return pct + '% recuperado · ' + pagados + ' cobros pagados';

        })(),

        color: ''

      }, {

        label: 'Por cobrar',

        val: fmt(stats.totalPendiente),

        icon: 'history',

        tint: 'tint-amber',

        meta: pendientes.length + ' cobros pendientes',

        color: ''

      }, {

        label: 'Cobrado hoy',

        val: fmt(stats.cobrosHoy),

        icon: 'cobros',

        tint: 'tint-green',

        meta: data.cobros.filter(c => c.fecha === new Date().toISOString().slice(0, 10) && c.estado === 'pagado').length + ' transacciones hoy',

        color: ''

      }, {

        label: 'Alumnos activos',

        val: typeof data.clientes_activos_total === 'number' ? data.clientes_activos_total : data.clientes.filter(c => c.activo).length,

        icon: 'alumnos',

        tint: 'tint-cyan',

        meta: data.clientes.filter(c => c.activo && c.saldo_pendiente > 0).length + ' con saldo pendiente',

        color: ''

      }].map(s => _jsxDEV("div", {

        className: "stat-card" + (s.featured ? " is-featured" : ""),

        children: [_jsxDEV("div", {

          className: "stat-icon" + (s.tint ? " " + s.tint : ""),

          children: _jsxDEV(Icon, {

            name: s.icon,

            size: 19,

            color: "currentColor"

          }, void 0, false)

        }, void 0, false), _jsxDEV("div", {

          className: "stat-value",

          style: {

            color: s.color || undefined

          },

          children: s.val

        }, void 0, false), _jsxDEV("div", {

          className: "stat-label",

          children: s.label

        }, void 0, false), _jsxDEV("div", {

          className: "stat-meta",

          children: s.meta

        }, void 0, false)]

      }, s.label, true))

    }, void 0, false), _jsxDEV("div", {

      className: "card",

      style: { marginBottom: 20 },

      children: (() => {

        // Tendencia de cobranza en el rango elegido por el usuario (ver
        // filtro de rango arriba del componente Dashboard). Se pide
        // agregado por día al servidor (tendencia_cobranza), no se calcula
        // de data.cobros (que solo trae 90 días — un rango de "1 año" se
        // vería vacío más allá de eso).
        const cubos = [];
        if (desdeTendencia && hastaTendencia) {
          let cur = new Date(desdeTendencia + 'T00:00:00');
          const fin = new Date(hastaTendencia + 'T00:00:00');
          while (cur <= fin) {
            const iso = cur.toISOString().slice(0, 10);
            cubos.push({
              iso,
              label: cur.getDate() + '/' + (cur.getMonth() + 1),
              valor: (tendenciaPorDia && tendenciaPorDia[iso]) || 0,
            });
            cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
          }
        }

        const suma = cubos.reduce((a, c) => a + c.valor, 0);
        const rangoActivo = RANGOS_TENDENCIA.find(r => r.id === rangoTendencia);
        const subtitulo = rangoTendencia === 'custom'
          ? (customDesde && customHasta ? `${customDesde} a ${customHasta}` : 'Elige un rango')
          : `Últimos ${rangoActivo ? rangoActivo.label.toLowerCase() : '30 días'}`;

        return [

          _jsxDEV("div", {

            className: "card-header",
            style: { flexWrap: 'wrap', gap: 10 },

            children: [

              _jsxDEV("div", {

                children: [

                  _jsxDEV("div", { className: "card-title", children: "Tendencia de cobranza" }, void 0, false),

                  _jsxDEV("div", { className: "card-sub", children: cargandoTendencia ? 'Cargando…' : subtitulo }, void 0, false)

                ]

              }, void 0, true),

              _jsxDEV("div", {

                style: { fontSize: 19, fontWeight: 700, color: 'var(--violet)', letterSpacing: '-.6px' },

                children: fmt(suma)

              }, void 0, false)

            ]

          }, 'head', true),

          _jsxDEV("div", {
            style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 14 },
            children: [
              ...RANGOS_TENDENCIA.map(r => _jsxDEV("button", {
                type: "button",
                className: 'btn btn-sm ' + (rangoTendencia === r.id ? 'btn-primary' : 'btn-ghost'),
                onClick: () => setRangoTendencia(r.id),
                children: r.label
              }, r.id, false)),
              _jsxDEV("button", {
                type: "button",
                className: 'btn btn-sm ' + (rangoTendencia === 'custom' ? 'btn-primary' : 'btn-ghost'),
                onClick: () => setRangoTendencia('custom'),
                children: "Rango personalizado"
              }, 'custom', false),
              rangoTendencia === 'custom' ? _jsxDEV("input", {
                type: "date",
                className: "form-input",
                style: { width: 145, fontSize: 12.5 },
                value: customDesde,
                max: hoyISO,
                onChange: e => setCustomDesde(e.target.value)
              }, 'desde', false) : null,
              rangoTendencia === 'custom' ? _jsxDEV("input", {
                type: "date",
                className: "form-input",
                style: { width: 145, fontSize: 12.5 },
                value: customHasta,
                min: customDesde || undefined,
                max: hoyISO,
                onChange: e => setCustomHasta(e.target.value)
              }, 'hasta', false) : null
            ]
          }, 'rango', true),

          _jsxDEV(AreaChart, {

            datos: cubos,

            alto: 210,

            color: 'var(--violet)',

            formato: fmt

          }, 'chart', false)

        ];

      })()

    }, void 0, false), _jsxDEV("div", {

      className: "dash-split-grid",

      children: [_jsxDEV("div", {

        className: "card",

        children: [_jsxDEV("div", {

          className: "card-header",

          children: _jsxDEV("div", {

            children: [_jsxDEV("div", {

              className: "card-title",

              children: "Cobros recientes"

            }, void 0, false), _jsxDEV("div", {

              className: "card-sub",

              children: "Últimas transacciones"

            }, void 0, false)]

          }, void 0, true)

        }, void 0, false), _jsxDEV("div", {

          className: "table-wrap",

          children: _jsxDEV("table", {

            children: [_jsxDEV("thead", {

              children: _jsxDEV("tr", {

                children: [_jsxDEV("th", {

                  children: "Folio"

                }, void 0, false), _jsxDEV("th", {

                  children: "Cliente"

                }, void 0, false), _jsxDEV("th", {

                  children: "Total"

                }, void 0, false), _jsxDEV("th", {

                  children: "Método"

                }, void 0, false), _jsxDEV("th", {

                  children: "Estado"

                }, void 0, false)]

              }, void 0, true)

            }, void 0, false), _jsxDEV("tbody", {

              children: [recientes.length === 0 && _jsxDEV("tr", {

                children: _jsxDEV("td", {

                  colSpan: 5,

                  children: _jsxDEV("div", {

                    className: "empty-state",

                    style: {

                      padding: '20px 0'

                    },

                    children: _jsxDEV("div", {

                      className: "empty-text",

                      children: "Sin cobros aún"

                    }, void 0, false)

                  }, void 0, false)

                }, void 0, false)

              }, void 0, false), recientes.map(c => _jsxDEV("tr", {

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

                    maxWidth: 160,

                    overflow: 'hidden',

                    textOverflow: 'ellipsis',

                    whiteSpace: 'nowrap'

                  },

                  children: c.cliente

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

                }, void 0, false)]

              }, c.id, true))]

            }, void 0, true)]

          }, void 0, true)

        }, void 0, false)]

      }, void 0, true), _jsxDEV("div", {

        className: "card",

        children: [_jsxDEV("div", {

          className: "card-header",

          children: _jsxDEV("div", {

            children: [_jsxDEV("div", {

              className: "card-title",

              children: "Por método de pago"

            }, void 0, false), _jsxDEV("div", {

              className: "card-sub",

              children: "Distribución del mes"

            }, void 0, false)]

          }, void 0, true)

        }, void 0, false), _jsxDEV("div", {

          style: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' },

          children: (() => {

            // Dona + leyenda, como "Traffic Sources" del video. Los datos son los mismos que antes mostraban las barras.

            const serie = [

              { label: 'Tarjeta',   valor: stats.cobradosPorMetodo.TC       || 0, color: 'var(--violet)' },

              { label: 'SPEI',      valor: stats.cobradosPorMetodo.SPEI     || 0, color: 'var(--cyan)' },

              { label: 'Efectivo',  valor: stats.cobradosPorMetodo.Efectivo || 0, color: 'var(--green)' },

              { label: 'Cheque',    valor: stats.cobradosPorMetodo.Cheque   || 0, color: 'var(--amber)' },

              // CoDi se suma a "Otro" en vez de tener su propia categoría
              // (10-sep-2026, a pedido) -- se sigue contando en el total, solo
              // no se muestra como rebanada aparte.
              { label: 'Otro',      valor: (stats.cobradosPorMetodo.Otro || 0) + (stats.cobradosPorMetodo.CoDi || 0), color: 'var(--red)' }

            ].filter(d => d.valor > 0);

            const total = serie.reduce((a, d) => a + d.valor, 0);

            return [

              _jsxDEV(DonutChart, {

                datos: serie,

                tamano: 168,

                centro: {

                  valor: (v => v >= 1e6 ? '$' + (v/1e6).toFixed(2) + 'M'

                             : v >= 1e3 ? '$' + Math.round(v/1e3) + 'k'

                             : '$' + Math.round(v))(total),

                  etiqueta: 'Cobrado'

                }

              }, 'donut', false),

              _jsxDEV(DonutLeyenda, { datos: serie }, 'leyenda', false)

            ];

          })()

        }, void 0, false), pendientes.length > 0 && _jsxDEV("div", {

          style: {

            marginTop: 16,

            padding: '10px 12px',

            background: 'var(--amber-glow)',

            border: '1px solid rgba(245,158,11,.2)',

            borderRadius: 'var(--radius-sm)'

          },

          children: [_jsxDEV("div", {

            style: {

              fontSize: 12,

              fontWeight: 600,

              color: '#fbbf24',

              marginBottom: 4,

              display: "flex",

              alignItems: "center",

              gap: 6

            },

            children: [_jsxDEV(Icon, {

              name: "warning",

              size: 13,

              color: "#fbbf24"

            }, void 0, false), " Cobros pendientes"]

          }, void 0, true), pendientes.slice(0, 3).map(c => _jsxDEV("div", {

            style: {

              fontSize: 11.5,

              color: 'var(--ink-3)',

              marginBottom: 2

            },

            children: [c.folio, " · ", (c.cliente || 'Cliente general').split(' ')[0], " · ", fmt(c.total)]

          }, c.id, true))]

        }, void 0, true)]

      }, void 0, true)]

    }, void 0, true)]

  }, void 0, true);

}
