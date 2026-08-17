/* views/Distribuidor.jsx — Portal del rol "distribuidor" (programa de referidos)
   Escrito con React.createElement directo (sin pipeline de compilación),
   igual que el resto del proyecto. Trae su propia data vía
   action=distribuidor_datos / distribuidor_invitar_colegio. */
const h = React.createElement;

const DIST_ESTADOS = {
  activo:          { label: 'Activo',          icon: '✓', color: 'var(--green)',  glow: 'var(--green-glow)' },
  implementacion:  { label: 'Implementación',  icon: '⚙', color: 'var(--amber)',  glow: 'var(--amber-glow)' },
  demo_agendada:   { label: 'Demo agendada',   icon: '📅', color: '#7fa8ff',       glow: 'rgba(90,140,255,.12)' },
  prospecto:       { label: 'Prospecto',       icon: '👤', color: 'var(--purple)', glow: 'var(--purple-glow)' },
};
const DIST_ORDEN_EMBUDO = ['activo', 'implementacion', 'demo_agendada', 'prospecto'];

function distFmtMoney(n) {
  const v = Number(n) || 0;
  return '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function DistBadge({ estado }) {
  const cfg = DIST_ESTADOS[estado] || DIST_ESTADOS.prospecto;
  return h('span', {
    style: {
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 20,
      background: cfg.glow, color: cfg.color,
    }
  }, cfg.icon + ' ' + cfg.label);
}

