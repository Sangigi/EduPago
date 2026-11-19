// views/components/BecasAlumno.js — [OF-3] Becas y descuentos guardados en el alumno.
//
// Contiene:
//   · Funciones de cálculo (becasCalcular y compañía): ESPEJO EXACTO de
//     lib/helpers_becas.php (becas_calcular_descuento). La usan este componente
//     (vista previa) y views/Caja.js (renglón negativo automático). Si cambia la
//     regla en PHP, hay que cambiarla aquí también. Todo en CENTAVOS ENTEROS.
//   · BecasAlumno({alumno, productos, onCerrar}): modal con la lista de becas
//     del alumno, alta, edición, baja lógica y vista previa. Solo admin y
//     superadmin (Alumnos.js decide cuándo mostrar el botón; el servidor
//     vuelve a validar rol y escuela en cada acción).
//   · BecasColegio({onCerrar, escuelaId}): modal con todas las becas activas
//     del colegio y el descuento mensual estimado.
//
// Usa ApiClient (assets/js/ApiClient.js) y fmt (views/components/Badge.js).

var _hBc = React.createElement;

// ════════════════════════════════════════════════════════════════════════
//  CÁLCULO (espejo de lib/helpers_becas.php)
// ════════════════════════════════════════════════════════════════════════

var BECAS_CAT_LABELS = {
  colegiatura: 'Colegiatura', anualidad: 'Anualidad', inscripcion: 'Inscripción',
  examen: 'Examen', uniforme: 'Uniforme', material: 'Material',
  transporte: 'Transporte', comedor: 'Comedor', extracurricular: 'Extracurricular',
  beca: 'Beca / Descuento', otro: 'Otro'
};

