/**
 * CONTROLLER — CobroController
 * Maneja toda la lógica de cobros.
 * Los métodos de pago real (SPEI, Tarjeta) llaman al backend api.php
 * que se conecta con Pagadetodo.mx.
 */
const CobroController = (() => {

  // ── URL del backend PHP ──────────────────────────────────────────────────
  // Ajusta esta ruta si el archivo api.php está en otra ubicación relativa.
  const API = 'api.php';

  // ── Helper: POST a api.php ───────────────────────────────────────────────
  async function apiPost(action, body) {
    const res = await fetch(`${API}?action=${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // ── Helper: estado inicial del cobro ─────────────────────────────────────
  function crearCobro(data, { carrito, cliente, metodo }) {
    const folio  = AppModel.nextFolio(data.cobros);
    const total  = carrito.reduce((a, i) => a + i.precio * i.qty, 0);
    const id     = AppModel.nextId(data.cobros);

    return {
      id,
      folio,
      cliente_id: cliente?.id ?? null,
      cliente:    cliente?.nombre ?? 'Cliente general',
      items: carrito.map(i => ({ nombre: i.nombre, qty: i.qty, precio: i.precio })),
      total,
      metodo,
      estado:     (metodo === 'Efectivo') ? 'pagado' : 'pendiente',
      fecha:      new Date().toISOString().slice(0, 10),
      factura:    false,
      referencia: folio,
    };
  }

  // ── Actualizar saldo del cliente ──────────────────────────────────────────
  function ajustarSaldo(clientes, clienteId, delta) {
    if (!clienteId) return clientes;
    return clientes.map(c =>
      c.id === clienteId
        ? { ...c, saldo_pendiente: Math.max(0, (c.saldo_pendiente || 0) + delta) }
        : c
    );
  }


  // ══════════════════════════════════════════════════════════════════════════
  // INICIAR COBRO
  // Devuelve { data, cobro } de forma síncrona.
  // Las llamadas al backend se hacen DESPUÉS con iniciarSPEI / iniciarTC.
  // ══════════════════════════════════════════════════════════════════════════
  function iniciarCobro(data, { carrito, cliente, metodo }) {
    const cobro = crearCobro(data, { carrito, cliente, metodo });

    // Para TC y Efectivo lo marcamos pagado inmediatamente (sin backend aún)
    if (metodo === 'Efectivo') {
      cobro.estado = 'pagado';
      cobro.auth_code = 'EFE-' + String(Math.floor(Math.random() * 999999)).padStart(6, '0');
    }

    let nuevosClientes = data.clientes;
    if (cobro.estado === 'pendiente' && cobro.cliente_id) {
      nuevosClientes = ajustarSaldo(data.clientes, cobro.cliente_id, cobro.total);
    }

    const nuevoData = { ...data, cobros: [...data.cobros, cobro], clientes: nuevosClientes };
    return { data: nuevoData, cobro };
  }


  // ══════════════════════════════════════════════════════════════════════════
  // SPEI: Solicitar CLABE real a Pagadetodo
  // Devuelve una Promise<{ clabe, referencia, expira }>
  // ══════════════════════════════════════════════════════════════════════════
  async function iniciarSPEI(cobro) {
    const resultado = await apiPost('generar_clabe', {
      folio:  cobro.folio,
      total:  cobro.total,
      nombre: cobro.cliente,
      email:  '',  // opcional, pasar email del cliente si está disponible
    });

    if (!resultado.success) {
      throw new Error(resultado.error || 'Error al generar CLABE');
    }

    return {
      clabe:      resultado.clabe,
      referencia: resultado.referencia,
      expira:     resultado.expira,
    };
  }


  // ══════════════════════════════════════════════════════════════════════════
  // SPEI: Verificar pago (polling manual o automático)
  // Devuelve Promise<{ pagado, monto, transaccion }>
  // ══════════════════════════════════════════════════════════════════════════
  async function verificarSPEI(clabe) {
    const resultado = await apiPost('verificar_spei', { clabe });
    if (!resultado.success) throw new Error(resultado.error || 'Error al verificar');
    return {
      pagado:      resultado.pagado,
      monto:       resultado.monto,
      transaccion: resultado.transaccion,
    };
  }


  // ══════════════════════════════════════════════════════════════════════════
  // TARJETA: Generar liga de pago con QR
  // Devuelve Promise<{ url, qr_url, referencia }>
  // ══════════════════════════════════════════════════════════════════════════
  async function iniciarTC(cobro) {
    const resultado = await apiPost('generar_liga', {
      folio:       cobro.folio,
      total:       cobro.total,
      descripcion: `Pago escolar ${cobro.folio} — ${cobro.cliente}`,
    });

    if (!resultado.success) {
      throw new Error(resultado.error || 'Error al generar liga de pago');
    }

    return {
      url:        resultado.url,
      qr_url:     resultado.qr_url,
      referencia: resultado.referencia,
      expira:     resultado.expira,
    };
  }


  // ══════════════════════════════════════════════════════════════════════════
  // CONFIRMAR PAGO (actualiza estado en memoria)
  // ══════════════════════════════════════════════════════════════════════════
  function confirmarPago(data, cobroId, extra = {}) {
    let clienteId = null;
    let total = 0;

    const nuevosCobros = data.cobros.map(c => {
      if (c.id !== cobroId) return c;
      clienteId = c.cliente_id;
      total     = c.total;
      return {
        ...c,
        estado:      'pagado',
        fecha_pago:  new Date().toISOString(),
        auth_code:   extra.transaccion ?? extra.auth_code
                       ?? ('CONF-' + String(Math.floor(Math.random() * 999999)).padStart(6, '0')),
        ...extra,
      };
    });

    const nuevosClientes = ajustarSaldo(data.clientes, clienteId, -total);

    return { ...data, cobros: nuevosCobros, clientes: nuevosClientes };
  }


  // ══════════════════════════════════════════════════════════════════════════
  // CANCELAR COBRO
  // ══════════════════════════════════════════════════════════════════════════
  function cancelarCobro(data, cobroId) {
    let clienteId   = null;
    let total       = 0;
    let esPendiente = false;

    const nuevosCobros = data.cobros.map(c => {
      if (c.id !== cobroId) return c;
      esPendiente = c.estado === 'pendiente';
      clienteId   = c.cliente_id;
      total       = c.total;
      return { ...c, estado: 'cancelado' };
    });

    let nuevosClientes = data.clientes;
    if (esPendiente && clienteId) {
      nuevosClientes = ajustarSaldo(data.clientes, clienteId, -total);
    }

    return { ...data, cobros: nuevosCobros, clientes: nuevosClientes };
  }


  // ══════════════════════════════════════════════════════════════════════════
  // EMITIR FACTURA (local, la integración con FacturAPI es separada)
  // ══════════════════════════════════════════════════════════════════════════
  function emitirFactura(data, cobroId, datosFiscales) {
    const nuevosCobros = data.cobros.map(c => {
      if (c.id !== cobroId) return c;
      return {
        ...c,
        factura:        true,
        cfdi_uuid:      'CFDI-' + Date.now() + '-' + String(Math.random()).slice(2, 8).toUpperCase(),
        datos_fiscales: datosFiscales,
        fecha_cfdi:     new Date().toISOString(),
      };
    });
    return { ...data, cobros: nuevosCobros };
  }


  // ══════════════════════════════════════════════════════════════════════════
  // ESTADÍSTICAS PARA DASHBOARD
  // ══════════════════════════════════════════════════════════════════════════
  function getEstadisticas(cobros) {
    const hoy = new Date().toISOString().slice(0, 10);
    return {
      totalCobrado:   cobros.filter(c => c.estado === 'pagado').reduce((a, c) => a + c.total, 0),
      totalPendiente: cobros.filter(c => c.estado === 'pendiente').reduce((a, c) => a + c.total, 0),
      cobrosHoy:      cobros.filter(c => c.fecha === hoy && c.estado === 'pagado').reduce((a, c) => a + c.total, 0),
      totalCobros:    cobros.length,
      cobradosPorMetodo: {
        TC:       cobros.filter(c => c.metodo === 'TC'       && c.estado === 'pagado').reduce((a, c) => a + c.total, 0),
        SPEI:     cobros.filter(c => c.metodo === 'SPEI'     && c.estado === 'pagado').reduce((a, c) => a + c.total, 0),
        CoDi:     cobros.filter(c => c.metodo === 'CoDi'     && c.estado === 'pagado').reduce((a, c) => a + c.total, 0),
        Efectivo: cobros.filter(c => c.metodo === 'Efectivo' && c.estado === 'pagado').reduce((a, c) => a + c.total, 0),
      },
    };
  }

  return {
    iniciarCobro,
    iniciarSPEI,
    verificarSPEI,
    iniciarTC,
    confirmarPago,
    cancelarCobro,
    emitirFactura,
    getEstadisticas,
  };
})();
