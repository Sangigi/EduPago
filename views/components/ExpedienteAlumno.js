/* views/components/ExpedienteAlumno.js — Expediente del alumno (F2, 18-nov-2026)
 *
 * Modal con tres pestañas:
 *   · Datos       → datos personales, médicos y observaciones
 *                   (alumno_expediente_obtener / alumno_expediente_guardar);
 *   · Tutores     → varios tutores por alumno con sus banderas (recoger,
 *                   emergencia, paga, vive con él) — alumno_tutor*;
 *   · Documentos  → acta, CURP, boletas… en uploads_privados/, que solo se
 *                   abren por alumno_documento_descargar con sesión.
 *
 * Además exporta AvisoPrivacidadFamilia: el aviso que ve la familia en su
 * portal por cada hijo que aún no tiene aceptado el aviso de privacidad.
 *
 * Los datos médicos NO vienen en data/cargar_datos (se quitan ahí mismo): este
 * modal los pide bajo demanda y no los copia al estado global de la app.
 *
 * La seguridad NO depende de esconder botones: cada acción alumno_*.php valida
 * rol + escuela del alumno (lib/helpers_expediente.php). El servidor responde
 * `puede_editar` y aquí solo se usa para no enseñar botones que darían 403.
 *
 * `var` en la raíz y React.createElement directo, como FichaTecnica.js: un
 * const a nivel raíz tumba la app si el archivo se carga dos veces. Los
 * nombres globales llevan prefijo Exp para no chocar con otras vistas.
 */
var _hEx = React.createElement;

// Espejo de EXPEDIENTE_ROLES_LECTURA (lib/helpers_expediente.php). Solo decide
// si se pinta el botón "Expediente"; el servidor vuelve a validar.
var EXP_ROLES_LECTURA = ['superadmin', 'admin', 'control_escolar', 'direccion'];
function expedientePuedeVer(rol) { return EXP_ROLES_LECTURA.indexOf(rol) !== -1; }

var EXP_SEXOS = [['', '—'], ['H', 'Hombre'], ['M', 'Mujer'], ['X', 'No binario']];
var EXP_CURP_RE = /^[A-Z]{4}\d{6}[HMX][A-Z]{5}[0-9A-Z]\d$/;

function expToken() {
  return (typeof AuthController !== 'undefined' && AuthController.getToken) ? (AuthController.getToken() || '') : '';
}
function expSesionVencida() {
  if (typeof AuthController !== 'undefined' && AuthController.logout) AuthController.logout();
  window.location.reload();
}

// Igual que ApiClient.post, pero conserva el mensaje del servidor en un 403 o
// 404 (ApiClient lo convierte en "HTTP 403" y el usuario no sabría por qué).
async function expApi(accion, cuerpo) {
  var token = expToken();
  var res = await fetch('api.php?action=' + accion, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': token ? 'Bearer ' + token : '' },
    body: JSON.stringify(cuerpo || {})
  });
  if (res.status === 401) { expSesionVencida(); throw new Error('Sesión expirada. Inicia sesión de nuevo.'); }
  var json = null;
  try { json = await res.json(); } catch (e) { json = null; }
  if (!json || !json.success) {
    throw new Error((json && json.error) || ('No se pudo completar la operación (HTTP ' + res.status + ').'));
  }
  return json;
}

function expFmtFecha(f) {
  if (!f) return '—';
  var s = String(f);
  var p = s.slice(0, 10).split('-');
  if (p.length !== 3) return s;
  var hora = s.length > 10 ? ' ' + s.slice(11, 16) : '';
  return p[2] + '/' + p[1] + '/' + p[0] + hora;
}
function expFmtBytes(n) {
  if (n === null || n === undefined) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}

/* ───────────────────────── Piezas compartidas ───────────────────────── */

function ExpCampo(props) {
  return _hEx('div', { className: 'form-group', style: Object.assign({ marginBottom: 12 }, props.style || {}) },
    _hEx('label', { className: 'form-label' }, props.label),
    props.children,
    props.ayuda ? _hEx('div', { style: { fontSize: 11.5, color: 'var(--ink-4)', marginTop: 4, lineHeight: 1.5 } }, props.ayuda) : null
  );
}

function ExpMensaje(props) {
  if (!props.msg) return null;
  var ok = props.tipo === 'ok';
  return _hEx('div', {
    style: {
      marginTop: 10, padding: '9px 12px', fontSize: 12.5, borderRadius: 'var(--radius-sm)',
      color: ok ? 'var(--green-dark, var(--green))' : 'var(--red)',
      background: ok ? 'var(--green-glow)' : 'var(--red-glow)',
      border: ok ? '1px solid rgba(47,158,68,.2)' : '1px solid rgba(220,38,38,.2)'
    }
  }, props.msg);
}