function becasHoyISO() {
  var d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

function becasCents(pesos) { return Math.round(parseFloat(pesos || 0) * 100); }

function becasMoneda(c) { return '$' + (c / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// "30%", "12.5%" o "$500.00"
function becasValorTexto(b) {
  var v = parseFloat(b.valor || 0);
  if (b.tipo === 'porcentaje') return String(parseFloat(v.toFixed(2))) + '%';
  return '$' + v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "Beca: Hermanos (30%)" — máx. 100 caracteres, igual que el servidor.
function becasEtiqueta(b) {
  var nombre = String(b.nombre || '').trim();
  var t = 'Beca: ' + (nombre || 'Descuento') + ' (' + becasValorTexto(b) + ')';
  return t.length > 100 ? t.slice(0, 99) + '…' : t;
}

function becasAlcanceLista(b) {
  var ids = b.alcance_ids;
  if (typeof ids === 'string') { try { ids = JSON.parse(ids); } catch (e) { ids = []; } }
  if (!Array.isArray(ids)) return [];
  if (b.alcance === 'productos') return ids.map(function (x) { return parseInt(x, 10); }).filter(function (n) { return n > 0; });
  return ids.map(function (x) { return String(x).trim().toLowerCase(); }).filter(Boolean);
}

// ¿Aplica esta beca a este concepto en esta fecha? concepto: {id, categoria}
function becasAplica(b, concepto, fecha) {
  if (!b.activo || b.activo === '0') return false;
  if (b.vigente_desde && fecha < b.vigente_desde) return false;
  if (b.vigente_hasta && fecha > b.vigente_hasta) return false;
  var ids = becasAlcanceLista(b);
  if (!ids.length) return false;
  if (b.alcance === 'productos') return parseInt(concepto.id, 10) > 0 && ids.indexOf(parseInt(concepto.id, 10)) !== -1;
  if (b.alcance === 'categorias') {
    var cat = String(concepto.categoria || '').trim().toLowerCase();
    return cat !== '' && ids.indexOf(cat) !== -1;
  }
  return false;
}

// Devuelve {precio_c, descuento_c, final_c, porcentaje_bp, detalle:[{beca_id,nombre,tipo,valor,monto_c,etiqueta}]}
// Regla: porcentajes sumados (tope 100%) sobre el precio; luego montos fijos;
// el descuento nunca supera el precio. Ver lib/helpers_becas.php.
function becasCalcular(becas, concepto, precioC, fecha) {
  var res = { precio_c: precioC, descuento_c: 0, final_c: precioC, porcentaje_bp: 0, detalle: [] };
  if (!(precioC > 0)) return res;
  var aplican = (becas || []).filter(function (b) { return becasAplica(b, concepto, fecha); })
    .sort(function (a, b) { return (a.id || 0) - (b.id || 0); });
  if (!aplican.length) return res;
  var linea = function (b, monto) {
    return { beca_id: b.id, nombre: b.nombre, tipo: b.tipo, valor: parseFloat(b.valor || 0), monto_c: monto, etiqueta: becasEtiqueta(b) };
  };
  var acumBp = 0, acumC = 0, detalle = [];
  aplican.forEach(function (b) {
    if (b.tipo !== 'porcentaje') return;
    var bp = Math.round(parseFloat(b.valor || 0) * 100);
    if (bp <= 0) return;
    var nuevoBp = Math.min(10000, acumBp + bp);
    var nuevoC = Math.floor((precioC * nuevoBp + 5000) / 10000);
    var monto = nuevoC - acumC;
    acumBp = nuevoBp; acumC = nuevoC;
    if (monto > 0) detalle.push(linea(b, monto));
  });
  res.porcentaje_bp = acumBp;
  var restante = precioC - acumC;
  aplican.forEach(function (b) {
    if (b.tipo !== 'monto') return;
    var v = becasCents(b.valor);
    if (v <= 0 || restante <= 0) return;
    var monto = Math.min(v, restante);
    restante -= monto;
    detalle.push(linea(b, monto));
  });
  var total = detalle.reduce(function (s, d) { return s + d.monto_c; }, 0);
  res.descuento_c = total; res.final_c = precioC - total; res.detalle = detalle;
  return res;
}

// Para Caja: dado el carrito SIN renglones de beca, las becas ACTIVAS del alumno
// y las que el cajero ya quitó (llaves 'becaId:conceptoId'), devuelve los
// renglones negativos que corresponden. Cada línea de concepto (precio × cantidad)
// se trata como UN concepto.
function becasLineasCaja(carritoBase, becas, quitadas, fecha) {
  var out = [];
  if (!becas || !becas.length) return out;
  (carritoBase || []).forEach(function (it) {
    var precio = parseFloat(it.precio || 0);
    if (!(precio > 0) || String(it.categoria || '') === 'beca') return;
    var qty = parseInt(it.qty || 1, 10) || 1;
    var r = becasCalcular(becas, { id: it.id, categoria: it.categoria }, becasCents(precio * qty), fecha);
    r.detalle.forEach(function (d) {
      var llave = d.beca_id + ':' + it.id;
      if (quitadas && quitadas[llave]) return;
      var nombre = d.etiqueta + ' · ' + it.nombre;
      out.push({
        id: 'beca:' + llave, esBeca: true, llave: llave, becaId: d.beca_id, conceptoId: it.id,
        nombre: nombre.length > 100 ? nombre.slice(0, 99) + '…' : nombre,
        precio: -(d.monto_c / 100), qty: 1, categoria: 'beca', emoji: ''
      });
    });
  });
  return out;
}

// ════════════════════════════════════════════════════════════════════════
//  COMPONENTES
// ════════════════════════════════════════════════════════════════════════

function BcModal(props) {
  return _hBc('div', {
    className: 'modal-backdrop',
    onClick: function (e) { if (e.target === e.currentTarget && props.onCerrar) props.onCerrar(); }
  },
    _hBc('div', { className: 'modal', style: { maxWidth: props.ancho || 640 } },
      _hBc('div', { className: 'modal-header' },
        _hBc('div', null,
          _hBc('div', { className: 'modal-title' }, props.titulo),
          props.sub ? _hBc('div', { style: { fontSize: 12, color: 'var(--ink-3)', marginTop: 2 } }, props.sub) : null),
        _hBc('button', { className: 'btn btn-ghost btn-sm', onClick: props.onCerrar, 'aria-label': 'Cerrar' },
          _hBc(Icon, { name: 'close', size: 16, color: 'currentColor' }))
      ),
      _hBc('div', { className: 'modal-body' }, props.children),
      props.footer ? _hBc('div', { className: 'modal-footer' }, props.footer) : null
    )
  );
}

function BcAviso(props) {
  if (!props.msg) return null;
  var ok = props.tipo === 'ok';
  return _hBc('div', {
    style: {
      marginTop: 10, padding: '9px 12px', fontSize: 12.5, borderRadius: 'var(--radius-sm)',
      color: ok ? 'var(--green-dark, var(--green))' : 'var(--red)',
      background: ok ? 'var(--green-glow)' : 'var(--red-glow)'
    }
  }, props.msg);
}

function becasFormVacio() {
  return { id: null, nombre: '', tipo: 'porcentaje', valor: '', alcance: 'categorias', alcance_ids: ['colegiatura'], vigente_desde: '', vigente_hasta: '', notas: '' };
}

function becasAlcanceTexto(b, productos) {
  var ids = becasAlcanceLista(b);
  if (b.alcance === 'productos') {
    return ids.map(function (id) {
      var p = (productos || []).filter(function (x) { return Number(x.id) === id; })[0];
      return p ? p.nombre : ('concepto #' + id);
    }).join(', ');
  }
  return ids.map(function (c) { return BECAS_CAT_LABELS[c] || c; }).join(', ');
}

function becasVigenciaTexto(b) {
  if (!b.vigente_desde && !b.vigente_hasta) return 'Sin fecha límite';
  return (b.vigente_desde ? 'Desde ' + b.vigente_desde : '') + (b.vigente_desde && b.vigente_hasta ? ' ' : '') + (b.vigente_hasta ? 'hasta ' + b.vigente_hasta : '');
}

// props: alumno ({id, nombre}), productos (data.productos), onCerrar
function BecasAlumno(props) {
  var R = React;
  var alumno = props.alumno;
  var productos = (props.productos || []).filter(function (p) { return p.activo !== false && p.activo !== 0 && p.activo !== '0'; });

  var s1 = R.useState(null), becas = s1[0], setBecas = s1[1];   // null = cargando
  var s2 = R.useState(null), form = s2[0], setForm = s2[1];     // null = solo lista
  var s3 = R.useState(false), ocupado = s3[0], setOcupado = s3[1];
  var s4 = R.useState(''), error = s4[0], setError = s4[1];
  var s5 = R.useState(false), faltaMigracion = s5[0], setFaltaMigracion = s5[1];

  function cargar() {
    ApiClient.post('alumno_becas_listar', { cliente_id: alumno.id }).then(function (r) {
      if (!r.success) { setError(r.error || 'No se pudieron cargar las becas.'); setBecas([]); return; }
      setBecas(r.becas || []);
      setFaltaMigracion(!!r.falta_migracion);
    }).catch(function (e) { setError(e.message); setBecas([]); });
  }
  R.useEffect(function () { cargar(); }, [alumno.id]);

  function editar(b) {
    setError('');
    setForm({
      id: b.id, nombre: b.nombre, tipo: b.tipo, valor: String(b.valor), alcance: b.alcance,
      alcance_ids: becasAlcanceLista(b), vigente_desde: b.vigente_desde || '', vigente_hasta: b.vigente_hasta || '', notas: b.notas || ''
    });
  }

  function guardar() {
    setOcupado(true); setError('');
    var cuerpo = Object.assign({}, form, { cliente_id: alumno.id });
    ApiClient.post('alumno_beca_guardar', cuerpo).then(function (r) {
      setOcupado(false);
      if (!r.success) { setError(r.error || 'No se pudo guardar la beca.'); return; }
      setForm(null);
      cargar();
    }).catch(function (e) { setOcupado(false); setError(e.message); });
  }

  function cambiarEstado(b, reactivar) {
    if (!reactivar && !window.confirm('¿Dar de baja la beca "' + b.nombre + '"? Los cobros ya generados no cambian; solo los próximos.')) return;
    setOcupado(true); setError('');
    ApiClient.post('alumno_beca_desactivar', { id: b.id, reactivar: reactivar ? 1 : 0 }).then(function (r) {
      setOcupado(false);
      if (!r.success) { setError(r.error || 'No se pudo actualizar la beca.'); return; }
      cargar();
    }).catch(function (e) { setOcupado(false); setError(e.message); });
  }

  function setCampo(k, v) { setForm(Object.assign({}, form, (function () { var o = {}; o[k] = v; return o; })())); }
  function alternarId(id) {
    var ids = form.alcance_ids.slice();
    var i = ids.indexOf(id);
    if (i === -1) ids.push(id); else ids.splice(i, 1);
    setCampo('alcance_ids', ids);
  }
  function cambiarAlcance(a) { setForm(Object.assign({}, form, { alcance: a, alcance_ids: [] })); }

  // ── Vista previa ──
  function vistaPrevia() {
    if (!form) return null;
    var valorNum = parseFloat(form.valor);
    if (!(valorNum > 0)) return null;
    var hoy = becasHoyISO();
    var esta = { id: form.id || 999999999, nombre: form.nombre, tipo: form.tipo, valor: valorNum, alcance: form.alcance, alcance_ids: form.alcance_ids, vigente_desde: null, vigente_hasta: null, activo: 1 };
    var otras = (becas || []).filter(function (b) { return b.activo && b.id !== form.id; });
    var candidatos = productos.filter(function (p) { return parseFloat(p.precio) > 0 && String(p.categoria || '') !== 'beca' && becasAplica(esta, { id: p.id, categoria: p.categoria }, hoy); });
    // Primero los recurrentes (la colegiatura es lo que más importa).
    candidatos.sort(function (a, b) { return (b.tipo === 'recurrente') - (a.tipo === 'recurrente'); });
    if (!candidatos.length) {
      return _hBc('div', { style: { fontSize: 12.5, color: 'var(--ink-3)' } }, 'Ningún concepto activo del colegio entra en este alcance todavía.');
    }
    return _hBc('div', null,
      candidatos.slice(0, 4).map(function (p) {
        var pc = becasCents(p.precio);
        var sola = becasCalcular([esta], { id: p.id, categoria: p.categoria }, pc, hoy);
        var todas = otras.length ? becasCalcular(otras.concat([esta]), { id: p.id, categoria: p.categoria }, pc, hoy) : null;
        return _hBc('div', { key: p.id, style: { fontSize: 13, padding: '3px 0' } },
          p.nombre + ' ' + becasMoneda(pc) + ' → ',
          _hBc('strong', null, becasMoneda(sola.final_c)),
          ' con esta beca',
          todas && todas.final_c !== sola.final_c ? _hBc('span', { style: { color: 'var(--ink-3)' } }, ' (' + becasMoneda(todas.final_c) + ' sumando las demás becas del alumno)') : null);
      }),
      candidatos.length > 4 ? _hBc('div', { style: { fontSize: 11.5, color: 'var(--ink-4)', marginTop: 4 } }, '… y ' + (candidatos.length - 4) + ' concepto(s) más.') : null);
  }

  // Categorías disponibles: las de los conceptos del colegio + las de siempre.
  var categorias = [];
  productos.forEach(function (p) { var c = String(p.categoria || '').toLowerCase(); if (c && c !== 'beca' && categorias.indexOf(c) === -1) categorias.push(c); });
  Object.keys(BECAS_CAT_LABELS).forEach(function (c) { if (c !== 'beca' && categorias.indexOf(c) === -1) categorias.push(c); });

  function formulario() {
    return _hBc('div', { style: { border: '1px solid var(--border-glow)', borderRadius: 'var(--radius-sm)', padding: 14, marginTop: 14 } },
      _hBc('div', { style: { fontWeight: 700, fontSize: 13, marginBottom: 10 } }, form.id ? 'Editar beca' : 'Nueva beca'),
      _hBc('div', { className: 'form-group' },
        _hBc('label', { className: 'form-label' }, 'Nombre'),
        _hBc('input', { className: 'form-input', value: form.nombre, maxLength: 80, placeholder: 'Beca SEP, Hermanos, Convenio…', onChange: function (e) { setCampo('nombre', e.target.value); } })),
      _hBc('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 } },
        _hBc('div', { className: 'form-group' },
          _hBc('label', { className: 'form-label' }, 'Tipo'),
          _hBc('select', { className: 'form-select', value: form.tipo, onChange: function (e) { setCampo('tipo', e.target.value); } },
            _hBc('option', { value: 'porcentaje' }, 'Porcentaje del precio'),
            _hBc('option', { value: 'monto' }, 'Monto fijo ($)'))),
        _hBc('div', { className: 'form-group' },
          _hBc('label', { className: 'form-label' }, form.tipo === 'porcentaje' ? 'Porcentaje (%)' : 'Monto ($)'),
          _hBc('input', { className: 'form-input', type: 'number', min: '0', step: '0.01', value: form.valor, onChange: function (e) { setCampo('valor', e.target.value); } }))),
      _hBc('div', { className: 'form-group' },
        _hBc('label', { className: 'form-label' }, 'Aplica a'),
        _hBc('select', { className: 'form-select', value: form.alcance, onChange: function (e) { cambiarAlcance(e.target.value); } },
          _hBc('option', { value: 'categorias' }, 'Categorías de conceptos (p. ej. toda la colegiatura)'),
          _hBc('option', { value: 'productos' }, 'Conceptos concretos'))),
      _hBc('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, maxHeight: 150, overflowY: 'auto' } },
        form.alcance === 'categorias'
          ? categorias.map(function (c) {
              return _hBc('label', { key: c, style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5 } },
                _hBc('input', { type: 'checkbox', checked: form.alcance_ids.indexOf(c) !== -1, onChange: function () { alternarId(c); } }),
                BECAS_CAT_LABELS[c] || c);
            })
          : productos.filter(function (p) { return String(p.categoria || '') !== 'beca' && parseFloat(p.precio) > 0; }).map(function (p) {
              return _hBc('label', { key: p.id, style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5 } },
                _hBc('input', { type: 'checkbox', checked: form.alcance_ids.indexOf(Number(p.id)) !== -1, onChange: function () { alternarId(Number(p.id)); } }),
                p.nombre);
            })),
      _hBc('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 } },
        _hBc('div', { className: 'form-group' },
          _hBc('label', { className: 'form-label' }, 'Vigente desde (opcional)'),
          _hBc('input', { className: 'form-input', type: 'date', value: form.vigente_desde, onChange: function (e) { setCampo('vigente_desde', e.target.value); } })),
        _hBc('div', { className: 'form-group' },
          _hBc('label', { className: 'form-label' }, 'Vigente hasta (opcional)'),
          _hBc('input', { className: 'form-input', type: 'date', value: form.vigente_hasta, onChange: function (e) { setCampo('vigente_hasta', e.target.value); } }))),
      _hBc('div', { className: 'form-group' },
        _hBc('label', { className: 'form-label' }, 'Notas (opcional)'),
        _hBc('input', { className: 'form-input', value: form.notas, maxLength: 255, onChange: function (e) { setCampo('notas', e.target.value); } })),
      _hBc('div', { style: { background: 'var(--bg-surface)', border: '1px dashed var(--border-glow)', borderRadius: 'var(--radius-sm)', padding: '9px 12px', marginBottom: 12 } },
        _hBc('div', { style: { fontSize: 11, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 } }, 'Vista previa'),
        vistaPrevia() || _hBc('div', { style: { fontSize: 12.5, color: 'var(--ink-3)' } }, 'Captura el valor para ver cuánto quedaría.')),
      _hBc('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
        _hBc('button', { className: 'btn btn-secondary', disabled: ocupado, onClick: function () { setForm(null); setError(''); } }, 'Cancelar'),
        _hBc('button', { className: 'btn btn-primary', disabled: ocupado, onClick: guardar }, ocupado ? 'Guardando…' : 'Guardar beca')));
  }

  function fila(b) {
    return _hBc('div', { key: b.id, style: { padding: '10px 0', borderBottom: '1px solid var(--glass-light)', opacity: b.activo ? 1 : 0.6 } },
      _hBc('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' } },
        _hBc('div', { style: { minWidth: 0 } },
          _hBc('div', { style: { fontWeight: 600, fontSize: 13.5 } }, b.nombre + ' · ' + becasValorTexto(b),
            ' ', _hBc('span', { className: 'badge ' + (b.activo ? 'badge-green' : 'badge-gray') }, b.activo ? 'Activa' : 'Dada de baja')),
          _hBc('div', { style: { fontSize: 12, color: 'var(--ink-3)', marginTop: 2 } }, 'Aplica a: ' + (becasAlcanceTexto(b, props.productos) || '—') + ' · ' + becasVigenciaTexto(b)),
          b.notas ? _hBc('div', { style: { fontSize: 11.5, color: 'var(--ink-4)', marginTop: 2 } }, b.notas) : null),
        _hBc('div', { style: { display: 'flex', gap: 6 } },
          b.activo ? _hBc('button', { className: 'btn btn-ghost btn-sm', disabled: ocupado, onClick: function () { editar(b); } }, 'Editar') : null,
          b.activo
            ? _hBc('button', { className: 'btn btn-ghost btn-sm', style: { color: 'var(--red)' }, disabled: ocupado, onClick: function () { cambiarEstado(b, false); } }, 'Dar de baja')
            : _hBc('button', { className: 'btn btn-ghost btn-sm', disabled: ocupado, onClick: function () { cambiarEstado(b, true); } }, 'Reactivar'))));
  }

  return _hBc(BcModal, {
    titulo: 'Becas de ' + alumno.nombre,
    sub: 'Se aplican solas en los cobros recurrentes y se proponen en Caja.',
    onCerrar: props.onCerrar,
    footer: _hBc('button', { className: 'btn btn-secondary', onClick: props.onCerrar }, 'Cerrar')
  },
    faltaMigracion ? _hBc(BcAviso, { msg: 'Falta correr la migración de OF-3 (migracion_2026_11_19_of3_cobranza.sql) para usar becas.' }) : null,
    becas === null ? _hBc('div', { style: { padding: '16px 0', color: 'var(--ink-3)', fontSize: 13 } }, 'Cargando…')
      : (becas.length === 0 && !faltaMigracion
        ? _hBc('div', { style: { padding: '14px 0', color: 'var(--ink-3)', fontSize: 13 } }, 'Este alumno no tiene becas guardadas.')
        : becas.map(fila)),
    !form && !faltaMigracion ? _hBc('div', { style: { marginTop: 12 } },
      _hBc('button', { className: 'btn btn-primary btn-sm', onClick: function () { setError(''); setForm(becasFormVacio()); } }, '+ Nueva beca')) : null,
    form ? formulario() : null,
    _hBc(BcAviso, { msg: error }));
}

