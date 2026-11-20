// views/components/ImportarSaldos.js — [OF-5] Importar adeudos y saldos iniciales desde un archivo.
//
// Asistente de 3 pasos + historial:
//   1. Archivo   — sube un CSV o XLSX (o baja la plantilla) y el servidor lo ANALIZA sin escribir nada.
//   2. Revisar   — vista previa por renglón; si una columna no se reconoció la mapeas a mano, y a cada
//                  concepto le eliges un concepto de pago (hereda IVA y clave SAT) o "sin concepto ligado".
//   3. Aplicar   — confirma y crea los cobros pendientes.
//   Historial    — cada importación con su estado y el botón "Deshacer" (solo si ningún cobro recibió pagos).
//
// Se importa el SALDO PENDIENTE (monto − abonado) como un cobro pendiente por renglón. NO se importan pagos:
// no se crean abonos. Volver a subir el mismo archivo no duplica nada (huella por renglón en el servidor).
//
// Acciones: importar_saldos_analizar / _aplicar (multipart) y _listar / _deshacer (JSON). Solo admin y
// superadmin; el servidor valida rol y escuela en cada una. Usa ApiClient, AuthController y fmt (Badge.js).
//
// ImportarSaldos({ escuelaId, onCerrar }) — escuelaId solo lo usa el superadmin (el admin usa la suya).

var _hIs = React.createElement;

// Campos que reconoce el servidor, en el orden en que se pintan.
var IMPSAL_CAMPOS = [
  { id: 'matricula', etiqueta: 'Matrícula', ayuda: 'Obligatoria (o el nombre del alumno)' },
  { id: 'alumno',    etiqueta: 'Nombre del alumno', ayuda: 'Opcional: alternativa a la matrícula' },
  { id: 'concepto',  etiqueta: 'Concepto', ayuda: 'Texto; si falta se usa "Saldo inicial"' },
  { id: 'monto',     etiqueta: 'Monto', ayuda: 'Obligatorio: original, o lo pendiente si no hay "Abonado"' },
  { id: 'abonado',   etiqueta: 'Abonado', ayuda: 'Opcional: lo que ya pagó (se descuenta; no se registra como pago)' },
  { id: 'fecha',     etiqueta: 'Fecha de emisión', ayuda: 'Opcional; por omisión, hoy' },
  { id: 'vence',     etiqueta: 'Vencimiento', ayuda: 'Opcional; solo informativo' },
  { id: 'folio',     etiqueta: 'Folio externo', ayuda: 'Opcional: distingue dos cargos iguales' }
];

function impsalMoneda(n) { return typeof fmt === 'function' ? fmt(n) : '$' + Number(n || 0).toFixed(2); }

function impsalFechaHora(s) { return s ? String(s).replace('T', ' ').slice(0, 16) : ''; }

// Plantilla CSV (UTF-8 con BOM para que Excel respete los acentos), generada en el navegador.
function impsalDescargarPlantilla() {
  var csv = '﻿Matrícula,Alumno,Concepto,Monto,Abonado,Fecha,Vence,Folio\r\n'
    + '2024-001,Ana López Pérez,Colegiatura septiembre,1500.00,500.00,01/09/2026,10/09/2026,F-123\r\n';
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'plantilla_importar_adeudos.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
}

// POST multipart (el archivo): ApiClient solo habla JSON. Mismo manejo de 401/402 que ApiClient.post.
function impsalSubir(action, archivo, extras) {
  var fd = new FormData();
  fd.append('archivo', archivo);
  Object.keys(extras || {}).forEach(function (k) {
    var v = extras[k];
    if (v === undefined || v === null || v === '') return;
    fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  });
  var token = AuthController.getToken();
  return fetch('api.php?action=' + action, {
    method: 'POST',
    headers: { 'Authorization': token ? 'Bearer ' + token : '' }, // sin Content-Type: el navegador pone el boundary
    body: fd
  }).then(function (res) {
    if (res.status === 401) { AuthController.logout(); window.location.reload(); throw new Error('Sesión expirada. Inicia sesión de nuevo.'); }
    if (res.status === 402) {
      return res.json().catch(function () { return null; }).then(function (j) { throw new Error((j && j.error) || 'Tu suscripción venció.'); });
    }
    if (!res.ok && res.status !== 403) throw new Error('HTTP ' + res.status);
    return res.json();
  });
}

function ImpSalModal(props) {
  return _hIs('div', {
    className: 'modal-backdrop',
    onClick: function (e) { if (e.target === e.currentTarget && props.onCerrar && !props.bloqueado) props.onCerrar(); }
  },
    _hIs('div', { className: 'modal', style: { maxWidth: props.ancho || 1000, width: '100%' } },
      _hIs('div', { className: 'modal-header' },
        _hIs('div', null,
          _hIs('div', { className: 'modal-title' }, props.titulo),
          props.sub ? _hIs('div', { style: { fontSize: 12, color: 'var(--ink-3)', marginTop: 2 } }, props.sub) : null),
        _hIs('button', { className: 'btn btn-ghost btn-sm', onClick: props.onCerrar, disabled: props.bloqueado, 'aria-label': 'Cerrar' },
          _hIs(Icon, { name: 'close', size: 16, color: 'currentColor' }))
      ),
      _hIs('div', { className: 'modal-body' }, props.children),
      props.footer ? _hIs('div', { className: 'modal-footer' }, props.footer) : null
    )
  );
}

