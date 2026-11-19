// views/components/NotasCobranza.js — [OF-3] Notas de cobranza por familia.
//
// Contiene:
//   · NotasCobranza({familia, alumnos, onCerrar, onCambio}): modal con la línea de
//     tiempo de notas de UNA familia (autor y fecha), formulario de nota nueva y
//     de compromiso de pago, y acciones de editar / eliminar / marcar cumplido.
//   · CompromisosPago({escuelaId, onAbrirFamilia}): bloque "Compromisos de pago de
//     hoy y vencidos" de Recordatorios (acciones/compromisos_pago_listar.php).
//
// Solo admin, cajero y superadmin: el servidor valida rol y escuela en cada
// acción (familia_notas_listar, familia_nota_guardar, familia_nota_eliminar,
// familia_nota_cumplida, compromisos_pago_listar). Si la migración de OF-3 no
// se ha corrido, el modal lo avisa y el bloque de Recordatorios no se muestra.
//
// Usa ApiClient (assets/js/ApiClient.js), fmt (views/components/Badge.js) e Icon.

var _hNc = React.createElement;

var NC_TIPOS = [
  { id: 'llamada', label: 'Llamada' },
  { id: 'acuerdo', label: 'Acuerdo' },
  { id: 'correo', label: 'Correo' },
  { id: 'visita', label: 'Visita' },
  { id: 'otro', label: 'Otro' }
];

function ncTipoLabel(id) {
  var t = NC_TIPOS.filter(function (x) { return x.id === id; })[0];
  return t ? t.label : id;
}