function ExpSeccion(props) {
  return _hEx('div', { style: { margin: '6px 0 10px', fontSize: 11.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--ink-3)' } },
    props.children);
}

var EXP_GRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', columnGap: 12 };

/* ───────────────────────── Pestaña: Datos ───────────────────────── */

var EXP_CAMPOS_DATOS = ['curp', 'sexo', 'fecha_nac', 'nacionalidad', 'lugar_nacimiento', 'escuela_procedencia',
  'tipo_sangre', 'seguro_medico', 'alergias', 'padecimientos', 'medicamentos', 'observaciones'];

function expFormDesde(exp) {
  var f = {};
  EXP_CAMPOS_DATOS.forEach(function (k) {
    var v = exp && exp[k] !== null && exp[k] !== undefined ? String(exp[k]) : '';
    f[k] = k === 'fecha_nac' ? v.slice(0, 10) : v;
  });
  return f;
}

function ExpDatos(props) {
  var useState = React.useState, useEffect = React.useEffect;
  var exp = props.exp;
  var _f = useState(expFormDesde(exp)), f = _f[0], setF = _f[1];
  var _g = useState(false), guardando = _g[0], setGuardando = _g[1];
  var _e = useState(''), err = _e[0], setErr = _e[1];
  var _o = useState(''), ok = _o[0], setOk = _o[1];
  useEffect(function () { setF(expFormDesde(exp)); }, [exp]);

  var ro = !props.puedeEditar;
  var set = function (k, v) { setOk(''); setF(function (o) { var n = Object.assign({}, o); n[k] = v; return n; }); };
  var input = function (k, extra) {
    return _hEx('input', Object.assign({
      className: 'form-input', value: f[k], disabled: ro,
      onChange: function (e) { set(k, e.target.value); }
    }, extra || {}));
  };
  var area = function (k, maxLength) {
    return _hEx('textarea', {
      className: 'form-input', value: f[k], disabled: ro, rows: 2, maxLength: maxLength,
      style: { resize: 'vertical', minHeight: 54 },
      onChange: function (e) { set(k, e.target.value); }
    });
  };

  // Manda SOLO lo que cambió: alumno_expediente_guardar es parcial y así no
  // pisa con un valor viejo lo que otra pantalla acaba de guardar.
  var guardar = async function () {
    setErr(''); setOk('');
    var original = expFormDesde(exp);
    var cambios = {};
    EXP_CAMPOS_DATOS.forEach(function (k) {
      if ((f[k] || '').trim() !== (original[k] || '').trim()) cambios[k] = f[k];
    });
    if (Object.keys(cambios).length === 0) { setOk('No hay cambios que guardar.'); return; }
    if (cambios.curp !== undefined) {
      cambios.curp = cambios.curp.trim().toUpperCase();
      if (cambios.curp && !EXP_CURP_RE.test(cambios.curp)) {
        setErr('La CURP no es válida: debe tener 18 caracteres (por ejemplo GALA090315MDFPNB08).');
        return;
      }
    }
    setGuardando(true);
    try {
      var r = await expApi('alumno_expediente_guardar', Object.assign({ cliente_id: exp.id }, cambios));
      props.onGuardado(r.expediente);
      setOk('Expediente guardado.');
    } catch (e) { setErr(e.message); } finally { setGuardando(false); }
  };

  var aviso = exp.aviso_privacidad_aceptado_en
    ? _hEx('span', { className: 'badge badge-green' },
        'Aviso de privacidad aceptado el ' + expFmtFecha(exp.aviso_privacidad_aceptado_en)
        + (exp.aviso_privacidad_aceptado_por_nombre ? ' por ' + exp.aviso_privacidad_aceptado_por_nombre : ''))
    : _hEx('span', { className: 'badge badge-amber' },
        'Aviso de privacidad pendiente: la familia lo acepta desde su portal');

  return _hEx('div', null,
    _hEx('div', { style: { marginBottom: 14 } }, aviso),
    _hEx(ExpSeccion, null, 'Datos personales'),
    _hEx('div', { style: EXP_GRID },
      _hEx(ExpCampo, { label: 'CURP' }, input('curp', { maxLength: 18, placeholder: '18 caracteres', style: { textTransform: 'uppercase', fontFamily: 'var(--mono)' } })),
      _hEx(ExpCampo, { label: 'Sexo' },
        _hEx('select', { className: 'form-select', value: f.sexo, disabled: ro, onChange: function (e) { set('sexo', e.target.value); } },
          EXP_SEXOS.map(function (s) { return _hEx('option', { key: s[0], value: s[0] }, s[1]); }))),
      _hEx(ExpCampo, { label: 'Fecha de nacimiento' }, input('fecha_nac', { type: 'date' })),
      _hEx(ExpCampo, { label: 'Nacionalidad' }, input('nacionalidad', { maxLength: 60, placeholder: 'Mexicana' })),
      _hEx(ExpCampo, { label: 'Lugar de nacimiento' }, input('lugar_nacimiento', { maxLength: 120, placeholder: 'Ciudad, estado' })),
      _hEx(ExpCampo, { label: 'Escuela de procedencia' }, input('escuela_procedencia', { maxLength: 150 }))
    ),
    _hEx(ExpSeccion, null, 'Datos médicos'),
    _hEx('div', { style: { fontSize: 11.5, color: 'var(--ink-4)', marginTop: -6, marginBottom: 10, lineHeight: 1.5 } },
      'Solo los ve el personal autorizado del colegio. No viajan en la carga general del sistema ni quedan en la bitácora.'),
    _hEx('div', { style: EXP_GRID },
      _hEx(ExpCampo, { label: 'Tipo de sangre' },
        _hEx('select', { className: 'form-select', value: f.tipo_sangre, disabled: ro, onChange: function (e) { set('tipo_sangre', e.target.value); } },
          [_hEx('option', { key: '', value: '' }, '—')].concat((props.tiposSangre || []).map(function (t) {
            return _hEx('option', { key: t, value: t }, t);
          })))),
      _hEx(ExpCampo, { label: 'Seguro médico' }, input('seguro_medico', { maxLength: 150, placeholder: 'IMSS, ISSSTE, aseguradora y póliza…' }))
    ),
    _hEx(ExpCampo, { label: 'Alergias' }, area('alergias', 255)),
    _hEx(ExpCampo, { label: 'Padecimientos' }, area('padecimientos', 500)),
    _hEx(ExpCampo, { label: 'Medicamentos' }, area('medicamentos', 500)),
    _hEx(ExpSeccion, null, 'Observaciones'),
    _hEx(ExpCampo, { label: 'Notas internas del colegio' }, area('observaciones', 5000)),
    _hEx(ExpMensaje, { msg: err }),
    _hEx(ExpMensaje, { msg: ok, tipo: 'ok' }),
    props.puedeEditar ? _hEx('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: 12 } },
      _hEx('button', { className: 'btn btn-primary', disabled: guardando, onClick: guardar }, guardando ? 'Guardando…' : 'Guardar expediente')
    ) : null
  );
}

/* ───────────────────────── Pestaña: Tutores ───────────────────────── */

var EXP_TUTOR_VACIO = {
  nombre: '', parentesco: '', email: '', telefono: '', telefono_alt: '',
  es_contacto_emergencia: false, autorizado_recoger: false, responsable_pago: false, vive_con_alumno: false, notas: ''
};
var EXP_BANDERAS_TUTOR = [
  ['responsable_pago', 'Responsable de pago', 'badge-blue'],
  ['autorizado_recoger', 'Autorizado para recoger', 'badge-green'],
  ['es_contacto_emergencia', 'Contacto de emergencia', 'badge-red'],
  ['vive_con_alumno', 'Vive con el alumno', 'badge-gray']
];

function ExpTutorForm(props) {
  var useState = React.useState;
  var inicial = Object.assign({}, EXP_TUTOR_VACIO);
  Object.keys(EXP_TUTOR_VACIO).forEach(function (k) {
    if (props.tutor && props.tutor[k] !== null && props.tutor[k] !== undefined) inicial[k] = props.tutor[k];
  });
  var _f = useState(inicial), f = _f[0], setF = _f[1];
  var _g = useState(false), guardando = _g[0], setGuardando = _g[1];
  var _e = useState(''), err = _e[0], setErr = _e[1];
  var set = function (k, v) { setF(function (o) { var n = Object.assign({}, o); n[k] = v; return n; }); };
  var fam = props.familia;

  var guardar = async function () {
    setErr('');
    if (!String(f.nombre || '').trim()) { setErr('Escribe el nombre del tutor.'); return; }
    // Se arma el cuerpo a mano: usuario_id NO se manda (el servidor solo lo
    // toca si viene, y esta vista no administra cuentas del portal).
    var cuerpo = {
      cliente_id: props.clienteId,
      nombre: f.nombre, parentesco: f.parentesco, email: f.email, telefono: f.telefono, telefono_alt: f.telefono_alt,
      es_contacto_emergencia: !!f.es_contacto_emergencia, autorizado_recoger: !!f.autorizado_recoger,
      responsable_pago: !!f.responsable_pago, vive_con_alumno: !!f.vive_con_alumno, notas: f.notas
    };
    if (props.tutor && props.tutor.id) cuerpo.id = props.tutor.id;
    setGuardando(true);
    try {
      await expApi('alumno_tutor_guardar', cuerpo);
      props.onGuardado();
    } catch (e) { setErr(e.message); setGuardando(false); }
  };

  return _hEx('div', {
    style: { padding: 14, borderRadius: 'var(--radius)', border: '1px solid var(--border-glow)', background: 'var(--glass-light)', marginBottom: 14 }
  },
    _hEx('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 } },
      _hEx('div', { style: { fontWeight: 600, fontSize: 13.5 } }, props.tutor && props.tutor.id ? 'Editar tutor' : 'Nuevo tutor'),
      // Atajo para el primer tutor: el contacto de la familia ya está
      // capturado y casi siempre es la misma persona.
      (!props.tutor || !props.tutor.id) && fam && fam.contacto ? _hEx('button', {
        className: 'btn btn-ghost btn-sm',
        onClick: function () {
          setF(function (o) {
            return Object.assign({}, o, {
              nombre: fam.contacto || o.nombre, email: fam.email || o.email, telefono: fam.telefono || o.telefono
            });
          });
        }
      }, 'Usar datos de la familia') : null
    ),
    _hEx('div', { style: EXP_GRID },
      _hEx(ExpCampo, { label: 'Nombre completo *' },
        _hEx('input', { className: 'form-input', value: f.nombre, maxLength: 150, onChange: function (e) { set('nombre', e.target.value); } })),
      _hEx(ExpCampo, { label: 'Parentesco' },
        _hEx('select', { className: 'form-select', value: f.parentesco || '', onChange: function (e) { set('parentesco', e.target.value); } },
          [_hEx('option', { key: '', value: '' }, '—')].concat(Object.keys(props.parentescos || {}).map(function (k) {
            return _hEx('option', { key: k, value: k }, props.parentescos[k]);
          })))),
      _hEx(ExpCampo, { label: 'Correo' },
        _hEx('input', { className: 'form-input', type: 'email', value: f.email || '', maxLength: 150, onChange: function (e) { set('email', e.target.value); } })),
      _hEx(ExpCampo, { label: 'Teléfono' },
        _hEx('input', { className: 'form-input', type: 'tel', value: f.telefono || '', maxLength: 25, onChange: function (e) { set('telefono', e.target.value); } })),
      _hEx(ExpCampo, { label: 'Teléfono alterno' },
        _hEx('input', { className: 'form-input', type: 'tel', value: f.telefono_alt || '', maxLength: 25, onChange: function (e) { set('telefono_alt', e.target.value); } }))
    ),
    _hEx('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px 18px', margin: '2px 0 12px' } },
      EXP_BANDERAS_TUTOR.map(function (b) {
        return _hEx('label', { key: b[0], style: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--ink-2)', cursor: 'pointer' } },
          _hEx('input', { type: 'checkbox', checked: !!f[b[0]], onChange: function (e) { set(b[0], e.target.checked); } }),
          b[1]);
      })
    ),
    _hEx(ExpCampo, { label: 'Notas' },
      _hEx('textarea', {
        className: 'form-input', rows: 2, maxLength: 500, value: f.notas || '',
        style: { resize: 'vertical' },
        onChange: function (e) { set('notas', e.target.value); }
      })),
    _hEx(ExpMensaje, { msg: err }),
    _hEx('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 } },
      _hEx('button', { className: 'btn btn-secondary btn-sm', onClick: props.onCancelar }, 'Cancelar'),
      _hEx('button', { className: 'btn btn-primary btn-sm', disabled: guardando, onClick: guardar }, guardando ? 'Guardando…' : 'Guardar tutor')
    )
  );
}

