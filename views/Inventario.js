// views/Inventario.js — Inventario con existencias (OF-6, 20-nov-2026). Solo admin.
//
// Cuenta PIEZAS de lo que el colegio vende físicamente: conceptos de pago de
// categoría física (uniforme, material...) con "Maneja existencias" y los productos de
// la tiendita. NO mueve dinero. Pestañas:
//
//   Existencias  → lo que hay, buscador, filtros (agotados / bajo mínimo), el mínimo
//                  editable, ajuste manual, "Duplicar como otra talla", y qué productos
//                  todavía no se controlan (botón Controlar).
//   Entradas     → compra de mercancía: piezas, costo y proveedor opcionales, y la casilla
//                  "Registrar también como gasto".
//   Conteo físico→ hoja con la existencia actual y un campo "contado" por producto.
//   Movimientos  → el libro: quién, cuándo, cuánto, motivo y documento (cobro o venta).
//
// Sin variantes en esta versión: cada talla es su propio producto ("Playera deportiva T8").
// La existencia PUEDE quedar negativa (la venta nunca se bloquea): se muestra en rojo.
//
// Reusa los globales de views/Monedero.js (mnApi, mnFmt, mnLlaveDe, mnFechaHora) y de
// views/ControlEscolar.js (EscModal, EscError, EscOk, EscVacio, EscTabs, EscStat), que
// se cargan antes en index.html. `var` y React.createElement directo, sin compilación.

var _hIv = React.createElement;

var IV_MOV = {
  entrada: { label: 'Entrada', color: 'var(--green)' },
  venta: { label: 'Venta', color: 'var(--ink)' },
  devolucion: { label: 'Devolución', color: 'var(--accent)' },
  ajuste: { label: 'Ajuste', color: 'var(--amber)' },
  conteo: { label: 'Conteo', color: 'var(--amber)' }
};

function ivClave(it) { return it.tipo + ':' + it.id; }
function ivTipoLabel(t) { return t === 'tienda' ? 'Tiendita' : 'Concepto'; }
function ivNum(n) { return Number(n || 0).toLocaleString('es-MX'); }

// Existencia con su color: rojo si ya se acabó (≤ 0), ámbar si queda poco.
function IvExistencia(props) {
  var it = props.item;
  var color = it.estado === 'agotado' ? 'var(--red)' : (it.estado === 'bajo' ? 'var(--amber)' : 'var(--ink)');
  return _hIv('span', { style: { fontWeight: 800, color: color } }, ivNum(it.existencia),
    it.negativo ? _hIv('span', { style: { fontSize: 11, fontWeight: 600, marginLeft: 6 } }, '(negativa)') : null);
}

function IvEstado(props) {
  var e = props.estado;
  if (e === 'agotado') return _hIv('span', { className: 'badge badge-red' }, 'Agotado');
  if (e === 'bajo') return _hIv('span', { className: 'badge badge-amber' }, 'Queda poco');
  return _hIv('span', { className: 'badge badge-green' }, 'Ok');
}

/* ───────────────────────── Existencias ───────────────────────── */

