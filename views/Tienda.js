// views/Tienda.js — Punto de venta de la tiendita/cafetería (F6, 18-nov-2026)
//
// Lo usa el rol 'tienda' (pantalla completa, sin menú de cobranza: su allowlist
// en api.php solo le deja las acciones tienda_*) y el admin dentro de su menú
// ("Tiendita", prop `embebido`).
//
//   Vender         → busca al alumno (matrícula o nombre), arma la compra con los
//                    botones del catálogo o un monto libre, NIP si el monedero lo
//                    tiene, Cobrar.
//   Ventas de hoy  → las ventas del día con su corte y el botón Cancelar.
//
// DINERO: el navegador solo manda producto_id y cantidad; los precios, el saldo,
// el límite diario y el NIP los decide el servidor (acciones/tienda_vender.php).
// Cada intento de cobro lleva su idem_key y se REUTILIZA si el usuario reintenta
// tras un error de red (mnLlaveDe en views/Monedero.js, que se carga antes), así
// un doble clic o un reintento nunca cobra dos veces.
//
// Reusa los globales de views/Monedero.js (mnApi, mnFmt, mnLlaveDe, MnAvatar,
// MnBuscarAlumno) y de views/ControlEscolar.js (EscModal, EscError, EscOk, EscTabs).

var _hTd = React.createElement;

/* ───────────────────────── Vender ───────────────────────── */

