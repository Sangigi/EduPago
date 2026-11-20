// views/Agenda.js — Agenda de citas del colegio (OF-7c, 20-nov-2026).
//
// Admisiones, entrevistas con padres, reuniones. Dos vistas: SEMANA (siete columnas, una por día) y
// DÍA (lista del día), con filtro por responsable y modal de alta y edición.
//
// QUIÉN VE QUÉ (lo decide el servidor, acciones/agenda_listar.php; aquí solo se refleja):
//   admin y control_escolar  todas las del colegio, y crean / editan / cancelan (puede_gestionar);
//   direccion                todas las del colegio, en lectura;
//   docente                  solo las suyas (es el responsable), en lectura;
//   familia                  solo las ligadas a su familia, en lectura (ver PortalFamilia.js).
//
// SIN EMPALMES: si el responsable ya tiene una cita programada que se cruza, el servidor rechaza el
// guardado y se enseña el mensaje (la validación vive en el servidor, dentro de una transacción con
// candado; aquí no se repite).
//
// Props: { user, data } — `data` (cargar_datos) solo trae familias y alumnos para los selectores del
// modal; el docente y la dirección pueden no tenerlo y entonces no hay selector (no crean citas).
// Reusa EscModal/EscCampo/EscError/EscVacio/EscTabs de views/ControlEscolar.js (cargado antes).
// `var` y React.createElement directo, sin compilación.

var _hAg = React.createElement;

var AG_TIPOS = { admision: 'Admisión', padres: 'Entrevista con padres', reunion: 'Reunión', otro: 'Otro' };
var AG_TIPO_COLOR = { admision: 'var(--accent)', padres: 'var(--green)', reunion: 'var(--amber)', otro: 'var(--ink-3)' };
var AG_ESTADOS = { programada: 'Programada', realizada: 'Realizada', cancelada: 'Cancelada', no_asistio: 'No asistió' };
var AG_DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
var AG_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function agPad(n) { return (n < 10 ? '0' : '') + n; }
function agYmd(d) { return d.getFullYear() + '-' + agPad(d.getMonth() + 1) + '-' + agPad(d.getDate()); }
// 'YYYY-MM-DD HH:MM:SS' (hora del servidor, sin zona) → Date local con esos mismos números.
function agFecha(txt) {
  var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(txt || ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0) : null;
}
function agHora(txt) { var d = agFecha(txt); return d ? agPad(d.getHours()) + ':' + agPad(d.getMinutes()) : ''; }
function agLunes(d) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); var dia = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dia); return x; }
function agSumaDias(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
function agTituloDia(d) { return AG_DIAS[(d.getDay() + 6) % 7] + ' ' + d.getDate() + ' de ' + AG_MESES[d.getMonth()]; }

// ── Una cita en la lista / columna ─────────────────────────────────────────
function AgCita(props) {
  var c = props.cita;
  var inactiva = c.estado === 'cancelada' || c.estado === 'no_asistio';
  return _hAg('button', {
    type: 'button', onClick: props.onClick,
    style: {
      display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', padding: '7px 9px', marginBottom: 6,
      borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-glow)', borderLeft: '4px solid ' + (AG_TIPO_COLOR[c.tipo] || 'var(--ink-3)'),
      background: 'var(--bg-surface)', color: 'var(--ink)', opacity: inactiva ? .55 : 1, font: 'inherit'
    }
  },
    _hAg('div', { style: { fontSize: 11.5, fontFamily: 'var(--mono)', color: 'var(--ink-3)' } }, agHora(c.inicio) + '–' + agHora(c.fin)),
    _hAg('div', { style: { fontSize: 12.5, fontWeight: 700, textDecoration: c.estado === 'cancelada' ? 'line-through' : 'none' } }, c.titulo),
    _hAg('div', { style: { fontSize: 11, color: 'var(--ink-3)' } },
      (AG_TIPOS[c.tipo] || c.tipo) + (c.responsable_nombre && !props.sinResponsable ? ' · ' + c.responsable_nombre : '')),
    c.familia_nombre ? _hAg('div', { style: { fontSize: 11, color: 'var(--ink-3)' } }, 'Familia ' + c.familia_nombre) : null,
    c.estado !== 'programada' ? _hAg('span', { className: 'badge ' + (c.estado === 'realizada' ? 'badge-green' : 'badge-gray'), style: { marginTop: 3 } }, AG_ESTADOS[c.estado]) : null
  );
}

