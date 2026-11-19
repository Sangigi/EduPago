/* views/Diagnostico.js — Diagnóstico de la plataforma (superadmin y soporte). [OF-4a]
 *
 * DOS PESTAÑAS
 *
 *  · Incoherencias (superadmin y soporte). SOLO LECTURA. Compara las cifras que
 *    el sistema guarda por duplicado (saldo del alumno vs. sus cobros, monto
 *    pagado vs. abonos, monedero vs. su libro...) y lista lo que no cuadra, con
 *    hasta 20 ejemplos por regla. No corrige nada: decidir qué cifra es la
 *    buena es trabajo de una persona. Es una consulta pesada en bases grandes,
 *    así que se corre a petición ("Revisar ahora"), no al abrir la pantalla.
 *    Ver lib/helpers_diagnostico.php.
 *
 *  · Base de datos (SOLO superadmin). Estado de las migraciones y botón para
 *    aplicar las pendientes. Ver lib/migraciones.php y
 *    docs/mejoras-of/of4-migraciones.md. Un ALTER sobre una tabla grande la
 *    bloquea mientras corre: por eso pide confirmación y se recomienda hacerlo
 *    fuera de horario de cobro (o por línea de comandos: herramientas/migrar.php).
 *
 * AvisoMigraciones es el aviso que ve el superadmin en cualquier pantalla
 * cuando quedan pasos sin aplicar (lo monta app.js).
 */
var _hDG = React.createElement;

var DG_SEVERIDAD = {
  alta:  { label: 'Alta',  clase: 'badge-red' },
  media: { label: 'Media', clase: 'badge-amber' },
  baja:  { label: 'Baja',  clase: 'badge-gray' },
};

var DG_ESTADO_PASO = {
  aplicada:      { label: 'Aplicada',     clase: 'badge-green' },
  ya_existia:    { label: 'Ya existía',   clase: 'badge-blue' },
  pendiente:     { label: 'Pendiente',    clase: 'badge-amber' },
  por_registrar: { label: 'Por anotar',   clase: 'badge-gray' },
  bloqueada:     { label: 'Bloqueada',    clase: 'badge-red' },
};

var DG_RESULTADO = {
  aplicada:   { label: 'Aplicada',   clase: 'badge-green' },
  ya_existia: { label: 'Ya existía', clase: 'badge-blue' },
  aviso:      { label: 'Aviso',      clase: 'badge-amber' },
  error:      { label: 'Error',      clase: 'badge-red' },
};

// Encabezados de las columnas de los ejemplos (lo que no esté aquí se muestra tal cual).
var DG_COLUMNAS = {
  id: 'ID', escuela: 'Colegio', folio: 'Folio', nombre: 'Nombre', estado: 'Estado', fecha: 'Fecha',
  total: 'Total', monto_pagado: 'Pagado', registrado: 'Registrado', esperado: 'Debería ser',
  monto: 'Monto', monto_recibido: 'Recibido', cobro_id: 'Cobro', cliente_id: 'Alumno (id)',
  sucursal_id: 'Sucursal', usuario_id: 'Usuario', fecha_apertura: 'Abierta desde', creado_en: 'Creado',
  canal: 'Canal', motivo: 'Motivo', activo: 'Activo', estatus: 'Estatus', alumno: 'Alumno',
};
var DG_DINERO = { total: 1, monto_pagado: 1, registrado: 1, esperado: 1, monto: 1, monto_recibido: 1 };

function dgPedir(accion, cuerpo) {
  return fetch('api.php?action=' + accion, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + (AuthController.getToken() || '')
    },
    body: JSON.stringify(cuerpo || {}),
  }).then(function (r) { return r.json(); }).catch(function () { return null; });
}

