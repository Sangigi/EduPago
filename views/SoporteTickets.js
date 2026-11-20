/* views/SoporteTickets.js — Tickets de soporte y contenido de Ayuda (soporte y superadmin). [OF-7a]
 *
 * DOS PESTAÑAS
 *  · Bandeja: los tickets de TODOS los colegios. Orden del servidor: resueltos al final; antes,
 *    los que el colegio escribió y nadie ha contestado, y dentro de cada grupo el más viejo primero.
 *    Filtros por estado, categoría, colegio y asignación. Al abrir uno: responder, nota interna
 *    (el colegio nunca la ve; el servidor no se la manda), cambiar estado/prioridad y asignarlo.
 *  · Ayuda (artículos y novedades): crear y editar lo que ven admin y cajero en su menú "Ayuda".
 *
 * Usa piezas de views/Ayuda.js (que se carga antes): TicketDetalle, AyudaTexto, ayPedir, ayFecha...
 * Todo texto de usuario se pinta con elementos de React: nada de innerHTML.
 */
var _hST = React.createElement;

var ST_CATEGORIAS = {
  cobros: 'Cobros y caja', facturacion: 'Facturación', control_escolar: 'Control escolar',
  cuenta: 'Mi cuenta y accesos', otro: 'Otro',
};

// ════════════════════════════════════════════════════════════════════════
// Bandeja
// ════════════════════════════════════════════════════════════════════════

