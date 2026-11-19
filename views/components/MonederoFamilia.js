// views/components/MonederoFamilia.js — Sección "Monedero" del portal de familia (F6)
//
// Se monta desde views/PortalFamilia.js (pestaña Monedero), una vez por hijo
// seleccionado. Muestra saldo, lo que puede gastar hoy y sus movimientos; deja
// recargar (tarjeta o efectivo en tienda, NUNCA SPEI), reabrir una recarga
// pendiente, y configurar límite diario, NIP y bloqueo.
//
// El pago de la recarga reutiliza lo que el portal ya hace para un cobro
// normal: CobroController.iniciarTC (generar_liga) y iniciarEfectivoRef
// (generar_referencia_efectivo) + el formato imprimible de Comprobantes.js. La
// recarga es un cobro con es_recarga_monedero = 1; el saldo sube cuando el pago
// queda confirmado (los webhooks lo marcan pagado y el servidor lo acredita al
// consultar el saldo o en el cron), no al volver del banco.
//
// Usa los globales de views/Monedero.js (mnApi, mnFmt, mnFechaHora, mnLlave...)
// y de views/ControlEscolar.js (EscError, EscOk, EscStat), que se cargan antes.

var _hMf = React.createElement;

// ¿Algún hijo tiene monedero que mostrar aunque el colegio lo haya apagado?
// monedero_saldo responde sin `saldo` cuando está apagado y el hijo no tiene
// saldo ni movimientos. Lo usa PortalFamilia para decidir si pinta la pestaña.
function mfHayMonedero(hijos) {
  return Promise.all((hijos || []).map(function (h) {
    return ApiClient.post('monedero_saldo', { cliente_id: h.id })
      .then(function (r) { return !!(r && r.success && r.saldo !== undefined); })
      .catch(function () { return false; });
  })).then(function (a) { return a.some(Boolean); });
}

function MfCard(props) {
  return _hMf('div', { style: Object.assign({ background: 'var(--bg-surface)', border: '1px solid var(--border-glow)', borderRadius: 14, padding: '18px 18px', marginBottom: 16 }, props.style || {}) },
    props.titulo ? _hMf('div', { style: { fontWeight: 700, fontSize: 14, color: 'var(--ink)', marginBottom: 12 } }, props.titulo) : null,
    props.children);
}