function DistStatCard({ icon, iconBg, iconColor, label, value, valueColor, sub }) {
  return h('div', {
    style: { background: 'var(--bg-surface)', border: '1px solid var(--border-glow)', borderRadius: 'var(--radius-lg)', padding: '16px 18px' }
  }, [
    h('div', { key: 'i', style: { width: 26, height: 26, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, marginBottom: 10, background: iconBg, color: iconColor } }, icon),
    h('div', { key: 'l', style: { fontSize: 11, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--ink-4)', fontWeight: 700 } }, label),
    h('div', { key: 'v', style: { fontSize: 24, fontWeight: 800, margin: '6px 0 3px', color: valueColor || 'var(--ink)' } }, value),
    h('div', { key: 's', style: { fontSize: 12, color: 'var(--ink-3)' } }, sub),
  ]);
}

function DistInviteModal({ onClose, onSubmit, nombre, setNombre, alumnos, setAlumnos, saving, error }) {
  return h('div', {
    style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
    onClick: onClose,
  }, h('form', {
    onClick: e => e.stopPropagation(),
    onSubmit: onSubmit,
    style: { background: 'var(--bg-surface)', border: '1px solid var(--border-glow)', borderRadius: 'var(--radius-lg)', padding: 24, width: 380, maxWidth: '90vw' }
  }, [
    h('h3', { key: 't', style: { margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: 'var(--ink)' } }, 'Invitar colegio'),
    h('p', { key: 'st', style: { margin: '0 0 18px', fontSize: 12.5, color: 'var(--ink-3)' } }, 'Se agrega como prospecto a tu embudo de referidos.'),
    h('label', { key: 'l1', style: { fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', display: 'block', marginBottom: 5 } }, 'Nombre del colegio'),
    h('input', {
      key: 'in1', type: 'text', value: nombre, onChange: e => setNombre(e.target.value),
      placeholder: 'Ej. Colegio Vista Hermosa', autoFocus: true,
      style: { width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-glow)', background: 'var(--bg-surface-2)', color: 'var(--ink)', fontSize: 13.5, marginBottom: 14 }
    }),
    h('label', { key: 'l2', style: { fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', display: 'block', marginBottom: 5 } }, 'Número de alumnos (aprox.)'),
    h('input', {
      key: 'in2', type: 'number', min: 0, value: alumnos, onChange: e => setAlumnos(e.target.value),
      placeholder: 'Opcional',
      style: { width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-glow)', background: 'var(--bg-surface-2)', color: 'var(--ink)', fontSize: 13.5, marginBottom: error ? 8 : 18 }
    }),
    error ? h('div', { key: 'err', style: { color: 'var(--red)', fontSize: 12.5, marginBottom: 10 } }, error) : null,
    h('div', { key: 'actions', style: { display: 'flex', gap: 10, justifyContent: 'flex-end' } }, [
      h('button', {
        key: 'cancel', type: 'button', onClick: onClose,
        style: { background: 'transparent', border: '1px solid var(--border-glow)', color: 'var(--ink-2)', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }
      }, 'Cancelar'),
      h('button', {
        key: 'submit', type: 'submit', disabled: saving,
        style: { background: 'var(--lime)', color: 'var(--navy)', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 800, cursor: saving ? 'default' : 'pointer', opacity: saving ? .7 : 1 }
      }, saving ? 'Enviando…' : 'Invitar'),
    ]),
  ]));
}

function Distribuidor({ user, onLogout }) {
  const { useState, useEffect } = React;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState(null);
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
    return h('div', {
      style: { height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)', background: 'var(--bg-main)' }
    }, 'Cargando…');
  }
  if (error) {
    return h('div', {
      style: { height: '100vh', display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)', color: 'var(--ink)' }
    }, [
      h('div', { key: 'e', style: { fontSize: 15, fontWeight: 700 } }, 'No se pudo cargar tu panel'),
      h('div', { key: 'm', style: { fontSize: 13, color: 'var(--ink-3)' } }, error),
      h('button', {
        key: 'r', onClick: cargar,
        style: { background: 'var(--lime)', color: 'var(--navy)', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 700, cursor: 'pointer' }
      }, 'Reintentar'),
    ]);
  }

  const stats = info.stats || {};
  const colegios = info.colegios || [];
  const embudo = info.embudo || {};
  const totalEmbudo = DIST_ORDEN_EMBUDO.reduce((a, k) => a + (embudo[k] || 0), 0) || 1;
  const zona = (info.distribuidor && info.distribuidor.zona) || 'Sin zona asignada';
  const nombreDist = (info.distribuidor && info.distribuidor.nombre) || user.nombre || 'Distribuidor';
  const iniciales = nombreDist.split(' ').filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('');
  const hoy = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return h('div', { style: { display: 'flex', minHeight: '100vh', background: 'var(--bg-main)', color: 'var(--ink)', fontFamily: 'var(--font)' } }, [

    // ── Sidebar ──────────────────────────────────────────────────────
    h('aside', {
      key: 'sidebar',
      style: { width: 'var(--sidebar-w, 256px)', background: 'var(--side-bg)', borderRight: '1px solid var(--side-border)', display: 'flex', flexDirection: 'column', padding: '20px 14px' }
    }, [
      h('div', { key: 'logo', style: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px 22px' } }, [
        h('div', { key: 'b', style: { width: 34, height: 34, borderRadius: 9, background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--lime)', fontSize: 14 } }, 'PE'),
        h('div', { key: 't', style: { fontWeight: 800, fontSize: 14, lineHeight: 1.15, color: 'var(--side-ink)' } }, ['paga la ', h('span', { key: 's', style: { display: 'block', color: 'var(--lime)' } }, 'escuela')]),
      ]),
      h('div', { key: 'zona', style: { background: 'rgba(189,207,0,.06)', border: '1px solid var(--side-border)', borderRadius: 'var(--radius)', padding: '10px 12px', marginBottom: 18 } }, [
        h('div', { key: 'zl', style: { fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--side-ink-3)', fontWeight: 700 } }, 'Zona asignada'),
        h('div', { key: 'zv', style: { color: 'var(--lime)', fontWeight: 700, fontSize: 13, marginTop: 3 } }, zona),
      ]),
      h('div', { key: 'sec1', style: { fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--side-ink-3)', fontWeight: 700, margin: '14px 8px 6px' } }, 'Principal'),
      h('div', { key: 'n1', style: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, fontSize: 13.5, color: 'var(--side-ink)', fontWeight: 600, background: 'var(--side-active-bg)', boxShadow: 'inset 3px 0 0 var(--lime)' } }, '📊 Dashboard'),
      h('div', { key: 'n2', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 10px', borderRadius: 8, fontSize: 13.5, color: 'var(--side-ink-2)', fontWeight: 600 } }, [
        h('span', { key: 'l' }, '🏫 Mis colegios'),
        colegios.length ? h('span', { key: 'b', style: { background: 'var(--red)', color: '#fff', fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 20 } }, colegios.length) : null,
      ]),
      h('div', { key: 'n3', style: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, fontSize: 13.5, color: 'var(--side-ink-2)', fontWeight: 600 } }, '💰 Comisiones'),
      h('div', { key: 'sec2', style: { fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--side-ink-3)', fontWeight: 700, margin: '14px 8px 6px' } }, 'Cuenta'),
      h('div', {
        key: 'logout', onClick: onLogout, style: { cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, fontSize: 13.5, color: 'var(--side-ink-2)', fontWeight: 600 }
      }, '🚪 Cerrar sesión'),
      h('div', { key: 'footer', style: { marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 8px', borderTop: '1px solid var(--side-border)' } }, [
        h('div', { key: 'av', style: { width: 34, height: 34, borderRadius: 9, background: 'var(--lime)', color: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 } }, iniciales || 'D'),
        h('div', { key: 'who' }, [
          h('div', { key: 'n', style: { fontSize: 13, fontWeight: 700, color: 'var(--side-ink)' } }, nombreDist),
          h('div', { key: 'r', style: { fontSize: 11.5, color: 'var(--lime)' } }, 'Distribuidor certificado'),
        ]),
      ]),
    ]),

    // ── Main ─────────────────────────────────────────────────────────
    h('div', { key: 'main', style: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 } }, [
      h('div', { key: 'topbar', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 28px', borderBottom: '1px solid var(--border-glow)' } }, [
        h('h1', { key: 'h1', style: { fontSize: 15, margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 } }, '🎓 Dashboard'),
        h('div', { key: 'actions', style: { display: 'flex', gap: 10 } }, [
          stats.en_implementacion ? h('div', {
            key: 'pill', style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, padding: '7px 13px', borderRadius: 20, background: 'var(--amber-glow)', color: 'var(--amber)', border: '1px solid rgba(251,191,36,.3)' }
          }, `🏫 ${stats.en_implementacion} en implementación`) : null,
          h('button', {
            key: 'btn', onClick: () => setShowInvite(true),
            style: { background: 'var(--lime)', color: 'var(--navy)', border: 'none', fontWeight: 800, padding: '9px 16px', borderRadius: 9, fontSize: 13, cursor: 'pointer' }
          }, '+ Invitar colegio'),
        ]),
      ]),

      h('div', { key: 'content', style: { padding: '26px 28px 60px' } }, [
        h('div', { key: 'greet' }, [
          h('h2', { key: 'g1', style: { fontSize: 22, margin: '0 0 4px', fontWeight: 800 } }, `Buenos días, ${nombreDist.split(' ')[0]}`),
          h('div', { key: 'g2', style: { fontSize: 12.5, color: 'var(--ink-3)' } }, `🏠 Programa de distribuidores · Zona ${zona} · ${hoy}`),
        ]),

        h('div', { key: 'stats', style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, margin: '22px 0' } }, [
          h(DistStatCard, { key: 's1', icon: '💰', iconBg: 'var(--lime-glow)', iconColor: 'var(--lime)', label: 'Comisión del mes', value: distFmtMoney(stats.comision_mes), valueColor: 'var(--lime)', sub: `${stats.colegios_facturando || 0} colegios facturando` }),
          h(DistStatCard, { key: 's2', icon: '🏫', iconBg: 'var(--green-glow)', iconColor: 'var(--green)', label: 'Colegios activos', value: stats.colegios_activos || 0, valueColor: 'var(--green)', sub: `de ${stats.colegios_totales || 0} colegios totales` }),
          h(DistStatCard, { key: 's3', icon: '🔔', iconBg: 'var(--amber-glow)', iconColor: 'var(--amber)', label: 'En implementación', value: stats.en_implementacion || 0, valueColor: 'var(--amber)', sub: 'arrancan en las próximas semanas' }),
          h(DistStatCard, { key: 's4', icon: '📄', iconBg: 'rgba(255,255,255,.06)', iconColor: 'var(--ink-2)', label: `Comisión acumulada ${stats.anio || ''}`, value: distFmtMoney(stats.comision_acumulada), sub: `desde enero ${stats.anio || ''}` }),
        ]),

        h('div', { key: 'grid2', style: { display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 16 } }, [

          h('div', { key: 'panel1', style: { background: 'var(--bg-surface)', border: '1px solid var(--border-glow)', borderRadius: 'var(--radius-lg)', padding: 20 } }, [
            h('h3', { key: 't', style: { margin: '0 0 3px', fontSize: 15, fontWeight: 800 } }, 'Mis colegios'),
            h('p', { key: 'st', style: { margin: '0 0 16px', fontSize: 12.5, color: 'var(--ink-3)' } }, 'Estado y comisión de cada colegio que refieres'),
            colegios.length === 0
              ? h('div', { key: 'empty', style: { fontSize: 13, color: 'var(--ink-3)', padding: '20px 0', textAlign: 'center' } }, 'Aún no tienes colegios referidos. Usa "Invitar colegio" para empezar.')
              : h('table', { key: 'table', style: { width: '100%', borderCollapse: 'collapse' } }, [
                  h('thead', { key: 'thead' }, h('tr', {}, [
                    h('th', { key: 'c', style: { textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-4)', fontWeight: 700, padding: '6px 8px', borderBottom: '1px solid var(--border-glow)' } }, 'Colegio'),
                    h('th', { key: 't', style: { textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-4)', fontWeight: 700, padding: '6px 8px', borderBottom: '1px solid var(--border-glow)' } }, 'Tamaño'),
                    h('th', { key: 'co', style: { textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-4)', fontWeight: 700, padding: '6px 8px', borderBottom: '1px solid var(--border-glow)' } }, 'Comisión'),
                    h('th', { key: 'e', style: { textAlign: 'left', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-4)', fontWeight: 700, padding: '6px 8px', borderBottom: '1px solid var(--border-glow)' } }, 'Estado'),
                  ])),
                  h('tbody', { key: 'tbody' }, colegios.map(c => h('tr', { key: c.id }, [
                    h('td', { key: 'n', style: { padding: '12px 8px', fontSize: 13, borderBottom: '1px solid var(--border-glow)', fontWeight: 700 } }, c.nombre),
                    h('td', { key: 't', style: { padding: '12px 8px', fontSize: 13, borderBottom: '1px solid var(--border-glow)', color: 'var(--ink-3)' } }, c.num_alumnos ? `${c.num_alumnos} alumnos` : '—'),
                    h('td', { key: 'c', style: { padding: '12px 8px', fontSize: 13, borderBottom: '1px solid var(--border-glow)', color: c.estado === 'activo' ? 'var(--ink)' : 'var(--ink-3)' } }, c.estado === 'activo' ? `${c.comision_pct}%` : '—'),
                    h('td', { key: 'e', style: { padding: '12px 8px', borderBottom: '1px solid var(--border-glow)' } }, h(DistBadge, { estado: c.estado })),
                  ]))),
                ]),
          ]),

          h('div', { key: 'panel2', style: { background: 'var(--bg-surface)', border: '1px solid var(--border-glow)', borderRadius: 'var(--radius-lg)', padding: 20 } }, [
            h('h3', { key: 't', style: { margin: '0 0 3px', fontSize: 15, fontWeight: 800 } }, 'Embudo de referidos'),
            h('p', { key: 'st', style: { margin: '0 0 16px', fontSize: 12.5, color: 'var(--ink-3)' } }, `Tus ${stats.colegios_totales || 0} colegios, por etapa`),
            ...DIST_ORDEN_EMBUDO.map(k => {
              const cfg = DIST_ESTADOS[k];
              const count = embudo[k] || 0;
              const pct = Math.round((count / totalEmbudo) * 100);
              return h('div', { key: k, style: { marginBottom: 16 } }, [
                h('div', { key: 'top', style: { display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginBottom: 6 } }, [
                  h('span', { key: 'l', style: { color: cfg.color } }, `${cfg.icon} ${cfg.label}`),
                  h('span', { key: 'p' }, `${pct}%`),
                ]),
                h('div', { key: 'bar-bg', style: { height: 7, background: 'rgba(255,255,255,.06)', borderRadius: 20, overflow: 'hidden' } },
                  h('div', { style: { height: '100%', borderRadius: 20, width: `${pct}%`, background: cfg.color } })
                ),
                h('div', { key: 'count', style: { fontSize: 11.5, color: 'var(--ink-3)', marginTop: 4 } }, `${count} colegio${count === 1 ? '' : 's'}`),
              ]);
            }),
          ]),
        ]),
      ]),
    ]),

    showInvite ? h(DistInviteModal, {
      key: 'modal',
      onClose: () => { setShowInvite(false); setInviteError(''); },
      onSubmit: enviarInvitacion,
      nombre: inviteNombre, setNombre: setInviteNombre,
      alumnos: inviteAlumnos, setAlumnos: setInviteAlumnos,
      saving: inviteSaving, error: inviteError,
    }) : null,
  ]);
}
