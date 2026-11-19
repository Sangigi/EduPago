/* views/ControlEscolar.js — Módulo de control escolar (13-nov-2026)
 *
 * Una sola vista con cuatro secciones, que app.js monta según el ítem del
 * menú (prop `seccion`):
 *   'grupos'          → grupos del ciclo, inscripción de alumnos, materias,
 *                       docentes y horario semanal (con choques validados);
 *   'asistencias'     → pase de lista diario y reporte por rango;
 *   'calificaciones'  → sábana de calificaciones por materia/periodo y
 *                       reporte académico del grupo (alumnos en riesgo);
 *   'config'          → ciclos escolares y periodos, materias y aulas.
 *   [F3] Además en 'config': catálogo de grados (con asistente para ligar a
 *   los alumnos), publicar periodos, cerrar ciclo, promoción de fin de ciclo
 *   (con vista previa) y kárdex del alumno (desde la lista del grupo).
 *
 * La misma vista la reusa el panel del docente (views/PortalDocente.js): el
 * servidor responde `puede_gestionar: false` y aquí se esconden los botones
 * de alta/edición. La seguridad NO depende de esconderlos: cada acción
 * escolar_*.php valida rol y pertenencia (lib/helpers_escolar.php).
 *
 * No usa data/cargar_datos: trae todo con sus propias acciones, igual que
 * Gastos.js. Por eso el docente puede usarla sin recibir saldos ni cobros.
 *
 * `var` en la raíz y React.createElement directo, como Promotor.js /
 * Usuarios.js: un const a nivel raíz tumba la app si el archivo se carga dos
 * veces. Los nombres globales llevan prefijo Esc para no chocar con otras
 * vistas (todas comparten el mismo scope global).
 */
var _hE = React.createElement;

var ESC_DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
var ESC_NIVELES = ['Preescolar', 'Primaria', 'Secundaria', 'Preparatoria', 'Universidad', 'Otro'];
var ESC_TURNOS = ['Matutino', 'Vespertino', 'Mixto', 'Nocturno'];
var ESC_ESTADOS = {
  presente:    { label: 'Presente',    corto: 'P', color: 'var(--green)', bg: 'var(--green-glow)' },
  retardo:     { label: 'Retardo',     corto: 'R', color: 'var(--amber)', bg: 'var(--amber-glow)' },
  falta:       { label: 'Falta',       corto: 'F', color: 'var(--red)',   bg: 'var(--red-glow)' },
  justificada: { label: 'Justificada', corto: 'J', color: 'var(--accent)', bg: 'var(--accent-glow)' }
};
var ESC_PRESETS_PERIODOS = {
  'Bimestres (5)':  ['1er bimestre', '2º bimestre', '3er bimestre', '4º bimestre', '5º bimestre'],
  'Trimestres (3)': ['1er trimestre', '2º trimestre', '3er trimestre'],
  'Semestres (2)':  ['1er semestre', '2º semestre'],
  'Parciales (3)':  ['1er parcial', '2º parcial', '3er parcial']
};

function escHoy() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function escFmtCal(v) {
  return v === null || v === undefined || v === '' ? '—' : Number(v).toFixed(1);
}
function escFmtFecha(f) {
  if (!f) return '—';
  var p = String(f).slice(0, 10).split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : f;
}
function escEscape(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Llama una acción y convierte success:false en excepción, para poder usar
// try/catch en todas las vistas sin repetir el chequeo.
function escApi(accion, cuerpo) {
  return ApiClient.post(accion, cuerpo || {}).then(function (r) {
    if (!r || !r.success) throw new Error((r && r.error) || 'No se pudo completar la operación.');
    return r;
  });
}

/* ───────────────────────── Piezas compartidas ───────────────────────── */

function EscModal(props) {
  return _hE('div', {
    className: 'modal-backdrop',
    onClick: function (e) { if (e.target === e.currentTarget && props.onCerrar) props.onCerrar(); }
  },
    _hE('div', { className: 'modal' + (props.grande ? ' modal-lg' : ''), style: props.ancho ? { maxWidth: props.ancho } : undefined },
      _hE('div', { className: 'modal-header' },
        _hE('div', { className: 'modal-title' }, props.titulo),
        _hE('button', { className: 'btn btn-ghost btn-sm', onClick: props.onCerrar, 'aria-label': 'Cerrar' },
          _hE(Icon, { name: 'close', size: 16, color: 'currentColor' }))
      ),
      _hE('div', { className: 'modal-body' }, props.children),
      props.footer ? _hE('div', { className: 'modal-footer' }, props.footer) : null
    )
  );
}

function EscCampo(props) {
  return _hE('div', { className: 'form-group', style: props.style },
    _hE('label', { className: 'form-label' }, props.label),
    props.children
  );
}

function EscError(props) {
  if (!props.msg) return null;
  return _hE('div', {
    style: {
      marginTop: 10, padding: '9px 12px', fontSize: 12.5, borderRadius: 'var(--radius-sm)',
      color: 'var(--red)', background: 'var(--red-glow)', border: '1px solid rgba(220,38,38,.2)'
    }
  }, props.msg);
}

function EscOk(props) {
  if (!props.msg) return null;
  return _hE('div', {
    style: {
      marginTop: 10, padding: '9px 12px', fontSize: 12.5, borderRadius: 'var(--radius-sm)',
      color: 'var(--green-dark, var(--green))', background: 'var(--green-glow)', border: '1px solid rgba(47,158,68,.2)'
    }
  }, props.msg);
}

function EscVacio(props) {
  return _hE('div', { className: 'empty-state', style: { gridColumn: '1/-1', padding: '32px 16px' } },
    _hE('div', { className: 'empty-icon' }, _hE(Icon, { name: props.icon || 'escuelas', size: 36, color: 'currentColor' })),
    _hE('div', { className: 'empty-text' }, props.titulo),
    props.sub ? _hE('div', { className: 'empty-sub' }, props.sub) : null,
    props.children
  );
}

function EscTabs(props) {
  return _hE('div', { className: 'pill-group', style: { marginBottom: 16 } },
    props.tabs.map(function (t) {
      return _hE('button', {
        key: t.id, className: 'pill' + (props.valor === t.id ? ' active' : ''),
        onClick: function () { props.onCambio(t.id); }
      }, t.label);
    })
  );
}

function EscStat(props) {
  return _hE('div', {
    style: {
      flex: '1 1 150px', padding: '12px 14px', borderRadius: 'var(--radius)',
      background: 'var(--glass-light)', border: '1px solid var(--border-glow)'
    }
  },
    _hE('div', { style: { fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 4 } }, props.label),
    _hE('div', { style: { fontSize: 20, fontWeight: 700, color: props.color || 'var(--ink)' } }, props.valor)
  );
}

function escColorCal(v, aprob) {
  if (v === null || v === undefined || v === '') return 'var(--ink-3)';
  return Number(v) < aprob ? 'var(--red)' : 'var(--ink)';
}

/* Horario semanal en columnas por día. */
function EscHorarioSemana(props) {
  var bloques = props.bloques || [];
  var dias = [1, 2, 3, 4, 5].concat(bloques.some(function (b) { return b.dia_semana === 6; }) ? [6] : []);
  if (!bloques.length) {
    return _hE('div', { style: { padding: 18, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 } },
      props.vacio || 'Sin clases en el horario.');
  }
  return _hE('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(' + dias.length + ', minmax(140px, 1fr))', gap: 8, overflowX: 'auto' } },
    dias.map(function (d) {
      var delDia = bloques.filter(function (b) { return b.dia_semana === d; });
      return _hE('div', { key: d },
        _hE('div', { style: { fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', padding: '6px 4px', borderBottom: '2px solid var(--border-glow)', marginBottom: 6 } }, ESC_DIAS[d]),
        delDia.length === 0
          ? _hE('div', { style: { fontSize: 11.5, color: 'var(--ink-4)', padding: 4 } }, '—')
          : delDia.map(function (b) {
              return _hE('div', {
                key: b.id,
                style: {
                  padding: '8px 10px', marginBottom: 6, borderRadius: 'var(--radius-sm)',
                  background: 'var(--accent-glow)', borderLeft: '3px solid var(--accent)', fontSize: 12, position: 'relative'
                }
              },
                _hE('div', { style: { fontWeight: 700, color: 'var(--ink)' } }, b.hora_inicio + '–' + b.hora_fin),
                _hE('div', { style: { color: 'var(--ink-2)' } }, b.materia),
                _hE('div', { style: { color: 'var(--ink-3)', fontSize: 11 } },
                  [props.mostrarGrupo ? b.grupo : null, b.docente && !props.mostrarGrupo ? b.docente : null, b.aula].filter(Boolean).join(' · ')),
                props.onEliminar ? _hE('button', {
                  className: 'btn btn-ghost btn-sm', title: 'Quitar bloque',
                  style: { position: 'absolute', top: 2, right: 2, padding: 2 },
                  onClick: function () { props.onEliminar(b); }
                }, _hE(Icon, { name: 'close', size: 12, color: 'currentColor' })) : null
              );
            })
      );
    })
  );
}

/* ───────────────────────── Boleta ───────────────────────── */

// HTML autocontenido para imprimir (ventana nueva + print()). Sin <script>:
// la CSP del sitio no deja correr scripts inline, y no hacen falta.
function escBoletaHTML(d) {
  var b = d.boleta, c = d.ciclo, a = d.alumno;
  var aprob = c.calif_aprobatoria;
  var celda = function (v) {
    var color = v !== null && v !== undefined && Number(v) < aprob ? '#c62828' : '#111';
    return '<td style="text-align:center;color:' + color + '">' + escEscape(escFmtCal(v)) + '</td>';
  };
  var filas = b.materias.map(function (m) {
    return '<tr><td>' + escEscape(m.materia) + (m.docente ? '<div style="font-size:10px;color:#666">' + escEscape(m.docente) + '</div>' : '') + '</td>'
      + b.periodos.map(function (p) { return celda(m.calificaciones[p.id]); }).join('')
      + '<td style="text-align:center;font-weight:700">' + escEscape(escFmtCal(m.promedio)) + '</td></tr>';
  }).join('');
  var promPer = b.periodos.map(function (p) { return celda(b.promedio_periodo[p.id]); }).join('');
  var as = b.asistencia;
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Boleta — ' + escEscape(a.nombre) + '</title>'
    + '<style>body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:32px;font-size:13px}'
    + 'h1{font-size:18px;margin:0}h2{font-size:14px;margin:18px 0 8px}'
    + 'table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:6px 8px}th{background:#f0f0f0;font-size:12px}'
    + '.top{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #222;padding-bottom:10px;margin-bottom:14px}'
    + '.datos td{border:none;padding:2px 8px 2px 0}.firma{margin-top:60px;display:flex;justify-content:space-around}'
    + '.firma div{border-top:1px solid #333;width:220px;text-align:center;padding-top:4px;font-size:12px}'
    + '@media print{body{margin:14mm}}</style></head><body>'
    + '<div class="top"><div><h1>' + escEscape(d.escuela ? d.escuela.nombre : '') + '</h1><div>Boleta de calificaciones · Ciclo ' + escEscape(c.nombre) + '</div></div>'
    + (d.escuela && d.escuela.logo_url ? '<img src="' + escEscape(d.escuela.logo_url) + '" style="max-height:60px;max-width:160px" alt="">' : '') + '</div>'
    + '<table class="datos"><tr><td><b>Alumno:</b> ' + escEscape(a.nombre) + '</td><td><b>Matrícula:</b> ' + escEscape(a.matricula || '—') + '</td></tr>'
    + '<tr><td><b>Grupo:</b> ' + escEscape(b.grupo ? b.grupo.nombre + (b.grupo.nivel ? ' · ' + b.grupo.nivel : '') : 'Sin grupo') + '</td><td><b>CURP:</b> ' + escEscape(a.curp || '—') + '</td></tr>'
    + '<tr><td><b>Tutor:</b> ' + escEscape(b.grupo && b.grupo.tutor ? b.grupo.tutor : '—') + '</td><td><b>Escala:</b> ' + c.escala_min + '–' + c.escala_max + ' (aprueba con ' + aprob + ')</td></tr></table>'
    + '<h2>Calificaciones</h2><table><thead><tr><th style="text-align:left">Materia</th>'
    + b.periodos.map(function (p) { return '<th>' + escEscape(p.nombre) + '</th>'; }).join('')
    + '<th>Promedio</th></tr></thead><tbody>' + (filas || '<tr><td colspan="' + (b.periodos.length + 2) + '" style="text-align:center;color:#777">Sin materias asignadas</td></tr>')
    + '<tr style="background:#fafafa"><td><b>Promedio del periodo</b></td>' + promPer + '<td style="text-align:center;font-weight:700;font-size:14px">' + escEscape(escFmtCal(b.promedio_general)) + '</td></tr>'
    + '</tbody></table>'
    + '<h2>Asistencia del ciclo</h2><table><tr><th>Días registrados</th><th>Asistencias</th><th>Retardos</th><th>Faltas</th><th>Justificadas</th><th>% asistencia</th></tr>'
    + '<tr><td style="text-align:center">' + as.total_dias + '</td><td style="text-align:center">' + as.presente + '</td><td style="text-align:center">' + as.retardo + '</td><td style="text-align:center">' + as.falta + '</td><td style="text-align:center">' + as.justificada + '</td><td style="text-align:center">' + (as.porcentaje === null ? '—' : as.porcentaje + '%') + '</td></tr></table>'
    + '<div class="firma"><div>Docente titular</div><div>Dirección</div><div>Padre, madre o tutor</div></div>'
    + '<div style="margin-top:24px;font-size:10px;color:#888">Emitida el ' + escFmtFecha(escHoy()) + '</div>'
    + '</body></html>';
}

function escImprimirBoleta(d) {
  var w = window.open('', '_blank');
  if (!w) { alert('Tu navegador bloqueó la ventana de impresión. Permite ventanas emergentes para este sitio.'); return; }
  w.document.open();
  w.document.write(escBoletaHTML(d));
  w.document.close();
  w.focus();
  setTimeout(function () { try { w.print(); } catch (e) { /* el usuario puede imprimir a mano */ } }, 300);
}

// Vista en pantalla de la boleta (la usan admin, docente y familia).
function EscBoletaVista(props) {
  var d = props.datos, b = d.boleta, c = d.ciclo;
  var aprob = c.calif_aprobatoria;
  var as = b.asistencia;
  return _hE('div', {},
    _hE('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 } },
      _hE(EscStat, { label: 'Promedio general', valor: escFmtCal(b.promedio_general), color: escColorCal(b.promedio_general, aprob) }),
      _hE(EscStat, { label: 'Asistencia', valor: as.porcentaje === null ? '—' : as.porcentaje + '%', color: as.porcentaje !== null && as.porcentaje < 85 ? 'var(--red)' : undefined }),
      _hE(EscStat, { label: 'Faltas', valor: as.falta }),
      _hE(EscStat, { label: 'Materias reprobadas', valor: b.materias_reprobadas, color: b.materias_reprobadas ? 'var(--red)' : undefined })
    ),
    _hE('div', { style: { fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 8 } },
      'Ciclo ', c.nombre, ' · ', b.grupo ? 'Grupo ' + b.grupo.nombre + (b.grupo.tutor ? ' · Tutor: ' + b.grupo.tutor : '') : 'Sin grupo asignado en este ciclo'),
    b.materias.length === 0
      ? _hE('div', { style: { padding: 16, color: 'var(--ink-3)', fontSize: 13, textAlign: 'center' } }, 'Todavía no hay materias ni calificaciones registradas.')
      : _hE('div', { className: 'table-wrap' },
          _hE('table', {},
            _hE('thead', {}, _hE('tr', {},
              _hE('th', {}, 'Materia'),
              b.periodos.map(function (p) { return _hE('th', { key: p.id, style: { textAlign: 'center' } }, p.nombre); }),
              _hE('th', { style: { textAlign: 'center' } }, 'Promedio')
            )),
            _hE('tbody', {},
              b.materias.map(function (m) {
                return _hE('tr', { key: m.gm_id },
                  _hE('td', {}, _hE('div', { style: { fontWeight: 600, color: 'var(--ink)' } }, m.materia),
                    m.docente ? _hE('div', { style: { fontSize: 11, color: 'var(--ink-4)' } }, m.docente) : null),
                  b.periodos.map(function (p) {
                    var v = m.calificaciones[p.id];
                    var obs = m.observaciones && m.observaciones[p.id];
                    return _hE('td', { key: p.id, title: obs || undefined, style: { textAlign: 'center', color: escColorCal(v, aprob), fontWeight: 600 } },
                      escFmtCal(v), obs ? ' *' : '');
                  }),
                  _hE('td', { style: { textAlign: 'center', fontWeight: 800, color: escColorCal(m.promedio, aprob) } }, escFmtCal(m.promedio))
                );
              })
            )
          )
        )
  );
}

function EscBoletaModal(props) {
  var R = React;
  var s1 = R.useState(null), datos = s1[0], setDatos = s1[1];
  var s2 = R.useState(''), error = s2[0], setError = s2[1];
  R.useEffect(function () {
    props.api('escolar_boleta', { cliente_id: props.clienteId, ciclo_id: props.cicloId || undefined })
      .then(setDatos).catch(function (e) { setError(e.message); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.clienteId]);
  return _hE(EscModal, {
    titulo: datos ? 'Boleta — ' + datos.alumno.nombre : 'Boleta', onCerrar: props.onCerrar, ancho: 860,
    footer: [
      _hE('button', { key: 'c', className: 'btn btn-secondary', onClick: props.onCerrar }, 'Cerrar'),
      _hE('button', { key: 'p', className: 'btn btn-primary', disabled: !datos, onClick: function () { escImprimirBoleta(datos); } },
        _hE(Icon, { name: 'download', size: 14, color: 'currentColor' }), ' Imprimir / PDF')
    ]
  },
    error ? _hE(EscError, { msg: error })
      : !datos ? _hE('div', { style: { padding: 24, textAlign: 'center', color: 'var(--ink-3)' } }, 'Cargando boleta…')
      : _hE(EscBoletaVista, { datos: datos })
  );
}

/* ───────────────────────── Configuración ───────────────────────── */

function EscCicloForm(props) {
  var R = React;
  var base = props.ciclo || {
    nombre: '', fecha_inicio: '', fecha_fin: '', escala_min: 5, escala_max: 10, calif_aprobatoria: 6, actual: false,
    periodos: ESC_PRESETS_PERIODOS['Trimestres (3)'].map(function (n) { return { nombre: n, fecha_inicio: '', fecha_fin: '' }; })
  };
  var s1 = R.useState(JSON.parse(JSON.stringify(base))), f = s1[0], setF = s1[1];
  var s2 = R.useState(''), err = s2[0], setErr = s2[1];
  var s3 = R.useState(false), guardando = s3[0], setGuardando = s3[1];
  var set = function (k, v) { setF(function (o) { var n = Object.assign({}, o); n[k] = v; return n; }); };
  var setPer = function (i, k, v) {
    setF(function (o) {
      var ps = o.periodos.slice(); ps[i] = Object.assign({}, ps[i]); ps[i][k] = v;
      return Object.assign({}, o, { periodos: ps });
    });
  };
  var aplicarPreset = function (nombres) {
    var tieneIds = f.periodos.some(function (p) { return p.id; });
    if (tieneIds && !confirm('Esto reemplaza la lista de periodos. Los periodos que ya tengan calificaciones no se podrán quitar. ¿Continuar?')) return;
    set('periodos', nombres.map(function (n) { return { nombre: n, fecha_inicio: '', fecha_fin: '' }; }));
  };
  var guardar = async function () {
    setErr(''); setGuardando(true);
    try {
      await props.api('escolar_guardar_ciclo', f);
      props.onGuardado();
    } catch (e) { setErr(e.message); } finally { setGuardando(false); }
  };
  return _hE(EscModal, {
    titulo: (f.id ? 'Editar' : 'Nuevo') + ' ciclo escolar', onCerrar: props.onCerrar, grande: true,
    footer: [
      _hE('button', { key: 'c', className: 'btn btn-secondary', onClick: props.onCerrar }, 'Cancelar'),
      _hE('button', { key: 'g', className: 'btn btn-primary', disabled: guardando, onClick: guardar }, guardando ? 'Guardando…' : 'Guardar')
    ]
  },
    _hE('div', { style: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 } },
      _hE(EscCampo, { label: 'Nombre *' }, _hE('input', { className: 'form-input', placeholder: '2026-2027', value: f.nombre, onChange: function (e) { set('nombre', e.target.value); } })),
      _hE(EscCampo, { label: 'Inicio *' }, _hE('input', { className: 'form-input', type: 'date', value: f.fecha_inicio, onChange: function (e) { set('fecha_inicio', e.target.value); } })),
      _hE(EscCampo, { label: 'Fin *' }, _hE('input', { className: 'form-input', type: 'date', value: f.fecha_fin, onChange: function (e) { set('fecha_fin', e.target.value); } }))
    ),
    _hE('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 } },
      _hE(EscCampo, { label: 'Calificación mínima' }, _hE('input', { className: 'form-input', type: 'number', step: '0.1', value: f.escala_min, onChange: function (e) { set('escala_min', e.target.value); } })),
      _hE(EscCampo, { label: 'Calificación máxima' }, _hE('input', { className: 'form-input', type: 'number', step: '0.1', value: f.escala_max, onChange: function (e) { set('escala_max', e.target.value); } })),
      _hE(EscCampo, { label: 'Aprueba con' }, _hE('input', { className: 'form-input', type: 'number', step: '0.1', value: f.calif_aprobatoria, onChange: function (e) { set('calif_aprobatoria', e.target.value); } }))
    ),
    _hE('label', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: '4px 0 14px', color: 'var(--ink-2)' } },
      _hE('input', { type: 'checkbox', checked: !!f.actual, onChange: function (e) { set('actual', e.target.checked); } }),
      'Es el ciclo en curso (el que ven docentes y familias)'),
    _hE('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 } },
      _hE('div', { style: { fontWeight: 700, fontSize: 13, color: 'var(--ink)' } }, 'Periodos de evaluación'),
      _hE('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
        Object.keys(ESC_PRESETS_PERIODOS).map(function (k) {
          return _hE('button', { key: k, className: 'btn btn-ghost btn-sm', onClick: function () { aplicarPreset(ESC_PRESETS_PERIODOS[k]); } }, k);
        })
      )
    ),
    f.periodos.map(function (p, i) {
      return _hE('div', { key: i, style: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, marginBottom: 6, alignItems: 'center' } },
        _hE('input', { className: 'form-input', placeholder: 'Nombre del periodo', value: p.nombre, onChange: function (e) { setPer(i, 'nombre', e.target.value); } }),
        _hE('input', { className: 'form-input', type: 'date', title: 'Inicio (opcional)', value: p.fecha_inicio || '', onChange: function (e) { setPer(i, 'fecha_inicio', e.target.value); } }),
        _hE('input', { className: 'form-input', type: 'date', title: 'Fin (opcional)', value: p.fecha_fin || '', onChange: function (e) { setPer(i, 'fecha_fin', e.target.value); } }),
        _hE('button', {
          className: 'btn btn-ghost btn-sm', title: 'Quitar periodo', disabled: f.periodos.length <= 1,
          onClick: function () { set('periodos', f.periodos.filter(function (_, j) { return j !== i; })); }
        }, _hE(Icon, { name: 'trash', size: 14, color: 'currentColor' }))
      );
    }),
    _hE('button', {
      className: 'btn btn-ghost btn-sm', style: { marginTop: 4 },
      onClick: function () { set('periodos', f.periodos.concat([{ nombre: '', fecha_inicio: '', fecha_fin: '' }])); }
    }, '+ Agregar periodo'),
    _hE(EscError, { msg: err })
  );
}