// props: hijos (alumnos de la familia), escuela, familia
function MonederoFamilia(props) {
  var R = React;
  var hijos = props.hijos || [];
  var s1 = R.useState(hijos.length ? hijos[0].id : null), hijoId = s1[0], setHijoId = s1[1];
  var hijo = hijos.filter(function (h) { return h.id === hijoId; })[0] || hijos[0] || null;

  var s2 = R.useState(null), est = s2[0], setEst = s2[1];          // respuesta de monedero_saldo
  var s3 = R.useState(null), movs = s3[0], setMovs = s3[1];
  var s4 = R.useState(''), error = s4[0], setError = s4[1];
  var s5 = R.useState(''), ok = s5[0], setOk = s5[1];
  var s6 = R.useState(''), monto = s6[0], setMonto = s6[1];
  var s7 = R.useState('TC'), metodo = s7[0], setMetodo = s7[1];
  var s8 = R.useState(false), ocupado = s8[0], setOcupado = s8[1];
  var s9 = R.useState(''), limite = s9[0], setLimite = s9[1];
  var s10 = R.useState(''), nip = s10[0], setNip = s10[1];

  function cargar() {
    if (!hijo) return;
    mnApi('monedero_saldo', { cliente_id: hijo.id }).then(function (r) {
      setEst(r);
      setLimite(r.limite_diario === null || r.limite_diario === undefined ? '' : String(r.limite_diario));
    }).catch(function (e) { setError(e.message); });
    mnApi('monedero_movimientos', { cliente_id: hijo.id, limite: 30 }).then(function (r) { setMovs(r.movimientos || []); })
      .catch(function () { setMovs([]); });
  }
  R.useEffect(function () { setEst(null); setMovs(null); setError(''); setOk(''); setNip(''); setMonto(''); cargar(); }, [hijo && hijo.id]);

  // Abre la liga de tarjeta o el formato de efectivo de una recarga ya creada.
  function pagar(cobro) {
    setOcupado(true); setError('');
    var p;
    if (cobro.metodo === 'TC') {
      p = CobroController.iniciarTC({ folio: cobro.folio, total: cobro.total, _cliente_id: hijo.id }).then(function (liga) {
        if (liga.demo) { alert(liga.mensaje || 'Esta cuenta está en modo de prueba: no se genera una liga de pago real.'); return; }
        window.location.href = liga.url;
      });
    } else {
      p = CobroController.iniciarEfectivoRef({ folio: cobro.folio, total: cobro.total }).then(function (ref) {
        if (ref.demo) { alert(ref.mensaje || 'Esta cuenta está en modo de prueba: no se genera una referencia real.'); return; }
        abrirComprobanteEfectivoModulo({
          cobro: {
            folio: cobro.folio, total: ref.total != null ? Number(ref.total) : cobro.total,
            descripcion: 'Recarga de monedero de ' + hijo.nombre,
            referencia: ref.referencia, barcode_url: ref.barcode_url, vencimiento: ref.vencimiento
          },
          cliente: { nombre: hijo.nombre }, familia: props.familia, escuela: props.escuela
        });
      });
    }
    return p.catch(function (e) { setError(e.message); }).then(function () { setOcupado(false); cargar(); });
  }

  function recargar() {
    var m = Number(monto);
    if (!isFinite(m) || m < 50 || m > 5000) { setError('El monto de la recarga debe estar entre $50 y $5,000.'); return; }
    setOcupado(true); setError(''); setOk('');
    mnApi('monedero_recargar', { cliente_id: hijo.id, monto: m, metodo: metodo }).then(function (r) {
      setMonto('');
      // Sigue directo al pago; si algo falla, la recarga queda en "pendientes" para reintentar.
      return pagar(r.cobro);
    }).catch(function (e) { setError(e.message); setOcupado(false); });
  }

  function guardarConfig(cambios, mensaje) {
    setOcupado(true); setError(''); setOk('');
    mnApi('monedero_config_guardar', Object.assign({ cliente_id: hijo.id }, cambios))
      .then(function () { setOk(mensaje); setNip(''); cargar(); })
      .catch(function (e) { setError(e.message); })
      .then(function () { setOcupado(false); });
  }

  if (!hijo) return _hMf(MfCard, {}, 'No hay alumnos ligados a tu cuenta.');

  var activo = est && est.habilitado !== false;
  var puedeRecargar = est && activo && est.saldo !== undefined;
  var pendientes = (est && est.recargas_pendientes) || [];

  return _hMf('div', {},
    hijos.length > 1 ? _hMf('div', { className: 'pill-group', style: { marginBottom: 16 } },
      hijos.map(function (h) {
        return _hMf('button', { key: h.id, className: 'pill' + (hijo.id === h.id ? ' active' : ''), onClick: function () { setHijoId(h.id); } }, h.nombre);
      })) : null,
    _hMf(EscOk, { msg: ok }),
    _hMf(EscError, { msg: error }),
    !est ? _hMf(MfCard, { style: { marginTop: 12, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 } }, 'Cargando el monedero…')
    : est.saldo === undefined ? _hMf(MfCard, { style: { marginTop: 12, color: 'var(--ink-3)', fontSize: 13 } }, 'El monedero de la tiendita no está activado en tu colegio.')
    : _hMf('div', { style: { marginTop: 12 } },
        !activo ? _hMf(MfCard, { style: { color: 'var(--ink-3)', fontSize: 13 } }, 'El colegio tiene el monedero desactivado por ahora: no se pueden hacer recargas ni compras, pero tu saldo está a salvo.') : null,
        _hMf(MfCard, { titulo: 'Monedero de ' + hijo.nombre },
          _hMf('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap' } },
            _hMf(EscStat, { label: 'Saldo', valor: mnFmt(est.saldo) }),
            _hMf(EscStat, { label: est.limite_diario !== null ? 'Puede gastar hoy (límite ' + mnFmt(est.limite_diario) + ')' : 'Gastado hoy', valor: est.limite_diario !== null ? mnFmt(est.disponible_hoy) : mnFmt(est.consumido_hoy) })),
          est.bloqueado ? _hMf('div', { style: { marginTop: 10, fontSize: 12.5, color: 'var(--red)' } }, 'El monedero está bloqueado: no se puede comprar con él.') : null,
          _hMf('div', { style: { marginTop: 12 } }, _hMf('button', { className: 'btn btn-ghost btn-sm', disabled: ocupado, onClick: cargar }, 'Actualizar'))),

        puedeRecargar ? _hMf(MfCard, { titulo: 'Recargar' },
          _hMf('div', { style: { fontSize: 12.5, color: 'var(--ink-3)', marginBottom: 10 } },
            'De $50 a $5,000. El saldo se acredita en cuanto se confirma el pago. Esta recarga no es un adeudo.'),
          _hMf('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 } },
            [50, 100, 200, 500].map(function (v) {
              return _hMf('button', { key: v, type: 'button', className: 'pill' + (Number(monto) === v ? ' active' : ''), onClick: function () { setMonto(String(v)); } }, '$' + v);
            })),
          _hMf('input', { className: 'form-input', type: 'number', inputMode: 'decimal', min: 50, max: 5000, step: '1', placeholder: 'Otro monto', value: monto, onChange: function (e) { setMonto(e.target.value); }, style: { maxWidth: 200, marginBottom: 10 } }),
          _hMf('div', { className: 'pill-group', style: { marginBottom: 12 } },
            [{ id: 'TC', label: 'Tarjeta' }, { id: 'EfectivoRef', label: 'Efectivo en tienda' }].map(function (m) {
              return _hMf('button', { key: m.id, type: 'button', className: 'pill' + (metodo === m.id ? ' active' : ''), onClick: function () { setMetodo(m.id); } }, m.label);
            })),
          _hMf('div', {}, _hMf('button', { className: 'btn btn-primary', disabled: ocupado || !monto, onClick: recargar }, ocupado ? 'Un momento…' : (metodo === 'TC' ? 'Pagar con tarjeta' : 'Generar referencia de pago')))) : null,

        pendientes.length ? _hMf(MfCard, { titulo: 'Recargas esperando pago' },
          pendientes.map(function (p) {
            return _hMf('div', { key: p.id, style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0', borderBottom: '1px solid var(--border-glow)' } },
              _hMf('div', { style: { flex: 1, minWidth: 160 } },
                _hMf('div', { style: { fontWeight: 600, fontSize: 14 } }, mnFmt(p.total) + ' · ' + (p.metodo === 'TC' ? 'Tarjeta' : 'Efectivo en tienda')),
                _hMf('div', { style: { fontSize: 12, color: 'var(--ink-3)' } }, 'Folio ' + p.folio + ' · recarga pendiente de pago')),
              _hMf('button', { className: 'btn btn-secondary btn-sm', disabled: ocupado, onClick: function () { pagar(p); } }, p.metodo === 'TC' ? 'Pagar con tarjeta' : 'Ver referencia de pago'));
          }),
          _hMf('div', { style: { fontSize: 12, color: 'var(--ink-4)', marginTop: 8 } }, 'Si no se paga, se cancelan solas a los 3 días. Si ya pagaste, toca Actualizar en unos minutos.')) : null,

        _hMf(MfCard, { titulo: 'Límite, NIP y bloqueo' },
          _hMf('div', { className: 'form-group' },
            _hMf('label', { className: 'form-label' }, 'Límite de gasto por día (vacío = sin límite)'),
            _hMf('div', { style: { display: 'flex', gap: 8 } },
              _hMf('input', { className: 'form-input', type: 'number', inputMode: 'decimal', min: 0, step: '1', value: limite, onChange: function (e) { setLimite(e.target.value); }, style: { maxWidth: 160 } }),
              _hMf('button', { className: 'btn btn-secondary btn-sm', disabled: ocupado || !activo, onClick: function () { guardarConfig({ limite_diario: limite === '' ? null : Number(limite) }, 'Límite diario guardado.'); } }, 'Guardar límite'))),
          _hMf('div', { className: 'form-group' },
            _hMf('label', { className: 'form-label' }, est.tiene_nip ? 'NIP de 4 números (ya tiene uno; escribe otro para cambiarlo)' : 'NIP de 4 números (el alumno lo escribe al comprar)'),
            _hMf('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
              _hMf('input', { className: 'form-input', type: 'password', inputMode: 'numeric', autoComplete: 'off', maxLength: 4, value: nip, onChange: function (e) { setNip(e.target.value.replace(/[^0-9]/g, '').slice(0, 4)); }, style: { maxWidth: 120, textAlign: 'center', letterSpacing: 6 } }),
              _hMf('button', { className: 'btn btn-secondary btn-sm', disabled: ocupado || !activo || nip.length !== 4, onClick: function () { guardarConfig({ nip: nip }, est.tiene_nip ? 'NIP cambiado.' : 'NIP guardado.'); } }, est.tiene_nip ? 'Cambiar NIP' : 'Poner NIP'),
              est.tiene_nip ? _hMf('button', { className: 'btn btn-ghost btn-sm', disabled: ocupado || !activo, onClick: function () { if (window.confirm('¿Quitar el NIP? Cualquiera podrá comprar con este monedero sin pedirlo.')) guardarConfig({ nip: '' }, 'NIP eliminado.'); } }, 'Quitar NIP') : null)),
          _hMf('div', {},
            _hMf('button', { className: 'btn ' + (est.bloqueado ? 'btn-primary' : 'btn-ghost') + ' btn-sm', disabled: ocupado || !activo, onClick: function () { guardarConfig({ bloqueado: est.bloqueado ? 0 : 1 }, est.bloqueado ? 'Monedero desbloqueado.' : 'Monedero bloqueado: no se podrá comprar con él.'); } },
              est.bloqueado ? 'Desbloquear monedero' : 'Bloquear monedero')),
          !activo ? _hMf('div', { style: { fontSize: 12, color: 'var(--ink-4)', marginTop: 8 } }, 'Los cambios se habilitan cuando el colegio active el monedero.') : null),

        _hMf(MfCard, { titulo: 'Movimientos' },
          movs === null ? _hMf('div', { style: { fontSize: 13, color: 'var(--ink-3)' } }, 'Cargando…')
          : movs.length === 0 ? _hMf('div', { style: { fontSize: 13, color: 'var(--ink-3)' } }, 'Todavía no hay movimientos.')
          : _hMf('div', { className: 'table-wrap' }, _hMf('table', {},
              _hMf('thead', {}, _hMf('tr', {}, _hMf('th', {}, 'Fecha'), _hMf('th', {}, 'Concepto'), _hMf('th', { style: { textAlign: 'right' } }, 'Monto'), _hMf('th', { style: { textAlign: 'right' } }, 'Saldo'))),
              _hMf('tbody', {}, movs.map(function (m) {
                return _hMf('tr', { key: m.id },
                  _hMf('td', {}, mnFechaHora(m.fecha)), _hMf('td', {}, m.concepto),
                  _hMf('td', { style: { textAlign: 'right', fontWeight: 700, color: m.monto < 0 ? 'var(--red)' : 'var(--green)' } }, mnFmt(m.monto)),
                  _hMf('td', { style: { textAlign: 'right', color: 'var(--ink-3)' } }, mnFmt(m.saldo_despues)));
              })))))
      )
  );
}