function ExpTutores(props) {
  var useState = React.useState, useEffect = React.useEffect;
  var _l = useState(null), lista = _l[0], setLista = _l[1];
  var _fa = useState(null), familia = _fa[0], setFamilia = _fa[1];
  var _p = useState(props.parentescos || {}), parentescos = _p[0], setParentescos = _p[1];
  var _ed = useState(null), editando = _ed[0], setEditando = _ed[1];   // null | {} (nuevo) | tutor
  var _e = useState(''), err = _e[0], setErr = _e[1];

  var cargar = function () {
    setErr('');
    expApi('alumno_tutores_listar', { cliente_id: props.clienteId }).then(function (r) {
      setLista(r.tutores || []);
      setFamilia(r.familia || null);
      if (r.parentescos) setParentescos(r.parentescos);
      if (props.onConteo) props.onConteo((r.tutores || []).length);
    }).catch(function (e) { setErr(e.message); setLista([]); });
  };
  useEffect(cargar, [props.clienteId]);

  var eliminar = function (t) {
    props.confirmar({
      titulo: 'Dar de baja al tutor',
      mensaje: '¿Dar de baja a ' + t.nombre + '? Dejará de aparecer en el expediente (el registro se conserva como historial).',
      textoConfirmar: 'Dar de baja',
      peligroso: true,
      onConfirmar: async function () {
        try { await expApi('alumno_tutor_eliminar', { id: t.id }); cargar(); }
        catch (e) { setErr(e.message); }
      }
    });
  };

  if (lista === null) return _hEx('div', { style: { padding: 20, fontSize: 13, color: 'var(--ink-3)' } }, 'Cargando tutores…');

  return _hEx('div', null,
    props.puedeEditar && !editando ? _hEx('div', { style: { display: 'flex', justifyContent: 'flex-end', marginBottom: 12 } },
      _hEx('button', { className: 'btn btn-primary btn-sm', onClick: function () { setEditando({}); } },
        _hEx(Icon, { name: 'plus', size: 13, color: 'currentColor' }), ' Agregar tutor')
    ) : null,
    editando ? _hEx(ExpTutorForm, {
      key: editando.id || 'nuevo', tutor: editando, clienteId: props.clienteId, parentescos: parentescos, familia: familia,
      onCancelar: function () { setEditando(null); },
      onGuardado: function () { setEditando(null); cargar(); }
    }) : null,
    _hEx(ExpMensaje, { msg: err }),
    lista.length === 0
      ? _hEx('div', { className: 'empty-state', style: { padding: '28px 16px' } },
          _hEx('div', { className: 'empty-text' }, 'Sin tutores registrados'),
          _hEx('div', { className: 'empty-sub' }, familia && familia.contacto
            ? 'El contacto de la familia es ' + familia.contacto + '. Agrégalo como tutor para indicar si puede recoger al alumno.'
            : 'Registra quién puede recoger al alumno y a quién llamar en una emergencia.'))
      : lista.map(function (t) {
          return _hEx('div', {
            key: t.id,
            style: { padding: '12px 14px', borderRadius: 'var(--radius)', border: '1px solid var(--border-glow)', marginBottom: 10 }
          },
            _hEx('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' } },
              _hEx('div', { style: { minWidth: 0 } },
                _hEx('div', { style: { fontWeight: 600, fontSize: 14 } }, t.nombre,
                  t.parentesco ? _hEx('span', { style: { fontWeight: 400, color: 'var(--ink-3)', fontSize: 12.5 } }, ' · ' + (parentescos[t.parentesco] || t.parentesco)) : null),
                _hEx('div', { style: { fontSize: 12.5, color: 'var(--ink-2)', marginTop: 3, wordBreak: 'break-word' } },
                  [t.telefono, t.telefono_alt, t.email].filter(Boolean).join(' · ') || 'Sin datos de contacto')
              ),
              props.puedeEditar ? _hEx('div', { style: { display: 'flex', gap: 5 } },
                _hEx('button', { className: 'btn btn-ghost btn-sm', title: 'Editar', onClick: function () { setEditando(t); } },
                  _hEx(Icon, { name: 'edit', size: 14, color: 'currentColor' })),
                _hEx('button', { className: 'btn btn-ghost btn-sm', title: 'Dar de baja', onClick: function () { eliminar(t); } },
                  _hEx(Icon, { name: 'trash', size: 14, color: 'currentColor' }))
              ) : null
            ),
            _hEx('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 } },
              EXP_BANDERAS_TUTOR.filter(function (b) { return t[b[0]]; }).map(function (b) {
                return _hEx('span', { key: b[0], className: 'badge ' + b[2] }, b[1]);
              })
            ),
            t.notas ? _hEx('div', { style: { fontSize: 12, color: 'var(--ink-3)', marginTop: 8, whiteSpace: 'pre-wrap' } }, t.notas) : null
          );
        })
  );
}

