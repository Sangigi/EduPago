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
    const data    = _getData();
    const speiPend = data.cobros.filter(c => c.metodo === 'SPEI' && c.estado === 'pendiente');
    if (!speiPend.length) return;

    for (const cobro of speiPend) {
      const ref   = cobro.referencia_spei || cobro.referencia || cobro.folio;
      const clabe = cobro.clabe || null;
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
            const updated = CobroController.confirmarPago(prev, cobro.id, {
              transaccion: json.clave_rastreo || json.autorizacion,
              auth_code:   String(json.autorizacion || ''),
            });
            AppModel.save(updated);
            return updated;
          });
          if (_onConfirm) _onConfirm(cobro, json);
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
