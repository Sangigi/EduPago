/* views/Ayuda.js — Ayuda del colegio: tickets de soporte, artículos y novedades. [OF-7a]
 *
 * LO USAN admin y cajero (menú "Ayuda"). Tres pestañas:
 *  · Tickets    : abrir un ticket con adjuntos, ver los de MI colegio, responder y marcar resuelto.
 *  · Artículos  : guías publicadas para mi rol, con buscador.
 *  · Novedades  : avisos de lo nuevo. Abrir la pestaña quita el punto "nuevo" del menú.
 *
 * TEXTO DE USUARIO NUNCA COMO HTML. Todo se pinta con elementos de React (que escapan por sí
 * solos): ni innerHTML ni dangerouslySetInnerHTML. El formato mínimo de los artículos (párrafos,
 * listas con "- ", **negritas**) lo arma AyudaTexto() creando <p>, <ul>, <li> y <strong>.
 *
 * Este archivo también deja globales que usa views/SoporteTickets.js (la bandeja de soporte):
 * AyudaTexto, TicketDetalle, ayPedir, ayPedirForm, ayFecha, AY_ESTADOS.
 *
 * Las notas internas NO se ocultan aquí: el servidor no las manda al colegio
 * (acciones/soporte_ticket_ver.php). Si algún día llegara una, esta vista no la distingue.
 */
var _hAY = React.createElement;

var AY_ESTADOS = {
  abierto:           { label: 'Abierto',               clase: 'badge-blue' },
  en_proceso:        { label: 'En proceso',            clase: 'badge-amber' },
  esperando_cliente: { label: 'Esperando al colegio',  clase: 'badge-purple' },
  resuelto:          { label: 'Resuelto',              clase: 'badge-green' },
};
var AY_CATEGORIAS = {
  cobros: 'Cobros y caja', facturacion: 'Facturación', control_escolar: 'Control escolar',
  cuenta: 'Mi cuenta y accesos', otro: 'Otro',
};
var AY_MAX_ADJUNTOS = 5;
var AY_MAX_BYTES = 10 * 1024 * 1024;

function ayToken() { try { return AuthController.getToken() || ''; } catch (e) { return ''; } }
function ayCaducada() { try { AuthController.logout(); } catch (e) {} window.location.reload(); }

// JSON. Devuelve el cuerpo ya interpretado, o { success:false, error } si no se pudo.
function ayPedir(accion, cuerpo) {
  return fetch('api.php?action=' + accion, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ayToken() },
    body: JSON.stringify(cuerpo || {}),
  }).then(function (r) {
    if (r.status === 401) { ayCaducada(); return { success: false, error: 'Sesión expirada.' }; }
    return r.json().catch(function () { return { success: false, error: 'Respuesta inesperada del servidor (HTTP ' + r.status + ').' }; });
  }).catch(function () { return { success: false, error: 'Sin conexión con el servidor.' }; });
}

// multipart (adjuntos): api.php deja $input vacío y la acción lee $_POST/$_FILES.
function ayPedirForm(accion, fd) {
  return fetch('api.php?action=' + accion, {
    method: 'POST', headers: { 'Authorization': 'Bearer ' + ayToken() }, body: fd,
  }).then(function (r) {
    if (r.status === 401) { ayCaducada(); return { success: false, error: 'Sesión expirada.' }; }
    return r.json().catch(function () { return { success: false, error: 'No se pudo enviar (HTTP ' + r.status + '). Si adjuntaste archivos grandes, prueba con menos o más pequeños.' }; });
  }).catch(function () { return { success: false, error: 'Sin conexión con el servidor.' }; });
}

function ayFecha(s) {
  if (!s) return '';
  var t = String(s).replace('T', ' ').slice(0, 16);
  return t;
}
function ayBytes(n) {
  n = Number(n || 0);
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
  return Math.max(1, Math.round(n / 1024)) + ' KB';
}
// "hace 3 h", "hace 2 d" a partir de minutos.
function ayEdad(min) {
  min = Number(min || 0);
  if (min < 60) return 'hace ' + Math.max(1, min) + ' min';
  if (min < 1440) return 'hace ' + Math.floor(min / 60) + ' h';
  return 'hace ' + Math.floor(min / 1440) + ' d';
}

