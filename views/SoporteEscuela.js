/* views/SoporteEscuela.js — Ficha completa de un colegio, para soporte.
 *
 * POR QUÉ EXISTE (25-sep-2026)
 *
 * Soporte tenía búsqueda global, logs y superreportes. Suficiente para
 * encontrar a un alumno, pero no para contestar por teléfono las preguntas
 * que de verdad llegan: "¿qué pagué de mi suscripción?", "¿en qué va mi
 * documentación?", "¿qué datos de cobro tengo registrados?". Para cada una
 * había que pedirle al superadmin que mirara.
 *
 * Esta pantalla junta todo lo de UN colegio en una sola vista: datos
 * generales, estado de la suscripción con su historial de pagos, estado de
 * cada documento, y los datos del alta de comercio. Pensada para tenerla
 * abierta mientras se habla con el cliente.
 *
 * SOLO LECTURA A PROPÓSITO. No hay un solo botón que escriba. Soporte aclara;
 * quien corrige es admin, contador o provisión según el caso. Y no se puede
 * DESCARGAR ningún documento: soporte necesita el estado ("aprobado",
 * "rechazado y por qué"), no el INE escaneado del representante legal. Por eso
 * 'descargar_documento_escuela' no está en su allowlist de api.php.
 */
var _hSE = React.createElement;

var SE_DOCS = {
  identificacion_frente:  'Identificación (frente)',
  identificacion_reverso: 'Identificación (reverso)',
  estado_cuenta_bancario: 'Estado de cuenta',
  comprobante_domicilio:  'Comprobante de domicilio',
  constancia_fiscal:      'Constancia fiscal',
  acta_constitutiva:      'Acta constitutiva',
};

var SE_ESTADO_DOC = {
  pendiente: { label: 'Pendiente', clase: 'badge-amber' },
  aprobado:  { label: 'Aprobado',  clase: 'badge-green' },
  rechazado: { label: 'Rechazado', clase: 'badge-red' },
};

var SE_ORIGEN = { registro: 'Alta', renovacion: 'Renovación', manual: 'Ajuste manual' };

