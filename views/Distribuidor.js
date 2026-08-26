var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};
// views/Distribuidor.jsx — Portal del rol "distribuidor" (programa de referidos) Migrado al patrón _jsxDEV + clases CSS compartidas (mismo patrón que Dashboard.js/Usuarios.js), reutilizando .sidebar/.app/.main/.topbar/.content del shell principal (assets/js/app.js) para heredar el drawer responsive de ≤768px sin duplicar layout propio. Trae su propia data vía action=distribuidor_datos / distribuidor_invitar_colegio / distribuidor_comisiones / distribuidor_datos_pago / distribuidor_guardar_datos_pago. La edición de perfil reutiliza AuthController.editarUsuario (acción compartida editar_usuario).

const DIST_ESTADOS = {
  activo:         { label: 'Activo',         icon: 'check',    badge: 'badge-green',  barColor: 'var(--green)' },
  implementacion: { label: 'Implementación', icon: 'settings', badge: 'badge-amber',  barColor: 'var(--amber)' },
  demo_agendada:  { label: 'Demo agendada',  icon: 'history',  badge: 'badge-blue',   barColor: 'var(--accent)' },
  prospecto:      { label: 'Prospecto',      icon: 'usuarios', badge: 'badge-purple', barColor: 'var(--purple)' },
};
const DIST_ORDEN_EMBUDO = ['activo', 'implementacion', 'demo_agendada', 'prospecto'];

const DIST_SECCIONES = {
  dashboard:  { titulo: 'Dashboard',           icon: 'dashboard' },
  colegios:   { titulo: 'Mis colegios',        icon: 'escuelas' },
  comisiones: { titulo: 'Comisiones',          icon: 'pay' },
  materiales: { titulo: 'Tutoriales',          icon: 'reportes' },
  perfil:     { titulo: 'Mi perfil',           icon: 'usuarios' },
  pago:       { titulo: 'Datos de pago',       icon: 'card' },
};

const DIST_NAV_ITEMS = [
  { id: 'dashboard',  label: 'Dashboard',     icon: 'dashboard', section: 'Principal' },
  { id: 'colegios',   label: 'Mis colegios',  icon: 'escuelas',  section: 'Principal', showColegiosBadge: true },
  { id: 'comisiones', label: 'Comisiones',    icon: 'pay',       section: 'Principal' },
  { id: 'materiales', label: 'Tutoriales',    icon: 'reportes',  section: 'Principal' },
  { id: 'perfil',     label: 'Mi perfil',     icon: 'usuarios',  section: 'Configuración' },
  { id: 'pago',       label: 'Datos de pago', icon: 'card',      section: 'Configuración' },
];

// Tutoriales en video. Para agregar uno nuevo basta con añadir un objeto:
// el id es el código que aparece en la URL de YouTube (youtu.be/EL_ID).
const DIST_TUTORIALES = [
  {
    categoria: 'Primeros pasos',
    videos: [
      { id: '', titulo: 'Bienvenida al programa de referidos', duracion: '4:12',
        desc: 'Cómo funciona el esquema de comisiones y qué esperar en tu primer mes.' },
      { id: '', titulo: 'Recorrido general de la plataforma', duracion: '7:35',
        desc: 'Vista rápida de cada módulo: cobros, alumnos, familias y reportes.' },
    ]
  },
  {
    categoria: 'Proceso de venta',
    videos: [
      { id: '', titulo: 'Tu primera llamada con un colegio', duracion: '6:20',
        desc: 'Guion sugerido, objeciones frecuentes y cómo cerrar la cita.' },
      { id: '', titulo: 'Demo en vivo del sistema de cobro', duracion: '9:48',
        desc: 'Qué mostrar y en qué orden para que el director entienda el valor.' },
      { id: '', titulo: 'Cómo presentar el portal familiar', duracion: '5:03',
        desc: 'El argumento que más convence: la experiencia del papá o mamá.' },
    ]
  },
  {
    categoria: 'Administración',
    videos: [
      { id: '', titulo: 'Registrar e invitar un colegio nuevo', duracion: '3:40',
        desc: 'Paso a paso desde tu panel hasta que el colegio queda activo.' },
      { id: '', titulo: 'Entender tu corte de comisiones', duracion: '5:55',
        desc: 'Cómo se calcula, cuándo se paga y dónde revisar el detalle.' },
    ]
  }
];

