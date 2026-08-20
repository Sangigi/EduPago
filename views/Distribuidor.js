var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};
/* views/Distribuidor.jsx — Portal del rol "distribuidor" (programa de referidos)
   Migrado al patrón _jsxDEV + clases CSS compartidas (mismo patrón que Dashboard.js/Usuarios.js),
   reutilizando .sidebar/.app/.main/.topbar/.content del shell principal (assets/js/app.js) para
   heredar el drawer responsive de ≤768px sin duplicar layout propio.
   Trae su propia data vía action=distribuidor_datos / distribuidor_invitar_colegio /
   distribuidor_comisiones / distribuidor_datos_pago / distribuidor_guardar_datos_pago.
   La edición de perfil reutiliza AuthController.editarUsuario (acción compartida editar_usuario). */

const DIST_ESTADOS = {
  activo:         { label: 'Activo',         icon: '✓',  badge: 'badge-green',  barColor: 'var(--green)' },
  implementacion: { label: 'Implementación', icon: '⚙',  badge: 'badge-amber',  barColor: 'var(--amber)' },
  demo_agendada:  { label: 'Demo agendada',  icon: '📅', badge: 'badge-blue',   barColor: 'var(--accent)' },
  prospecto:      { label: 'Prospecto',      icon: '👤', badge: 'badge-purple', barColor: 'var(--purple)' },
};
const DIST_ORDEN_EMBUDO = ['activo', 'implementacion', 'demo_agendada', 'prospecto'];

const DIST_SECCIONES = {
  dashboard:  { titulo: '📊 Dashboard' },
  colegios:   { titulo: '🏫 Mis colegios' },
  comisiones: { titulo: '💰 Comisiones' },
  materiales: { titulo: '📦 Materiales de venta' },
  perfil:     { titulo: '👤 Mi perfil' },
  pago:       { titulo: '💳 Datos de pago' },
};

const DIST_NAV_ITEMS = [
  { id: 'dashboard',  label: '📊 Dashboard',           section: 'Principal' },
  { id: 'colegios',   label: '🏫 Mis colegios',        section: 'Principal', showColegiosBadge: true },
  { id: 'comisiones', label: '💰 Comisiones',          section: 'Principal' },
  { id: 'materiales', label: '📦 Materiales de venta',  section: 'Principal' },
  { id: 'perfil',     label: '👤 Mi perfil',           section: 'Configuración' },
  { id: 'pago',       label: '💳 Datos de pago',       section: 'Configuración' },
];

const DIST_MATERIALES = [
  { titulo: 'Brochure de ventas', icon: '📄', desc: 'Presentación en PDF para mostrar a directores y administradores del colegio.' },
  { titulo: 'Guion de llamada', icon: '📞', desc: 'Script sugerido para tu primera llamada de prospección con un colegio nuevo.' },
  { titulo: 'Video demo del sistema', icon: '🎬', desc: 'Grabación corta mostrando el flujo de cobro y el portal familiar en vivo.' },
  { titulo: 'Logo y assets de marca', icon: '🎨', desc: 'Logotipos e imágenes oficiales para incluir en tus propias propuestas.' },
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
    children: `${cfg.icon} ${cfg.label}`
  }, void 0, false);
}