function IvExistencias(props) {
  var R = React;
  var d = props.datos;
  var s1 = R.useState(''), q = s1[0], setQ = s1[1];
  var s2 = R.useState('todos'), filtro = s2[0], setFiltro = s2[1];
  var s3 = R.useState(null), ajustando = s3[0], setAjustando = s3[1];
  var s4 = R.useState(null), duplicando = s4[0], setDuplicando = s4[1];
  var s5 = R.useState(''), error = s5[0], setError = s5[1];
  var s6 = R.useState(''), ok = s6[0], setOk = s6[1];
  var s7 = R.useState({}), minimos = s7[0], setMinimos = s7[1];   // clave -> texto que se está escribiendo
  var s8 = R.useState(false), ocupado = s8[0], setOcupado = s8[1];
  var llaveRef = R.useRef(null);

  var items = d.items || [];
  var ql = q.trim().toLowerCase();
  var lista = items.filter(function (it) {
    if (ql && it.nombre.toLowerCase().indexOf(ql) < 0) return false;
    if (filtro === 'agotados') return it.estado === 'agotado';
    if (filtro === 'bajos') return it.estado === 'bajo';
    return true;
  });
  var nAgot = items.filter(function (i) { return i.estado === 'agotado' && i.activo; }).length;
  var nBajo = items.filter(function (i) { return i.estado === 'bajo' && i.activo; }).length;
  var nNeg = items.filter(function (i) { return i.negativo && i.activo; }).length;

  function guardarMinimo(it) {
    var txt = minimos[ivClave(it)];
    if (txt === undefined || String(txt).trim() === String(it.minimo)) return;
    var v = String(txt).trim();
    if (!/^[0-9]+$/.test(v)) { setError('El mínimo debe ser un número entero de 0 en adelante.'); return; }
    setError(''); setOk('');
    mnApi('inventario_minimo', { tipo: it.tipo, item_id: it.id, minimo: Number(v) })
      .then(function () {
        var m = Object.assign({}, minimos); delete m[ivClave(it)]; setMinimos(m);
        props.onCambio();
      }).catch(function (e) { setError(e.message); });
  }

  function controlar(it, maneja) {
    if (ocupado) return;
    setOcupado(true); setError(''); setOk('');
    mnApi('inventario_activar', { tipo: it.tipo, item_id: it.id, maneja: maneja ? 1 : 0 })
      .then(function () {
        setOk(maneja ? '«' + it.nombre + '» ahora maneja existencias. Captura su existencia con un conteo físico o una entrada.'
                     : '«' + it.nombre + '» dejó de manejar existencias (su historial se conserva).');
        props.onCambio();
      }).catch(function (e) { setError(e.message); })
      .then(function () { setOcupado(false); });
  }

  return _hIv('div', {},
    _hIv('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 } },
      _hIv(EscStat, { label: 'Productos controlados', valor: items.length }),
      _hIv(EscStat, { label: 'Agotados', valor: nAgot, color: nAgot ? 'var(--red)' : undefined }),
      _hIv(EscStat, { label: 'Queda poco', valor: nBajo, color: nBajo ? 'var(--amber)' : undefined })),
    nNeg ? _hIv('div', { style: { marginBottom: 12, padding: '9px 12px', fontSize: 12.5, borderRadius: 'var(--radius-sm)', color: 'var(--red)', background: 'var(--red-glow)', border: '1px solid rgba(220,38,38,.2)' } },
      nNeg + ' producto(s) con existencia NEGATIVA: se vendió más de lo que había registrado. Revisa con un conteo físico y ajusta.') : null,
    _hIv(EscOk, { msg: ok }),
    _hIv(EscError, { msg: error }),
    _hIv('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '12px 0' } },
      _hIv('input', { className: 'form-input', placeholder: 'Buscar producto…', value: q, style: { flex: '1 1 220px', maxWidth: 360 }, onChange: function (e) { setQ(e.target.value); } }),
      _hIv('div', { className: 'pill-group' },
        [['todos', 'Todos'], ['agotados', 'Agotados'], ['bajos', 'Queda poco']].map(function (f) {
          return _hIv('button', { key: f[0], className: 'pill' + (filtro === f[0] ? ' active' : ''), onClick: function () { setFiltro(f[0]); } }, f[1]);
        }))),
    items.length === 0
      ? _hIv(EscVacio, { icon: 'productos', titulo: 'Todavía no controlas existencias de ningún producto', sub: 'Marca "Maneja existencias" en un concepto de pago (uniforme, material) o usa "Controlar" en la lista de abajo. Después captura lo que tienes con un conteo físico o una entrada.' })
      : lista.length === 0
        ? _hIv('div', { className: 'card', style: { color: 'var(--ink-3)', fontSize: 13 } }, 'Ningún producto coincide.')
        : _hIv('div', { className: 'card' }, _hIv('div', { className: 'table-wrap' }, _hIv('table', {},
            _hIv('thead', {}, _hIv('tr', {},
              _hIv('th', {}, 'Producto'), _hIv('th', { style: { textAlign: 'right' } }, 'Existencia'),
              _hIv('th', { style: { textAlign: 'right' } }, 'Mínimo'), _hIv('th', { style: { textAlign: 'right' } }, 'Último costo'),
              _hIv('th', {}, 'Estado'), _hIv('th', {}, ''))),
            _hIv('tbody', {}, lista.map(function (it) {
              var k = ivClave(it);
              return _hIv('tr', { key: k, style: it.activo ? undefined : { opacity: 0.6 } },
                _hIv('td', {},
                  _hIv('div', { style: { fontWeight: 600 } }, it.nombre, it.activo ? null : _hIv('span', { style: { fontSize: 11, color: 'var(--ink-4)', marginLeft: 6 } }, '(inactivo)')),
                  _hIv('div', { style: { fontSize: 11.5, color: 'var(--ink-4)' } }, ivTipoLabel(it.tipo) + (it.categoria ? ' · ' + it.categoria : ''))),
                _hIv('td', { style: { textAlign: 'right' } }, _hIv(IvExistencia, { item: it })),
                _hIv('td', { style: { textAlign: 'right' } },
                  _hIv('input', {
                    className: 'form-input', type: 'number', min: 0, step: 1, inputMode: 'numeric',
                    style: { width: 78, textAlign: 'right', padding: '4px 8px' }, 'aria-label': 'Mínimo de ' + it.nombre,
                    value: minimos[k] !== undefined ? minimos[k] : it.minimo,
                    onChange: function (e) { var m = Object.assign({}, minimos); m[k] = e.target.value; setMinimos(m); },
                    onBlur: function () { guardarMinimo(it); },
                    onKeyDown: function (e) { if (e.key === 'Enter') e.target.blur(); }
                  })),
                _hIv('td', { style: { textAlign: 'right', color: 'var(--ink-3)' } }, it.ultimo_costo !== null ? mnFmt(it.ultimo_costo) : '—'),
                _hIv('td', {}, _hIv(IvEstado, { estado: it.estado })),
                _hIv('td', { style: { textAlign: 'right', whiteSpace: 'nowrap' } },
                  _hIv('button', { className: 'btn btn-ghost btn-sm', onClick: function () { setAjustando(it); setError(''); setOk(''); llaveRef.current = null; } }, 'Ajuste'),
                  _hIv('button', { className: 'btn btn-ghost btn-sm', title: 'Crea otro producto igual (otra talla) con existencia 0', onClick: function () { setDuplicando(it); setError(''); setOk(''); } }, 'Duplicar como otra talla'),
                  _hIv('button', { className: 'btn btn-ghost btn-sm', onClick: function () { props.onHistorial(it); } }, 'Historial'),
                  _hIv('button', { className: 'btn btn-ghost btn-sm', disabled: ocupado, title: 'Deja de descontar con las ventas; el historial se conserva', onClick: function () { controlar(it, false); } }, 'Dejar de controlar')));
            }))))),
    (d.sin_control || []).length > 0 ? _hIv('div', { className: 'card', style: { marginTop: 16 } },
      _hIv('div', { className: 'card-header' }, _hIv('div', { className: 'card-title' }, 'Productos que todavía no controlan existencias')),
      _hIv('div', { style: { fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 10 } }, 'Solo aparecen conceptos de pago físicos (uniforme, material, comedor, otro) y los productos de la tiendita. Una colegiatura o un servicio nunca maneja existencias.'),
      _hIv('div', { className: 'table-wrap' }, _hIv('table', {}, _hIv('tbody', {}, d.sin_control.map(function (it) {
        return _hIv('tr', { key: ivClave(it) },
          _hIv('td', {}, it.nombre, _hIv('span', { style: { fontSize: 11.5, color: 'var(--ink-4)', marginLeft: 8 } }, ivTipoLabel(it.tipo) + (it.categoria ? ' · ' + it.categoria : ''))),
          _hIv('td', { style: { textAlign: 'right', color: 'var(--ink-3)' } }, mnFmt(it.precio)),
          _hIv('td', { style: { textAlign: 'right' } }, _hIv('button', { className: 'btn btn-primary btn-sm', disabled: ocupado, onClick: function () { controlar(it, true); } }, 'Controlar')));
      }))))) : null,
    _hIv('div', { style: { marginTop: 16, fontSize: 12, color: 'var(--ink-4)', lineHeight: 1.5 } },
      'Cada talla es su propio producto ("Playera deportiva T8", "Playera deportiva T10"): usa "Duplicar como otra talla" para crear la siguiente sin capturar todo otra vez. Las ventas en Caja y en la tiendita descuentan solas; si se cancelan, las piezas regresan. Esta pantalla no mueve dinero.'),
    ajustando ? _hIv(IvModalAjuste, {
      item: ajustando, llaveRef: llaveRef,
      onCerrar: function () { setAjustando(null); },
      onListo: function (msg) { setAjustando(null); setOk(msg); props.onCambio(); }
    }) : null,
    duplicando ? _hIv(IvModalDuplicar, {
      item: duplicando,
      onCerrar: function () { setDuplicando(null); },
      onListo: function (msg, r) { setDuplicando(null); setOk(msg); props.onCambio(r && r.producto ? r.producto : null); }
    }) : null
  );
}