function distFmtMoney(n) {
  const v = Number(n) || 0;
  return '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ── Badge de estado del embudo (usa variantes .badge-* ya existentes) ── */
function DistBadge({ estado }) {
  const cfg = DIST_ESTADOS[estado] || DIST_ESTADOS.prospecto;
  return _jsxDEV("span", {
    className: `badge ${cfg.badge}`,
    children: [
      _jsxDEV(Icon, { name: cfg.icon, size: 12, color: 'currentColor' }, void 0, false),
      cfg.label
    ]
  }, void 0, true);
}

/* ── Stat card reutilizando .stat-card/.stat-icon/.stat-label/.stat-value/.stat-meta ── */
function DistStatCard({ icon, iconBg, iconColor, tint, destacada, label, value, valueColor, sub }) {
  return _jsxDEV("div", {
    className: "stat-card" + (destacada ? " is-featured" : ""),
    children: [
      _jsxDEV("div", { className: "stat-icon" + (tint ? " " + tint : ""), children: icon }, void 0, false),
      _jsxDEV("div", { className: "stat-label", children: label }, void 0, false),
      _jsxDEV("div", { className: "stat-value", style: valueColor ? { color: valueColor } : undefined, children: value }, void 0, false),
      sub ? _jsxDEV("div", { className: "stat-meta", children: sub }, void 0, false) : null,
    ]
  }, void 0, true);
}

/* ── Modal "Invitar colegio" (.modal-backdrop/.modal/.modal-header/.modal-body/.modal-footer) ── */
function DistInviteModal({ onClose, onSubmit, nombre, setNombre, alumnos, setAlumnos, saving, error }) {
  return _jsxDEV("div", {
    className: "modal-backdrop",
    onClick: e => e.target === e.currentTarget && onClose(),
    children: _jsxDEV("form", {
      className: "modal",
      style: { maxWidth: 420 },
      onClick: e => e.stopPropagation(),
      onSubmit: onSubmit,
      children: [
        _jsxDEV("div", {
          className: "modal-header",
          children: [
            _jsxDEV("div", { className: "modal-title", children: "Invitar colegio" }, void 0, false),
            _jsxDEV("button", {
              type: "button", className: "btn btn-ghost btn-sm", onClick: onClose,
              children: _jsxDEV(Icon, { name: "close", size: 16, color: "currentColor" }, void 0, false)
            }, void 0, false),
          ]
        }, void 0, true),

        _jsxDEV("div", {
          className: "modal-body",
          children: [
            _jsxDEV("p", { style: { margin: '0 0 16px', fontSize: 12.5, color: 'var(--ink-3)' }, children: "Se agrega como prospecto a tu embudo de referidos." }, void 0, false),

            error ? _jsxDEV("div", {
              style: {
                display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14, padding: '10px 14px',
                background: 'var(--red-glow)', border: '1px solid var(--red)', borderRadius: 'var(--radius-sm)',
                fontSize: 13, color: 'var(--red)'
              },
              children: error
            }, void 0, false) : null,

            _jsxDEV("div", {
              className: "form-group",
              children: [
                _jsxDEV("label", { className: "form-label", children: "Nombre del colegio" }, void 0, false),
                _jsxDEV("input", {
                  className: "form-input", type: "text", value: nombre, onChange: e => setNombre(e.target.value),
                  placeholder: "Ej. Colegio Vista Hermosa", autoFocus: true
                }, void 0, false),
              ]
            }, void 0, true),

            _jsxDEV("div", {
              className: "form-group",
              style: { marginBottom: 4 },
              children: [
                _jsxDEV("label", { className: "form-label", children: "Número de alumnos (aprox.)" }, void 0, false),
                _jsxDEV("input", {
                  className: "form-input", type: "number", min: 0, value: alumnos, onChange: e => setAlumnos(e.target.value),
                  placeholder: "Opcional"
                }, void 0, false),
              ]
            }, void 0, true),
          ]
        }, void 0, true),

        _jsxDEV("div", {
          className: "modal-footer",
          children: [
            _jsxDEV("button", { type: "button", className: "btn btn-secondary", onClick: onClose, children: "Cancelar" }, void 0, false),
            _jsxDEV("button", {
              type: "submit", className: "btn btn-primary", disabled: saving,
              children: saving ? 'Enviando…' : 'Invitar'
            }, void 0, false),
          ]
        }, void 0, true),
      ]
    }, void 0, true)
  }, void 0, false);
}

/* ── Vista: Mis colegios (listado completo, con búsqueda y filtro) ── */
function DistColegiosView({ colegios }) {
  const { useState } = React;
  const [q, setQ] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos');

  const lista = colegios.filter(c => {
    if (filtroEstado !== 'todos' && c.estado !== filtroEstado) return false;
    if (q && !c.nombre.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return _jsxDEV("div", {
    children: [
      _jsxDEV("div", {
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 },
        children: [
          _jsxDEV("div", {
            children: [
              _jsxDEV("h2", { style: { fontSize: 20, margin: '0 0 4px', fontWeight: 800 }, children: "Mis colegios" }, void 0, false),
              _jsxDEV("div", { style: { fontSize: 12.5, color: 'var(--ink-3)' }, children: `${colegios.length} colegio${colegios.length === 1 ? '' : 's'} en tu cartera` }, void 0, false),
            ]
          }, void 0, true),
          _jsxDEV("div", {
            style: { display: 'flex', gap: 8, flexWrap: 'wrap' },
            children: [
              _jsxDEV("input", {
                className: "form-input", style: { width: 200 },
                value: q, onChange: e => setQ(e.target.value), placeholder: "Buscar colegio…"
              }, void 0, false),
              _jsxDEV("select", {
                className: "form-select", style: { width: 180 },
                value: filtroEstado, onChange: e => setFiltroEstado(e.target.value),
                children: [
                  _jsxDEV("option", { value: "todos", children: "Todos los estados" }, void 0, false),
                  ...DIST_ORDEN_EMBUDO.map(k => _jsxDEV("option", { value: k, children: DIST_ESTADOS[k].label }, k, false)),
                ]
              }, void 0, true),
            ]
          }, void 0, true),
        ]
      }, void 0, true),

      _jsxDEV("div", {
        className: "card",
        children: lista.length === 0
          ? _jsxDEV("div", { className: "empty-state", children: _jsxDEV("div", { className: "empty-text", children: "No hay colegios que coincidan con tu búsqueda." }, void 0, false) }, void 0, false)
          : _jsxDEV("div", {
              className: "table-wrap",
              children: _jsxDEV("table", {
                children: [
                  _jsxDEV("thead", {
                    children: _jsxDEV("tr", {
                      children: ['Colegio', 'Tamaño', 'Comisión', 'Estado', 'Fecha de alta'].map(t => _jsxDEV("th", { children: t }, t, false))
                    }, void 0, true)
                  }, void 0, false),
                  _jsxDEV("tbody", {
                    children: lista.map(c => _jsxDEV("tr", {
                      children: [
                        _jsxDEV("td", { style: { fontWeight: 700 }, children: c.nombre }, void 0, false),
                        _jsxDEV("td", { children: c.num_alumnos ? `${c.num_alumnos} alumnos` : '—' }, void 0, false),
                        _jsxDEV("td", { children: c.estado === 'activo' ? `${c.comision_pct}%` : '—' }, void 0, false),
                        _jsxDEV("td", { children: _jsxDEV(DistBadge, { estado: c.estado }, void 0, false) }, void 0, false),
                        _jsxDEV("td", { style: { fontFamily: 'var(--mono)', fontSize: 12 }, children: c.fecha_alta || '—' }, void 0, false),
                      ]
                    }, c.id, true))
                  }, void 0, false),
                ]
              }, void 0, true)
            }, void 0, false)
      }, void 0, false),

      _jsxDEV(PanelInvitaciones, { esSuperAdmin: false }, void 0, false),
    ]
  }, void 0, true);
}

/* ── Vista: Comisiones (historial 12 meses + detalle por colegio) ── */
function DistComisionesView() {
  const { useState, useEffect } = React;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const token = AuthController.getToken();
        const res = await fetch('api.php?action=distribuidor_comisiones', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (res.status === 401) { AuthController.logout(); window.location.reload(); return; }
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'No se pudo cargar tu historial de comisiones');
        setData(json);
      } catch (e) {
        setError(e.message || 'Error de conexión con el servidor');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return _jsxDEV("div", { style: { padding: '40px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }, children: "Cargando…" }, void 0, false);
  if (error) return _jsxDEV("div", { style: { padding: '40px 0', textAlign: 'center', color: 'var(--red)', fontSize: 13 }, children: error }, void 0, false);

  const historial = data.historial || [];
  const colegios = data.colegios || [];
  const maxComision = Math.max(1, ...historial.map(m => m.comision));

  const exportarCSV = () => {
    const nombreDist = AuthController.getSession()?.nombre || 'Distribuidor';
    const hoy = new Date();
    const totalCobrado = colegios.reduce((a, c) => a + (Number(c.cobrado_mes) || 0), 0);
    const totalComisionMes = colegios.reduce((a, c) => a + (Number(c.comision_mes) || 0), 0);
    const totalComisionAnio = colegios.reduce((a, c) => a + (Number(c.comision_anio) || 0), 0);
    const rows = [
      [`Comisiones — ${nombreDist}`],
      [`Mes en curso: ${hoy.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}`],
      [],
      ['Colegio', '% Comisión', 'Cobrado del mes', 'Comisión del mes', 'Comisión acumulada del año'],
      ...colegios.map(c => [c.nombre, `${c.comision_pct}%`, CSVExport.money(c.cobrado_mes), CSVExport.money(c.comision_mes), CSVExport.money(c.comision_anio)]),
      [],
      ['TOTAL DE COMISIONES', '', CSVExport.money(totalCobrado), CSVExport.money(totalComisionMes), CSVExport.money(totalComisionAnio)],
    ];
    CSVExport.descargar(`comisiones-${nombreDist.toLowerCase().replace(/\s+/g, '-')}-${hoy.toISOString().slice(0, 10)}.csv`, rows);
  };

  return _jsxDEV("div", {
    children: [
      _jsxDEV("div", {
        style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
        children: [
          _jsxDEV("div", {
            children: [
              _jsxDEV("h2", { style: { fontSize: 20, margin: '0 0 4px', fontWeight: 800 }, children: "Comisiones" }, void 0, false),
              _jsxDEV("div", { style: { fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 20 }, children: "Historial de los últimos 12 meses y detalle por colegio" }, void 0, false),
            ]
          }, void 0, true),
          colegios.length > 0 && _jsxDEV("button", {
            className: "btn btn-secondary btn-sm",
            onClick: exportarCSV,
            children: [_jsxDEV(Icon, { name: "download", size: 13, color: "currentColor" }, void 0, false), " Exportar CSV"]
          }, void 0, true),
        ]
      }, void 0, true),

      _jsxDEV("div", {
        className: "card",
        style: { marginBottom: 16 },
        children: [
          _jsxDEV("h3", { style: { margin: '0 0 16px', fontSize: 15, fontWeight: 800 }, children: "Últimos 12 meses" }, void 0, false),
          historial.every(m => m.comision === 0)
            ? _jsxDEV("div", { style: { fontSize: 13, color: 'var(--ink-3)', padding: '10px 0', textAlign: 'center' }, children: "Aún no registras comisión en este periodo." }, void 0, false)
            : _jsxDEV("div", {
                style: { display: 'flex', alignItems: 'flex-end', gap: 8, height: 150 },
                children: historial.map(m => _jsxDEV("div", {
                  style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
                  children: [
                    _jsxDEV("div", { style: { fontSize: 9.5, color: 'var(--ink-4)', marginBottom: 4, whiteSpace: 'nowrap' }, children: m.comision > 0 ? distFmtMoney(m.comision) : '' }, void 0, false),
                    _jsxDEV("div", { style: { width: '70%', minHeight: 2, height: `${Math.max(2, (m.comision / maxComision) * 100)}%`, background: 'var(--lime)', borderRadius: '4px 4px 0 0' } }, void 0, false),
                    _jsxDEV("div", { style: { fontSize: 10, color: 'var(--ink-3)', marginTop: 6 }, children: m.label }, void 0, false),
                  ]
                }, m.mes, true))
              }, void 0, false),
        ]
      }, void 0, true),

      _jsxDEV("div", {
        className: "card",
        children: [
          _jsxDEV("h3", { style: { margin: '0 0 16px', fontSize: 15, fontWeight: 800 }, children: "Detalle por colegio activo" }, void 0, false),
          colegios.length === 0
            ? _jsxDEV("div", { style: { fontSize: 13, color: 'var(--ink-3)', padding: '20px 0', textAlign: 'center' }, children: "Aún no tienes colegios activos generando comisión." }, void 0, false)
            : _jsxDEV("div", {
                className: "table-wrap",
                children: _jsxDEV("table", {
                  children: [
                    _jsxDEV("thead", {
                      children: _jsxDEV("tr", {
                        children: ['Colegio', '%', 'Cobrado del mes', 'Comisión del mes', 'Comisión acumulada'].map(t => _jsxDEV("th", { children: t }, t, false))
                      }, void 0, true)
                    }, void 0, false),
                    _jsxDEV("tbody", {
                      children: colegios.map(c => _jsxDEV("tr", {
                        children: [
                          _jsxDEV("td", { style: { fontWeight: 700 }, children: c.nombre }, void 0, false),
                          _jsxDEV("td", { children: `${c.comision_pct}%` }, void 0, false),
                          _jsxDEV("td", { children: distFmtMoney(c.cobrado_mes) }, void 0, false),
                          _jsxDEV("td", { style: { color: 'var(--lime)', fontWeight: 700 }, children: distFmtMoney(c.comision_mes) }, void 0, false),
                          _jsxDEV("td", { children: distFmtMoney(c.comision_anio) }, void 0, false),
                        ]
                      }, c.id, true))
                    }, void 0, false),
                  ]
                }, void 0, true)
              }, void 0, false),
        ]
      }, void 0, true),
    ]
  }, void 0, true);
}

/* ── Vista: Materiales de venta (estática, sin backend por ahora) ── */
// ── Vista: Tutoriales en video ──
// Reproduce dentro de la misma página con un iframe de YouTube en modo
// nocookie. Los videos se definen en DIST_TUTORIALES, arriba del archivo.
function DistTutorialesView() {
  const { useState } = React;
  const [activo, setActivo] = useState(null);
  const [q, setQ] = useState('');

  const filtrar = vids => {
    const t = q.trim().toLowerCase();
    if (!t) return vids;
    return vids.filter(v =>
      (v.titulo || '').toLowerCase().includes(t) ||
      (v.desc || '').toLowerCase().includes(t));
  };

  const grupos = DIST_TUTORIALES
    .map(g => ({ categoria: g.categoria, videos: filtrar(g.videos) }))
    .filter(g => g.videos.length > 0);

  const totalVideos = DIST_TUTORIALES.reduce((a, g) => a + g.videos.length, 0);
  const miniatura = v => v.id ? 'https://i.ytimg.com/vi/' + v.id + '/hqdefault.jpg' : null;

  return _jsxDEV("div", {
    children: [
      _jsxDEV("div", {
        style: { fontSize: 13, color: 'var(--ink-3)', marginBottom: 20 },
        children: totalVideos + ' videos para entender la plataforma y vender mejor'
      }, void 0, false),

      _jsxDEV("div", {
        className: "search-bar",
        style: { maxWidth: 380, marginBottom: 26 },
        children: [
          _jsxDEV("span", {
            className: "search-icon",
            children: _jsxDEV(Icon, { name: 'search', size: 15, color: "currentColor" }, void 0, false)
          }, void 0, false),
          _jsxDEV("input", {
            value: q,
            onChange: e => setQ(e.target.value),
            placeholder: "Buscar tutorial\u2026"
          }, void 0, false)
        ]
      }, void 0, true),

      grupos.length === 0
        ? _jsxDEV("div", {
            className: "empty-state",
            children: _jsxDEV("div", { className: "empty-text", children: "No hay tutoriales que coincidan con tu b\u00fasqueda." }, void 0, false)
          }, void 0, false)
        : grupos.map(g => _jsxDEV("div", {
            style: { marginBottom: 30 },
            children: [
              _jsxDEV("div", {
                style: { display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 14 },
                children: [
                  _jsxDEV("h3", {
                    style: { fontSize: 15, fontWeight: 700, margin: 0, letterSpacing: '-.3px' },
                    children: g.categoria
                  }, void 0, false),
                  _jsxDEV("span", {
                    style: { fontSize: 11.5, color: 'var(--ink-4)' },
                    children: g.videos.length + (g.videos.length === 1 ? ' video' : ' videos')
                  }, void 0, false)
                ]
              }, void 0, true),

              _jsxDEV("div", {
                style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 18 },
                children: g.videos.map((v, i) => _jsxDEV("div", {
                  className: "card",
                  style: { padding: 0, overflow: 'hidden', cursor: v.id ? 'pointer' : 'default' },
                  onClick: () => { if (v.id) setActivo(v); },
                  children: [
                    _jsxDEV("div", {
                      style: {
                        position: 'relative', aspectRatio: '16 / 9',
                        background: miniatura(v)
                          ? ('center/cover no-repeat url(' + miniatura(v) + ')')
                          : 'var(--grad-cool)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      },
                      children: [
                        _jsxDEV("div", {
                          style: { position: 'absolute', inset: 0,
                                   background: 'linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.42))' }
                        }, void 0, false),
                        _jsxDEV("div", {
                          style: {
                            position: 'relative', width: 50, height: 50, borderRadius: '50%',
                            background: 'rgba(255,255,255,.94)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 4px 16px rgba(0,0,0,.28)'
                          },
                          children: _jsxDEV("div", {
                            style: {
                              width: 0, height: 0, marginLeft: 4,
                              borderTop: '9px solid transparent',
                              borderBottom: '9px solid transparent',
                              borderLeft: '15px solid var(--violet)'
                            }
                          }, void 0, false)
                        }, void 0, false),
                        v.duracion
                          ? _jsxDEV("span", {
                              style: {
                                position: 'absolute', right: 9, bottom: 9,
                                background: 'rgba(0,0,0,.78)', color: '#fff',
                                fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 5
                              },
                              children: v.duracion
                            }, void 0, false)
                          : null
                      ]
                    }, void 0, true),

                    _jsxDEV("div", {
                      style: { padding: '15px 17px 17px' },
                      children: [
                        _jsxDEV("div", {
                          style: { fontSize: 13.5, fontWeight: 700, marginBottom: 5, lineHeight: 1.35 },
                          children: v.titulo
                        }, void 0, false),
                        _jsxDEV("div", {
                          style: { fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5 },
                          children: v.desc
                        }, void 0, false),
                        !v.id
                          ? _jsxDEV("div", {
                              style: { fontSize: 11, color: 'var(--ink-4)', marginTop: 10, fontStyle: 'italic' },
                              children: "Video por publicar"
                            }, void 0, false)
                          : null
                      ]
                    }, void 0, true)
                  ]
                }, g.categoria + i, true))
              }, void 0, false)
            ]
          }, g.categoria, true)),

      activo
        ? _jsxDEV("div", {
            className: "modal-backdrop",
            onClick: () => setActivo(null),
            children: _jsxDEV("div", {
              className: "modal",
              style: { maxWidth: 880, width: '100%' },
              onClick: e => e.stopPropagation(),
              children: [
                _jsxDEV("div", {
                  className: "modal-header",
                  children: [
                    _jsxDEV("div", { className: "modal-title", children: activo.titulo }, void 0, false),
                    _jsxDEV("button", {
                      className: "btn-ghost",
                      onClick: () => setActivo(null),
                      children: _jsxDEV(Icon, { name: 'close', size: 16, color: "currentColor" }, void 0, false)
                    }, void 0, false)
                  ]
                }, void 0, true),
                _jsxDEV("div", {
                  style: { background: '#000' },
                  children: _jsxDEV("iframe", {
                    src: 'https://www.youtube-nocookie.com/embed/' + activo.id + '?rel=0&autoplay=1',
                    title: activo.titulo,
                    allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture',
                    allowFullScreen: true,
                    style: { width: '100%', aspectRatio: '16 / 9', border: 0, display: 'block' }
                  }, void 0, false)
                }, void 0, false),
                _jsxDEV("div", {
                  className: "modal-body",
                  style: { fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.55 },
                  children: activo.desc
                }, void 0, false)
              ]
            }, void 0, true)
          }, void 0, false)
        : null
    ]
  }, void 0, true);
}

/* ── Vista: Mi perfil (reutiliza la acción compartida editar_usuario) ── */
function DistPerfilView({ user, onUpdated }) {
  const { useState } = React;
  const [nombre, setNombre] = useState(user.nombre || '');
  const [email, setEmail] = useState(user.email || '');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [passwordActual, setPasswordActual] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const guardar = async e => {
    e.preventDefault();
    setError('');
    setOk('');
    if (!nombre.trim() || !email.trim()) return setError('Nombre y correo son obligatorios.');
    if (password && password !== password2) return setError('Las contraseñas no coinciden.');
    if (password && password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.');
    if ((password || email.trim() !== user.email) && !passwordActual) return setError('Ingresa tu contraseña actual para confirmar los cambios.');
    setSaving(true);
    try {
      const payload = { id: user.id, nombre: nombre.trim(), email: email.trim(), password, password2, password_actual: passwordActual };
      const actualizado = await AuthController.editarUsuario(user, payload);
      setOk('Perfil actualizado correctamente.');
      setPassword('');
      setPassword2('');
      setPasswordActual('');
      if (onUpdated) onUpdated(actualizado);
    } catch (e) {
      setError(e.message || 'No se pudo guardar tu perfil');
    } finally {
      setSaving(false);
    }
  };

  return _jsxDEV("div", {
    children: [
      _jsxDEV("h2", { style: { fontSize: 20, margin: '0 0 4px', fontWeight: 800 }, children: "Mi perfil" }, void 0, false),
      _jsxDEV("div", { style: { fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 20 }, children: "Actualiza tus datos de acceso" }, void 0, false),
      _jsxDEV("form", {
        className: "card", style: { maxWidth: 460 }, onSubmit: guardar,
        children: [
          error ? _jsxDEV("div", {
            style: { display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14, padding: '10px 14px', background: 'var(--red-glow)', border: '1px solid var(--red)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--red)' },
            children: error
          }, void 0, false) : null,
          ok ? _jsxDEV("div", {
            style: { display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14, padding: '10px 14px', background: 'var(--green-glow)', border: '1px solid var(--green)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--green)' },
            children: ok
          }, void 0, false) : null,

          _jsxDEV("div", {
            className: "form-group",
            children: [
              _jsxDEV("label", { className: "form-label", children: "Nombre completo" }, void 0, false),
              _jsxDEV("input", { className: "form-input", type: "text", value: nombre, onChange: e => setNombre(e.target.value) }, void 0, false),
            ]
          }, void 0, true),

          _jsxDEV("div", {
            className: "form-group",
            children: [
              _jsxDEV("label", { className: "form-label", children: "Correo electrónico" }, void 0, false),
              _jsxDEV("input", { className: "form-input", type: "email", value: email, onChange: e => setEmail(e.target.value) }, void 0, false),
            ]
          }, void 0, true),

          _jsxDEV("div", {
            className: "form-group",
            children: [
              _jsxDEV("label", { className: "form-label", children: "Nueva contraseña (dejar vacío = mantener)" }, void 0, false),
              _jsxDEV("input", { className: "form-input", type: "password", value: password, onChange: e => setPassword(e.target.value), placeholder: "••••••• (opcional)" }, void 0, false),
            ]
          }, void 0, true),

          _jsxDEV("div", {
            className: "form-group",
            children: [
              _jsxDEV("label", { className: "form-label", children: "Confirmar nueva contraseña" }, void 0, false),
              _jsxDEV("input", { className: "form-input", type: "password", value: password2, onChange: e => setPassword2(e.target.value) }, void 0, false),
            ]
          }, void 0, true),

          _jsxDEV("div", {
            className: "form-group",
            style: { marginBottom: 4 },
            children: [
              _jsxDEV("label", { className: "form-label", children: "Tu contraseña actual (requerida si cambias correo o contraseña)" }, void 0, false),
              _jsxDEV("input", { className: "form-input", type: "password", value: passwordActual, onChange: e => setPasswordActual(e.target.value) }, void 0, false),
            ]
          }, void 0, true),

          _jsxDEV("button", {
            type: "submit", className: "btn btn-primary", disabled: saving, style: { marginTop: 6 },
            children: saving ? 'Guardando…' : 'Guardar cambios'
          }, void 0, false),
        ]
      }, void 0, true),
    ]
  }, void 0, true);
}

/* ── Vista: Datos de pago (cuenta donde recibe sus comisiones) ── */
function DistDatosPagoView() {
  const { useState, useEffect } = React;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [banco, setBanco] = useState('');
  const [clabe, setClabe] = useState('');
  const [titular, setTitular] = useState('');
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState('');

  const cargar = async () => {
    setLoading(true);
    setError('');
    try {
      const token = AuthController.getToken();
      const res = await fetch('api.php?action=distribuidor_datos_pago', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (res.status === 401) { AuthController.logout(); window.location.reload(); return; }
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'No se pudieron cargar tus datos de pago');
      setBanco(json.datos_pago.banco || '');
      setClabe(json.datos_pago.clabe || '');
      setTitular(json.datos_pago.titular || '');
    } catch (e) {
      setError(e.message || 'Error de conexión con el servidor');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const guardar = async e => {
    e.preventDefault();
    setError('');
    setOk('');
    if (clabe && !/^\d{18}$/.test(clabe.trim())) return setError('La CLABE debe tener exactamente 18 dígitos.');
    setSaving(true);
    try {
      const token = AuthController.getToken();
      const res = await fetch('api.php?action=distribuidor_guardar_datos_pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ banco: banco.trim(), clabe: clabe.trim(), titular: titular.trim() })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'No se pudieron guardar tus datos de pago');
      setOk('Datos de pago actualizados.');
    } catch (e) {
      setError(e.message || 'Error de conexión con el servidor');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return _jsxDEV("div", { style: { padding: '40px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }, children: "Cargando…" }, void 0, false);

  return _jsxDEV("div", {
    children: [
      _jsxDEV("h2", { style: { fontSize: 20, margin: '0 0 4px', fontWeight: 800 }, children: "Datos de pago" }, void 0, false),
      _jsxDEV("div", { style: { fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 20 }, children: "Cuenta donde recibirás el pago de tus comisiones" }, void 0, false),
      _jsxDEV("form", {
        className: "card", style: { maxWidth: 460 }, onSubmit: guardar,
        children: [
          error ? _jsxDEV("div", {
            style: { display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14, padding: '10px 14px', background: 'var(--red-glow)', border: '1px solid var(--red)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--red)' },
            children: error
          }, void 0, false) : null,
          ok ? _jsxDEV("div", {
            style: { display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14, padding: '10px 14px', background: 'var(--green-glow)', border: '1px solid var(--green)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--green)' },
            children: ok
          }, void 0, false) : null,

          _jsxDEV("div", {
            className: "form-group",
            children: [
              _jsxDEV("label", { className: "form-label", children: "Banco" }, void 0, false),
              _jsxDEV("input", { className: "form-input", type: "text", value: banco, onChange: e => setBanco(e.target.value), placeholder: "Ej. BBVA" }, void 0, false),
            ]
          }, void 0, true),

          _jsxDEV("div", {
            className: "form-group",
            children: [
              _jsxDEV("label", { className: "form-label", children: "CLABE interbancaria (18 dígitos)" }, void 0, false),
              _jsxDEV("input", {
                className: "form-input", type: "text", value: clabe,
                onChange: e => setClabe(e.target.value.replace(/\D/g, '').slice(0, 18)),
                placeholder: "000000000000000000"
              }, void 0, false),
            ]
          }, void 0, true),

          _jsxDEV("div", {
            className: "form-group",
            style: { marginBottom: 4 },
            children: [
              _jsxDEV("label", { className: "form-label", children: "Titular de la cuenta" }, void 0, false),
              _jsxDEV("input", { className: "form-input", type: "text", value: titular, onChange: e => setTitular(e.target.value) }, void 0, false),
            ]
          }, void 0, true),

          _jsxDEV("button", {
            type: "submit", className: "btn btn-primary", disabled: saving, style: { marginTop: 6 },
            children: saving ? 'Guardando…' : 'Guardar datos de pago'
          }, void 0, false),
        ]
      }, void 0, true),
    ]
  }, void 0, true);
}

// ── Componente principal ── Reutiliza .app/.sidebar/.main/.topbar/.content del shell (assets/js/app.js + main.css) para heredar automáticamente el drawer responsive de ≤768px (botón hamburguesa + .nav-backdrop).
function Distribuidor({ user, onLogout }) {
  // Tema del portal, compartido con el resto de la plataforma vía localStorage
  const [temaOscuro, setTemaOscuro] = React.useState(() => {
    try {
      const g = localStorage.getItem('edupago_theme');
      if (g === 'dark') return true;
      if (g === 'light') return false;
    } catch (e) { /* storage bloqueado */ }
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    } catch (e) { return false; }
  });
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', temaOscuro ? 'dark' : '');
    try { localStorage.setItem('edupago_theme', temaOscuro ? 'dark' : 'light'); } catch (e) {}
  }, [temaOscuro]);
  const { useState, useEffect } = React;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState(null);
  const [seccion, setSeccion] = useState('dashboard');
  const [mobileNav, setMobileNav] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteNombre, setInviteNombre] = useState('');
  const [inviteAlumnos, setInviteAlumnos] = useState('');
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteError, setInviteError] = useState('');

  const cargar = async () => {
    setLoading(true);
    setError('');
    try {
      const token = AuthController.getToken();
      const res = await fetch('api.php?action=distribuidor_datos', {
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
      });
      if (res.status === 401) { AuthController.logout(); window.location.reload(); return; }
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'No se pudo cargar tu información');
      setInfo(json);
    } catch (e) {
      setError(e.message || 'Error de conexión con el servidor');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const enviarInvitacion = async e => {
    e.preventDefault();
    if (!inviteNombre.trim()) { setInviteError('El nombre del colegio es obligatorio'); return; }
    setInviteSaving(true);
    setInviteError('');
    try {
      const token = AuthController.getToken();
      const res = await fetch('api.php?action=distribuidor_invitar_colegio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ nombre_colegio: inviteNombre.trim(), num_alumnos: inviteAlumnos || null })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'No se pudo invitar el colegio');
      setShowInvite(false);
      setInviteNombre('');
      setInviteAlumnos('');
      await cargar();
    } catch (e) {
      setInviteError(e.message || 'Error de conexión con el servidor');
    } finally {
      setInviteSaving(false);
    }
  };

  // ── Estados de carga / error ──────────────────────────────────────────
  if (loading) {
    return _jsxDEV("div", {
      style: { height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)', background: 'var(--bg-main)' },
      children: "Cargando…"
    }, void 0, false);
  }
  if (error) {
    return _jsxDEV("div", {
      style: { height: '100vh', display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)', color: 'var(--ink)' },
      children: [
        _jsxDEV("div", { style: { fontSize: 15, fontWeight: 700 }, children: "No se pudo cargar tu panel" }, void 0, false),
        _jsxDEV("div", { style: { fontSize: 13, color: 'var(--ink-3)' }, children: error }, void 0, false),
        _jsxDEV("button", { className: "btn btn-primary", onClick: cargar, children: "Reintentar" }, void 0, false),
      ]
    }, void 0, true);
  }

  const stats = info.stats || {};
  const colegios = info.colegios || [];
  const embudo = info.embudo || {};
  const totalEmbudo = DIST_ORDEN_EMBUDO.reduce((a, k) => a + (embudo[k] || 0), 0) || 1;
  const zona = (info.distribuidor && info.distribuidor.zona) || 'Sin zona asignada';
  const nombreDist = (info.distribuidor && info.distribuidor.nombre) || user.nombre || 'Distribuidor';
  const iniciales = nombreDist.split(' ').filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('');
  const hoy = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const secciones = ['Principal', 'Configuración'];

  return _jsxDEV("div", {
    className: `app${mobileNav ? ' nav-open' : ''}`,
    children: [

      /* Backdrop del drawer en móvil (≤768px) */
      _jsxDEV("div", { className: "nav-backdrop", onClick: () => setMobileNav(false) }, void 0, false),

      /* ── Sidebar ── */
      _jsxDEV("aside", {
        className: "sidebar",
        children: [
          _jsxDEV("div", {
            className: "sidebar-brand",
            children: _jsxDEV("div", {
              className: "brand-logo",
              children: [
                _jsxDEV("div", { className: "brand-icon", children: "PE" }, void 0, false),
                _jsxDEV("div", {
                  children: [
                    _jsxDEV("div", { className: "brand-name", children: "paga la escuela" }, void 0, false),
                    _jsxDEV("div", { className: "brand-sub", children: "Portal distribuidor" }, void 0, false),
                  ]
                }, void 0, true),
              ]
            }, void 0, true)
          }, void 0, false),

          _jsxDEV("div", {
            style: { padding: '10px 16px 12px', borderBottom: '1px solid var(--side-border)' },
            children: [
              _jsxDEV("div", { style: { fontSize: 10, letterSpacing: '.5px', textTransform: 'uppercase', color: 'var(--side-ink-3)', fontWeight: 700, marginBottom: 3 }, children: "Zona asignada" }, void 0, false),
              _jsxDEV("div", { style: { fontSize: 13, fontWeight: 700, color: 'var(--violet)' }, children: zona }, void 0, false),
            ]
          }, void 0, true),

          _jsxDEV("nav", {
            className: "sidebar-nav",
            children: secciones.map(sec => _jsxDEV("div", {
              children: [
                _jsxDEV("div", { className: "nav-section", children: sec }, void 0, false),
                DIST_NAV_ITEMS.filter(n => n.section === sec).map(n => _jsxDEV("div", {
                  className: `nav-item ${seccion === n.id ? 'active' : ''}`,
                  onClick: () => { setSeccion(n.id); setMobileNav(false); },
                  children: [
                    _jsxDEV("span", { className: "nav-icon",
                      children: _jsxDEV(Icon, { name: n.icon, size: 16, color: "currentColor" }, void 0, false) }, void 0, false),
                    _jsxDEV("span", { children: n.label }, void 0, false),
                    (n.showColegiosBadge && colegios.length > 0)
                      ? _jsxDEV("span", { className: "nav-badge", children: colegios.length }, void 0, false)
                      : null,
                  ]
                }, n.id, true))
              ]
            }, sec, true))
          }, void 0, false),

          _jsxDEV("div", {
            className: "sidebar-footer",
            children: _jsxDEV("div", {
              className: "user-card",
              children: [
                _jsxDEV("div", { className: "avatar", style: { background: 'var(--grad-warm)', color: '#fff' }, children: iniciales || 'D' }, void 0, false),
                _jsxDEV("div", {
                  className: "user-info",
                  children: [
                    _jsxDEV("div", { className: "user-name", children: nombreDist }, void 0, false),
                    _jsxDEV("div", { className: "user-role", children: "Distribuidor certificado" }, void 0, false),
                  ]
                }, void 0, true),
                _jsxDEV("button", {
                  className: "logout-btn", onClick: onLogout, title: "Cerrar sesión",
                  children: _jsxDEV(Icon, { name: "logout", size: 17, color: "currentColor" }, void 0, false)
                }, void 0, false),
              ]
            }, void 0, true)
          }, void 0, false),
        ]
      }, void 0, true),

      /* ── Main ── */
      _jsxDEV("main", {
        className: "main",
        children: [
          _jsxDEV("header", {
            className: "topbar",
            children: [
              _jsxDEV("button", {
                className: "mobile-menu-btn", onClick: () => setMobileNav(v => !v), "aria-label": "Abrir menú",
                children: _jsxDEV(Icon, { name: "menu", size: 20, color: "currentColor" }, void 0, false)
              }, void 0, false),

              _jsxDEV("div", { className: "topbar-title", children: DIST_SECCIONES[seccion].titulo }, void 0, false),

              _jsxDEV("div", {
                className: "topbar-actions",
                children: [
                  _jsxDEV("button", {
                    className: "theme-toggle",
                    title: temaOscuro ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro',
                    onClick: () => setTemaOscuro(v => !v),
                    children: _jsxDEV(Icon, { name: temaOscuro ? 'sun' : 'moon', size: 16, color: "currentColor" }, void 0, false)
                  }, void 0, false),
                  (seccion === 'dashboard' && stats.en_implementacion) ? _jsxDEV("div", {
                    style: {
                      display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700,
                      padding: '7px 13px', borderRadius: 'var(--radius-sm)', background: 'var(--amber-glow)',
                      color: 'var(--amber)', border: '1px solid rgba(217,119,6,.2)'
                    },
                    children: `${stats.en_implementacion} en implementación`
                  }, void 0, false) : null,

                  (seccion === 'dashboard' || seccion === 'colegios') ? _jsxDEV("button", {
                    className: "btn btn-primary", onClick: () => setShowInvite(true),
                    children: "+ Invitar colegio"
                  }, void 0, false) : null,
                ]
              }, void 0, true),
            ]
          }, void 0, true),

          _jsxDEV("div", {
            className: "content",
            children: [

              seccion === 'dashboard' ? _jsxDEV("div", {
                children: [
                  _jsxDEV("div", {
                    style: { marginBottom: 22 },
                    children: [
                      _jsxDEV("h2", { style: { fontSize: 20, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-.3px' }, children: `Buenos días, ${nombreDist.split(' ')[0]}` }, void 0, false),
                      _jsxDEV("p", { style: { fontSize: 13, color: 'var(--ink-3)', marginTop: 3 }, children: `Programa de distribuidores · Zona ${zona} · ${hoy}` }, void 0, false),
                    ]
                  }, void 0, true),

                  _jsxDEV("div", {
                    className: "stats-grid",
                    children: [
                      _jsxDEV(DistStatCard, { icon: _jsxDEV(Icon, { name: 'pay', size: 19, color: 'currentColor' }, void 0, false), destacada: true, label: 'Comisión del mes', value: distFmtMoney(stats.comision_mes), sub: `${stats.colegios_facturando || 0} colegios facturando` }, void 0, false),
                      _jsxDEV(DistStatCard, { icon: _jsxDEV(Icon, { name: 'escuelas', size: 19, color: 'currentColor' }, void 0, false), tint: 'tint-green', label: 'Colegios activos', value: stats.colegios_activos || 0, sub: `de ${stats.colegios_totales || 0} colegios totales` }, void 0, false),
                      _jsxDEV(DistStatCard, { icon: _jsxDEV(Icon, { name: 'bell', size: 19, color: 'currentColor' }, void 0, false), tint: 'tint-amber', label: 'En implementación', value: stats.en_implementacion || 0, sub: 'arrancan en las próximas semanas' }, void 0, false),
                      _jsxDEV(DistStatCard, { icon: _jsxDEV(Icon, { name: 'reportes', size: 19, color: 'currentColor' }, void 0, false), tint: 'tint-cyan', label: `Comisión acumulada ${stats.anio || ''}`, value: distFmtMoney(stats.comision_acumulada), sub: `desde enero ${stats.anio || ''}` }, void 0, false),
                    ]
                  }, void 0, true),

                  _jsxDEV("div", {
                    style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 16 },
                    children: [

                      _jsxDEV("div", {
                        className: "card",
                        children: [
                          _jsxDEV("h3", { style: { margin: '0 0 3px', fontSize: 15, fontWeight: 800 }, children: "Mis colegios" }, void 0, false),
                          _jsxDEV("p", { style: { margin: '0 0 16px', fontSize: 12.5, color: 'var(--ink-3)' }, children: "Estado y comisión de cada colegio que refieres" }, void 0, false),
                          colegios.length === 0
                            ? _jsxDEV("div", { className: "empty-state", children: _jsxDEV("div", { className: "empty-text", children: 'Aún no tienes colegios referidos. Usa "Invitar colegio" para empezar.' }, void 0, false) }, void 0, false)
                            : _jsxDEV("div", {
                                className: "table-wrap",
                                children: _jsxDEV("table", {
                                  children: [
                                    _jsxDEV("thead", {
                                      children: _jsxDEV("tr", {
                                        children: ['Colegio', 'Tamaño', 'Comisión', 'Estado'].map(t => _jsxDEV("th", { children: t }, t, false))
                                      }, void 0, true)
                                    }, void 0, false),
                                    _jsxDEV("tbody", {
                                      children: colegios.map(c => _jsxDEV("tr", {
                                        children: [
                                          _jsxDEV("td", { style: { fontWeight: 700 }, children: c.nombre }, void 0, false),
                                          _jsxDEV("td", { children: c.num_alumnos ? `${c.num_alumnos} alumnos` : '—' }, void 0, false),
                                          _jsxDEV("td", { children: c.estado === 'activo' ? `${c.comision_pct}%` : '—' }, void 0, false),
                                          _jsxDEV("td", { children: _jsxDEV(DistBadge, { estado: c.estado }, void 0, false) }, void 0, false),
                                        ]
                                      }, c.id, true))
                                    }, void 0, false),
                                  ]
                                }, void 0, true)
                              }, void 0, false),
                        ]
                      }, void 0, true),

                      _jsxDEV("div", {
                        className: "card",
                        children: [
                          _jsxDEV("h3", { style: { margin: '0 0 3px', fontSize: 15, fontWeight: 800 }, children: "Embudo de referidos" }, void 0, false),
                          _jsxDEV("p", { style: { margin: '0 0 16px', fontSize: 12.5, color: 'var(--ink-3)' }, children: `Tus ${stats.colegios_totales || 0} colegios, por etapa` }, void 0, false),
                          ...DIST_ORDEN_EMBUDO.map(k => {
                            const cfg = DIST_ESTADOS[k];
                            const count = embudo[k] || 0;
                            const pct = Math.round((count / totalEmbudo) * 100);
                            return _jsxDEV("div", {
                              style: { marginBottom: 16 },
                              children: [
                                _jsxDEV("div", {
                                  style: { display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginBottom: 6 },
                                  children: [
                                    _jsxDEV("span", {
                                      style: { color: cfg.barColor, display: 'inline-flex', alignItems: 'center', gap: 5 },
                                      children: [
                                        _jsxDEV(Icon, { name: cfg.icon, size: 12, color: 'currentColor' }, void 0, false),
                                        cfg.label
                                      ]
                                    }, void 0, true),
                                    _jsxDEV("span", { children: `${pct}%` }, void 0, false),
                                  ]
                                }, void 0, true),
                                _jsxDEV("div", {
                                  className: "progress-bar",
                                  children: _jsxDEV("div", { className: "progress-fill", style: { width: `${pct}%`, background: cfg.barColor } }, void 0, false)
                                }, void 0, false),
                                _jsxDEV("div", { style: { fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 }, children: `${count} colegio${count === 1 ? '' : 's'}` }, void 0, false),
                              ]
                            }, k, true);
                          }),
                        ]
                      }, void 0, true),

                    ]
                  }, void 0, true),
                ]
              }, void 0, true) : null,

              seccion === 'colegios' ? _jsxDEV(DistColegiosView, { colegios: colegios }, void 0, false) : null,
              seccion === 'comisiones' ? _jsxDEV(DistComisionesView, {}, void 0, false) : null,
              seccion === 'materiales' ? _jsxDEV(DistTutorialesView, {}, void 0, false) : null,
              seccion === 'perfil' ? _jsxDEV(DistPerfilView, { user: user, onUpdated: cargar }, void 0, false) : null,
              seccion === 'pago' ? _jsxDEV(DistDatosPagoView, {}, void 0, false) : null,

            ]
          }, void 0, true),
        ]
      }, void 0, true),

      showInvite ? _jsxDEV(DistInviteModal, {
        onClose: () => { setShowInvite(false); setInviteError(''); },
        onSubmit: enviarInvitacion,
        nombre: inviteNombre, setNombre: setInviteNombre,
        alumnos: inviteAlumnos, setAlumnos: setInviteAlumnos,
        saving: inviteSaving, error: inviteError,
      }, void 0, false) : null,

    ]
  }, void 0, true);
}

window.Distribuidor = Distribuidor;
