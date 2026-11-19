// views/EscolarFamilia.js — Pestaña "Escolar" del portal de familia (13-nov-2026)
//
// Calificaciones, asistencia y faltas recientes de cada hijo en el ciclo en
// curso. Solo lectura. El filtro "solo mis hijos" lo hace el servidor
// (escolar_familia_resumen.php filtra por familia_id de la sesión).
//
// Reusa EscBoletaVista / escImprimirBoleta / ESC_ESTADOS de
// views/ControlEscolar.js, que se carga antes en index.html.

var _hEF = React.createElement;

function EscolarFamilia(props) {
  var R = React;
  var s1 = R.useState(null), datos = s1[0], setDatos = s1[1];
  var s2 = R.useState(''), error = s2[0], setError = s2[1];
  var s3 = R.useState(null), kardexDe = s3[0], setKardexDe = s3[1]; // [F3] hijo cuyo kárdex se está viendo

  R.useEffect(function () {
    escApi('escolar_familia_resumen', {}).then(setDatos).catch(function (e) { setError(e.message); });
  }, []);

  var tarjeta = { background: 'var(--bg-surface)', border: '1px solid var(--border-glow)', borderRadius: 14, padding: '18px 18px', marginBottom: 16 };

  if (error) return _hEF('div', { style: Object.assign({}, tarjeta, { textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }) }, error);
  if (!datos) return _hEF('div', { style: Object.assign({}, tarjeta, { textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }) }, 'Cargando información escolar…');
  if (!datos.ciclo) return _hEF('div', { style: Object.assign({}, tarjeta, { textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }) }, 'Tu colegio todavía no publica calificaciones ni asistencias en línea.');
  if (!datos.hijos.length) return _hEF('div', { style: Object.assign({}, tarjeta, { textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }) }, 'No hay alumnos activos ligados a tu cuenta.');

  return _hEF('div', {},
    _hEF('div', { style: { fontSize: 13, color: 'var(--ink-3)', marginBottom: 14 } },
      'Ciclo escolar ' + datos.ciclo.nombre + '. Las calificaciones se actualizan conforme los docentes las capturan.'),
    datos.hijos.map(function (h) {
      var vista = { alumno: h, ciclo: datos.ciclo, boleta: h.boleta, escuela: props.escuela ? { nombre: props.escuela.nombre, logo_url: props.escuela.logo_url } : null };
      return _hEF('div', { key: h.id, style: tarjeta },
        _hEF('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' } },
          _hEF('div', {
            style: { width: 42, height: 42, borderRadius: '50%', background: 'var(--grad-cool, var(--accent))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, overflow: 'hidden', flexShrink: 0 }
          }, h.foto_url ? _hEF('img', { src: h.foto_url, alt: '', style: { width: '100%', height: '100%', objectFit: 'cover' } }) : (h.nombre || '?').charAt(0).toUpperCase()),
          _hEF('div', { style: { flex: 1, minWidth: 0 } },
            _hEF('div', { style: { fontWeight: 700, fontSize: 15, color: 'var(--ink)' } }, h.nombre),
            _hEF('div', { style: { fontSize: 12, color: 'var(--ink-3)' } }, h.matricula ? 'Matrícula ' + h.matricula : '')),
          _hEF('button', { className: 'btn btn-ghost btn-sm', onClick: function () { setKardexDe(h.id); } }, 'Kárdex'), // [F3]
          _hEF('button', { className: 'btn btn-ghost btn-sm', onClick: function () { escImprimirBoleta(vista); } },
            _hEF(Icon, { name: 'download', size: 14, color: 'currentColor' }), ' Descargar boleta')
        ),
        // [F3] El servidor solo manda los periodos que el colegio ya publicó.
        h.boleta.periodos.length === 0 ? _hEF('div', { style: { padding: 12, fontSize: 13, color: 'var(--ink-3)', textAlign: 'center' } }, 'El colegio todavía no publica calificaciones de este ciclo.') : null,
        _hEF(EscBoletaVista, { datos: vista }),
        h.incidencias && h.incidencias.length ? _hEF('div', { style: { marginTop: 14 } },
          _hEF('div', { style: { fontWeight: 700, fontSize: 13, color: 'var(--ink)', marginBottom: 6 } }, 'Faltas y retardos recientes'),
          _hEF('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
            h.incidencias.map(function (i, idx) {
              var e = ESC_ESTADOS[i.estado] || { label: i.estado, color: 'var(--ink-3)', bg: 'var(--glass-light)' };
              return _hEF('span', {
                key: idx, className: 'badge', title: i.observacion || undefined,
                style: { background: e.bg, color: e.color, textTransform: 'none' }
              }, escFmtFecha(i.fecha) + ' · ' + e.label);
            })
          )
        ) : null
      );
    }),
    // [F3] Kárdex del hijo (solo lo publicado; el servidor valida que sea hijo suyo).
    kardexDe ? _hEF(EscKardexModal, { api: escApi, clienteId: kardexDe, onCerrar: function () { setKardexDe(null); } }) : null
  );
}
