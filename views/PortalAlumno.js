// views/PortalAlumno.js — Portal del rol 'alumno' (F4, 18-nov-2026)
//
// Panel autónomo, mismo patrón que PortalDocente.js: NO usa cargar_datos (el
// rol ni siquiera puede llamarla: ver el allowlist 'alumno' en api.php). Todo
// viene de cuatro acciones, que además validan en el servidor que la
// información sea SUYA (usuarios.cliente_id, nunca lo que mande el navegador):
//   alumno_resumen          → inicio: ficha, grupo, horario, asistencia
//   escolar_boleta/kardex   → calificaciones (solo periodos publicados)
//   monedero_saldo/_movimientos → monedero de la tiendita (F6)
//
// QUÉ NO MUESTRA, a propósito: adeudos, cobros ni nada de la cobranza de su
// familia. El alumno tiene cuenta propia para ver su vida escolar y gastar de
// su monedero, no para ver lo que debe su familia.
//
// Reusa los globales de views/ControlEscolar.js (EscBoletaVista,
// EscKardexModal, EscHorarioSemana, escApi, ESC_ESTADOS...), que se carga antes
// en index.html. `var` y React.createElement directo por la misma razón que
// PortalDocente.js / Promotor.js.

var _hPA = React.createElement;

function paFmtMoneda(n) {
  return '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function PaTarjeta(props) {
  return _hPA('div', { style: Object.assign({ background: 'var(--bg-surface)', border: '1px solid var(--border-glow)', borderRadius: 14, padding: '18px 18px', marginBottom: 16 }, props.style || {}) },
    props.titulo ? _hPA('div', { style: { fontWeight: 700, fontSize: 14, color: 'var(--ink)', marginBottom: 12 } }, props.titulo) : null,
    props.children);
}

function PaMensaje(props) {
  return _hPA(PaTarjeta, { style: { textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 } }, props.texto);
}

/* ───────────────────────── Inicio ───────────────────────── */

function PaInicio(props) {
  var d = props.datos;
  var as = d.asistencia;
  var alumno = d.alumno;
  if (!d.ciclo) return _hPA(PaMensaje, { texto: 'Tu colegio todavía no tiene un ciclo escolar en curso.' });
  return _hPA('div', {},
    _hPA(PaTarjeta, {},
      _hPA('div', { style: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' } },
        _hPA('div', {
          style: { width: 56, height: 56, borderRadius: '50%', background: 'var(--grad-cool, var(--accent))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 22, overflow: 'hidden', flexShrink: 0 }
        }, alumno.foto_url ? _hPA('img', { src: alumno.foto_url, alt: '', style: { width: '100%', height: '100%', objectFit: 'cover' } }) : (alumno.nombre || '?').charAt(0).toUpperCase()),
        _hPA('div', { style: { flex: 1, minWidth: 0 } },
          _hPA('div', { style: { fontWeight: 800, fontSize: 17, color: 'var(--ink)' } }, alumno.nombre),
          _hPA('div', { style: { fontSize: 12.5, color: 'var(--ink-3)' } },
            [alumno.matricula ? 'Matrícula ' + alumno.matricula : null,
             d.grupo ? 'Grupo ' + d.grupo.nombre : (alumno.grado || null),
             'Ciclo ' + d.ciclo.nombre].filter(Boolean).join(' · ')),
          d.grupo && d.grupo.tutor ? _hPA('div', { style: { fontSize: 12, color: 'var(--ink-4)', marginTop: 2 } }, 'Tutor: ' + d.grupo.tutor) : null)
      ),
      _hPA('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 } },
        _hPA(EscStat, { label: 'Promedio general', valor: escFmtCal(d.boleta && d.boleta.promedio_general), color: escColorCal(d.boleta && d.boleta.promedio_general, d.ciclo.calif_aprobatoria) }),
        as ? _hPA(EscStat, { label: 'Asistencia', valor: as.porcentaje === null ? '—' : as.porcentaje + '%', color: as.porcentaje !== null && as.porcentaje < 85 ? 'var(--red)' : undefined }) : null,
        as ? _hPA(EscStat, { label: 'Faltas', valor: as.falta }) : null,
        d.monedero ? _hPA(EscStat, { label: 'Monedero', valor: paFmtMoneda(d.monedero.saldo) }) : null)
    ),
    _hPA(PaTarjeta, { titulo: 'Mi horario' },
      _hPA(EscHorarioSemana, {
        bloques: (d.horario || []).map(function (b, i) { return Object.assign({ id: i }, b); }),
        vacio: d.grupo ? 'Tu grupo todavía no tiene horario capturado.' : 'Todavía no estás inscrito en un grupo de este ciclo.'
      }))
  );
}

/* ───────────────────────── Calificaciones ───────────────────────── */

function PaCalificaciones(props) {
  var R = React;
  var s1 = R.useState(null), datos = s1[0], setDatos = s1[1];
  var s2 = R.useState(''), error = s2[0], setError = s2[1];
  var s3 = R.useState(false), kardex = s3[0], setKardex = s3[1];
  R.useEffect(function () {
    // Sin cliente_id: el servidor usa el de la cuenta (y rechaza el de otro).
    escApi('escolar_boleta', {}).then(setDatos).catch(function (e) { setError(e.message); });
  }, []);
  if (error) return _hPA(PaMensaje, { texto: error });
  if (!datos) return _hPA(PaMensaje, { texto: 'Cargando calificaciones…' });
  return _hPA('div', {},
    _hPA(PaTarjeta, {},
      _hPA('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' } },
        _hPA('div', { style: { flex: 1, fontSize: 13, color: 'var(--ink-3)' } }, 'Solo se muestran los periodos que el colegio ya publicó.'),
        _hPA('button', { className: 'btn btn-ghost btn-sm', onClick: function () { setKardex(true); } }, 'Kárdex'),
        _hPA('button', { className: 'btn btn-ghost btn-sm', onClick: function () { escImprimirBoleta(datos); } },
          _hPA(Icon, { name: 'download', size: 14, color: 'currentColor' }), ' Descargar boleta')),
      datos.boleta.periodos.length === 0 ? _hPA('div', { style: { padding: 12, fontSize: 13, color: 'var(--ink-3)', textAlign: 'center' } }, 'El colegio todavía no publica calificaciones de este ciclo.') : null,
      _hPA(EscBoletaVista, { datos: datos })
    ),
    kardex ? _hPA(EscKardexModal, { api: escApi, clienteId: datos.alumno.id, onCerrar: function () { setKardex(false); } }) : null
  );
}