/* ── Stat card reutilizando .stat-card/.stat-icon/.stat-label/.stat-value/.stat-meta ── */
function DistStatCard({ icon, iconBg, iconColor, label, value, valueColor, sub }) {
  return _jsxDEV("div", {
    className: "stat-card",
    children: [
      _jsxDEV("div", { className: "stat-icon", style: { background: iconBg, color: iconColor }, children: icon }, void 0, false),
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

  return _jsxDEV("div", {
    children: [
      _jsxDEV("h2", { style: { fontSize: 20, margin: '0 0 4px', fontWeight: 800 }, children: "Comisiones" }, void 0, false),
      _jsxDEV("div", { style: { fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 20 }, children: "Historial de los últimos 12 meses y detalle por colegio" }, void 0, false),

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
function DistMaterialesView() {
  return _jsxDEV("div", {
    children: [
      _jsxDEV("h2", { style: { fontSize: 20, margin: '0 0 4px', fontWeight: 800 }, children: "Materiales de venta" }, void 0, false),
      _jsxDEV("div", { style: { fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 20 }, children: "Recursos para apoyar tu proceso de referidos" }, void 0, false),
      _jsxDEV("div", {
        style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 16 },
        children: DIST_MATERIALES.map((m, i) => _jsxDEV("div", {
          className: "card",
          children: [
            _jsxDEV("div", { style: { fontSize: 22, marginBottom: 10 }, children: m.icon }, void 0, false),
            _jsxDEV("div", { style: { fontSize: 14, fontWeight: 800, marginBottom: 5 }, children: m.titulo }, void 0, false),
            _jsxDEV("div", { style: { fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5, marginBottom: 14 }, children: m.desc }, void 0, false),
            _jsxDEV("div", { style: { fontSize: 11.5, color: 'var(--ink-4)', fontStyle: 'italic' }, children: "Solicítalo a tu coordinador de zona" }, void 0, false),
          ]
        }, i, true))
      }, void 0, false),
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

/* ── Componente principal ──
   Reutiliza .app/.sidebar/.main/.topbar/.content del shell (assets/js/app.js + main.css) para
   heredar automáticamente el drawer responsive de ≤768px (botón hamburguesa + .nav-backdrop). */
function Distribuidor({ user, onLogout }) {
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
              _jsxDEV("div", { style: { fontSize: 13, fontWeight: 700, color: 'var(--lime)' }, children: zona }, void 0, false),
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
                _jsxDEV("div", { className: "avatar", style: { background: 'var(--lime)', color: 'var(--navy)' }, children: iniciales || 'D' }, void 0, false),
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
                  (seccion === 'dashboard' && stats.en_implementacion) ? _jsxDEV("div", {
                    style: {
                      display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700,
                      padding: '7px 13px', borderRadius: 'var(--radius-sm)', background: 'var(--amber-glow)',
                      color: 'var(--amber)', border: '1px solid rgba(217,119,6,.2)'
                    },
                    children: `🏫 ${stats.en_implementacion} en implementación`
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
                      _jsxDEV("p", { style: { fontSize: 13, color: 'var(--ink-3)', marginTop: 3 }, children: `🏠 Programa de distribuidores · Zona ${zona} · ${hoy}` }, void 0, false),
                    ]
                  }, void 0, true),

                  _jsxDEV("div", {
                    className: "stats-grid",
                    children: [
                      _jsxDEV(DistStatCard, { icon: '💰', iconBg: 'var(--lime-glow)', iconColor: 'var(--lime)', label: 'Comisión del mes', value: distFmtMoney(stats.comision_mes), valueColor: 'var(--lime)', sub: `${stats.colegios_facturando || 0} colegios facturando` }, void 0, false),
                      _jsxDEV(DistStatCard, { icon: '🏫', iconBg: 'var(--green-glow)', iconColor: 'var(--green)', label: 'Colegios activos', value: stats.colegios_activos || 0, valueColor: 'var(--green)', sub: `de ${stats.colegios_totales || 0} colegios totales` }, void 0, false),
                      _jsxDEV(DistStatCard, { icon: '🔔', iconBg: 'var(--amber-glow)', iconColor: 'var(--amber)', label: 'En implementación', value: stats.en_implementacion || 0, valueColor: 'var(--amber)', sub: 'arrancan en las próximas semanas' }, void 0, false),
                      _jsxDEV(DistStatCard, { icon: '📄', iconBg: 'var(--glass-light)', iconColor: 'var(--ink-2)', label: `Comisión acumulada ${stats.anio || ''}`, value: distFmtMoney(stats.comision_acumulada), sub: `desde enero ${stats.anio || ''}` }, void 0, false),
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
                                    _jsxDEV("span", { style: { color: cfg.barColor }, children: `${cfg.icon} ${cfg.label}` }, void 0, false),
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
              seccion === 'materiales' ? _jsxDEV(DistMaterialesView, {}, void 0, false) : null,
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