// ── Modal de alta / edición / detalle ──────────────────────────────────────
function AgModal(props) {
  var R = React;
  var cita = props.cita;              // null = alta
  var editable = props.puedeGestionar && (!cita || cita.estado === 'programada');
  var base = cita ? agFecha(cita.inicio) : (props.fechaInicial || new Date());
  var fin0 = cita ? agFecha(cita.fin) : new Date(base.getTime() + 30 * 60000);
  var s = R.useState({
    titulo: cita ? cita.titulo : '', tipo: cita ? cita.tipo : 'admision',
    fecha: agYmd(base), hora: agPad(base.getHours()) + ':' + agPad(base.getMinutes()),
    horaFin: agPad(fin0.getHours()) + ':' + agPad(fin0.getMinutes()),
    responsable_id: cita ? String(cita.responsable_id || '') : (props.responsableInicial ? String(props.responsableInicial) : ''),
    familia_id: cita && cita.familia_id ? String(cita.familia_id) : '', cliente_id: cita && cita.cliente_id ? String(cita.cliente_id) : '',
    lugar: cita && cita.lugar ? cita.lugar : '', notas: cita && cita.notas ? cita.notas : '', avisar: false
  });
  var f = s[0], setF = s[1];
  var s2 = R.useState(false), env = s2[0], setEnv = s2[1];
  var s3 = R.useState(''), error = s3[0], setError = s3[1];
  var s4 = R.useState(false), confirmaCancelar = s4[0], setConfirmaCancelar = s4[1];
  var cambia = function (k) { return function (e) { var v = e.target.type === 'checkbox' ? e.target.checked : e.target.value; setF(function (x) { var n = Object.assign({}, x); n[k] = v; return n; }); }; };

  var familias = (props.data && props.data.familias) || [];
  var alumnos = ((props.data && props.data.clientes) || []).filter(function (c) {
    return (c.tipo || 'alumno') === 'alumno' && (!f.familia_id || String(c.familia_id) === String(f.familia_id));
  });

  function guardar() {
    setEnv(true); setError('');
    var cuerpo = {
      id: cita ? cita.id : undefined, titulo: f.titulo, tipo: f.tipo,
      inicio: f.fecha + 'T' + f.hora, fin: f.fecha + 'T' + f.horaFin,
      responsable_id: f.responsable_id ? parseInt(f.responsable_id, 10) : 0,
      familia_id: f.familia_id ? parseInt(f.familia_id, 10) : null, cliente_id: f.cliente_id ? parseInt(f.cliente_id, 10) : null,
      lugar: f.lugar, notas: f.notas, avisar_familia: !!(f.avisar && f.familia_id)
    };
    if (props.escuelaId) cuerpo.escuela_id = props.escuelaId;
    ApiClient.post('agenda_guardar', cuerpo).then(function (r) {
      setEnv(false);
      if (!r || !r.success) { setError((r && r.error) || 'No se pudo guardar la cita.'); return; }
      props.onGuardada(r.aviso || null);
    }).catch(function (e) { setEnv(false); setError(e.message || 'No se pudo guardar la cita.'); });
  }

  function cambiarEstado(estado) {
    setEnv(true); setError('');
    var cuerpo = { id: cita.id, estado: estado, avisar_familia: !!(f.avisar && cita.familia_id) };
    if (props.escuelaId) cuerpo.escuela_id = props.escuelaId;
    ApiClient.post('agenda_estado', cuerpo).then(function (r) {
      setEnv(false);
      if (!r || !r.success) { setError((r && r.error) || 'No se pudo cambiar el estado.'); return; }
      props.onGuardada(r.aviso || null);
    }).catch(function (e) { setEnv(false); setError(e.message || 'No se pudo cambiar el estado.'); });
  }

  var valido = f.titulo.trim() && f.fecha && f.hora && f.horaFin && f.horaFin > f.hora && f.responsable_id;
  var dis = !editable || env;
  var pie = [];
  pie.push(_hAg('button', { key: 'x', className: 'btn btn-ghost', onClick: props.onCerrar, disabled: env }, editable ? 'Cerrar sin guardar' : 'Cerrar'));
  if (props.puedeGestionar && cita && cita.estado === 'programada') {
    pie.push(_hAg('button', { key: 'r', className: 'btn btn-secondary', disabled: env, onClick: function () { cambiarEstado('realizada'); } }, 'Realizada'));
    pie.push(_hAg('button', { key: 'n', className: 'btn btn-secondary', disabled: env, onClick: function () { cambiarEstado('no_asistio'); } }, 'No asistió'));
    pie.push(_hAg('button', { key: 'c', className: 'btn btn-secondary', disabled: env, style: { color: 'var(--red)' }, onClick: function () { setConfirmaCancelar(true); } }, 'Cancelar cita'));
  }
  if (props.puedeGestionar && cita && cita.estado !== 'programada') {
    pie.push(_hAg('button', { key: 'p', className: 'btn btn-secondary', disabled: env, onClick: function () { cambiarEstado('programada'); } }, 'Reprogramar (volver a programada)'));
  }
  if (editable) pie.push(_hAg('button', { key: 'g', className: 'btn btn-primary', disabled: !valido || env, onClick: guardar }, env ? 'Guardando…' : 'Guardar'));

  return _hAg(EscModal, { titulo: cita ? (editable ? 'Editar cita' : 'Cita') : 'Nueva cita', onCerrar: props.onCerrar, ancho: 560, footer: pie },
    cita && cita.estado !== 'programada'
      ? _hAg('div', { style: { marginBottom: 10 } }, _hAg('span', { className: 'badge ' + (cita.estado === 'realizada' ? 'badge-green' : 'badge-gray') }, AG_ESTADOS[cita.estado])) : null,
    _hAg(EscCampo, { label: 'Título' },
      _hAg('input', { className: 'form-input', value: f.titulo, onChange: cambia('titulo'), disabled: dis, maxLength: 150, autoFocus: editable, placeholder: 'Ej. Entrevista de admisión — Pérez' })),
    _hAg('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 } },
      _hAg(EscCampo, { label: 'Tipo' },
        _hAg('select', { className: 'form-select', value: f.tipo, onChange: cambia('tipo'), disabled: dis },
          Object.keys(AG_TIPOS).map(function (k) { return _hAg('option', { key: k, value: k }, AG_TIPOS[k]); }))),
      _hAg(EscCampo, { label: 'Día' }, _hAg('input', { className: 'form-input', type: 'date', value: f.fecha, onChange: cambia('fecha'), disabled: dis })),
      _hAg(EscCampo, { label: 'Empieza' }, _hAg('input', { className: 'form-input', type: 'time', value: f.hora, onChange: cambia('hora'), disabled: dis })),
      _hAg(EscCampo, { label: 'Termina' }, _hAg('input', { className: 'form-input', type: 'time', value: f.horaFin, onChange: cambia('horaFin'), disabled: dis }))),
    _hAg(EscCampo, { label: 'Atiende' },
      _hAg('select', { className: 'form-select', value: f.responsable_id, onChange: cambia('responsable_id'), disabled: dis },
        [_hAg('option', { key: '', value: '' }, 'Elige a una persona…')].concat((props.responsables || []).map(function (r) { return _hAg('option', { key: r.id, value: String(r.id) }, r.nombre); })))),
    familias.length || f.familia_id ? _hAg('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 } },
      _hAg(EscCampo, { label: 'Familia (opcional)' },
        _hAg('select', { className: 'form-select', value: f.familia_id, onChange: function (e) { var v = e.target.value; setF(function (x) { return Object.assign({}, x, { familia_id: v, cliente_id: '' }); }); }, disabled: dis },
          [_hAg('option', { key: '', value: '' }, 'Sin familia')].concat(familias.map(function (fa) { return _hAg('option', { key: fa.id, value: String(fa.id) }, fa.nombre); })))),
      _hAg(EscCampo, { label: 'Alumno o aspirante (opcional)' },
        _hAg('select', { className: 'form-select', value: f.cliente_id, onChange: cambia('cliente_id'), disabled: dis },
          [_hAg('option', { key: '', value: '' }, 'Ninguno')].concat(alumnos.slice(0, 300).map(function (a) { return _hAg('option', { key: a.id, value: String(a.id) }, a.nombre); }))))) : null,
    _hAg(EscCampo, { label: 'Lugar (opcional)' }, _hAg('input', { className: 'form-input', value: f.lugar, onChange: cambia('lugar'), disabled: dis, maxLength: 150, placeholder: 'Ej. Dirección, sala 2, en línea' })),
    props.rol === 'familia' ? null : _hAg(EscCampo, { label: 'Notas internas (la familia no las ve)' },
      _hAg('textarea', { className: 'form-input', rows: 3, value: f.notas, onChange: cambia('notas'), disabled: dis, maxLength: 1000 })),
    editable || (props.puedeGestionar && cita) ? _hAg('label', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--ink-2)', marginTop: 6 } },
      _hAg('input', { type: 'checkbox', checked: f.avisar, onChange: cambia('avisar'), disabled: env || !f.familia_id }),
      _hAg('span', null, 'Avisar a la familia por correo',
        _hAg('span', { style: { display: 'block', fontSize: 11.5, color: 'var(--ink-4)' } },
          f.familia_id ? 'Lleva el tipo de cita, el día, la hora y el lugar. No lleva notas ni datos del alumno.' : 'Elige una familia para poder avisarle.'))) : null,
    confirmaCancelar ? _hAg('div', { style: { marginTop: 12, padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--red-glow)', border: '1px solid rgba(220,38,38,.2)', fontSize: 13 } },
      '¿Cancelar esta cita? Queda en el historial como cancelada' + (f.avisar && f.familia_id ? ' y se le avisará a la familia.' : '.'),
      _hAg('div', { style: { display: 'flex', gap: 8, marginTop: 8 } },
        _hAg('button', { className: 'btn btn-sm btn-ghost', onClick: function () { setConfirmaCancelar(false); } }, 'No, conservarla'),
        _hAg('button', { className: 'btn btn-sm btn-primary', disabled: env, onClick: function () { cambiarEstado('cancelada'); } }, 'Sí, cancelar la cita'))) : null,
    _hAg(EscError, { msg: error })
  );
}