function ncHoyISO() {
  var d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

function ncFechaHora(s) { return s ? String(s).replace('T', ' ').slice(0, 16) : ''; }

function ncMoneda(n) { return typeof fmt === 'function' ? fmt(n) : '$' + Number(n || 0).toFixed(2); }

function NcModal(props) {
  return _hNc('div', {
    className: 'modal-backdrop',
    onClick: function (e) { if (e.target === e.currentTarget && props.onCerrar) props.onCerrar(); }
  },
    _hNc('div', { className: 'modal', style: { maxWidth: props.ancho || 620 } },
      _hNc('div', { className: 'modal-header' },
        _hNc('div', null,
          _hNc('div', { className: 'modal-title' }, props.titulo),
          props.sub ? _hNc('div', { style: { fontSize: 12, color: 'var(--ink-3)', marginTop: 2 } }, props.sub) : null),
        _hNc('button', { className: 'btn btn-ghost btn-sm', onClick: props.onCerrar, 'aria-label': 'Cerrar' },
          _hNc(Icon, { name: 'close', size: 16, color: 'currentColor' }))
      ),
      _hNc('div', { className: 'modal-body' }, props.children),
      props.footer ? _hNc('div', { className: 'modal-footer' }, props.footer) : null
    )
  );
}

function ncFormVacio() {
  return { id: null, tipo: 'llamada', texto: '', cliente_id: '', conCompromiso: false, fecha_compromiso: '', monto_compromiso: '' };
}

// props: familia ({id, nombre}), alumnos (alumnos de la familia: [{id, nombre}]), onCerrar, onCambio (opcional)
function NotasCobranza(props) {
  var R = React;
  var familia = props.familia;
  var alumnos = props.alumnos || [];

  var s1 = R.useState(null), notas = s1[0], setNotas = s1[1];   // null = cargando
  var s2 = R.useState(null), form = s2[0], setForm = s2[1];     // formulario (alta o edición)
  var s3 = R.useState(false), ocupado = s3[0], setOcupado = s3[1];
  var s4 = R.useState(''), error = s4[0], setError = s4[1];
  var s5 = R.useState(''), faltaMigracion = s5[0], setFaltaMigracion = s5[1];

  function cargar() {
    ApiClient.post('familia_notas_listar', { familia_id: familia.id }).then(function (r) {
      if (!r.success) { setError(r.error || 'No se pudieron cargar las notas.'); setNotas([]); return; }
      setNotas(r.notas || []);
      setFaltaMigracion(r.falta_migracion ? (r.aviso || 'Falta correr la migración de OF-3.') : '');
    }).catch(function (e) { setError(e.message); setNotas([]); });
  }
  R.useEffect(function () { cargar(); }, [familia.id]);

  function cambio() { cargar(); if (props.onCambio) props.onCambio(); }

  function guardar() {
    setOcupado(true); setError('');
    var cuerpo = {
      id: form.id || undefined, familia_id: familia.id, tipo: form.tipo, texto: form.texto,
      cliente_id: form.cliente_id || null,
      fecha_compromiso: form.conCompromiso ? form.fecha_compromiso : '',
      monto_compromiso: form.conCompromiso ? form.monto_compromiso : ''
    };
    ApiClient.post('familia_nota_guardar', cuerpo).then(function (r) {
      setOcupado(false);
      if (!r.success) { setError(r.error || 'No se pudo guardar la nota.'); return; }
      setForm(null);
      cambio();
    }).catch(function (e) { setOcupado(false); setError(e.message); });
  }

  function accion(nombre, cuerpo, confirmacion) {
    if (confirmacion && !window.confirm(confirmacion)) return;
    setOcupado(true); setError('');
    ApiClient.post(nombre, cuerpo).then(function (r) {
      setOcupado(false);
      if (!r.success) { setError(r.error || 'No se pudo completar la acción.'); return; }
      cambio();
    }).catch(function (e) { setOcupado(false); setError(e.message); });
  }

  function editar(n) {
    setError('');
    setForm({
      id: n.id, tipo: n.tipo, texto: n.texto, cliente_id: n.cliente_id ? String(n.cliente_id) : '',
      conCompromiso: !!n.fecha_compromiso, fecha_compromiso: n.fecha_compromiso || '',
      monto_compromiso: n.monto_compromiso !== null && n.monto_compromiso !== undefined ? String(n.monto_compromiso) : ''
    });
  }

  function setCampo(k, v) { setForm(Object.assign({}, form, (function () { var o = {}; o[k] = v; return o; })())); }

  function formulario() {
    return _hNc('div', { style: { border: '1px solid var(--border-glow)', borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 14 } },
      _hNc('div', { style: { fontWeight: 700, fontSize: 13, marginBottom: 10 } }, form.id ? 'Editar nota' : 'Nueva nota'),
      _hNc('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 } },
        _hNc('div', { className: 'form-group' },
          _hNc('label', { className: 'form-label' }, 'Tipo'),
          _hNc('select', { className: 'form-select', value: form.tipo, onChange: function (e) { setCampo('tipo', e.target.value); } },
            NC_TIPOS.map(function (t) { return _hNc('option', { key: t.id, value: t.id }, t.label); }))),
        _hNc('div', { className: 'form-group' },
          _hNc('label', { className: 'form-label' }, 'Alumno (opcional)'),
          _hNc('select', { className: 'form-select', value: form.cliente_id, onChange: function (e) { setCampo('cliente_id', e.target.value); } },
            _hNc('option', { value: '' }, 'Toda la familia'),
            alumnos.map(function (a) { return _hNc('option', { key: a.id, value: String(a.id) }, a.nombre); })))),
      _hNc('div', { className: 'form-group' },
        _hNc('label', { className: 'form-label' }, 'Nota'),
        _hNc('textarea', { className: 'form-input', rows: 3, maxLength: 1000, value: form.texto, placeholder: 'Qué se habló o se acordó con la familia…', onChange: function (e) { setCampo('texto', e.target.value); } })),
      _hNc('label', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 10 } },
        _hNc('input', { type: 'checkbox', checked: form.conCompromiso, onChange: function (e) { setCampo('conCompromiso', e.target.checked); } }),
        'La familia se comprometió a pagar'),
      form.conCompromiso ? _hNc('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 } },
        _hNc('div', { className: 'form-group' },
          _hNc('label', { className: 'form-label' }, 'Fecha prometida'),
          _hNc('input', { className: 'form-input', type: 'date', value: form.fecha_compromiso, onChange: function (e) { setCampo('fecha_compromiso', e.target.value); } })),
        _hNc('div', { className: 'form-group' },
          _hNc('label', { className: 'form-label' }, 'Monto prometido (opcional)'),
          _hNc('input', { className: 'form-input', type: 'number', min: '0', step: '0.01', value: form.monto_compromiso, onChange: function (e) { setCampo('monto_compromiso', e.target.value); } }))) : null,
      _hNc('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
        _hNc('button', { className: 'btn btn-secondary', disabled: ocupado, onClick: function () { setForm(null); setError(''); } }, 'Cancelar'),
        _hNc('button', {
          className: 'btn btn-primary',
          disabled: ocupado || !form.texto.trim() || (form.conCompromiso && !form.fecha_compromiso),
          onClick: guardar
        }, ocupado ? 'Guardando…' : 'Guardar nota')));
  }

  function tarjetaNota(n) {
    var vencido = n.fecha_compromiso && n.cumplido !== true && n.fecha_compromiso < ncHoyISO();
    return _hNc('div', { key: n.id, style: { padding: '10px 0', borderBottom: '1px solid var(--glass-light)' } },
      _hNc('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' } },
        _hNc('div', { style: { fontSize: 12, color: 'var(--ink-3)' } },
          _hNc('span', { className: 'badge badge-gray' }, ncTipoLabel(n.tipo)), ' ',
          (n.autor || 'Usuario') + ' · ' + ncFechaHora(n.creado_en),
          n.cliente_nombre ? ' · ' + n.cliente_nombre : ''),
        _hNc('div', { style: { display: 'flex', gap: 4 } },
          n.puede_modificar ? _hNc('button', { className: 'btn btn-ghost btn-sm', disabled: ocupado, onClick: function () { editar(n); } }, 'Editar') : null,
          n.puede_modificar ? _hNc('button', { className: 'btn btn-ghost btn-sm', style: { color: 'var(--red)' }, disabled: ocupado, onClick: function () { accion('familia_nota_eliminar', { id: n.id }, '¿Eliminar esta nota?'); } }, 'Eliminar') : null)),
      _hNc('div', { style: { fontSize: 13.5, marginTop: 4, whiteSpace: 'pre-wrap' } }, n.texto),
      n.fecha_compromiso ? _hNc('div', {
        style: {
          marginTop: 6, padding: '7px 10px', fontSize: 12.5, borderRadius: 'var(--radius-sm)',
          display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center',
          background: n.cumplido ? 'var(--green-glow)' : (vencido ? 'var(--red-glow)' : 'var(--amber-glow)')
        }
      },
        _hNc('span', null, 'Compromiso de pago: ', _hNc('strong', null, n.fecha_compromiso),
          n.monto_compromiso !== null && n.monto_compromiso !== undefined ? ' · ' + ncMoneda(n.monto_compromiso) : '',
          n.cumplido ? ' · Cumplido' : (vencido ? ' · Vencido' : '')),
        _hNc('button', {
          className: 'btn btn-secondary btn-sm', disabled: ocupado,
          onClick: function () { accion('familia_nota_cumplida', { id: n.id, cumplido: n.cumplido ? 0 : 1 }); }
        }, n.cumplido ? 'Reabrir' : 'Marcar cumplido')) : null);
  }

  return _hNc(NcModal, {
    titulo: 'Notas de cobranza', sub: familia.nombre, onCerrar: props.onCerrar,
    footer: _hNc('button', { className: 'btn btn-secondary', onClick: props.onCerrar }, 'Cerrar')
  },
    faltaMigracion ? _hNc('div', { style: { padding: '9px 12px', fontSize: 12.5, borderRadius: 'var(--radius-sm)', color: 'var(--amber)', background: 'var(--amber-glow)' } }, faltaMigracion) : null,
    !form && !faltaMigracion ? _hNc('div', { style: { marginBottom: 12 } },
      _hNc('button', { className: 'btn btn-primary btn-sm', onClick: function () { setError(''); setForm(ncFormVacio()); } }, '+ Nueva nota')) : null,
    form ? formulario() : null,
    notas === null ? _hNc('div', { style: { padding: '16px 0', color: 'var(--ink-3)', fontSize: 13 } }, 'Cargando…')
      : (notas.length === 0 && !faltaMigracion ? _hNc('div', { style: { padding: '14px 0', color: 'var(--ink-3)', fontSize: 13 } }, 'Todavía no hay notas de cobranza para esta familia.') : notas.map(tarjetaNota)),
    error ? _hNc('div', { style: { marginTop: 10, padding: '9px 12px', fontSize: 12.5, borderRadius: 'var(--radius-sm)', color: 'var(--red)', background: 'var(--red-glow)' } }, error) : null);
}