function StBandeja(props) {
  var _R = React;
  var a = _R.useState({ estado: 'abiertos', categoria: '', escuela_id: '', asignado: '', q: '' }); var f = a[0], setF = a[1];
  var b = _R.useState(null);  var res = b[0], setRes = b[1];
  var c = _R.useState(null);  var abierto = c[0], setAbierto = c[1];
  var d = _R.useState(true);  var cargando = d[0], setCargando = d[1];
  var e = _R.useState('');    var error = e[0], setError = e[1];
  var g = _R.useState(1);     var pagina = g[0], setPagina = g[1];

  var escuelas = (props.data && props.data.escuelas ? props.data.escuelas : []).filter(function (x) { return !x.es_plantel; });

  var cargar = function () {
    var cuerpo = { estado: f.estado, pagina: pagina };
    if (f.categoria) cuerpo.categoria = f.categoria;
    if (f.escuela_id) cuerpo.escuela_id = Number(f.escuela_id);
    if (f.asignado) cuerpo.asignado = f.asignado;
    if (f.q.trim()) cuerpo.q = f.q.trim();
    return ayPedir('soporte_tickets_listar', cuerpo).then(function (r) {
      setCargando(false);
      if (!r || !r.success) { setError((r && r.error) || 'No se pudo cargar la bandeja.'); return; }
      setError(''); setRes(r);
    });
  };
  _R.useEffect(function () { setCargando(true); cargar(); }, [f.estado, f.categoria, f.escuela_id, f.asignado, pagina]);

  var cambiar = function (k, v) { setPagina(1); setF(Object.assign({}, f, (function () { var o = {}; o[k] = v; return o; })())); };
  var refrescar = function () { cargar(); if (props.onCambio) props.onCambio(); };

  if (abierto) {
    return _hST(TicketDetalle, {
      ticketId: abierto, esPlataforma: true, agentes: (res && res.agentes) || [],
      onCambio: refrescar, onVolver: function () { setAbierto(null); refrescar(); }
    });
  }

  var conteos = (res && res.conteos) || {};
  var tickets = (res && res.tickets) || [];
  var estados = [['abiertos', 'Abiertos'], ['abierto', 'Nuevos'], ['en_proceso', 'En proceso'], ['esperando_cliente', 'Esperando al colegio'], ['resuelto', 'Resueltos'], ['todos', 'Todos']];
  var porPagina = (res && res.por_pagina) || 40;
  var paginas = res ? Math.max(1, Math.ceil(res.total / porPagina)) : 1;

  return _hST('div', {},
    _hST('div', { className: 'pill-group', style: { marginBottom: 12 } },
      estados.map(function (p) {
        var n = p[0] === 'abiertos' ? (conteos.abierto || 0) + (conteos.en_proceso || 0) + (conteos.esperando_cliente || 0)
              : p[0] === 'todos' ? ((conteos.abierto || 0) + (conteos.en_proceso || 0) + (conteos.esperando_cliente || 0) + (conteos.resuelto || 0))
              : (conteos[p[0]] || 0);
        return _hST('button', { key: p[0], className: 'pill' + (f.estado === p[0] ? ' active' : ''), onClick: function () { cambiar('estado', p[0]); } },
          p[1] + (res ? ' (' + n + ')' : ''));
      })),
    _hST('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' } },
      _hST('select', { className: 'form-select', style: { maxWidth: 220 }, value: f.escuela_id, onChange: function (e2) { cambiar('escuela_id', e2.target.value); } },
        _hST('option', { value: '' }, 'Todos los colegios'),
        escuelas.map(function (x) { return _hST('option', { key: x.id, value: x.id }, x.nombre); })),
      _hST('select', { className: 'form-select', style: { maxWidth: 200 }, value: f.categoria, onChange: function (e2) { cambiar('categoria', e2.target.value); } },
        _hST('option', { value: '' }, 'Todas las categorías'),
        Object.keys(ST_CATEGORIAS).map(function (k) { return _hST('option', { key: k, value: k }, ST_CATEGORIAS[k]); })),
      _hST('select', { className: 'form-select', style: { maxWidth: 180 }, value: f.asignado, onChange: function (e2) { cambiar('asignado', e2.target.value); } },
        _hST('option', { value: '' }, 'Cualquier asignación'), _hST('option', { value: 'yo' }, 'Asignados a mí'), _hST('option', { value: 'ninguno' }, 'Sin asignar')),
      _hST('input', {
        className: 'form-input', style: { maxWidth: 220 }, placeholder: 'Buscar en el asunto…', value: f.q,
        onChange: function (e2) { setF(Object.assign({}, f, { q: e2.target.value })); },
        onKeyDown: function (e2) { if (e2.key === 'Enter') { setPagina(1); setCargando(true); cargar(); } }
      }),
      _hST('button', { className: 'btn btn-secondary btn-sm', onClick: function () { setPagina(1); setCargando(true); cargar(); } }, 'Buscar')
    ),
    _hST(AyAviso, { texto: error }),
    cargando && !res ? _hST('div', { style: { padding: 30, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 } }, 'Cargando…')
    : tickets.length === 0
      ? _hST('div', { className: 'card empty-state' }, _hST('div', { className: 'empty-text' }, 'No hay tickets con estos filtros.'))
      : _hST('div', { className: 'card' }, _hST('div', { className: 'table-wrap' }, _hST('table', {},
          _hST('thead', {}, _hST('tr', {},
            ['#', 'Colegio', 'Asunto', 'Categoría', 'Estado', 'Prioridad', 'Asignado', 'Espera'].map(function (h) { return _hST('th', { key: h }, h); }))),
          _hST('tbody', {}, tickets.map(function (t) {
            var est = AY_ESTADOS[t.estado] || { label: t.estado, clase: 'badge-gray' };
            return _hST('tr', { key: t.id, style: { cursor: 'pointer' }, onClick: function () { setAbierto(t.id); } },
              _hST('td', { style: { fontFamily: 'var(--mono)' } }, t.id),
              _hST('td', { style: { fontSize: 12.5 } }, t.escuela_nombre || ('#' + t.escuela_id)),
              _hST('td', { style: { fontWeight: t.no_leido ? 700 : 500 } },
                t.no_leido ? _hST('span', { className: 'verif-dot', style: { display: 'inline-block', background: 'var(--red)', marginRight: 6 }, title: 'No lo has abierto' }) : null,
                t.asunto),
              _hST('td', { style: { fontSize: 12.5 } }, t.categoria_nombre),
              _hST('td', {}, _hST('span', { className: 'badge ' + est.clase }, est.label),
                t.sin_respuesta ? _hST('span', { className: 'badge badge-red', style: { marginLeft: 6 } }, 'Sin respuesta') : null),
              _hST('td', {}, t.prioridad === 'alta' ? _hST('span', { className: 'badge badge-red' }, 'Alta') : _hST('span', { style: { fontSize: 12, color: 'var(--ink-3)' } }, 'Normal')),
              _hST('td', { style: { fontSize: 12.5 } }, t.asignado_nombre || '—'),
              // Antigüedad: lo que lleva esperando respuesta (si el colegio habló último) o desde la última actividad.
              _hST('td', { style: { fontSize: 12, whiteSpace: 'nowrap', color: t.sin_respuesta && t.minutos_desde_ultimo >= 1440 ? 'var(--red)' : 'var(--ink-3)' } },
                t.estado === 'resuelto' ? '—' : ayEdad(t.minutos_desde_ultimo)));
          }))
        ))),
    res && paginas > 1 ? _hST('div', { style: { display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', marginTop: 12 } },
      _hST('button', { className: 'btn btn-secondary btn-sm', disabled: pagina <= 1, onClick: function () { setPagina(pagina - 1); } }, 'Anterior'),
      _hST('span', { style: { fontSize: 12.5, color: 'var(--ink-3)' } }, 'Página ' + pagina + ' de ' + paginas),
      _hST('button', { className: 'btn btn-secondary btn-sm', disabled: pagina >= paginas, onClick: function () { setPagina(pagina + 1); } }, 'Siguiente')) : null
  );
}

