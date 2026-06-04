/**
 * EduPago — Demo API (modo sin servidor PHP)
 * 
 * Intercepta window.fetch y, si la URL apunta a api.php pero
 * el servidor responde con HTML/PHP crudo (no JSON), devuelve
 * una respuesta simulada localmente.
 * 
 * En producción (Hostinger con PHP) esto nunca se activa porque
 * api.php devuelve JSON válido y el flag se queda en false.
 */
const DemoAPI = (() => {

  // ── Respuestas simuladas por acción ───────────────────────────────────────
  const HANDLERS = {

    obtener_clabe: (body) => ({
      success:      true,
      clabe:        '646180633010000055',
      banco:        'STP — Sistema de Transferencias y Pagos',
      beneficiario: body.escuela || 'Paga la Escuela S.C.',
      referencia:   (body.referencia || body.folio || 'REF-0000').toUpperCase(),
      instruccion:  `Escribe como concepto: ${(body.referencia || body.folio || 'REF-0000').toUpperCase()}`,
      es_fija:      true,
      _modo:        'demo',
    }),

    verificar_spei: (body) => {
      // Consulta el estado real del cobro en localStorage (puesto por simular_spei)
      // Busca con la referencia tal cual Y en mayúsculas (por si hay diferencia de case)
      const ref  = (body.referencia || '').trim();
      const refUp = ref.toUpperCase();

      // Buscar todas las claves de pagos simulados y comparar sin case
      let pago = null;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith('edupago_spei_sim_')) continue;
        const storedRef = k.replace('edupago_spei_sim_', '').toUpperCase();
        if (storedRef === refUp || storedRef.includes(refUp) || refUp.includes(storedRef)) {
          try { pago = JSON.parse(localStorage.getItem(k)); } catch(e) {}
          if (pago) break;
        }
      }

      if (pago && pago.pagado) {
        return {
          success:      true, pagado: true,
          monto:        pago.monto,
          monto_pesos:  (pago.monto / 100).toFixed(2),
          clave_rastreo:'SIM-' + Date.now(),
          autorizacion: pago.autorizacion,
          nombre_emisor:pago.emisor || '',
          fecha:        new Date().toISOString().slice(0,10),
          _modo:        'demo',
        };
      }
      return { success: true, pagado: false, _modo: 'demo' };
    },

    simular_spei: (body) => {
      const ref     = (body.referencia || '').toUpperCase();
      const monto   = Math.round(parseFloat(body.monto || 0) * 100);
      const auth    = Math.floor(Math.random() * 90000000) + 10000000;
      if (!ref || monto <= 0) {
        return { success: false, error: 'Referencia y monto requeridos' };
      }
      // Guardar en localStorage para que verificar_spei lo encuentre
      localStorage.setItem('edupago_spei_sim_' + ref, JSON.stringify({
        pagado: true, monto, autorizacion: auth,
        emisor: (body.emisor || 'DEMO').toUpperCase(),
        fecha:  new Date().toISOString().slice(0,10),
      }));
      return {
        success:      true,
        autorizacion: auth,
        mensaje:      'Pago simulado (modo demo local). El polling detectará en ~10s.',
        _modo:        'demo',
      };
    },

    generar_cfdi: (body) => {
      const uuid = 'DEMO-' + [4,2,2,2,6].map(n =>
        Math.random().toString(16).slice(2, 2+n).toUpperCase()
      ).join('-');
      const total    = parseFloat(body.total || 0);
      const subtotal = Math.round((total / 1.16) * 100) / 100;
      const iva      = Math.round((total - subtotal) * 100) / 100;
      const serie    = 'A';
      const folio    = String(Math.floor(Math.random() * 9999)).padStart(6, '0');
      const fechaTs  = new Date().toISOString().replace('T', 'T').slice(0,19);
      const escNom   = body.escuela_nombre || 'EduPago S.C.';
      const escRFC   = body.escuela_rfc    || 'EDU000101AAA';

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante
  xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd"
  Version="4.0" Serie="${serie}" Folio="${folio}" Fecha="${fechaTs}"
  Sello="[DEMO-SIN-SELLO]" FormaPago="03" NoCertificado="00000000000000000000"
  Certificado="[DEMO]" SubTotal="${subtotal}" Moneda="MXN" Total="${total}"
  TipoDeComprobante="I" Exportacion="01" MetodoPago="PUE" LugarExpedicion="97130">
  <cfdi:Emisor Rfc="${escRFC}" Nombre="${escNom}" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="${body.rfc || 'XAXX010101000'}"
    Nombre="${body.razon_social || 'PUBLICO EN GENERAL'}"
    DomicilioFiscalReceptor="97000"
    RegimenFiscalReceptor="${body.regimen || '616'}"
    UsoCFDI="${body.uso_cfdi || 'D10'}"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="86101800" ClaveUnidad="ACT" Cantidad="1"
      Descripcion="${(body.descripcion || 'Servicios educativos').replace(/&/g,'&amp;')}"
      ValorUnitario="${subtotal}" Importe="${subtotal}" ObjetoImp="02">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="${subtotal}" Impuesto="002" TipoFactor="Tasa"
            TasaOCuota="0.160000" Importe="${iva}"/>
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="${iva}">
    <cfdi:Traslados>
      <cfdi:Traslado Base="${subtotal}" Impuesto="002" TipoFactor="Tasa"
        TasaOCuota="0.160000" Importe="${iva}"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
      Version="1.1" UUID="${uuid}" FechaTimbrado="${fechaTs}"
      RfcProvCertif="SAT970701NN3" NoCertificadoSAT="20001000000300023223"
      SelloSAT="[DEMO-SIN-SELLO-SAT]" SelloCFD="[DEMO-SIN-SELLO-CFD]"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

      return {
        success:        true,
        uuid,
        folio_fiscal:   uuid,
        serie,
        folio,
        fecha_timbrado: fechaTs,
        subtotal, iva, total,
        xml,
        qr_url: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent('https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=' + uuid)}`,
        nota:   'DEMO local — en producción con PHP se genera con PAC real.',
        _modo:  'demo',
      };
    },

    generar_liga: (body) => ({
      success:    true,
      url:        'https://pagadetodo.mx/demo-liga/' + Math.random().toString(36).slice(2),
      referencia: '00000' + String(Math.floor(Math.random() * 999999)).padStart(9, '0'),
      qr_url:     'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=DEMO_LIGA',
      _modo:      'demo',
    }),
  };

  // ── Parche de fetch ────────────────────────────────────────────────────────
  const _originalFetch = window.fetch.bind(window);
  let _modoDemo = null; // null = sin verificar, true = demo, false = PHP real

  async function patchedFetch(url, options) {
    // Solo interceptar llamadas a api.php
    if (typeof url !== 'string' || !url.includes('api.php')) {
      return _originalFetch(url, options);
    }

    // Si ya sabemos que PHP funciona, dejar pasar
    if (_modoDemo === false) return _originalFetch(url, options);

    // Si ya sabemos que estamos en demo, responder directo
    if (_modoDemo === true) return demoResponse(url, options);

    // Primera llamada: probar si PHP responde con JSON válido
    try {
      const probe = await _originalFetch(url, options);
      const clone = probe.clone();
      const text  = await clone.text();
      // Si empieza con '<' es HTML/PHP crudo → modo demo
      if (text.trimStart().startsWith('<')) {
        console.warn('[EduPago] PHP no disponible → modo demo local activado');
        _modoDemo = true;
        return demoResponse(url, options);
      }
      // PHP responde JSON → modo real
      _modoDemo = false;
      return probe;
    } catch(e) {
      // Error de red → modo demo
      console.warn('[EduPago] Error de red → modo demo:', e.message);
      _modoDemo = true;
      return demoResponse(url, options);
    }
  }

  function demoResponse(url, options) {
    // Extraer action de la URL: api.php?action=XXX
    const action = new URL(url, 'http://localhost').searchParams.get('action') || '';
    let body = {};
    try { body = JSON.parse(options?.body || '{}'); } catch(e) {}

    const handler = HANDLERS[action];
    const result  = handler ? handler(body) : { success: false, error: 'Acción no implementada en demo: ' + action };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Activar el parche
  window.fetch = patchedFetch;

  // Banner visual de modo demo
  function mostrarBannerDemo() {
    if (document.getElementById('demo-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'demo-banner';
    banner.style.cssText = `
      position:fixed; bottom:16px; right:16px; z-index:9999;
      background:#1e3a8a; border:1px solid #3b82f6; border-radius:10px;
      padding:10px 16px; font-size:12px; color:#93c5fd;
      font-family:'DM Sans',system-ui,sans-serif; max-width:280px;
      box-shadow:0 4px 20px rgba(0,0,0,.4);
    `;
    banner.innerHTML = `
      <div style="font-weight:700;color:#60a5fa;margin-bottom:3px">🧪 Modo Demo Local</div>
      <div style="opacity:.8">PHP no detectado. Los pagos SPEI, TC y CFDI funcionan en modo simulado. Sube el proyecto a Hostinger para activar el backend real.</div>
      <button onclick="this.parentElement.remove()" style="margin-top:6px;background:rgba(255,255,255,.1);border:none;color:#93c5fd;padding:3px 10px;border-radius:6px;cursor:pointer;font-size:11px">Entendido ✓</button>
    `;
    document.body.appendChild(banner);
  }

  // Mostrar banner cuando se active el modo demo
  const _origDemo = demoResponse;
  function demoResponseWithBanner(url, options) {
    setTimeout(mostrarBannerDemo, 100);
    return _origDemo(url, options);
  }
  // Reemplazar internamente
  Object.defineProperty(window, '_edupagoDemoActive', {
    get: () => _modoDemo,
    configurable: true
  });

  return { activar: () => { _modoDemo = true; mostrarBannerDemo(); } };
})();
