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
          body:    JSON.stringify({ referencia: ref, clabe }),
        });
        const json = await resultado.json();
        if (json.success && json.pagado) {
          // Confirmar el cobro en el estado global
          _setData(prev => {
            try {
              const updated = CobroController.confirmarPago(prev, cobro.id, {
                transaccion: json.clave_rastreo || json.autorizacion,
                auth_code:   String(json.autorizacion || ''),
              });
              AppModel.save(updated);
              return updated;
            } catch (errConfirm) {
              // Nunca dejar que un error aquí rompa el render (pantalla en blanco)
              console.error('[SpeiPoller] Error al confirmar pago:', errConfirm);
              return prev;
            }
          });
          if (_onConfirm) {
            try { _onConfirm(cobro, json); } catch (errCb) { console.error('[SpeiPoller] Error en onConfirm:', errCb); }
          }
          console.log('[SpeiPoller] Confirmado:', ref, cobro.cliente);
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