// Bloque "Compromisos de pago de hoy y vencidos" (Recordatorios).
// props: escuelaId (solo lo usa el superadmin), onAbrirFamilia(familia_id, familia_nombre), refrescar (número que cambia para recargar)
function CompromisosPago(props) {
  var R = React;
  var s1 = R.useState(null), lista = s1[0], setLista = s1[1];   // null = cargando u oculto
  var s2 = R.useState(false), ocupado = s2[0], setOcupado = s2[1];

  function cargar() {
    ApiClient.post('compromisos_pago_listar', { escuela_id: props.escuelaId || undefined }).then(function (r) {
      setLista(r && r.success && !r.falta_migracion ? (r.compromisos || []) : []);
    }).catch(function () { setLista([]); });
  }
  R.useEffect(function () { cargar(); }, [props.escuelaId, props.refrescar]);

  function cumplido(c) {
    setOcupado(true);
    ApiClient.post('familia_nota_cumplida', { id: c.id, cumplido: 1 }).then(function () { setOcupado(false); cargar(); })
      .catch(function () { setOcupado(false); });
  }

  if (!lista || lista.length === 0) return null; // nada que mostrar: el bloque no aparece

  return _hNc('div', { className: 'card', style: { marginBottom: 18, border: '1px solid rgba(245,158,11,.35)' } },
    _hNc('div', { style: { fontWeight: 700, fontSize: 14, marginBottom: 2 } }, 'Compromisos de pago de hoy y vencidos'),
    _hNc('div', { style: { fontSize: 12, color: 'var(--ink-3)', marginBottom: 10 } }, lista.length + (lista.length === 1 ? ' familia prometió' : ' familias prometieron') + ' pagar y su fecha ya llegó. Marca el compromiso como cumplido cuando pague.'),
    lista.map(function (c) {
      return _hNc('div', { key: c.id, style: { display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--glass-light)' } },
        _hNc('div', { style: { minWidth: 0, flex: 1 } },
          _hNc('div', { style: { fontWeight: 600, fontSize: 13.5 } }, c.familia_nombre,
            c.cliente_nombre ? _hNc('span', { style: { fontWeight: 400, color: 'var(--ink-3)' } }, ' · ' + c.cliente_nombre) : null, ' ',
            _hNc('span', { className: 'badge ' + (c.vencido ? 'badge-red' : 'badge-amber') }, c.vencido ? 'Vencido (' + c.fecha_compromiso + ')' : 'Hoy')),
          _hNc('div', { style: { fontSize: 12, color: 'var(--ink-3)', marginTop: 2 } },
            c.monto_compromiso !== null && c.monto_compromiso !== undefined ? 'Prometió ' + ncMoneda(c.monto_compromiso) + ' · ' : '',
            'Debe hoy ' + ncMoneda(c.saldo_familia) + ' · ' + (c.autor || 'Usuario')),
          _hNc('div', { style: { fontSize: 12.5, color: 'var(--ink-2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: c.texto }, c.texto)),
        _hNc('div', { style: { display: 'flex', gap: 6 } },
          _hNc('button', { className: 'btn btn-secondary btn-sm', onClick: function () { props.onAbrirFamilia(c.familia_id, c.familia_nombre); } }, 'Ver notas'),
          _hNc('button', { className: 'btn btn-primary btn-sm', disabled: ocupado, onClick: function () { cumplido(c); } }, 'Cumplido')));
    }));
}
