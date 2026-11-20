// views/components/CitasFamilia.js — [OF-7c] Pestaña "Citas" del portal de familia.
//
// SOLO LECTURA: las citas del colegio ligadas a SU familia (admisión, entrevistas, reuniones) de hoy
// a los próximos 90 días. El servidor (acciones/agenda_listar.php) le manda únicamente las de su
// familia y sin las notas internas. No se puede agendar ni cancelar desde aquí: para cambiarla, la
// familia se comunica con el colegio (el aviso por correo que manda el colegio lo dice).
//
// Props: { escuela }. `var` y React.createElement directo, sin compilación.

var _hCF = React.createElement;

function CitasFamilia(props) {
  var R = React;
  var s1 = R.useState(null), citas = s1[0], setCitas = s1[1];
  var s2 = R.useState(''), error = s2[0], setError = s2[1];

  R.useEffect(function () {
    var vivo = true;
    var hoy = new Date();
    var fin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 90);
    var ymd = function (d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
    ApiClient.post('agenda_listar', { desde: ymd(hoy), hasta: ymd(fin) }).then(function (r) {
      if (!vivo) return;
      if (!r || !r.success) { setError((r && r.error) || 'No se pudieron cargar tus citas.'); setCitas([]); return; }
      setCitas(r.citas || []);
    }).catch(function (e) { if (!vivo) return; setError(e.message || 'No se pudieron cargar tus citas.'); setCitas([]); });
    return function () { vivo = false; };
  }, []);

  var dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var tipos = { admision: 'Admisión', padres: 'Entrevista con padres', reunion: 'Reunión', otro: 'Cita' };
  var cuando = function (c) {
    var m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(String(c.inicio)); var f = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(String(c.fin));
    if (!m) return c.inicio;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return dias[d.getDay()] + ' ' + d.getDate() + ' de ' + meses[d.getMonth()] + ' · ' + m[4] + ':' + m[5] + (f ? ' a ' + f[4] + ':' + f[5] : '');
  };

  if (citas === null) return _hCF('div', { style: { padding: 24, color: 'var(--ink-3)', fontSize: 13 } }, 'Cargando tus citas…');
  var vivas = citas.filter(function (c) { return c.estado !== 'cancelada'; });
  return _hCF('div', null,
    _hCF('div', { style: { fontSize: 13, color: 'var(--ink-3)', marginBottom: 14 } }, 'Tus citas con el colegio en los próximos 90 días. Si necesitas cambiar una, comunícate con el colegio.'),
    error ? _hCF('div', { style: { color: 'var(--red)', fontSize: 13, marginBottom: 10 } }, error) : null,
    !error && vivas.length === 0 ? _hCF('div', { style: { padding: '28px 12px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 } }, 'No tienes citas programadas.') : null,
    vivas.map(function (c) {
      return _hCF('div', { key: c.id, style: { padding: '12px 14px', marginBottom: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-glow)', background: 'var(--bg-surface)' } },
        _hCF('div', { style: { fontSize: 14, fontWeight: 700, color: 'var(--ink)' } }, c.titulo),
        _hCF('div', { style: { fontSize: 12.5, color: 'var(--ink-2)', marginTop: 2 } }, (tipos[c.tipo] || 'Cita') + ' · ' + cuando(c)),
        c.lugar ? _hCF('div', { style: { fontSize: 12.5, color: 'var(--ink-3)' } }, 'Lugar: ' + c.lugar) : null,
        c.responsable_nombre ? _hCF('div', { style: { fontSize: 12.5, color: 'var(--ink-3)' } }, 'Te atiende: ' + c.responsable_nombre) : null,
        c.estado === 'realizada' ? _hCF('span', { className: 'badge badge-green', style: { marginTop: 6 } }, 'Realizada') : null,
        c.estado === 'no_asistio' ? _hCF('span', { className: 'badge badge-gray', style: { marginTop: 6 } }, 'No asistió') : null);
    })
  );
}