function dgFmt(n) { return '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 }); }

function dgStat(label, valor, color) {
  return _hDG('div', {
    key: label,
    style: {
      flex: '1 1 150px', padding: '12px 14px', borderRadius: 'var(--radius)',
      background: 'var(--glass-light)', border: '1px solid var(--border-glow)'
    }
  },
    _hDG('div', { style: { fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 4 } }, label),
    _hDG('div', { style: { fontSize: 20, fontWeight: 700, color: color || 'var(--ink)' } }, valor)
  );
}

// ════════════════════════════════════════════════════════════════════════
// Aviso para el superadmin (se monta en app.js, encima del contenido)
// ════════════════════════════════════════════════════════════════════════

// Se consulta una vez cada 5 minutos como máximo (cambiar de pantalla remonta el
// contenido, y no hay por qué leer information_schema en cada clic).
var DG_AVISO_CACHE = { t: 0, pendientes: 0 };

function AvisoMigraciones(props) {
  var _R = React;
  var s = _R.useState(DG_AVISO_CACHE.pendientes); var pendientes = s[0], setPendientes = s[1];

  _R.useEffect(function () {
    var vivo = true;
    if (Date.now() - DG_AVISO_CACHE.t < 300000) { setPendientes(DG_AVISO_CACHE.pendientes); return; }
    dgPedir('migraciones_estado', {}).then(function (r) {
      if (!vivo || !r || !r.success) return;
      DG_AVISO_CACHE = { t: Date.now(), pendientes: r.pendientes || 0 };
      setPendientes(r.pendientes || 0);
    });
    return function () { vivo = false; };
  }, []);

  if (!pendientes) return null;
  return _hDG('div', {
    style: {
      display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
      padding: '10px 14px', marginBottom: 16, borderRadius: 'var(--radius)',
      background: 'var(--amber-glow, var(--glass-light))', border: '1px solid var(--amber)'
    }
  },
    _hDG('div', { style: { flex: '1 1 260px', fontSize: 13, color: 'var(--ink)' } },
      _hDG('strong', {}, 'Base de datos: '),
      pendientes + (pendientes === 1 ? ' cambio pendiente' : ' cambios pendientes') +
      ' por aplicar. Aplícalos fuera de horario de cobro.'),
    _hDG('button', { className: 'btn btn-secondary btn-sm', onClick: props.onIr }, 'Ver y aplicar')
  );
}

// ════════════════════════════════════════════════════════════════════════
// Pestaña: Incoherencias
// ════════════════════════════════════════════════════════════════════════

function DgReglaCard(props) {
  var r = props.regla;
  var sev = DG_SEVERIDAD[r.severidad] || DG_SEVERIDAD.baja;
  var _R = React;
  var s = _R.useState(false); var abierta = s[0], setAbierta = s[1];

  var estado;
  if (!r.disponible) estado = _hDG('span', { className: 'badge badge-gray' }, 'No disponible');
  else if (r.total === 0) estado = _hDG('span', { className: 'badge badge-green' }, 'Sin hallazgos');
  else estado = _hDG('span', { className: 'badge ' + sev.clase }, r.total + (r.total === 1 ? ' hallazgo' : ' hallazgos'));

  var columnas = [];
  if (r.ejemplos && r.ejemplos.length) {
    columnas = Object.keys(r.ejemplos[0]).filter(function (k) { return k !== 'escuela_id'; });
    // El colegio, justo después del id.
    columnas.sort(function (a, b) { return (a === 'escuela' ? 1 : 0) - (b === 'escuela' ? 1 : 0); });
  }
  var celda = function (fila, k) {
    var v = fila[k];
    if (v === null || v === undefined || v === '') return '—';
    if (DG_DINERO[k]) return dgFmt(v);
    if (k === 'escuela') return v + (fila.escuela_id ? ' (#' + fila.escuela_id + ')' : '');
    return String(v);
  };

  var hayDetalle = r.disponible && r.total > 0;
  return _hDG('div', { className: 'card', style: { marginBottom: 12 } },
    _hDG('div', {
      className: 'card-header',
      style: { cursor: hayDetalle ? 'pointer' : 'default', alignItems: 'flex-start', gap: 10 },
      onClick: function () { if (hayDetalle) setAbierta(!abierta); }
    },
      _hDG('div', { style: { minWidth: 0 } },
        _hDG('div', { className: 'card-title', style: { fontSize: 14 } }, r.titulo),
        _hDG('div', { className: 'card-sub' }, r.problema)
      ),
      _hDG('div', { style: { display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' } },
        hayDetalle ? _hDG('span', { className: 'badge ' + sev.clase, style: { opacity: 0.85 } }, 'Gravedad ' + sev.label.toLowerCase()) : null,
        estado)
    ),
    !r.disponible ? _hDG('div', { style: { fontSize: 12, color: 'var(--ink-3)' } }, r.error || 'No disponible en esta base.') : null,
    r.nota ? _hDG('div', { style: { fontSize: 11.5, color: 'var(--ink-4)', marginBottom: hayDetalle ? 8 : 0 } }, r.nota) : null,
    hayDetalle && abierta ? _hDG('div', {},
      _hDG('div', { className: 'table-wrap' },
        _hDG('table', {},
          _hDG('thead', {}, _hDG('tr', {}, columnas.map(function (k) {
            return _hDG('th', { key: k, style: DG_DINERO[k] ? { textAlign: 'right' } : undefined }, DG_COLUMNAS[k] || k);
          }))),
          _hDG('tbody', {}, r.ejemplos.map(function (fila, i) {
            return _hDG('tr', { key: i }, columnas.map(function (k) {
              return _hDG('td', {
                key: k,
                style: DG_DINERO[k] || k === 'id' ? { fontFamily: 'var(--mono)', textAlign: DG_DINERO[k] ? 'right' : 'left', whiteSpace: 'nowrap' } : undefined
              }, celda(fila, k));
            }));
          }))
        )
      ),
      r.total > r.ejemplos.length
        ? _hDG('div', { style: { fontSize: 11.5, color: 'var(--ink-4)', marginTop: 8 } },
            'Se muestran ' + r.ejemplos.length + ' de ' + r.total + '. Filtra por colegio para ver el resto por partes.')
        : null
    ) : null,
    hayDetalle && !abierta ? _hDG('div', { style: { fontSize: 12, color: 'var(--ink-3)' } }, 'Toca el título para ver los ejemplos.') : null
  );
}

function DgIncoherencias(props) {
  var _R = React;
  var e1 = _R.useState('');    var escId = e1[0], setEscId = e1[1];
  var e2 = _R.useState(null);  var res = e2[0], setRes = e2[1];
  var e3 = _R.useState(false); var cargando = e3[0], setCargando = e3[1];
  var e4 = _R.useState('');    var error = e4[0], setError = e4[1];

  var escuelas = (props.data && props.data.escuelas ? props.data.escuelas : []).filter(function (e) { return !e.es_plantel; });

  var correr = function () {
    setCargando(true); setError('');
    dgPedir('diagnostico_incoherencias', escId ? { escuela_id: Number(escId) } : {}).then(function (r) {
      setCargando(false);
      if (!r || !r.success) { setError((r && r.error) || 'No se pudo correr el diagnóstico.'); return; }
      setRes(r);
    });
  };

  return _hDG('div', {},
    _hDG('div', { className: 'card', style: { marginBottom: 16 } },
      _hDG('div', { className: 'card-header' },
        _hDG('div', {},
          _hDG('div', { className: 'card-title' }, 'Incoherencias de datos'),
          _hDG('div', { className: 'card-sub' },
            'Cifras que el sistema guarda por duplicado y que no cuadran. Solo lectura: no corrige nada.')
        )
      ),
      _hDG('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' } },
        _hDG('select', {
          className: 'form-select', style: { maxWidth: 320 }, value: escId,
          onChange: function (e) { setEscId(e.target.value); }
        },
          _hDG('option', { value: '' }, 'Toda la plataforma'),
          escuelas.map(function (e) { return _hDG('option', { key: e.id, value: e.id }, e.nombre); })
        ),
        _hDG('button', { className: 'btn btn-primary', disabled: cargando, onClick: correr },
          cargando ? 'Revisando…' : (res ? 'Revisar de nuevo' : 'Revisar ahora'))
      ),
      !res && !cargando && !error ? _hDG('div', { style: { fontSize: 12, color: 'var(--ink-4)', marginTop: 10 } },
        'En bases grandes la revisión tarda unos segundos. Por colegio es más rápida.') : null
    ),

    error ? _hDG('div', { style: { padding: '10px 14px', marginBottom: 16, borderRadius: 'var(--radius)', border: '1px solid var(--red)', color: 'var(--red)', fontSize: 13 } }, error) : null,

    res ? _hDG('div', {},
      _hDG('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 } },
        dgStat('Reglas revisadas', res.reglas.length),
        dgStat('Con hallazgos', res.con_hallazgos, res.con_hallazgos > 0 ? 'var(--red)' : 'var(--green)'),
        dgStat('No disponibles', res.no_disponibles, res.no_disponibles > 0 ? 'var(--amber)' : undefined),
        dgStat('Revisado', String(res.generado_en || '').slice(11, 19))
      ),
      // Primero lo que tiene hallazgos (por gravedad), luego lo limpio, al final lo no disponible.
      res.reglas.slice().sort(function (a, b) {
        var rango = function (r) { return !r.disponible ? 2000 : (r.total > 0 ? ({ alta: 0, media: 1, baja: 2 }[r.severidad] || 3) : 1000); };
        return rango(a) - rango(b);
      }).map(function (r) { return _hDG(DgReglaCard, { key: r.id, regla: r }); })
    ) : null
  );
}

// ════════════════════════════════════════════════════════════════════════
// Pestaña: Base de datos (solo superadmin)
// ════════════════════════════════════════════════════════════════════════

function DgBaseDatos() {
  var _R = React;
  var s1 = _R.useState(null);  var estado = s1[0], setEstado = s1[1];
  var s2 = _R.useState(true);  var cargando = s2[0], setCargando = s2[1];
  var s3 = _R.useState('');    var error = s3[0], setError = s3[1];
  var s4 = _R.useState(false); var confirmar = s4[0], setConfirmar = s4[1];
  var s5 = _R.useState(false); var aplicando = s5[0], setAplicando = s5[1];
  var s6 = _R.useState(null);  var resultado = s6[0], setResultado = s6[1];
  var s7 = _R.useState(false); var verTodo = s7[0], setVerTodo = s7[1];

  var cargar = function () {
    setCargando(true); setError('');
    dgPedir('migraciones_estado', {}).then(function (r) {
      setCargando(false);
      if (!r || !r.success) { setError((r && r.error) || 'No se pudo leer el estado de la base de datos.'); return; }
      setEstado(r);
      DG_AVISO_CACHE = { t: Date.now(), pendientes: r.pendientes || 0 };
    });
  };
  _R.useEffect(function () { cargar(); }, []);

  var aplicar = function () {
    setConfirmar(false); setAplicando(true); setError(''); setResultado(null);
    dgPedir('migraciones_aplicar', { confirmar: true }).then(function (r) {
      setAplicando(false);
      if (!r) { setError('Sin respuesta del servidor. Revisa el estado antes de reintentar: puede haberse aplicado en parte.'); cargar(); return; }
      setResultado(r.resultado || null);
      if (!r.success) setError(r.error || 'No se pudieron aplicar las migraciones.');
      if (r.pasos) {
        setEstado({ success: true, pasos: r.pasos, pendientes: r.pendientes, por_registrar: r.por_registrar, bloqueadas: r.bloqueadas, total: r.total });
        DG_AVISO_CACHE = { t: Date.now(), pendientes: r.pendientes || 0 };
      } else { cargar(); }
    });
  };

  if (cargando && !estado) return _hDG('div', { style: { padding: 30, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 } }, 'Cargando…');

  var pasos = (estado && estado.pasos) || [];
  var pendientes = estado ? estado.pendientes : 0;
  var visibles = pasos.filter(function (p) {
    return verTodo || p.estado === 'pendiente' || p.estado === 'bloqueada';
  });
  var porAnotar = estado ? estado.por_registrar : 0;

  return _hDG('div', {},
    _hDG('div', { className: 'card', style: { marginBottom: 16 } },
      _hDG('div', { className: 'card-header' },
        _hDG('div', {},
          _hDG('div', { className: 'card-title' }, 'Base de datos'),
          _hDG('div', { className: 'card-sub' },
            'Migraciones del esquema. Despliegue: git pull y luego "Aplicar pendientes" (en lugar de pegar SQL en phpMyAdmin).')
        ),
        _hDG('button', { className: 'btn btn-secondary btn-sm', disabled: cargando || aplicando, onClick: cargar }, cargando ? 'Leyendo…' : 'Volver a leer')
      ),
      estado ? _hDG('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 } },
        dgStat('Pasos registrados', estado.total),
        dgStat('Pendientes', pendientes, pendientes > 0 ? 'var(--amber)' : 'var(--green)'),
        dgStat('Bloqueados', estado.bloqueadas || 0, estado.bloqueadas > 0 ? 'var(--red)' : undefined),
        dgStat('Por anotar', porAnotar)
      ) : null,
      pendientes > 0
        ? _hDG('div', { style: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' } },
            _hDG('button', { className: 'btn btn-primary', disabled: aplicando, onClick: function () { setConfirmar(true); } },
              aplicando ? 'Aplicando…' : 'Aplicar pendientes (' + pendientes + ')'),
            _hDG('span', { style: { fontSize: 12, color: 'var(--ink-3)' } },
              'Un cambio sobre una tabla grande la bloquea mientras corre. Mejor fuera de horario de cobro, o por SSH: php herramientas/migrar.php --aplicar')
          )
        : _hDG('div', { style: { fontSize: 13, color: 'var(--ink-2)' } },
            porAnotar > 0
              ? 'La base está al día. ' + porAnotar + ' paso(s) ya existían y solo falta anotarlos (no cambia nada): "Aplicar pendientes" no aparece porque no hay trabajo real; corre php herramientas/migrar.php --aplicar una vez para dejarlos registrados.'
              : 'La base está al día.')
    ),

    error ? _hDG('div', { style: { padding: '10px 14px', marginBottom: 16, borderRadius: 'var(--radius)', border: '1px solid var(--red)', color: 'var(--red)', fontSize: 13 } }, error) : null,

    resultado ? _hDG('div', { className: 'card', style: { marginBottom: 16 } },
      _hDG('div', { className: 'card-header' },
        _hDG('div', {},
          _hDG('div', { className: 'card-title' }, 'Resultado de esta corrida'),
          _hDG('div', { className: 'card-sub' },
            resultado.aplicadas + ' aplicada(s) · ' + resultado.ya_existian + ' ya existían · ' + resultado.avisos + ' aviso(s) · ' + resultado.duracion_ms + ' ms')
        )
      ),
      resultado.pasos.length === 0
        ? _hDG('div', { style: { fontSize: 12.5, color: 'var(--ink-3)' } }, 'No había nada que hacer.')
        : _hDG('div', { className: 'table-wrap' }, _hDG('table', {},
            _hDG('thead', {}, _hDG('tr', {},
              _hDG('th', {}, 'Paso'), _hDG('th', {}, 'Resultado'), _hDG('th', {}, 'Detalle'), _hDG('th', { style: { textAlign: 'right' } }, 'ms'))),
            _hDG('tbody', {}, resultado.pasos.map(function (p) {
              var b = DG_RESULTADO[p.resultado] || { label: p.resultado, clase: 'badge-gray' };
              return _hDG('tr', { key: p.id },
                _hDG('td', { style: { fontFamily: 'var(--mono)', fontSize: 11.5, wordBreak: 'break-all' } }, p.id),
                _hDG('td', {}, _hDG('span', { className: 'badge ' + b.clase }, b.label)),
                _hDG('td', { style: { fontSize: 12 } }, p.detalle || '—'),
                _hDG('td', { style: { textAlign: 'right', fontFamily: 'var(--mono)' } }, p.duracion_ms));
            }))
          ))
    ) : null,

    estado ? _hDG('div', { className: 'card' },
      _hDG('div', { className: 'card-header' },
        _hDG('div', {},
          _hDG('div', { className: 'card-title' }, verTodo ? 'Todos los pasos' : 'Pasos pendientes')),
        _hDG('button', { className: 'btn btn-ghost btn-sm', onClick: function () { setVerTodo(!verTodo); } },
          verTodo ? 'Solo pendientes' : 'Ver todos (' + pasos.length + ')')
      ),
      visibles.length === 0
        ? _hDG('div', { style: { fontSize: 12.5, color: 'var(--ink-3)' } }, 'No hay pasos pendientes.')
        : _hDG('div', { className: 'table-wrap' }, _hDG('table', {},
            _hDG('thead', {}, _hDG('tr', {},
              _hDG('th', {}, 'Paso'), _hDG('th', {}, 'Qué hace'), _hDG('th', {}, 'Estado'), _hDG('th', {}, 'Aplicado'))),
            _hDG('tbody', {}, visibles.map(function (p) {
              var b = DG_ESTADO_PASO[p.estado] || { label: p.estado, clase: 'badge-gray' };
              return _hDG('tr', { key: p.id },
                _hDG('td', { style: { fontFamily: 'var(--mono)', fontSize: 11.5, wordBreak: 'break-all' } }, p.id),
                _hDG('td', { style: { fontSize: 12 } }, p.descripcion,
                  p.estado === 'bloqueada' && p.detalle ? _hDG('div', { style: { color: 'var(--red)', marginTop: 2 } }, p.detalle) : null),
                _hDG('td', {}, _hDG('span', { className: 'badge ' + b.clase }, b.label)),
                _hDG('td', { style: { fontSize: 11.5, color: 'var(--ink-3)', whiteSpace: 'nowrap' } }, p.aplicada_en ? String(p.aplicada_en).slice(0, 16) : '—'));
            }))
          ))
    ) : null,

    _hDG(ConfirmModal, {
      abierto: confirmar,
      titulo: 'Aplicar migraciones pendientes',
      mensaje: 'Se van a aplicar ' + pendientes + ' paso(s) sobre la base de datos de producción. Los cambios sobre tablas grandes las bloquean mientras corren, así que conviene hacerlo fuera de horario de cobro. Se detiene en el primer error y lo ya aplicado queda registrado. ¿Continuar?',
      textoConfirmar: 'Aplicar ahora',
      onConfirmar: aplicar,
      onCancelar: function () { setConfirmar(false); }
    })
  );
}

// ════════════════════════════════════════════════════════════════════════
// Vista
// ════════════════════════════════════════════════════════════════════════

function Diagnostico(props) {
  var _R = React;
  var esSuper = !!(props.user && props.user.rol === 'superadmin');
  var t1 = _R.useState('incoherencias'); var tab = t1[0], setTab = t1[1];
  var tabs = [{ id: 'incoherencias', label: 'Incoherencias' }];
  if (esSuper) tabs.push({ id: 'bd', label: 'Base de datos' });
  // Soporte nunca ve la pestaña de base de datos (el servidor tampoco se la da).
  var activa = (tab === 'bd' && !esSuper) ? 'incoherencias' : tab;

  return _hDG('div', {},
    tabs.length > 1 ? _hDG('div', { className: 'pill-group', style: { marginBottom: 16 } },
      tabs.map(function (t) {
        return _hDG('button', {
          key: t.id, className: 'pill' + (activa === t.id ? ' active' : ''),
          onClick: function () { setTab(t.id); }
        }, t.label);
      })
    ) : null,
    activa === 'bd' ? _hDG(DgBaseDatos, {}) : _hDG(DgIncoherencias, { data: props.data })
  );
}
