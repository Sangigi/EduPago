/**
 * EduPago — SPEI Global Poller
 * Revisa todos los cobros SPEI pendientes cada 10s,
 * sin importar en qué vista esté el usuario.
 * Funciona tanto en modo demo (localStorage) como con PHP real.
 */
const SpeiPoller = (() => {
  let _interval  = null;
  let _getData   = null;   // fn que retorna el estado actual de data
  let _setData   = null;   // fn que actualiza el estado global
  let _onConfirm = null;   // callback opcional cuando se confirma un pago
  const INTERVAL_MS = 8000; // cada 8 segundos

  async function checkPendientes() {
    if (!_getData || !_setData) return;
    const data = _getData();
    // Justo después del login, los datos aún pueden no haber llegado de la API.
    // Sin este guard, el primer chequeo (a 1s) tronaba con "cobros de null".
    if (!data || !Array.isArray(data.cobros)) return;
    const speiPend = data.cobros.filter(c => c.metodo === 'SPEI' && c.estado === 'pendiente');
    if (!speiPend.length) return;

    for (const cobro of speiPend) {
      // Solo usar referencia SPEI real — nunca el folio como fallback para evitar falsos positivos
      const ref   = cobro.referencia_spei || (cobro.referencia && cobro.referencia !== cobro.folio ? cobro.referencia : null);
      const clabe = cobro.clabe_individual || cobro.clabe || null;
      // Sin referencia real ni CLABE individual, no hay forma de verificar — saltar
      if (!ref && !clabe) continue;
      try {
        const resultado = await fetch('api.php?action=verificar_spei', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          // cobro_id es obligatorio para que el backend compare por el cobro
          // exacto — `ref` es la matrícula del alumno, compartida entre todos
          // sus cobros, así que sin cobro_id un pago de OTRO cobro del mismo
          // alumno podía confirmar por error este cobro pendiente sin que se
          // hubiera pagado.
          body:    JSON.stringify({ referencia: ref, clabe, cobro_id: cobro.id }),
        });
        const json = await resultado.json();
        if (json.success && json.pagado) {
          try {
            // CobroController.confirmarPago(cobroId, extra) es ASYNC y llama a la
            // API real (case 'confirmar_pago' en api.php) — antes se llamaba mal,
            // sin await y con (prev, cobro.id, extra), lo que guardaba una Promise
            // como si fuera el objeto `data` completo y volaba todo el dashboard
            // a 0 unos segundos después de cargar. Ahora se espera la respuesta y
            // solo se parchea el cobro/cliente afectado dentro del estado actual.
            const confirmacion = await CobroController.confirmarPago(cobro.id, {
              transaccion: json.clave_rastreo || json.autorizacion,
              auth_code:   String(json.autorizacion || ''),
            });
            _setData(prev => {
              if (!prev) return prev;
              const updated = {
                ...prev,
                cobros: (prev.cobros || []).map(c =>
                  c.id === cobro.id
                    ? { ...c, estado: 'pagado', auth_code: confirmacion.estado === 'pagado' ? (String(json.autorizacion || '') || c.auth_code) : c.auth_code }
                    : c
                ),
                clientes: confirmacion.cliente_id
                  ? (prev.clientes || []).map(cl =>
                      cl.id === confirmacion.cliente_id
                        ? { ...cl, saldo_pendiente: confirmacion.nuevo_saldo }
                        : cl
                    )
                  : (prev.clientes || []),
              };
              AppModel.save(updated);
              return updated;
            });
            if (_onConfirm) {
              try { _onConfirm(cobro, json); } catch (errCb) { console.error('[SpeiPoller] Error en onConfirm:', errCb); }
            }
            console.log('[SpeiPoller] Confirmado:', ref, cobro.cliente);
          } catch (errConfirm) {
            // Nunca dejar que un error aquí rompa el render (pantalla en blanco / datos en 0)
            console.error('[SpeiPoller] Error al confirmar pago:', errConfirm);
          }
        }
      } catch(e) {
        // Silencioso — next tick
      }
    }
  }

  function iniciar({ getData, setData, onConfirm } = {}) {
    _getData   = getData;
    _setData   = setData;
    _onConfirm = onConfirm;
    if (_interval) clearInterval(_interval);
    _interval = setInterval(checkPendientes, INTERVAL_MS);
    // Una verificación inmediata al iniciar
    setTimeout(checkPendientes, 1000);
    console.log('[SpeiPoller] Iniciado — revisando cada', INTERVAL_MS / 1000, 's');
  }

  function detener() {
    if (_interval) { clearInterval(_interval); _interval = null; }
  }

  function verificarAhora() {
    checkPendientes();
  }

  return { iniciar, detener, verificarAhora };
})();
