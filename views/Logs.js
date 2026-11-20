var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};
/* views/Logs.jsx — Logs del sistema (superadmin) */

const ACCIONES_LOG_LABELS = {
  login_exitoso: 'Login exitoso',
  login_fallido: 'Login fallido',
  usuario_creado: 'Usuario creado',
  usuario_editado_sensible: 'Usuario editado (rol/contraseña/escuela)',
  usuario_activo_toggle: 'Usuario activado/desactivado',
  usuario_eliminado: 'Usuario eliminado',
  escuela_activa_toggle: 'Escuela activada/desactivada',
  escuela_creada: 'Colegio creado',
  escuela_editada: 'Colegio editado',
  escuela_plan_cambiado: 'Plan de colegio cambiado',
  plantel_creado: 'Plantel creado',
  plantel_editado: 'Plantel editado',
  clabes_importadas: 'CLABEs importadas al pool',
  clabes_eliminadas: 'CLABEs eliminadas del pool',
  usuario_cambio_password_propio: 'Usuario cambió su contraseña',
  // [OF-7c] "Ver como"
  suplantar_inicio: 'Entró a "Ver como" otro usuario',
  suplantar_fin: 'Salió de "Ver como"',
  suplantar_fallido: 'Contraseña incorrecta al intentar "Ver como"',
};