// ── Pantalla ───────────────────────────────────────────────────────────────
function Agenda(props) {
  var R = React;
  var user = props.user || AuthController.getSession() || {};
  var esSuper = user.rol === 'superadmin';
  var s1 = R.useState('semana'), vista = s1[0], setVista = s1[1];
  var s2 = R.useState(function () { return new Date(); }), ancla = s2[0], setAncla = s2[1];
  var s3 = R.useState([]), citas = s3[0], setCitas = s3[1];
  var s4 = R.useState([]), responsables = s4[0], setResponsables = s4[1];
  var s5 = R.useState(false), puedeGestionar = s5[0], setPuedeGestionar = s5[1];
  var s6 = R.useState(''), filtroResp = s6[0], setFiltroResp = s6[1];
  var s7 = R.useState(true), cargando = s7[0], setCargando = s7[1];
  var s8 = R.useState(''), error = s8[0], setError = s8[1];
  var s9 = R.useState(null), modal = s9[0], setModal = s9[1]; // { cita?, fecha? }
  var s10 = R.useState(''), aviso = s10[0], setAviso = s10[1];
  var s11 = R.useState(0), recarga = s11[0], setRecarga = s11[1];
  var s12 = R.useState(props.escuela_id || ''), escuelaSel = s12[0], setEscuelaSel = s12[1]; // solo superadmin

  var lunes = agLunes(ancla);
  var desde = vista === 'semana' ? lunes : new Date(ancla.getFullYear(), ancla.getMonth(), ancla.getDate());
  var hasta = vista === 'semana' ? agSumaDias(lunes, 6) : desde;
  var hoy = agYmd(new Date());

  R.useEffect(function () {
    if (esSuper && !escuelaSel) { setCargando(false); return; }
    var vivo = true;
    setCargando(true); setError('');
    var cuerpo = { desde: agYmd(desde), hasta: agYmd(hasta) };
    if (esSuper) cuerpo.escuela_id = parseInt(escuelaSel, 10);
    if (filtroResp) cuerpo.responsable_id = parseInt(filtroResp, 10);
    ApiClient.post('agenda_listar', cuerpo).then(function (r) {
      if (!vivo) return;
      setCargando(false);
      if (!r || !r.success) { setError((r && r.error) || 'No se pudo cargar la agenda.'); setCitas([]); return; }
      setCitas(r.citas || []); setResponsables(r.responsables || []); setPuedeGestionar(!!r.puede_gestionar);
    }).catch(function (e) { if (!vivo) return; setCargando(false); setError(e.message || 'No se pudo cargar la agenda.'); });
    return function () { vivo = false; };
  }, [agYmd(desde), agYmd(hasta), filtroResp, recarga, escuelaSel]);

  var porDia = {};
  citas.forEach(function (c) { var k = String(c.inicio).slice(0, 10); (porDia[k] = porDia[k] || []).push(c); });

  var mover = function (n) { setAncla(agSumaDias(ancla, vista === 'semana' ? 7 * n : n)); };
  var dias = [];
  for (var i = 0; i < (vista === 'semana' ? 7 : 1); i++) dias.push(agSumaDias(desde, i));

  var abrirNueva = function (d) {
    var f = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0, 0);
    setAviso(''); setModal({ cita: null, fecha: f });
  };
  var alGuardar = function (av) {
    setModal(null);
    setAviso(av ? (av.enviado ? 'Cita guardada y aviso enviado a la familia.' : 'Cita guardada. No se pudo avisar a la familia: ' + (av.motivo || 'revisa su correo') + '.') : 'Cita guardada.');
    setRecarga(function (x) { return x + 1; });
  };

  var cabecera = _hAg('div', { className: 'card-header', style: { flexWrap: 'wrap', gap: 10 } },
    _hAg('div', null,
      _hAg('div', { className: 'card-title' }, 'Agenda de citas'),
      _hAg('div', { className: 'card-sub' }, vista === 'semana'
        ? agTituloDia(lunes) + ' — ' + agTituloDia(agSumaDias(lunes, 6))
        : agTituloDia(desde) + (agYmd(desde) === hoy ? ' (hoy)' : ''))),
    _hAg('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginLeft: 'auto' } },
      esSuper ? _hAg('select', { className: 'form-select', style: { fontSize: 12.5, padding: '6px 10px' }, value: String(escuelaSel), onChange: function (e) { setEscuelaSel(e.target.value); } },
        [_hAg('option', { key: '', value: '' }, 'Elige un colegio…')].concat(((props.data && props.data.escuelas) || []).filter(function (e) { return !e.es_plantel; }).map(function (e) { return _hAg('option', { key: e.id, value: String(e.id) }, e.nombre); }))) : null,
      user.rol !== 'docente' && user.rol !== 'familia' ? _hAg('select', { className: 'form-select', style: { fontSize: 12.5, padding: '6px 10px' }, value: filtroResp, onChange: function (e) { setFiltroResp(e.target.value); }, 'aria-label': 'Filtrar por responsable' },
        [_hAg('option', { key: '', value: '' }, 'Todo el personal')].concat(responsables.map(function (r) { return _hAg('option', { key: r.id, value: String(r.id) }, r.nombre); }))) : null,
      _hAg('div', { className: 'pill-group' },
        [['semana', 'Semana'], ['dia', 'Día']].map(function (v) {
          return _hAg('button', { key: v[0], className: 'pill' + (vista === v[0] ? ' active' : ''), onClick: function () { setVista(v[0]); } }, v[1]);
        })),
      _hAg('button', { className: 'btn btn-ghost btn-sm', onClick: function () { mover(-1); }, 'aria-label': 'Anterior' }, '‹'),
      _hAg('button', { className: 'btn btn-ghost btn-sm', onClick: function () { setAncla(new Date()); } }, 'Hoy'),
      _hAg('button', { className: 'btn btn-ghost btn-sm', onClick: function () { mover(1); }, 'aria-label': 'Siguiente' }, '›'),
      puedeGestionar ? _hAg('button', { className: 'btn btn-primary btn-sm', onClick: function () { abrirNueva(vista === 'dia' ? desde : (agYmd(new Date()) >= agYmd(lunes) && agYmd(new Date()) <= agYmd(hasta) ? new Date() : lunes)); } },
        _hAg(Icon, { name: 'plus', size: 14, color: 'currentColor' }), ' Nueva cita') : null));

  var cuerpo;
  if (esSuper && !escuelaSel) cuerpo = _hAg(EscVacio, { icon: 'escuelas', titulo: 'Elige un colegio para ver su agenda.' });
  else if (cargando) cuerpo = _hAg('div', { style: { padding: 30, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 } }, 'Cargando…');
  else if (vista === 'semana') {
    cuerpo = _hAg('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, padding: '4px 2px 10px' } },
      dias.map(function (d) {
        var k = agYmd(d); var lista = porDia[k] || [];
        return _hAg('div', { key: k, style: { minWidth: 0, background: k === hoy ? 'var(--glass-light)' : 'transparent', borderRadius: 'var(--radius-sm)', padding: 6 } },
          _hAg('div', { style: { fontSize: 12, fontWeight: 700, color: k === hoy ? 'var(--accent)' : 'var(--ink-2)', textTransform: 'capitalize', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
            _hAg('span', null, AG_DIAS[(d.getDay() + 6) % 7].slice(0, 3) + ' ' + d.getDate()),
            puedeGestionar ? _hAg('button', { className: 'btn btn-ghost btn-sm', style: { padding: '0 6px', minHeight: 0 }, title: 'Nueva cita este día', 'aria-label': 'Nueva cita el ' + agTituloDia(d), onClick: function () { abrirNueva(d); } }, '+') : null),
          lista.length === 0 ? _hAg('div', { style: { fontSize: 11.5, color: 'var(--ink-4)' } }, 'Sin citas') : lista.map(function (c) {
            return _hAg(AgCita, { key: c.id, cita: c, onClick: function () { setAviso(''); setModal({ cita: c }); } });
          }));
      }));
  } else {
    var del = porDia[agYmd(desde)] || [];
    cuerpo = del.length === 0
      ? _hAg(EscVacio, { icon: 'check', titulo: 'No hay citas este día.', sub: puedeGestionar ? 'Usa «Nueva cita» para agendar una.' : null })
      : _hAg('div', { style: { maxWidth: 680 } }, del.map(function (c) { return _hAg(AgCita, { key: c.id, cita: c, onClick: function () { setAviso(''); setModal({ cita: c }); } }); }));
  }

  return _hAg('div', null,
    _hAg('div', { className: 'card' },
      cabecera,
      aviso ? _hAg(EscOk, { msg: aviso }) : null,
      error ? _hAg(EscError, { msg: error }) : null,
      cuerpo,
      !puedeGestionar && !cargando && !error && user.rol === 'docente'
        ? _hAg('div', { style: { fontSize: 11.5, color: 'var(--ink-4)', padding: '6px 4px' } }, 'Aquí ves las citas donde tú eres el responsable. Para agendar o cambiar una, pide a la administración o a control escolar.') : null,
      !puedeGestionar && !cargando && !error && user.rol === 'direccion'
        ? _hAg('div', { style: { fontSize: 11.5, color: 'var(--ink-4)', padding: '6px 4px' } }, 'Consulta de todas las citas del colegio. Las agenda y modifica la administración o control escolar.') : null),
    modal ? _hAg(AgModal, {
      cita: modal.cita, fechaInicial: modal.fecha, responsables: responsables, data: props.data, puedeGestionar: puedeGestionar, rol: user.rol,
      responsableInicial: filtroResp || null, escuelaId: esSuper ? parseInt(escuelaSel, 10) : null,
      onCerrar: function () { setModal(null); }, onGuardada: alGuardar
    }) : null
  );
}