function ImpSalAviso(props) {
  if (!props.msg) return null;
  var tipo = props.tipo || 'error';
  var color = tipo === 'ok' ? 'var(--green-dark, var(--green))' : (tipo === 'aviso' ? 'var(--amber-dark, var(--amber))' : 'var(--red)');
  var fondo = tipo === 'ok' ? 'var(--green-glow)' : (tipo === 'aviso' ? 'var(--amber-glow)' : 'var(--red-glow)');
  return _hIs('div', { style: { marginTop: 10, padding: '9px 12px', fontSize: 12.5, borderRadius: 'var(--radius-sm)', color: color, background: fondo, whiteSpace: 'pre-wrap' } }, props.msg);
}

function ImpSalPasos(props) {
  var nombres = ['1. Archivo', '2. Revisar y ajustar', '3. Aplicar'];
  return _hIs('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 } },
    nombres.map(function (n, i) {
      var activo = props.paso === i + 1;
      return _hIs('span', { key: i, className: 'badge ' + (activo ? 'badge-blue' : (props.paso > i + 1 ? 'badge-green' : 'badge-gray')), style: { fontWeight: activo ? 700 : 500 } }, n);
    }));
}

function ImpSalTotal(props) {
  return _hIs('div', { style: { padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface)', border: '1px solid var(--border-glow)', minWidth: 120 } },
    _hIs('div', { style: { fontSize: 10.5, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '.4px' } }, props.etiqueta),
    _hIs('div', { style: { fontSize: 18, fontWeight: 700, fontFamily: 'var(--mono)', color: props.color || 'inherit' } }, props.valor),
    props.sub ? _hIs('div', { style: { fontSize: 11, color: 'var(--ink-3)' } }, props.sub) : null);
}

// ════════════════════════════════════════════════════════════════════════
//  ASISTENTE (pestaña "Importar")
// ════════════════════════════════════════════════════════════════════════

function ImpSalAsistente(props) {
  var R = React;
  var s;
  var s = R.useState(1), paso = s[0], setPaso = s[1];
  var s = R.useState(null), archivo = s[0], setArchivo = s[1];
  var s = R.useState(null), plan = s[0], setPlan = s[1];
  var s = R.useState(null), mapeo = s[0], setMapeo = s[1];         // campo -> índice de columna | null (lo que se mandó/devolvió)
  var s = R.useState({}), eleccion = s[0], setEleccion = s[1];      // concepto_clave -> producto_id | 0
  var s = R.useState(false), cargando = s[0], setCargando = s[1];
  var s = R.useState(''), error = s[0], setError = s[1];
  var s = R.useState(null), resultado = s[0], setResultado = s[1];
  var s = R.useState('importables'), filtro = s[0], setFiltro = s[1];
  var s = R.useState(0), pagina = s[0], setPagina = s[1];
  var s = R.useState(false), mapeoAbierto = s[0], setMapeoAbierto = s[1];
  var POR_PAGINA = 50;

  function extras(m, el, mas) {
    var o = { escuela_id: props.escuelaId || '' };
    if (m) o.mapeo = m;
    if (el) o.eleccion = el;
    if (mas) Object.keys(mas).forEach(function (k) { o[k] = mas[k]; });
    return o;
  }

  // Elección inicial: la sugerencia del servidor para cada concepto; lo que el admin ya cambió se respeta.
  function fusionarEleccion(previa, res) {
    var nueva = {};
    (res.conceptos || []).forEach(function (c) {
      if (previa && Object.prototype.hasOwnProperty.call(previa, c.clave)) nueva[c.clave] = previa[c.clave];
      else nueva[c.clave] = c.sugerencia ? c.sugerencia.producto_id : 0;
    });
    return nueva;
  }

  function analizar(f, m, previaEleccion) {
    setCargando(true); setError('');
    return impsalSubir('importar_saldos_analizar', f, extras(m, null)).then(function (res) {
      setCargando(false);
      if (!res.success) { setError(res.error || 'No se pudo analizar el archivo.'); return false; }
      setPlan(res);
      setMapeo(res.mapeo);
      setEleccion(fusionarEleccion(previaEleccion, res));
      setPagina(0);
      if (res.error) setMapeoAbierto(true); // faltan columnas: se abre el mapeo
      return true;
    }).catch(function (e) { setCargando(false); setError(e.message || 'Error de conexión.'); return false; });
  }

  function elegirArchivo(e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    var ext = (f.name.split('.').pop() || '').toLowerCase();
    if (['csv', 'txt', 'xlsx'].indexOf(ext) === -1) { setError(ext === 'xls' ? 'El formato .xls no se puede leer: guárdalo como .xlsx o CSV.' : 'Sube un archivo CSV o XLSX.'); return; }
    if (f.size > 5 * 1024 * 1024) { setError('El archivo pesa más de 5 MB. Divídelo en partes.'); return; }
    setArchivo(f); setPlan(null); setMapeo(null); setEleccion({}); setResultado(null); setMapeoAbierto(false);
    analizar(f, null, null).then(function (ok) { if (ok) setPaso(2); });
  }

  function cambiarColumna(campo, valor) {
    var nuevo = Object.assign({}, mapeo);
    nuevo[campo] = valor === '' ? null : parseInt(valor, 10);
    // El servidor rechaza la misma columna en dos campos: se libera de donde estaba.
    if (nuevo[campo] !== null) Object.keys(nuevo).forEach(function (k) { if (k !== campo && nuevo[k] === nuevo[campo]) nuevo[k] = null; });
    setMapeo(nuevo);
    analizar(archivo, nuevo, eleccion);
  }

  function aplicar() {
    var t = plan.totales;
    setCargando(true); setError('');
    impsalSubir('importar_saldos_aplicar', archivo, extras(mapeo, eleccion, { esperado_cobros: t.a_importar, esperado_monto: t.monto })).then(function (res) {
      setCargando(false);
      if (res.falta_migracion) { setError(res.error); return; }
      setResultado(res);
      if (!res.success && !res.parcial) setError(res.error || 'No se pudo aplicar la importación.');
    }).catch(function (e) { setCargando(false); setError(e.message || 'Error de conexión.'); });
  }

  var t = plan ? plan.totales : null;
  var productosPorId = {};
  ((plan && plan.productos) || []).forEach(function (p) { productosPorId[p.id] = p; });

  // ── Paso 1: archivo ──────────────────────────────────────────────────
  function paso1() {
    return _hIs('div', null,
      _hIs('p', { style: { fontSize: 13.5, marginTop: 0 } },
        'Si tu colegio empieza a usar la plataforma a mitad de ciclo, aquí cargas lo que las familias ',
        _hIs('b', null, 'todavía deben'), ' en un solo archivo. Se crea un cobro pendiente por renglón; ',
        'antes de guardar nada verás una vista previa.'),
      _hIs('div', { style: { padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface)', border: '1px solid var(--border-glow)', fontSize: 12.5, lineHeight: 1.55, marginBottom: 12 } },
        _hIs('b', null, 'Columnas'), ' (se reconocen por su nombre, no importa el orden ni los acentos): ',
        _hIs('b', null, 'Matrícula'), ' (o ', _hIs('b', null, 'Alumno'), '), ', _hIs('b', null, 'Monto'),
        ', y opcionales ', _hIs('b', null, 'Concepto'), ', ', _hIs('b', null, 'Abonado'), ', ', _hIs('b', null, 'Fecha'), ', ',
        _hIs('b', null, 'Vence'), ' y ', _hIs('b', null, 'Folio'), '.',
        _hIs('ul', { style: { margin: '8px 0 0', paddingLeft: 18 } },
          _hIs('li', null, 'Se importa el ', _hIs('b', null, 'saldo pendiente'), ' (monto − abonado). ',
            _hIs('b', null, 'No se importan pagos'), ': no se crean abonos ni aparecen en el corte de caja.'),
          _hIs('li', null, 'Puedes volver a subir el mismo archivo sin miedo: los renglones ya importados se saltan.'),
          _hIs('li', null, 'CSV (UTF-8 o Windows-1252, separado por comas o punto y coma) o XLSX. Hasta 5,000 renglones y 5 MB.'))),
      _hIs('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' } },
        _hIs('label', { className: 'btn btn-primary', style: { cursor: cargando ? 'default' : 'pointer', opacity: cargando ? 0.6 : 1 } },
          _hIs(Icon, { name: 'upload', size: 14, color: 'currentColor' }), cargando ? ' Analizando…' : ' Elegir archivo (CSV o XLSX)',
          _hIs('input', { type: 'file', accept: '.csv,.txt,.xlsx', style: { display: 'none' }, disabled: cargando, onChange: elegirArchivo })),
        _hIs('button', { className: 'btn btn-secondary', onClick: impsalDescargarPlantilla },
          _hIs(Icon, { name: 'download', size: 14, color: 'currentColor' }), ' Descargar plantilla CSV'),
        archivo ? _hIs('span', { style: { fontSize: 12.5, color: 'var(--ink-3)' } }, archivo.name) : null),
      _hIs(ImpSalAviso, { msg: error }));
  }

  // ── Paso 2: revisar y ajustar ────────────────────────────────────────
  function bloqueMapeo() {
    var enc = plan.encabezados || [];
    var opciones = [_hIs('option', { key: '', value: '' }, '— sin columna —')].concat(enc.map(function (h, i) {
      return _hIs('option', { key: i, value: String(i) }, 'Col. ' + (i + 1) + (h ? ': ' + h : ' (sin título)'));
    }));
    var sinReconocer = plan.mapeo_manual ? false : IMPSAL_CAMPOS.some(function (c) { return mapeo[c.id] === null; });
    return _hIs('div', { style: { marginBottom: 14 } },
      _hIs('button', { className: 'btn btn-ghost btn-sm', onClick: function () { setMapeoAbierto(!mapeoAbierto); } },
        (mapeoAbierto ? '▾ ' : '▸ ') + 'Columnas del archivo' + (plan.error ? ' — faltan columnas obligatorias' : (sinReconocer ? ' — ajustar a mano' : ''))),
      mapeoAbierto ? _hIs('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10, marginTop: 8 } },
        IMPSAL_CAMPOS.map(function (c) {
          return _hIs('div', { key: c.id, className: 'form-group', style: { margin: 0 } },
            _hIs('label', { className: 'form-label' }, c.etiqueta),
            _hIs('select', { className: 'form-select', disabled: cargando, value: mapeo[c.id] === null || mapeo[c.id] === undefined ? '' : String(mapeo[c.id]),
              onChange: function (e) { cambiarColumna(c.id, e.target.value); } }, opciones),
            _hIs('div', { style: { fontSize: 11, color: 'var(--ink-4)', marginTop: 2 } }, c.ayuda));
        })) : null);
  }

  function bloqueConceptos() {
    var cs = plan.conceptos || [];
    if (!cs.length) return null;
    var activos = (plan.productos || []).filter(function (p) { return p.activo; });
    return _hIs('div', { style: { marginBottom: 14 } },
      _hIs('div', { style: { fontWeight: 600, fontSize: 13, marginBottom: 4 } }, 'Conceptos del archivo'),
      _hIs('div', { style: { fontSize: 12, color: 'var(--ink-3)', marginBottom: 6 } },
        'Liga cada concepto a uno de tus conceptos de pago para que el cobro herede su IVA y su clave SAT al facturar. ',
        'Con "sin concepto ligado" se factura como cualquier cobro sin concepto.'),
      _hIs('div', { className: 'table-wrap' }, _hIs('table', null,
        _hIs('thead', null, _hIs('tr', null, _hIs('th', null, 'Concepto en el archivo'), _hIs('th', null, 'Renglones'), _hIs('th', null, 'Por importar'), _hIs('th', null, 'Concepto de pago'))),
        _hIs('tbody', null, cs.map(function (c) {
          var val = eleccion[c.clave] ? String(eleccion[c.clave]) : '0';
          return _hIs('tr', { key: c.clave },
            _hIs('td', null, c.concepto),
            _hIs('td', null, c.filas),
            _hIs('td', { style: { fontFamily: 'var(--mono)' } }, impsalMoneda(c.monto)),
            _hIs('td', null,
              _hIs('select', { className: 'form-select', value: val, onChange: function (e) {
                var n = Object.assign({}, eleccion); n[c.clave] = parseInt(e.target.value, 10) || 0; setEleccion(n);
              } },
                _hIs('option', { value: '0' }, 'Sin concepto ligado'),
                activos.map(function (p) { return _hIs('option', { key: p.id, value: String(p.id) }, p.nombre + (p.categoria ? ' (' + p.categoria + ')' : '')); })),
              c.sugerencia ? _hIs('div', { style: { fontSize: 11, color: 'var(--ink-4)', marginTop: 2 } }, 'Sugerido: ' + c.sugerencia.nombre + ' — ' + c.sugerencia.motivo) : null));
        })))));
  }

  function etiquetaEstado(f) {
    if (f.estado === 'ok') return _hIs('span', { className: 'badge badge-green' }, 'Se importa');
    if (f.estado === 'error') return _hIs('span', { className: 'badge badge-red' }, 'Error');
    var txt = f.motivo === 'saldo_cero' ? 'Saldo 0' : (f.motivo === 'repetida' ? 'Repetido' : 'Ya importado');
    return _hIs('span', { className: 'badge badge-gray' }, txt);
  }

  function tablaVista() {
    var filas = (plan.filas || []).filter(function (f) {
      if (filtro === 'importables') return f.estado === 'ok';
      if (filtro === 'errores') return f.estado === 'error';
      if (filtro === 'omitidas') return f.estado === 'omitida';
      if (filtro === 'avisos') return f.estado === 'ok' && f.advertencias.length > 0;
      return true;
    });
    var paginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA));
    var pg = Math.min(pagina, paginas - 1);
    var vista = filas.slice(pg * POR_PAGINA, pg * POR_PAGINA + POR_PAGINA);
    var chip = function (id, txt, n) {
      return _hIs('button', { key: id, className: 'btn btn-sm ' + (filtro === id ? 'btn-primary' : 'btn-secondary'),
        onClick: function () { setFiltro(id); setPagina(0); } }, txt + ' (' + n + ')');
    };
    return _hIs('div', null,
      _hIs('div', { style: { fontWeight: 600, fontSize: 13, marginBottom: 6 } }, 'Vista previa'),
      _hIs('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 } },
        chip('importables', 'Se importan', t.a_importar),
        chip('errores', 'Con error', t.errores),
        chip('omitidas', 'Omitidos', t.saldo_cero + t.repetidas + t.ya_importadas),
        chip('avisos', 'Con advertencias', t.con_advertencias),
        chip('todas', 'Todos', t.filas)),
      vista.length === 0 ? _hIs('div', { style: { padding: '12px 0', color: 'var(--ink-3)', fontSize: 13 } }, 'No hay renglones en esta vista.') :
      _hIs('div', { className: 'table-wrap' }, _hIs('table', null,
        _hIs('thead', null, _hIs('tr', null, ['Fila', 'Alumno', 'Concepto', 'Monto', 'Abonado', 'A importar', 'Emisión', 'Estado'].map(function (h) { return _hIs('th', { key: h }, h); }))),
        _hIs('tbody', null, vista.map(function (f) {
          var p = f.producto_id ? productosPorId[f.producto_id] : null;
          var elegido = f.estado === 'ok' ? productosPorId[eleccion[f.concepto_clave]] : null;
          return _hIs('tr', { key: f.fila },
            _hIs('td', { style: { color: 'var(--ink-4)' } }, f.fila),
            _hIs('td', null,
              f.alumno_nombre ? f.alumno_nombre : _hIs('span', { style: { color: 'var(--ink-3)' } }, f.alumno_archivo || f.matricula || '—'),
              f.alumno_matricula ? _hIs('span', { style: { fontSize: 11, color: 'var(--ink-4)' } }, ' · ' + f.alumno_matricula) : null,
              f.alumno_activo === false ? _hIs('span', { className: 'badge badge-amber', style: { marginLeft: 6 } }, 'inactivo') : null),
            _hIs('td', null, f.concepto, elegido ? _hIs('div', { style: { fontSize: 11, color: 'var(--ink-4)' } }, '→ ' + elegido.nombre) : null),
            _hIs('td', { style: { fontFamily: 'var(--mono)' } }, f.monto_original === null ? '—' : impsalMoneda(f.monto_original)),
            _hIs('td', { style: { fontFamily: 'var(--mono)' } }, f.abonado ? impsalMoneda(f.abonado) : '—'),
            _hIs('td', { style: { fontFamily: 'var(--mono)', fontWeight: 600 } }, f.estado === 'ok' ? impsalMoneda(f.pendiente) : '—'),
            _hIs('td', { style: { fontSize: 12 } }, f.fecha_emision || '—'),
            _hIs('td', null, etiquetaEstado(f),
              f.errores.map(function (m, i) { return _hIs('div', { key: 'e' + i, style: { fontSize: 11.5, color: 'var(--red)', marginTop: 2 } }, m); }),
              f.advertencias.map(function (m, i) { return _hIs('div', { key: 'a' + i, style: { fontSize: 11.5, color: 'var(--amber-dark, var(--amber))', marginTop: 2 } }, m); })));
        })))),
      paginas > 1 ? _hIs('div', { style: { display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', marginTop: 8, fontSize: 12.5 } },
        _hIs('button', { className: 'btn btn-ghost btn-sm', disabled: pg === 0, onClick: function () { setPagina(pg - 1); } }, '‹ Anterior'),
        'Página ' + (pg + 1) + ' de ' + paginas,
        _hIs('button', { className: 'btn btn-ghost btn-sm', disabled: pg >= paginas - 1, onClick: function () { setPagina(pg + 1); } }, 'Siguiente ›')) : null);
  }

  function paso2() {
    if (!plan) return _hIs('div', { style: { padding: 20, color: 'var(--ink-3)' } }, 'Cargando…');
    var a = plan.archivo || {};
    return _hIs('div', null,
      _hIs('div', { style: { fontSize: 12, color: 'var(--ink-3)', marginBottom: 10 } },
        a.nombre + (a.formato ? ' · ' + a.formato.toUpperCase() : '') + (a.codificacion ? ' · ' + a.codificacion : '') + (a.separador ? ' · separador "' + (a.separador === '\t' ? 'tab' : a.separador) + '"' : ''),
        ' · ', _hIs('button', { className: 'btn btn-ghost btn-sm', onClick: function () { setPaso(1); setPlan(null); } }, 'Cambiar archivo')),
      _hIs('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 } },
        _hIs(ImpSalTotal, { etiqueta: 'Renglones', valor: t.filas }),
        _hIs(ImpSalTotal, { etiqueta: 'Se importan', valor: t.a_importar, color: 'var(--green-dark, var(--green))', sub: t.alumnos + ' alumno(s)' }),
        _hIs(ImpSalTotal, { etiqueta: 'Saldo a importar', valor: impsalMoneda(t.monto), sub: t.abonado ? 'ya abonado: ' + impsalMoneda(t.abonado) : null }),
        _hIs(ImpSalTotal, { etiqueta: 'Con error', valor: t.errores, color: t.errores ? 'var(--red)' : 'inherit', sub: 'no se importan' }),
        _hIs(ImpSalTotal, { etiqueta: 'Omitidos', valor: t.saldo_cero + t.repetidas + t.ya_importadas,
          sub: t.saldo_cero + ' en 0 · ' + t.repetidas + ' repetidos · ' + t.ya_importadas + ' ya importados' })),
      t.inactivos ? _hIs(ImpSalAviso, { tipo: 'aviso', msg: t.inactivos + ' alumno(s) inactivo(s) (baja, egreso o traslado): su adeudo se importa igual y puede cobrarse a mano.' }) : null,
      plan.error ? _hIs(ImpSalAviso, { msg: plan.error }) : null,
      cargando ? _hIs('div', { style: { fontSize: 12.5, color: 'var(--ink-3)', margin: '6px 0' } }, 'Actualizando vista previa…') : null,
      bloqueMapeo(),
      bloqueConceptos(),
      plan.error ? null : tablaVista(),
      _hIs(ImpSalAviso, { msg: error }));
  }

  // ── Paso 3: aplicar ──────────────────────────────────────────────────
  function paso3() {
    if (resultado && (resultado.success || resultado.parcial)) {
      return _hIs('div', null,
        _hIs(ImpSalAviso, { tipo: resultado.success ? 'ok' : 'aviso',
          msg: resultado.success
            ? 'Listo: se crearon ' + resultado.cobros_creados + ' cobro(s) pendientes por ' + impsalMoneda(resultado.monto_total) + ' (importación #' + resultado.importacion_id + ').'
            : 'La importación se detuvo a medias: se crearon ' + resultado.cobros_creados + ' cobro(s) (importación #' + resultado.importacion_id + '). ' + resultado.error }),
        _hIs('p', { style: { fontSize: 13 } },
          resultado.omitidas ? resultado.omitidas + ' renglón(es) no se importaron (errores, saldo 0, repetidos o ya importados). ' : '',
          'Actualiza la pantalla para ver los saldos nuevos. Si te equivocaste, puedes deshacer la importación desde la pestaña "Importaciones" mientras ningún cobro tenga pagos.'),
        _hIs('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
          _hIs('button', { className: 'btn btn-primary', onClick: function () { window.location.reload(); } }, 'Actualizar pantalla'),
          _hIs('button', { className: 'btn btn-secondary', onClick: props.onVerHistorial }, 'Ver importaciones')));
    }
    return _hIs('div', null,
      _hIs('p', { style: { fontSize: 14, marginTop: 0 } }, 'Se van a crear ', _hIs('b', null, t.a_importar + ' cobro(s) pendientes'), ' por ', _hIs('b', null, impsalMoneda(t.monto)),
        ' para ' + t.alumnos + ' alumno(s).'),
      _hIs('ul', { style: { fontSize: 13, lineHeight: 1.6 } },
        _hIs('li', null, 'Cada cobro dice "Saldo inicial importado (original $X, abonado $Y)" en el historial de la importación.'),
        _hIs('li', null, _hIs('b', null, 'No se registran pagos'), ' (abonos): lo que ya pagaron las familias se descuenta del monto pero no aparece en el corte de caja ni genera complementos de pago.'),
        t.errores + t.saldo_cero + t.repetidas + t.ya_importadas > 0 ? _hIs('li', null, (t.errores + t.saldo_cero + t.repetidas + t.ya_importadas) + ' renglón(es) no se importarán (con error, saldo 0, repetidos o ya importados).') : null,
        _hIs('li', null, 'Podrás deshacerla mientras ninguno de estos cobros haya recibido un pago.')),
      resultado && !resultado.success ? _hIs(ImpSalAviso, { msg: resultado.error }) : null,
      _hIs(ImpSalAviso, { msg: error }));
  }

  // ── Pie ──────────────────────────────────────────────────────────────
  var terminado = resultado && (resultado.success || resultado.parcial);
  var puedeAplicar = plan && !plan.error && t && t.a_importar > 0 && !cargando;
  var pie = _hIs('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%', flexWrap: 'wrap' } },
    paso === 3 && !terminado ? _hIs('button', { className: 'btn btn-secondary', disabled: cargando, onClick: function () { setPaso(2); setResultado(null); setError(''); } }, '‹ Volver a revisar') : null,
    _hIs('button', { className: 'btn btn-secondary', disabled: cargando, onClick: props.onCerrar }, terminado ? 'Cerrar' : 'Cancelar'),
    paso === 2 ? _hIs('button', { className: 'btn btn-primary', disabled: !puedeAplicar, onClick: function () { setPaso(3); setError(''); } },
      plan && t && t.a_importar > 0 ? 'Continuar: importar ' + t.a_importar + ' cobro(s) ›' : 'Nada que importar') : null,
    paso === 3 && !terminado ? _hIs('button', { className: 'btn btn-primary', disabled: cargando, onClick: aplicar }, cargando ? 'Creando cobros…' : 'Crear ' + t.a_importar + ' cobro(s)') : null);

  return { cuerpo: _hIs('div', null, _hIs(ImpSalPasos, { paso: paso }), paso === 1 ? paso1() : (paso === 2 ? paso2() : paso3())), pie: pie, bloqueado: cargando };
}