function LogsRegistro({ data }) {
  const { useState, useEffect } = React;
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [accion, setAccion] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const porPagina = 25;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const { pagina, setPagina, irAPagina } = usePaginaActual(totalPaginas);

  const cargar = async (p, acc) => {
    setCargando(true);
    setError('');
    try {
      const token = AuthController.getToken();
      const params = new URLSearchParams({ action: 'listar_logs', pagina: p, por_pagina: porPagina });
      if (acc) params.set('accion', acc);
      const res = await fetch('api.php?' + params.toString(), {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'No se pudieron cargar los logs.');
        setLogs([]);
        setTotal(0);
      } else {
        setLogs(json.logs || []);
        setTotal(json.total || 0);
      }
    } catch (e) {
      setError('Error de conexión al cargar los logs.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar(pagina, accion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina, accion]);

  return /*#__PURE__*/_jsxDEV("div", {
    children: /*#__PURE__*/_jsxDEV("div", {
      className: "card",
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "card-header",
        children: [/*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("div", { className: "card-title", children: "Logs del sistema" }, void 0, false),
          /*#__PURE__*/_jsxDEV("div", { className: "card-sub", children: [total, " eventos registrados"] }, void 0, true)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("select", {
          className: "form-select logs-filtro",
          style: { fontSize: 12.5, padding: '6px 10px' },
          value: accion,
          onChange: e => { setPagina(1); setAccion(e.target.value); },
          children: [/*#__PURE__*/_jsxDEV("option", { value: "", children: "Todas las acciones" }, void 0, false),
          ...Object.entries(ACCIONES_LOG_LABELS).map(([k, v]) => /*#__PURE__*/_jsxDEV("option", { value: k, children: v }, k, false))]
        }, void 0, true)]
      }, void 0, true), error && /*#__PURE__*/_jsxDEV("div", {
        style: { padding: '12px 16px', color: 'var(--red)', fontSize: 13 },
        children: error
      }, void 0, false), !error && /*#__PURE__*/_jsxDEV("div", {
        className: "table-wrap cards-mobile",
        children: /*#__PURE__*/_jsxDEV("table", {
          children: [/*#__PURE__*/_jsxDEV("thead", {
            children: /*#__PURE__*/_jsxDEV("tr", {
              children: [
                /*#__PURE__*/_jsxDEV("th", { children: "Fecha" }, void 0, false),
                /*#__PURE__*/_jsxDEV("th", { children: "Acción" }, void 0, false),
                /*#__PURE__*/_jsxDEV("th", { children: "Usuario" }, void 0, false),
                /*#__PURE__*/_jsxDEV("th", { children: "Escuela" }, void 0, false),
                /*#__PURE__*/_jsxDEV("th", { children: "Detalle" }, void 0, false),
                /*#__PURE__*/_jsxDEV("th", { children: "IP" }, void 0, false),
              ]
            }, void 0, true)
          }, void 0, false), /*#__PURE__*/_jsxDEV("tbody", {
            children: cargando ? /*#__PURE__*/_jsxDEV("tr", {
              children: /*#__PURE__*/_jsxDEV("td", { colSpan: 6, className: "empty-text", children: "Cargando…" }, void 0, false)
            }, void 0, false) : logs.length === 0 ? /*#__PURE__*/_jsxDEV("tr", {
              children: /*#__PURE__*/_jsxDEV("td", { colSpan: 6, className: "empty-text", children: "Sin eventos registrados." }, void 0, false)
            }, void 0, false) : logs.map(l => {
              const esc = (data.escuelas || []).find(e => e.id === parseInt(l.escuela_id));
              const esSensible = l.accion === 'usuario_eliminado' || l.accion === 'login_fallido' || l.accion === 'usuario_editado_sensible';
              return /*#__PURE__*/_jsxDEV("tr", {
                children: [
                  /*#__PURE__*/_jsxDEV("td", { "data-label": "Fecha", style: { fontFamily: 'var(--mono)', fontSize: 11.5, whiteSpace: 'nowrap' }, children: l.fecha }, void 0, false),
                  /*#__PURE__*/_jsxDEV("td", { "data-label": "Acción",
                    children: /*#__PURE__*/_jsxDEV("span", {
                      style: { fontSize: 12, fontWeight: 600, color: esSensible ? 'var(--red)' : 'var(--ink-2)' },
                      children: ACCIONES_LOG_LABELS[l.accion] || l.accion
                    }, void 0, false)
                  }, void 0, false),
                  /*#__PURE__*/_jsxDEV("td", { "data-label": "Usuario", style: { fontSize: 12.5 }, children: [l.usuario_nombre || '—', l.suplantado_por ? /*#__PURE__*/_jsxDEV("div", { style: { fontSize: 11, color: 'var(--amber)' }, title: "Hecho por otra persona viendo como este usuario", children: ['hecho por ', l.suplantado_por_nombre || ('#' + l.suplantado_por), ' (viendo como)'] }, void 0, true) : null] }, void 0, true),
                  /*#__PURE__*/_jsxDEV("td", { "data-label": "Escuela", style: { fontSize: 12, color: 'var(--ink-3)' }, children: esc ? esc.nombre : (l.escuela_id || '—') }, void 0, false),
                  /*#__PURE__*/_jsxDEV("td", { "data-label": "Detalle", style: { fontSize: 12, color: 'var(--ink-3)', maxWidth: 320 }, children: l.detalle || '—' }, void 0, false),
                  /*#__PURE__*/_jsxDEV("td", { "data-label": "IP", style: { fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)' }, children: l.ip || '—' }, void 0, false),
                ]
              }, l.id, true);
            })
          }, void 0, false)]
        }, void 0, true)
      }, void 0, false), !error && totalPaginas > 1 && /*#__PURE__*/_jsxDEV("div", {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '12px 16px', fontSize: 13, color: 'var(--ink-3)' },
        children: [
          /*#__PURE__*/_jsxDEV("span", { children: `Página ${pagina} de ${totalPaginas}` }, void 0, false),
          /*#__PURE__*/_jsxDEV("button", { className: "btn btn-ghost btn-sm", disabled: pagina <= 1, onClick: () => irAPagina(pagina - 1), children: "‹ Anterior" }, void 0, false),
          /*#__PURE__*/_jsxDEV("button", { className: "btn btn-ghost btn-sm", disabled: pagina >= totalPaginas, onClick: () => irAPagina(pagina + 1), children: "Siguiente ›" }, void 0, false),
        ]
      }, void 0, true)]
    }, void 0, true)
  }, void 0, false);
}

/* ══════════════════════════════════════════════════════════════════════════════
   [OF-7c] Auditoría: bitácora de cambios con ANTES y DESPUÉS.

   · Logs (la pantalla "Logs del Sistema" de superadmin y soporte) ahora tiene dos pestañas:
     "Registro" (la de siempre, LogsRegistro) y "Auditoría" (AuditoriaPanel con global: true,
     todos los colegios, con filtro por colegio).
   · El admin la ve de SU colegio en el menú "Auditoría" (app.js → AuditoriaPanel con global: false);
     el servidor le fuerza su escuela y no le manda la IP.
   · Filtros: fecha (desde / hasta), usuario, acción y entidad. Cada renglón se abre para ver los
     campos que cambiaron en dos columnas, antes y después, con lo cambiado resaltado.
   · Lo que se guardó ya viene sin secretos: contraseñas y tokens como "[oculto]", la CLABE solo con
     los últimos cuatro dígitos y los datos médicos como "[dato médico]" (lib/helpers_auditoria.php).
   `var` y React.createElement directo, como el resto de las pantallas nuevas.
   ══════════════════════════════════════════════════════════════════════════════ */
var _hAu = React.createElement;

function auVal(v) {
  if (v === null || v === undefined || v === '') return _hAu('em', { style: { color: 'var(--ink-4)' } }, '—');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// Detalle de un renglón: dos columnas. Todo lo que está guardado CAMBIÓ (solo se guardan los campos
// que cambiaron), así que se resalta: lo de antes en rojo suave, lo de después en verde suave.
function AuDetalle(props) {
  var antes = props.antes || {}, despues = props.despues || {};
  var llaves = Object.keys(antes);
  Object.keys(despues).forEach(function (k) { if (llaves.indexOf(k) < 0) llaves.push(k); });
  if (llaves.length === 0) {
    return _hAu('div', { style: { fontSize: 12, color: 'var(--ink-3)', padding: '6px 2px' } }, 'Este movimiento no guardó campos (es un evento).');
  }
  var celda = function (color, fondo) {
    return { padding: '5px 10px', fontSize: 12.5, wordBreak: 'break-word', color: color, background: fondo, borderRadius: 4 };
  };
  return _hAu('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(110px, 0.7fr) 1fr 1fr', gap: '4px 8px', alignItems: 'start', maxWidth: 820 } },
    _hAu('div', { style: { fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase' } }, 'Campo'),
    _hAu('div', { style: { fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase' } }, 'Antes'),
    _hAu('div', { style: { fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase' } }, 'Después'),
    llaves.map(function (k) {
      return [
        _hAu('div', { key: k + 'k', style: { padding: '5px 0', fontSize: 12.5, fontFamily: 'var(--mono)', color: 'var(--ink-2)', wordBreak: 'break-word' } }, k),
        _hAu('div', { key: k + 'a', style: celda('var(--red)', 'var(--red-glow)') }, auVal(antes[k])),
        _hAu('div', { key: k + 'd', style: celda('var(--green-dark, var(--green))', 'var(--green-glow)') }, auVal(despues[k]))
      ];
    })
  );
}

function AuditoriaPanel(props) {
  var R = React;
  var esGlobal = !!props.global;
  var escuelas = ((props.data && props.data.escuelas) || []).filter(function (e) { return !e.es_plantel; });
  var s1 = R.useState({ desde: '', hasta: '', usuario_id: '', accion: '', entidad: '', escuela_id: '' }), filtros = s1[0], setFiltros = s1[1];
  var s2 = R.useState(1), pagina = s2[0], setPagina = s2[1];
  var s3 = R.useState({ registros: [], total: 0, acciones: {}, entidades: {}, usuarios: [] }), res = s3[0], setRes = s3[1];
  var s4 = R.useState(true), cargando = s4[0], setCargando = s4[1];
  var s5 = R.useState(''), error = s5[0], setError = s5[1];
  var s6 = R.useState(null), abierto = s6[0], setAbierto = s6[1];
  var porPagina = 25;
  var totalPaginas = Math.max(1, Math.ceil(res.total / porPagina));

  R.useEffect(function () {
    var vivo = true;
    setCargando(true); setError('');
    var cuerpo = { pagina: pagina, por_pagina: porPagina };
    Object.keys(filtros).forEach(function (k) { if (filtros[k] !== '') cuerpo[k] = filtros[k]; });
    ApiClient.post('auditoria_listar', cuerpo).then(function (r) {
      if (!vivo) return;
      setCargando(false);
      if (!r || !r.success) { setError((r && r.error) || 'No se pudo cargar la auditoría.'); setRes(function (x) { return Object.assign({}, x, { registros: [], total: 0 }); }); return; }
      setRes(r); setAbierto(null);
    }).catch(function (e) { if (!vivo) return; setCargando(false); setError(e.message || 'No se pudo cargar la auditoría.'); });
    return function () { vivo = false; };
  }, [pagina, filtros]);

  var cambia = function (k) { return function (e) { var v = e.target.value; setPagina(1); setFiltros(function (x) { var n = Object.assign({}, x); n[k] = v; return n; }); }; };
  var hayFiltros = Object.keys(filtros).some(function (k) { return filtros[k] !== ''; });
  var sel = { fontSize: 12.5, padding: '6px 10px' };
  var nombreEsc = function (id) { var e = escuelas.filter(function (x) { return Number(x.id) === Number(id); })[0]; return e ? e.nombre : (id ? '#' + id : 'Plataforma'); };
  var cols = esGlobal ? 6 : 5;

  var tabla = _hAu('div', { className: 'table-wrap cards-mobile' },
    _hAu('table', null,
      _hAu('thead', null, _hAu('tr', null,
        _hAu('th', null, 'Fecha'),
        esGlobal ? _hAu('th', null, 'Colegio') : null,
        _hAu('th', null, 'Usuario'),
        _hAu('th', null, 'Qué hizo'),
        _hAu('th', null, 'Sobre'),
        _hAu('th', null, 'Cambio'))),
      _hAu('tbody', null,
        cargando ? _hAu('tr', null, _hAu('td', { colSpan: cols, className: 'empty-text' }, 'Cargando…'))
        : res.registros.length === 0 ? _hAu('tr', null, _hAu('td', { colSpan: cols, className: 'empty-text' }, hayFiltros ? 'Ningún movimiento coincide con los filtros.' : 'Todavía no hay movimientos auditados.'))
        : res.registros.map(function (r) {
            var abre = abierto === r.id;
            var campos = Object.keys(r.antes || {}).length || Object.keys(r.despues || {}).length;
            return [
              _hAu('tr', { key: r.id },
                _hAu('td', { 'data-label': 'Fecha', style: { fontFamily: 'var(--mono)', fontSize: 11.5, whiteSpace: 'nowrap' } }, r.creado_en),
                esGlobal ? _hAu('td', { 'data-label': 'Colegio', style: { fontSize: 12, color: 'var(--ink-3)' } }, r.escuela_nombre || nombreEsc(r.escuela_id)) : null,
                _hAu('td', { 'data-label': 'Usuario', style: { fontSize: 12.5 } },
                  r.usuario_nombre || (r.usuario_id ? '#' + r.usuario_id : '—'),
                  r.suplantado_por ? _hAu('div', { style: { fontSize: 11, color: 'var(--amber)' }, title: 'Lo hizo otra persona viendo como este usuario' }, 'hecho por ' + (r.suplantado_por_nombre || ('#' + r.suplantado_por)) + ' (viendo como)') : null),
                _hAu('td', { 'data-label': 'Qué hizo', style: { fontSize: 12.5, fontWeight: 600 } }, r.accion_texto),
                _hAu('td', { 'data-label': 'Sobre', style: { fontSize: 12, color: 'var(--ink-3)' } }, ((res.entidades || {})[r.entidad] || r.entidad) + (r.entidad_id ? ' #' + r.entidad_id : '')),
                _hAu('td', { 'data-label': 'Cambio' },
                  campos ? _hAu('button', { className: 'btn btn-ghost btn-sm', onClick: function () { setAbierto(abre ? null : r.id); }, 'aria-expanded': abre },
                    (abre ? 'Ocultar' : 'Ver') + ' (' + campos + ')') : _hAu('span', { style: { fontSize: 11.5, color: 'var(--ink-4)' } }, '—'))),
              abre ? _hAu('tr', { key: r.id + 'd' }, _hAu('td', { colSpan: cols, style: { background: 'var(--glass-light)', padding: '10px 14px' } },
                _hAu(AuDetalle, { antes: r.antes, despues: r.despues }),
                r.ip ? _hAu('div', { style: { fontSize: 11, color: 'var(--ink-4)', marginTop: 8, fontFamily: 'var(--mono)' } }, 'IP ' + r.ip) : null)) : null
            ];
          }))));

  return _hAu('div', { className: 'card' },
    _hAu('div', { className: 'card-header', style: { flexWrap: 'wrap', gap: 10 } },
      _hAu('div', null,
        _hAu('div', { className: 'card-title' }, 'Auditoría'),
        _hAu('div', { className: 'card-sub' }, res.total + ' movimiento(s) auditados' + (esGlobal ? ' en todos los colegios' : ' en tu colegio') + '. Cada uno guarda cómo estaba y cómo quedó, solo en lo que cambió.'))),
    _hAu('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', padding: '0 16px 12px' } },
      _hAu('label', { style: { fontSize: 11.5, color: 'var(--ink-3)' } }, 'Desde', _hAu('input', { type: 'date', className: 'form-input', style: Object.assign({ display: 'block' }, sel), value: filtros.desde, onChange: cambia('desde') })),
      _hAu('label', { style: { fontSize: 11.5, color: 'var(--ink-3)' } }, 'Hasta', _hAu('input', { type: 'date', className: 'form-input', style: Object.assign({ display: 'block' }, sel), value: filtros.hasta, onChange: cambia('hasta') })),
      esGlobal ? _hAu('select', { className: 'form-select', style: sel, value: filtros.escuela_id, onChange: cambia('escuela_id'), 'aria-label': 'Colegio' },
        [_hAu('option', { key: '', value: '' }, 'Todos los colegios')].concat(escuelas.map(function (e) { return _hAu('option', { key: e.id, value: String(e.id) }, e.nombre); }))) : null,
      _hAu('select', { className: 'form-select', style: sel, value: filtros.usuario_id, onChange: cambia('usuario_id'), 'aria-label': 'Usuario' },
        [_hAu('option', { key: '', value: '' }, 'Todos los usuarios')].concat((res.usuarios || []).map(function (u) { return _hAu('option', { key: u.id, value: String(u.id) }, u.nombre); }))),
      _hAu('select', { className: 'form-select', style: sel, value: filtros.accion, onChange: cambia('accion'), 'aria-label': 'Acción' },
        [_hAu('option', { key: '', value: '' }, 'Todas las acciones')].concat(Object.keys(res.acciones || {}).map(function (k) { return _hAu('option', { key: k, value: k }, res.acciones[k]); }))),
      _hAu('select', { className: 'form-select', style: sel, value: filtros.entidad, onChange: cambia('entidad'), 'aria-label': 'Entidad' },
        [_hAu('option', { key: '', value: '' }, 'Todas las entidades')].concat(Object.keys(res.entidades || {}).map(function (k) { return _hAu('option', { key: k, value: k }, res.entidades[k]); }))),
      hayFiltros ? _hAu('button', { className: 'btn btn-ghost btn-sm', onClick: function () { setPagina(1); setFiltros({ desde: '', hasta: '', usuario_id: '', accion: '', entidad: '', escuela_id: '' }); } }, 'Limpiar filtros') : null),
    error ? _hAu('div', { style: { padding: '12px 16px', color: 'var(--red)', fontSize: 13 } }, error) : tabla,
    !error && totalPaginas > 1 ? _hAu('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '12px 16px', fontSize: 13, color: 'var(--ink-3)' } },
      _hAu('span', null, 'Página ' + pagina + ' de ' + totalPaginas),
      _hAu('button', { className: 'btn btn-ghost btn-sm', disabled: pagina <= 1, onClick: function () { setPagina(pagina - 1); } }, '‹ Anterior'),
      _hAu('button', { className: 'btn btn-ghost btn-sm', disabled: pagina >= totalPaginas, onClick: function () { setPagina(pagina + 1); } }, 'Siguiente ›')) : null
  );
}

// La pantalla "Logs del Sistema": dos pestañas. Se llama igual que antes (app.js no cambia).
function Logs(props) {
  var s = React.useState('registro'), tab = s[0], setTab = s[1];
  return _hAu('div', null,
    _hAu('div', { className: 'pill-group', style: { marginBottom: 16 } },
      [['registro', 'Registro'], ['auditoria', 'Auditoría']].map(function (t) {
        return _hAu('button', { key: t[0], className: 'pill' + (tab === t[0] ? ' active' : ''), onClick: function () { setTab(t[0]); } }, t[1]);
      })),
    tab === 'registro' ? _hAu(LogsRegistro, { data: props.data }) : _hAu(AuditoriaPanel, { data: props.data, global: true })
  );
}
