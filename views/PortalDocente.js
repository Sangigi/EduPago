// views/PortalDocente.js — Panel del rol 'docente' (13-nov-2026)
//
// Panel autónomo, mismo patrón que Promotor.js / Tesoreria.js: NO usa
// cargar_datos (que traería saldos y cobros de toda la escuela; además el rol
// está fuera de esa acción en el allowlist de api.php). Reusa ControlEscolar
// con las tres secciones que le tocan a un docente; el servidor responde
// puede_gestionar:false y esa vista esconde todo lo administrativo.
//
// `var` y React.createElement directo por la misma razón que Promotor.js.

var _hPD = React.createElement;

var PD_SECCIONES = [
  { id: 'grupos', label: 'Mis grupos', icon: 'alumnos' },
  { id: 'asistencias', label: 'Pasar lista', icon: 'check' },
  { id: 'calificaciones', label: 'Calificaciones', icon: 'reportes' },
  // [OF-7c] Sus citas (solo las suyas, en lectura): views/Agenda.js.
  { id: 'agenda', label: 'Agenda', icon: 'calendar' }
];

function PortalDocente({ user, onLogout, menuPerfil }) {
  var st = React.useState(function () {
    try { return localStorage.getItem('pd_seccion') || 'grupos'; } catch (e) { return 'grupos'; }
  });
  var seccion = st[0], setSeccionRaw = st[1];
  var setSeccion = function (s) {
    setSeccionRaw(s);
    try { localStorage.setItem('pd_seccion', s); } catch (e) { /* sin almacenamiento: no pasa nada */ }
  };

  // Mismo contenedor con scroll propio que Promotor.js: html/body están en
  // overflow:hidden y #root tiene altura fija.
  return _hPD('div', { style: { height: '100vh', maxHeight: '100dvh', overflowY: 'auto', overflowX: 'hidden', background: 'var(--bg-main)' } },
    _hPD('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '12px 20px', borderBottom: '1px solid var(--border-glow)',
        background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 50
      }
    },
      _hPD('div', { style: { fontWeight: 800, fontSize: 16, color: 'var(--ink)', marginRight: 8 } }, 'Control escolar'),
      _hPD('div', { className: 'pill-group', style: { flex: '1 1 auto' } },
        PD_SECCIONES.map(function (s) {
          return _hPD('button', {
            key: s.id, className: 'pill' + (seccion === s.id ? ' active' : ''),
            style: { display: 'inline-flex', alignItems: 'center', gap: 6 },
            onClick: function () { setSeccion(s.id); }
          }, _hPD(Icon, { name: s.icon, size: 14, color: 'currentColor' }), s.label);
        })
      ),
      _hPD('div', { style: { marginLeft: 'auto', flexShrink: 0 } },
        menuPerfil || _hPD('button', { className: 'btn btn-ghost btn-sm', onClick: onLogout }, 'Cerrar sesión'))
    ),
    _hPD('div', { style: { padding: 20, maxWidth: 1200, margin: '0 auto' } },
      seccion === 'agenda'
        ? (typeof Agenda !== 'undefined' ? _hPD(Agenda, { user: user }) : _hPD('div', { className: 'card' }, 'No se pudo cargar la agenda. Recarga la página.'))
        : (typeof ControlEscolar !== 'undefined'
          ? _hPD(ControlEscolar, { escuela_id: user.escuela_id, user: user, seccion: seccion })
          : _hPD('div', { className: 'card' }, 'No se pudo cargar el módulo escolar. Recarga la página.'))
    )
  );
}