function EscCatalogoForm(props) {
  // Formulario genérico para materia o aula.
  var R = React;
  var s1 = R.useState(Object.assign({ activo: true }, props.inicial)), f = s1[0], setF = s1[1];
  var s2 = R.useState(''), err = s2[0], setErr = s2[1];
  var s3 = R.useState(false), guardando = s3[0], setGuardando = s3[1];
  var set = function (k, v) { setF(function (o) { var n = Object.assign({}, o); n[k] = v; return n; }); };
  var guardar = async function () {
    setErr(''); setGuardando(true);
    try { await props.api(props.accion, f); props.onGuardado(); }
    catch (e) { setErr(e.message); } finally { setGuardando(false); }
  };
  return _hE(EscModal, {
    titulo: (f.id ? 'Editar ' : 'Nueva ') + props.nombreTipo, onCerrar: props.onCerrar,
    footer: [
      _hE('button', { key: 'c', className: 'btn btn-secondary', onClick: props.onCerrar }, 'Cancelar'),
      _hE('button', { key: 'g', className: 'btn btn-primary', disabled: guardando || !String(f.nombre || '').trim(), onClick: guardar }, guardando ? 'Guardando…' : 'Guardar')
    ]
  },
    props.campos.map(function (c) {
      if (c.tipo === 'select') {
        return _hE(EscCampo, { key: c.k, label: c.label },
          _hE('select', { className: 'form-select', value: f[c.k] || '', onChange: function (e) { set(c.k, e.target.value); } },
            _hE('option', { value: '' }, '—'),
            c.opciones.map(function (o) { return _hE('option', { key: o, value: o }, o); })));
      }
      return _hE(EscCampo, { key: c.k, label: c.label },
        _hE('input', {
          className: 'form-input', type: c.tipo || 'text', placeholder: c.ph || '',
          value: f[c.k] === null || f[c.k] === undefined ? '' : f[c.k],
          onChange: function (e) { set(c.k, e.target.value); }
        }));
    }),
    _hE('label', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-2)' } },
      _hE('input', { type: 'checkbox', checked: !!f.activo, onChange: function (e) { set('activo', e.target.checked); } }), 'Activo'),
    _hE(EscError, { msg: err })
  );
}

function EscConfig(props) {
  var R = React;
  var cat = props.cat, api = props.api;
  var s1 = R.useState('ciclos'), tab = s1[0], setTab = s1[1];
  var s2 = R.useState(null), modal = s2[0], setModal = s2[1];
  var s3 = R.useState(''), err = s3[0], setErr = s3[1];
  var cerrar = function () { setModal(null); };
  var guardado = function () { setModal(null); props.recargar(); };
  // [F3] Publicar periodos y cerrar/reabrir el ciclo.
  var s4 = R.useState(''), okMsg = s4[0], setOkMsg = s4[1];
  var publicarPeriodo = async function (p) {
    setErr(''); setOkMsg('');
    try { await api('escolar_publicar_periodo', { periodo_id: p.id, publicado: !p.publicado }); props.recargar(); }
    catch (e) { setErr(e.message); }
  };
  var cerrarCiclo = async function (c, cerrar) {
    var texto = cerrar
      ? 'Se cerrará el ciclo ' + c.nombre + ': se calcula el historial de cada alumno y YA NO se podrán capturar calificaciones ni asistencias, ni inscribir o editar grupos. Todos los periodos deben estar cerrados. ¿Continuar?'
      : '¿Reabrir el ciclo ' + c.nombre + '? Volverá a permitir capturas; al terminar tendrás que cerrarlo otra vez para actualizar el historial.';
    if (!confirm(texto)) return;
    setErr(''); setOkMsg('');
    try {
      var r = await api('escolar_cerrar_ciclo', { ciclo_id: c.id, cerrado: cerrar });
      setOkMsg(cerrar ? 'Ciclo cerrado: ' + r.resumen.aprobado + ' aprobados, ' + r.resumen.reprobado + ' reprobados, ' + r.resumen.sin_calificar + ' sin calificar.' + (r.aviso ? ' ' + r.aviso : '') : 'Ciclo reabierto.' + (r.aviso ? ' ' + r.aviso : ''));
      props.recargar();
    } catch (e) { setErr(e.message); }
  };

  var togglePeriodo = async function (p) {
    setErr('');
    try { await api('escolar_cerrar_periodo', { periodo_id: p.id, cerrado: !p.cerrado }); props.recargar(); }
    catch (e) { setErr(e.message); }
  };
  var marcarActual = async function (c) {
    setErr('');
    try { await api('escolar_guardar_ciclo', Object.assign({}, c, { actual: true })); props.recargar(c.id); }
    catch (e) { setErr(e.message); }
  };

  var CAMPOS_MATERIA = [
    { k: 'nombre', label: 'Nombre *', ph: 'Matemáticas' },
    { k: 'clave', label: 'Clave (opcional)', ph: 'MAT-3' },
    { k: 'nivel', label: 'Nivel', tipo: 'select', opciones: ESC_NIVELES },
    { k: 'horas_semana', label: 'Horas por semana', tipo: 'number' }
  ];
  var CAMPOS_AULA = [
    { k: 'nombre', label: 'Nombre *', ph: 'Salón 101' },
    { k: 'capacidad', label: 'Capacidad (alumnos)', tipo: 'number' },
    { k: 'ubicacion', label: 'Ubicación', ph: 'Edificio A, planta baja' }
  ];

  var contenido;
  if (tab === 'ciclos') {
    contenido = _hE('div', {},
      _hE('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' } },
        _hE('div', { style: { fontSize: 12.5, color: 'var(--ink-3)' } }, 'Cierra un periodo cuando entregues boletas: los docentes ya no podrán cambiar esas calificaciones.'),
        _hE('button', { className: 'btn btn-primary', onClick: function () { setModal({ tipo: 'ciclo' }); } }, '+ Nuevo ciclo')
      ),
      cat.ciclos.length === 0
        ? _hE(EscVacio, { titulo: 'Sin ciclos escolares', sub: 'Crea el ciclo en curso (ej. 2026-2027) con sus periodos de evaluación para empezar.' })
        : cat.ciclos.map(function (c) {
            return _hE('div', { key: c.id, style: { padding: 14, marginBottom: 10, borderRadius: 'var(--radius)', background: 'var(--glass-light)', border: '1px solid ' + (c.actual ? 'var(--accent)' : 'var(--border-glow)') } },
              _hE('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
                _hE('div', { style: { fontWeight: 700, fontSize: 15, color: 'var(--ink)' } }, c.nombre),
                c.actual ? _hE('span', { className: 'badge badge-blue' }, 'En curso') : null,
                c.cerrado ? _hE('span', { className: 'badge badge-gray' }, 'Cerrado') : null, // [F3]
                _hE('div', { style: { fontSize: 12, color: 'var(--ink-3)' } }, escFmtFecha(c.fecha_inicio) + ' – ' + escFmtFecha(c.fecha_fin) + ' · escala ' + c.escala_min + '–' + c.escala_max + ', aprueba con ' + c.calif_aprobatoria),
                _hE('div', { style: { marginLeft: 'auto', display: 'flex', gap: 6 } },
                  !c.actual ? _hE('button', { className: 'btn btn-ghost btn-sm', onClick: function () { marcarActual(c); } }, 'Marcar en curso') : null,
                  // [F3] Cerrar / reabrir y promover. Un ciclo cerrado no se edita.
                  !c.cerrado ? _hE('button', { className: 'btn btn-ghost btn-sm', onClick: function () { cerrarCiclo(c, true); } }, 'Cerrar ciclo') : null,
                  c.cerrado ? _hE('button', { className: 'btn btn-ghost btn-sm', onClick: function () { cerrarCiclo(c, false); } }, 'Reabrir') : null,
                  c.cerrado ? _hE('button', { className: 'btn btn-primary btn-sm', onClick: function () { setModal({ tipo: 'promocion', origenId: c.id }); } }, 'Promover alumnos') : null,
                  !c.cerrado ? _hE('button', { className: 'btn btn-ghost btn-sm', onClick: function () { setModal({ tipo: 'ciclo', ciclo: c }); } }, _hE(Icon, { name: 'edit', size: 14, color: 'currentColor' }), ' Editar') : null
                )
              ),
              _hE('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 } },
                c.periodos.map(function (p) {
                  // [F3] Cada periodo: cerrar/reabrir y publicar/ocultar a las familias.
                  return _hE('span', { key: p.id, style: { display: 'inline-flex', gap: 3 } },
                    _hE('button', {
                      className: 'badge ' + (p.cerrado ? 'badge-gray' : 'badge-green'),
                      style: { cursor: 'pointer', textTransform: 'none' },
                      title: p.cerrado ? 'Cerrado — clic para reabrir' : 'Abierto — clic para cerrar',
                      onClick: function () { togglePeriodo(p); }
                    }, (p.cerrado ? '🔒 ' : '') + p.nombre),
                    _hE('button', {
                      className: 'badge ' + (p.publicado ? 'badge-blue' : 'badge-amber'),
                      style: { cursor: 'pointer', textTransform: 'none' },
                      title: p.publicado ? 'Las familias ya ven este periodo — clic para ocultarlo' : 'Las familias NO ven este periodo — clic para publicarlo',
                      onClick: function () { publicarPeriodo(p); }
                    }, p.publicado ? 'Publicado' : 'Sin publicar'));
                })
              )
            );
          })
    );
  } else if (tab === 'grados') {
    contenido = _hE(EscGrados, { cat: cat, api: api, recargar: props.recargar }); // [F3]
  } else {
    var esMateria = tab === 'materias';
    var lista = esMateria ? cat.materias : cat.aulas;
    contenido = _hE('div', {},
      _hE('div', { style: { display: 'flex', justifyContent: 'flex-end', marginBottom: 12 } },
        _hE('button', { className: 'btn btn-primary', onClick: function () { setModal({ tipo: tab, item: {} }); } }, esMateria ? '+ Nueva materia' : '+ Nueva aula')
      ),
      lista.length === 0
        ? _hE(EscVacio, { titulo: esMateria ? 'Sin materias' : 'Sin aulas', sub: esMateria ? 'Da de alta las asignaturas que imparte el colegio.' : 'Registra los salones para asignarlos a grupos y horarios.' })
        : _hE('div', { className: 'table-wrap' }, _hE('table', {},
            _hE('thead', {}, _hE('tr', {},
              _hE('th', {}, 'Nombre'),
              esMateria ? _hE('th', {}, 'Clave') : _hE('th', {}, 'Capacidad'),
              esMateria ? _hE('th', {}, 'Nivel') : _hE('th', {}, 'Ubicación'),
              esMateria ? _hE('th', {}, 'Horas/sem') : null,
              _hE('th', {}, 'Estado'), _hE('th', {}, '')
            )),
            _hE('tbody', {}, lista.map(function (it) {
              return _hE('tr', { key: it.id, style: { opacity: it.activo ? 1 : 0.55 } },
                _hE('td', { style: { fontWeight: 600, color: 'var(--ink)' } }, it.nombre),
                _hE('td', {}, esMateria ? (it.clave || '—') : (it.capacidad || '—')),
                _hE('td', {}, esMateria ? (it.nivel || '—') : (it.ubicacion || '—')),
                esMateria ? _hE('td', {}, it.horas_semana || '—') : null,
                _hE('td', {}, _hE('span', { className: 'badge ' + (it.activo ? 'badge-green' : 'badge-gray') }, it.activo ? 'Activo' : 'Inactivo')),
                _hE('td', { style: { textAlign: 'right' } },
                  _hE('button', { className: 'btn btn-ghost btn-sm', onClick: function () { setModal({ tipo: tab, item: it }); } }, _hE(Icon, { name: 'edit', size: 14, color: 'currentColor' })))
              );
            }))
          ))
    );
  }

  return _hE('div', { className: 'card' },
    _hE('div', { className: 'card-header' },
      _hE('div', {},
        _hE('div', { className: 'card-title' }, 'Ciclos, materias y aulas'),
        _hE('div', { className: 'card-sub' }, cat.ciclos.length + ' ciclos · ' + cat.materias.filter(function (m) { return m.activo; }).length + ' materias · ' + cat.aulas.filter(function (a) { return a.activo; }).length + ' aulas')
      )
    ),
    _hE(EscTabs, { valor: tab, onCambio: setTab, tabs: [{ id: 'ciclos', label: 'Ciclos y periodos' }, { id: 'grados', label: 'Grados' }, { id: 'materias', label: 'Materias' }, { id: 'aulas', label: 'Aulas' }] }),
    _hE(EscError, { msg: err }), _hE(EscOk, { msg: okMsg }),
    contenido,
    modal && modal.tipo === 'promocion' ? _hE(EscPromocion, { cat: cat, api: api, origenId: modal.origenId, recargar: props.recargar, onCerrar: cerrar }) : null, // [F3]
    modal && modal.tipo === 'ciclo' ? _hE(EscCicloForm, { api: api, ciclo: modal.ciclo, onCerrar: cerrar, onGuardado: guardado }) : null,
    modal && modal.tipo === 'materias' ? _hE(EscCatalogoForm, { api: api, accion: 'escolar_guardar_materia', nombreTipo: 'materia', campos: CAMPOS_MATERIA, inicial: modal.item, onCerrar: cerrar, onGuardado: guardado }) : null,
    modal && modal.tipo === 'aulas' ? _hE(EscCatalogoForm, { api: api, accion: 'escolar_guardar_aula', nombreTipo: 'aula', campos: CAMPOS_AULA, inicial: modal.item, onCerrar: cerrar, onGuardado: guardado }) : null
  );
}