/* ───────────────────────── Pestaña: Documentos ───────────────────────── */

function ExpDocumentos(props) {
  var useState = React.useState, useEffect = React.useEffect;
  var _l = useState(null), lista = _l[0], setLista = _l[1];
  var _t = useState(props.tiposDocumento || {}), tipos = _t[0], setTipos = _t[1];
  var _m = useState({ max_bytes: null, extensiones: [] }), limites = _m[0], setLimites = _m[1];
  var _tipo = useState(''), tipo = _tipo[0], setTipo = _tipo[1];
  var _a = useState(null), archivo = _a[0], setArchivo = _a[1];
  var _k = useState(0), inputKey = _k[0], setInputKey = _k[1];   // para vaciar el <input type=file>
  var _s = useState(false), subiendo = _s[0], setSubiendo = _s[1];
  var _e = useState(''), err = _e[0], setErr = _e[1];
  var _o = useState(''), ok = _o[0], setOk = _o[1];

  var cargar = function () {
    expApi('alumno_documentos_listar', { cliente_id: props.clienteId }).then(function (r) {
      setLista(r.documentos || []);
      if (r.tipos_documento) setTipos(r.tipos_documento);
      setLimites({ max_bytes: r.max_bytes || null, extensiones: r.extensiones || [] });
      if (props.onConteo) props.onConteo((r.documentos || []).length);
    }).catch(function (e) { setErr(e.message); setLista([]); });
  };
  useEffect(cargar, [props.clienteId]);

  var elegirArchivo = function (e) {
    setErr(''); setOk('');
    var a = e.target.files && e.target.files[0];
    if (!a) { setArchivo(null); return; }
    // Aviso temprano; la validación que cuenta (tamaño, extensión y MIME real
    // leído de los bytes) la hace guardar_archivo_privado() en el servidor.
    var ext = (a.name.split('.').pop() || '').toLowerCase();
    if (limites.extensiones.length && limites.extensiones.indexOf(ext) === -1) {
      setErr('Tipo de archivo no permitido. Sube ' + limites.extensiones.join(', ').toUpperCase() + '.');
      setArchivo(null); setInputKey(function (n) { return n + 1; }); return;
    }
    if (limites.max_bytes && a.size > limites.max_bytes) {
      setErr('El archivo pesa ' + expFmtBytes(a.size) + '; el máximo es ' + expFmtBytes(limites.max_bytes) + '.');
      setArchivo(null); setInputKey(function (n) { return n + 1; }); return;
    }
    setArchivo(a);
  };

  var subir = async function () {
    setErr(''); setOk('');
    if (!tipo) { setErr('Elige qué documento es.'); return; }
    if (!archivo) { setErr('Selecciona el archivo.'); return; }
    setSubiendo(true);
    try {
      // multipart: api.php deja $input vacío y la acción lee $_POST/$_FILES.
      var fd = new FormData();
      fd.append('cliente_id', props.clienteId);
      fd.append('tipo', tipo);
      fd.append('archivo', archivo);
      var token = expToken();
      var res = await fetch('api.php?action=alumno_documento_subir', {
        method: 'POST', headers: { 'Authorization': token ? 'Bearer ' + token : '' }, body: fd
      });
      if (res.status === 401) { expSesionVencida(); return; }
      var json = null;
      try { json = await res.json(); } catch (e2) { json = null; }
      if (!json || !json.success) throw new Error((json && json.error) || 'No se pudo subir el documento (HTTP ' + res.status + ').');
      setOk('Documento subido.');
      setTipo(''); setArchivo(null); setInputKey(function (n) { return n + 1; });
      cargar();
    } catch (e) { setErr(e.message); } finally { setSubiendo(false); }
  };

  // Nunca hay URL directa: se pide por id y la acción valida rol y escuela.
  var ver = function (d) {
    var url = 'api.php?action=alumno_documento_descargar&documento_id=' + encodeURIComponent(d.id);
    if (typeof abrirDocumentoPrivado === 'function') {
      abrirDocumentoPrivado(url, expToken(), d.nombre_original || (d.tipo + '.pdf'), function (m) { setErr(m); });
    } else {
      setErr('No se pudo abrir el visor de documentos. Recarga la página e intenta de nuevo.');
    }
  };

  var eliminar = function (d) {
    props.confirmar({
      titulo: 'Eliminar documento',
      mensaje: '¿Eliminar "' + (d.tipo_nombre || d.tipo) + '"' + (d.nombre_original ? ' (' + d.nombre_original + ')' : '') + '? El archivo se borra del servidor y no se puede recuperar.',
      textoConfirmar: 'Eliminar',
      peligroso: true,
      onConfirmar: async function () {
        setErr(''); setOk('');
        try { await expApi('alumno_documento_eliminar', { id: d.id }); cargar(); }
        catch (e) { setErr(e.message); }
      }
    });
  };

  if (lista === null) return _hEx('div', { style: { padding: 20, fontSize: 13, color: 'var(--ink-3)' } }, 'Cargando documentos…');

  var accept = (limites.extensiones || []).map(function (x) { return '.' + x; }).join(',');

  return _hEx('div', null,
    props.puedeEditar ? _hEx('div', {
      style: { padding: 14, borderRadius: 'var(--radius)', border: '1px solid var(--border-glow)', background: 'var(--glass-light)', marginBottom: 14 }
    },
      _hEx('div', { style: { fontWeight: 600, fontSize: 13.5, marginBottom: 10 } }, 'Subir documento'),
      _hEx('div', { style: EXP_GRID },
        _hEx(ExpCampo, { label: 'Documento' },
          _hEx('select', { className: 'form-select', value: tipo, onChange: function (e) { setTipo(e.target.value); } },
            [_hEx('option', { key: '', value: '' }, 'Elige…')].concat(Object.keys(tipos).map(function (k) {
              return _hEx('option', { key: k, value: k }, tipos[k]);
            })))),
        _hEx(ExpCampo, {
          label: 'Archivo',
          ayuda: (limites.extensiones.length ? limites.extensiones.join(', ').toUpperCase() : 'PDF, JPG o PNG')
            + (limites.max_bytes ? ', máximo ' + expFmtBytes(limites.max_bytes) : '') + '.'
        },
          _hEx('input', { key: inputKey, type: 'file', className: 'form-input', accept: accept || undefined, onChange: elegirArchivo }))
      ),
      _hEx('div', { style: { display: 'flex', justifyContent: 'flex-end' } },
        _hEx('button', { className: 'btn btn-primary btn-sm', disabled: subiendo || !archivo || !tipo, onClick: subir },
          _hEx(Icon, { name: 'upload', size: 13, color: 'currentColor' }), subiendo ? ' Subiendo…' : ' Subir'))
    ) : null,
    _hEx(ExpMensaje, { msg: err }),
    _hEx(ExpMensaje, { msg: ok, tipo: 'ok' }),
    lista.length === 0
      ? _hEx('div', { className: 'empty-state', style: { padding: '28px 16px' } },
          _hEx('div', { className: 'empty-text' }, 'Sin documentos'),
          _hEx('div', { className: 'empty-sub' }, 'Acta de nacimiento, CURP, certificado y boleta anteriores, cartilla de vacunación…'))
      : _hEx('div', { style: { marginTop: 4 } },
          lista.map(function (d) {
            return _hEx('div', {
              key: d.id,
              style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
                       padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-glow)', marginBottom: 8 }
            },
              _hEx('div', { style: { minWidth: 0, flex: '1 1 220px' } },
                _hEx('div', { style: { fontWeight: 600, fontSize: 13.5 } }, d.tipo_nombre || d.tipo),
                _hEx('div', { style: { fontSize: 12, color: 'var(--ink-3)', marginTop: 2, wordBreak: 'break-word' } },
                  [d.nombre_original, expFmtBytes(d.tamano_bytes), expFmtFecha(d.subido_en), d.subido_por_nombre ? 'subió ' + d.subido_por_nombre : null]
                    .filter(Boolean).join(' · '))
              ),
              _hEx('div', { style: { display: 'flex', gap: 5 } },
                _hEx('button', { className: 'btn btn-secondary btn-sm', onClick: function () { ver(d); } },
                  _hEx(Icon, { name: 'eye', size: 13, color: 'currentColor' }), ' Ver'),
                props.puedeEditar ? _hEx('button', { className: 'btn btn-ghost btn-sm', title: 'Eliminar', onClick: function () { eliminar(d); } },
                  _hEx(Icon, { name: 'trash', size: 14, color: 'currentColor' })) : null
              )
            );
          }))
  );
}