// ════════════════════════════════════════════════════════════════════════
// Texto con formato mínimo → elementos de React (jamás HTML)
// ════════════════════════════════════════════════════════════════════════

// "uno **dos** tres" → ['uno ', <strong>dos</strong>, ' tres']. El texto va como hijo de React: se escapa solo.
function ayInline(texto, clave) {
  var partes = String(texto).split(/\*\*(.+?)\*\*/g);
  return partes.map(function (p, i) {
    if (p === '') return null;
    return i % 2 === 1 ? _hAY('strong', { key: clave + '-' + i }, p) : _hAY(React.Fragment, { key: clave + '-' + i }, p);
  });
}

function AyudaTexto(props) {
  var texto = String(props.texto || '').replace(/\r\n?/g, '\n');
  var bloques = texto.split(/\n{2,}/);
  var out = [];
  bloques.forEach(function (bloque, bi) {
    var lineas = bloque.split('\n').filter(function (l) { return l.trim() !== ''; });
    if (!lineas.length) return;
    // Un bloque puede mezclar un párrafo y una lista: se agrupan las líneas seguidas del mismo tipo.
    var grupo = null;
    var vaciar = function () {
      if (!grupo) return;
      if (grupo.lista) {
        out.push(_hAY('ul', { key: 'u' + bi + '-' + out.length, style: { margin: '0 0 10px', paddingLeft: 22 } },
          grupo.items.map(function (it, i) { return _hAY('li', { key: i, style: { marginBottom: 4 } }, ayInline(it, 'l' + i)); })));
      } else {
        var hijos = [];
        grupo.items.forEach(function (it, i) {
          if (i > 0) hijos.push(_hAY('br', { key: 'br' + i }));
          hijos.push(_hAY(React.Fragment, { key: 't' + i }, ayInline(it, 'p' + i)));
        });
        out.push(_hAY('p', { key: 'p' + bi + '-' + out.length, style: { margin: '0 0 10px' } }, hijos));
      }
      grupo = null;
    };
    lineas.forEach(function (l) {
      var esItem = /^\s*-\s+/.test(l);
      if (!grupo || grupo.lista !== esItem) { vaciar(); grupo = { lista: esItem, items: [] }; }
      grupo.items.push(esItem ? l.replace(/^\s*-\s+/, '') : l);
    });
    vaciar();
  });
  return _hAY('div', { style: { fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink-2)' } }, out);
}

// ════════════════════════════════════════════════════════════════════════
// Piezas compartidas de tickets
// ════════════════════════════════════════════════════════════════════════

function AyAviso(props) {
  if (!props.texto) return null;
  var rojo = props.tipo !== 'ok';
  return _hAY('div', {
    style: {
      padding: '10px 14px', marginBottom: 12, borderRadius: 'var(--radius)', fontSize: 13,
      border: '1px solid ' + (rojo ? 'var(--red)' : 'var(--green)'), color: rojo ? 'var(--red)' : 'var(--green)'
    }
  }, props.texto);
}

// Selector de archivos con validación en el navegador (el servidor valida otra vez, por firma).
function AyArchivos(props) {
  var _R = React;
  var s = _R.useState(0); var clave = s[0], setClave = s[1];
  var cambiar = function (e) {
    var lista = Array.prototype.slice.call(e.target.files || []);
    if (lista.length > AY_MAX_ADJUNTOS) {
      props.onError('Puedes adjuntar hasta ' + AY_MAX_ADJUNTOS + ' archivos por mensaje.');
      setClave(clave + 1); props.onChange([]); return;
    }
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].size > AY_MAX_BYTES) {
        props.onError('«' + lista[i].name + '» pesa ' + ayBytes(lista[i].size) + '; el máximo es 10 MB.');
        setClave(clave + 1); props.onChange([]); return;
      }
    }
    props.onError('');
    props.onChange(lista);
  };
  return _hAY('div', { className: 'form-group' },
    _hAY('label', { className: 'form-label' }, 'Adjuntos (opcional)'),
    _hAY('input', {
      key: clave, type: 'file', multiple: true, accept: '.jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf',
      onChange: cambiar, disabled: props.disabled, style: { fontSize: 12.5 }
    }),
    _hAY('div', { style: { fontSize: 11.5, color: 'var(--ink-4)', marginTop: 4 } },
      'Imágenes (JPG, PNG, WEBP) o PDF, hasta ' + AY_MAX_ADJUNTOS + ' archivos de 10 MB. No subas contraseñas ni datos de tarjetas.')
  );
}

