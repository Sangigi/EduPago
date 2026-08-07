/* views/CorteCaja.js — Apertura / cierre / historial de caja */
const h = React.createElement;

function CorteCaja({ user, escuela }) {
  const { useState, useEffect, useCallback } = React;

  const [sucursales, setSucursales] = useState([]);
  const [sucursalId, setSucursalId] = useState(null);
  const [cajaAbierta, setCajaAbierta] = useState(null); // null = no hay caja abierta
  const [historial, setHistorial] = useState([]);
  const [detalle, setDetalle] = useState(null); // resumen de un corte (modal)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [vista, setVista] = useState('operacion'); // operacion | historial

  // Formularios
  const [montoApertura, setMontoApertura] = useState('');
  const [obsApertura, setObsApertura] = useState('');
  const [montoCierre, setMontoCierre] = useState('');
  const [obsCierre, setObsCierre] = useState('');
  const [modalCierre, setModalCierre] = useState(false);
  const [modalMovimiento, setModalMovimiento] = useState(false);
  const [movTipo, setMovTipo] = useState('egreso');
  const [movConcepto, setMovConcepto] = useState('');
  const [movTotal, setMovTotal] = useState('');
  const [busy, setBusy] = useState(false);

  const cargarSucursales = useCallback(async () => {
    if (!escuela?.id) return;
    setLoading(true); setError(null);
    try {
      const lista = await CajaController.listarSucursales(escuela.id);
      setSucursales(lista);
      if (lista.length && !sucursalId) setSucursalId(lista[0].id);
      if (!lista.length) setLoading(false);
    } catch (e) {
      setError(e.message); setLoading(false);
    }
  }, [escuela?.id]);

  const cargarEstado = useCallback(async (sid) => {
    if (!sid) return;
    setLoading(true); setError(null);
    try {
      const caja = await CajaController.estadoActual(sid);
      setCajaAbierta(caja);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const cargarHistorial = useCallback(async (sid) => {
    if (!sid) return;
    try {
      const lista = await CajaController.historial({ sucursal_id: sid });
      setHistorial(lista);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { cargarSucursales(); }, [cargarSucursales]);
  useEffect(() => { if (sucursalId) { cargarEstado(sucursalId); cargarHistorial(sucursalId); } }, [sucursalId]);

  const abrirCaja = async () => {
    const monto = parseFloat(montoApertura);
    if (isNaN(monto) || monto < 0) { alert('Ingresa un monto de apertura válido.'); return; }
    setBusy(true);
    try {
      const caja = await CajaController.abrir({ sucursal_id: sucursalId, monto_apertura: monto, observaciones: obsApertura });
      setCajaAbierta(caja);
      setMontoApertura(''); setObsApertura('');
    } catch (e) {
      alert('Error al abrir caja: ' + e.message);
    } finally { setBusy(false); }
  };

  const registrarMovimiento = async () => {
    const total = parseFloat(movTotal);
    if (isNaN(total) || total <= 0) { alert('Ingresa un monto válido.'); return; }
    setBusy(true);
    try {
      await CajaController.registrarMovimiento({ caja_id: cajaAbierta.id, tipo: movTipo, concepto: movConcepto, total });
      setModalMovimiento(false); setMovConcepto(''); setMovTotal(''); setMovTipo('egreso');
    } catch (e) {
      alert('Error al registrar movimiento: ' + e.message);
    } finally { setBusy(false); }
  };

  const cerrarCaja = async () => {
    const monto = parseFloat(montoCierre);
    if (isNaN(monto) || monto < 0) { alert('Ingresa el monto contado en caja.'); return; }
    setBusy(true);
    try {
      const cerrada = await CajaController.cerrar({ caja_id: cajaAbierta.id, monto_cierre: monto, observaciones: obsCierre });
      setModalCierre(false); setMontoCierre(''); setObsCierre('');
      setCajaAbierta(null);
      setDetalle({ caja: cerrada, ventas: [], movimientos: [] });
      cargarHistorial(sucursalId);
    } catch (e) {
      alert('Error al cerrar caja: ' + e.message);
    } finally { setBusy(false); }
  };

  const verResumen = async (caja_id) => {
    try {
      const r = await CajaController.resumen(caja_id);
      setDetalle(r);
    } catch (e) {
      alert('Error al cargar el resumen: ' + e.message);
    }
  };

  if (!escuela) {
    return h('div', { className: 'card' }, h('div', { className: 'card-sub' }, 'Selecciona una escuela para gestionar su caja.'));
  }

  // ── Selector de sucursal ──────────────────────────────────────────────
  const selectorSucursal = sucursales.length > 1 && h('select', {
    className: 'form-select', style: { width: 'auto' },
    value: sucursalId || '', onChange: e => setSucursalId(parseInt(e.target.value, 10)),
  }, sucursales.map(s => h('option', { key: s.id, value: s.id }, s.nombre)));

  // ── Tabs ──────────────────────────────────────────────────────────────
  const tabs = h('div', { style: { display: 'flex', gap: 8, marginBottom: 16 } },
    ['operacion', 'historial'].map(v => h('button', {
      key: v,
      className: `badge ${vista === v ? 'badge-blue' : 'badge-gray'}`,
      style: { cursor: 'pointer', padding: '6px 14px', fontSize: 12, border: vista === v ? '1px solid currentColor' : '1px solid transparent' },
      onClick: () => setVista(v),
    }, v === 'operacion' ? 'Caja del día' : 'Historial de cortes'))
  );

  // ── Panel: sin caja abierta → formulario de apertura ───────────────────
  const panelApertura = h('div', { className: 'card' },
    h('div', { className: 'card-header' },
      h('div', {},
        h('div', { className: 'card-title' }, 'Abrir caja'),
        h('div', { className: 'card-sub' }, 'Registra el fondo inicial en efectivo antes de empezar a cobrar.')
      )
    ),
    h('div', { className: 'form-group' },
      h('label', { className: 'form-label' }, 'Monto de apertura'),
      h('input', {
        className: 'form-input', type: 'number', min: '0', step: '0.01',
        placeholder: '0.00', value: montoApertura,
        onChange: e => setMontoApertura(e.target.value),
      })
    ),
    h('div', { className: 'form-group' },
      h('label', { className: 'form-label' }, 'Observaciones (opcional)'),
      h('input', {
        className: 'form-input', type: 'text', placeholder: 'Ej. fondo fijo de la semana',
        value: obsApertura, onChange: e => setObsApertura(e.target.value),
      })
    ),
    h('button', { className: 'btn btn-primary', disabled: busy, onClick: abrirCaja }, busy ? 'Abriendo…' : 'Abrir caja')
  );

  // ── Panel: caja abierta → operación en curso ────────────────────────────
  const panelOperacion = cajaAbierta && h('div', {},
    h('div', { className: 'stats-grid' },
      h('div', { className: 'stat-card' },
        h('div', { className: 'stat-icon' }, h(Icon, { name: 'caja', size: 19, color: 'currentColor' })),
        h('div', { className: 'stat-label' }, 'Fondo de apertura'),
        h('div', { className: 'stat-value' }, fmt(cajaAbierta.monto_apertura)),
        h('div', { className: 'stat-meta' }, 'Desde ' + new Date(cajaAbierta.fecha_apertura).toLocaleString('es-MX'))
      ),
      h('div', { className: 'stat-card' },
        h('div', { className: 'stat-icon' }, h(Icon, { name: 'shield', size: 19, color: 'currentColor' })),
        h('div', { className: 'stat-label' }, 'Estado'),
        h('div', { className: 'stat-value', style: { fontSize: 16 } }, h('span', { className: 'badge badge-green' }, h(Icon, { name: 'check', size: 11, color: 'currentColor' }), ' Abierta')),
        h('div', { className: 'stat-meta' }, 'Cajero: ' + (user?.nombre || user?.email || ''))
      )
    ),
    h('div', { className: 'card' },
      h('div', { className: 'card-header' },
        h('div', { className: 'card-title' }, 'Movimientos manuales'),
        h('button', { className: 'btn btn-secondary btn-sm', onClick: () => setModalMovimiento(true) }, '+ Registrar ingreso/egreso')
      ),
      h('div', { className: 'card-sub' }, 'Retiros, préstamos a caja chica u otros movimientos de efectivo que no son ventas del POS.')
    ),
    h('button', {
      className: 'btn btn-danger', style: { marginTop: 8 },
      onClick: () => setModalCierre(true),
    }, 'Cerrar caja')
  );

  // ── Modal: registrar movimiento ─────────────────────────────────────────
  const elModalMovimiento = modalMovimiento && h('div', { className: 'modal-backdrop', onClick: () => setModalMovimiento(false) },
    h('div', { className: 'modal', onClick: e => e.stopPropagation() },
      h('div', { className: 'modal-header' },
        h('div', { className: 'modal-title' }, 'Registrar movimiento'),
        h('button', { className: 'btn-ghost', onClick: () => setModalMovimiento(false) }, h(Icon, { name: 'close', size: 16, color: 'currentColor' }))
      ),
      h('div', { className: 'modal-body' },
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Tipo'),
          h('select', { className: 'form-select', value: movTipo, onChange: e => setMovTipo(e.target.value) },
            h('option', { value: 'egreso' }, 'Egreso (sale dinero)'),
            h('option', { value: 'ingreso' }, 'Ingreso (entra dinero)')
          )
        ),
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Concepto'),
          h('input', { className: 'form-input', type: 'text', value: movConcepto, onChange: e => setMovConcepto(e.target.value), placeholder: 'Ej. compra de papelería' })
        ),
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Monto'),
          h('input', { className: 'form-input', type: 'number', min: '0.01', step: '0.01', value: movTotal, onChange: e => setMovTotal(e.target.value) })
        )
      ),
      h('div', { className: 'modal-footer' },
        h('button', { className: 'btn btn-secondary', onClick: () => setModalMovimiento(false) }, 'Cancelar'),
        h('button', { className: 'btn btn-primary', disabled: busy, onClick: registrarMovimiento }, busy ? 'Guardando…' : 'Guardar')
      )
    )
  );

  // ── Modal: cerrar caja ───────────────────────────────────────────────────
  const elModalCierre = modalCierre && h('div', { className: 'modal-backdrop', onClick: () => setModalCierre(false) },
    h('div', { className: 'modal', onClick: e => e.stopPropagation() },
      h('div', { className: 'modal-header' },
        h('div', { className: 'modal-title' }, 'Cerrar caja'),
        h('button', { className: 'btn-ghost', onClick: () => setModalCierre(false) }, h(Icon, { name: 'close', size: 16, color: 'currentColor' }))
      ),
      h('div', { className: 'modal-body' },
        h('div', { className: 'card-sub', style: { marginBottom: 14 } }, 'Cuenta el efectivo físico en caja e ingrésalo aquí. El sistema calculará la diferencia contra lo esperado.'),
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Efectivo contado'),
          h('input', { className: 'form-input', type: 'number', min: '0', step: '0.01', value: montoCierre, onChange: e => setMontoCierre(e.target.value) })
        ),
        h('div', { className: 'form-group' },
          h('label', { className: 'form-label' }, 'Observaciones (opcional)'),
          h('input', { className: 'form-input', type: 'text', value: obsCierre, onChange: e => setObsCierre(e.target.value) })
        )
      ),
      h('div', { className: 'modal-footer' },
        h('button', { className: 'btn btn-secondary', onClick: () => setModalCierre(false) }, 'Cancelar'),
        h('button', { className: 'btn btn-danger', disabled: busy, onClick: cerrarCaja }, busy ? 'Cerrando…' : 'Cerrar caja')
      )
    )
  );

  // ── Vista historial ───────────────────────────────────────────────────
  const panelHistorial = h('div', { className: 'card' },
    h('div', { className: 'card-header' },
      h('div', { className: 'card-title' }, 'Historial de cortes'),
      h('div', { className: 'card-sub' }, historial.length + ' registros')
    ),
    h('div', { className: 'table-wrap' },
      h('table', {},
        h('thead', {}, h('tr', {},
          ['Apertura', 'Cierre', 'Cajero', 'Fondo', 'Ventas', 'Esperado', 'Contado', 'Diferencia', 'Estado', ''].map(th => h('th', { key: th }, th))
        )),
        h('tbody', {}, historial.map(c => h('tr', { key: c.id },
          h('td', {}, new Date(c.fecha_apertura).toLocaleString('es-MX')),
          h('td', {}, c.fecha_cierre ? new Date(c.fecha_cierre).toLocaleString('es-MX') : '—'),
          h('td', {}, c.usuario_nombre),
          h('td', {}, fmt(c.monto_apertura)),
          h('td', {}, fmt(c.total_ventas)),
          h('td', {}, c.monto_esperado != null ? fmt(c.monto_esperado) : '—'),
          h('td', {}, c.monto_cierre != null ? fmt(c.monto_cierre) : '—'),
          h('td', {}, c.diferencia != null
            ? h('span', { style: { color: Math.abs(c.diferencia) < 0.01 ? 'var(--green-dark)' : 'var(--red)', fontWeight: 700 } }, fmt(c.diferencia))
            : '—'),
          h('td', {}, h('span', { className: `badge ${c.estado === 'abierta' ? 'badge-amber' : 'badge-gray'}` }, c.estado)),
          h('td', {}, h('button', { className: 'btn btn-ghost btn-sm', onClick: () => verResumen(c.id) }, h(Icon, { name: 'eye', size: 14, color: 'currentColor' })))
        )))
      )
    )
  );

  // ── Modal: resumen de un corte ───────────────────────────────────────
  const elModalResumen = detalle && h('div', { className: 'modal-backdrop', onClick: () => setDetalle(null) },
    h('div', { className: 'modal modal-lg', onClick: e => e.stopPropagation() },
      h('div', { className: 'modal-header' },
        h('div', { className: 'modal-title' }, 'Resumen del corte #' + detalle.caja.id),
        h('button', { className: 'btn-ghost', onClick: () => setDetalle(null) }, h(Icon, { name: 'close', size: 16, color: 'currentColor' }))
      ),
      h('div', { className: 'modal-body' },
        h('div', { className: 'stats-grid' },
          h('div', { className: 'stat-card' }, h('div', { className: 'stat-label' }, 'Fondo apertura'), h('div', { className: 'stat-value' }, fmt(detalle.caja.monto_apertura))),
          h('div', { className: 'stat-card' }, h('div', { className: 'stat-label' }, 'Ventas totales'), h('div', { className: 'stat-value' }, fmt(detalle.caja.total_ventas))),
          h('div', { className: 'stat-card' }, h('div', { className: 'stat-label' }, 'Esperado'), h('div', { className: 'stat-value' }, detalle.caja.monto_esperado != null ? fmt(detalle.caja.monto_esperado) : '—')),
          h('div', { className: 'stat-card' }, h('div', { className: 'stat-label' }, 'Diferencia'), h('div', { className: 'stat-value' }, detalle.caja.diferencia != null ? fmt(detalle.caja.diferencia) : '—'))
        ),
        detalle.ventas && detalle.ventas.length > 0 && h('div', { style: { marginTop: 16 } },
          h('div', { className: 'card-title', style: { marginBottom: 8 } }, 'Ventas de este corte'),
          h('div', { className: 'table-wrap' },
            h('table', {},
              h('thead', {}, h('tr', {}, ['Folio', 'Método', 'Total', 'Estado'].map(t => h('th', { key: t }, t)))),
              h('tbody', {}, detalle.ventas.map(v => h('tr', { key: v.id },
                h('td', {}, v.folio), h('td', {}, v.metodo), h('td', {}, fmt(v.total)), h('td', {}, v.estado)
              )))
            )
          )
        )
      )
    )
  );

  return h('div', {},
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 } },
      tabs,
      selectorSucursal
    ),
    error && h('div', { className: 'card', style: { borderColor: 'var(--red)', color: 'var(--red)', marginBottom: 16 } }, error),
    loading ? h('div', { className: 'card-sub' }, 'Cargando…') :
      vista === 'operacion'
        ? (cajaAbierta ? panelOperacion : panelApertura)
        : panelHistorial,
    elModalMovimiento, elModalCierre, elModalResumen
  );
}
