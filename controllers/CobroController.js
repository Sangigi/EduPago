/**
 * CONTROLLER — CobroController
 * Maneja toda la lógica de cobros: crear, cancelar, marcar pagado,
 * generar CLABE para SPEI, payload CoDi, verificación de pagos.
 */
const CobroController = (() => {

  /**
   * Inicia un cobro. Si el método es SPEI o CoDi, genera los datos
   * correspondientes y deja el cobro en estado 'pendiente'.
   * Para TC y Efectivo lo marca como 'pagado' inmediatamente.
   */
  function iniciarCobro(data, { carrito, cliente, metodo }) {
    const folio = AppModel.nextFolio(data.cobros);
    const total = carrito.reduce((a, i) => a + i.precio * i.qty, 0);
    const id = AppModel.nextId(data.cobros);

    const cobro = {
      id,
      folio,
      cliente_id: cliente?.id || null,
      cliente: cliente?.nombre || 'Cliente general',
      items: carrito.map(i => ({ nombre: i.nombre, qty: i.qty, precio: i.precio })),
      total,
      metodo,
      estado: (metodo === 'TC' || metodo === 'Efectivo') ? 'pagado' : 'pendiente',
      fecha: new Date().toISOString().slice(0, 10),
      factura: false,
      referencia: folio,
    };

    // Para SPEI: generar CLABE interbancaria dinámica
    if (metodo === 'SPEI') {
      cobro.clabe = AppModel.generarCLABE(total, id);
      cobro.estado = 'pendiente';
      cobro.spei_expira = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    }

    // Para CoDi: generar payload de QR
    if (metodo === 'CoDi') {
      cobro.codi_payload = AppModel.generarCodiPayload(cobro);
      cobro.estado = 'pendiente';
      cobro.codi_expira = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    }

    // Para TC: generar referencia de autorización simulada
    if (metodo === 'TC') {
      cobro.auth_code = 'AUTH-' + String(Math.floor(Math.random() * 999999)).padStart(6, '0');
    }

    const nuevosCobros = [...data.cobros, cobro];

    // Actualizar saldo del cliente si es pendiente
    let nuevosClientes = data.clientes;
    if (cobro.estado === 'pendiente' && cobro.cliente_id) {
      nuevosClientes = data.clientes.map(c =>
        c.id === cobro.cliente_id
          ? { ...c, saldo_pendiente: (c.saldo_pendiente || 0) + total }
          : c
      );
    }

    return {
      data: { ...data, cobros: nuevosCobros, clientes: nuevosClientes },
      cobro,
    };
  }

  /**
   * Confirma manualmente un pago pendiente (SPEI/CoDi).
   */
  function confirmarPago(data, cobroId) {
    let clienteId = null;
    let total = 0;

    const nuevosCobros = data.cobros.map(c => {
      if (c.id !== cobroId) return c;
      clienteId = c.cliente_id;
      total = c.total;
      return {
        ...c,
        estado: 'pagado',
        fecha_pago: new Date().toISOString(),
        auth_code: c.auth_code || ('CONF-' + String(Math.floor(Math.random() * 999999)).padStart(6, '0')),
      };
    });

    // Reducir saldo pendiente del cliente
    let nuevosClientes = data.clientes;
    if (clienteId) {
      nuevosClientes = data.clientes.map(c =>
        c.id === clienteId
          ? { ...c, saldo_pendiente: Math.max(0, (c.saldo_pendiente || 0) - total) }
          : c
      );
    }

    return { ...data, cobros: nuevosCobros, clientes: nuevosClientes };
  }

  /**
   * Cancela un cobro pendiente.
   */
  function cancelarCobro(data, cobroId) {
    let clienteId = null;
    let total = 0;
    let esPendiente = false;

    const nuevosCobros = data.cobros.map(c => {
      if (c.id !== cobroId) return c;
      esPendiente = c.estado === 'pendiente';
      clienteId = c.cliente_id;
      total = c.total;
      return { ...c, estado: 'cancelado' };
    });

    let nuevosClientes = data.clientes;
    if (esPendiente && clienteId) {
      nuevosClientes = data.clientes.map(c =>
        c.id === clienteId
          ? { ...c, saldo_pendiente: Math.max(0, (c.saldo_pendiente || 0) - total) }
          : c
      );
    }

    return { ...data, cobros: nuevosCobros, clientes: nuevosClientes };
  }

  /**
   * Emite factura para un cobro pagado.
   */
  function emitirFactura(data, cobroId, datosFiscales) {
    const nuevosCobros = data.cobros.map(c => {
      if (c.id !== cobroId) return c;
      return {
        ...c,
        factura: true,
        cfdi_uuid: 'CFDI-' + Date.now() + '-' + String(Math.random()).slice(2, 8).toUpperCase(),
        datos_fiscales: datosFiscales,
        fecha_cfdi: new Date().toISOString(),
      };
    });
    return { ...data, cobros: nuevosCobros };
  }

  /**
   * Simula la verificación automática de un pago SPEI via webhook.
   * En producción esto lo haría el servidor al recibir el webhook de STP/Pagadetodo.
   */
  function simularWebhookSPEI(data, cobroId, callback) {
    // Simula recepción del webhook en 3-8 segundos
    const delay = 3000 + Math.random() * 5000;
    return setTimeout(() => {
      const nuevoData = confirmarPago(data, cobroId);
      callback(nuevoData);
    }, delay);
  }

  /**
   * Simula la verificación de CoDi (polling cada 3s por 5 minutos).
   */
  function simularPollingCoDi(data, cobroId, onPagado, onExpirado) {
    let intentos = 0;
    const maxIntentos = 20; // 20 * 5s = 100s ~ 1.6 min demo
    const interval = setInterval(() => {
      intentos++;
      // 25% de probabilidad de "recibir" el pago en cada intento
      if (Math.random() < 0.25) {
        clearInterval(interval);
        const nuevoData = confirmarPago(data, cobroId);
        onPagado(nuevoData);
      } else if (intentos >= maxIntentos) {
        clearInterval(interval);
        onExpirado();
      }
    }, 5000);
    return interval;
  }

  /**
   * Genera estadísticas rápidas del dashboard.
   */
  function getEstadisticas(cobros) {
    const hoy = new Date().toISOString().slice(0, 10);
    return {
      totalCobrado: cobros.filter(c => c.estado === 'pagado').reduce((a, c) => a + c.total, 0),
      totalPendiente: cobros.filter(c => c.estado === 'pendiente').reduce((a, c) => a + c.total, 0),
      cobrosHoy: cobros.filter(c => c.fecha === hoy && c.estado === 'pagado').reduce((a, c) => a + c.total, 0),
      totalCobros: cobros.length,
      cobradosPorMetodo: {
        TC: cobros.filter(c => c.metodo === 'TC' && c.estado === 'pagado').reduce((a, c) => a + c.total, 0),
        SPEI: cobros.filter(c => c.metodo === 'SPEI' && c.estado === 'pagado').reduce((a, c) => a + c.total, 0),
        CoDi: cobros.filter(c => c.metodo === 'CoDi' && c.estado === 'pagado').reduce((a, c) => a + c.total, 0),
        Efectivo: cobros.filter(c => c.metodo === 'Efectivo' && c.estado === 'pagado').reduce((a, c) => a + c.total, 0),
      },
    };
  }

  return {
    iniciarCobro,
    confirmarPago,
    cancelarCobro,
    emitirFactura,
    simularWebhookSPEI,
    simularPollingCoDi,
    getEstadisticas,
  };
})();