function AyAdjuntosLista(props) {
  var lista = props.adjuntos || [];
  if (!lista.length) return null;
  var abrir = function (a) {
    var url = 'api.php?action=soporte_adjunto_descargar&adjunto_id=' + encodeURIComponent(a.id);
    if (typeof abrirDocumentoPrivado === 'function') {
      abrirDocumentoPrivado(url, ayToken(), a.nombre_original || 'adjunto', function (m) { props.onError && props.onError(m); });
    } else if (props.onError) { props.onError('No se pudo abrir el visor. Recarga la página.'); }
  };
  return _hAY('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 } },
    lista.map(function (a) {
      return _hAY('button', { key: a.id, className: 'btn btn-secondary btn-sm', type: 'button', onClick: function () { abrir(a); }, title: 'Abrir' },
        (a.nombre_original || 'archivo') + ' · ' + ayBytes(a.tamano_bytes));
    }));
}

// ════════════════════════════════════════════════════════════════════════
// Detalle de un ticket (colegio y plataforma)
//   props: ticketId, esPlataforma, agentes (solo plataforma), onCambio(), onVolver()
// ════════════════════════════════════════════════════════════════════════

function TicketDetalle(props) {
  var _R = React;
  var e1 = _R.useState(null);  var det = e1[0], setDet = e1[1];
  var e2 = _R.useState(true);  var cargando = e2[0], setCargando = e2[1];
  var e3 = _R.useState('');    var error = e3[0], setError = e3[1];
  var e4 = _R.useState('');    var texto = e4[0], setTexto = e4[1];
  var e5 = _R.useState([]);    var archivos = e5[0], setArchivos = e5[1];
  var e6 = _R.useState(false); var enviando = e6[0], setEnviando = e6[1];
  var e7 = _R.useState(false); var interno = e7[0], setInterno = e7[1];
  var e8 = _R.useState('');    var estadoTras = e8[0], setEstadoTras = e8[1];
  var e9 = _R.useState(0);     var claveForm = e9[0], setClaveForm = e9[1];
  var esP = !!props.esPlataforma;

  var cargar = function () {
    return ayPedir('soporte_ticket_ver', { ticket_id: props.ticketId }).then(function (r) {
      setCargando(false);
      if (!r || !r.success) { setError((r && r.error) || 'No se pudo abrir el ticket.'); return; }
      setError(''); setDet(r);
      if (props.onCambio) props.onCambio();   // abrirlo lo marcó como leído: refresca contadores
    });
  };
  _R.useEffect(function () { setCargando(true); setDet(null); setTexto(''); setArchivos([]); cargar(); }, [props.ticketId]);

  var enviar = function () {
    if (!texto.trim()) { setError('Escribe tu mensaje.'); return; }
    setEnviando(true); setError('');
    var fd = new FormData();
    fd.append('ticket_id', props.ticketId);
    fd.append('texto', texto);
    if (esP && interno) fd.append('interno', '1');
    if (esP && !interno && estadoTras) fd.append('estado', estadoTras);
    archivos.forEach(function (f, i) { fd.append('archivos[' + i + ']', f); });
    ayPedirForm('soporte_ticket_responder', fd).then(function (r) {
      setEnviando(false);
      if (!r || !r.success) { setError((r && r.error) || 'No se pudo enviar.'); return; }
      setTexto(''); setArchivos([]); setClaveForm(claveForm + 1); setInterno(false);
      cargar();
    });
  };

  var actualizar = function (cambios) {
    setError('');
    ayPedir('soporte_ticket_actualizar', Object.assign({ ticket_id: props.ticketId }, cambios)).then(function (r) {
      if (!r || !r.success) { setError((r && r.error) || 'No se pudo actualizar.'); return; }
      cargar();
    });
  };

  if (cargando) return _hAY('div', { style: { padding: 30, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 } }, 'Cargando…');
  if (!det) return _hAY('div', {}, _hAY(AyAviso, { texto: error }), _hAY('button', { className: 'btn btn-secondary', onClick: props.onVolver }, 'Volver'));

  var t = det.ticket;
  var est = AY_ESTADOS[t.estado] || { label: t.estado, clase: 'badge-gray' };
  var resuelto = t.estado === 'resuelto';

  var mensajes = det.mensajes.map(function (m) {
    var delSoporte = m.lado === 'soporte';
    var nota = !!m.interno;
    return _hAY('div', {
      key: m.id,
      style: {
        padding: '12px 14px', marginBottom: 10, borderRadius: 'var(--radius)',
        border: '1px solid ' + (nota ? 'var(--amber)' : 'var(--border-glow)'),
        background: nota ? 'var(--amber-glow, var(--glass-light))' : (delSoporte ? 'var(--glass-light)' : 'transparent'),
        marginLeft: delSoporte ? 0 : 0
      }
    },
      _hAY('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6, fontSize: 12, color: 'var(--ink-3)' } },
        _hAY('strong', { style: { color: 'var(--ink)' } }, m.autor_nombre || (delSoporte ? 'Soporte' : 'Colegio')),
        nota ? _hAY('span', { className: 'badge badge-amber' }, 'Nota interna: el colegio no la ve')
             : (esP ? _hAY('span', { className: 'badge ' + (delSoporte ? 'badge-blue' : 'badge-gray') }, delSoporte ? 'Soporte' : 'Colegio') : null),
        _hAY('span', {}, ayFecha(m.creado_en))
      ),
      // Texto plano, respetando saltos de línea. React lo escapa: nunca se interpreta como HTML.
      _hAY('div', { style: { whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13.5, color: 'var(--ink)' } }, m.texto),
      _hAY(AyAdjuntosLista, { adjuntos: m.adjuntos, onError: setError })
    );
  });

  var controles = null;
  if (esP) {
    var agentes = props.agentes || [];
    controles = _hAY('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 } },
      _hAY('div', {}, _hAY('label', { className: 'form-label' }, 'Estado'),
        _hAY('select', { className: 'form-select', value: t.estado, onChange: function (e) { actualizar({ estado: e.target.value }); } },
          Object.keys(AY_ESTADOS).map(function (k) { return _hAY('option', { key: k, value: k }, AY_ESTADOS[k].label); }))),
      _hAY('div', {}, _hAY('label', { className: 'form-label' }, 'Prioridad'),
        _hAY('select', { className: 'form-select', value: t.prioridad, onChange: function (e) { actualizar({ prioridad: e.target.value }); } },
          _hAY('option', { value: 'normal' }, 'Normal'), _hAY('option', { value: 'alta' }, 'Alta'))),
      _hAY('div', {}, _hAY('label', { className: 'form-label' }, 'Asignado a'),
        _hAY('select', { className: 'form-select', value: t.asignado_a || '', onChange: function (e) { actualizar({ asignado_a: e.target.value ? Number(e.target.value) : 0 }); } },
          _hAY('option', { value: '' }, 'Sin asignar'),
          agentes.map(function (a) { return _hAY('option', { key: a.id, value: a.id }, a.nombre); }))),
      _hAY('button', { className: 'btn btn-secondary btn-sm', onClick: function () { actualizar({ asignado_a: 'yo' }); } }, 'Asignármelo')
    );
  }

  return _hAY('div', {},
    _hAY('div', { className: 'card', style: { marginBottom: 14 } },
      _hAY('div', { className: 'card-header', style: { alignItems: 'flex-start' } },
        _hAY('div', { style: { minWidth: 0 } },
          _hAY('div', { className: 'card-title' }, '#' + t.id + ' · ' + t.asunto),
          _hAY('div', { className: 'card-sub' },
            (esP && t.escuela_nombre ? t.escuela_nombre + ' · ' : '') + t.categoria_nombre + ' · abierto el ' + ayFecha(t.creado_en))),
        _hAY('div', { style: { display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 } },
          _hAY('span', { className: 'badge ' + est.clase }, est.label),
          _hAY('button', { className: 'btn btn-secondary btn-sm', onClick: props.onVolver }, 'Volver'))
      ),
      controles,
      !esP ? _hAY('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
        resuelto
          ? _hAY('button', { className: 'btn btn-secondary btn-sm', onClick: function () { actualizar({ estado: 'abierto' }); } }, 'Reabrir ticket')
          : _hAY('button', { className: 'btn btn-success btn-sm', onClick: function () { actualizar({ estado: 'resuelto' }); } }, 'Marcar como resuelto')
      ) : null
    ),

    _hAY(AyAviso, { texto: error }),
    _hAY('div', { style: { marginBottom: 14 } }, mensajes),

    _hAY('div', { className: 'card' },
      _hAY('div', { className: 'card-title', style: { marginBottom: 10 } },
        esP ? (interno ? 'Nota interna' : 'Responder al colegio') : (resuelto ? 'Responder (reabre el ticket)' : 'Responder')),
      _hAY('textarea', {
        className: 'form-input', rows: 4, value: texto, maxLength: 5000, disabled: enviando,
        placeholder: esP && interno ? 'Solo lo ve el equipo de soporte.' : 'Escribe tu mensaje…',
        onChange: function (e) { setTexto(e.target.value); }, style: { marginBottom: 10, width: '100%', resize: 'vertical' }
      }),
      _hAY(AyArchivos, { key: claveForm, disabled: enviando, onChange: setArchivos, onError: setError }),
      esP ? _hAY('div', { style: { display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 } },
        _hAY('label', { style: { fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' } },
          _hAY('input', { type: 'checkbox', checked: interno, onChange: function (e) { setInterno(e.target.checked); } }),
          'Nota interna (el colegio no la verá ni recibirá correo)'),
        !interno ? _hAY('div', {}, _hAY('select', { className: 'form-select', value: estadoTras, onChange: function (e) { setEstadoTras(e.target.value); } },
          _hAY('option', { value: '' }, 'Después de responder: Esperando al colegio'),
          _hAY('option', { value: 'en_proceso' }, 'Después de responder: En proceso'),
          _hAY('option', { value: 'resuelto' }, 'Después de responder: Resuelto'))) : null
      ) : null,
      _hAY('button', { className: 'btn btn-primary', disabled: enviando, onClick: enviar },
        enviando ? 'Enviando…' : (esP && interno ? 'Guardar nota' : 'Enviar'))
    )
  );
}

// ════════════════════════════════════════════════════════════════════════
// Pestaña: Tickets (colegio)
// ════════════════════════════════════════════════════════════════════════

function AyNuevoTicket(props) {
  var _R = React;
  var a = _R.useState('');       var asunto = a[0], setAsunto = a[1];
  var b = _R.useState('cobros'); var cat = b[0], setCat = b[1];
  var c = _R.useState('');       var mensaje = c[0], setMensaje = c[1];
  var d = _R.useState([]);       var archivos = d[0], setArchivos = d[1];
  var e = _R.useState(false);    var enviando = e[0], setEnviando = e[1];
  var f = _R.useState('');       var error = f[0], setError = f[1];

  var enviar = function () {
    if (!asunto.trim()) { setError('Escribe el asunto.'); return; }
    if (!mensaje.trim()) { setError('Cuéntanos qué pasa.'); return; }
    setEnviando(true); setError('');
    var fd = new FormData();
    fd.append('asunto', asunto); fd.append('categoria', cat); fd.append('mensaje', mensaje);
    archivos.forEach(function (f2, i) { fd.append('archivos[' + i + ']', f2); });
    ayPedirForm('soporte_ticket_crear', fd).then(function (r) {
      setEnviando(false);
      if (!r || !r.success) { setError((r && r.error) || 'No se pudo crear el ticket.'); return; }
      props.onCreado(r.ticket_id);
    });
  };

  return _hAY('div', { className: 'card' },
    _hAY('div', { className: 'card-header' },
      _hAY('div', {}, _hAY('div', { className: 'card-title' }, 'Nuevo ticket'),
        _hAY('div', { className: 'card-sub' }, 'Cuéntanos qué pasa. Soporte te responde aquí y por correo.')),
      _hAY('button', { className: 'btn btn-secondary btn-sm', onClick: props.onCancelar, disabled: enviando }, 'Cancelar')),
    _hAY(AyAviso, { texto: error }),
    _hAY('div', { className: 'form-group' }, _hAY('label', { className: 'form-label' }, 'Asunto'),
      _hAY('input', { className: 'form-input', value: asunto, maxLength: 150, disabled: enviando, placeholder: 'Ej. No puedo generar la liga de pago', onChange: function (ev) { setAsunto(ev.target.value); } })),
    _hAY('div', { className: 'form-group' }, _hAY('label', { className: 'form-label' }, 'Categoría'),
      _hAY('select', { className: 'form-select', value: cat, disabled: enviando, onChange: function (ev) { setCat(ev.target.value); } },
        Object.keys(AY_CATEGORIAS).map(function (k) { return _hAY('option', { key: k, value: k }, AY_CATEGORIAS[k]); }))),
    _hAY('div', { className: 'form-group' }, _hAY('label', { className: 'form-label' }, 'Mensaje'),
      _hAY('textarea', { className: 'form-input', rows: 6, value: mensaje, maxLength: 5000, disabled: enviando, style: { width: '100%', resize: 'vertical' },
        placeholder: 'Qué estabas haciendo, qué esperabas que pasara y qué pasó. Si hay un mensaje de error, cópialo.', onChange: function (ev) { setMensaje(ev.target.value); } })),
    _hAY(AyArchivos, { disabled: enviando, onChange: setArchivos, onError: setError }),
    _hAY('button', { className: 'btn btn-primary', disabled: enviando, onClick: enviar }, enviando ? 'Enviando…' : 'Enviar ticket')
  );
}

function AyTickets(props) {
  var _R = React;
  var a = _R.useState(null);       var lista = a[0], setLista = a[1];
  var b = _R.useState('abiertos'); var filtro = b[0], setFiltro = b[1];
  var c = _R.useState(null);       var abierto = c[0], setAbierto = c[1];
  var d = _R.useState(false);      var nuevo = d[0], setNuevo = d[1];
  var e = _R.useState('');         var error = e[0], setError = e[1];
  var f = _R.useState(true);       var cargando = f[0], setCargando = f[1];

  var cargar = function () {
    return ayPedir('soporte_tickets_listar', { estado: filtro }).then(function (r) {
      setCargando(false);
      if (!r || !r.success) { setError((r && r.error) || 'No se pudo cargar tus tickets.'); return; }
      setError(''); setLista(r);
    });
  };
  _R.useEffect(function () { setCargando(true); cargar(); }, [filtro]);

  var refrescar = function () { cargar(); if (props.onCambio) props.onCambio(); };

  if (nuevo) return _hAY(AyNuevoTicket, { onCancelar: function () { setNuevo(false); }, onCreado: function (id) { setNuevo(false); setAbierto(id); refrescar(); } });
  if (abierto) return _hAY(TicketDetalle, { ticketId: abierto, esPlataforma: false, onCambio: refrescar, onVolver: function () { setAbierto(null); refrescar(); } });

  var tickets = (lista && lista.tickets) || [];
  return _hAY('div', {},
    _hAY('div', { style: { display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 } },
      _hAY('div', { className: 'pill-group' },
        [['abiertos', 'Abiertos'], ['todos', 'Todos'], ['resuelto', 'Resueltos']].map(function (p) {
          return _hAY('button', { key: p[0], className: 'pill' + (filtro === p[0] ? ' active' : ''), onClick: function () { setFiltro(p[0]); } }, p[1]);
        })),
      _hAY('button', { className: 'btn btn-primary', onClick: function () { setNuevo(true); } }, '+ Nuevo ticket')),
    _hAY(AyAviso, { texto: error }),
    cargando && !lista ? _hAY('div', { style: { padding: 30, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 } }, 'Cargando…')
    : tickets.length === 0
      ? _hAY('div', { className: 'card empty-state' },
          _hAY('div', { className: 'empty-text' }, filtro === 'abiertos' ? 'No tienes tickets abiertos.' : 'No hay tickets aquí.'),
          _hAY('div', { className: 'empty-sub' }, 'Si necesitas ayuda, abre un ticket y soporte te responde por aquí.'))
      : _hAY('div', { className: 'card' }, _hAY('div', { className: 'table-wrap' }, _hAY('table', {},
          _hAY('thead', {}, _hAY('tr', {}, _hAY('th', {}, '#'), _hAY('th', {}, 'Asunto'), _hAY('th', {}, 'Categoría'), _hAY('th', {}, 'Estado'), _hAY('th', {}, 'Última actividad'))),
          _hAY('tbody', {}, tickets.map(function (t) {
            var est = AY_ESTADOS[t.estado] || { label: t.estado, clase: 'badge-gray' };
            return _hAY('tr', { key: t.id, style: { cursor: 'pointer' }, onClick: function () { setAbierto(t.id); } },
              _hAY('td', { style: { fontFamily: 'var(--mono)' } }, t.id),
              _hAY('td', { style: { fontWeight: t.no_leido ? 700 : 500 } }, t.asunto,
                t.no_leido ? _hAY('span', { className: 'badge badge-red', style: { marginLeft: 8 } }, 'Respuesta nueva') : null),
              _hAY('td', {}, t.categoria_nombre),
              _hAY('td', {}, _hAY('span', { className: 'badge ' + est.clase }, est.label)),
              _hAY('td', { style: { fontSize: 12, color: 'var(--ink-3)', whiteSpace: 'nowrap' } }, ayFecha(t.ultimo_mensaje_en)));
          }))
        )))
  );
}

// ════════════════════════════════════════════════════════════════════════
// Pestañas: Artículos y Novedades
// ════════════════════════════════════════════════════════════════════════

function AyArticulo(props) {
  var _R = React;
  var s = _R.useState(!!props.abiertoInicial); var abierto = s[0], setAbierto = s[1];
  var it = props.item;
  return _hAY('div', { className: 'card', style: { marginBottom: 10 } },
    _hAY('div', { style: { display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }, onClick: function () { setAbierto(!abierto); } },
      _hAY('div', { style: { minWidth: 0 } },
        _hAY('div', { className: 'card-title', style: { fontSize: 14 } }, it.titulo, it.nueva ? _hAY('span', { className: 'badge badge-red', style: { marginLeft: 8 } }, 'Nuevo') : null),
        props.mostrarFecha && it.publicado_en ? _hAY('div', { className: 'card-sub' }, ayFecha(it.publicado_en).slice(0, 10)) : null),
      _hAY('span', { style: { color: 'var(--ink-3)', fontSize: 12 } }, abierto ? 'Cerrar' : 'Leer')),
    abierto ? _hAY('div', { style: { marginTop: 12 } }, _hAY(AyudaTexto, { texto: it.cuerpo })) : null
  );
}

function AyArticulos(props) {
  var _R = React;
  var s = _R.useState(''); var q = s[0], setQ = s[1];
  var qn = q.trim().toLowerCase();
  var items = (props.items || []).filter(function (it) {
    return it.tipo === 'articulo' && (!qn || (it.titulo + ' ' + it.cuerpo).toLowerCase().indexOf(qn) !== -1);
  });
  return _hAY('div', {},
    _hAY('input', { className: 'form-input', style: { marginBottom: 14, maxWidth: 420 }, placeholder: 'Buscar en los artículos…', value: q, onChange: function (e) { setQ(e.target.value); } }),
    items.length === 0
      ? _hAY('div', { className: 'card empty-state' }, _hAY('div', { className: 'empty-text' }, qn ? 'Ningún artículo coincide con tu búsqueda.' : 'Todavía no hay artículos.'),
          qn ? _hAY('div', { className: 'empty-sub' }, 'Prueba con otra palabra o abre un ticket.') : null)
      : items.map(function (it) { return _hAY(AyArticulo, { key: it.id + '-' + qn, item: it, abiertoInicial: !!qn && items.length === 1 }); })
  );
}

function AyNovedades(props) {
  var items = (props.items || []).filter(function (it) { return it.tipo === 'novedad'; });
  return _hAY('div', {},
    items.length === 0
      ? _hAY('div', { className: 'card empty-state' }, _hAY('div', { className: 'empty-text' }, 'Sin novedades por ahora.'))
      : items.map(function (it) { return _hAY(AyArticulo, { key: it.id, item: it, mostrarFecha: true, abiertoInicial: !!it.nueva }); })
  );
}

// ════════════════════════════════════════════════════════════════════════
// Vista
//   props: user, onResumen() — pide al menú que vuelva a leer sus contadores.
// ════════════════════════════════════════════════════════════════════════

function Ayuda(props) {
  var _R = React;
  var t = _R.useState('tickets');  var tab = t[0], setTab = t[1];
  var a = _R.useState(null);       var ayuda = a[0], setAyuda = a[1];
  var r = _R.useState(null);       var resumen = r[0], setResumen = r[1];
  var e = _R.useState('');         var error = e[0], setError = e[1];

  var avisar = function () { if (props.onResumen) props.onResumen(); };
  var leerResumen = function () {
    ayPedir('soporte_resumen', {}).then(function (x) { if (x && x.success) setResumen(x); });
  };

  _R.useEffect(function () {
    ayPedir('ayuda_listar', {}).then(function (x) {
      if (!x || !x.success) { setError((x && x.error) || 'No se pudo cargar la ayuda.'); setAyuda({ items: [] }); return; }
      setAyuda(x);
    });
    leerResumen();
  }, []);

  // Al abrir "Novedades" se marcan como vistas, pero la lista conserva su "Nuevo" de esta visita.
  _R.useEffect(function () {
    if (tab !== 'novedades') return;
    ayPedir('ayuda_novedades_vistas', {}).then(function (x) { if (x && x.success) { leerResumen(); avisar(); } });
  }, [tab]);

  var sinVer = (ayuda && ayuda.novedades_sin_ver) || 0;
  var noLeidos = (resumen && resumen.no_leidos) || 0;
  var tabs = [
    { id: 'tickets', label: 'Mis tickets' + (noLeidos > 0 ? ' (' + noLeidos + ')' : '') },
    { id: 'articulos', label: 'Artículos' },
    { id: 'novedades', label: 'Novedades' + (sinVer > 0 && tab !== 'novedades' ? ' •' : '') },
  ];

  return _hAY('div', {},
    _hAY('div', { className: 'pill-group', style: { marginBottom: 16 } },
      tabs.map(function (x) {
        return _hAY('button', { key: x.id, className: 'pill' + (tab === x.id ? ' active' : ''), onClick: function () { setTab(x.id); } }, x.label);
      })),
    resumen && resumen.instalado === false
      ? _hAY(AyAviso, { texto: 'El soporte dentro de la plataforma aún no está disponible. Intenta más tarde.' }) : null,
    _hAY(AyAviso, { texto: error }),
    tab === 'tickets' ? _hAY(AyTickets, { onCambio: function () { leerResumen(); avisar(); } })
      : !ayuda ? _hAY('div', { style: { padding: 30, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 } }, 'Cargando…')
      : tab === 'articulos' ? _hAY(AyArticulos, { items: ayuda.items })
      : _hAY(AyNovedades, { items: ayuda.items })
  );
}