function IvModalAjuste(props) {
  var R = React;
  var it = props.item;
  var s1 = R.useState(''), cant = s1[0], setCant = s1[1];
  var s2 = R.useState(''), motivo = s2[0], setMotivo = s2[1];
  var s3 = R.useState(false), env = s3[0], setEnv = s3[1];
  var s4 = R.useState(''), error = s4[0], setError = s4[1];
  var n = Number(cant);
  var valido = /^-?[0-9]+$/.test(String(cant).trim()) && n !== 0 && motivo.trim().length >= 3;
  function enviar() {
    if (!valido || env) return;
    setEnv(true); setError('');
    var firma = [it.tipo, it.id, n, motivo.trim()].join('|');
    mnApi('inventario_ajuste', { tipo: it.tipo, item_id: it.id, cantidad: n, motivo: motivo.trim(), idem_key: mnLlaveDe(props.llaveRef, firma) })
      .then(function (r) { props.onListo('Ajuste registrado: «' + it.nombre + '» queda en ' + ivNum(r.existencia) + '.'); })
      .catch(function (e) { setError(e.message); setEnv(false); });
  }
  return _hIv(EscModal, {
    titulo: 'Ajuste de ' + it.nombre, ancho: 440, onCerrar: function () { if (!env) props.onCerrar(); },
    footer: _hIv('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
      _hIv('button', { className: 'btn btn-ghost', disabled: env, onClick: props.onCerrar }, 'Cancelar'),
      _hIv('button', { className: 'btn btn-primary', disabled: !valido || env, onClick: enviar }, env ? 'Guardando…' : 'Registrar ajuste'))
  },
    _hIv('div', { style: { fontSize: 13, color: 'var(--ink-3)', marginBottom: 12 } }, 'Hoy hay ' + ivNum(it.existencia) + '. Usa un número negativo para restar (pieza dañada, perdida) y positivo para sumar. Para dejar la existencia igual a lo que hay en el anaquel usa el Conteo físico.'),
    _hIv(EscCampo, { label: 'Cantidad (con signo)' },
      _hIv('input', { className: 'form-input', type: 'number', step: 1, inputMode: 'numeric', autoFocus: true, placeholder: 'Ej. -2', value: cant, onChange: function (e) { setCant(e.target.value); } })),
    _hIv(EscCampo, { label: 'Motivo (obligatorio)' },
      _hIv('input', { className: 'form-input', maxLength: 255, placeholder: 'Ej. Pieza dañada', value: motivo, onChange: function (e) { setMotivo(e.target.value); } })),
    _hIv(EscError, { msg: error }));
}

function IvModalDuplicar(props) {
  var R = React;
  var it = props.item;
  var s1 = R.useState(it.nombre), nombre = s1[0], setNombre = s1[1];
  var s2 = R.useState(false), env = s2[0], setEnv = s2[1];
  var s3 = R.useState(''), error = s3[0], setError = s3[1];
  var valido = nombre.trim().length > 0 && nombre.trim().toLowerCase() !== it.nombre.trim().toLowerCase();
  function enviar() {
    if (!valido || env) return;
    setEnv(true); setError('');
    mnApi('inventario_duplicar', { tipo: it.tipo, item_id: it.id, nombre: nombre.trim() })
      .then(function (r) { props.onListo('Creaste «' + nombre.trim() + '» con existencia 0. Captura lo que tienes con un conteo o una entrada.', r); })
      .catch(function (e) { setError(e.message); setEnv(false); });
  }
  return _hIv(EscModal, {
    titulo: 'Duplicar como otra talla', ancho: 440, onCerrar: function () { if (!env) props.onCerrar(); },
    footer: _hIv('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
      _hIv('button', { className: 'btn btn-ghost', disabled: env, onClick: props.onCerrar }, 'Cancelar'),
      _hIv('button', { className: 'btn btn-primary', disabled: !valido || env, onClick: enviar }, env ? 'Creando…' : 'Crear producto'))
  },
    _hIv('div', { style: { fontSize: 13, color: 'var(--ink-3)', marginBottom: 12 } }, 'Se crea un producto nuevo igual a «' + it.nombre + '» (mismo precio, categoría y datos fiscales), con otro nombre y existencia 0.'),
    _hIv(EscCampo, { label: 'Nombre del producto nuevo (incluye la talla)' },
      _hIv('input', { className: 'form-input', maxLength: it.tipo === 'tienda' ? 80 : 100, autoFocus: true, value: nombre, onChange: function (e) { setNombre(e.target.value); } })),
    _hIv(EscError, { msg: error }));
}