/* ───────────────────────── [F3] Catálogo de grados, promoción y kárdex ───────────────────────── */

var ESC_RESULTADOS = {
  aprobado:      { label: 'Aprobado',      clase: 'badge-green' },
  reprobado:     { label: 'Reprobado',     clase: 'badge-red' },
  sin_calificar: { label: 'Sin calificar', clase: 'badge-gray' }
};
var ESC_ACCIONES_PROMO = {
  promover:      { label: 'Pasa de grado',   clase: 'badge-green' },
  egresar:       { label: 'Egresa',          clase: 'badge-blue' },
  repetir:       { label: 'Repite grado',    clase: 'badge-red' },
  revisar:       { label: 'Revisar',         clase: 'badge-gray' },
  excluido:      { label: 'Excluido',        clase: 'badge-gray' },
  ya_procesado:  { label: 'Ya procesado',    clase: 'badge-gray' },
  sin_historial: { label: 'Sin historial',   clase: 'badge-gray' },
  sin_grado:     { label: 'Sin grado',       clase: 'badge-gray' }
};

// Alta/edición de un grado del catálogo (nivel, grado, nombre, siguiente).
function EscGradoForm(props) {
  var R = React;
  var s1 = R.useState(Object.assign({ nivel: '', grado: '', nombre_corto: '', orden: '', siguiente_id: '', activo: true }, props.grado || {})), f = s1[0], setF = s1[1];
  var s2 = R.useState(''), err = s2[0], setErr = s2[1];
  var s3 = R.useState(false), guardando = s3[0], setGuardando = s3[1];
  var set = function (k, v) { setF(function (o) { var n = Object.assign({}, o); n[k] = v; return n; }); };
  var guardar = async function () {
    setErr(''); setGuardando(true);
    try {
      await props.api('escolar_guardar_grado', Object.assign({}, f, { siguiente_id: f.siguiente_id ? Number(f.siguiente_id) : 0 }));
      props.onGuardado();
    } catch (e) { setErr(e.message); } finally { setGuardando(false); }
  };
  var otros = props.grados.filter(function (g) { return g.id !== f.id; });
  return _hE(EscModal, {
    titulo: (f.id ? 'Editar' : 'Nuevo') + ' grado', onCerrar: props.onCerrar,
    footer: [
      _hE('button', { key: 'c', className: 'btn btn-secondary', onClick: props.onCerrar }, 'Cancelar'),
      _hE('button', { key: 'g', className: 'btn btn-primary', disabled: guardando || !String(f.nivel).trim() || !String(f.grado).trim(), onClick: guardar }, guardando ? 'Guardando…' : 'Guardar')
    ]
  },
    _hE('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
      _hE(EscCampo, { label: 'Nivel *' }, _hE('input', { className: 'form-input', list: 'esc-niveles', placeholder: 'Primaria', value: f.nivel, onChange: function (e) { set('nivel', e.target.value); } })),
      _hE(EscCampo, { label: 'Grado *' }, _hE('input', { className: 'form-input', placeholder: '3', value: f.grado, onChange: function (e) { set('grado', e.target.value); } })),
      _hE(EscCampo, { label: 'Nombre que se muestra' }, _hE('input', { className: 'form-input', placeholder: '3° Primaria', value: f.nombre_corto || '', onChange: function (e) { set('nombre_corto', e.target.value); } })),
      _hE(EscCampo, { label: 'Orden' }, _hE('input', { className: 'form-input', type: 'number', min: 0, value: f.orden === null || f.orden === undefined ? '' : f.orden, onChange: function (e) { set('orden', e.target.value); } }))
    ),
    _hE('datalist', { id: 'esc-niveles' }, ESC_NIVELES.map(function (n) { return _hE('option', { key: n, value: n }); })),
    _hE(EscCampo, { label: 'Al aprobar pasa a' },
      _hE('select', { className: 'form-select', value: f.siguiente_id || '', onChange: function (e) { set('siguiente_id', e.target.value); } },
        _hE('option', { value: '' }, 'Ninguno (el alumno egresa)'),
        otros.map(function (g) { return _hE('option', { key: g.id, value: g.id }, g.nombre_corto); }))),
    _hE('label', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-2)' } },
      _hE('input', { type: 'checkbox', checked: !!f.activo, onChange: function (e) { set('activo', e.target.checked); } }), 'Activo'),
    _hE(EscError, { msg: err })
  );
}