// props: onCerrar, escuelaId (solo lo usa el superadmin)
function BecasColegio(props) {
  var R = React;
  var s1 = R.useState(null), res = s1[0], setRes = s1[1];
  var s2 = R.useState(''), error = s2[0], setError = s2[1];
  R.useEffect(function () {
    ApiClient.post('alumno_becas_listar', { escuela_id: props.escuelaId || undefined }).then(function (r) {
      if (!r.success) { setError(r.error || 'No se pudieron cargar las becas.'); setRes({ becas: [] }); return; }
      setRes(r);
    }).catch(function (e) { setError(e.message); setRes({ becas: [] }); });
  }, [props.escuelaId]);

  var becas = (res && res.becas) || [];
  return _hBc(BcModal, {
    titulo: 'Becas del colegio', ancho: 760,
    sub: res && !res.falta_migracion ? becas.length + ' becas activas · ' + (res.alumnos_con_beca || 0) + ' alumnos' : null,
    onCerrar: props.onCerrar,
    footer: _hBc('button', { className: 'btn btn-secondary', onClick: props.onCerrar }, 'Cerrar')
  },
    res === null ? _hBc('div', { style: { padding: '16px 0', color: 'var(--ink-3)', fontSize: 13 } }, 'Cargando…') : null,
    res && res.falta_migracion ? _hBc(BcAviso, { msg: res.aviso }) : null,
    res && !res.falta_migracion ? _hBc('div', { style: { padding: '12px 14px', marginBottom: 12, borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface)', border: '1px solid var(--border-glow)' } },
      _hBc('div', { style: { fontSize: 11, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '.4px' } }, 'Descuento mensual estimado'),
      _hBc('div', { style: { fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono)' } }, fmt(res.descuento_mensual_estimado || 0)),
      _hBc('div', { style: { fontSize: 11.5, color: 'var(--ink-3)', marginTop: 2 } }, 'Estimación con las becas vigentes hoy sobre los conceptos recurrentes activos (un concepto semestral o anual se reparte por mes).')) : null,
    res && !res.falta_migracion && becas.length === 0 ? _hBc('div', { style: { padding: '14px 0', color: 'var(--ink-3)', fontSize: 13 } }, 'No hay becas activas.') : null,
    becas.length ? _hBc('div', { className: 'table-wrap' },
      _hBc('table', null,
        _hBc('thead', null, _hBc('tr', null,
          _hBc('th', null, 'Alumno'), _hBc('th', null, 'Beca'), _hBc('th', null, 'Valor'), _hBc('th', null, 'Vigencia'), _hBc('th', null, 'Descuento / mes'))),
        _hBc('tbody', null, becas.map(function (b) {
          return _hBc('tr', { key: b.id },
            _hBc('td', null, b.cliente_nombre, b.cliente_activo ? null : _hBc('span', { style: { color: 'var(--ink-4)', fontSize: 11 } }, ' (inactivo)')),
            _hBc('td', null, b.nombre),
            _hBc('td', null, becasValorTexto(b)),
            _hBc('td', { style: { fontSize: 12, color: 'var(--ink-3)' } }, becasVigenciaTexto(b)),
            _hBc('td', { style: { fontFamily: 'var(--mono)' } }, b.descuento_mensual_estimado ? fmt(b.descuento_mensual_estimado) : '—'));
        })))) : null,
    _hBc(BcAviso, { msg: error }));
}