/* ───────────────────────── Entradas ───────────────────────── */

function IvEntradas(props) {
  var R = React;
  var items = props.datos.items || [];
  var proveedores = ((props.data && props.data.proveedores) || []).filter(function (p) { return p.activo !== false; });
  var s1 = R.useState([{ k: 1, ref: '', cantidad: '', costo: '' }]), lineas = s1[0], setLineas = s1[1];
  var s2 = R.useState(''), proveedor = s2[0], setProveedor = s2[1];
  var s3 = R.useState(''), nota = s3[0], setNota = s3[1];
  var s4 = R.useState(false), gasto = s4[0], setGasto = s4[1];
  var s5 = R.useState('Efectivo'), forma = s5[0], setForma = s5[1];
  var s6 = R.useState(mnHoy()), fecha = s6[0], setFecha = s6[1];
  var s7 = R.useState(false), env = s7[0], setEnv = s7[1];
  var s8 = R.useState(''), error = s8[0], setError = s8[1];
  var s9 = R.useState(''), ok = s9[0], setOk = s9[1];
  var s10 = R.useState(2), sig = s10[0], setSig = s10[1];
  var llaveRef = R.useRef(null);

  function cambiar(k, campo, v) {
    setLineas(lineas.map(function (l) { if (l.k !== k) return l; var n = Object.assign({}, l); n[campo] = v; return n; }));
    setError(''); setOk('');
  }
  function quitar(k) { setLineas(lineas.length > 1 ? lineas.filter(function (l) { return l.k !== k; }) : lineas); }

  var total = 0, faltaCosto = false, hayLineas = false;
  var payloadLineas = [];
  lineas.forEach(function (l) {
    var c = Number(l.cantidad);
    if (!l.ref || !/^[0-9]+$/.test(String(l.cantidad).trim()) || c < 1) return;
    hayLineas = true;
    var partes = l.ref.split(':');
    var costoTxt = String(l.costo).trim();
    if (costoTxt === '' || !isFinite(Number(costoTxt))) faltaCosto = true; else total += Math.round(Number(costoTxt) * 100) * c;
    var p = { tipo: partes[0], item_id: Number(partes[1]), cantidad: c };
    if (costoTxt !== '' && isFinite(Number(costoTxt))) p.costo_unitario = Number(costoTxt);
    payloadLineas.push(p);
  });
  var incompletas = lineas.filter(function (l) { return l.ref || String(l.cantidad).trim() || String(l.costo).trim(); }).length !== payloadLineas.length;
  var repetidos = (function () { var v = {}; for (var i = 0; i < payloadLineas.length; i++) { var k = payloadLineas[i].tipo + ':' + payloadLineas[i].item_id; if (v[k]) return true; v[k] = 1; } return false; })();
  var puede = hayLineas && !incompletas && !repetidos && !env && (!gasto || (!faltaCosto && total > 0));

  function enviar() {
    if (!puede) return;
    setEnv(true); setError(''); setOk('');
    var cuerpo = { lineas: payloadLineas, nota: nota.trim() };
    if (proveedor) cuerpo.proveedor_id = Number(proveedor);
    if (gasto) { cuerpo.registrar_gasto = true; cuerpo.forma_pago = forma; cuerpo.fecha = fecha; }
    // Misma llave mientras el contenido sea el mismo: un reintento tras un error de red no duplica la entrada.
    cuerpo.idem_key = mnLlaveDe(llaveRef, JSON.stringify(cuerpo));
    mnApi('inventario_entrada', cuerpo).then(function (r) {
      setOk(r.duplicado ? 'Esa entrada ya estaba registrada.' : 'Entrada registrada.' + (r.gasto_id ? ' Se creó el gasto #' + r.gasto_id + ' por ' + mnFmt(total / 100) + '.' : ''));
      setLineas([{ k: sig, ref: '', cantidad: '', costo: '' }]); setSig(sig + 1);
      setNota(''); setGasto(false); llaveRef.current = null;
      props.onCambio();
    }).catch(function (e) { setError(e.message); }).then(function () { setEnv(false); });
  }

  if (items.length === 0) {
    return _hIv(EscVacio, { icon: 'productos', titulo: 'No hay productos con control de existencias', sub: 'Activa el control en la pestaña Existencias para poder registrar entradas.' });
  }
  return _hIv('div', { className: 'card' },
    _hIv('div', { className: 'card-header' }, _hIv('div', { className: 'card-title' }, 'Entrada de mercancía')),
    lineas.map(function (l) {
      return _hIv('div', { key: l.k, style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 } },
        _hIv('div', { className: 'form-group', style: { margin: 0, flex: '3 1 220px' } },
          _hIv('label', { className: 'form-label' }, 'Producto'),
          _hIv('select', { className: 'form-select', value: l.ref, onChange: function (e) { cambiar(l.k, 'ref', e.target.value); } },
            _hIv('option', { value: '' }, 'Elige un producto…'),
            items.map(function (it) { return _hIv('option', { key: ivClave(it), value: ivClave(it) }, it.nombre + ' (' + ivTipoLabel(it.tipo).toLowerCase() + ', hay ' + ivNum(it.existencia) + ')'); }))),
        _hIv('div', { className: 'form-group', style: { margin: 0, flex: '1 1 90px' } },
          _hIv('label', { className: 'form-label' }, 'Piezas'),
          _hIv('input', { className: 'form-input', type: 'number', min: 1, step: 1, inputMode: 'numeric', value: l.cantidad, onChange: function (e) { cambiar(l.k, 'cantidad', e.target.value); } })),
        _hIv('div', { className: 'form-group', style: { margin: 0, flex: '1 1 110px' } },
          _hIv('label', { className: 'form-label' }, 'Costo unitario (opc.)'),
          _hIv('input', { className: 'form-input', type: 'number', min: 0, step: '0.01', inputMode: 'decimal', placeholder: '$', value: l.costo, onChange: function (e) { cambiar(l.k, 'costo', e.target.value); } })),
        _hIv('button', { className: 'btn btn-ghost btn-sm', disabled: lineas.length === 1, onClick: function () { quitar(l.k); }, 'aria-label': 'Quitar renglón' }, 'Quitar'));
    }),
    _hIv('button', { className: 'btn btn-ghost btn-sm', disabled: lineas.length >= 30, onClick: function () { setLineas(lineas.concat([{ k: sig, ref: '', cantidad: '', costo: '' }])); setSig(sig + 1); } }, '+ Agregar otro producto'),
    _hIv('div', { style: { display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 14 } },
      _hIv('div', { className: 'form-group', style: { flex: '1 1 220px', margin: 0 } },
        _hIv('label', { className: 'form-label' }, 'Proveedor (opcional)'),
        _hIv('select', { className: 'form-select', value: proveedor, onChange: function (e) { setProveedor(e.target.value); } },
          _hIv('option', { value: '' }, 'Sin proveedor'),
          proveedores.map(function (p) { return _hIv('option', { key: p.id, value: p.id }, p.nombre); }))),
      _hIv('div', { className: 'form-group', style: { flex: '2 1 240px', margin: 0 } },
        _hIv('label', { className: 'form-label' }, 'Nota (opcional)'),
        _hIv('input', { className: 'form-input', maxLength: 200, placeholder: 'Ej. Factura A-123', value: nota, onChange: function (e) { setNota(e.target.value); } }))),
    _hIv('label', { style: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, fontSize: 13.5, cursor: 'pointer' } },
      _hIv('input', { type: 'checkbox', checked: gasto, onChange: function (e) { setGasto(e.target.checked); setError(''); } }),
      'Registrar también como gasto'),
    gasto ? _hIv('div', { style: { display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10, padding: 12, borderRadius: 'var(--radius-sm)', background: 'var(--glass-light)' } },
      _hIv('div', { className: 'form-group', style: { flex: '1 1 160px', margin: 0 } },
        _hIv('label', { className: 'form-label' }, 'Forma de pago'),
        _hIv('select', { className: 'form-select', value: forma, onChange: function (e) { setForma(e.target.value); } },
          [['Efectivo', 'Efectivo'], ['Transferencia', 'Transferencia'], ['Cheque', 'Cheque'], ['TarjetaEmpresarial', 'Tarjeta empresarial'], ['Otro', 'Otro']].map(function (o) { return _hIv('option', { key: o[0], value: o[0] }, o[1]); }))),
      _hIv('div', { className: 'form-group', style: { flex: '1 1 160px', margin: 0 } },
        _hIv('label', { className: 'form-label' }, 'Fecha del gasto'),
        _hIv('input', { className: 'form-input', type: 'date', max: mnHoy(), value: fecha, onChange: function (e) { if (e.target.value) setFecha(e.target.value); } })),
      _hIv('div', { style: { flex: '1 1 100%', fontSize: 12.5, color: faltaCosto ? 'var(--amber)' : 'var(--ink-3)' } },
        faltaCosto ? 'Para registrar el gasto captura el costo unitario de todos los productos.' : 'Se creará un gasto por ' + mnFmt(total / 100) + (proveedor ? ' ligado al proveedor elegido.' : '.'))) : null,
    repetidos ? _hIv(EscError, { msg: 'Un producto aparece en dos renglones: suma las piezas en uno solo.' }) : null,
    _hIv(EscOk, { msg: ok }),
    _hIv(EscError, { msg: error }),
    _hIv('button', { className: 'btn btn-primary', style: { marginTop: 14 }, disabled: !puede, onClick: enviar }, env ? 'Registrando…' : 'Registrar entrada')
  );
}