/* ───────────────────────── Modal principal ───────────────────────── */

// Props: alumno ({id, nombre, matricula, grado}), onCerrar,
// onActualizado(parche) opcional — recibe SOLO los campos que también viajan
// en cargar_datos (curp, fecha_nac, tipo_sangre, alergias, sexo…) para que la
// vista que lo abrió sincronice su tabla sin volver a pedir todo.
function ExpedienteAlumno(props) {
  var useState = React.useState, useEffect = React.useEffect;
  var alumno = props.alumno || {};
  var _tab = useState('datos'), tab = _tab[0], setTab = _tab[1];
  var _c = useState(true), cargando = _c[0], setCargando = _c[1];
  var _ec = useState(''), errorCarga = _ec[0], setErrorCarga = _ec[1];
  var _x = useState(null), exp = _x[0], setExp = _x[1];
  var _pe = useState(false), puedeEditar = _pe[0], setPuedeEditar = _pe[1];
  var _cat = useState({ tipos_documento: {}, parentescos: {}, tipos_sangre: [] }), cat = _cat[0], setCat = _cat[1];
  var _cn = useState({ tutores: null, documentos: null }), conteos = _cn[0], setConteos = _cn[1];
  var _cf = useState(null), confirmacion = _cf[0], setConfirmacion = _cf[1];

  useEffect(function () {
    setCargando(true); setErrorCarga('');
    expApi('alumno_expediente_obtener', { cliente_id: alumno.id }).then(function (r) {
      setExp(r.expediente);
      setPuedeEditar(!!r.puede_editar);
      setCat({ tipos_documento: r.tipos_documento || {}, parentescos: r.parentescos || {}, tipos_sangre: r.tipos_sangre || [] });
      setConteos(r.conteos || { tutores: null, documentos: null });
    }).catch(function (e) { setErrorCarga(e.message); })
      .finally(function () { setCargando(false); });
  }, [alumno.id]);

  var onGuardado = function (nuevo) {
    if (!nuevo) return;
    setExp(nuevo);
    if (props.onActualizado) {
      // Sin datos médicos: el estado global de la app no debe guardarlos.
      props.onActualizado({
        id: nuevo.id, curp: nuevo.curp, fecha_nac: nuevo.fecha_nac, tipo_sangre: nuevo.tipo_sangre,
        alergias: nuevo.alergias, sexo: nuevo.sexo, nacionalidad: nuevo.nacionalidad,
        lugar_nacimiento: nuevo.lugar_nacimiento, escuela_procedencia: nuevo.escuela_procedencia
      });
    }
  };
  var setConteo = function (k) {
    return function (n) { setConteos(function (o) { var c = Object.assign({}, o); c[k] = n; return c; }); };
  };
  var etiqueta = function (txt, n) { return n === null || n === undefined ? txt : txt + ' (' + n + ')'; };
  var tabs = [
    { id: 'datos', label: 'Datos personales y médicos' },
    { id: 'tutores', label: etiqueta('Tutores', conteos.tutores) },
    { id: 'documentos', label: etiqueta('Documentos', conteos.documentos) }
  ];

  var cuerpo;
  if (cargando) {
    cuerpo = _hEx('div', { style: { padding: 30, textAlign: 'center', fontSize: 13, color: 'var(--ink-3)' } }, 'Cargando expediente…');
  } else if (errorCarga) {
    cuerpo = _hEx(ExpMensaje, { msg: errorCarga });
  } else {
    cuerpo = _hEx('div', null,
      _hEx('div', { className: 'pill-group', style: { marginBottom: 16 } },
        tabs.map(function (t) {
          return _hEx('button', { key: t.id, className: 'pill' + (tab === t.id ? ' active' : ''), onClick: function () { setTab(t.id); } }, t.label);
        })),
      tab === 'datos' ? _hEx(ExpDatos, { exp: exp, puedeEditar: puedeEditar, tiposSangre: cat.tipos_sangre, onGuardado: onGuardado }) : null,
      tab === 'tutores' ? _hEx(ExpTutores, {
        clienteId: alumno.id, puedeEditar: puedeEditar, parentescos: cat.parentescos,
        onConteo: setConteo('tutores'), confirmar: setConfirmacion
      }) : null,
      tab === 'documentos' ? _hEx(ExpDocumentos, {
        clienteId: alumno.id, puedeEditar: puedeEditar, tiposDocumento: cat.tipos_documento,
        onConteo: setConteo('documentos'), confirmar: setConfirmacion
      }) : null
    );
  }

  var subtitulo = [alumno.matricula, alumno.grado].filter(Boolean).join(' · ');

  return _hEx(React.Fragment, null,
    _hEx('div', {
      className: 'modal-backdrop',
      onClick: function (e) { if (e.target === e.currentTarget && props.onCerrar) props.onCerrar(); }
    },
      _hEx('div', { className: 'modal modal-lg', style: { maxWidth: 760 } },
        _hEx('div', { className: 'modal-header' },
          _hEx('div', { style: { minWidth: 0 } },
            _hEx('div', { className: 'modal-title' }, 'Expediente · ' + (alumno.nombre || (exp && exp.nombre) || '')),
            subtitulo ? _hEx('div', { style: { fontSize: 12, color: 'var(--ink-3)', marginTop: 2 } }, subtitulo) : null
          ),
          _hEx('button', { className: 'btn btn-ghost btn-sm', onClick: props.onCerrar, 'aria-label': 'Cerrar' },
            _hEx(Icon, { name: 'close', size: 16, color: 'currentColor' }))
        ),
        _hEx('div', { className: 'modal-body' }, cuerpo)
      )
    ),
    // Fuera del modal (hermano, no hijo): así la confirmación queda encima y
    // no depende de cómo el CSS de .modal posicione a sus descendientes.
    confirmacion && typeof ConfirmModal !== 'undefined' ? _hEx(ConfirmModal, {
      abierto: true,
      titulo: confirmacion.titulo,
      mensaje: confirmacion.mensaje,
      textoConfirmar: confirmacion.textoConfirmar,
      peligroso: !!confirmacion.peligroso,
      onCancelar: function () { setConfirmacion(null); },
      onConfirmar: function () { var c = confirmacion; setConfirmacion(null); c.onConfirmar(); }
    }) : null
  );
}

