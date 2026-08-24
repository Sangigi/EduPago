var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};
var _Fragment = React.Fragment;

// views/Recordatorios.jsx
// Panel de cobranza: lista los cobros pendientes o vencidos y permite dar
// seguimiento sin salir de la pantalla.
//
// Antes solo mostraba nombre, monto y un boton de "marcar recordado": veias
// que alguien debia y tenias que ir a buscar su telefono a otra vista. Ahora
// cada fila trae el contacto del tutor, la liga de pago y un mensaje listo
// para mandar por WhatsApp o correo.
//
// El envio automatico por correo lo sigue haciendo cron_recordatorios.php.
// Esta pantalla es para el seguimiento manual adicional.

function Recordatorios({ data, setData, escuela }) {
  const { useState, useMemo } = React;

  const [filtro, setFiltro] = useState('todos');
  const [orden, setOrden] = useState('vencido');
  const [q, setQ] = useState('');
  const [guardandoId, setGuardandoId] = useState(null);
  const [seleccion, setSeleccion] = useState([]);
  const [copiado, setCopiado] = useState(null);
  const [enLote, setEnLote] = useState(false);

  // Medianoche local de hoy (no new Date() a secas): compara dia calendario
  // contra dia calendario, sin la hora del momento metiendo ruido.
  const hoy = new Date(new Date().toDateString());
  const hoyStr = (() => {
    const p = n => String(n).padStart(2, '0');
    return hoy.getFullYear() + '-' + p(hoy.getMonth() + 1) + '-' + p(hoy.getDate());
  })();

  const diasDiff = fechaStr => {
    if (!fechaStr) return null;
    // "YYYY-MM-DD" + T00:00:00 fuerza a que el navegador lo lea en hora LOCAL.
    // Sin esto, new Date("2026-08-20") se interpreta como medianoche UTC, que
    // en Mexico (UTC-6) ya son las 6pm del dia 19 — un cobro de HOY aparecia
    // "vencido hace 1 dia".
    const f = new Date(fechaStr.slice(0, 10) + 'T00:00:00');
    return Math.round((hoy - f) / (1000 * 60 * 60 * 24));
  };

  const dinero = n => (typeof fmt === 'function')
    ? fmt(n)
    : '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });

  // ── Contacto del tutor ────────────────────────────────────────
  // El cobro guarda cliente_id; el telefono util es el del tutor que paga,
  // asi que se busca alumno -> familia y se cae al alumno si la familia no
  // tiene datos.
  const contactoDe = cobro => {
    const alumno = (data.clientes || []).find(c => c.id === cobro.cliente_id);
    const familia = alumno && alumno.familia_id
      ? (data.familias || []).find(f => f.id === alumno.familia_id)
      : null;
    return {
      nombre:   (familia && familia.contacto) || (alumno && alumno.nombre) || cobro.cliente || 'Sin nombre',
      alumno:   alumno ? alumno.nombre : (cobro.cliente || ''),
      telefono: (familia && familia.telefono) || (alumno && alumno.telefono) || '',
      email:    (familia && familia.email) || (alumno && alumno.email) || '',
      familia:  familia ? familia.nombre : ''
    };
  };

  const recordatoriosEnviados = data.recordatorios || [];

  // Historial por cobro: cuantos y cuando fue el ultimo
  const historialDe = cobroId => {
    const propios = recordatoriosEnviados
      .filter(r => r.cobro_id === cobroId)
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    return {
      total: propios.length,
      ultimo: propios.length ? propios[0].fecha : null,
      hoy: propios.some(r => String(r.fecha).slice(0, 10) === hoyStr)
    };
  };
  const yaRecordadoHoy = cobroId => historialDe(cobroId).hoy;

  const pendientes = useMemo(() => {
    return (data.cobros || [])
      .filter(c => c.estado === 'pendiente')
      .map(c => {
        const dias = diasDiff(c.fecha_vencimiento || c.fecha);
        let urgencia = 'proximo';
        if (dias !== null && dias > 0) urgencia = 'vencido';
        else if (dias !== null && dias >= -3) urgencia = 'urgente';
        return { ...c, dias_vencido: dias, urgencia };
      });
  }, [data.cobros]);

  const colorUrgencia = u =>
    u === 'vencido' ? 'var(--red)' : u === 'urgente' ? 'var(--amber)' : 'var(--violet)';

  const labelUrgencia = c => {
    if (c.dias_vencido === null) return 'Sin fecha de vencimiento';
    if (c.dias_vencido > 0)  return 'Vencido hace ' + c.dias_vencido + (c.dias_vencido === 1 ? ' día' : ' días');
    if (c.dias_vencido === 0) return 'Vence hoy';
    return 'Vence en ' + Math.abs(c.dias_vencido) + (c.dias_vencido === -1 ? ' día' : ' días');
  };

  // ── Mensaje listo para enviar ─────────────────────────────────
  const mensajeDe = cobro => {
    const ct = contactoDe(cobro);
    const nombreEsc = escuela ? escuela.nombre : 'la escuela';
    const partes = [];
    partes.push('Hola' + (ct.nombre && ct.nombre !== 'Sin nombre' ? ' ' + ct.nombre.split(' ')[0] : '') + ',');
    partes.push('');
    let linea = 'Te recordamos el pago de ' + dinero(cobro.total);
    if (cobro.concepto) linea += ' por ' + cobro.concepto;
    if (ct.alumno) linea += ' de ' + ct.alumno;
    partes.push(linea + '.');
    if (cobro.dias_vencido !== null) {
      partes.push(cobro.dias_vencido > 0
        ? 'Venció el ' + String(cobro.fecha_vencimiento || cobro.fecha).slice(0, 10) + '.'
        : (cobro.dias_vencido === 0 ? 'Vence hoy.' : 'Vence el ' + String(cobro.fecha_vencimiento || cobro.fecha).slice(0, 10) + '.'));
    }
    if (cobro.referencia) {
      partes.push('');
      partes.push('Referencia: ' + cobro.referencia);
    }
    if (cobro.ref_payformat_url) {
      partes.push('Puedes pagar aquí: ' + cobro.ref_payformat_url);
    }
    partes.push('');
    partes.push('Gracias, ' + nombreEsc + '.');
    return partes.join('\n');
  };

  // wa.me necesita el numero con lada de pais y solo digitos
  const telWhatsapp = tel => {
    const d = String(tel || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length === 10) return '52' + d;          // celular nacional
    if (d.length === 12 && d.startsWith('52')) return d;
    if (d.length === 13 && d.startsWith('521')) return '52' + d.slice(3);
    return d;
  };

  const copiarMensaje = async cobro => {
    try {
      await navigator.clipboard.writeText(mensajeDe(cobro));
      setCopiado(cobro.id);
      setTimeout(() => setCopiado(null), 1800);
    } catch (e) { /* navegador sin permiso de portapapeles */ }
  };

  // ── Marcar recordado ──────────────────────────────────────────
  const registrarRecordatorio = async (cobro, canal) => {
    const nuevo = {
      id: AppModel.nextId(data.recordatorios || []),
      cobro_id: cobro.id,
      cliente: cobro.cliente,
      escuela_id: cobro.escuela_id || (escuela ? escuela.id : null),
      fecha: hoyStr,
      canal: canal || 'manual'
    };
    // Optimista: se refleja de inmediato; si falla, se revierte.
    setData(prev => ({ ...prev, recordatorios: [...(prev.recordatorios || []), nuevo] }));
    try {
      const res = await fetch('api.php?action=marcar_recordatorio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + AuthController.getToken()
        },
        body: JSON.stringify({ cobro_id: cobro.id, canal: canal || 'manual' })
      });
      const json = await res.json();
      if (json && json.success === false) throw new Error(json.error || 'Error');
      return true;
    } catch (e) {
      setData(prev => ({
        ...prev,
        recordatorios: (prev.recordatorios || []).filter(r => r.id !== nuevo.id)
      }));
      return false;
    }
  };

  const marcarRecordado = async (cobro, canal) => {
    if (guardandoId) return;
    setGuardandoId(cobro.id);
    await registrarRecordatorio(cobro, canal);
    setGuardandoId(null);
  };

  // Abrir WhatsApp o correo cuenta como recordatorio: si no, habria que
  // marcarlo a mano cada vez y el historial dejaria de reflejar la realidad.
  //
  // Se usa un <a href> y NO window.open: el navegador bloquea window.open
  // aunque venga de un clic, devuelve null y no abre nada. Un enlace normal
  // nunca se bloquea, y mailto: lo entrega al cliente de correo sin dejar
  // una pestana en blanco.
  const registrarAlAbrir = (cobro, canal) => {
    if (!yaRecordadoHoy(cobro.id)) registrarRecordatorio(cobro, canal);
  };

  // ── Filtro, busqueda y orden ──────────────────────────────────
  const filtrados = useMemo(() => {
    let lista = pendientes.filter(c => {
      if (filtro === 'vencidos'   && c.urgencia !== 'vencido') return false;
      if (filtro === 'proximos'   && c.urgencia === 'vencido') return false;
      if (filtro === 'recordados' && !yaRecordadoHoy(c.id)) return false;
      if (filtro === 'sincontacto') {
        const ct = contactoDe(c);
        if (ct.telefono || ct.email) return false;
      }
      return true;
    });
    const t = q.trim().toLowerCase();
    if (t) {
      lista = lista.filter(c => {
        const ct = contactoDe(c);
        return [c.folio, c.concepto, c.cliente, ct.nombre, ct.alumno, ct.familia, ct.telefono, ct.email]
          .filter(Boolean).join(' ').toLowerCase().includes(t);
      });
    }
    const cmp = {
      vencido: (a, b) => (b.dias_vencido || 0) - (a.dias_vencido || 0),
      monto:   (a, b) => Number(b.total || 0) - Number(a.total || 0),
      nombre:  (a, b) => String(contactoDe(a).nombre).localeCompare(String(contactoDe(b).nombre))
    }[orden];
    return lista.slice().sort(cmp);
  }, [pendientes, filtro, q, orden, recordatoriosEnviados, data.clientes, data.familias]);

  // Paginacion local: con cientos de cobros vencidos la lista se volvia
  // inmanejable. Si el componente no esta cargado, se muestra todo como antes.
  const pag = (typeof usePaginacion === 'function')
    ? usePaginacion(filtrados, 25)
    : { pagina: filtrados, total: filtrados.length, totalPaginas: 1, n: 1, tam: filtrados.length, ir: () => {}, cambiarTam: () => {} };

  const FILTROS = [
    { id: 'todos',       label: 'Todos' },
    { id: 'vencidos',    label: 'Vencidos' },
    { id: 'proximos',    label: 'Por vencer' },
    { id: 'recordados',  label: 'Recordados hoy' },
    { id: 'sincontacto', label: 'Sin contacto' }
  ];
  const ORDENES = [
    { id: 'vencido', label: 'Más vencido' },
    { id: 'monto',   label: 'Mayor monto' },
    { id: 'nombre',  label: 'Nombre' }
  ];

  // ── Seleccion multiple ────────────────────────────────────────
  const alternar = id => setSeleccion(s => s.indexOf(id) >= 0 ? s.filter(x => x !== id) : s.concat([id]));
  const pendientesDeSeleccion = filtrados.filter(c => seleccion.indexOf(c.id) >= 0 && !yaRecordadoHoy(c.id));

  const marcarLote = async () => {
    if (enLote || pendientesDeSeleccion.length === 0) return;
    setEnLote(true);
    for (const c of pendientesDeSeleccion) {
      await registrarRecordatorio(c, 'manual');
    }
    setSeleccion([]);
    setEnLote(false);
  };

  // ── Metricas ──────────────────────────────────────────────────
  const nVenc = pendientes.filter(c => c.urgencia === 'vencido').length;
  const nUrg  = pendientes.filter(c => c.urgencia === 'urgente').length;
  const nProx = pendientes.filter(c => c.urgencia === 'proximo').length;
  const nRec  = pendientes.filter(c => yaRecordadoHoy(c.id)).length;
  const nSinContacto = pendientes.filter(c => { const ct = contactoDe(c); return !ct.telefono && !ct.email; }).length;
  const monto = pendientes.reduce((a, c) => a + (Number(c.total) || 0), 0);
  const montoVencido = pendientes.filter(c => c.urgencia === 'vencido')
                                 .reduce((a, c) => a + (Number(c.total) || 0), 0);

  const tarjetas = [
    { destacada: true, tinte: '', icono: 'history', valor: dinero(monto),
      etiqueta: 'Monto por recuperar', meta: pendientes.length + ' cobros pendientes' },
    { tinte: 'tint-red', icono: 'warning', valor: nVenc,
      etiqueta: 'Vencidos', meta: dinero(montoVencido) + ' en riesgo' },
    { tinte: 'tint-amber', icono: 'history', valor: nUrg + nProx,
      etiqueta: 'Por vencer', meta: nUrg + ' urgentes en 3 días' },
    { tinte: 'tint-green', icono: 'check', valor: nRec,
      etiqueta: 'Recordados hoy', meta: 'Seguimiento manual del día' }
  ];

  const btnIcono = (nombre, titulo, onClick, activo) => _jsxDEV("button", {
    className: "btn btn-secondary btn-sm",
    title: titulo,
    onClick: onClick,
    style: activo ? { borderColor: 'var(--violet)', color: 'var(--violet)' } : undefined,
    children: _jsxDEV(Icon, { name: nombre, size: 14, color: 'currentColor' }, void 0, false)
  }, titulo, false);

  return _jsxDEV("div", {
    children: [
      // ── Métricas ──
      _jsxDEV("div", {
        className: "stats-grid",
        children: tarjetas.map(t => _jsxDEV("div", {
          className: "stat-card" + (t.destacada ? " is-featured" : ""),
          children: [
            _jsxDEV("div", { className: "stat-icon" + (t.tinte ? " " + t.tinte : ""),
              children: _jsxDEV(Icon, { name: t.icono, size: 19, color: "currentColor" }, void 0, false) }, void 0, false),
            _jsxDEV("div", { className: "stat-value", children: t.valor }, void 0, false),
            _jsxDEV("div", { className: "stat-label", children: t.etiqueta }, void 0, false),
            _jsxDEV("div", { className: "stat-meta", children: t.meta }, void 0, false)
          ]
        }, t.etiqueta, true))
      }, 'metricas', false),

      _jsxDEV("div", {
        style: { marginBottom: 16, color: 'var(--ink-3)', fontSize: 12.5, lineHeight: 1.6 },
        children: "El sistema ya envía un correo automático 3 días antes de vencer, el día que vence y 1 día después (cron_recordatorios.php). Usa este panel para el seguimiento manual: contactar por WhatsApp o correo y llevar registro de a quién ya le diste seguimiento."
      }, 'desc', false),

      // ── Buscador, filtros y orden ──
      _jsxDEV("div", {
        className: "search-bar",
        style: { marginBottom: 12 },
        children: [
          _jsxDEV("span", { className: "search-icon",
            children: _jsxDEV(Icon, { name: 'search', size: 15, color: 'currentColor' }, void 0, false) }, 'i', false),
          _jsxDEV("input", {
            value: q,
            onChange: e => setQ(e.target.value),
            placeholder: "Buscar por familia, alumno, folio, concepto o teléfono…"
          }, 'in', false)
        ]
      }, 'busq', true),

      _jsxDEV("div", {
        style: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 },
        children: [
          _jsxDEV("div", {
            className: "pill-group",
            children: FILTROS.map(f => _jsxDEV("button", {
              onClick: () => setFiltro(f.id),
              className: "pill" + (filtro === f.id ? " active" : ""),
              children: f.label + (f.id === 'sincontacto' && nSinContacto ? ' (' + nSinContacto + ')' : '')
            }, f.id, false))
          }, 'filtros', false),
          _jsxDEV("select", {
            className: "form-select",
            style: { width: 'auto', marginLeft: 'auto', fontSize: 12.5, padding: '7px 11px' },
            value: orden,
            onChange: e => setOrden(e.target.value),
            children: ORDENES.map(o => _jsxDEV("option", { value: o.id, children: 'Ordenar: ' + o.label }, o.id, false))
          }, 'orden', false)
        ]
      }, 'controles', true),

      // ── Barra de selección múltiple ──
      seleccion.length > 0 ? _jsxDEV("div", {
        style: {
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          padding: '11px 15px', marginBottom: 14,
          background: 'var(--violet-soft)', border: '1px solid var(--violet)',
          borderRadius: 'var(--radius)'
        },
        children: [
          _jsxDEV("span", { style: { fontSize: 13, fontWeight: 600, color: 'var(--violet-dark)' },
            children: seleccion.length + (seleccion.length === 1 ? ' seleccionado' : ' seleccionados') }, 's', false),
          _jsxDEV("button", {
            className: "btn btn-primary btn-sm",
            disabled: enLote || pendientesDeSeleccion.length === 0,
            onClick: marcarLote,
            children: enLote
              ? 'Marcando…'
              : 'Marcar ' + pendientesDeSeleccion.length + ' como recordados'
          }, 'm', false),
          _jsxDEV("button", {
            className: "btn btn-secondary btn-sm",
            onClick: () => setSeleccion([]),
            children: "Limpiar"
          }, 'l', false)
        ]
      }, 'lote', true) : null,

      // ── Lista ──
      filtrados.length === 0
        ? _jsxDEV("div", { className: "empty-state",
            children: _jsxDEV("div", { className: "empty-text",
              children: pendientes.length === 0
                ? "No hay cobros pendientes. Todo al corriente."
                : "Ningún cobro coincide con este filtro." }, void 0, false)
          }, 'vacio', false)
        : _jsxDEV("div", {
            style: { display: 'flex', flexDirection: 'column', gap: 10 },
            children: pag.pagina.map(c => {
              const ct = contactoDe(c);
              const hist = historialDe(c.id);
              const wa = telWhatsapp(ct.telefono);
              const sel = seleccion.indexOf(c.id) >= 0;
              const iniciales = (ct.nombre || '?').trim().split(/\s+/).slice(0, 2)
                .map(w => w[0]).join('').toUpperCase();

              return _jsxDEV("div", {
                className: "card",
                style: {
                  padding: 0, marginBottom: 0, overflow: 'hidden',
                  borderLeft: '4px solid ' + colorUrgencia(c.urgencia),
                  outline: sel ? '2px solid var(--violet)' : 'none'
                },
                children: [
                  _jsxDEV("div", {
                    style: { display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', flexWrap: 'wrap' },
                    children: [
                      _jsxDEV("input", {
                        type: 'checkbox', checked: sel, onChange: () => alternar(c.id),
                        title: 'Seleccionar',
                        style: { width: 16, height: 16, cursor: 'pointer', flexShrink: 0, accentColor: 'var(--violet)' }
                      }, 'chk', false),

                      _jsxDEV("div", {
                        style: {
                          width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                          background: 'var(--violet-soft)', color: 'var(--violet)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 800, fontSize: 13
                        },
                        children: iniciales
                      }, 'av', false),

                      _jsxDEV("div", {
                        style: { flex: 1, minWidth: 190 },
                        children: [
                          _jsxDEV("div", {
                            style: { fontWeight: 700, fontSize: 14, color: 'var(--ink)' },
                            children: ct.nombre
                          }, 'n', false),
                          _jsxDEV("div", {
                            style: { fontSize: 12, color: 'var(--ink-3)', marginTop: 2 },
                            children: [
                              ct.alumno && ct.alumno !== ct.nombre ? ct.alumno + ' · ' : '',
                              c.concepto || 'Cobro',
                              c.folio ? ' · ' + c.folio : ''
                            ].join('')
                          }, 'c', false),
                          _jsxDEV("div", {
                            style: {
                              fontSize: 12, marginTop: 3, fontWeight: 600,
                              color: colorUrgencia(c.urgencia)
                            },
                            children: labelUrgencia(c)
                          }, 'u', false),
                          (ct.telefono || ct.email) ? _jsxDEV("div", {
                            style: { fontSize: 11.5, color: 'var(--ink-4)', marginTop: 3 },
                            children: [ct.telefono, ct.email].filter(Boolean).join(' · ')
                          }, 'ct', false) : _jsxDEV("div", {
                            style: { fontSize: 11.5, color: 'var(--red)', marginTop: 3 },
                            children: 'Sin teléfono ni correo registrado'
                          }, 'ct', false),
                          hist.total > 0 ? _jsxDEV("div", {
                            style: { fontSize: 11.5, color: 'var(--ink-4)', marginTop: 3 },
                            children: hist.total + (hist.total === 1 ? ' recordatorio' : ' recordatorios')
                                      + (hist.ultimo ? ' · último ' + String(hist.ultimo).slice(0, 10) : '')
                          }, 'h', false) : null
                        ]
                      }, 'info', true),

                      _jsxDEV("div", {
                        style: { textAlign: 'right', flexShrink: 0 },
                        children: [
                          _jsxDEV("div", {
                            style: {
                              fontSize: 17, fontWeight: 700, color: 'var(--ink)',
                              fontVariantNumeric: 'tabular-nums'
                            },
                            children: dinero(c.total)
                          }, 'm', false),
                          hist.hoy ? _jsxDEV("div", {
                            style: { fontSize: 11.5, color: 'var(--green-dark)', fontWeight: 600, marginTop: 3 },
                            children: 'Recordado hoy'
                          }, 'r', false) : null
                        ]
                      }, 'monto', true)
                    ]
                  }, 'fila', true),

                  // ── Acciones ──
                  _jsxDEV("div", {
                    style: {
                      display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
                      padding: '11px 16px', borderTop: '1px solid var(--border-glow)',
                      background: 'var(--glass-light)'
                    },
                    children: [
                      wa ? _jsxDEV("a", {
                        className: "btn btn-secondary btn-sm",
                        href: 'https://wa.me/' + wa + '?text=' + encodeURIComponent(mensajeDe(c)),
                        target: '_blank',
                        rel: 'noopener noreferrer',
                        style: { textDecoration: 'none' },
                        onClick: () => registrarAlAbrir(c, 'whatsapp'),
                        children: [
                          _jsxDEV(Icon, { name: 'phone', size: 13, color: 'currentColor' }, 'i', false),
                          ' WhatsApp'
                        ]
                      }, 'wa', true) : null,

                      ct.email ? _jsxDEV("a", {
                        className: "btn btn-secondary btn-sm",
                        href: 'mailto:' + ct.email
                              + '?subject=' + encodeURIComponent('Recordatorio de pago' + (c.folio ? ' \u00b7 ' + c.folio : ''))
                              + '&body=' + encodeURIComponent(mensajeDe(c)),
                        style: { textDecoration: 'none' },
                        onClick: () => registrarAlAbrir(c, 'email'),
                        children: [
                          _jsxDEV(Icon, { name: 'emails', size: 13, color: 'currentColor' }, 'i', false),
                          ' Correo'
                        ]
                      }, 'em', true) : null,

                      _jsxDEV("button", {
                        className: "btn btn-secondary btn-sm",
                        onClick: () => copiarMensaje(c),
                        children: [
                          _jsxDEV(Icon, { name: 'copy', size: 13, color: 'currentColor' }, 'i', false),
                          copiado === c.id ? ' Copiado' : ' Copiar mensaje'
                        ]
                      }, 'cp', true),

                      c.ref_payformat_url ? _jsxDEV("a", {
                        className: "btn btn-secondary btn-sm",
                        href: c.ref_payformat_url,
                        target: '_blank',
                        rel: 'noopener noreferrer',
                        style: { textDecoration: 'none' },
                        children: [
                          _jsxDEV(Icon, { name: 'download', size: 13, color: 'currentColor' }, 'i', false),
                          ' Liga de pago'
                        ]
                      }, 'lp', true) : null,

                      hist.hoy ? null : _jsxDEV("button", {
                        className: "btn btn-primary btn-sm",
                        style: { marginLeft: 'auto' },
                        disabled: guardandoId === c.id,
                        onClick: () => marcarRecordado(c, 'manual'),
                        children: guardandoId === c.id ? 'Guardando…' : 'Marcar recordado'
                      }, 'mk', false)
                    ]
                  }, 'acciones', true)
                ]
              }, c.id, true);
            })
          }, 'lista', false),

      (typeof Paginador !== 'undefined' && filtrados.length > 0)
        ? _jsxDEV(Paginador, { ctrl: pag, etiqueta: 'cobros' }, 'pag', false)
        : null
    ]
  }, void 0, true);
}