/* ───────────────────────── Conteo físico ───────────────────────── */

function IvConteo(props) {
  var R = React;
  var items = props.datos.items || [];
  var s1 = R.useState({}), contados = s1[0], setContados = s1[1];     // clave -> texto
  var s2 = R.useState(''), q = s2[0], setQ = s2[1];
  var s3 = R.useState(''), motivo = s3[0], setMotivo = s3[1];
  var s4 = R.useState(false), confirmando = s4[0], setConfirmando = s4[1];
  var s5 = R.useState(false), env = s5[0], setEnv = s5[1];
  var s6 = R.useState(''), error = s6[0], setError = s6[1];
  var s7 = R.useState(null), resultado = s7[0], setResultado = s7[1];
  var esperadosRef = R.useRef({});   // la existencia que mostraba la hoja cuando se empezó a capturar cada renglón
  var llaveRef = R.useRef(null);

  var ql = q.trim().toLowerCase();
  var lista = items.filter(function (it) { return !ql || it.nombre.toLowerCase().indexOf(ql) >= 0; });

  // Renglones capturados (válidos) y diferencias contra lo que muestra la hoja.
  var capturados = [], invalidos = 0;
  items.forEach(function (it) {
    var t = contados[ivClave(it)];
    if (t === undefined || String(t).trim() === '') return;
    if (!/^[0-9]+$/.test(String(t).trim())) { invalidos++; return; }
    capturados.push({ it: it, contado: Number(String(t).trim()) });
  });
  var conDif = capturados.filter(function (c) { return c.contado !== c.it.existencia; });
  var puede = capturados.length > 0 && invalidos === 0 && motivo.trim().length >= 3 && !env;

  function escribir(it, v) {
    var k = ivClave(it);
    if (esperadosRef.current[k] === undefined) esperadosRef.current[k] = it.existencia;
    var c = Object.assign({}, contados); c[k] = v; setContados(c);
    setResultado(null); setError('');
  }

  function aplicar() {
    if (!puede) return;
    setEnv(true); setError('');
    var cuerpo = {
      motivo: motivo.trim(),
      lineas: capturados.map(function (c) {
        return { tipo: c.it.tipo, item_id: c.it.id, contado: c.contado, esperado: esperadosRef.current[ivClave(c.it)] };
      })
    };
    cuerpo.idem_key = mnLlaveDe(llaveRef, JSON.stringify(cuerpo));
    mnApi('inventario_conteo', cuerpo).then(function (r) {
      setResultado(r); setConfirmando(false); setContados({}); esperadosRef.current = {}; llaveRef.current = null; setMotivo('');
      props.onCambio();
    }).catch(function (e) { setError(e.message); setConfirmando(false); })
      .then(function () { setEnv(false); });
  }

  if (items.length === 0) {
    return _hIv(EscVacio, { icon: 'productos', titulo: 'No hay productos con control de existencias', sub: 'Activa el control en la pestaña Existencias para poder contarlos.' });
  }
  return _hIv('div', {},
    resultado ? _hIv('div', { className: 'card', style: { marginBottom: 14 } },
      _hIv(EscOk, { msg: 'Conteo aplicado: ' + resultado.aplicados.length + ' producto(s) ajustado(s), ' + resultado.sin_diferencia + ' sin diferencia.' }),
      resultado.aplicados.length ? _hIv('div', { className: 'table-wrap', style: { marginTop: 10 } }, _hIv('table', {},
        _hIv('thead', {}, _hIv('tr', {}, _hIv('th', {}, 'Producto'), _hIv('th', { style: { textAlign: 'right' } }, 'Había'), _hIv('th', { style: { textAlign: 'right' } }, 'Contado'), _hIv('th', { style: { textAlign: 'right' } }, 'Diferencia'))),
        _hIv('tbody', {}, resultado.aplicados.map(function (a) {
          return _hIv('tr', { key: a.tipo + a.item_id }, _hIv('td', {}, a.nombre), _hIv('td', { style: { textAlign: 'right' } }, ivNum(a.antes)), _hIv('td', { style: { textAlign: 'right' } }, ivNum(a.contado)),
            _hIv('td', { style: { textAlign: 'right', fontWeight: 700, color: a.diferencia < 0 ? 'var(--red)' : 'var(--green)' } }, (a.diferencia > 0 ? '+' : '') + ivNum(a.diferencia)));
        })))) : null,
      resultado.cambiaron && resultado.cambiaron.length ? _hIv('div', { style: { marginTop: 10, fontSize: 12.5, color: 'var(--amber)' } },
        'Ojo: estos productos tuvieron movimiento (ventas o entradas) mientras contabas, y la existencia quedó en lo que capturaste: ' +
        resultado.cambiaron.map(function (c) { return c.nombre + ' (la hoja decía ' + ivNum(c.esperado) + ' y había ' + ivNum(c.habia) + ')'; }).join('; ') + '. Si vendiste después de contarlos, ajusta la diferencia.') : null) : null,
    _hIv('div', { className: 'card' },
      _hIv('div', { className: 'card-header' }, _hIv('div', { className: 'card-title' }, 'Conteo físico')),
      _hIv('div', { style: { fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 12 } }, 'Captura lo que cuentas en el anaquel; deja en blanco lo que no cuentes (no se toca). Al aplicar, la existencia de cada producto queda exactamente en lo contado. Conviene contar con la tienda cerrada: si se vende mientras cuentas, el sistema lo avisa al final.'),
      _hIv('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 } },
        _hIv('input', { className: 'form-input', placeholder: 'Buscar producto…', value: q, style: { flex: '1 1 200px', maxWidth: 320 }, onChange: function (e) { setQ(e.target.value); } }),
        _hIv('input', { className: 'form-input', placeholder: 'Motivo (ej. Inventario de noviembre)', maxLength: 200, value: motivo, style: { flex: '2 1 260px' }, onChange: function (e) { setMotivo(e.target.value); } })),
      _hIv('div', { className: 'table-wrap' }, _hIv('table', {},
        _hIv('thead', {}, _hIv('tr', {}, _hIv('th', {}, 'Producto'), _hIv('th', { style: { textAlign: 'right' } }, 'Existencia actual'), _hIv('th', { style: { textAlign: 'right' } }, 'Contado'), _hIv('th', { style: { textAlign: 'right' } }, 'Diferencia'))),
        _hIv('tbody', {}, lista.map(function (it) {
          var k = ivClave(it), t = contados[k];
          var tiene = t !== undefined && String(t).trim() !== '';
          var valido = tiene && /^[0-9]+$/.test(String(t).trim());
          var dif = valido ? Number(String(t).trim()) - it.existencia : null;
          return _hIv('tr', { key: k },
            _hIv('td', {}, it.nombre, _hIv('span', { style: { fontSize: 11.5, color: 'var(--ink-4)', marginLeft: 8 } }, ivTipoLabel(it.tipo))),
            _hIv('td', { style: { textAlign: 'right' } }, _hIv(IvExistencia, { item: it })),
            _hIv('td', { style: { textAlign: 'right' } }, _hIv('input', {
              className: 'form-input', type: 'number', min: 0, step: 1, inputMode: 'numeric', style: { width: 90, textAlign: 'right', padding: '4px 8px', borderColor: tiene && !valido ? 'var(--red)' : undefined },
              'aria-label': 'Contado de ' + it.nombre, value: tiene ? t : '', onChange: function (e) { escribir(it, e.target.value); }
            })),
            _hIv('td', { style: { textAlign: 'right', fontWeight: 700, color: dif === null || dif === 0 ? 'var(--ink-4)' : (dif < 0 ? 'var(--red)' : 'var(--green)') } }, dif === null ? '' : (dif === 0 ? 'igual' : (dif > 0 ? '+' : '') + ivNum(dif))));
        })))),
      _hIv(EscError, { msg: error || (invalidos ? 'Hay ' + invalidos + ' renglón(es) con un número inválido (enteros de 0 en adelante).' : '') }),
      _hIv('div', { style: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 } },
        _hIv('button', { className: 'btn btn-primary', disabled: !puede, onClick: function () { setConfirmando(true); } }, 'Aplicar conteo'),
        _hIv('div', { style: { fontSize: 12.5, color: 'var(--ink-3)' } }, capturados.length + ' contado(s), ' + conDif.length + ' con diferencia' + (motivo.trim().length < 3 && capturados.length ? ' · escribe el motivo' : '')))),
    confirmando ? _hIv(EscModal, {
      titulo: 'Aplicar el conteo', ancho: 460, onCerrar: function () { if (!env) setConfirmando(false); },
      footer: _hIv('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
        _hIv('button', { className: 'btn btn-ghost', disabled: env, onClick: function () { setConfirmando(false); } }, 'Revisar otra vez'),
        _hIv('button', { className: 'btn btn-primary', disabled: env, onClick: aplicar }, env ? 'Aplicando…' : 'Sí, ajustar ' + conDif.length + ' producto(s)'))
    },
      _hIv('div', { style: { fontSize: 14, marginBottom: 8 } }, conDif.length === 0 ? 'Todo lo contado coincide con el sistema: no habrá ningún ajuste.' : 'La existencia de ' + conDif.length + ' producto(s) cambiará a lo que contaste. Cada cambio queda en el historial con el motivo «' + motivo.trim() + '».'),
      conDif.slice(0, 8).map(function (c) {
        return _hIv('div', { key: ivClave(c.it), style: { fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 10, padding: '3px 0' } },
          _hIv('span', {}, c.it.nombre), _hIv('span', { style: { fontWeight: 700 } }, ivNum(c.it.existencia) + ' → ' + ivNum(c.contado)));
      }),
      conDif.length > 8 ? _hIv('div', { style: { fontSize: 12, color: 'var(--ink-4)' } }, '… y ' + (conDif.length - 8) + ' más') : null) : null
  );
}

