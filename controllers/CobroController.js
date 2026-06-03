/**
 * CONTROLLER — CobroController v2
 * SPEI con CLABE fija. Referencia = matrícula del alumno.
 */
const CobroController = (() => {
  const API = 'api.php';

  async function apiPost(action, body) {
    const res = await fetch(`${API}?action=${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function crearCobro(data, { carrito, cliente, metodo, escuela_id }) {
    const escuela   = data.escuelas.find(e => e.id === escuela_id);
    const clave     = escuela?.clave || 'COB';
    const folio     = AppModel.nextFolio(data.cobros, clave);
    const total     = carrito.reduce((a, i) => a + i.precio * i.qty, 0);
    const id        = AppModel.nextId(data.cobros);
    // Referencia SPEI = matrícula del alumno (lo que el padre escribe en el concepto)
    const referencia = cliente?.matricula || folio;

    return {
      id, folio, escuela_id,
      cliente_id:  cliente?.id ?? null,
      cliente:     cliente?.nombre ?? 'Cliente general',
      items:       carrito.map(i => ({ nombre: i.nombre, qty: i.qty, precio: i.precio })),
      total, metodo,
      estado:      (metodo === 'Efectivo') ? 'pagado' : 'pendiente',
      fecha:       new Date().toISOString().slice(0, 10),
      factura:     false,
      referencia,  // Matrícula → concepto SPEI
    };
  }

  function ajustarSaldo(clientes, clienteId, delta) {
    if (!clienteId) return clientes;
    return clientes.map(c =>
      c.id === clienteId
        ? { ...c, saldo_pendiente: Math.max(0, (c.saldo_pendiente || 0) + delta) }
        : c
    );
  }

  function iniciarCobro(data, { carrito, cliente, metodo, escuela_id }) {
    const cobro = crearCobro(data, { carrito, cliente, metodo, escuela_id });
    if (metodo === 'Efectivo') {
      cobro.estado    = 'pagado';
      cobro.auth_code = 'EFE-' + String(Math.floor(Math.random() * 999999)).padStart(6, '0');
    }
    let nuevosClientes = data.clientes;
    if (cobro.estado === 'pendiente' && cobro.cliente_id) {
      nuevosClientes = ajustarSaldo(data.clientes, cobro.cliente_id, cobro.total);
    }
    const nuevoData = { ...data, cobros: [...data.cobros, cobro], clientes: nuevosClientes };
    return { data: nuevoData, cobro };
  }

  // SPEI FIJA: devuelve CLABE fija de la escuela (o la global de config)
  async function iniciarSPEI(cobro, escuela) {
    // Si hay backend PHP disponible lo consultamos, si no usamos la CLABE local
    try {
      const resultado = await apiPost('obtener_clabe', {
        folio:      cobro.folio,
        total:      cobro.total,
        nombre:     cobro.cliente,
        escuela:    escuela?.nombre || '',
        referencia: cobro.referencia,
      });
      if (resultado.success) {
        return {
          clabe:        resultado.clabe,
          banco:        resultado.banco,
          beneficiario: resultado.beneficiario,
          referencia:   resultado.referencia,
          instruccion:  resultado.instruccion,
          esFija:       true,
        };
      }
    } catch(e) { /* fallback local */ }

    // Fallback: usar CLABE de la escuela directamente
    return {
      clabe:        escuela?.clabe_fija || '646180633010000055',
      banco:        'STP — Sistema de Transferencias y Pagos',
      beneficiario: escuela?.nombre || 'Paga la Escuela',
      referencia:   cobro.referencia,
      instruccion:  `Escribe como concepto: ${cobro.referencia}`,
      esFija:       true,
    };
  }

  async function verificarSPEI(referencia) {
    const resultado = await apiPost('verificar_spei', { referencia });
    if (!resultado.success) throw new Error(resultado.error || 'Error al verificar');
    return { pagado: resultado.pagado, monto: resultado.monto, transaccion: resultado.transaccion };
  }

  async function iniciarTC(cobro) {
    const resultado = await apiPost('generar_liga', {
      folio:       cobro.folio,
      total:       cobro.total,
      descripcion: `Pago escolar ${cobro.folio} — ${cobro.cliente}`,
    });
    if (!resultado.success) throw new Error(resultado.error || 'Error al generar liga');
    return { url: resultado.url, qr_url: resultado.qr_url, referencia: resultado.referencia };
  }

  function confirmarPago(data, cobroId, extra = {}) {
    let clienteId = null, total = 0;
    const nuevosCobros = data.cobros.map(c => {
      if (c.id !== cobroId) return c;
      clienteId = c.cliente_id;
      total     = c.total;
      return {
        ...c, estado: 'pagado',
        fecha_pago:  new Date().toISOString(),
        auth_code:   extra.transaccion ?? extra.auth_code
                       ?? ('CONF-' + String(Math.floor(Math.random() * 999999)).padStart(6, '0')),
        ...extra,
      };
    });
    const nuevosClientes = ajustarSaldo(data.clientes, clienteId, -total);
    return { ...data, cobros: nuevosCobros, clientes: nuevosClientes };
  }

  function cancelarCobro(data, cobroId) {
    let clienteId = null, total = 0, esPendiente = false;
    const nuevosCobros = data.cobros.map(c => {
      if (c.id !== cobroId) return c;
      esPendiente = c.estado === 'pendiente';
      clienteId = c.cliente_id; total = c.total;
      return { ...c, estado: 'cancelado' };
    });
    let nuevosClientes = data.clientes;
    if (esPendiente && clienteId) nuevosClientes = ajustarSaldo(data.clientes, clienteId, -total);
    return { ...data, cobros: nuevosCobros, clientes: nuevosClientes };
  }

  function getEstadisticas(cobros) {
    return AppModel.getEstadisticas(cobros);
  }

  return { iniciarCobro, iniciarSPEI, verificarSPEI, iniciarTC, confirmarPago, cancelarCobro, getEstadisticas };
})();