// Asistente: liga el texto libre de cada alumno ("3er Primaria") con un grado del catálogo.
function EscMapeoGrados(props) {
  var R = React;
  var s1 = R.useState(null), datos = s1[0], setDatos = s1[1];
  var s2 = R.useState({}), elegido = s2[0], setElegido = s2[1];   // texto(minúsculas) → grado_id
  var s3 = R.useState(''), err = s3[0], setErr = s3[1];
  var s4 = R.useState(false), guardando = s4[0], setGuardando = s4[1];
  R.useEffect(function () {
    props.api('escolar_mapear_grados', { modo: 'vista_previa' }).then(function (r) {
      setDatos(r);
      var ini = {};
      r.textos.forEach(function (t) { if (t.sugerido_id) ini[t.texto.toLowerCase()] = t.sugerido_id; });
      setElegido(ini);
    }).catch(function (e) { setErr(e.message); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  var aplicar = async function () {
    var pares = [];
    datos.alumnos.forEach(function (a) {
      var g = elegido[a.grado_texto.toLowerCase()];
      if (g) pares.push({ cliente_id: a.cliente_id, grado_id: Number(g) });
    });
    if (!pares.length) { setErr('Elige al menos un grado para ligar.'); return; }
    setErr(''); setGuardando(true);
    try { var r = await props.api('escolar_mapear_grados', { modo: 'aplicar', pares: pares }); props.onListo(r.aplicados); }
    catch (e) { setErr(e.message); } finally { setGuardando(false); }
  };
  var nElegidos = datos ? datos.textos.reduce(function (s, t) { return s + (elegido[t.texto.toLowerCase()] ? t.alumnos : 0); }, 0) : 0;
  return _hE(EscModal, {
    titulo: 'Ligar alumnos al catálogo de grados', onCerrar: props.onCerrar, grande: true,
    footer: [
      _hE('button', { key: 'c', className: 'btn btn-secondary', onClick: props.onCerrar }, 'Cerrar'),
      _hE('button', { key: 'g', className: 'btn btn-primary', disabled: guardando || !datos || !nElegidos, onClick: aplicar }, guardando ? 'Guardando…' : 'Ligar ' + nElegidos + ' alumno(s)')
    ]
  },
    !datos ? (err ? _hE(EscError, { msg: err }) : _hE('div', { style: { padding: 24, textAlign: 'center', color: 'var(--ink-3)' } }, 'Analizando los grados capturados…'))
    : datos.total === 0 ? _hE(EscVacio, { icon: 'alumnos', titulo: 'No hay alumnos pendientes', sub: 'Todos los alumnos activos ya tienen su grado del catálogo.' })
    : _hE('div', {},
        _hE('div', { style: { fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 10 } },
          'Los alumnos activos traen el grado como texto libre. Revisa la sugerencia de cada texto (las marcadas “revisar” son menos seguras) y corrige lo que haga falta. No se cambia lo que escribió el colegio: solo se liga con el catálogo.'),
        _hE('div', { className: 'table-wrap' }, _hE('table', {},
          _hE('thead', {}, _hE('tr', {}, _hE('th', {}, 'Texto capturado'), _hE('th', {}, 'Alumnos'), _hE('th', {}, 'Grado del catálogo'))),
          _hE('tbody', {}, datos.textos.map(function (t) {
            var k = t.texto.toLowerCase();
            return _hE('tr', { key: k || '_vacio' },
              _hE('td', { style: { fontWeight: 600, color: 'var(--ink)' } }, t.texto || '(sin grado capturado)',
                t.confianza === 'baja' ? _hE('span', { className: 'badge badge-amber', style: { marginLeft: 6 } }, 'revisar') : null),
              _hE('td', {}, t.alumnos),
              _hE('td', {}, _hE('select', {
                className: 'form-select', style: { minWidth: 200 }, value: elegido[k] || '',
                onChange: function (e) { var v = e.target.value; setElegido(function (o) { var n = Object.assign({}, o); if (v) n[k] = v; else delete n[k]; return n; }); }
              }, _hE('option', { value: '' }, 'No ligar por ahora'),
                datos.grados.filter(function (g) { return g.activo; }).map(function (g) { return _hE('option', { key: g.id, value: g.id }, g.nombre_corto); }))));
          }))
        )),
        datos.total >= 5000 ? _hE('div', { style: { fontSize: 12, color: 'var(--amber)', marginTop: 8 } }, 'Se muestran los primeros 5000 alumnos; vuelve a abrir el asistente para continuar con el resto.') : null
      ),
    datos ? _hE(EscError, { msg: err }) : null
  );
}

// Pestaña "Grados" de la configuración.
function EscGrados(props) {
  var R = React;
  var cat = props.cat, api = props.api;
  var grados = cat.grados || [];
  var s1 = R.useState(null), modal = s1[0], setModal = s1[1];
  var s2 = R.useState(''), err = s2[0], setErr = s2[1];
  var s3 = R.useState(''), ok = s3[0], setOk = s3[1];
  var s4 = R.useState(false), ocupado = s4[0], setOcupado = s4[1];
  var porId = {};
  grados.forEach(function (g) { porId[g.id] = g; });
  var cargarEstandar = async function () {
    if (!confirm('Se agregarán Preescolar 1-3, Primaria 1-6, Secundaria 1-3 y Preparatoria 1-3 (los que ya existan no se tocan). ¿Continuar?')) return;
    setErr(''); setOk(''); setOcupado(true);
    try {
      var r = await api('escolar_cargar_catalogo_grados', {});
      setOk(r.creados ? r.creados + ' grado(s) agregados.' : 'El catálogo estándar ya estaba completo.');
      props.recargar();
    } catch (e) { setErr(e.message); } finally { setOcupado(false); }
  };
  return _hE('div', {},
    _hE('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' } },
      _hE('div', { style: { fontSize: 12.5, color: 'var(--ink-3)', maxWidth: 560 } }, 'El catálogo de grados define a qué grado pasa cada alumno al cerrar el ciclo. “Al aprobar pasa a” vacío significa que el alumno egresa.'),
      _hE('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
        _hE('button', { className: 'btn btn-secondary btn-sm', disabled: ocupado, onClick: cargarEstandar }, 'Cargar catálogo estándar'),
        _hE('button', { className: 'btn btn-secondary btn-sm', disabled: !grados.length, title: grados.length ? '' : 'Primero carga el catálogo', onClick: function () { setModal({ tipo: 'mapeo' }); } }, 'Ligar alumnos al catálogo'),
        _hE('button', { className: 'btn btn-primary btn-sm', onClick: function () { setModal({ tipo: 'grado', grado: {} }); } }, '+ Nuevo grado')
      )
    ),
    _hE(EscError, { msg: err }), _hE(EscOk, { msg: ok }),
    grados.length === 0
      ? _hE(EscVacio, { titulo: 'Sin catálogo de grados', sub: 'Carga el catálogo estándar (Preescolar a Preparatoria) y ajústalo a tu colegio.' })
      : _hE('div', { className: 'table-wrap', style: { marginTop: 10 } }, _hE('table', {},
          _hE('thead', {}, _hE('tr', {}, _hE('th', {}, 'Orden'), _hE('th', {}, 'Grado'), _hE('th', {}, 'Nivel'), _hE('th', {}, 'Al aprobar pasa a'), _hE('th', {}, 'Estado'), _hE('th', {}, ''))),
          _hE('tbody', {}, grados.map(function (g) {
            return _hE('tr', { key: g.id, style: { opacity: g.activo ? 1 : 0.55 } },
              _hE('td', { style: { color: 'var(--ink-4)' } }, g.orden),
              _hE('td', { style: { fontWeight: 600, color: 'var(--ink)' } }, g.nombre_corto),
              _hE('td', {}, g.nivel),
              _hE('td', {}, g.siguiente_id && porId[g.siguiente_id] ? porId[g.siguiente_id].nombre_corto : _hE('span', { style: { color: 'var(--ink-4)' } }, 'Egresa')),
              _hE('td', {}, _hE('span', { className: 'badge ' + (g.activo ? 'badge-green' : 'badge-gray') }, g.activo ? 'Activo' : 'Inactivo')),
              _hE('td', { style: { textAlign: 'right' } }, _hE('button', { className: 'btn btn-ghost btn-sm', onClick: function () { setModal({ tipo: 'grado', grado: g }); } }, _hE(Icon, { name: 'edit', size: 14, color: 'currentColor' })))
            );
          }))
        )),
    modal && modal.tipo === 'grado' ? _hE(EscGradoForm, { api: api, grado: modal.grado, grados: grados, onCerrar: function () { setModal(null); }, onGuardado: function () { setModal(null); props.recargar(); } }) : null,
    modal && modal.tipo === 'mapeo' ? _hE(EscMapeoGrados, { api: api, onCerrar: function () { setModal(null); }, onListo: function (n) { setModal(null); setOk(n + ' alumno(s) ligados al catálogo de grados.'); } }) : null
  );
}

// Asistente de promoción: elegir ciclos y mapeo de grupos, VISTA PREVIA y, solo
// después de revisarla, aplicar (el servidor exige el token de esa vista previa).
function EscPromocion(props) {
  var R = React;
  var cat = props.cat, api = props.api;
  var cerrados = cat.ciclos.filter(function (c) { return c.cerrado; });
  var s1 = R.useState(props.origenId || (cerrados[0] ? cerrados[0].id : '')), origenId = s1[0], setOrigenId = s1[1];
  var s2 = R.useState(''), destinoId = s2[0], setDestinoId = s2[1];
  var s3 = R.useState({ o: [], d: [] }), grupos = s3[0], setGrupos = s3[1];
  var s4 = R.useState({}), mapeo = s4[0], setMapeo = s4[1];
  var s5 = R.useState({}), excluir = s5[0], setExcluir = s5[1];
  var s6 = R.useState({}), forzar = s6[0], setForzar = s6[1];
  var s7 = R.useState(null), plan = s7[0], setPlan = s7[1];
  var s8 = R.useState(true), vencida = s8[0], setVencida = s8[1];
  var s9 = R.useState(false), ocupado = s9[0], setOcupado = s9[1];
  var s10 = R.useState(''), err = s10[0], setErr = s10[1];
  var s11 = R.useState(null), resultado = s11[0], setResultado = s11[1];

  var origen = cat.ciclos.find(function (c) { return c.id === Number(origenId); });
  var destinos = cat.ciclos.filter(function (c) { return !c.cerrado && origen && c.fecha_inicio > origen.fecha_inicio; });
  var gradoPorId = {};
  (cat.grados || []).forEach(function (g) { gradoPorId[g.id] = g; });

  // Al elegir los dos ciclos se traen sus grupos y se propone un mapeo: cada
  // grupo de origen va al grupo destino del grado siguiente (misma letra si hay).
  R.useEffect(function () {
    setPlan(null); setResultado(null); setMapeo({}); setExcluir({}); setForzar({});
    if (!origenId || !destinoId) { setGrupos({ o: [], d: [] }); return; }
    Promise.all([api('escolar_catalogos', { ciclo_id: Number(origenId) }), api('escolar_catalogos', { ciclo_id: Number(destinoId) })]).then(function (r) {
      var go = r[0].grupos.filter(function (g) { return g.activo; }), gd = r[1].grupos.filter(function (g) { return g.activo; });
      setGrupos({ o: go, d: gd });
      var m = {};
      go.forEach(function (g) {
        var gr = g.grado_id ? gradoPorId[g.grado_id] : null;
        var objetivo = gr && gr.siguiente_id ? gr.siguiente_id : null;
        if (!objetivo) return;
        var cand = gd.filter(function (x) { return x.grado_id === objetivo; });
        if (!cand.length) return;
        var letra = String(g.nombre).trim().slice(-1).toUpperCase();
        var igual = cand.filter(function (x) { return String(x.nombre).trim().slice(-1).toUpperCase() === letra; });
        m[g.id] = (igual[0] || cand[0]).id;
      });
      setMapeo(m);
    }).catch(function (e) { setErr(e.message); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origenId, destinoId]);

  var ids = function (o) { return Object.keys(o).filter(function (k) { return o[k]; }).map(Number); };
  var cuerpo = function (dry) {
    var m = {};
    Object.keys(mapeo).forEach(function (k) { if (mapeo[k]) m[k] = Number(mapeo[k]); });
    var c = { dry_run: dry, ciclo_origen: Number(origenId), ciclo_destino: Number(destinoId), mapeo: m, excluir: ids(excluir), forzar: ids(forzar) };
    if (!dry) c.token = plan.token;
    return c;
  };
  var vistaPrevia = async function () {
    setErr(''); setOcupado(true);
    try { var r = await api('escolar_promover', cuerpo(true)); setPlan(r); setVencida(false); }
    catch (e) { setErr(e.message); } finally { setOcupado(false); }
  };
  var aplicar = async function () {
    var n = plan.resumen;
    if (!confirm('Se aplicará la promoción: ' + (n.promover || 0) + ' pasan de grado, ' + (n.repetir || 0) + ' repiten, ' + (n.egresar || 0) + ' egresan. Esto cambia el grado de los alumnos. ¿Continuar?')) return;
    setErr(''); setOcupado(true);
    try { var r = await api('escolar_promover', cuerpo(false)); setResultado(r); setPlan(null); props.recargar(); }
    catch (e) { setErr(e.message); setVencida(true); } finally { setOcupado(false); }
  };
  var marca = function (setter, id, v) {
    setter(function (o) { var n = Object.assign({}, o); n[id] = v; return n; });
    setVencida(true);
  };
  var hayAccion = plan && ((plan.resumen.promover || 0) + (plan.resumen.repetir || 0) + (plan.resumen.egresar || 0)) > 0;

  var pasoCiclos = _hE('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
    _hE(EscCampo, { label: 'Ciclo que se cierra (origen)' }, _hE('select', { className: 'form-select', value: origenId || '', onChange: function (e) { setOrigenId(e.target.value); setDestinoId(''); } },
      cerrados.length ? null : _hE('option', { value: '' }, 'No hay ciclos cerrados'),
      cerrados.map(function (c) { return _hE('option', { key: c.id, value: c.id }, c.nombre); }))),
    _hE(EscCampo, { label: 'Ciclo nuevo (destino)' }, _hE('select', { className: 'form-select', value: destinoId || '', onChange: function (e) { setDestinoId(e.target.value); } },
      _hE('option', { value: '' }, destinos.length ? 'Elige el ciclo…' : 'Crea primero el ciclo nuevo'),
      destinos.map(function (c) { return _hE('option', { key: c.id, value: c.id }, c.nombre); })))
  );

  var pasoMapeo = destinoId && grupos.o.length ? _hE('div', { style: { marginBottom: 12 } },
    _hE('div', { style: { fontWeight: 700, fontSize: 13, color: 'var(--ink)', marginBottom: 6 } }, 'Grupos del ciclo nuevo (opcional)'),
    _hE('div', { style: { fontSize: 12, color: 'var(--ink-3)', marginBottom: 8 } }, 'Si eliges un grupo destino, los alumnos que pasen de grado se inscriben en él. Sin grupo destino solo cambia su grado y los inscribes después a mano. Los que repiten de grado no se inscriben solos si el grupo destino es de otro grado.'),
    grupos.o.map(function (g) {
      return _hE('div', { key: g.id, style: { display: 'grid', gridTemplateColumns: '1fr 24px 1fr', gap: 8, alignItems: 'center', marginBottom: 6 } },
        _hE('div', { style: { fontSize: 13, color: 'var(--ink)' } }, g.nombre, g.grado_id && gradoPorId[g.grado_id] ? _hE('span', { style: { color: 'var(--ink-4)' } }, ' · ' + gradoPorId[g.grado_id].nombre_corto) : null),
        _hE('div', { style: { textAlign: 'center', color: 'var(--ink-4)' } }, '→'),
        _hE('select', { className: 'form-select', value: mapeo[g.id] || '', onChange: function (e) { var v = e.target.value; setMapeo(function (o) { var n = Object.assign({}, o); n[g.id] = v; return n; }); setVencida(true); } },
          _hE('option', { value: '' }, 'No inscribir en grupo'),
          grupos.d.map(function (x) { return _hE('option', { key: x.id, value: x.id }, x.nombre + (x.grado_id && gradoPorId[x.grado_id] ? ' · ' + gradoPorId[x.grado_id].nombre_corto : '')); })));
    })
  ) : null;

  var pasoPlan = plan ? _hE('div', {},
    _hE('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 } },
      Object.keys(plan.resumen).map(function (k) {
        var a = ESC_ACCIONES_PROMO[k] || { label: k, clase: 'badge-gray' };
        return _hE('span', { key: k, className: 'badge ' + a.clase, style: { textTransform: 'none' } }, a.label + ': ' + plan.resumen[k]);
      })),
    plan.egreso_automatico === false ? _hE('div', { style: { fontSize: 12, color: 'var(--amber)', marginBottom: 8 } }, 'El expediente de alumnos aún no está instalado: los alumnos que egresan NO cambiarán de estatus automáticamente (se reportarán al aplicar).') : null,
    _hE('div', { className: 'table-wrap', style: { maxHeight: 340, overflow: 'auto' } }, _hE('table', {},
      _hE('thead', {}, _hE('tr', {}, _hE('th', {}, 'Alumno'), _hE('th', {}, 'Resultado'), _hE('th', {}, 'Qué pasa'), _hE('th', {}, 'Grupo nuevo'), _hE('th', { style: { textAlign: 'center' } }, 'Excluir'), _hE('th', { style: { textAlign: 'center' } }, 'Forzar paso'))),
      _hE('tbody', {}, plan.filas.map(function (f) {
        var a = ESC_ACCIONES_PROMO[f.accion] || { label: f.accion, clase: 'badge-gray' };
        var r = f.resultado ? ESC_RESULTADOS[f.resultado] : null;
        var puedeForzar = f.accion === 'repetir' || f.accion === 'revisar';
        return _hE('tr', { key: f.cliente_id },
          _hE('td', {}, _hE('div', { style: { fontWeight: 600, color: 'var(--ink)' } }, f.nombre), _hE('div', { style: { fontSize: 11, color: 'var(--ink-4)' } }, f.grupo_origen + (f.grado_actual ? ' · ' + f.grado_actual : ''))),
          _hE('td', {}, r ? _hE('span', { className: 'badge ' + r.clase }, r.label) : '—', f.promedio !== null ? _hE('span', { style: { marginLeft: 6, fontSize: 12, color: 'var(--ink-3)' } }, escFmtCal(f.promedio)) : null),
          _hE('td', {}, _hE('span', { className: 'badge ' + a.clase, style: { textTransform: 'none' } }, a.label), f.grado_nuevo ? _hE('span', { style: { marginLeft: 6, fontSize: 12 } }, '→ ' + f.grado_nuevo) : null,
            f.aviso ? _hE('div', { style: { fontSize: 11, color: 'var(--amber)', marginTop: 2 } }, f.aviso) : null),
          _hE('td', {}, f.grupo_destino || '—'),
          _hE('td', { style: { textAlign: 'center' } }, _hE('input', { type: 'checkbox', checked: !!excluir[f.cliente_id], onChange: function (e) { marca(setExcluir, f.cliente_id, e.target.checked); } })),
          _hE('td', { style: { textAlign: 'center' } }, puedeForzar || forzar[f.cliente_id]
            ? _hE('input', { type: 'checkbox', checked: !!forzar[f.cliente_id], onChange: function (e) { marca(setForzar, f.cliente_id, e.target.checked); } }) : null)
        );
      }))
    ))
  ) : null;

  var pasoResultado = resultado ? _hE('div', {},
    _hE(EscOk, { msg: 'Promoción aplicada: ' + resultado.aplicados.promovido + ' pasaron de grado, ' + resultado.aplicados.repite + ' repiten, ' + resultado.aplicados.egresado + ' egresaron.' }),
    resultado.aviso ? _hE('div', { style: { marginTop: 8, fontSize: 12.5, color: 'var(--amber)' } }, resultado.aviso) : null,
    resultado.errores && resultado.errores.length ? _hE(EscError, { msg: resultado.errores.length + ' alumno(s) con error: ' + resultado.errores.map(function (x) { return x.nombre + ' (' + x.error + ')'; }).join('; ') }) : null
  ) : null;

  return _hE(EscModal, {
    titulo: 'Promoción de fin de ciclo', onCerrar: props.onCerrar, grande: true,
    footer: resultado ? [_hE('button', { key: 'c', className: 'btn btn-primary', onClick: props.onCerrar }, 'Listo')] : [
      _hE('button', { key: 'c', className: 'btn btn-secondary', onClick: props.onCerrar }, 'Cancelar'),
      _hE('button', { key: 'v', className: 'btn btn-secondary', disabled: ocupado || !origenId || !destinoId, onClick: vistaPrevia }, plan ? 'Actualizar vista previa' : 'Vista previa'),
      _hE('button', { key: 'a', className: 'btn btn-primary', disabled: ocupado || !plan || vencida || !hayAccion, title: vencida && plan ? 'Actualiza la vista previa antes de aplicar' : '', onClick: aplicar }, ocupado ? 'Procesando…' : 'Aplicar promoción')
    ]
  },
    resultado ? pasoResultado : _hE('div', {},
      _hE('div', { style: { fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 10 } }, 'Primero revisa la vista previa: no se cambia nada hasta que aprietes “Aplicar promoción”. Los aprobados pasan al grado siguiente del catálogo, los reprobados repiten y quien ya no tiene grado siguiente egresa.'),
      pasoCiclos, pasoMapeo, pasoPlan, _hE(EscError, { msg: err })
    )
  );
}

// Kárdex: trayectoria del alumno ciclo por ciclo.
function EscKardexModal(props) {
  var R = React;
  var s1 = R.useState(null), d = s1[0], setD = s1[1];
  var s2 = R.useState(''), err = s2[0], setErr = s2[1];
  R.useEffect(function () {
    props.api('escolar_kardex', { cliente_id: props.clienteId }).then(setD).catch(function (e) { setErr(e.message); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.clienteId]);
  var ESTADOS = { en_curso: 'En curso', sin_cerrar: 'Sin cerrar', en_revision: 'En revisión' };
  return _hE(EscModal, {
    titulo: d ? 'Kárdex — ' + d.alumno.nombre : 'Kárdex', onCerrar: props.onCerrar, ancho: 860,
    footer: [_hE('button', { key: 'c', className: 'btn btn-secondary', onClick: props.onCerrar }, 'Cerrar')]
  },
    err ? _hE(EscError, { msg: err })
    : !d ? _hE('div', { style: { padding: 24, textAlign: 'center', color: 'var(--ink-3)' } }, 'Cargando kárdex…')
    : _hE('div', {},
        _hE('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 } },
          _hE(EscStat, { label: 'Grado actual', valor: d.alumno.grado_actual || '—' }),
          _hE(EscStat, { label: 'Promedio de ciclos cerrados', valor: escFmtCal(d.promedio_global) }),
          _hE(EscStat, { label: 'Ciclos', valor: d.ciclos.length })),
        d.ciclos.length === 0
          ? _hE(EscVacio, { icon: 'escuelas', titulo: 'Sin historial académico', sub: 'Aparecerá cuando el alumno esté inscrito en un grupo y se cierre su primer ciclo.' })
          : _hE('div', { className: 'table-wrap' }, _hE('table', {},
              _hE('thead', {}, _hE('tr', {}, _hE('th', {}, 'Ciclo'), _hE('th', {}, 'Grado'), _hE('th', {}, 'Grupo'), _hE('th', { style: { textAlign: 'center' } }, 'Promedio'), _hE('th', {}, 'Resultado'))),
              _hE('tbody', {}, d.ciclos.map(function (c) {
                var r = c.resultado ? ESC_RESULTADOS[c.resultado] : null;
                return [
                  _hE('tr', { key: c.ciclo_id },
                    _hE('td', { style: { fontWeight: 600, color: 'var(--ink)' } }, c.ciclo),
                    _hE('td', {}, c.grado || '—'),
                    _hE('td', {}, c.grupo || '—'),
                    _hE('td', { style: { textAlign: 'center', fontWeight: 700, color: escColorCal(c.promedio, c.calif_aprobatoria) } }, escFmtCal(c.promedio)),
                    _hE('td', {}, r ? _hE('span', { className: 'badge ' + r.clase }, r.label) : _hE('span', { className: 'badge badge-gray' }, ESTADOS[c.estado] || c.estado),
                      c.promocion ? _hE('span', { style: { marginLeft: 6, fontSize: 11.5, color: 'var(--ink-3)' } }, c.promocion === 'promovido' ? 'Promovido' : c.promocion === 'repite' ? 'Repite' : c.promocion === 'egresado' ? 'Egresado' : c.promocion) : null)
                  ),
                  c.materias && c.materias.length ? _hE('tr', { key: 'm' + c.ciclo_id },
                    _hE('td', { colSpan: 5, style: { fontSize: 11.5, color: 'var(--ink-3)', paddingTop: 0 } },
                      c.materias.map(function (m) { return m.nombre + ' ' + escFmtCal(m.final); }).join(' · '))) : null
                ];
              }))
            ))
      )
  );
}

/* ───────────────────────── Grupos ───────────────────────── */

function EscGrupoForm(props) {
  var R = React;
  var cat = props.cat;
  var s1 = R.useState(Object.assign({ nombre: '', nivel: '', grado: '', turno: 'Matutino', aula_id: '', tutor_id: '', cupo: '', activo: true, ciclo_id: cat.ciclo_id, copiar_materias_de: '' }, props.grupo || {})), f = s1[0], setF = s1[1];
  var s2 = R.useState(''), err = s2[0], setErr = s2[1];
  var s3 = R.useState(false), guardando = s3[0], setGuardando = s3[1];
  var set = function (k, v) { setF(function (o) { var n = Object.assign({}, o); n[k] = v; return n; }); };
  var docentes = cat.docentes.filter(function (d) { return d.activo; });
  // [F3] Al elegir el grado del catálogo se rellenan nivel y grado si estaban vacíos.
  var setGradoCat = function (v) {
    var g = (cat.grados || []).find(function (x) { return x.id === Number(v); });
    setF(function (o) {
      var n = Object.assign({}, o, { grado_id: v ? Number(v) : 0 });
      if (g && !n.nivel) n.nivel = g.nivel;
      if (g && !n.grado) n.grado = g.grado;
      return n;
    });
  };
  var guardar = async function () {
    setErr(''); setGuardando(true);
    try { var r = await props.api('escolar_guardar_grupo', f); props.onGuardado(r.id); }
    catch (e) { setErr(e.message); } finally { setGuardando(false); }
  };
  return _hE(EscModal, {
    titulo: (f.id ? 'Editar' : 'Nuevo') + ' grupo', onCerrar: props.onCerrar,
    footer: [
      _hE('button', { key: 'c', className: 'btn btn-secondary', onClick: props.onCerrar }, 'Cancelar'),
      _hE('button', { key: 'g', className: 'btn btn-primary', disabled: guardando || !f.nombre.trim(), onClick: guardar }, guardando ? 'Guardando…' : 'Guardar')
    ]
  },
    _hE('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
      _hE(EscCampo, { label: 'Nombre del grupo *' }, _hE('input', { className: 'form-input', placeholder: '3° A', value: f.nombre, onChange: function (e) { set('nombre', e.target.value); } })),
      _hE(EscCampo, { label: 'Ciclo' }, _hE('select', { className: 'form-select', value: f.ciclo_id || '', onChange: function (e) { set('ciclo_id', e.target.value); } },
        cat.ciclos.map(function (c) { return _hE('option', { key: c.id, value: c.id }, c.nombre); }))),
      _hE(EscCampo, { label: 'Nivel' }, _hE('select', { className: 'form-select', value: f.nivel || '', onChange: function (e) { set('nivel', e.target.value); } },
        _hE('option', { value: '' }, '—'), ESC_NIVELES.map(function (n) { return _hE('option', { key: n, value: n }, n); }))),
      _hE(EscCampo, { label: 'Grado' }, _hE('input', { className: 'form-input', placeholder: '3°', value: f.grado || '', onChange: function (e) { set('grado', e.target.value); } })),
      // [F3] Grado del catálogo: de aquí sale a qué grado pasan los alumnos al promover.
      _hE(EscCampo, { label: 'Grado del catálogo' }, _hE('select', { className: 'form-select', value: f.grado_id || '', onChange: function (e) { setGradoCat(e.target.value); } },
        _hE('option', { value: '' }, (cat.grados || []).length ? 'Sin grado del catálogo' : 'Carga el catálogo en Configuración'),
        (cat.grados || []).filter(function (g) { return g.activo || g.id === Number(f.grado_id); }).map(function (g) { return _hE('option', { key: g.id, value: g.id }, g.nombre_corto); }))),
      _hE(EscCampo, { label: 'Turno' }, _hE('select', { className: 'form-select', value: f.turno || '', onChange: function (e) { set('turno', e.target.value); } },
        _hE('option', { value: '' }, '—'), ESC_TURNOS.map(function (n) { return _hE('option', { key: n, value: n }, n); }))),
      _hE(EscCampo, { label: 'Cupo máximo' }, _hE('input', { className: 'form-input', type: 'number', min: 1, value: f.cupo || '', onChange: function (e) { set('cupo', e.target.value); } })),
      _hE(EscCampo, { label: 'Aula' }, _hE('select', { className: 'form-select', value: f.aula_id || '', onChange: function (e) { set('aula_id', e.target.value); } },
        _hE('option', { value: '' }, 'Sin aula fija'),
        cat.aulas.filter(function (a) { return a.activo || a.id === Number(f.aula_id); }).map(function (a) { return _hE('option', { key: a.id, value: a.id }, a.nombre + (a.capacidad ? ' (' + a.capacidad + ')' : '')); }))),
      _hE(EscCampo, { label: 'Docente titular / tutor' }, _hE('select', { className: 'form-select', value: f.tutor_id || '', onChange: function (e) { set('tutor_id', e.target.value); } },
        _hE('option', { value: '' }, 'Sin asignar'),
        docentes.map(function (d) { return _hE('option', { key: d.id, value: d.id }, d.nombre + (d.rol === 'admin' ? ' (admin)' : '')); })))
    ),
    !f.id && cat.grupos.length ? _hE(EscCampo, { label: 'Copiar materias de otro grupo (opcional)' },
      _hE('select', { className: 'form-select', value: f.copiar_materias_de || '', onChange: function (e) { set('copiar_materias_de', e.target.value); } },
        _hE('option', { value: '' }, 'No copiar'),
        cat.grupos.map(function (g) { return _hE('option', { key: g.id, value: g.id }, g.nombre + (g.nivel ? ' · ' + g.nivel : '') + ' (' + g.num_materias + ' materias)'); }))) : null,
    f.id ? _hE('label', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-2)' } },
      _hE('input', { type: 'checkbox', checked: !!f.activo, onChange: function (e) { set('activo', e.target.checked); } }), 'Grupo activo') : null,
    docentes.length === 0 ? _hE('div', { style: { fontSize: 12, color: 'var(--ink-3)', marginTop: 8 } },
      'Para asignar tutores, da de alta usuarios con rol "Docente" en Mi equipo.') : null,
    _hE(EscError, { msg: err })
  );
}

function EscInscribirModal(props) {
  var R = React;
  var s1 = R.useState(''), q = s1[0], setQ = s1[1];
  var s2 = R.useState(true), sinGrupo = s2[0], setSinGrupo = s2[1];
  var s3 = R.useState([]), res = s3[0], setRes = s3[1];
  var s4 = R.useState({}), sel = s4[0], setSel = s4[1];
  var s5 = R.useState(''), err = s5[0], setErr = s5[1];
  var s6 = R.useState(false), buscando = s6[0], setBuscando = s6[1];
  var s7 = R.useState(false), guardando = s7[0], setGuardando = s7[1];

  R.useEffect(function () {
    var t = setTimeout(function () {
      setBuscando(true);
      props.api('escolar_buscar_alumnos', { q: q, sin_grupo: sinGrupo, ciclo_id: props.grupo.ciclo_id })
        .then(function (r) { setRes(r.alumnos.filter(function (a) { return a.grupo_actual_id !== props.grupo.id; })); })
        .catch(function (e) { setErr(e.message); })
        .finally(function () { setBuscando(false); });
    }, 300);
    return function () { clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, sinGrupo]);

  var ids = Object.keys(sel).filter(function (k) { return sel[k]; }).map(Number);
  var todos = res.length > 0 && res.every(function (a) { return sel[a.id]; });
  var inscribir = async function () {
    setErr(''); setGuardando(true);
    try {
      var r = await props.api('escolar_inscribir_alumnos', { grupo_id: props.grupo.id, cliente_ids: ids });
      props.onListo(r);
    } catch (e) { setErr(e.message); } finally { setGuardando(false); }
  };
  return _hE(EscModal, {
    titulo: 'Inscribir alumnos a ' + props.grupo.nombre, onCerrar: props.onCerrar, grande: true,
    footer: [
      _hE('button', { key: 'c', className: 'btn btn-secondary', onClick: props.onCerrar }, 'Cancelar'),
      _hE('button', { key: 'g', className: 'btn btn-primary', disabled: !ids.length || guardando, onClick: inscribir }, guardando ? 'Inscribiendo…' : 'Inscribir ' + (ids.length || ''))
    ]
  },
    _hE('div', { style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 } },
      _hE('div', { className: 'search-bar', style: { flex: '1 1 240px', margin: 0 } },
        _hE('span', { className: 'search-icon' }, _hE(Icon, { name: 'search', size: 15, color: 'currentColor' })),
        _hE('input', { placeholder: 'Nombre, matrícula o CURP…', value: q, onChange: function (e) { setQ(e.target.value); }, autoFocus: true })),
      _hE('label', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-2)' } },
        _hE('input', { type: 'checkbox', checked: sinGrupo, onChange: function (e) { setSinGrupo(e.target.checked); } }), 'Solo alumnos sin grupo en este ciclo')
    ),
    _hE('div', { style: { maxHeight: 360, overflowY: 'auto', border: '1px solid var(--border-glow)', borderRadius: 'var(--radius-sm)' } },
      buscando && !res.length ? _hE('div', { style: { padding: 16, color: 'var(--ink-3)', fontSize: 13 } }, 'Buscando…')
        : !res.length ? _hE('div', { style: { padding: 16, color: 'var(--ink-3)', fontSize: 13 } }, 'No hay alumnos que coincidan. Los alumnos se dan de alta en la sección Alumnos.')
        : _hE('table', {},
            _hE('thead', {}, _hE('tr', {},
              _hE('th', { style: { width: 36 } }, _hE('input', {
                type: 'checkbox', checked: todos,
                onChange: function (e) { var n = {}; if (e.target.checked) res.forEach(function (a) { n[a.id] = true; }); setSel(n); }
              })),
              _hE('th', {}, 'Alumno'), _hE('th', {}, 'Matrícula'), _hE('th', {}, 'Grado (ficha)'), _hE('th', {}, 'Grupo actual'))),
            _hE('tbody', {}, res.map(function (a) {
              return _hE('tr', { key: a.id, style: { cursor: 'pointer' }, onClick: function () { setSel(function (o) { var n = Object.assign({}, o); n[a.id] = !o[a.id]; return n; }); } },
                _hE('td', {}, _hE('input', { type: 'checkbox', checked: !!sel[a.id], readOnly: true })),
                _hE('td', { style: { fontWeight: 600, color: 'var(--ink)' } }, a.nombre),
                _hE('td', {}, a.matricula || '—'),
                _hE('td', {}, a.grado || '—'),
                _hE('td', {}, a.grupo_actual ? _hE('span', { className: 'badge badge-amber', title: 'Se cambiará a este grupo' }, a.grupo_actual + ' → cambio') : '—')
              );
            }))
          )
    ),
    _hE(EscError, { msg: err })
  );
}

function EscHorarioForm(props) {
  var R = React;
  var s1 = R.useState({ grupo_materia_id: props.materias[0] ? props.materias[0].id : '', dia_semana: 1, hora_inicio: '08:00', hora_fin: '08:50', aula_id: '' }), f = s1[0], setF = s1[1];
  var s2 = R.useState(''), err = s2[0], setErr = s2[1];
  var s3 = R.useState(false), guardando = s3[0], setGuardando = s3[1];
  var set = function (k, v) { setF(function (o) { var n = Object.assign({}, o); n[k] = v; return n; }); };
  var guardar = async function (seguir) {
    setErr(''); setGuardando(true);
    try {
      await props.api('escolar_guardar_horario', f);
      props.onGuardado(seguir);
      if (seguir) {
        // Siguiente bloque: misma duración, empieza donde terminó este.
        var dur = escMin(f.hora_fin) - escMin(f.hora_inicio);
        set('hora_inicio', f.hora_fin);
        set('hora_fin', escHHMM(escMin(f.hora_fin) + dur));
      }
    } catch (e) { setErr(e.message); } finally { setGuardando(false); }
  };
  return _hE(EscModal, {
    titulo: 'Agregar clase al horario', onCerrar: props.onCerrar,
    footer: [
      _hE('button', { key: 'c', className: 'btn btn-secondary', onClick: props.onCerrar }, 'Cerrar'),
      _hE('button', { key: 's', className: 'btn btn-ghost', disabled: guardando, onClick: function () { guardar(true); } }, 'Guardar y agregar otra'),
      _hE('button', { key: 'g', className: 'btn btn-primary', disabled: guardando, onClick: function () { guardar(false); } }, 'Guardar')
    ]
  },
    _hE(EscCampo, { label: 'Materia' }, _hE('select', { className: 'form-select', value: f.grupo_materia_id, onChange: function (e) { set('grupo_materia_id', e.target.value); } },
      props.materias.map(function (m) { return _hE('option', { key: m.id, value: m.id }, m.materia + (m.docente ? ' — ' + m.docente : '')); }))),
    _hE('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 } },
      _hE(EscCampo, { label: 'Día' }, _hE('select', { className: 'form-select', value: f.dia_semana, onChange: function (e) { set('dia_semana', Number(e.target.value)); } },
        [1, 2, 3, 4, 5, 6].map(function (d) { return _hE('option', { key: d, value: d }, ESC_DIAS[d]); }))),
      _hE(EscCampo, { label: 'Inicio' }, _hE('input', { className: 'form-input', type: 'time', value: f.hora_inicio, onChange: function (e) { set('hora_inicio', e.target.value); } })),
      _hE(EscCampo, { label: 'Fin' }, _hE('input', { className: 'form-input', type: 'time', value: f.hora_fin, onChange: function (e) { set('hora_fin', e.target.value); } }))
    ),
    _hE(EscCampo, { label: 'Aula (si es distinta a la del grupo)' }, _hE('select', { className: 'form-select', value: f.aula_id, onChange: function (e) { set('aula_id', e.target.value); } },
      _hE('option', { value: '' }, 'La del grupo'),
      props.aulas.filter(function (a) { return a.activo; }).map(function (a) { return _hE('option', { key: a.id, value: a.id }, a.nombre); }))),
    _hE('div', { style: { fontSize: 12, color: 'var(--ink-3)' } }, 'Se valida que no choque con otra clase del grupo, del docente ni del aula.'),
    _hE(EscError, { msg: err })
  );
}
function escMin(hhmm) { var p = String(hhmm).split(':'); return Number(p[0]) * 60 + Number(p[1] || 0); }
function escHHMM(m) { m = Math.min(m, 23 * 60 + 59); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }

function EscGrupoDetalle(props) {
  var R = React;
  var cat = props.cat, api = props.api, gestor = cat.puede_gestionar;
  var s1 = R.useState(null), det = s1[0], setDet = s1[1];
  var s2 = R.useState('alumnos'), tab = s2[0], setTab = s2[1];
  var s3 = R.useState(null), modal = s3[0], setModal = s3[1];
  var s4 = R.useState(''), err = s4[0], setErr = s4[1];
  var s5 = R.useState(''), ok = s5[0], setOk = s5[1];
  var s6 = R.useState({ materia_id: '', docente_id: '' }), nueva = s6[0], setNueva = s6[1];

  var cargar = function () {
    return api('escolar_grupo_detalle', { grupo_id: props.grupoId }).then(setDet).catch(function (e) { setErr(e.message); });
  };
  R.useEffect(function () { cargar(); /* eslint-disable-next-line */ }, [props.grupoId]);

  var accion = async function (nombre, cuerpo, msgOk) {
    setErr(''); setOk('');
    try { await api(nombre, cuerpo); await cargar(); props.recargar(); if (msgOk) setOk(msgOk); }
    catch (e) { setErr(e.message); }
  };

  if (!det) return _hE('div', { className: 'card' }, err ? _hE(EscError, { msg: err }) : _hE('div', { style: { padding: 24, color: 'var(--ink-3)' } }, 'Cargando grupo…'));
  var g = det.grupo;
  var asignadas = det.materias.map(function (m) { return m.materia_id; });
  var docentes = cat.docentes.filter(function (d) { return d.activo; });

  var exportarLista = function () {
    var filas = [['#', 'Alumno', 'Matrícula', 'Fecha de inscripción']].concat(det.alumnos.map(function (a, i) { return [i + 1, a.nombre, a.matricula || '', a.fecha_alta]; }));
    CSVExport.descargar('lista_' + g.nombre.replace(/\W+/g, '_') + '.csv', filas);
  };

  var tabAlumnos = _hE('div', {},
    _hE('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 10, flexWrap: 'wrap' } },
      det.alumnos.length ? _hE('button', { className: 'btn btn-ghost btn-sm', onClick: exportarLista }, _hE(Icon, { name: 'download', size: 14, color: 'currentColor' }), ' Lista CSV') : null,
      gestor ? _hE('button', { className: 'btn btn-primary btn-sm', onClick: function () { setModal('inscribir'); } }, '+ Inscribir alumnos') : null
    ),
    det.alumnos.length === 0
      ? _hE(EscVacio, { icon: 'alumnos', titulo: 'Sin alumnos inscritos', sub: gestor ? 'Usa “Inscribir alumnos” para armar la lista del grupo.' : 'La administración todavía no inscribe alumnos en este grupo.' })
      : _hE('div', { className: 'table-wrap' }, _hE('table', {},
          _hE('thead', {}, _hE('tr', {}, _hE('th', {}, '#'), _hE('th', {}, 'Alumno'), _hE('th', {}, 'Matrícula'), _hE('th', {}, 'Inscrito'), _hE('th', {}, ''))),
          _hE('tbody', {}, det.alumnos.map(function (a, i) {
            return _hE('tr', { key: a.id },
              _hE('td', { style: { width: 40, color: 'var(--ink-4)' } }, i + 1),
              _hE('td', { style: { fontWeight: 600, color: 'var(--ink)' } }, a.nombre, !a.alumno_activo ? _hE('span', { className: 'badge badge-gray', style: { marginLeft: 6 } }, 'Inactivo') : null),
              _hE('td', {}, a.matricula || '—'),
              _hE('td', {}, escFmtFecha(a.fecha_alta)),
              _hE('td', { style: { textAlign: 'right', whiteSpace: 'nowrap' } },
                _hE('button', { className: 'btn btn-ghost btn-sm', onClick: function () { setModal({ boleta: a.id }); } }, 'Boleta'),
                cat.puede_ver_kardex ? _hE('button', { className: 'btn btn-ghost btn-sm', onClick: function () { setModal({ kardex: a.id }); } }, 'Kárdex') : null, // [F3]
                gestor ? _hE('button', {
                  className: 'btn btn-ghost btn-sm', title: 'Dar de baja del grupo',
                  onClick: function () { if (confirm('¿Dar de baja a ' + a.nombre + ' de este grupo? Su historial se conserva.')) accion('escolar_baja_alumno_grupo', { grupo_id: g.id, cliente_id: a.id }, 'Alumno dado de baja del grupo.'); }
                }, _hE(Icon, { name: 'trash', size: 14, color: 'currentColor' })) : null)
            );
          }))
        ))
  );

  var tabMaterias = _hE('div', {},
    gestor ? _hE('div', { style: { display: 'grid', gridTemplateColumns: '2fr 2fr auto', gap: 8, marginBottom: 12, alignItems: 'end' } },
      _hE(EscCampo, { label: 'Materia', style: { margin: 0 } }, _hE('select', { className: 'form-select', value: nueva.materia_id, onChange: function (e) { setNueva(Object.assign({}, nueva, { materia_id: e.target.value })); } },
        _hE('option', { value: '' }, 'Elige una materia…'),
        cat.materias.filter(function (m) { return m.activo && asignadas.indexOf(m.id) === -1; }).map(function (m) { return _hE('option', { key: m.id, value: m.id }, m.nombre + (m.nivel ? ' · ' + m.nivel : '')); }))),
      _hE(EscCampo, { label: 'Docente', style: { margin: 0 } }, _hE('select', { className: 'form-select', value: nueva.docente_id, onChange: function (e) { setNueva(Object.assign({}, nueva, { docente_id: e.target.value })); } },
        _hE('option', { value: '' }, 'Sin asignar'),
        docentes.map(function (d) { return _hE('option', { key: d.id, value: d.id }, d.nombre); }))),
      _hE('button', {
        className: 'btn btn-primary', disabled: !nueva.materia_id,
        onClick: function () { accion('escolar_guardar_grupo_materia', { grupo_id: g.id, materia_id: nueva.materia_id, docente_id: nueva.docente_id }).then(function () { setNueva({ materia_id: '', docente_id: '' }); }); }
      }, 'Agregar')
    ) : null,
    gestor && cat.materias.length === 0 ? _hE('div', { style: { fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 10 } }, 'Primero da de alta materias en “Ciclos, materias y aulas”.') : null,
    det.materias.length === 0
      ? _hE(EscVacio, { icon: 'productos', titulo: 'Sin materias asignadas' })
      : _hE('div', { className: 'table-wrap' }, _hE('table', {},
          _hE('thead', {}, _hE('tr', {}, _hE('th', {}, 'Materia'), _hE('th', {}, 'Docente'), _hE('th', {}, 'Horas/sem'), _hE('th', {}, ''))),
          _hE('tbody', {}, det.materias.map(function (m) {
            return _hE('tr', { key: m.id },
              _hE('td', { style: { fontWeight: 600, color: 'var(--ink)' } }, m.materia, m.clave ? _hE('span', { style: { color: 'var(--ink-4)', fontWeight: 400 } }, ' · ' + m.clave) : null),
              _hE('td', {}, gestor
                ? _hE('select', {
                    className: 'form-select', style: { minWidth: 180 }, value: m.docente_id || '',
                    onChange: function (e) { accion('escolar_guardar_grupo_materia', { grupo_id: g.id, materia_id: m.materia_id, docente_id: e.target.value }, 'Docente actualizado.'); }
                  }, _hE('option', { value: '' }, 'Sin asignar'), docentes.map(function (d) { return _hE('option', { key: d.id, value: d.id }, d.nombre); }))
                : (m.docente || '—')),
              _hE('td', {}, m.horas_semana || '—'),
              _hE('td', { style: { textAlign: 'right' } }, gestor ? _hE('button', {
                className: 'btn btn-ghost btn-sm', title: 'Quitar materia del grupo',
                onClick: function () { if (confirm('¿Quitar ' + m.materia + ' de este grupo? También se borran sus bloques del horario.')) accion('escolar_guardar_grupo_materia', { id: m.id, quitar: true }, 'Materia quitada.'); }
              }, _hE(Icon, { name: 'trash', size: 14, color: 'currentColor' })) : null)
            );
          }))
        ))
  );

  var tabHorario = _hE('div', {},
    gestor ? _hE('div', { style: { display: 'flex', justifyContent: 'flex-end', marginBottom: 10 } },
      _hE('button', { className: 'btn btn-primary btn-sm', disabled: !det.materias.length, title: det.materias.length ? '' : 'Asigna materias primero', onClick: function () { setModal('horario'); } }, '+ Agregar clase')) : null,
    _hE(EscHorarioSemana, {
      bloques: det.horario, vacio: 'Este grupo todavía no tiene horario.',
      onEliminar: gestor ? function (b) { if (confirm('¿Quitar ' + b.materia + ' del ' + ESC_DIAS[b.dia_semana] + ' ' + b.hora_inicio + '?')) accion('escolar_guardar_horario', { id: b.id, eliminar: true }); } : null
    })
  );

  return _hE('div', { className: 'card' },
    _hE('div', { className: 'card-header' },
      _hE('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
        _hE('button', { className: 'btn btn-ghost btn-sm', onClick: props.onVolver, title: 'Volver a grupos' }, '←'),
        _hE('div', {},
          _hE('div', { className: 'card-title' }, g.nombre, !g.activo ? _hE('span', { className: 'badge badge-gray', style: { marginLeft: 8 } }, 'Inactivo') : null),
          _hE('div', { className: 'card-sub' }, [g.nivel, g.grado, g.turno, g.aula ? 'Aula ' + g.aula : null, g.tutor ? 'Tutor: ' + g.tutor : 'Sin tutor', det.alumnos.length + (g.cupo ? '/' + g.cupo : '') + ' alumnos'].filter(Boolean).join(' · '))
        )
      ),
      gestor ? _hE('button', { className: 'btn btn-ghost btn-sm', onClick: function () { setModal('editar'); } }, _hE(Icon, { name: 'edit', size: 14, color: 'currentColor' }), ' Editar grupo') : null
    ),
    _hE(EscTabs, { valor: tab, onCambio: setTab, tabs: [
      { id: 'alumnos', label: 'Alumnos (' + det.alumnos.length + ')' },
      { id: 'materias', label: 'Materias (' + det.materias.length + ')' },
      { id: 'horario', label: 'Horario' }
    ] }),
    _hE(EscError, { msg: err }), _hE(EscOk, { msg: ok }),
    tab === 'alumnos' ? tabAlumnos : tab === 'materias' ? tabMaterias : tabHorario,
    modal === 'inscribir' ? _hE(EscInscribirModal, {
      api: api, grupo: g, onCerrar: function () { setModal(null); },
      onListo: function (r) {
        setModal(null); cargar(); props.recargar();
        setOk(r.inscritos + ' alumno(s) inscritos' + (r.cambiados_de_grupo ? ' (' + r.cambiados_de_grupo + ' cambiados de otro grupo)' : '') + '.');
      }
    }) : null,
    modal === 'horario' ? _hE(EscHorarioForm, { api: api, materias: det.materias, aulas: cat.aulas, onCerrar: function () { setModal(null); }, onGuardado: function (seguir) { cargar(); if (!seguir) setModal(null); } }) : null,
    modal === 'editar' ? _hE(EscGrupoForm, { api: api, cat: cat, grupo: g, onCerrar: function () { setModal(null); }, onGuardado: function () { setModal(null); cargar(); props.recargar(); } }) : null,
    modal && modal.boleta ? _hE(EscBoletaModal, { api: api, clienteId: modal.boleta, cicloId: g.ciclo_id, onCerrar: function () { setModal(null); } }) : null,
    modal && modal.kardex ? _hE(EscKardexModal, { api: api, clienteId: modal.kardex, onCerrar: function () { setModal(null); } }) : null // [F3]
  );
}

function EscMiHorario(props) {
  var R = React;
  var s1 = R.useState(null), bloques = s1[0], setBloques = s1[1];
  R.useEffect(function () {
    props.api('escolar_horario_docente', { ciclo_id: props.cicloId }).then(function (r) { setBloques(r.horario); }).catch(function () { setBloques([]); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.cicloId]);
  return _hE('div', { className: 'card', style: { marginBottom: 16 } },
    _hE('div', { className: 'card-header' }, _hE('div', { className: 'card-title' }, 'Mi horario de la semana')),
    bloques === null ? _hE('div', { style: { padding: 16, color: 'var(--ink-3)' } }, 'Cargando…')
      : _hE(EscHorarioSemana, { bloques: bloques, mostrarGrupo: true, vacio: 'Todavía no tienes clases en el horario.' })
  );
}

function EscGrupos(props) {
  var R = React;
  var cat = props.cat, gestor = cat.puede_gestionar;
  var s1 = R.useState(null), abierto = s1[0], setAbierto = s1[1];
  var s2 = R.useState(false), nuevo = s2[0], setNuevo = s2[1];
  var s3 = R.useState(''), q = s3[0], setQ = s3[1];
  var s4 = R.useState(''), nivel = s4[0], setNivel = s4[1];

  if (abierto) {
    return _hE(EscGrupoDetalle, { grupoId: abierto, cat: cat, api: props.api, recargar: props.recargar, onVolver: function () { setAbierto(null); } });
  }
  var niveles = cat.grupos.map(function (g) { return g.nivel; }).filter(function (v, i, a) { return v && a.indexOf(v) === i; });
  var lista = cat.grupos.filter(function (g) {
    if (nivel && g.nivel !== nivel) return false;
    if (!q) return true;
    var t = q.toLowerCase();
    return (g.nombre + ' ' + (g.tutor || '') + ' ' + (g.grado || '')).toLowerCase().indexOf(t) !== -1;
  });
  var totalAlumnos = cat.grupos.reduce(function (s, g) { return s + (g.activo ? g.num_alumnos : 0); }, 0);

  return _hE('div', {},
    !gestor ? _hE(EscMiHorario, { api: props.api, cicloId: cat.ciclo_id }) : null,
    _hE('div', { className: 'card' },
      _hE('div', { className: 'card-header' },
        _hE('div', {},
          _hE('div', { className: 'card-title' }, gestor ? 'Grupos' : 'Mis grupos'),
          _hE('div', { className: 'card-sub' }, cat.grupos.filter(function (g) { return g.activo; }).length + ' grupos activos · ' + totalAlumnos + ' alumnos inscritos')
        ),
        gestor ? _hE('button', { className: 'btn btn-primary', disabled: !cat.ciclos.length, onClick: function () { setNuevo(true); } }, '+ Nuevo grupo') : null
      ),
      _hE('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 } },
        _hE('div', { className: 'search-bar', style: { flex: '1 1 220px', margin: 0 } },
          _hE('span', { className: 'search-icon' }, _hE(Icon, { name: 'search', size: 15, color: 'currentColor' })),
          _hE('input', { placeholder: 'Buscar grupo o tutor…', value: q, onChange: function (e) { setQ(e.target.value); } })),
        niveles.length > 1 ? _hE('select', { className: 'form-select', style: { width: 180 }, value: nivel, onChange: function (e) { setNivel(e.target.value); } },
          _hE('option', { value: '' }, 'Todos los niveles'), niveles.map(function (n) { return _hE('option', { key: n, value: n }, n); })) : null
      ),
      _hE('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 12 } },
        lista.length === 0
          ? _hE(EscVacio, { titulo: gestor ? 'Sin grupos en este ciclo' : 'No tienes grupos asignados', sub: gestor ? 'Crea los grupos (ej. 1° A, 1° B…) y luego inscribe a los alumnos.' : 'Cuando la administración te asigne como tutor o docente de una materia, tus grupos aparecerán aquí.' })
          : lista.map(function (g) {
              var lleno = g.cupo && g.num_alumnos >= g.cupo;
              return _hE('div', {
                key: g.id, onClick: function () { setAbierto(g.id); },
                style: {
                  background: 'var(--glass-light)', border: '1px solid var(--border-glow)', borderRadius: 'var(--radius)',
                  padding: '14px 16px', cursor: 'pointer', opacity: g.activo ? 1 : 0.5, transition: 'all .2s'
                }
              },
                _hE('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 } },
                  _hE('div', { style: { width: 40, height: 40, borderRadius: 10, background: 'var(--accent-glow)', border: '1px solid var(--border-active)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, color: 'var(--accent)', flexShrink: 0 } },
                    (g.grado || g.nombre).slice(0, 3)),
                  _hE('div', { style: { flex: 1, minWidth: 0 } },
                    _hE('div', { style: { fontWeight: 700, fontSize: 14, color: 'var(--ink)' } }, g.nombre),
                    _hE('div', { style: { fontSize: 11.5, color: 'var(--ink-4)' } }, [g.nivel, g.turno].filter(Boolean).join(' · ') || '—')),
                  g.soy_tutor ? _hE('span', { className: 'badge badge-blue' }, 'Tutor') : null
                ),
                _hE('div', { style: { fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.6 } },
                  _hE('div', {}, 'Tutor: ', g.tutor || 'sin asignar'),
                  _hE('div', {}, 'Aula: ', g.aula || '—'),
                  _hE('div', {},
                    _hE('span', { style: { color: lleno ? 'var(--amber)' : undefined, fontWeight: 600 } }, g.num_alumnos + (g.cupo ? '/' + g.cupo : '') + ' alumnos'),
                    ' · ' + g.num_materias + ' materias')
                )
              );
            })
      )
    ),
    nuevo ? _hE(EscGrupoForm, { api: props.api, cat: cat, onCerrar: function () { setNuevo(false); }, onGuardado: function (id) { setNuevo(false); props.recargar(); setAbierto(id); } }) : null
  );
}

/* ───────────────────────── Asistencias ───────────────────────── */

function EscPaseLista(props) {
  var R = React;
  var cat = props.cat, api = props.api;
  var grupos = cat.grupos.filter(function (g) { return g.activo; });
  var s1 = R.useState(grupos[0] ? grupos[0].id : ''), grupoId = s1[0], setGrupoId = s1[1];
  var s2 = R.useState(escHoy()), fecha = s2[0], setFecha = s2[1];
  var s3 = R.useState(null), lista = s3[0], setLista = s3[1];
  var s4 = R.useState(false), sucio = s4[0], setSucio = s4[1];
  var s5 = R.useState(''), err = s5[0], setErr = s5[1];
  var s6 = R.useState(''), ok = s6[0], setOk = s6[1];
  var s7 = R.useState(false), guardando = s7[0], setGuardando = s7[1];
  var s8 = R.useState(false), capturada = s8[0], setCapturada = s8[1];
  var sl = !!props.soloLectura; // [F4] dirección consulta la lista: no marca ni guarda

  R.useEffect(function () {
    if (!grupoId) return;
    setLista(null); setErr(''); setOk(''); setSucio(false);
    api('escolar_asistencia_obtener', { grupo_id: grupoId, fecha: fecha })
      .then(function (r) {
        setCapturada(r.capturada);
        // Sin captura previa: todos arrancan como "presente" (lo normal es
        // marcar solo las excepciones).
        setLista(r.alumnos.map(function (a) { return Object.assign({}, a, { estado: a.estado || (sl ? '' : 'presente') }); })); // [F4] en solo lectura no se inventa un 'presente'
        if (!r.capturada && r.alumnos.length && !sl) setSucio(true);
      })
      .catch(function (e) { setErr(e.message); setLista([]); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupoId, fecha]);

  var setEstado = function (id, k, v) {
    setLista(function (l) { return l.map(function (a) { if (a.id !== id) return a; var n = Object.assign({}, a); n[k] = v; return n; }); });
    setSucio(true); setOk('');
  };
  var todos = function (estado) { setLista(function (l) { return l.map(function (a) { return Object.assign({}, a, { estado: estado }); }); }); setSucio(true); };
  var guardar = async function () {
    setErr(''); setOk(''); setGuardando(true);
    try {
      var r = await api('escolar_asistencia_guardar', { grupo_id: grupoId, fecha: fecha, registros: lista.map(function (a) { return { cliente_id: a.id, estado: a.estado, observacion: a.observacion || '' }; }) });
      setOk('Asistencia guardada (' + r.guardados + ' alumnos).' + (r.aviso ? ' ' + r.aviso : '')); setSucio(false); setCapturada(true);
    } catch (e) { setErr(e.message); } finally { setGuardando(false); }
  };

  if (!grupos.length) return _hE(EscVacio, { icon: 'alumnos', titulo: 'Sin grupos', sub: 'No hay grupos activos en el ciclo seleccionado.' });
  var cuenta = { presente: 0, retardo: 0, falta: 0, justificada: 0 };
  (lista || []).forEach(function (a) { cuenta[a.estado] = (cuenta[a.estado] || 0) + 1; });

  return _hE('div', {},
    _hE('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', marginBottom: 14 } },
      _hE(EscCampo, { label: 'Grupo', style: { margin: 0, flex: '1 1 200px' } }, _hE('select', { className: 'form-select', value: grupoId, onChange: function (e) { setGrupoId(Number(e.target.value)); } },
        grupos.map(function (g) { return _hE('option', { key: g.id, value: g.id }, g.nombre + (g.nivel ? ' · ' + g.nivel : '')); }))),
      _hE(EscCampo, { label: 'Fecha', style: { margin: 0 } }, _hE('input', { className: 'form-input', type: 'date', max: escHoy(), value: fecha, onChange: function (e) { setFecha(e.target.value); } })),
      sl ? null : _hE('div', { style: { display: 'flex', gap: 6 } },
        _hE('button', { className: 'btn btn-ghost btn-sm', onClick: function () { todos('presente'); } }, 'Todos presentes'))
    ),
    lista && lista.length ? _hE('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' } },
      Object.keys(ESC_ESTADOS).map(function (k) {
        return _hE('span', { key: k, className: 'badge', style: { background: ESC_ESTADOS[k].bg, color: ESC_ESTADOS[k].color } }, ESC_ESTADOS[k].label + ': ' + (cuenta[k] || 0));
      }),
      _hE('span', { style: { fontSize: 12, color: capturada && !sucio ? 'var(--green)' : 'var(--amber)', marginLeft: 'auto' } },
        capturada ? (sucio ? 'Cambios sin guardar' : 'Lista guardada') : 'Aún no se pasa lista este día')
    ) : null,
    lista === null ? _hE('div', { style: { padding: 20, color: 'var(--ink-3)' } }, 'Cargando lista…')
      : lista.length === 0 ? _hE(EscVacio, { icon: 'alumnos', titulo: 'El grupo no tiene alumnos inscritos' })
      : _hE('div', { className: 'table-wrap' }, _hE('table', {},
          _hE('thead', {}, _hE('tr', {}, _hE('th', {}, '#'), _hE('th', {}, 'Alumno'), _hE('th', {}, 'Asistencia'), _hE('th', {}, 'Observación'))),
          _hE('tbody', {}, lista.map(function (a, i) {
            return _hE('tr', { key: a.id },
              _hE('td', { style: { width: 36, color: 'var(--ink-4)' } }, i + 1),
              _hE('td', { style: { fontWeight: 600, color: 'var(--ink)' } }, a.nombre),
              _hE('td', {}, _hE('div', { style: { display: 'flex', gap: 4 } },
                Object.keys(ESC_ESTADOS).map(function (k) {
                  var activo = a.estado === k, e = ESC_ESTADOS[k];
                  return _hE('button', {
                    key: k, title: e.label, disabled: sl, onClick: function () { if (!sl) setEstado(a.id, 'estado', k); },
                    style: {
                      width: 34, height: 30, borderRadius: 8, cursor: sl ? 'default' : 'pointer', fontWeight: 700, fontSize: 12,
                      border: '1px solid ' + (activo ? e.color : 'var(--border-glow)'),
                      background: activo ? e.bg : 'transparent', color: activo ? e.color : 'var(--ink-4)'
                    }
                  }, e.corto);
                }))),
              _hE('td', {}, _hE('input', {
                className: 'form-input', style: { minWidth: 160, padding: '6px 10px' }, placeholder: a.estado === 'justificada' ? 'Motivo…' : '',
                value: a.observacion || '', readOnly: sl, onChange: function (e) { if (!sl) setEstado(a.id, 'observacion', e.target.value); }
              }))
            );
          }))
        )),
    _hE(EscError, { msg: err }), _hE(EscOk, { msg: ok }),
    lista && lista.length && !sl ? _hE('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: 12 } },
      _hE('button', { className: 'btn btn-primary', disabled: guardando || !sucio, onClick: guardar }, guardando ? 'Guardando…' : 'Guardar asistencia')) : null
  );
}

function EscReporteAsistencia(props) {
  var R = React;
  var cat = props.cat, api = props.api;
  var grupos = cat.grupos;
  var hoy = escHoy();
  var s1 = R.useState(grupos[0] ? grupos[0].id : ''), grupoId = s1[0], setGrupoId = s1[1];
  var s2 = R.useState(hoy.slice(0, 8) + '01'), desde = s2[0], setDesde = s2[1];
  var s3 = R.useState(hoy), hasta = s3[0], setHasta = s3[1];
  var s4 = R.useState(null), rep = s4[0], setRep = s4[1];
  var s5 = R.useState(''), err = s5[0], setErr = s5[1];

  R.useEffect(function () {
    if (!grupoId) return;
    setErr('');
    api('escolar_asistencia_reporte', { grupo_id: grupoId, desde: desde, hasta: hasta }).then(setRep).catch(function (e) { setErr(e.message); setRep(null); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupoId, desde, hasta]);

  var exportar = function () {
    var cab = ['Alumno', 'Matrícula', 'Presente', 'Retardo', 'Falta', 'Justificada', '% asistencia'].concat(rep.dias.map(escFmtFecha));
    var filas = rep.alumnos.map(function (a) {
      return [a.nombre, a.matricula || '', a.resumen.presente, a.resumen.retardo, a.resumen.falta, a.resumen.justificada, a.porcentaje === null ? '' : a.porcentaje]
        .concat(rep.dias.map(function (d) { var e = a.dias && a.dias[d]; return e ? ESC_ESTADOS[e].corto : ''; }));
    });
    CSVExport.descargar('asistencia_' + rep.grupo.nombre.replace(/\W+/g, '_') + '_' + desde + '_' + hasta + '.csv', [cab].concat(filas));
  };

  if (!grupos.length) return _hE(EscVacio, { icon: 'alumnos', titulo: 'Sin grupos' });
  return _hE('div', {},
    _hE('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', marginBottom: 14 } },
      _hE(EscCampo, { label: 'Grupo', style: { margin: 0, flex: '1 1 200px' } }, _hE('select', { className: 'form-select', value: grupoId, onChange: function (e) { setGrupoId(Number(e.target.value)); } },
        grupos.map(function (g) { return _hE('option', { key: g.id, value: g.id }, g.nombre); }))),
      _hE(EscCampo, { label: 'Desde', style: { margin: 0 } }, _hE('input', { className: 'form-input', type: 'date', value: desde, onChange: function (e) { setDesde(e.target.value); } })),
      _hE(EscCampo, { label: 'Hasta', style: { margin: 0 } }, _hE('input', { className: 'form-input', type: 'date', value: hasta, onChange: function (e) { setHasta(e.target.value); } })),
      rep && rep.alumnos.length ? _hE('button', { className: 'btn btn-ghost btn-sm', onClick: exportar }, _hE(Icon, { name: 'download', size: 14, color: 'currentColor' }), ' Exportar CSV') : null
    ),
    _hE(EscError, { msg: err }),
    !rep ? null : _hE('div', {},
      _hE('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 } },
        _hE(EscStat, { label: 'Días con lista', valor: rep.dias_capturados }),
        _hE(EscStat, { label: 'Asistencia promedio', valor: rep.promedio_asistencia === null ? '—' : rep.promedio_asistencia + '%' }),
        _hE(EscStat, { label: 'Alumnos bajo 85%', valor: rep.alumnos.filter(function (a) { return a.porcentaje !== null && a.porcentaje < 85; }).length, color: 'var(--red)' })
      ),
      _hE('div', { className: 'table-wrap' }, _hE('table', {},
        _hE('thead', {}, _hE('tr', {},
          _hE('th', {}, 'Alumno'), _hE('th', {}, 'P'), _hE('th', {}, 'R'), _hE('th', {}, 'F'), _hE('th', {}, 'J'), _hE('th', {}, '%'),
          rep.dias.map(function (d) { return _hE('th', { key: d, style: { padding: '8px 4px', textAlign: 'center', fontSize: 10.5 } }, d.slice(8, 10)); })
        )),
        _hE('tbody', {}, rep.alumnos.map(function (a) {
          return _hE('tr', { key: a.id },
            _hE('td', { style: { fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap' } }, a.nombre),
            _hE('td', {}, a.resumen.presente), _hE('td', {}, a.resumen.retardo),
            _hE('td', { style: { color: a.resumen.falta ? 'var(--red)' : undefined, fontWeight: a.resumen.falta ? 700 : 400 } }, a.resumen.falta),
            _hE('td', {}, a.resumen.justificada),
            _hE('td', { style: { fontWeight: 700, color: a.porcentaje !== null && a.porcentaje < 85 ? 'var(--red)' : 'var(--ink)' } }, a.porcentaje === null ? '—' : a.porcentaje + '%'),
            rep.dias.map(function (d) {
              var e = a.dias && a.dias[d];
              return _hE('td', { key: d, style: { padding: '8px 4px', textAlign: 'center', fontWeight: 700, fontSize: 11, color: e ? ESC_ESTADOS[e].color : 'var(--ink-4)' } }, e ? ESC_ESTADOS[e].corto : '·');
            })
          );
        }))
      ))
    )
  );
}

function EscAsistencias(props) {
  var R = React;
  var s1 = R.useState('pase'), tab = s1[0], setTab = s1[1];
  return _hE('div', { className: 'card' },
    _hE('div', { className: 'card-header' },
      _hE('div', {}, _hE('div', { className: 'card-title' }, 'Asistencias'),
        _hE('div', { className: 'card-sub' }, 'Pase de lista diario por grupo'))),
    _hE(EscTabs, { valor: tab, onCambio: setTab, tabs: [{ id: 'pase', label: 'Pasar lista' }, { id: 'reporte', label: 'Reporte' }] }),
    tab === 'pase' ? _hE(EscPaseLista, props) : _hE(EscReporteAsistencia, props)
  );
}

/* ───────────────────────── Calificaciones ───────────────────────── */

function EscCaptura(props) {
  var R = React;
  var cat = props.cat, api = props.api;
  var asigs = cat.asignaciones;
  var s1 = R.useState(asigs[0] ? asigs[0].id : ''), gmId = s1[0], setGmId = s1[1];
  var s2 = R.useState(null), sab = s2[0], setSab = s2[1];
  var s3 = R.useState({}), cambios = s3[0], setCambios = s3[1];
  var s4 = R.useState(''), err = s4[0], setErr = s4[1];
  var s5 = R.useState(''), ok = s5[0], setOk = s5[1];
  var s6 = R.useState(false), guardando = s6[0], setGuardando = s6[1];

  var cargar = function () {
    if (!gmId) return;
    setSab(null); setCambios({}); setErr('');
    api('escolar_calificaciones_obtener', { grupo_materia_id: gmId }).then(setSab).catch(function (e) { setErr(e.message); });
  };
  R.useEffect(function () { setOk(''); cargar(); /* eslint-disable-next-line */ }, [gmId]);

  var valor = function (a, p) {
    var k = a.id + '_' + p.id;
    if (cambios[k] !== undefined) return cambios[k];
    var c = a.calificaciones[p.id];
    return c && c.calificacion !== null ? String(c.calificacion) : '';
  };
  var nCambios = Object.keys(cambios).length;
  var guardar = async function () {
    setErr(''); setOk(''); setGuardando(true);
    try {
      var registros = Object.keys(cambios).map(function (k) {
        var p = k.split('_');
        var alumno = sab.alumnos.find(function (a) { return a.id === Number(p[0]); });
        var previa = alumno && alumno.calificaciones[p[1]];
        return { cliente_id: Number(p[0]), periodo_id: Number(p[1]), calificacion: cambios[k], observacion: previa ? previa.observacion : '' };
      });
      var r = await api('escolar_calificaciones_guardar', { grupo_materia_id: gmId, registros: registros });
      setOk('Calificaciones guardadas (' + r.guardados + ').');
      cargar();
    } catch (e) { setErr(e.message); } finally { setGuardando(false); }
  };
  var togglePeriodo = async function (p) {
    if (!confirm((p.cerrado ? '¿Reabrir ' : '¿Cerrar ') + p.nombre + '? ' + (p.cerrado ? 'Los docentes podrán volver a modificar calificaciones.' : 'Los docentes ya no podrán modificar calificaciones de este periodo.'))) return;
    try { await api('escolar_cerrar_periodo', { periodo_id: p.id, cerrado: !p.cerrado }); cargar(); props.recargar(); }
    catch (e) { setErr(e.message); }
  };
  var exportar = function () {
    var cab = ['Alumno', 'Matrícula'].concat(sab.periodos.map(function (p) { return p.nombre; }), ['Promedio']);
    var filas = sab.alumnos.map(function (a) {
      return [a.nombre, a.matricula || ''].concat(sab.periodos.map(function (p) { var c = a.calificaciones[p.id]; return c && c.calificacion !== null ? c.calificacion : ''; }), [a.promedio === null ? '' : a.promedio]);
    });
    CSVExport.descargar('calificaciones_' + (sab.asignacion.grupo + '_' + sab.asignacion.materia).replace(/\W+/g, '_') + '.csv', [cab].concat(filas));
  };

  if (!asigs.length) return _hE(EscVacio, { icon: 'productos', titulo: 'Sin materias asignadas', sub: cat.puede_gestionar ? 'Asigna materias a los grupos desde “Grupos y horarios”.' : 'Todavía no tienes materias asignadas en este ciclo.' });
  var aprob = sab ? sab.ciclo.calif_aprobatoria : 6;

  return _hE('div', {},
    _hE('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', marginBottom: 14 } },
      _hE(EscCampo, { label: 'Grupo y materia', style: { margin: 0, flex: '1 1 280px' } }, _hE('select', {
        className: 'form-select', value: gmId,
        onChange: function (e) {
          if (nCambios && !confirm('Tienes cambios sin guardar. ¿Descartarlos?')) return;
          setGmId(Number(e.target.value));
        }
      }, asigs.map(function (a) { return _hE('option', { key: a.id, value: a.id }, a.grupo + ' · ' + a.materia + (a.docente ? ' (' + a.docente + ')' : '') + (a.puedo_calificar ? '' : ' — solo lectura')); }))),
      sab && sab.alumnos.length ? _hE('button', { className: 'btn btn-ghost btn-sm', onClick: exportar }, _hE(Icon, { name: 'download', size: 14, color: 'currentColor' }), ' Exportar CSV') : null
    ),
    sab ? _hE('div', { style: { fontSize: 12, color: 'var(--ink-3)', marginBottom: 10 } },
      'Escala ' + sab.ciclo.escala_min + ' a ' + sab.ciclo.escala_max + ' · aprueba con ' + aprob + '. Deja una celda vacía para borrar la calificación.') : null,
    _hE(EscError, { msg: err }),
    !sab ? (err ? null : _hE('div', { style: { padding: 20, color: 'var(--ink-3)' } }, 'Cargando…'))
      : sab.alumnos.length === 0 ? _hE(EscVacio, { icon: 'alumnos', titulo: 'El grupo no tiene alumnos inscritos' })
      : _hE('div', { className: 'table-wrap' }, _hE('table', {},
          _hE('thead', {}, _hE('tr', {},
            _hE('th', {}, 'Alumno'),
            sab.periodos.map(function (p) {
              return _hE('th', { key: p.id, style: { textAlign: 'center' } },
                p.nombre,
                cat.puede_gestionar
                  ? _hE('button', { className: 'btn btn-ghost btn-sm', style: { padding: '0 4px', marginLeft: 4 }, title: p.cerrado ? 'Cerrado — clic para reabrir' : 'Abierto — clic para cerrar', onClick: function () { togglePeriodo(p); } }, p.cerrado ? '🔒' : '🔓')
                  : (p.cerrado ? ' 🔒' : ''));
            }),
            _hE('th', { style: { textAlign: 'center' } }, 'Promedio')
          )),
          _hE('tbody', {}, sab.alumnos.map(function (a) {
            return _hE('tr', { key: a.id },
              _hE('td', { style: { fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap' } }, a.nombre),
              sab.periodos.map(function (p) {
                var v = valor(a, p);
                var k = a.id + '_' + p.id;
                var modificado = cambios[k] !== undefined;
                return _hE('td', { key: p.id, style: { textAlign: 'center', padding: '6px' } },
                  p.editable
                    ? _hE('input', {
                        type: 'number', step: '0.1', min: sab.ciclo.escala_min, max: sab.ciclo.escala_max, value: v,
                        onChange: function (e) { var val = e.target.value; setCambios(function (c) { var n = Object.assign({}, c); n[k] = val; return n; }); setOk(''); },
                        style: {
                          width: 68, textAlign: 'center', padding: '6px', borderRadius: 8, fontWeight: 600,
                          border: '1px solid ' + (modificado ? 'var(--accent)' : 'var(--border-glow)'),
                          background: modificado ? 'var(--accent-glow)' : 'var(--bg-surface, transparent)',
                          color: escColorCal(v, aprob)
                        }
                      })
                    : _hE('span', { style: { fontWeight: 600, color: escColorCal(v, aprob) } }, v === '' ? '—' : escFmtCal(v))
                );
              }),
              _hE('td', { style: { textAlign: 'center', fontWeight: 800, color: escColorCal(a.promedio, aprob) } }, escFmtCal(a.promedio))
            );
          }))
        )),
    _hE(EscOk, { msg: ok }),
    sab && sab.periodos.some(function (p) { return p.editable; }) ? _hE('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 } },
      nCambios ? _hE('button', { className: 'btn btn-secondary', onClick: function () { setCambios({}); } }, 'Descartar') : null,
      _hE('button', { className: 'btn btn-primary', disabled: !nCambios || guardando, onClick: guardar }, guardando ? 'Guardando…' : 'Guardar ' + (nCambios ? '(' + nCambios + ')' : ''))
    ) : null
  );
}

function EscReporteGrupo(props) {
  var R = React;
  var cat = props.cat, api = props.api;
  var s1 = R.useState(cat.grupos[0] ? cat.grupos[0].id : ''), grupoId = s1[0], setGrupoId = s1[1];
  var s2 = R.useState(null), rep = s2[0], setRep = s2[1];
  var s3 = R.useState(''), err = s3[0], setErr = s3[1];
  var s4 = R.useState(null), boleta = s4[0], setBoleta = s4[1];
  var s5 = R.useState(false), soloRiesgo = s5[0], setSoloRiesgo = s5[1];

  R.useEffect(function () {
    if (!grupoId) return;
    setRep(null); setErr('');
    api('escolar_resumen_grupo', { grupo_id: grupoId }).then(setRep).catch(function (e) { setErr(e.message); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupoId]);

  var exportar = function () {
    var filas = [['Alumno', 'Matrícula', 'Promedio', 'Materias reprobadas', '% asistencia', 'Faltas', 'En riesgo']].concat(rep.alumnos.map(function (a) {
      return [a.nombre, a.matricula || '', a.promedio_general === null ? '' : a.promedio_general, a.materias_reprobadas, a.asistencia.porcentaje === null ? '' : a.asistencia.porcentaje, a.asistencia.falta, a.en_riesgo ? 'Sí' : 'No'];
    }));
    CSVExport.descargar('reporte_' + rep.grupo.nombre.replace(/\W+/g, '_') + '.csv', filas);
  };

  if (!cat.grupos.length) return _hE(EscVacio, { titulo: 'Sin grupos' });
  var aprob = rep ? rep.ciclo.calif_aprobatoria : 6;
  var alumnos = rep ? rep.alumnos.filter(function (a) { return !soloRiesgo || a.en_riesgo; }) : [];
  return _hE('div', {},
    _hE('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', marginBottom: 14 } },
      _hE(EscCampo, { label: 'Grupo', style: { margin: 0, flex: '1 1 220px' } }, _hE('select', { className: 'form-select', value: grupoId, onChange: function (e) { setGrupoId(Number(e.target.value)); } },
        cat.grupos.map(function (g) { return _hE('option', { key: g.id, value: g.id }, g.nombre + (g.nivel ? ' · ' + g.nivel : '')); }))),
      _hE('label', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-2)' } },
        _hE('input', { type: 'checkbox', checked: soloRiesgo, onChange: function (e) { setSoloRiesgo(e.target.checked); } }), 'Solo alumnos en riesgo'),
      rep && rep.alumnos.length ? _hE('button', { className: 'btn btn-ghost btn-sm', onClick: exportar }, _hE(Icon, { name: 'download', size: 14, color: 'currentColor' }), ' Exportar CSV') : null
    ),
    _hE(EscError, { msg: err }),
    !rep ? (err ? null : _hE('div', { style: { padding: 20, color: 'var(--ink-3)' } }, 'Calculando…')) : _hE('div', {},
      _hE('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 } },
        _hE(EscStat, { label: 'Promedio del grupo', valor: escFmtCal(rep.promedio_grupo), color: escColorCal(rep.promedio_grupo, aprob) }),
        _hE(EscStat, { label: 'Alumnos', valor: rep.alumnos.length }),
        _hE(EscStat, { label: 'En riesgo', valor: rep.en_riesgo, color: rep.en_riesgo ? 'var(--red)' : undefined })
      ),
      _hE('div', { style: { fontSize: 12, color: 'var(--ink-3)', marginBottom: 8 } }, 'En riesgo = al menos una materia reprobada o asistencia menor al 85% en el ciclo.'),
      _hE('div', { className: 'table-wrap', style: { marginBottom: 18 } }, _hE('table', {},
        _hE('thead', {}, _hE('tr', {}, _hE('th', {}, 'Alumno'), _hE('th', {}, 'Promedio'), _hE('th', {}, 'Reprobadas'), _hE('th', {}, 'Asistencia'), _hE('th', {}, 'Faltas'), _hE('th', {}, ''), _hE('th', {}, ''))),
        _hE('tbody', {}, alumnos.map(function (a) {
          return _hE('tr', { key: a.id },
            _hE('td', { style: { fontWeight: 600, color: 'var(--ink)' } }, a.nombre),
            _hE('td', { style: { fontWeight: 700, color: escColorCal(a.promedio_general, aprob) } }, escFmtCal(a.promedio_general)),
            _hE('td', { style: { color: a.materias_reprobadas ? 'var(--red)' : undefined } }, a.materias_reprobadas),
            _hE('td', { style: { color: a.asistencia.porcentaje !== null && a.asistencia.porcentaje < 85 ? 'var(--red)' : undefined } }, a.asistencia.porcentaje === null ? '—' : a.asistencia.porcentaje + '%'),
            _hE('td', {}, a.asistencia.falta),
            _hE('td', {}, a.en_riesgo ? _hE('span', { className: 'badge badge-red' }, 'Riesgo') : _hE('span', { className: 'badge badge-green' }, 'OK')),
            _hE('td', { style: { textAlign: 'right' } }, _hE('button', { className: 'btn btn-ghost btn-sm', onClick: function () { setBoleta(a.id); } }, 'Boleta'))
          );
        }))
      )),
      rep.materias.length ? _hE('div', {},
        _hE('div', { style: { fontWeight: 700, fontSize: 13, marginBottom: 8, color: 'var(--ink)' } }, 'Por materia'),
        _hE('div', { className: 'table-wrap' }, _hE('table', {},
          _hE('thead', {}, _hE('tr', {}, _hE('th', {}, 'Materia'), _hE('th', {}, 'Docente'), _hE('th', {}, 'Promedio'), _hE('th', {}, 'Evaluados'), _hE('th', {}, 'Reprobados'))),
          _hE('tbody', {}, rep.materias.map(function (m) {
            return _hE('tr', { key: m.materia },
              _hE('td', { style: { fontWeight: 600, color: 'var(--ink)' } }, m.materia),
              _hE('td', {}, m.docente || '—'),
              _hE('td', { style: { fontWeight: 700, color: escColorCal(m.promedio, aprob) } }, escFmtCal(m.promedio)),
              _hE('td', {}, m.evaluados),
              _hE('td', { style: { color: m.reprobados ? 'var(--red)' : undefined } }, m.reprobados)
            );
          }))
        ))
      ) : null
    ),
    boleta ? _hE(EscBoletaModal, { api: api, clienteId: boleta, cicloId: cat.ciclo_id, onCerrar: function () { setBoleta(null); } }) : null
  );
}

function EscCalificaciones(props) {
  var R = React;
  var s1 = R.useState('captura'), tab = s1[0], setTab = s1[1];
  return _hE('div', { className: 'card' },
    _hE('div', { className: 'card-header' },
      _hE('div', {}, _hE('div', { className: 'card-title' }, 'Calificaciones'),
        _hE('div', { className: 'card-sub' }, 'Captura por materia y periodo · boletas · alumnos en riesgo'))),
    _hE(EscTabs, { valor: tab, onCambio: setTab, tabs: [{ id: 'captura', label: 'Capturar' }, { id: 'reporte', label: 'Reporte del grupo y boletas' }] }),
    tab === 'captura' ? _hE(EscCaptura, props) : _hE(EscReporteGrupo, props)
  );
}

/* ───────────────────────── Contenedor ───────────────────────── */

function ControlEscolar(props) {
  var R = React;
  var escuela_id = props.escuela_id;
  var s1 = R.useState(null), cat = s1[0], setCat = s1[1];
  var s2 = R.useState(''), error = s2[0], setError = s2[1];

  var api = R.useCallback(function (accion, cuerpo) {
    return escApi(accion, Object.assign({}, cuerpo || {}, { escuela_id: escuela_id }));
  }, [escuela_id]);

  var recargar = R.useCallback(function (cicloId) {
    setError('');
    return api('escolar_catalogos', { ciclo_id: cicloId || (cat && cat.ciclo_id) || undefined })
      .then(setCat).catch(function (e) { setError(e.message); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, cat && cat.ciclo_id]);

  R.useEffect(function () {
    if (!escuela_id) return;
    setCat(null);
    api('escolar_catalogos', {}).then(setCat).catch(function (e) { setError(e.message); });
  }, [escuela_id, api]);

  if (!escuela_id) {
    return _hE('div', { className: 'card', style: { textAlign: 'center', padding: 40, color: 'var(--ink-3)' } }, 'Selecciona un colegio para ver su control escolar.');
  }
  if (error && !cat) return _hE('div', { className: 'card' }, _hE(EscError, { msg: error }));
  if (!cat) {
    return _hE('div', { className: 'card', style: { padding: 30, color: 'var(--ink-3)', textAlign: 'center' } },
      typeof Cargando !== 'undefined' ? _hE(Cargando, { variante: 'simple', texto: 'Cargando control escolar…' }) : 'Cargando…');
  }

  var seccion = props.seccion || 'grupos';
  var sinCiclo = cat.ciclos.length === 0 && seccion !== 'config';
  // [F4] soloLectura (dirección): las secciones esconden lo que captura. El servidor
  // también lo niega (allowlist de api.php y escolar_ctx).
  var sub = { cat: cat, api: api, recargar: recargar, user: props.user, soloLectura: !!props.soloLectura };

  var selectorCiclo = cat.ciclos.length > 1 && seccion !== 'config'
    ? _hE('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, justifyContent: 'flex-end' } },
        _hE('span', { style: { fontSize: 12.5, color: 'var(--ink-3)' } }, 'Ciclo escolar:'),
        _hE('select', {
          className: 'form-select', style: { width: 200 }, value: cat.ciclo_id || '',
          onChange: function (e) { recargar(Number(e.target.value)); }
        }, cat.ciclos.map(function (c) { return _hE('option', { key: c.id, value: c.id }, c.nombre + (c.actual ? ' (en curso)' : '')); })))
    : null;

  var cuerpo;
  if (sinCiclo) {
    cuerpo = _hE('div', { className: 'card' }, _hE(EscVacio, {
      titulo: 'Aún no hay un ciclo escolar',
      sub: cat.puede_gestionar
        ? 'Empieza en “Ciclos, materias y aulas”: crea el ciclo en curso con sus periodos, las materias y las aulas. Después arma los grupos.'
        : 'La administración del colegio todavía no configura el ciclo escolar.'
    }, cat.puede_gestionar && props.onIrA ? _hE('button', { className: 'btn btn-primary', style: { marginTop: 12 }, onClick: function () { props.onIrA('escolar_config'); } }, 'Configurar ciclo escolar') : null));
  } else if (seccion === 'config') {
    cuerpo = cat.puede_gestionar ? _hE(EscConfig, sub) : _hE('div', { className: 'card' }, 'Sin acceso.');
  } else if (seccion === 'asistencias') {
    cuerpo = _hE(EscAsistencias, sub);
  } else if (seccion === 'calificaciones') {
    cuerpo = _hE(EscCalificaciones, sub);
  } else {
    cuerpo = _hE(EscGrupos, sub);
  }

  // [F3] Ciclo cerrado: se consulta pero no se captura (el servidor también lo impide).
  var cicloVisto = cat.ciclos.find(function (c) { return c.id === cat.ciclo_id; });
  var avisoCerrado = cicloVisto && cicloVisto.cerrado && seccion !== 'config'
    ? _hE('div', { style: { marginBottom: 12, padding: '9px 12px', fontSize: 12.5, borderRadius: 'var(--radius-sm)', color: 'var(--ink-2)', background: 'var(--amber-glow)', border: '1px solid rgba(217,119,6,.2)' } },
        'El ciclo ' + cicloVisto.nombre + ' está cerrado: solo se puede consultar. La administración puede reabrirlo desde Ciclos, materias y aulas.')
    : null;

  return _hE('div', {},
    error ? _hE(EscError, { msg: error }) : null,
    selectorCiclo,
    avisoCerrado,
    // key por ciclo: al cambiar de ciclo se reinician los selectores internos
    // (grupo elegido, materia elegida) en vez de apuntar a ids de otro ciclo.
    _hE('div', { key: 'c' + (cat.ciclo_id || 0) + seccion }, cuerpo)
  );
}