/* ───────────────────────── Movimientos ───────────────────────── */

function IvMovimientos(props) {
  var R = React;
  var items = props.datos.items || [];
  var s1 = R.useState(props.inicial || ''), ref = s1[0], setRef = s1[1];
  var s2 = R.useState(null), movs = s2[0], setMovs = s2[1];
  var s3 = R.useState(false), hayMas = s3[0], setHayMas = s3[1];
  var s4 = R.useState(''), error = s4[0], setError = s4[1];
  var s5 = R.useState(false), cargando = s5[0], setCargando = s5[1];

  function cargar(mas) {
    setCargando(true); setError('');
    var cuerpo = { limite: 50 };
    if (ref) { var p = ref.split(':'); cuerpo.tipo = p[0]; cuerpo.item_id = Number(p[1]); }
    if (mas && movs && movs.length) cuerpo.antes_id = movs[movs.length - 1].id;
    mnApi('inventario_movimientos', cuerpo).then(function (r) {
      setMovs(mas ? (movs || []).concat(r.movimientos) : r.movimientos); setHayMas(r.hay_mas);
    }).catch(function (e) { setError(e.message); }).then(function () { setCargando(false); });
  }
  R.useEffect(function () { cargar(false); }, [ref, props.version]);

  return _hIv('div', { className: 'card' },
    _hIv('div', { className: 'card-header' }, _hIv('div', { className: 'card-title' }, 'Movimientos')),
    _hIv('div', { className: 'form-group', style: { maxWidth: 420 } },
      _hIv('label', { className: 'form-label' }, 'Producto'),
      _hIv('select', { className: 'form-select', value: ref, onChange: function (e) { setRef(e.target.value); } },
        _hIv('option', { value: '' }, 'Todos los productos (lo más reciente)'),
        items.map(function (it) { return _hIv('option', { key: ivClave(it), value: ivClave(it) }, it.nombre + ' (' + ivTipoLabel(it.tipo).toLowerCase() + ')'); }))),
    _hIv(EscError, { msg: error }),
    movs === null ? _hIv('div', { style: { color: 'var(--ink-3)', fontSize: 13 } }, 'Cargando…')
    : movs.length === 0 ? _hIv('div', { style: { color: 'var(--ink-3)', fontSize: 13 } }, 'Todavía no hay movimientos.')
    : _hIv('div', { className: 'table-wrap' }, _hIv('table', {},
        _hIv('thead', {}, _hIv('tr', {}, _hIv('th', {}, 'Cuándo'), ref ? null : _hIv('th', {}, 'Producto'), _hIv('th', {}, 'Movimiento'), _hIv('th', { style: { textAlign: 'right' } }, 'Piezas'), _hIv('th', { style: { textAlign: 'right' } }, 'Quedó'), _hIv('th', {}, 'Quién'), _hIv('th', {}, 'Motivo / documento'))),
        _hIv('tbody', {}, movs.map(function (m) {
          var info = IV_MOV[m.movimiento] || { label: m.movimiento, color: 'var(--ink)' };
          var doc = [];
          if (m.folio) doc.push('Cobro ' + m.folio); else if (m.cobro_id) doc.push('Cobro #' + m.cobro_id);
          if (m.venta_id) doc.push('Venta de tiendita #' + m.venta_id);
          if (m.proveedor) doc.push(m.proveedor);
          if (m.costo_unitario !== null) doc.push('costo ' + mnFmt(m.costo_unitario));
          if (m.gasto_id) doc.push('gasto #' + m.gasto_id);
          return _hIv('tr', { key: m.id },
            _hIv('td', { style: { whiteSpace: 'nowrap' } }, mnFechaHora(m.creado_en)),
            ref ? null : _hIv('td', {}, m.producto || ('#' + m.item_id)),
            _hIv('td', { style: { color: info.color, fontWeight: 600 } }, info.label),
            _hIv('td', { style: { textAlign: 'right', fontWeight: 700, color: m.cantidad < 0 ? 'var(--red)' : 'var(--green)' } }, (m.cantidad > 0 ? '+' : '') + ivNum(m.cantidad)),
            _hIv('td', { style: { textAlign: 'right', color: m.existencia_despues <= 0 ? 'var(--red)' : undefined } }, ivNum(m.existencia_despues)),
            _hIv('td', {}, m.usuario || '—'),
            _hIv('td', { style: { fontSize: 12.5, color: 'var(--ink-3)' } }, [m.motivo].concat(doc).filter(Boolean).join(' · ')));
        })))),
    hayMas ? _hIv('button', { className: 'btn btn-ghost', style: { marginTop: 12 }, disabled: cargando, onClick: function () { cargar(true); } }, cargando ? 'Cargando…' : 'Cargar más') : null
  );
}