function TdVender(props) {
  var R = React;
  var s1 = R.useState(null), alumno = s1[0], setAlumno = s1[1];
  var s2 = R.useState(null), productos = s2[0], setProductos = s2[1];
  var s3 = R.useState({}), carrito = s3[0], setCarrito = s3[1];     // { producto_id: cantidad }
  var s4 = R.useState(''), libre = s4[0], setLibre = s4[1];
  var s5 = R.useState(''), conceptoLibre = s5[0], setConceptoLibre = s5[1];
  var s6 = R.useState(''), nip = s6[0], setNip = s6[1];
  var s7 = R.useState(false), enviando = s7[0], setEnviando = s7[1];
  var s8 = R.useState(''), error = s8[0], setError = s8[1];
  var s9 = R.useState(''), ok = s9[0], setOk = s9[1];
  var s10 = R.useState(true), activo = s10[0], setActivo = s10[1];
  var llaveRef = R.useRef(null);

  R.useEffect(function () {
    mnApi('tienda_productos_listar', {}).then(function (r) { setProductos(r.productos || []); })
      .catch(function (e) { setProductos([]); setError(e.message); });
  }, []);

  // Al elegir alumno se guarda su ficha y se sabe si el módulo está activo.
  function elegir(a) {
    setAlumno(a); setCarrito({}); setLibre(''); setConceptoLibre(''); setNip(''); setError(''); setOk('');
    llaveRef.current = null;
  }
  // Releer al alumno (saldo y disponible hoy al día) tras una venta o un error.
  function refrescar(a) {
    if (!a) return;
    mnApi('tienda_buscar_alumno', { q: a.matricula || a.nombre }).then(function (r) {
      setActivo(r.monedero_activo !== false);
      var nuevo = (r.alumnos || []).filter(function (x) { return x.id === a.id; })[0];
      if (nuevo) setAlumno(nuevo);
    }).catch(function () { /* el saldo mostrado puede quedar viejo; el servidor valida igual */ });
  }

  var lineas = (productos || []).filter(function (p) { return carrito[p.id] > 0; });
  var libreNum = Number(libre);
  var libreValido = libre !== '' && isFinite(libreNum) && libreNum > 0;
  var totalC = 0;
  lineas.forEach(function (p) { totalC += Math.round(p.precio * 100) * carrito[p.id]; });
  if (libreValido) totalC += Math.round(libreNum * 100);
  var total = totalC / 100;

  function sumar(p, d) {
    var n = Math.max(0, Math.min(50, (carrito[p.id] || 0) + d));
    var c = Object.assign({}, carrito); if (n === 0) delete c[p.id]; else c[p.id] = n;
    setCarrito(c); setError(''); setOk('');
  }

  // Avisos locales (el servidor decide de verdad, esto solo ahorra una vuelta).
  var aviso = '';
  if (alumno) {
    if (alumno.bloqueado) aviso = 'El monedero está bloqueado por la familia.';
    else if (total > 0 && total > alumno.saldo + 0.001) aviso = 'Saldo insuficiente: tiene ' + mnFmt(alumno.saldo) + '.';
    else if (total > 0 && alumno.limite_diario !== null && total > alumno.disponible_hoy + 0.001) aviso = 'Supera lo que puede gastar hoy (' + mnFmt(alumno.disponible_hoy) + ').';
  }
  var nipFalta = alumno && alumno.requiere_nip && !/^[0-9]{4}$/.test(nip);
  var puedeCobrar = alumno && total > 0 && !enviando && activo && !alumno.bloqueado && !nipFalta;

  function cobrar() {
    if (!puedeCobrar) return;
    setEnviando(true); setError(''); setOk('');
    var items = lineas.map(function (p) { return { producto_id: p.id, cantidad: carrito[p.id] }; });
    // Misma llave mientras el contenido del cobro sea el mismo: un reintento tras un
    // error de red no duplica la venta. Cambiar algo del carrito genera otra llave.
    var firma = [alumno.id, JSON.stringify(items), libreValido ? libreNum : 0, conceptoLibre].join('|');
    var llave = mnLlaveDe(llaveRef, firma);
    var cuerpo = { cliente_id: alumno.id, items: items, idem_key: llave };
    if (libreValido) { cuerpo.monto_libre = libreNum; cuerpo.concepto_libre = conceptoLibre; }
    if (alumno.requiere_nip) cuerpo.nip = nip;
    mnApi('tienda_vender', cuerpo).then(function (r) {
      setOk((r.duplicado ? 'Esa venta ya estaba cobrada. ' : 'Venta cobrada. ') + alumno.nombre + ' · ' + mnFmt(r.venta.total) + ' · le quedan ' + mnFmt(r.saldo_despues) + '.');
      setAlumno(null); setCarrito({}); setLibre(''); setConceptoLibre(''); setNip('');
      llaveRef.current = null;
      if (props.onVenta) props.onVenta();
    }).catch(function (e) {
      setError(e.message); setNip('');
      refrescar(alumno);
    }).then(function () { setEnviando(false); });
  }

  return _hTd('div', {},
    _hTd(EscOk, { msg: ok }),
    !activo ? _hTd(EscError, { msg: 'El monedero no está activado para este colegio. No se puede cobrar.' }) : null,
    !alumno
      ? _hTd('div', { className: 'card', style: { marginTop: ok ? 12 : 0 } },
          _hTd('div', { className: 'card-header' }, _hTd('div', { className: 'card-title' }, '¿Quién compra?')),
          _hTd(MnBuscarAlumno, { onElegir: function (a) { elegir(a); refrescar(a); }, autoFocus: true, grande: true, placeholder: 'Matrícula o nombre del alumno…' }))
      : _hTd('div', { style: { display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' } },
          // Columna izquierda: alumno + catálogo
          _hTd('div', {},
            _hTd('div', { className: 'card', style: { marginBottom: 16 } },
              _hTd('div', { style: { display: 'flex', alignItems: 'center', gap: 14 } },
                _hTd(MnAvatar, { foto: alumno.foto_url, nombre: alumno.nombre, tam: 64 }),
                _hTd('div', { style: { flex: 1, minWidth: 0 } },
                  _hTd('div', { style: { fontWeight: 800, fontSize: 17 } }, alumno.nombre),
                  _hTd('div', { style: { fontSize: 12.5, color: 'var(--ink-3)' } }, [alumno.matricula ? 'Matrícula ' + alumno.matricula : null, alumno.grado || null].filter(Boolean).join(' · '))),
                _hTd('button', { className: 'btn btn-ghost btn-sm', onClick: function () { elegir(null); } }, 'Cambiar')),
              _hTd('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 } },
                _hTd(EscStat, { label: 'Saldo', valor: mnFmt(alumno.saldo), color: alumno.saldo <= 0 ? 'var(--red)' : undefined }),
                _hTd(EscStat, { label: alumno.limite_diario !== null ? 'Disponible hoy (límite ' + mnFmt(alumno.limite_diario) + ')' : 'Disponible hoy', valor: mnFmt(alumno.disponible_hoy) })),
              alumno.bloqueado ? _hTd(EscError, { msg: 'Monedero bloqueado por la familia. No se puede cobrar.' }) : null),
            _hTd('div', { className: 'card' },
              _hTd('div', { className: 'card-header' }, _hTd('div', { className: 'card-title' }, 'Productos')),
              productos === null ? _hTd('div', { style: { color: 'var(--ink-3)', fontSize: 13 } }, 'Cargando…')
              : productos.length === 0 ? _hTd('div', { style: { color: 'var(--ink-3)', fontSize: 13 } }, 'Todavía no hay productos cargados. Usa el monto libre o pide al administrador que los agregue.')
              : _hTd('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 } },
                  productos.map(function (p) {
                    return _hTd('button', {
                      key: p.id, type: 'button', onClick: function () { sumar(p, 1); },
                      style: { padding: '16px 8px', minHeight: 76, borderRadius: 14, border: '1px solid var(--border-glow)', background: carrito[p.id] ? 'var(--green-glow)' : 'var(--bg-surface)', color: 'var(--ink)', cursor: 'pointer', textAlign: 'center' }
                    },
                      _hTd('div', { style: { fontWeight: 700, fontSize: 14 } }, p.nombre),
                      _hTd('div', { style: { fontSize: 13, color: 'var(--ink-3)', marginTop: 2 } }, mnFmt(p.precio)),
                      carrito[p.id] ? _hTd('div', { style: { fontSize: 12, fontWeight: 700, marginTop: 2 } }, '× ' + carrito[p.id]) : null);
                  })))),
          // Columna derecha: cuenta
          _hTd('div', { className: 'card' },
            _hTd('div', { className: 'card-header' }, _hTd('div', { className: 'card-title' }, 'Cuenta')),
            lineas.length === 0 && !libreValido ? _hTd('div', { style: { color: 'var(--ink-3)', fontSize: 13, marginBottom: 12 } }, 'Toca un producto o escribe un monto libre.') : null,
            lineas.map(function (p) {
              return _hTd('div', { key: p.id, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border-glow)' } },
                _hTd('div', { style: { flex: 1, fontSize: 14 } }, p.nombre),
                _hTd('button', { className: 'btn btn-ghost btn-sm', onClick: function () { sumar(p, -1); }, 'aria-label': 'Quitar uno' }, '−'),
                _hTd('div', { style: { minWidth: 22, textAlign: 'center', fontWeight: 700 } }, carrito[p.id]),
                _hTd('button', { className: 'btn btn-ghost btn-sm', onClick: function () { sumar(p, 1); }, 'aria-label': 'Agregar uno' }, '+'),
                _hTd('div', { style: { minWidth: 70, textAlign: 'right', fontWeight: 600 } }, mnFmt(p.precio * carrito[p.id])));
            }),
            _hTd('div', { style: { display: 'flex', gap: 8, margin: '14px 0 4px' } },
              _hTd('input', { className: 'form-input', type: 'number', inputMode: 'decimal', min: 0, step: '0.5', placeholder: 'Monto libre $', value: libre, style: { flex: '1 1 110px' }, onChange: function (e) { setLibre(e.target.value); setError(''); setOk(''); } }),
              _hTd('input', { className: 'form-input', placeholder: 'Concepto (opcional)', maxLength: 80, value: conceptoLibre, style: { flex: '2 1 150px' }, onChange: function (e) { setConceptoLibre(e.target.value); } })),
            _hTd('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '16px 0 8px' } },
              _hTd('div', { style: { fontSize: 14, color: 'var(--ink-3)' } }, 'Total'),
              _hTd('div', { style: { fontSize: 28, fontWeight: 800 } }, mnFmt(total))),
            alumno.requiere_nip ? _hTd('div', { className: 'form-group' },
              _hTd('label', { className: 'form-label' }, 'NIP del alumno (4 números)'),
              _hTd('input', { className: 'form-input', type: 'password', inputMode: 'numeric', autoComplete: 'off', maxLength: 4, value: nip, style: { fontSize: 22, letterSpacing: 8, textAlign: 'center' }, onChange: function (e) { setNip(e.target.value.replace(/[^0-9]/g, '').slice(0, 4)); } })) : null,
            aviso ? _hTd('div', { style: { fontSize: 12.5, color: 'var(--amber)', marginBottom: 8 } }, aviso) : null,
            _hTd(EscError, { msg: error }),
            _hTd('button', { className: 'btn btn-primary', style: { width: '100%', marginTop: 12, padding: '14px', fontSize: 17 }, disabled: !puedeCobrar, onClick: cobrar },
              enviando ? 'Cobrando…' : 'Cobrar ' + mnFmt(total))))
  );
}

/* ───────────────────────── Ventas de hoy ───────────────────────── */

function TdVentas(props) {
  var R = React;
  var esAdmin = props.admin;
  var s1 = R.useState(mnHoy()), fecha = s1[0], setFecha = s1[1];
  var s2 = R.useState(null), datos = s2[0], setDatos = s2[1];
  var s3 = R.useState(''), error = s3[0], setError = s3[1];
  var s4 = R.useState(null), cancelando = s4[0], setCancelando = s4[1];
  var s5 = R.useState(''), motivo = s5[0], setMotivo = s5[1];
  var s6 = R.useState(false), enviando = s6[0], setEnviando = s6[1];
  var s7 = R.useState(''), ok = s7[0], setOk = s7[1];

  function cargar() {
    setError('');
    mnApi('tienda_ventas_dia', esAdmin ? { fecha: fecha } : {}).then(setDatos).catch(function (e) { setError(e.message); });
  }
  R.useEffect(cargar, [fecha, props.version]);

  function confirmarCancelar() {
    if (!cancelando || enviando) return;
    setEnviando(true); setError('');
    mnApi('tienda_cancelar_venta', { venta_id: cancelando.id, motivo: motivo.trim() })
      .then(function (r) {
        setOk('Venta #' + cancelando.id + ' cancelada. Se devolvieron ' + mnFmt(cancelando.total) + ' a ' + cancelando.alumno + '.');
        setCancelando(null); setMotivo(''); cargar();
      })
      .catch(function (e) { setError(e.message); setCancelando(null); })
      .then(function () { setEnviando(false); });
  }

  var c = datos && datos.corte;
  return _hTd('div', {},
    _hTd('div', { style: { display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 } },
      esAdmin ? _hTd('div', { className: 'form-group', style: { margin: 0 } },
        _hTd('label', { className: 'form-label' }, 'Día'),
        _hTd('input', { className: 'form-input', type: 'date', value: fecha, max: mnHoy(), onChange: function (e) { if (e.target.value) setFecha(e.target.value); } })) : null,
      _hTd('button', { className: 'btn btn-ghost', onClick: cargar }, 'Actualizar')),
    _hTd(EscOk, { msg: ok }),
    _hTd(EscError, { msg: error }),
    c ? _hTd('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', margin: '12px 0 16px' } },
      _hTd(EscStat, { label: 'Vendido (' + c.completadas.n + ' ventas)', valor: mnFmt(c.completadas.total) }),
      _hTd(EscStat, { label: 'Canceladas (' + c.canceladas.n + ')', valor: mnFmt(c.canceladas.total), color: c.canceladas.n ? 'var(--amber)' : undefined })) : null,
    !datos ? _hTd('div', { style: { color: 'var(--ink-3)', fontSize: 13 } }, 'Cargando…')
    : datos.ventas.length === 0 ? _hTd('div', { className: 'card', style: { color: 'var(--ink-3)', fontSize: 13 } }, 'No hay ventas ese día.')
    : _hTd('div', { className: 'card' }, _hTd('div', { className: 'table-wrap' }, _hTd('table', {},
        _hTd('thead', {}, _hTd('tr', {}, _hTd('th', {}, 'Hora'), _hTd('th', {}, 'Alumno'), _hTd('th', {}, 'Compra'), esAdmin ? _hTd('th', {}, 'Vendedor') : null, _hTd('th', { style: { textAlign: 'right' } }, 'Total'), _hTd('th', {}, ''))),
        _hTd('tbody', {}, datos.ventas.map(function (v) {
          var cancelada = v.estado !== 'completada';
          return _hTd('tr', { key: v.id, style: cancelada ? { opacity: 0.55, textDecoration: 'line-through' } : undefined },
            _hTd('td', {}, String(v.creado_en).slice(11, 16)),
            _hTd('td', {}, v.alumno),
            _hTd('td', { style: { fontSize: 12.5 } }, v.items.map(function (i) { return (i.cantidad > 1 ? i.cantidad + '× ' : '') + i.nombre; }).join(', ')),
            esAdmin ? _hTd('td', {}, v.vendedor || '—') : null,
            _hTd('td', { style: { textAlign: 'right', fontWeight: 700 } }, mnFmt(v.total)),
            _hTd('td', { style: { textAlign: 'right' } }, cancelada ? _hTd('span', { style: { fontSize: 11, color: 'var(--amber)' } }, 'Cancelada')
              : v.puede_cancelar ? _hTd('button', { className: 'btn btn-ghost btn-sm', onClick: function () { setCancelando(v); setMotivo(''); setError(''); setOk(''); } }, 'Cancelar') : null));
        })))))
    ,
    cancelando ? _hTd(EscModal, {
      titulo: 'Cancelar venta #' + cancelando.id, ancho: 440, onCerrar: function () { if (!enviando) setCancelando(null); },
      footer: _hTd('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
        _hTd('button', { className: 'btn btn-ghost', disabled: enviando, onClick: function () { setCancelando(null); } }, 'No cancelar'),
        _hTd('button', { className: 'btn btn-primary', disabled: enviando, onClick: confirmarCancelar }, enviando ? 'Cancelando…' : 'Sí, devolver ' + mnFmt(cancelando.total)))
    },
      _hTd('div', { style: { fontSize: 14, marginBottom: 12 } }, 'Se devolverán ' + mnFmt(cancelando.total) + ' al monedero de ' + cancelando.alumno + '.'),
      _hTd('div', { className: 'form-group' },
        _hTd('label', { className: 'form-label' }, 'Motivo (opcional)'),
        _hTd('input', { className: 'form-input', maxLength: 120, value: motivo, onChange: function (e) { setMotivo(e.target.value); } }))) : null
  );
}