/* ───────────────────────── Asistencia ───────────────────────── */

function PaAsistencia(props) {
  var d = props.datos;
  var as = d.asistencia;
  if (!d.ciclo || !as) return _hPA(PaMensaje, { texto: 'Todavía no hay asistencias registradas.' });
  var reciente = d.asistencia_reciente || [];
  return _hPA('div', {},
    _hPA(PaTarjeta, { titulo: 'Asistencia del ciclo ' + d.ciclo.nombre },
      _hPA('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap' } },
        _hPA(EscStat, { label: 'Asistencia', valor: as.porcentaje === null ? '—' : as.porcentaje + '%', color: as.porcentaje !== null && as.porcentaje < 85 ? 'var(--red)' : undefined }),
        _hPA(EscStat, { label: 'Presentes', valor: as.presente }),
        _hPA(EscStat, { label: 'Retardos', valor: as.retardo }),
        _hPA(EscStat, { label: 'Faltas', valor: as.falta }),
        _hPA(EscStat, { label: 'Justificadas', valor: as.justificada }))),
    _hPA(PaTarjeta, { titulo: 'Últimos registros' },
      reciente.length === 0
        ? _hPA('div', { style: { fontSize: 13, color: 'var(--ink-3)' } }, 'Todavía no hay registros de asistencia.')
        : _hPA('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
            reciente.map(function (r, idx) {
              var e = ESC_ESTADOS[r.estado] || { label: r.estado, color: 'var(--ink-3)', bg: 'var(--glass-light)' };
              return _hPA('span', { key: idx, className: 'badge', title: r.observacion || undefined, style: { background: e.bg, color: e.color, textTransform: 'none' } },
                escFmtFecha(r.fecha) + ' · ' + e.label);
            })))
  );
}

/* ───────────────────────── Monedero (F6) ───────────────────────── */