function SoporteEscuela({ data }) {
  var _R = React;
  var e1 = _R.useState(null);  var escId = e1[0], setEscId = e1[1];
  var e2 = _R.useState('');    var q = e2[0], setQ = e2[1];
  var e3 = _R.useState(null);  var detalle = e3[0], setDetalle = e3[1];
  var e4 = _R.useState(false); var cargando = e4[0], setCargando = e4[1];

  var escuelas = (data && data.escuelas ? data.escuelas : []).filter(function (e) { return !e.es_plantel; });
  var resumen = (data && data.resumen_escuelas) || {};
  var fmt = function (n) { return '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 }); };

  var pedir = function (accion, cuerpo) {
    return fetch('api.php?action=' + accion, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (AuthController.getToken() || '')
      },
      body: JSON.stringify(cuerpo || {}),
    }).then(function (r) { return r.json(); }).catch(function () { return null; });
  };

  // Las tres consultas van en paralelo: son independientes entre sí y en
  // soporte telefónico cada segundo de espera se nota. Si una falla, las otras
  // dos igual se pintan — es preferible una ficha incompleta a una vacía.
  _R.useEffect(function () {
    if (!escId) { setDetalle(null); return; }
    var vivo = true;
    setCargando(true);
    Promise.all([
      pedir('suscripcion_pagos_listar', { escuela_id: escId }),
      pedir('listar_documentos_escuela', { escuela_id: escId }),
      pedir('escuela_obtener_datos_pago', { escuela_id: escId }),
    ]).then(function (r) {
      if (!vivo) return;
      setDetalle({
        pagos: (r[0] && r[0].pagos) || [],
        avisoPagos: (r[0] && r[0].aviso) || null,
        documentos: (r[1] && r[1].documentos) || [],
        datosPago: (r[2] && r[2].datos_pago) || null,
        adminEsc: (r[2] && r[2].admin) || null,
        formCompleto: !!(r[2] && r[2].formulario_completo),
        faltantes: (r[2] && r[2].campos_faltantes) || [],
      });
      setCargando(false);
    });
    return function () { vivo = false; };
  }, [escId]);

  var esc = escuelas.filter(function (e) { return e.id === escId; })[0] || null;
  var visibles = escuelas.filter(function (e) {
    if (!q.trim()) return true;
    var t = q.trim().toLowerCase();
    return (e.nombre || '').toLowerCase().indexOf(t) >= 0
        || (e.clave || '').toLowerCase().indexOf(t) >= 0;
  });

  var fila = function (etiqueta, valor, mono) {
    return _hSE('div', { key: etiqueta, style: { display: 'flex', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border-glow)' } },
      _hSE('div', { key: 'l', style: { fontSize: 12, color: 'var(--ink-3)', minWidth: 160, flexShrink: 0 } }, etiqueta),
      _hSE('div', { key: 'v', style: { fontSize: 12.5, color: 'var(--ink)', wordBreak: 'break-word', fontFamily: mono ? 'var(--mono)' : undefined } }, valor || '—')
    );
  };

  var tarjeta = function (titulo, sub, hijos, llave) {
    return _hSE('div', { key: llave, className: 'card', style: { marginBottom: 16 } },
      _hSE('div', { key: 'h', className: 'card-header' },
        _hSE('div', {},
          _hSE('div', { className: 'card-title' }, titulo),
          sub ? _hSE('div', { className: 'card-sub' }, sub) : null
        )
      ),
      hijos
    );
  };

  return _hSE('div', {},
    // ── Selector de colegio ──
    _hSE('div', { key: 'sel', className: 'card', style: { marginBottom: 16 } },
      _hSE('div', { key: 'h', className: 'card-header' },
        _hSE('div', {},
          _hSE('div', { className: 'card-title' }, 'Ficha de colegio'),
          _hSE('div', { className: 'card-sub' }, 'Todo lo de un colegio en una pantalla, para aclarar con el cliente al momento.')
        )
      ),
      _hSE('input', {
        key: 'q', className: 'form-input', style: { marginBottom: 10 },
        placeholder: 'Buscar colegio por nombre o clave…',
        value: q, onChange: function (e) { setQ(e.target.value); }
      }),
      _hSE('div', { key: 'lista', style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
        visibles.slice(0, 40).map(function (e) {
          return _hSE('button', {
            key: e.id,
            className: 'btn btn-sm ' + (escId === e.id ? 'btn-primary' : 'btn-secondary'),
            onClick: function () { setEscId(e.id); }
          }, e.nombre);
        })
      ),
      visibles.length > 40 ? _hSE('div', { key: 'mas', style: { fontSize: 11.5, color: 'var(--ink-4)', marginTop: 8 } },
        'Se muestran 40 de ' + visibles.length + '. Afina la búsqueda para ver el resto.') : null
    ),

    !esc ? _hSE('div', { key: 'vacio', className: 'empty-state' },
      _hSE('div', { key: 'i', className: 'empty-icon' }, _hSE(Icon, { name: 'escuelas', size: 34, color: 'currentColor' })),
      _hSE('div', { key: 't', className: 'empty-text' }, 'Elige un colegio para ver su ficha completa.')
    ) : (cargando ? _hSE('div', { key: 'load', style: { padding: 30, textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 } }, 'Cargando…')
      : _hSE('div', { key: 'ficha' },

        // ── Datos generales ──
        tarjeta('Datos generales', esc.nombre, _hSE('div', { key: 'g' },
          fila('Clave', esc.clave, true),
          fila('Plan', esc.plan),
          fila('Modo', (esc.modo || 'activa') === 'demo' ? 'Prueba' : 'Activa'),
          fila((esc.modo || 'activa') === 'demo' ? 'Termina la prueba' : 'Vence el',
               (esc.modo || 'activa') === 'demo' ? esc.fecha_fin_prueba : esc.fecha_vencimiento_plan, true),
          fila('Documentación', esc.documentacion_estado || 'sin_enviar'),
          fila('ID del proveedor', esc.proveedor_school_id, true),
          fila('Correo de contacto', esc.email),
          fila('Teléfono', esc.telefono),
          fila('Alumnos', (resumen[esc.id] && resumen[esc.id].total_alumnos) || 0),
          fila('Cobrado (90 días)', fmt(resumen[esc.id] && resumen[esc.id].cobrado_90d)),
          fila('Pendiente (90 días)', fmt(resumen[esc.id] && resumen[esc.id].pendiente_90d))
        ), 'gen'),

        // ── Suscripción ──
        tarjeta('Pagos de su suscripción', 'Lo que el colegio nos ha pagado a nosotros.',
          _hSE('div', { key: 's' },
            detalle && detalle.avisoPagos
              ? _hSE('div', { key: 'av', style: { fontSize: 12.5, color: 'var(--ink-3)' } }, detalle.avisoPagos)
              : (!detalle || detalle.pagos.length === 0
                  ? _hSE('div', { key: 'v', style: { fontSize: 12.5, color: 'var(--ink-3)' } }, 'Sin pagos registrados todavía.')
                  : _hSE('div', { key: 't', className: 'table-wrap' },
                      _hSE('table', {},
                        _hSE('thead', { key: 'th' }, _hSE('tr', {},
                          _hSE('th', { key: 'a' }, 'Fecha'), _hSE('th', { key: 'b' }, 'Concepto'),
                          _hSE('th', { key: 'c' }, 'Método'), _hSE('th', { key: 'd' }, 'Referencia'),
                          _hSE('th', { key: 'e', style: { textAlign: 'right' } }, 'Monto'))),
                        _hSE('tbody', { key: 'tb' }, detalle.pagos.map(function (p) {
                          return _hSE('tr', { key: p.id },
                            _hSE('td', { key: 'a', style: { whiteSpace: 'nowrap' } }, String(p.pagado_en || '').slice(0, 10)),
                            _hSE('td', { key: 'b' }, (SE_ORIGEN[p.origen] || p.origen) + (p.plan ? ' · ' + p.plan : '')),
                            _hSE('td', { key: 'c' }, p.metodo || '—'),
                            _hSE('td', { key: 'd', style: { fontFamily: 'var(--mono)', fontSize: 11.5, wordBreak: 'break-all' } }, p.referencia || p.auth_code || '—'),
                            // monto null = ajuste manual sin cobro. "$0.00"
                            // diría que pagó cero, que es falso.
                            _hSE('td', { key: 'e', style: { textAlign: 'right', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' } },
                              p.monto === null ? 'Sin cobro' : fmt(p.monto)));
                        })))))
          ), 'sus'),

        // ── Documentación ──
        tarjeta('Documentación', 'Estado de cada documento. El motivo del rechazo es lo que el colegio recibió por correo.',
          _hSE('div', { key: 'd' },
            (!detalle || detalle.documentos.length === 0)
              ? _hSE('div', { style: { fontSize: 12.5, color: 'var(--ink-3)' } }, 'El colegio no ha subido ningún documento.')
              : detalle.documentos.map(function (d) {
                  var est = SE_ESTADO_DOC[d.estado] || SE_ESTADO_DOC.pendiente;
                  return _hSE('div', { key: d.id, style: { padding: '8px 0', borderBottom: '1px solid var(--border-glow)' } },
                    _hSE('div', { key: 'a', style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' } },
                      _hSE('span', { key: 'n', style: { fontSize: 12.5, color: 'var(--ink)' } }, SE_DOCS[d.tipo] || d.tipo),
                      _hSE('span', { key: 'b', className: 'badge ' + est.clase }, est.label),
                      d.revisado_en ? _hSE('span', { key: 'r', style: { fontSize: 11, color: 'var(--ink-4)' } }, 'revisado ' + String(d.revisado_en).slice(0, 10)) : null
                    ),
                    d.motivo_rechazo ? _hSE('div', { key: 'm', style: { fontSize: 11.5, color: 'var(--red)', marginTop: 3 } }, 'Motivo: ' + d.motivo_rechazo) : null
                  );
                })
          ), 'docs'),

        // ── Datos de cobro ──
        tarjeta('Datos de alta de comercio',
          detalle && !detalle.formCompleto ? 'Formulario incompleto: por eso no puede subir documentos.' : 'Formulario completo.',
          _hSE('div', { key: 'p' },
            (!detalle || !detalle.datosPago)
              ? _hSE('div', { style: { fontSize: 12.5, color: 'var(--ink-3)' } }, 'El colegio todavía no ha guardado sus datos de cobro.')
              : _hSE('div', {},
                  fila('Titular', detalle.datosPago.titular_nombre),
                  fila('Nombre del comercio', detalle.datosPago.nombre_comercio),
                  fila('Correo del titular', detalle.datosPago.titular_correo),
                  fila('Giro', detalle.datosPago.giro),
                  fila('Teléfono', detalle.datosPago.telefono_celular || detalle.datosPago.telefono_oficina),
                  fila('Ciudad', detalle.datosPago.ciudad),
                  fila('Representante legal', detalle.datosPago.rep_legal_nombre)
                ),
            detalle && detalle.faltantes && detalle.faltantes.length
              ? _hSE('div', { key: 'f', style: { fontSize: 11.5, color: 'var(--amber)', marginTop: 8 } },
                  'Le faltan: ' + detalle.faltantes.join(', '))
              : null
          ), 'pago')
      ))
  );
}