// ════════════════════════════════════════════════════════════════════════
//  HISTORIAL (pestaña "Importaciones")
// ════════════════════════════════════════════════════════════════════════

function ImpSalHistorial(props) {
  var R = React;
  var s;
  var s = R.useState(null), res = s[0], setRes = s[1];
  var s = R.useState(''), error = s[0], setError = s[1];
  var s = R.useState(null), detalleId = s[0], setDetalleId = s[1];
  var s = R.useState(null), detalle = s[0], setDetalle = s[1];
  var s = R.useState(null), confirmar = s[0], setConfirmar = s[1];
  var s = R.useState(false), ocupado = s[0], setOcupado = s[1];
  var s = R.useState(null), bloqueo = s[0], setBloqueo = s[1];
  var s = R.useState(''), exito = s[0], setExito = s[1];

  function cargar() {
    return ApiClient.post('importar_saldos_listar', { escuela_id: props.escuelaId || undefined }).then(function (r) {
      if (!r.success) { setError(r.error || 'No se pudo cargar el historial.'); setRes({ importaciones: [] }); return; }
      setRes(r);
    }).catch(function (e) { setError(e.message); setRes({ importaciones: [] }); });
  }
  R.useEffect(function () { cargar(); }, [props.escuelaId]);

  function verDetalle(id) {
    if (detalleId === id) { setDetalleId(null); setDetalle(null); return; }
    setDetalleId(id); setDetalle(null);
    ApiClient.post('importar_saldos_listar', { escuela_id: props.escuelaId || undefined, importacion_id: id }).then(function (r) {
      if (r.success) setDetalle(r.detalle || []); else setError(r.error || 'No se pudo cargar el detalle.');
    }).catch(function (e) { setError(e.message); });
  }

  function deshacer(id) {
    setOcupado(true); setError(''); setBloqueo(null); setExito('');
    ApiClient.post('importar_saldos_deshacer', { importacion_id: id, escuela_id: props.escuelaId || undefined }).then(function (r) {
      setOcupado(false); setConfirmar(null);
      if (!r.success) { setError(r.error || 'No se pudo deshacer.'); if (r.bloqueantes) setBloqueo(r); cargar(); return; }
      setExito('Importación #' + id + ' deshecha: ' + r.cobros_cancelados + ' cobro(s) cancelados por ' + impsalMoneda(r.monto) + '. Actualiza la pantalla para ver los saldos.');
      cargar();
    }).catch(function (e) { setOcupado(false); setConfirmar(null); setError(e.message); });
  }

  var lista = (res && res.importaciones) || [];
  return _hIs('div', null,
    res === null ? _hIs('div', { style: { padding: '16px 0', color: 'var(--ink-3)', fontSize: 13 } }, 'Cargando…') : null,
    res && res.falta_migracion ? _hIs(ImpSalAviso, { msg: res.aviso }) : null,
    res && !res.falta_migracion && lista.length === 0 ? _hIs('div', { style: { padding: '14px 0', color: 'var(--ink-3)', fontSize: 13 } }, 'Todavía no hay importaciones.') : null,
    lista.length ? _hIs('div', { className: 'table-wrap' }, _hIs('table', null,
      _hIs('thead', null, _hIs('tr', null, ['#', 'Fecha', 'Archivo', 'Usuario', 'Cobros', 'Monto', 'Estado', ''].map(function (h, i) { return _hIs('th', { key: i }, h); }))),
      _hIs('tbody', null, lista.map(function (i) {
        var filas = [_hIs('tr', { key: i.id },
          _hIs('td', null, i.id),
          _hIs('td', { style: { fontSize: 12 } }, impsalFechaHora(i.creado_en)),
          _hIs('td', null, i.archivo_nombre || '—'),
          _hIs('td', null, i.usuario || '—'),
          _hIs('td', null, i.cobros_creados, _hIs('span', { style: { fontSize: 11, color: 'var(--ink-4)' } }, i.omitidas ? ' (+' + i.omitidas + ' omitidos)' : '')),
          _hIs('td', { style: { fontFamily: 'var(--mono)' } }, impsalMoneda(i.monto_total)),
          _hIs('td', null,
            _hIs('span', { className: 'badge ' + (i.estado === 'aplicada' ? 'badge-green' : 'badge-gray') }, i.estado === 'aplicada' ? 'Aplicada' : 'Deshecha'),
            i.estado === 'deshecha' && i.deshecha_en ? _hIs('div', { style: { fontSize: 11, color: 'var(--ink-4)' } }, impsalFechaHora(i.deshecha_en) + (i.deshecha_por ? ' · ' + i.deshecha_por : '')) : null,
            i.estado === 'aplicada' && i.cobros_con_pagos ? _hIs('div', { style: { fontSize: 11, color: 'var(--amber-dark, var(--amber))' } }, i.cobros_con_pagos + ' cobro(s) ya con pagos') : null),
          _hIs('td', { style: { whiteSpace: 'nowrap' } },
            _hIs('button', { className: 'btn btn-ghost btn-sm', onClick: function () { verDetalle(i.id); } }, detalleId === i.id ? 'Ocultar' : 'Detalle'),
            i.estado === 'aplicada' ? _hIs('button', { className: 'btn btn-ghost btn-sm', style: i.puede_deshacer ? { color: 'var(--red)' } : null,
              disabled: ocupado || (!i.puede_deshacer && !i.cobros_con_pagos), title: i.puede_deshacer ? 'Cancela los cobros de esta importación' : 'Ya hay cobros con pagos: pulsa para ver cuáles',
              onClick: function () { setError(''); setBloqueo(null); setExito(''); if (i.puede_deshacer) setConfirmar(i.id); else deshacer(i.id); } }, 'Deshacer') : null))];
        if (confirmar === i.id) {
          filas.push(_hIs('tr', { key: i.id + 'c' }, _hIs('td', { colSpan: 8 },
            _hIs('div', { style: { padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--red-glow)', fontSize: 13 } },
              '¿Deshacer la importación #' + i.id + '? Se cancelarán sus ' + i.cobros_creados + ' cobro(s) con el motivo "Importación deshecha" y se recalcularán los saldos. ',
              _hIs('div', { style: { marginTop: 8, display: 'flex', gap: 8 } },
                _hIs('button', { className: 'btn btn-secondary btn-sm', disabled: ocupado, onClick: function () { setConfirmar(null); } }, 'No'),
                _hIs('button', { className: 'btn btn-primary btn-sm', disabled: ocupado, onClick: function () { deshacer(i.id); } }, ocupado ? 'Deshaciendo…' : 'Sí, deshacer'))))));
        }
        if (detalleId === i.id) {
          filas.push(_hIs('tr', { key: i.id + 'd' }, _hIs('td', { colSpan: 8 },
            detalle === null ? _hIs('div', { style: { padding: 8, color: 'var(--ink-3)', fontSize: 12.5 } }, 'Cargando…') :
            _hIs('div', { className: 'table-wrap' }, _hIs('table', null,
              _hIs('thead', null, _hIs('tr', null, ['Fila', 'Folio', 'Alumno', 'Concepto', 'Original', 'Abonado', 'Pendiente', 'Cobro', 'Pagado'].map(function (h) { return _hIs('th', { key: h }, h); }))),
              _hIs('tbody', null, detalle.map(function (d, k) {
                return _hIs('tr', { key: k },
                  _hIs('td', null, d.fila), _hIs('td', null, d.folio, d.folio_externo ? _hIs('span', { style: { fontSize: 11, color: 'var(--ink-4)' } }, ' · ext. ' + d.folio_externo) : null),
                  _hIs('td', null, d.alumno), _hIs('td', null, d.concepto),
                  _hIs('td', { style: { fontFamily: 'var(--mono)' } }, impsalMoneda(d.monto_original)),
                  _hIs('td', { style: { fontFamily: 'var(--mono)' } }, impsalMoneda(d.abonado)),
                  _hIs('td', { style: { fontFamily: 'var(--mono)' } }, impsalMoneda(d.pendiente)),
                  _hIs('td', null, d.deshecha ? 'deshecho' : d.cobro_estado),
                  _hIs('td', { style: { fontFamily: 'var(--mono)' } }, d.pagado ? impsalMoneda(d.pagado) : '—'));
              }))),
              _hIs('div', { style: { fontSize: 11, color: 'var(--ink-4)', padding: '4px 0' } }, 'Se muestran hasta 500 renglones.')))));
        }
        return filas;
      })))) : null,
    bloqueo && bloqueo.bloqueantes ? _hIs('div', { style: { marginTop: 10, fontSize: 12.5 } },
      _hIs('b', null, 'Cobros que ya recibieron pagos (' + bloqueo.total_bloqueantes + '):'),
      _hIs('ul', { style: { margin: '4px 0 0', paddingLeft: 18 } }, bloqueo.bloqueantes.map(function (b) {
        return _hIs('li', { key: b.cobro_id }, b.folio + ' — ' + (b.alumno || 'alumno') + ': ' + b.motivo);
      })),
      _hIs('div', { style: { color: 'var(--ink-3)', marginTop: 4 } }, 'Para corregirlos, cancela cada cobro a mano desde Cobros (con su motivo).')) : null,
    _hIs(ImpSalAviso, { msg: exito, tipo: 'ok' }),
    _hIs(ImpSalAviso, { msg: error }));
}

// ════════════════════════════════════════════════════════════════════════
//  CONTENEDOR
// ════════════════════════════════════════════════════════════════════════

function ImportarSaldos(props) {
  var R = React;
  var s = R.useState('importar'), tab = s[0], setTab = s[1];
  // El asistente devuelve {cuerpo, pie, bloqueado} (es una función que usa hooks: debe llamarse siempre,
  // aunque la pestaña activa sea el historial, para no perder el estado del archivo al cambiar de pestaña).
  var a = ImpSalAsistente({ escuelaId: props.escuelaId, onCerrar: props.onCerrar, onVerHistorial: function () { setTab('historial'); } });

  var tabBtn = function (id, txt) {
    return _hIs('button', { key: id, className: 'btn btn-sm ' + (tab === id ? 'btn-primary' : 'btn-secondary'), onClick: function () { setTab(id); } }, txt);
  };
  return _hIs(ImpSalModal, {
    titulo: 'Importar adeudos', ancho: 1040, onCerrar: props.onCerrar, bloqueado: a.bloqueado,
    sub: 'Saldos iniciales de familias que ya deben algo al empezar a usar la plataforma',
    footer: tab === 'importar' ? a.pie : _hIs('button', { className: 'btn btn-secondary', onClick: props.onCerrar }, 'Cerrar')
  },
    _hIs('div', { style: { display: 'flex', gap: 6, marginBottom: 12 } }, tabBtn('importar', 'Importar'), tabBtn('historial', 'Importaciones')),
    tab === 'importar' ? a.cuerpo : _hIs(ImpSalHistorial, { escuelaId: props.escuelaId }));
}
