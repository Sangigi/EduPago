// views/components/Comprobantes.js
// Generación de comprobantes de pago (Efectivo y SPEI), compartida entre
// Caja y el Portal de Familia.
//
// El HTML de las plantillas es el mismo que ya vivía dentro de Caja.js —no
// se rediseñó nada—, solo se movieron aquí y se parametrizaron para no
// depender de variables de ámbito de esa vista. Así Caja y el Portal usan
// exactamente el mismo comprobante, en vez de mantener dos copias que se
// puedan desincronizar.

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Ruta relativa -> absoluta contra el sitio (necesario porque el documento
// se abre desde un blob:, que no comparte base con el sitio).
function rutaAbsoluta(ruta) {
  try { return new URL(ruta, window.location.href).href; } catch (e) { return ruta; }
}

function _fmtDinero(n) {
  return (typeof fmt === 'function')
    ? fmt(n)
    : '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
}

/* ── Número a letras ── */
function numeroALetras(monto) {
  const entero = Math.floor(monto);
  const centavos = Math.round((monto - entero) * 100);
  const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
  const DIEC = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
  const VEINT = ['VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
  const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];
  const menorMil = n => {
    if (n === 0) return '';
    if (n === 100) return 'CIEN';
    let out = '';
    const c = Math.floor(n / 100), resto = n % 100;
    if (c > 0) out += CENTENAS[c] + ' ';
    if (resto > 0) {
      if (resto < 10) out += UNIDADES[resto];
      else if (resto < 20) out += DIEC[resto - 10];
      else if (resto < 30) out += VEINT[resto - 20];
      else {
        const d = Math.floor(resto / 10), u = resto % 10;
        out += DECENAS[d] + (u > 0 ? ' Y ' + UNIDADES[u] : '');
      }
    }
    return out.trim();
  };
  const convertir = n => {
    if (n === 0) return 'CERO';
    let out = '';
    const millones = Math.floor(n / 1000000);
    const miles = Math.floor((n % 1000000) / 1000);
    const resto = n % 1000;
    if (millones > 0) out += (millones === 1 ? 'UN MILLÓN ' : menorMil(millones) + ' MILLONES ');
    if (miles > 0) out += (miles === 1 ? 'MIL ' : menorMil(miles) + ' MIL ');
    if (resto > 0) out += menorMil(resto);
    return out.trim();
  };
  return `${convertir(entero)} PESOS ${String(centavos).padStart(2, '0')}/100 M.N.`;
}

const TIENDAS_PARTICIPANTES = [
  { nombre: '7-Eleven', archivo: '7-eleven.webp' },
  { nombre: 'Soriana', archivo: 'soriana.webp' },
  { nombre: 'Farmacias del Ahorro', archivo: 'farmacias-del-ahorro.webp' },
  { nombre: 'Farmacias Benavides', archivo: 'benavides.webp' },
  { nombre: 'City Club', archivo: 'city-club.webp' },
  { nombre: 'Extra', archivo: 'extra.webp' },
  { nombre: 'Walmart', archivo: 'walmart.webp' },
  { nombre: 'Bodega Aurrerá', archivo: 'bodega-aurrera.webp' },
  { nombre: 'Suburbia', archivo: 'suburbia.webp' },
  { nombre: "Sam's Club", archivo: 'sams-club.webp' },
  { nombre: 'Circle K', archivo: 'circle-k.webp' },
  { nombre: 'Abarrotes Monterrey', archivo: 'abarrotes-monterrey.webp' },
];

// Abre un HTML autocontenido en una pestaña nueva vía Blob URL (evita el
// <script> inline que la CSP del sitio bloquea) y dispara la impresión
// apenas termina de cargar. Reutilizado por los comprobantes de Efectivo y
// SPEI, tanto desde Caja como desde el Portal de Familia.
function abrirDocumentoImprimible(html) {
  const blob = new Blob([html], { type: 'text/html' });
  const blobUrl = URL.createObjectURL(blob);
  const w = window.open(blobUrl, '_blank');
  if (!w) { alert('Tu navegador bloqueó la ventana emergente. Habilítala para ver el documento.'); return; }
  const configurarVentana = () => {
    try {
      const doc = w.document;
      doc.querySelectorAll('.js-imgfallback').forEach(img => {
        img.addEventListener('error', () => { img.style.display = 'none'; }, { once: true });
      });
      const btn = doc.getElementById('btnImprimir');
      if (btn) btn.addEventListener('click', () => w.print());
      setTimeout(() => { try { w.print(); } catch (e) {} }, 400);
    } catch (e) { /* la ventana pudo cerrarse antes de cargar */ }
  };
  if (w.document.readyState === 'complete') configurarVentana();
  else w.addEventListener('load', configurarVentana);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}

const _CSS_COMPROBANTE = `
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; background: #eef0f5; font-family: 'Segoe UI', Arial, sans-serif; color: #1e2430; }
  .voucher { max-width: 520px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,.12); }
  .v-top { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 12px; border-bottom: 3px solid #282d65; }
  .v-top img { height: 48px; max-width: 200px; object-fit: contain; }
  .v-titulo { text-align: right; }
  .v-titulo h1 { margin: 0; font-size: 20px; color: #282d65; }
  .v-titulo span { font-size: 11px; color: #6b7280; }
  .v-body { padding: 18px 24px; }
  .v-cliente { display: flex; justify-content: space-between; gap: 12px; font-size: 12.5px; margin-bottom: 14px; }
  .v-cliente .lbl { color: #6b7280; font-size: 10.5px; text-transform: uppercase; letter-spacing: .4px; }
  .v-concepto { background: #f4f5f9; border-radius: 10px; padding: 10px 14px; font-size: 12.5px; margin-bottom: 16px; }
  .v-total-row { display: flex; align-items: center; justify-content: space-between; background: #282d65; color: #fff; border-radius: 12px; padding: 14px 18px; margin-bottom: 16px; }
  .v-total-row .lbl { font-size: 11px; opacity: .85; text-transform: uppercase; letter-spacing: .5px; }
  .v-total-row .monto { font-size: 26px; font-weight: 800; }
  .v-letras { font-size: 10.5px; color: #6b7280; text-align: right; margin: -10px 0 16px; }
  .v-barcode { text-align: center; margin-bottom: 6px; }
  .v-barcode img { max-width: 100%; height: 64px; }
  .v-barcode svg { max-width: 100%; height: 72px; display: block; margin: 0 auto; }
  .v-ref { text-align: center; font-family: 'Courier New', monospace; font-size: 15px; font-weight: 700; letter-spacing: 1px; word-break: break-all; margin-bottom: 18px; }
  .v-venc { text-align: center; font-size: 11.5px; color: #b45309; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 8px; margin-bottom: 18px; }
  .v-spei { background: #f4f5f9; border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; }
  .v-spei-row { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding: 6px 0; border-bottom: 1px solid #e5e7eb; }
  .v-spei-row:last-child { border-bottom: none; }
  .v-spei-lbl { font-size: 10.5px; color: #6b7280; text-transform: uppercase; letter-spacing: .4px; white-space: nowrap; }
  .v-spei-val { font-size: 13px; font-weight: 700; color: #1e2430; text-align: right; word-break: break-word; }
  .v-clabe { font-family: 'Courier New', monospace; font-size: 15px; letter-spacing: 1px; }
  .v-warn { text-align: center; font-size: 11.5px; color: #b45309; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 8px; margin-bottom: 18px; }
  .v-instr h3 { font-size: 12.5px; margin: 0 0 8px; color: #282d65; }
  .v-instr ol, .v-instr ul { margin: 0 0 16px; padding-left: 20px; font-size: 12px; color: #374151; line-height: 1.6; }
  .v-tiendas { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 18px; }
  .v-tienda { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 4px; padding: 8px 6px; border-radius: 10px; background: #f4f5f9; border: 1px solid #e5e7eb; font-size: 9.5px; font-weight: 700; color: #282d65; line-height: 1.2; min-height: 48px; }
  .v-tienda img { max-width: 100%; max-height: 26px; object-fit: contain; }
  .v-foot { text-align: center; font-size: 10.5px; color: #9ca3af; padding: 14px 24px; border-top: 1px solid #e5e7eb; }
  @media print {
    body { background: #fff; padding: 0; }
    .voucher { box-shadow: none; max-width: 100%; }
    .v-noprint { display: none; }
  }
`;

// ── Comprobante de pago en efectivo ──
// cobro: { folio, total, descripcion, items, referencia, barcode_url, vencimiento }
// cliente: { nombre } | null   familia: { contacto, nombre, email } | null
function generarComprobanteEfectivo({ cobro, cliente, familia, escuela }) {
  const esc = escHtml;
  const abs = rutaAbsoluta;
  const total = Number(cobro.total || 0);
  const logo = escuela?.logo_url || 'assets/logo.jpeg';
  const nombreEscuela = escuela?.nombre || 'Paga la Escuela';
  const hoy = new Date();
  const fechaEmision = hoy.toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const vencimiento = cobro.vencimiento
    ? new Date(cobro.vencimiento + 'T12:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    : '';

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Formato de pago — ${esc(cobro.folio || '')}</title>
<style>${_CSS_COMPROBANTE}</style>
</head><body>
  <div class="voucher">
    <div class="v-top">
      <img src="${esc(abs(logo))}" alt="${esc(nombreEscuela)}" class="js-imgfallback">
      <div class="v-titulo"><h1>Formato de Pago</h1><span>${esc(nombreEscuela)}</span></div>
    </div>
    <div class="v-body">
      <div class="v-cliente">
        <div><div class="lbl">Alumno</div>${esc(cliente?.nombre || 'Cliente general')}</div>
        ${familia ? `<div style="text-align:right"><div class="lbl">Contacto</div>${esc(familia.contacto || familia.nombre || '')}${familia.email ? `<br>${esc(familia.email)}` : ''}</div>` : ''}
      </div>
      <div class="v-concepto">
        <strong>Concepto:</strong> ${esc(cobro.descripcion || (cobro.items || []).map(i => i.nombre).filter(Boolean).join(', ') || 'Pago escolar')}<br>
        <strong>Folio:</strong> ${esc(cobro.folio || '')} &nbsp;·&nbsp; <strong>Fecha de emisión:</strong> ${esc(fechaEmision)}
      </div>
      <div class="v-total-row">
        <span class="lbl">Total a pagar</span>
        <span class="monto">${_fmtDinero(total)}</span>
      </div>
      <div class="v-letras">(${esc(numeroALetras(total))})</div>
      ${cobro.barcode_url
        ? `<div class="v-barcode"><img src="${esc(cobro.barcode_url)}" alt="Código de barras"></div>`
        : (typeof codigoBarrasSVG === 'function' && cobro.referencia
            ? `<div class="v-barcode">${codigoBarrasSVG(cobro.referencia, { alto: 80, modulo: 2, mostrarTexto: false })}</div>`
            : '')}
      <div class="v-ref">${esc(cobro.referencia || '')}</div>
      ${vencimiento ? `<div class="v-venc">Acude a pagar antes del ${esc(vencimiento)}</div>` : ''}
      <div class="v-instr">
        <h3>Tiendas participantes</h3>
        <div class="v-tiendas">
          ${TIENDAS_PARTICIPANTES.map(t => `<div class="v-tienda"><img src="${esc(abs('assets/tiendas/' + t.archivo))}" alt="${esc(t.nombre)}" class="js-imgfallback">${esc(t.nombre)}</div>`).join('')}
        </div>
        <h3>Instrucciones para realizar tu pago</h3>
        <ul>
          <li>Acude a cualquier tienda de conveniencia o farmacia participante que reciba pagos de servicios.</li>
          <li>Solicita hacer un pago de servicios y proporciona el código de barras o el número de referencia de este formato.</li>
          <li>Realiza tu pago en efectivo. La tienda te entregará un ticket como comprobante — consérvalo por cualquier aclaración.</li>
          <li>Tu pago se reflejará automáticamente en ${esc(nombreEscuela)} en cuanto la tienda lo confirme.</li>
        </ul>
      </div>
      <button class="v-noprint" id="btnImprimir" style="width:100%; padding:12px; border:none; border-radius:10px; background:#bdcf00; color:#1a1a1a; font-weight:700; font-size:13px; cursor:pointer;">Imprimir / Guardar como PDF</button>
    </div>
    <div class="v-foot">Cualquier duda sobre tu pago, contacta a la administración de ${esc(nombreEscuela)}.</div>
  </div>
</body></html>`;
}

// ── Comprobante de instrucciones SPEI ──
// cobro: { folio, total, descripcion, items, referencia_spei|referencia, clabe,
//          clabe_es_individual, banco, beneficiario }
function generarComprobanteSPEI({ cobro, cliente, familia, escuela }) {
  const esc = escHtml;
  const abs = rutaAbsoluta;
  const total = Number(cobro.total || 0);
  const logo = escuela?.logo_url || 'assets/logo.jpeg';
  const nombreEscuela = escuela?.nombre || 'Paga la Escuela';
  const hoy = new Date();
  const fechaEmision = hoy.toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const concepto = cobro.referencia_spei || cobro.referencia || cobro.folio || '';
  const clabeEspaciada = cobro.clabe ? cobro.clabe.match(/.{1,4}/g).join(' ') : '—';

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Instrucciones de pago SPEI — ${esc(cobro.folio || '')}</title>
<style>${_CSS_COMPROBANTE}</style>
</head><body>
  <div class="voucher">
    <div class="v-top">
      <img src="${esc(abs(logo))}" alt="${esc(nombreEscuela)}" class="js-imgfallback">
      <div class="v-titulo"><h1>Instrucciones de pago SPEI</h1><span>${esc(nombreEscuela)}</span></div>
    </div>
    <div class="v-body">
      <div class="v-cliente">
        <div><div class="lbl">Alumno</div>${esc(cliente?.nombre || 'Cliente general')}</div>
        ${familia ? `<div style="text-align:right"><div class="lbl">Contacto</div>${esc(familia.contacto || familia.nombre || '')}${familia.email ? `<br>${esc(familia.email)}` : ''}</div>` : ''}
      </div>
      <div class="v-concepto">
        <strong>Concepto:</strong> ${esc(cobro.descripcion || (cobro.items || []).map(i => i.nombre).filter(Boolean).join(', ') || 'Pago escolar')}<br>
        <strong>Folio:</strong> ${esc(cobro.folio || '')} &nbsp;·&nbsp; <strong>Fecha de emisión:</strong> ${esc(fechaEmision)}
      </div>
      <div class="v-total-row">
        <span class="lbl">Total a transferir</span>
        <span class="monto">${_fmtDinero(total)}</span>
      </div>
      <div class="v-letras">(${esc(numeroALetras(total))})</div>
      <div class="v-spei">
        <div class="v-spei-row">
          <span class="v-spei-lbl">Banco</span>
          <span class="v-spei-val">${esc(cobro.banco || 'STP')}</span>
        </div>
        <div class="v-spei-row">
          <span class="v-spei-lbl">Beneficiario</span>
          <span class="v-spei-val">${esc(cobro.beneficiario || nombreEscuela)}</span>
        </div>
        <div class="v-spei-row">
          <span class="v-spei-lbl">CLABE interbancaria</span>
          <span class="v-spei-val v-clabe">${esc(clabeEspaciada)}</span>
        </div>
        ${concepto ? `<div class="v-spei-row">
          <span class="v-spei-lbl">${cobro.clabe_es_individual ? 'Concepto (opcional)' : 'Concepto (obligatorio)'}</span>
          <span class="v-spei-val v-clabe">${esc(concepto)}</span>
        </div>` : ''}
      </div>
      ${cobro.clabe_es_individual
        ? `<div class="v-warn">Esta CLABE es exclusiva de ${esc(cliente?.nombre || 'este alumno')}. Cualquier transferencia recibida en ella se identifica automáticamente, sin importar el concepto.</div>`
        : `<div class="v-warn">Copia el concepto exactamente como aparece arriba — es indispensable para identificar tu pago.</div>`}
      <div class="v-instr">
        <h3>Instrucciones para realizar tu pago</h3>
        <ol>
          <li>Abre la app de tu banco y elige la opción de transferencia SPEI.</li>
          <li>Captura la CLABE interbancaria y el monto exacto que se muestran arriba.</li>
          ${cobro.clabe_es_individual ? '' : '<li>Copia el concepto de pago exactamente como se indica — sin este dato el pago no se puede identificar.</li>'}
          <li>Confirma y envía la transferencia. Guarda el comprobante que te entregue tu banco.</li>
          <li>Tu pago se reflejará automáticamente en ${esc(nombreEscuela)} en cuanto el banco confirme la transferencia (unos minutos en horario bancario).</li>
        </ol>
      </div>
      <button class="v-noprint" id="btnImprimir" style="width:100%; padding:12px; border:none; border-radius:10px; background:#bdcf00; color:#1a1a1a; font-weight:700; font-size:13px; cursor:pointer;">Imprimir / Guardar como PDF</button>
    </div>
    <div class="v-foot">Cualquier duda sobre tu pago, contacta a la administración de ${esc(nombreEscuela)}.</div>
  </div>
</body></html>`;
}

// Atajos de conveniencia: arman el HTML y abren la ventana en un solo paso.
function abrirComprobanteEfectivoModulo(datos) { abrirDocumentoImprimible(generarComprobanteEfectivo(datos)); }
function abrirComprobanteSPEIModulo(datos) { abrirDocumentoImprimible(generarComprobanteSPEI(datos)); }