// ════════════════════════════════════════════════════════════════════════
// Editor de artículos y novedades
// ════════════════════════════════════════════════════════════════════════

var ST_VACIO = { id: 0, tipo: 'articulo', titulo: '', cuerpo: '', roles_visibles: ['admin', 'cajero'], publicado: false };

function StEditor(props) {
  var _R = React;
  var a = _R.useState(Object.assign({}, props.inicial)); var f = a[0], setF = a[1];
  var b = _R.useState(false); var guardando = b[0], setGuardando = b[1];
  var c = _R.useState('');    var error = c[0], setError = c[1];
  var set = function (k, v) { var o = {}; o[k] = v; setF(Object.assign({}, f, o)); };
  var alternarRol = function (rol) {
    var tiene = f.roles_visibles.indexOf(rol) !== -1;
    set('roles_visibles', tiene ? f.roles_visibles.filter(function (r) { return r !== rol; }) : f.roles_visibles.concat([rol]));
  };
  var guardar = function () {
    if (!f.titulo.trim()) { setError('Escribe el título.'); return; }
    if (!f.cuerpo.trim()) { setError('Escribe el texto.'); return; }
    if (!f.roles_visibles.length) { setError('Elige al menos un rol que pueda verlo.'); return; }
    setGuardando(true); setError('');
    ayPedir('ayuda_guardar', { id: f.id || 0, tipo: f.tipo, titulo: f.titulo, cuerpo: f.cuerpo, roles_visibles: f.roles_visibles, publicado: f.publicado }).then(function (r) {
      setGuardando(false);
      if (!r || !r.success) { setError((r && r.error) || 'No se pudo guardar.'); return; }
      props.onGuardado();
    });
  };

  return _hST('div', { className: 'card' },
    _hST('div', { className: 'card-header' },
      _hST('div', { className: 'card-title' }, f.id ? 'Editar' : 'Nuevo contenido de Ayuda'),
      _hST('button', { className: 'btn btn-secondary btn-sm', disabled: guardando, onClick: props.onCancelar }, 'Cancelar')),
    _hST(AyAviso, { texto: error }),
    _hST('div', { style: { display: 'flex', gap: 12, flexWrap: 'wrap' } },
      _hST('div', { className: 'form-group', style: { flex: '0 0 170px' } }, _hST('label', { className: 'form-label' }, 'Tipo'),
        _hST('select', { className: 'form-select', value: f.tipo, onChange: function (e) { set('tipo', e.target.value); } },
          _hST('option', { value: 'articulo' }, 'Artículo'), _hST('option', { value: 'novedad' }, 'Novedad'))),
      _hST('div', { className: 'form-group', style: { flex: '1 1 280px' } }, _hST('label', { className: 'form-label' }, 'Título'),
        _hST('input', { className: 'form-input', value: f.titulo, maxLength: 200, onChange: function (e) { set('titulo', e.target.value); } }))),
    _hST('div', { style: { display: 'flex', gap: 14, flexWrap: 'wrap' } },
      _hST('div', { className: 'form-group', style: { flex: '1 1 320px' } }, _hST('label', { className: 'form-label' }, 'Texto'),
        _hST('textarea', { className: 'form-input', rows: 14, value: f.cuerpo, maxLength: 15000, style: { width: '100%', resize: 'vertical', fontFamily: 'var(--mono)', fontSize: 12.5 }, onChange: function (e) { set('cuerpo', e.target.value); } }),
        _hST('div', { style: { fontSize: 11.5, color: 'var(--ink-4)', marginTop: 4 } },
          'Formato: párrafos separados por una línea en blanco · listas con "- " al inicio de cada renglón · **negritas**. Nada de HTML: se mostraría como texto.')),
      _hST('div', { className: 'form-group', style: { flex: '1 1 320px' } }, _hST('label', { className: 'form-label' }, 'Vista previa'),
        _hST('div', { style: { border: '1px solid var(--border-glow)', borderRadius: 'var(--radius)', padding: 14, minHeight: 120 } },
          f.cuerpo.trim() ? _hST(AyudaTexto, { texto: f.cuerpo }) : _hST('span', { style: { color: 'var(--ink-4)', fontSize: 12.5 } }, 'Aquí verás cómo queda.')))),
    _hST('div', { style: { display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14, fontSize: 13 } },
      _hST('span', { style: { fontWeight: 600 } }, 'Lo ve:'),
      ['admin', 'cajero'].map(function (rol) {
        return _hST('label', { key: rol, style: { display: 'flex', gap: 6, alignItems: 'center' } },
          _hST('input', { type: 'checkbox', checked: f.roles_visibles.indexOf(rol) !== -1, onChange: function () { alternarRol(rol); } }), rol === 'admin' ? 'Administrador' : 'Cajero');
      }),
      _hST('label', { style: { display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto' } },
        _hST('input', { type: 'checkbox', checked: f.publicado, onChange: function (e) { set('publicado', e.target.checked); } }),
        'Publicado (si no, es un borrador que nadie del colegio ve)')),
    _hST('button', { className: 'btn btn-primary', disabled: guardando, onClick: guardar }, guardando ? 'Guardando…' : 'Guardar')
  );
}

function StContenido() {
  var _R = React;
  var a = _R.useState(null);  var items = a[0], setItems = a[1];
  var b = _R.useState(null);  var editando = b[0], setEditando = b[1];
  var c = _R.useState('');    var error = c[0], setError = c[1];
  var cargar = function () {
    ayPedir('ayuda_listar', {}).then(function (r) {
      if (!r || !r.success) { setError((r && r.error) || 'No se pudo cargar la ayuda.'); setItems([]); return; }
      setError(''); setItems(r.items);
    });
  };
  _R.useEffect(function () { cargar(); }, []);

  if (editando) return _hST(StEditor, { inicial: editando, onCancelar: function () { setEditando(null); }, onGuardado: function () { setEditando(null); cargar(); } });
  return _hST('div', {},
    _hST('div', { style: { display: 'flex', justifyContent: 'flex-end', marginBottom: 12 } },
      _hST('button', { className: 'btn btn-primary', onClick: function () { setEditando(Object.assign({}, ST_VACIO)); } }, '+ Nuevo artículo o novedad')),
    _hST(AyAviso, { texto: error }),
    !items ? _hST('div', { style: { padding: 30, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 } }, 'Cargando…')
    : items.length === 0 ? _hST('div', { className: 'card empty-state' }, _hST('div', { className: 'empty-text' }, 'Todavía no hay contenido.'))
    : _hST('div', { className: 'card' }, _hST('div', { className: 'table-wrap' }, _hST('table', {},
        _hST('thead', {}, _hST('tr', {}, ['Título', 'Tipo', 'Estado', 'Lo ve', 'Actualizado', ''].map(function (h, i) { return _hST('th', { key: i }, h); }))),
        _hST('tbody', {}, items.map(function (it) {
          return _hST('tr', { key: it.id },
            _hST('td', {}, it.titulo),
            _hST('td', {}, _hST('span', { className: 'badge ' + (it.tipo === 'novedad' ? 'badge-purple' : 'badge-blue') }, it.tipo === 'novedad' ? 'Novedad' : 'Artículo')),
            _hST('td', {}, _hST('span', { className: 'badge ' + (it.publicado ? 'badge-green' : 'badge-gray') }, it.publicado ? 'Publicado' : 'Borrador')),
            _hST('td', { style: { fontSize: 12.5 } }, (it.roles_visibles || []).join(', ')),
            _hST('td', { style: { fontSize: 12, color: 'var(--ink-3)', whiteSpace: 'nowrap' } }, ayFecha(it.actualizado_en)),
            _hST('td', {}, _hST('button', { className: 'btn btn-secondary btn-sm', onClick: function () {
              setEditando({ id: it.id, tipo: it.tipo, titulo: it.titulo, cuerpo: it.cuerpo, roles_visibles: it.roles_visibles || [], publicado: !!it.publicado });
            } }, 'Editar')));
        }))
      )))
  );
}

// ════════════════════════════════════════════════════════════════════════
// Vista
//   props: data (cargar_datos, trae las escuelas), onResumen()
// ════════════════════════════════════════════════════════════════════════

function SoporteTickets(props) {
  var _R = React;
  var t = _R.useState('bandeja'); var tab = t[0], setTab = t[1];
  return _hST('div', {},
    _hST('div', { className: 'pill-group', style: { marginBottom: 16 } },
      [['bandeja', 'Bandeja de tickets'], ['ayuda', 'Artículos y novedades']].map(function (x) {
        return _hST('button', { key: x[0], className: 'pill' + (tab === x[0] ? ' active' : ''), onClick: function () { setTab(x[0]); } }, x[1]);
      })),
    tab === 'bandeja' ? _hST(StBandeja, { data: props.data, onCambio: props.onResumen }) : _hST(StContenido, {})
  );
}