/* ───────────────────── Portal de la familia: aviso ───────────────────── */

// Aviso por cada hijo que aún no tiene aceptado el aviso de privacidad.
// Solo aparece si cargar_datos ya trae la columna aviso_privacidad_aceptado_en
// (es decir, si ya corrió migracion_2026_11_18_f2_expediente.sql): antes de la
// migración la clave no existe y no se enseña nada.
//
// Props: hijos (misHijos del portal), escuela, onAceptado(cliente_id, fecha).
function AvisoPrivacidadFamilia(props) {
  var useState = React.useState;
  var _a = useState(null), aceptandoId = _a[0], setAceptandoId = _a[1];
  var _e = useState(''), err = _e[0], setErr = _e[1];
  var pendientes = (props.hijos || []).filter(function (h) {
    return h && Object.prototype.hasOwnProperty.call(h, 'aviso_privacidad_aceptado_en') && !h.aviso_privacidad_aceptado_en;
  });
  if (pendientes.length === 0) return null;
  var colegio = (props.escuela && props.escuela.nombre) || 'El colegio';

  var aceptar = async function (h) {
    setErr(''); setAceptandoId(h.id);
    try {
      var r = await expApi('alumno_aviso_privacidad_aceptar', { cliente_id: h.id });
      if (props.onAceptado) props.onAceptado(h.id, r.aviso_privacidad_aceptado_en || new Date().toISOString().slice(0, 19).replace('T', ' '));
    } catch (e) { setErr(e.message); } finally { setAceptandoId(null); }
  };

  return _hEx('div', {
    style: {
      background: 'var(--bg-surface)', borderRadius: 14, border: '1px solid var(--border-glow)',
      boxShadow: '0 2px 12px rgba(40,45,101,.06)', marginBottom: 18, padding: '16px 20px'
    }
  },
    _hEx('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 } },
      _hEx(Icon, { name: 'shield', size: 18, color: 'var(--violet)' }),
      _hEx('div', { style: { fontWeight: 700, fontSize: 15, color: 'var(--ink)' } }, 'Aviso de privacidad')),
    _hEx('div', { style: { fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.55, marginBottom: 10 } },
      colegio + ' guarda el expediente escolar de tus hijos, que incluye datos personales y de salud '
      + '(alergias, padecimientos, medicamentos) y los documentos de inscripción, para fines de control escolar '
      + 'y para atenderlos en caso de emergencia. Al pulsar "Acepto" das tu consentimiento para ese tratamiento. '
      + 'Si quieres conocer el aviso de privacidad completo o ejercer tus derechos de acceso, rectificación, '
      + 'cancelación u oposición, pídelo directamente al colegio.'),
    pendientes.map(function (h) {
      return _hEx('div', {
        key: h.id,
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
                 padding: '8px 0', borderTop: '1px solid var(--border-glow)' }
      },
        _hEx('div', { style: { fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' } }, h.nombre),
        _hEx('button', {
          className: 'btn btn-primary btn-sm', disabled: aceptandoId !== null, onClick: function () { aceptar(h); }
        }, aceptandoId === h.id ? 'Guardando…' : 'Acepto')
      );
    }),
    _hEx(ExpMensaje, { msg: err })
  );
}
