// views/Monedero.js — Monedero virtual del alumno, lado del colegio (F6, 18-nov-2026)
//
// Admin: pestañas Recarga en caja · Saldos y reporte · Productos de la tiendita
//        · Ajustes · Configuración.
// Cajero: solo Recarga en caja.
//
// El monedero se ACTIVA por colegio (escuelas.monedero_activo, apagado por
// defecto). Con el monedero apagado el admin solo ve Configuración (para
// activarlo) y el cajero un aviso: el servidor además corta recargas y ventas.
//
// Reusa los globales de views/ControlEscolar.js (EscModal, EscCampo, EscError,
// EscOk, EscVacio, EscTabs, EscStat), que se carga antes en index.html. También
// define los ayudantes mn* que usan Tienda.js y MonederoFamilia.js, así que
// ESTE archivo va antes que ellos. `var` y React.createElement directo, por la
// misma razón que PortalAlumno.js (sin compilación).

var _hMn = React.createElement;

/* ───────────────────────── Ayudantes compartidos ───────────────────────── */

function mnFmt(n) {
  var v = Number(n || 0);
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Llamada a la API que lanza Error con el mensaje del servidor si success es falso.
function mnApi(accion, cuerpo) {
  return ApiClient.post(accion, cuerpo || {}).then(function (r) {
    if (!r || !r.success) throw new Error((r && r.error) || 'No se pudo completar la operación.');
    return r;
  });
}

// Llave de idempotencia de UN intento de operación: solo [A-Za-z0-9_-], 8 a 64
// caracteres (es lo que valida el servidor). randomUUID solo existe en
// contextos seguros (https): se cae a getRandomValues y, al final, a Math.random.
function mnLlave() {
  var hex = '';
  try {
    if (window.crypto && window.crypto.randomUUID) {
      hex = window.crypto.randomUUID().replace(/-/g, '');
    } else if (window.crypto && window.crypto.getRandomValues) {
      var a = new Uint8Array(16);
      window.crypto.getRandomValues(a);
      for (var i = 0; i < a.length; i++) hex += ('0' + a[i].toString(16)).slice(-2);
    }
  } catch (e) { hex = ''; }
  if (!hex) hex = Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return 'k' + hex.slice(0, 40);
}

// La misma llave sirve mientras no cambie lo que se está enviando (firma): un
// reintento tras un error de red usa la MISMA llave y el servidor devuelve la
// operación ya hecha en vez de repetirla; si el usuario cambia monto/alumno, se
// genera otra. `ref` es un objeto mutable (useRef).
function mnLlaveDe(ref, firma) {
  if (!ref.current || ref.current.firma !== firma) ref.current = { firma: firma, llave: mnLlave() };
  return ref.current.llave;
}

function mnFechaHora(s) {
  if (!s) return '';
  var d = new Date(String(s).replace(' ', 'T'));
  if (isNaN(d.getTime())) return String(s);
  return d.toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function mnHoy() {
  var d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

function MnAvatar(props) {
  var t = props.tam || 44;
  return _hMn('div', {
    style: { width: t, height: t, borderRadius: '50%', background: 'var(--grad-cool, var(--accent))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: Math.round(t * 0.4), overflow: 'hidden', flexShrink: 0 }
  }, props.foto ? _hMn('img', { src: props.foto, alt: '', style: { width: '100%', height: '100%', objectFit: 'cover' } }) : (props.nombre || '?').charAt(0).toUpperCase());
}

/* Buscador de alumno por matrícula o nombre (usa tienda_buscar_alumno). */
function MnBuscarAlumno(props) {
  var R = React;
  var s1 = R.useState(''), q = s1[0], setQ = s1[1];
  var s2 = R.useState(null), res = s2[0], setRes = s2[1];
  var s3 = R.useState(''), error = s3[0], setError = s3[1];
  var seq = R.useRef(0);

  R.useEffect(function () {
    if (q.trim().length < 2) { setRes(null); setError(''); return; }
    var mi = ++seq.current;
    var t = setTimeout(function () {
      mnApi('tienda_buscar_alumno', { q: q.trim() }).then(function (r) {
        if (mi !== seq.current) return;
        setRes(r.alumnos || []); setError('');
      }).catch(function (e) { if (mi === seq.current) { setRes(null); setError(e.message); } });
    }, 300);
    return function () { clearTimeout(t); };
  }, [q]);

  return _hMn('div', {},
    _hMn('input', {
      className: 'form-input', type: 'search', value: q, autoFocus: !!props.autoFocus,
      placeholder: props.placeholder || 'Matrícula o nombre del alumno…',
      onChange: function (e) { setQ(e.target.value); },
      style: props.grande ? { fontSize: 18, padding: '12px 14px' } : undefined
    }),
    _hMn(EscError, { msg: error }),
    res && res.length === 0 ? _hMn('div', { style: { fontSize: 13, color: 'var(--ink-3)', marginTop: 10 } }, 'No se encontró ningún alumno activo con eso.') : null,
    res && res.length ? _hMn('div', { style: { display: 'grid', gap: 8, marginTop: 10 } },
      res.map(function (a) {
        return _hMn('button', {
          key: a.id, type: 'button',
          onClick: function () { props.onElegir(a); setQ(''); setRes(null); },
          style: { display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', padding: '10px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-glow)', borderRadius: 12, cursor: 'pointer', color: 'var(--ink)' }
        },
          _hMn(MnAvatar, { foto: a.foto_url, nombre: a.nombre }),
          _hMn('div', { style: { flex: 1, minWidth: 0 } },
            _hMn('div', { style: { fontWeight: 700, fontSize: 14 } }, a.nombre),
            _hMn('div', { style: { fontSize: 12, color: 'var(--ink-3)' } },
              [a.matricula ? 'Matrícula ' + a.matricula : null, a.grado || null].filter(Boolean).join(' · '))),
          _hMn('div', { style: { textAlign: 'right' } },
            _hMn('div', { style: { fontWeight: 700 } }, mnFmt(a.saldo)),
            a.bloqueado ? _hMn('div', { style: { fontSize: 11, color: 'var(--red)' } }, 'Bloqueado') : null));
      })) : null
  );
}

/* ───────────────────────── Recarga en caja ───────────────────────── */

function MnRecargaCaja(props) {
  var R = React;
  var s1 = R.useState(null), alumno = s1[0], setAlumno = s1[1];
  var s2 = R.useState(''), monto = s2[0], setMonto = s2[1];
  var s3 = R.useState('Efectivo'), metodo = s3[0], setMetodo = s3[1];
  var s4 = R.useState(false), enviando = s4[0], setEnviando = s4[1];
  var s5 = R.useState(''), error = s5[0], setError = s5[1];
  var s6 = R.useState(''), ok = s6[0], setOk = s6[1];
  var llaveRef = R.useRef(null);

  var montoNum = Number(monto);
  var montoValido = monto !== '' && isFinite(montoNum) && montoNum >= 20 && montoNum <= 5000;

  function registrar() {
    if (!alumno || !montoValido || enviando) return;
    setEnviando(true); setError(''); setOk('');
    // Misma llave mientras alumno, monto y método no cambien: si la respuesta
    // se pierde (timeout) y se vuelve a pulsar, el servidor contesta la
    // recarga ya hecha en vez de duplicarla.
    var llave = mnLlaveDe(llaveRef, alumno.id + '|' + montoNum + '|' + metodo);
    mnApi('monedero_recarga_caja', { cliente_id: alumno.id, monto: montoNum, metodo: metodo, solicitud_key: llave })
      .then(function (r) {
        setOk((r.duplicado ? 'Esa recarga ya estaba registrada. ' : 'Recarga registrada. ') + 'Saldo de ' + alumno.nombre + ': ' + mnFmt(r.saldo_despues)
          + (r.cobro && r.cobro.folio ? ' · Folio ' + r.cobro.folio : '') + '.');
        setAlumno(null); setMonto(''); llaveRef.current = null;
      })
      .catch(function (e) { setError(e.message); })
      .then(function () { setEnviando(false); });
  }

  return _hMn('div', { className: 'card', style: { maxWidth: 640 } },
    _hMn('div', { className: 'card-header' }, _hMn('div', { className: 'card-title' }, 'Recarga en caja')),
    _hMn('div', { style: { fontSize: 13, color: 'var(--ink-3)', marginBottom: 14 } },
      'Cobra la recarga en efectivo o con la terminal y se acredita al instante. Queda en tu corte de caja como cualquier cobro. Necesitas una caja abierta.'),
    _hMn(EscOk, { msg: ok }),
    !alumno ? _hMn(MnBuscarAlumno, { onElegir: function (a) { setAlumno(a); setOk(''); setError(''); }, autoFocus: true })
    : _hMn('div', {},
        _hMn('div', { style: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid var(--border-glow)', borderRadius: 12, marginBottom: 14 } },
          _hMn(MnAvatar, { foto: alumno.foto_url, nombre: alumno.nombre }),
          _hMn('div', { style: { flex: 1 } },
            _hMn('div', { style: { fontWeight: 700 } }, alumno.nombre),
            _hMn('div', { style: { fontSize: 12, color: 'var(--ink-3)' } }, 'Saldo actual ' + mnFmt(alumno.saldo))),
          _hMn('button', { className: 'btn btn-ghost btn-sm', onClick: function () { setAlumno(null); setError(''); } }, 'Cambiar')),
        _hMn(EscCampo, { label: 'Monto a recargar (de $20 a $5,000)' },
          _hMn('input', { className: 'form-input', type: 'number', inputMode: 'decimal', min: 20, max: 5000, step: '0.01', value: monto, onChange: function (e) { setMonto(e.target.value); }, placeholder: '0.00' })),
        _hMn(EscCampo, { label: '¿Cómo se cobró?' },
          _hMn('div', { className: 'pill-group' },
            [{ id: 'Efectivo', label: 'Efectivo' }, { id: 'TC', label: 'Terminal (tarjeta)' }].map(function (m) {
              return _hMn('button', { key: m.id, type: 'button', className: 'pill' + (metodo === m.id ? ' active' : ''), onClick: function () { setMetodo(m.id); } }, m.label);
            }))),
        _hMn(EscError, { msg: error }),
        _hMn('div', { style: { marginTop: 14 } },
          _hMn('button', { className: 'btn btn-primary', disabled: !montoValido || enviando, onClick: registrar },
            enviando ? 'Registrando…' : 'Registrar recarga' + (montoValido ? ' de ' + mnFmt(montoNum) : ''))))
  );
}

/* ───────────────────────── Saldos y reporte ───────────────────────── */

function MnReporte(props) {
  var R = React;
  var hoy = mnHoy();
  var s1 = R.useState(hoy.slice(0, 8) + '01'), desde = s1[0], setDesde = s1[1];
  var s2 = R.useState(hoy), hasta = s2[0], setHasta = s2[1];
  var s3 = R.useState(null), rep = s3[0], setRep = s3[1];
  var s4 = R.useState(''), error = s4[0], setError = s4[1];
  var s5 = R.useState(false), cargando = s5[0], setCargando = s5[1];

  function cargar() {
    setCargando(true); setError('');
    mnApi('monedero_reporte', { desde: desde, hasta: hasta }).then(setRep)
      .catch(function (e) { setError(e.message); })
      .then(function () { setCargando(false); });
  }
  R.useEffect(cargar, []);

  var t = rep && rep.totales;
  return _hMn('div', {},
    _hMn('div', { className: 'card', style: { marginBottom: 16 } },
      _hMn('div', { style: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' } },
        _hMn(EscCampo, { label: 'Desde', style: { margin: 0 } }, _hMn('input', { className: 'form-input', type: 'date', value: desde, onChange: function (e) { setDesde(e.target.value); } })),
        _hMn(EscCampo, { label: 'Hasta', style: { margin: 0 } }, _hMn('input', { className: 'form-input', type: 'date', value: hasta, onChange: function (e) { setHasta(e.target.value); } })),
        _hMn('button', { className: 'btn btn-primary', onClick: cargar, disabled: cargando }, cargando ? 'Cargando…' : 'Ver reporte')),
      _hMn(EscError, { msg: error })),
    rep ? _hMn('div', {},
      _hMn('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 } },
        _hMn(EscStat, { label: 'Dinero de las familias que el colegio custodia', valor: mnFmt(rep.total_saldos) }),
        _hMn(EscStat, { label: 'Recargas del periodo (' + t.recargas.n + ')', valor: mnFmt(t.recargas.monto) }),
        _hMn(EscStat, { label: 'Compras en la tiendita (' + t.consumos.n + ')', valor: mnFmt(t.consumos.monto) }),
        _hMn(EscStat, { label: 'Devoluciones (' + t.reversos.n + ')', valor: mnFmt(t.reversos.monto) }),
        _hMn(EscStat, { label: 'Ajustes + / −', valor: mnFmt(t.ajustes_suma.monto) + ' / ' + mnFmt(t.ajustes_resta.monto) })),
      _hMn('div', { style: { fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 12 } },
        'Los saldos son dinero de las familias, no ingreso del colegio: es lo que debes poder devolver o seguir sirviendo en la tiendita. ',
        rep.cuadra ? 'Los saldos cuadran con el libro de movimientos.' : _hMn('strong', { style: { color: 'var(--red)' } }, 'Atención: la suma de saldos (' + mnFmt(rep.total_saldos) + ') no coincide con el libro de movimientos (' + mnFmt(rep.total_libro) + '). Avisa a soporte.')),
      _hMn('div', { className: 'card', style: { marginBottom: 16 } },
        _hMn('div', { className: 'card-header' }, _hMn('div', { className: 'card-title' }, 'Saldos por alumno')),
        rep.saldos.length === 0 ? _hMn('div', { style: { fontSize: 13, color: 'var(--ink-3)' } }, 'Ningún alumno tiene saldo en su monedero.')
        : _hMn('div', { className: 'table-wrap' }, _hMn('table', {},
            _hMn('thead', {}, _hMn('tr', {}, _hMn('th', {}, 'Alumno'), _hMn('th', {}, 'Grado'), _hMn('th', {}, 'Matrícula'), _hMn('th', { style: { textAlign: 'right' } }, 'Saldo'))),
            _hMn('tbody', {}, rep.saldos.map(function (s) {
              return _hMn('tr', { key: s.cliente_id },
                _hMn('td', {}, s.nombre, s.activo ? null : _hMn('span', { style: { marginLeft: 6, fontSize: 11, color: 'var(--amber)' } }, 'baja: devolver saldo')),
                _hMn('td', {}, s.grado || '—'), _hMn('td', {}, s.matricula || '—'),
                _hMn('td', { style: { textAlign: 'right', fontWeight: 700 } }, mnFmt(s.saldo)));
            }))))),
      _hMn('div', { className: 'card' },
        _hMn('div', { className: 'card-header' }, _hMn('div', { className: 'card-title' }, 'Consumo por día')),
        rep.por_dia.length === 0 ? _hMn('div', { style: { fontSize: 13, color: 'var(--ink-3)' } }, 'Sin compras en el periodo.')
        : _hMn('div', { className: 'table-wrap' }, _hMn('table', {},
            _hMn('thead', {}, _hMn('tr', {}, _hMn('th', {}, 'Día'), _hMn('th', { style: { textAlign: 'right' } }, 'Compras'), _hMn('th', { style: { textAlign: 'right' } }, 'Devoluciones'), _hMn('th', { style: { textAlign: 'right' } }, 'Neto'))),
            _hMn('tbody', {}, rep.por_dia.map(function (d) {
              return _hMn('tr', { key: d.fecha }, _hMn('td', {}, d.fecha), _hMn('td', { style: { textAlign: 'right' } }, mnFmt(d.consumos)),
                _hMn('td', { style: { textAlign: 'right' } }, mnFmt(d.reversos)), _hMn('td', { style: { textAlign: 'right', fontWeight: 700 } }, mnFmt(d.neto)));
            })))))
    ) : null
  );
}

/* ───────────────────────── Productos de la tiendita ───────────────────────── */

function MnProductos(props) {
  var R = React;
  var s1 = R.useState(null), lista = s1[0], setLista = s1[1];
  var s2 = R.useState(null), form = s2[0], setForm = s2[1];
  var s3 = R.useState(''), error = s3[0], setError = s3[1];
  var s4 = R.useState(false), guardando = s4[0], setGuardando = s4[1];

  function cargar() {
    mnApi('tienda_productos_listar', { todos: 1 }).then(function (r) { setLista(r.productos || []); })
      .catch(function (e) { setError(e.message); });
  }
  R.useEffect(cargar, []);

  function guardar(extra) {
    var f = Object.assign({}, form, extra || {});
    setGuardando(true); setError('');
    mnApi('tienda_producto_guardar', { id: f.id || 0, nombre: f.nombre, precio: f.precio, activo: f.activo ? 1 : 0 })
      .then(function () { setForm(null); cargar(); })
      .catch(function (e) { setError(e.message); })
      .then(function () { setGuardando(false); });
  }
  function alternar(p) {
    mnApi('tienda_producto_guardar', { id: p.id, nombre: p.nombre, precio: p.precio, activo: p.activo ? 0 : 1 })
      .then(cargar).catch(function (e) { setError(e.message); });
  }

  return _hMn('div', { className: 'card' },
    _hMn('div', { className: 'card-header', style: { display: 'flex', alignItems: 'center', gap: 12 } },
      _hMn('div', { className: 'card-title', style: { flex: 1 } }, 'Productos de la tiendita'),
      _hMn('button', { className: 'btn btn-primary btn-sm', onClick: function () { setForm({ nombre: '', precio: '', activo: true }); setError(''); } }, '+ Producto')),
    _hMn('div', { style: { fontSize: 13, color: 'var(--ink-3)', marginBottom: 12 } },
      'Estos son los botones que ve el vendedor. El precio siempre se toma de aquí al cobrar. Los productos no se borran: se desactivan.'),
    _hMn(EscError, { msg: error }),
    form ? _hMn('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', padding: 12, margin: '10px 0', border: '1px solid var(--border-glow)', borderRadius: 12 } },
      _hMn(EscCampo, { label: 'Nombre', style: { margin: 0, flex: '2 1 200px' } }, _hMn('input', { className: 'form-input', maxLength: 80, value: form.nombre, onChange: function (e) { setForm(Object.assign({}, form, { nombre: e.target.value })); } })),
      _hMn(EscCampo, { label: 'Precio', style: { margin: 0, flex: '1 1 100px' } }, _hMn('input', { className: 'form-input', type: 'number', inputMode: 'decimal', min: 0.5, step: '0.5', value: form.precio, onChange: function (e) { setForm(Object.assign({}, form, { precio: e.target.value })); } })),
      _hMn('button', { className: 'btn btn-primary', disabled: guardando || !form.nombre.trim() || !form.precio, onClick: function () { guardar(); } }, guardando ? 'Guardando…' : 'Guardar'),
      _hMn('button', { className: 'btn btn-ghost', onClick: function () { setForm(null); } }, 'Cancelar')) : null,
    lista === null ? _hMn('div', { style: { fontSize: 13, color: 'var(--ink-3)' } }, 'Cargando…')
    : lista.length === 0 ? _hMn('div', { style: { fontSize: 13, color: 'var(--ink-3)' } }, 'Todavía no hay productos. Agrega el primero con “+ Producto”.')
    : _hMn('div', { className: 'table-wrap' }, _hMn('table', {},
        _hMn('thead', {}, _hMn('tr', {}, _hMn('th', {}, 'Producto'), _hMn('th', { style: { textAlign: 'right' } }, 'Precio'), _hMn('th', {}, 'Estado'), _hMn('th', {}, ''))),
        _hMn('tbody', {}, lista.map(function (p) {
          return _hMn('tr', { key: p.id, style: p.activo ? undefined : { opacity: 0.55 } },
            _hMn('td', {}, p.nombre), _hMn('td', { style: { textAlign: 'right' } }, mnFmt(p.precio)),
            _hMn('td', {}, p.activo ? 'Activo' : 'Inactivo'),
            _hMn('td', { style: { textAlign: 'right', whiteSpace: 'nowrap' } },
              _hMn('button', { className: 'btn btn-ghost btn-sm', onClick: function () { setForm({ id: p.id, nombre: p.nombre, precio: p.precio, activo: p.activo }); setError(''); } }, 'Editar'),
              _hMn('button', { className: 'btn btn-ghost btn-sm', onClick: function () { alternar(p); } }, p.activo ? 'Desactivar' : 'Activar')));
        }))))
  );
}

/* ───────────────────────── Ajustes ───────────────────────── */

function MnAjustes(props) {
  var R = React;
  var s1 = R.useState(null), alumno = s1[0], setAlumno = s1[1];
  var s2 = R.useState(1), signo = s2[0], setSigno = s2[1];
  var s3 = R.useState(''), monto = s3[0], setMonto = s3[1];
  var s4 = R.useState(''), motivo = s4[0], setMotivo = s4[1];
  var s5 = R.useState(false), enviando = s5[0], setEnviando = s5[1];
  var s6 = R.useState(''), error = s6[0], setError = s6[1];
  var s7 = R.useState(''), ok = s7[0], setOk = s7[1];
  var llaveRef = R.useRef(null);
  var montoNum = Number(monto);
  var valido = alumno && monto !== '' && isFinite(montoNum) && montoNum > 0 && motivo.trim().length >= 5;

  function aplicar() {
    if (!valido || enviando) return;
    if (!window.confirm((signo > 0 ? 'Sumar ' : 'Restar ') + mnFmt(montoNum) + ' al monedero de ' + alumno.nombre + '?\n\nMotivo: ' + motivo.trim())) return;
    setEnviando(true); setError(''); setOk('');
    var llave = mnLlaveDe(llaveRef, [alumno.id, signo, montoNum, motivo.trim()].join('|'));
    mnApi('monedero_ajuste', { cliente_id: alumno.id, signo: signo, monto: montoNum, motivo: motivo.trim(), solicitud_key: llave })
      .then(function (r) {
        setOk((r.duplicado ? 'Ese ajuste ya estaba registrado. ' : 'Ajuste registrado. ') + 'Nuevo saldo de ' + alumno.nombre + ': ' + mnFmt(r.saldo_despues) + '.');
        setAlumno(null); setMonto(''); setMotivo(''); llaveRef.current = null;
      })
      .catch(function (e) { setError(e.message); })
      .then(function () { setEnviando(false); });
  }

  return _hMn('div', { className: 'card', style: { maxWidth: 640 } },
    _hMn('div', { className: 'card-header' }, _hMn('div', { className: 'card-title' }, 'Ajuste manual de saldo')),
    _hMn('div', { style: { fontSize: 13, color: 'var(--ink-3)', marginBottom: 14 } },
      'Para corregir un error o devolver un saldo (por ejemplo, un alumno dado de baja). Queda en el historial del alumno con tu nombre y el motivo. El saldo nunca puede quedar negativo.'),
    _hMn(EscOk, { msg: ok }),
    !alumno ? _hMn(MnBuscarAlumno, { onElegir: function (a) { setAlumno(a); setOk(''); setError(''); } })
    : _hMn('div', {},
        _hMn('div', { style: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid var(--border-glow)', borderRadius: 12, marginBottom: 14 } },
          _hMn(MnAvatar, { foto: alumno.foto_url, nombre: alumno.nombre }),
          _hMn('div', { style: { flex: 1 } }, _hMn('div', { style: { fontWeight: 700 } }, alumno.nombre), _hMn('div', { style: { fontSize: 12, color: 'var(--ink-3)' } }, 'Saldo actual ' + mnFmt(alumno.saldo))),
          _hMn('button', { className: 'btn btn-ghost btn-sm', onClick: function () { setAlumno(null); } }, 'Cambiar')),
        _hMn(EscCampo, { label: 'Tipo de ajuste' },
          _hMn('div', { className: 'pill-group' },
            [{ v: 1, l: 'Sumar al saldo' }, { v: -1, l: 'Restar del saldo' }].map(function (o) {
              return _hMn('button', { key: o.v, type: 'button', className: 'pill' + (signo === o.v ? ' active' : ''), onClick: function () { setSigno(o.v); } }, o.l);
            }))),
        _hMn(EscCampo, { label: 'Monto' }, _hMn('input', { className: 'form-input', type: 'number', inputMode: 'decimal', min: 0.01, step: '0.01', value: monto, onChange: function (e) { setMonto(e.target.value); } })),
        _hMn(EscCampo, { label: 'Motivo (obligatorio, mínimo 5 caracteres)' }, _hMn('input', { className: 'form-input', maxLength: 200, value: motivo, onChange: function (e) { setMotivo(e.target.value); } })),
        _hMn(EscError, { msg: error }),
        _hMn('div', { style: { marginTop: 14 } }, _hMn('button', { className: 'btn btn-primary', disabled: !valido || enviando, onClick: aplicar }, enviando ? 'Aplicando…' : 'Aplicar ajuste')))
  );
}

/* ───────────────────────── Configuración ───────────────────────── */

function MnConfiguracion(props) {
  var R = React;
  var s1 = R.useState(false), enviando = s1[0], setEnviando = s1[1];
  var s2 = R.useState(''), error = s2[0], setError = s2[1];
  var activo = props.activo;

  function cambiar(nuevo) {
    if (!nuevo && !window.confirm('¿Desactivar el monedero de este colegio?\n\nSe detienen las recargas y las ventas de la tiendita. Los saldos NO se pierden y las familias siguen viendo su dinero; podrás activarlo otra vez cuando quieras.')) return;
    setEnviando(true); setError('');
    mnApi('monedero_activar', { activo: nuevo ? 1 : 0 })
      .then(function (r) { props.onCambio(!!r.monedero_activo); })
      .catch(function (e) { setError(e.message); })
      .then(function () { setEnviando(false); });
  }

  return _hMn('div', { className: 'card', style: { maxWidth: 720 } },
    _hMn('div', { className: 'card-header' }, _hMn('div', { className: 'card-title' }, 'Monedero virtual del alumno')),
    _hMn('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 } },
      _hMn('span', { style: { fontWeight: 700, fontSize: 15, color: activo ? 'var(--green)' : 'var(--ink-3)' } }, activo ? 'Activado' : 'Desactivado')),
    _hMn('div', { style: { fontSize: 13.5, color: 'var(--ink-2, var(--ink))', lineHeight: 1.6 } },
      _hMn('p', { style: { marginTop: 0 } }, 'El monedero es un saldo prepagado por alumno para comprar en la tiendita o cafetería del colegio. La familia lo recarga (tarjeta o efectivo en tienda) o tú lo recargas en caja; el vendedor cobra con él y puede pedir un NIP al alumno.'),
      _hMn('p', {}, _hMn('strong', {}, 'Qué implica activarlo:')),
      _hMn('ul', { style: { paddingLeft: 20, margin: '0 0 10px' } },
        _hMn('li', {}, 'Las familias ven una sección “Monedero” y pueden recargar. Esas recargas NO son adeudo ni colegiatura.'),
        _hMn('li', {}, 'El dinero recargado es de las familias: el colegio lo custodia hasta que se gaste o se devuelva (reporte “Saldos y reporte”). No es ingreso hasta que se consume.'),
        _hMn('li', {}, 'Las recargas en caja aparecen en tu corte de caja como cobros de efectivo o tarjeta.'),
        _hMn('li', {}, 'Necesitas dar de alta al vendedor en Mi equipo con el rol “Tiendita (vendedor)” y cargar los productos.')),
      _hMn('p', {}, 'Al desactivarlo se detienen recargas y ventas, pero nadie pierde su saldo: las familias lo siguen viendo y tú puedes cancelar ventas y hacer ajustes.')),
    _hMn(EscError, { msg: error }),
    _hMn('div', { style: { marginTop: 16 } },
      activo
        ? _hMn('button', { className: 'btn btn-secondary', disabled: enviando, onClick: function () { cambiar(false); } }, enviando ? 'Guardando…' : 'Desactivar monedero')
        : _hMn('button', { className: 'btn btn-primary', disabled: enviando, onClick: function () { cambiar(true); } }, enviando ? 'Guardando…' : 'Activar monedero'))
  );
}

/* ───────────────────────── Vista principal ───────────────────────── */

// props: user, escuela (con monedero_activo), onCambioActivo(bool)
function Monedero(props) {
  var R = React;
  var user = props.user || {};
  var esAdmin = user.rol === 'admin';
  var activo = !!(props.escuela && Number(props.escuela.monedero_activo));
  var s1 = R.useState(activo ? 'recarga' : (esAdmin ? 'config' : 'recarga')), tab = s1[0], setTab = s1[1];

  if (!esAdmin) {
    return !activo
      ? _hMn('div', { className: 'card', style: { maxWidth: 640, color: 'var(--ink-3)' } }, 'El monedero no está activado para este colegio. Pídele al administrador que lo active en Monedero > Configuración.')
      : _hMn(MnRecargaCaja, {});
  }

  var tabs = [
    { id: 'recarga', label: 'Recarga en caja' }, { id: 'saldos', label: 'Saldos y reporte' },
    { id: 'productos', label: 'Productos de la tiendita' }, { id: 'ajustes', label: 'Ajustes' }, { id: 'config', label: 'Configuración' }
  ];
  var cuerpo;
  // Apagado: solo Configuración (los saldos y ajustes siguen siendo legibles
  // desde el reporte, pero no se ofrece recargar ni armar la tiendita).
  if (tab === 'config') cuerpo = _hMn(MnConfiguracion, { activo: activo, onCambio: function (v) { if (props.onCambioActivo) props.onCambioActivo(v); if (v) setTab('recarga'); } });
  else if (tab === 'saldos') cuerpo = _hMn(MnReporte, {});
  else if (tab === 'ajustes') cuerpo = _hMn(MnAjustes, {});
  else if (!activo) cuerpo = _hMn('div', { className: 'card', style: { maxWidth: 640, color: 'var(--ink-3)' } }, 'El monedero está desactivado. Actívalo en la pestaña Configuración para recargar y vender.');
  else if (tab === 'productos') cuerpo = _hMn(MnProductos, {});
  else cuerpo = _hMn(MnRecargaCaja, {});

  return _hMn('div', {},
    _hMn(EscTabs, { tabs: tabs, valor: tab, onCambio: setTab }),
    cuerpo);
}