// Se muestra solo si el servidor responde monedero_saldo con éxito: mientras
// la fase del monedero no esté integrada la acción no existe y esta pestaña
// ni aparece (ver PortalAlumno).
function PaMonedero(props) {
  var R = React;
  var s1 = R.useState(null), movs = s1[0], setMovs = s1[1];
  var s2 = R.useState(''), error = s2[0], setError = s2[1];
  R.useEffect(function () {
    escApi('monedero_movimientos', {}).then(function (r) { setMovs(r.movimientos || r.items || []); })
      .catch(function (e) { setError(e.message); });
  }, []);
  return _hPA('div', {},
    _hPA(PaTarjeta, { titulo: 'Mi monedero' },
      _hPA(EscStat, { label: 'Saldo disponible', valor: paFmtMoneda(props.saldo) }),
      _hPA('div', { style: { fontSize: 12, color: 'var(--ink-4)', marginTop: 10 } }, 'Es para tus compras en la tiendita del colegio.')),
    _hPA(PaTarjeta, { titulo: 'Movimientos' },
      error ? _hPA('div', { style: { fontSize: 13, color: 'var(--ink-3)' } }, error)
      : movs === null ? _hPA('div', { style: { fontSize: 13, color: 'var(--ink-3)' } }, 'Cargando…')
      : movs.length === 0 ? _hPA('div', { style: { fontSize: 13, color: 'var(--ink-3)' } }, 'Todavía no tienes movimientos.')
      : _hPA('div', { className: 'table-wrap' }, _hPA('table', {},
          _hPA('thead', {}, _hPA('tr', {}, _hPA('th', {}, 'Fecha'), _hPA('th', {}, 'Concepto'), _hPA('th', { style: { textAlign: 'right' } }, 'Monto'))),
          _hPA('tbody', {}, movs.map(function (m, i) {
            var monto = Number(m.monto !== undefined ? m.monto : (m.importe || 0));
            return _hPA('tr', { key: m.id || i },
              _hPA('td', {}, escFmtFecha(m.fecha || m.creado_en)),
              _hPA('td', {}, m.concepto || m.descripcion || m.tipo || '—'),
              _hPA('td', { style: { textAlign: 'right', fontWeight: 700, color: monto < 0 ? 'var(--red)' : 'var(--green)' } }, paFmtMoneda(monto)));
          })))))
  );
}

/* ───────────────────────── Portal ───────────────────────── */

function PortalAlumno({ user, onLogout, menuPerfil }) {
  var R = React;
  var st = R.useState('inicio'), tab = st[0], setTab = st[1];
  var s2 = R.useState(null), datos = s2[0], setDatos = s2[1];
  var s3 = R.useState(''), error = s3[0], setError = s3[1];
  // null = todavía no se sabe; false = no hay monedero (pestaña oculta); número = saldo.
  var s4 = R.useState(null), saldo = s4[0], setSaldo = s4[1];

  R.useEffect(function () {
    escApi('alumno_resumen', {}).then(setDatos).catch(function (e) { setError(e.message); });
    escApi('monedero_saldo', {}).then(function (r) {
      var v = r.saldo !== undefined ? r.saldo : (r.monedero && r.monedero.saldo);
      setSaldo(v === undefined || v === null ? false : Number(v));
    }).catch(function () { setSaldo(false); });
  }, []);

  var tabs = [
    { id: 'inicio', label: 'Inicio', icon: 'home' },
    { id: 'calificaciones', label: 'Calificaciones', icon: 'reportes' },
    { id: 'asistencia', label: 'Asistencia', icon: 'check' }
  ];
  if (saldo !== null && saldo !== false) tabs.push({ id: 'monedero', label: 'Monedero', icon: 'pay' });

  var cuerpo;
  if (error) cuerpo = _hPA(PaMensaje, { texto: error });
  else if (!datos) cuerpo = _hPA(PaMensaje, { texto: 'Cargando tu información…' });
  else if (tab === 'calificaciones') cuerpo = _hPA(PaCalificaciones, {});
  else if (tab === 'asistencia') cuerpo = _hPA(PaAsistencia, { datos: datos });
  else if (tab === 'monedero' && saldo !== null && saldo !== false) cuerpo = _hPA(PaMonedero, { saldo: saldo });
  else cuerpo = _hPA(PaInicio, { datos: datos });

  return _hPA('div', { style: { height: '100vh', maxHeight: '100dvh', overflowY: 'auto', overflowX: 'hidden', background: 'var(--bg-main)' } },
    _hPA('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '12px 20px', borderBottom: '1px solid var(--border-glow)',
        background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 50
      }
    },
      _hPA('div', { style: { fontWeight: 800, fontSize: 16, color: 'var(--ink)', marginRight: 8 } }, (datos && datos.escuela && datos.escuela.nombre) || 'Portal del alumno'),
      _hPA('div', { className: 'pill-group', style: { flex: '1 1 auto' } },
        tabs.map(function (t) {
          return _hPA('button', {
            key: t.id, className: 'pill' + (tab === t.id ? ' active' : ''),
            style: { display: 'inline-flex', alignItems: 'center', gap: 6 },
            onClick: function () { setTab(t.id); }
          }, _hPA(Icon, { name: t.icon, size: 14, color: 'currentColor' }), t.label);
        })
      ),
      _hPA('div', { style: { marginLeft: 'auto', flexShrink: 0 } },
        menuPerfil || _hPA('button', { className: 'btn btn-ghost btn-sm', onClick: onLogout }, 'Cerrar sesión'))
    ),
    _hPA('div', { style: { padding: 20, maxWidth: 1100, margin: '0 auto' } },
      typeof EscBoletaVista === 'undefined'
        ? _hPA(PaMensaje, { texto: 'No se pudo cargar el módulo escolar. Recarga la página.' })
        : cuerpo)
  );
}