/* ───────────────────────── Vista principal ───────────────────────── */

// props: user, onLogout, menuPerfil (rol tienda, pantalla completa) o embebido (admin).
function Tienda(props) {
  var R = React;
  var s1 = R.useState('vender'), tab = s1[0], setTab = s1[1];
  var s2 = R.useState(0), version = s2[0], setVersion = s2[1];
  var user = props.user || {};
  var esAdmin = user.rol === 'admin';
  var tabs = [{ id: 'vender', label: 'Vender' }, { id: 'ventas', label: 'Ventas de hoy' }];
  var cuerpo = tab === 'vender'
    ? _hTd(TdVender, { onVenta: function () { setVersion(version + 1); } })
    : _hTd(TdVentas, { admin: esAdmin, version: version });

  if (props.embebido) {
    return _hTd('div', {}, _hTd(EscTabs, { tabs: tabs, valor: tab, onCambio: setTab }), cuerpo);
  }
  return _hTd('div', { style: { height: '100vh', maxHeight: '100dvh', overflowY: 'auto', overflowX: 'hidden', background: 'var(--bg-main)' } },
    _hTd('div', {
      style: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 20px', borderBottom: '1px solid var(--border-glow)', background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 50 }
    },
      _hTd('div', { style: { fontWeight: 800, fontSize: 16, color: 'var(--ink)', marginRight: 8 } }, 'Tiendita'),
      _hTd('div', { className: 'pill-group', style: { flex: '1 1 auto' } },
        tabs.map(function (t) {
          return _hTd('button', { key: t.id, className: 'pill' + (tab === t.id ? ' active' : ''), onClick: function () { setTab(t.id); } }, t.label);
        })),
      _hTd('div', { style: { marginLeft: 'auto', flexShrink: 0 } },
        props.menuPerfil || _hTd('button', { className: 'btn btn-ghost btn-sm', onClick: props.onLogout }, 'Cerrar sesión'))),
    _hTd('div', { style: { padding: 20, maxWidth: 1100, margin: '0 auto' } }, cuerpo));
}