/* ───────────────────────── Vista principal ───────────────────────── */

// props: data, setData, user, escuela (los pasa app.js).
function Inventario(props) {
  var R = React;
  var s1 = R.useState('existencias'), tab = s1[0], setTab = s1[1];
  var s2 = R.useState(null), datos = s2[0], setDatos = s2[1];
  var s3 = R.useState(''), error = s3[0], setError = s3[1];
  var s4 = R.useState(0), version = s4[0], setVersion = s4[1];
  var s5 = R.useState(''), historialDe = s5[0], setHistorialDe = s5[1];
  var setData = props.setData;

  function cargar(productoNuevo) {
    mnApi('inventario_listar', {}).then(function (r) {
      setDatos(r); setError(''); setVersion(function (v) { return v + 1; });
      // Mantiene al día lo que Caja y el menú leen de `data`: el aviso (onAlertas) y la
      // existencia junto al producto (setData).
      if (typeof props.onAlertas === 'function') props.onAlertas(r.alertas || null);
      if (typeof setData === 'function') {
        var porId = {};
        (r.items || []).forEach(function (i) { if (i.tipo === 'concepto') porId[i.id] = i.existencia; });
        setData(function (prev) {
          if (!prev) return prev;
          var prods = (prev.productos || []).map(function (p) {
            if (porId[p.id] !== undefined) return Object.assign({}, p, { maneja_existencias: 1, existencia: porId[p.id] });
            if (p.maneja_existencias) return Object.assign({}, p, { maneja_existencias: 0, existencia: null });
            return p;
          });
          if (productoNuevo && !prods.some(function (p) { return p.id === productoNuevo.id; })) {
            prods = prods.concat([Object.assign({}, productoNuevo, { existencia: porId[productoNuevo.id] !== undefined ? porId[productoNuevo.id] : 0 })]);
          }
          return Object.assign({}, prev, { productos: prods });
        });
      }
    }).catch(function (e) { setError(e.message); setDatos(function (d) { return d || { items: [], sin_control: [], alertas: null }; }); });
  }
  R.useEffect(function () { cargar(null); }, []);

  var tabs = [{ id: 'existencias', label: 'Existencias' }, { id: 'entradas', label: 'Entradas' }, { id: 'conteo', label: 'Conteo físico' }, { id: 'movimientos', label: 'Movimientos' }];
  var cuerpo;
  if (!datos) cuerpo = _hIv('div', { style: { color: 'var(--ink-3)', fontSize: 13 } }, 'Cargando…');
  else if (tab === 'existencias') cuerpo = _hIv(IvExistencias, { datos: datos, onCambio: cargar, onHistorial: function (it) { setHistorialDe(ivClave(it)); setTab('movimientos'); } });
  else if (tab === 'entradas') cuerpo = _hIv(IvEntradas, { datos: datos, data: props.data, onCambio: cargar });
  else if (tab === 'conteo') cuerpo = _hIv(IvConteo, { datos: datos, onCambio: cargar });
  else cuerpo = _hIv(IvMovimientos, { key: 'mov-' + historialDe, datos: datos, inicial: historialDe, version: version });

  return _hIv('div', {},
    _hIv(EscTabs, { tabs: tabs, valor: tab, onCambio: function (t) { if (t !== 'movimientos') setHistorialDe(''); setTab(t); } }),
    _hIv(EscError, { msg: error }),
    cuerpo);
}
