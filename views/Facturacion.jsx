/* views/Facturacion.jsx v3 — CFDI 4.0 + Simulador SPEI */
function Facturacion({ data, setData, escuela }) {
  const { useState } = React;

  const [tab, setTab]               = useState('pendientes');
  const [q, setQ]                   = useState('');
  const [modal, setModal]           = useState(null);
  const [cobroSel, setCobroSel]     = useState(null);
  const [cfdiVisor, setCfdiVisor]   = useState(null);
  const [loading, setLoading]       = useState(false);
  const [errMsg, setErrMsg]         = useState('');
  const [formFact, setFormFact]     = useState({
    rfc: '', razon_social: '', uso_cfdi: 'D10', regimen: '616', email: '', cp_receptor: '', domicilio: ''
  });
  const [simRef, setSimRef]         = useState('');
  const [simMonto, setSimMonto]     = useState('');
  const [simEmisor, setSimEmisor]   = useState('PADRE DE FAMILIA PRUEBA');
  const [simStatus, setSimStatus]   = useState(null);
  const [simMsg, setSimMsg]         = useState('');
  const [simLoading, setSimLoading] = useState(false);

  const cobrosEscuela  = data.cobros.filter(c => c.estado === 'pagado');
  const pendientesFact = cobrosEscuela.filter(c => !c.factura_cfdi);
  const emitidas       = cobrosEscuela.filter(c =>  c.factura_cfdi);
  const speiPendientes = data.cobros.filter(c => c.metodo === 'SPEI' && c.estado === 'pendiente');

  const USO_CFDI = {
    'D10': 'D10 — Pagos por servicios educativos (recomendado)',
    'G01': 'G01 — Adquisición de mercancias',
    'G03': 'G03 — Gastos en general',
    'D01': 'D01 — Honorarios médicos',
    'S01': 'S01 — Sin efectos fiscales',
  };
  const REGIMENES = {
    '616': '616 — Sin obligaciones fiscales (personas físicas)',
    '601': '601 — General Personas Morales',
    '612': '612 — Personas Físicas con Actividades Empresariales',
    '626': '626 — RESICO',
  };

  const abrirSolicitar = cobro => {
    const cli = data.clientes.find(c => c.id === cobro.cliente_id);
    // Pre-llenar con datos fiscales guardados en el perfil del cliente
    setCobroSel(cobro);
    setFormFact({
      rfc:          cli?.rfc_factura          || '',
      razon_social: cli?.razon_social_factura || '',
      cp_receptor:  cli?.cp_factura           || '',
      domicilio:    cli?.domicilio_factura     || '',
      regimen:      cli?.regimen_factura       || '616',
      uso_cfdi:     cli?.uso_cfdi_defecto      || 'D10',
      email:        cli?.email                || '',
    });
    setErrMsg('');
    setModal('solicitar');
  };

  const generarCFDI = async () => {
    if (!formFact.rfc || !formFact.razon_social || !formFact.cp_receptor) {
      setErrMsg('RFC, Razón Social y Código Postal son obligatorios'); return;
    }
    const rfcReg = /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/;
    if (!rfcReg.test(formFact.rfc)) {
      setErrMsg('RFC inválido. Ejemplo válido: XAXX010101000'); return;
    }
    setLoading(true); setErrMsg('');
    try {
      const res = await fetch('api.php?action=generar_cfdi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cobro_id:       cobroSel.id,
          rfc:            formFact.rfc,
          razon_social:   formFact.razon_social,
          cp_receptor:    formFact.cp_receptor,
          domicilio:      formFact.domicilio,       // <-- domicilio fiscal
          uso_cfdi:       formFact.uso_cfdi,
          regimen:        formFact.regimen,
          email:          formFact.email,
          total:          cobroSel.total,
          descripcion:    cobroSel.items.map(i => i.nombre).join(', '),
          escuela_rfc:    escuela?.rfc    || 'EDU000101AAA',
          escuela_nombre: escuela?.nombre || 'EduPago S.C.',
        }),
      });
      const cfdi = await res.json();
      if (!cfdi.success) throw new Error(cfdi.error || 'Error al generar CFDI');

      const newCobros = data.cobros.map(c =>
        c.id === cobroSel.id ? {
          ...c, factura: true,
          factura_cfdi: {
            uuid:          cfdi.uuid,
            folio_fiscal:  cfdi.folio_fiscal,
            serie:         cfdi.serie,
            folio:         cfdi.folio,
            fecha_timbrado:cfdi.fecha_timbrado,
            subtotal:      cfdi.subtotal,
            iva:           cfdi.iva,
            total:         cfdi.total,
            rfc_receptor:  formFact.rfc,
            razon:         formFact.razon_social,
            uso_cfdi:      formFact.uso_cfdi,
            cp_receptor:   formFact.cp_receptor, // <-- GUARDAR EN EL ESTADO
            email:         formFact.email,
            xml:           cfdi.xml, // Facturapi no devuelve el XML en crudo en la respuesta inicial. Te sugiero ignorar esto o cambiar el flujo de descarga (ver más abajo)
            qr_url:        cfdi.qr_url,
            facturapi_id:  cfdi.facturapi_id // <-- GUARDAR EL ID DE FACTURAPI
          }
        } : c
      );
      const newData = { ...data, cobros: newCobros };
      setData(newData);
      AppModel.save(newData);
      setCfdiVisor({ ...cfdi, rfc_receptor: formFact.rfc, razon: formFact.razon_social, cobro: cobroSel });
      setModal('visor');
    } catch(e) {
      setErrMsg(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Simulador SPEI — llama a api.php?action=simular_spei
  const simularSPEI = async () => {
    if (!simRef || !simMonto) { setSimStatus('error'); setSimMsg('Referencia y monto requeridos'); return; }
    setSimLoading(true); setSimStatus(null);
    try {
      const res = await fetch('api.php?action=simular_spei', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referencia: simRef.toUpperCase(), monto: parseFloat(simMonto), emisor: simEmisor }),
      });
      const r = await res.json();
      if (r.success) {
        setSimStatus('ok');
        setSimMsg('✓ Pago simulado. Auth: ' + r.autorizacion + '. El polling de la Caja lo detectará en ~10s.');
      } else throw new Error(r.error);
    } catch(e) {
      setSimStatus('error');
      setSimMsg(e.message || 'Error de conexión con el servidor PHP');
    } finally { setSimLoading(false); }
  };

  // ─── NUEVO: DESCAGAR XML Y PDF DESDE FACTURAPI ───
  // Facturapi no te da el string del XML cuando lo creas. Te da URLs públicas 
  // para descargar el XML y PDF, o debes hacer un GET a su API para obtener el binario.
  const descargarDocumento = async (cfdi, tipo) => {
    // tipo = 'xml' o 'pdf'
    if(!cfdi.facturapi_id) {
        alert("Este CFDI es simulado o antiguo y no tiene ID de Facturapi");
        return;
    }
    
    // Lo más sencillo es descargar directamente desde la URL de descarga de Facturapi (si la tienes configurada en tu dashboard)
    // O puedes crear un pequeño endpoint en api.php?action=descargar_cfdi&id=...&tipo=xml que haga el curl a Facturapi y devuelva el archivo
    // Para simplificar aquí, asumo que tienes habilitada la URL pública (verifica tu dashboard de Facturapi).
    // Si no, Facturapi te pide hacer un request a: https://www.facturapi.io/v2/invoices/{id}/xml
    
    // Una implementación simple que abre en nueva pestaña un hipotético endpoint tuyo
    window.open(`api.php?action=descargar_cfdi&id=${cfdi.facturapi_id}&tipo=${tipo}`, '_blank');
  };

  const filtrar = lista => !q ? lista :
    lista.filter(c => c.cliente.toLowerCase().includes(q.toLowerCase()) || c.folio.toLowerCase().includes(q.toLowerCase()));

  const tabStyle = active => ({
    padding: '8px 18px', borderRadius: 'var(--radius-sm)', fontSize: 13, cursor: 'pointer',
    fontWeight: active ? 600 : 400, border: 'none', background: 'transparent',
    color: active ? 'var(--accent)' : 'var(--ink-3)',
    borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent', transition: 'all .15s'
  });

  return (
    <div>
      {/* Banner */}
      <div style={{
        marginBottom: 20, padding: '16px 20px',
        background: 'linear-gradient(135deg,#1e3a8a 0%,#312e81 100%)',
        borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ fontSize: 36 }}>📄</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>Facturación CFDI 4.0</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', marginTop: 2 }}>
              Generación de XML timbrable · Listo para conectar a Facturama / SW SAPiens
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ textAlign: 'center', padding: '8px 16px', background: 'rgba(255,255,255,.1)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{emitidas.length}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.6)', textTransform: 'uppercase' }}>Emitidas</div>
          </div>
          <div style={{ textAlign: 'center', padding: '8px 16px', background: 'rgba(255,255,255,.1)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#fbbf24' }}>{pendientesFact.length}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.6)', textTransform: 'uppercase' }}>Sin factura</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border-glow)' }}>
        <button style={tabStyle(tab === 'pendientes')} onClick={() => setTab('pendientes')}>
          📋 Por facturar ({pendientesFact.length})
        </button>
        <button style={tabStyle(tab === 'emitidas')} onClick={() => setTab('emitidas')}>
          ✅ Emitidas ({emitidas.length})
        </button>
        <button style={tabStyle(tab === 'spei_sim')} onClick={() => setTab('spei_sim')}>
          🧪 Simulador SPEI
        </button>
      </div>

      {/* ── Pendientes ── */}
      {tab === 'pendientes' && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Cobros sin factura</div>
              <div className="card-sub">{pendientesFact.length} cobros pagados sin CFDI</div>
            </div>
          </div>
          <div className="search-bar" style={{ marginBottom: 16 }}>
            <span className="search-icon">🔍</span>
            <input placeholder="Buscar por folio o cliente…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Folio</th><th>Fecha</th><th>Cliente</th><th>Método</th><th>Total</th><th>Acción</th></tr>
              </thead>
              <tbody>
                {filtrar(pendientesFact).length === 0 && (
                  <tr><td colSpan={6}><div className="empty-state">
                    <div className="empty-icon">🎉</div>
                    <div className="empty-text">¡Todo facturado!</div>
                  </div></td></tr>
                )}
                {filtrar(pendientesFact).map(c => (
                  <tr key={c.id}>
                    <td><span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{c.folio}</span></td>
                    <td style={{ color: 'var(--ink-3)', fontSize: 12 }}>{c.fecha}</td>
                    <td style={{ fontSize: 13 }}>{c.cliente}</td>
                    <td><MetodoBadge metodo={c.metodo} /></td>
                    <td><span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{fmt(c.total)}</span></td>
                    <td>
                      <button className="btn btn-primary btn-sm" onClick={() => abrirSolicitar(c)}>
                        📄 Generar CFDI
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Emitidas ── */}
      {tab === 'emitidas' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">CFDIs emitidos</div>
            <div className="card-sub">{emitidas.length} facturas generadas</div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Folio</th><th>Cliente / RFC</th><th>UUID Fiscal</th><th>Fecha</th><th>Total</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {emitidas.length === 0 && (
                  <tr><td colSpan={6}><div className="empty-state">
                    <div className="empty-text">Sin facturas emitidas aún</div>
                  </div></td></tr>
                )}
                {emitidas.map(c => (
                  <tr key={c.id}>
                    <td><span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{c.folio}</span></td>
                    <td>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{c.cliente}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-4)', fontFamily: 'var(--mono)' }}>{c.factura_cfdi?.rfc_receptor}</div>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-3)' }}>
                        {c.factura_cfdi?.uuid?.slice(0, 18)}…
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--ink-3)' }}>{c.factura_cfdi?.fecha_timbrado?.slice(0, 10)}</td>
                    <td><span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--green)' }}>{fmt(c.total)}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => { setCfdiVisor({ ...c.factura_cfdi, cobro: c }); setModal('visor'); }}>
                          👁 Ver
                        </button>
                         {/* CAMBIO: Se usa la función para descargar de Facturapi */}
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => descargarDocumento(c.factura_cfdi, 'xml')}>
                          ⬇ XML
                        </button>
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => descargarDocumento(c.factura_cfdi, 'pdf')}>
                          ⬇ PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Simulador SPEI ── */}
      {tab === 'spei_sim' && (
        <div>
          <div className="card" style={{ marginBottom: 16, borderLeft: '4px solid var(--amber)' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 28, flexShrink: 0 }}>🧪</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)', marginBottom: 4 }}>Simulador de pago SPEI</div>
                <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
                  Simula una transferencia SPEI entrante sin webhook real. Escribe la matrícula
                  del cobro y el monto. El sistema guarda el pago y el polling de la Caja
                  lo detecta automáticamente en ~10 segundos.
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--amber)', background: 'var(--amber-glow)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', display: 'inline-block' }}>
                  ⚠ Solo para ambiente de pruebas
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Simular transferencia entrante</div>
            </div>

            {/* Cobros SPEI pendientes para selección rápida */}
            {speiPendientes.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, color: 'var(--ink-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>
                  Cobros SPEI pendientes — clic para seleccionar
                </div>
                {speiPendientes.map(c => (
                  <div key={c.id}
                    onClick={() => { setSimRef(c.referencia || c.folio); setSimMonto(String(c.total)); setSimStatus(null); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                      background: 'var(--glass-light)', borderRadius: 'var(--radius-sm)',
                      marginBottom: 6, cursor: 'pointer', border: '1px solid var(--border-glow)', transition: 'all .15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-active)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-glow)'}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{c.cliente}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                        Ref: {c.referencia || c.folio}
                      </div>
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--amber)', flexShrink: 0 }}>{fmt(c.total)}</div>
                    <div style={{ fontSize: 11, color: 'var(--accent)', flexShrink: 0 }}>→ Seleccionar</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Referencia / Matrícula (concepto SPEI) *</label>
                <input className="form-input" placeholder="Ej: ITM-2024-001"
                  value={simRef}
                  onChange={e => { setSimRef(e.target.value.toUpperCase()); setSimStatus(null); }}
                  style={{ fontFamily: 'var(--mono)', letterSpacing: 1 }} />
              </div>
              <div className="form-group">
                <label className="form-label">Monto en pesos *</label>
                <input className="form-input" type="number" placeholder="2800.00"
                  value={simMonto}
                  onChange={e => { setSimMonto(e.target.value); setSimStatus(null); }}
                  style={{ fontFamily: 'var(--mono)' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Nombre del emisor</label>
                <input className="form-input" placeholder="NOMBRE PADRE DE FAMILIA"
                  value={simEmisor}
                  onChange={e => setSimEmisor(e.target.value.toUpperCase())} />
              </div>
            </div>

            {simStatus === 'ok' && (
              <div style={{ marginBottom: 14, padding: '12px 16px', background: 'var(--green-glow)', border: '1px solid var(--green)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--green)' }}>
                {simMsg}
              </div>
            )}
            {simStatus === 'error' && (
              <div style={{ marginBottom: 14, padding: '12px 16px', background: 'var(--red-glow)', border: '1px solid var(--red)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--red)' }}>
                ⚠ {simMsg}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={simularSPEI} disabled={simLoading || !simRef || !simMonto}>
                {simLoading
                  ? <><span className="spinner" style={{ borderTopColor: '#fff', marginRight: 8 }}></span>Enviando…</>
                  : '🚀 Simular transferencia SPEI'}
              </button>
              {simStatus === 'ok' && (
                <button className="btn btn-secondary" onClick={() => {
                  SpeiPoller.verificarAhora();
                  setSimMsg(prev => prev + ' (verificando ahora…)');
                }}>
                  🔄 Verificar ahora
                </button>
              )}
            </div>

            {/* Explicación del flujo */}
            <div style={{ marginTop: 20, padding: '14px 16px', background: 'var(--glass-light)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: 11, color: 'var(--ink-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 10 }}>
                ¿Cómo funciona la detección con CLABE fija?
              </div>
              {[
                'El padre transfiere a la CLABE fija y escribe la matrícula en el CONCEPTO.',
                'STP/Pagadetodo recibe el dinero y llama al webhook (webhook_spei.php).',
                'El webhook guarda el pago en pagos_spei.json indexado por CONCEPTO (matrícula).',
                'La Caja hace polling cada 10s con verificar_spei pasando la referencia/matrícula.',
                'El sistema confirma el cobro automáticamente y actualiza el saldo del alumno.',
              ].map((txt, n) => (
                <div key={n} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, background: 'var(--accent-glow)',
                    color: 'var(--accent)', fontSize: 11, fontWeight: 700, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1
                  }}>{n + 1}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{txt}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Solicitar CFDI ── */}
      {modal === 'solicitar' && cobroSel && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <div>
                <div className="modal-title">Generar CFDI 4.0</div>
                <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
                  {cobroSel.folio} · {cobroSel.cliente} · <span style={{ fontFamily: 'var(--mono)' }}>{fmt(cobroSel.total)}</span>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {errMsg && (
                <div style={{ marginBottom: 14, padding: '10px 14px', background: 'var(--red-glow)', border: '1px solid var(--red)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--red)' }}>
                  ⚠ {errMsg}
                </div>
              )}
              {/* Banner: datos pre-llenados desde perfil */}
              {(formFact.rfc || formFact.razon_social) && (
                <div style={{ marginBottom: 14, padding: '10px 14px', background: 'var(--green-glow)', border: '1px solid rgba(16,185,129,.25)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--green)', display:'flex', alignItems:'center', gap:8 }}>
                  ✓ Datos fiscales pre-llenados desde el perfil del cliente. Verifica antes de generar.
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">RFC del receptor *</label>
                  <input className="form-input" placeholder="XAXX010101000"
                    value={formFact.rfc}
                    onChange={e => setFormFact(f => ({ ...f, rfc: e.target.value.toUpperCase().replace(/\s/g, '') }))}
                    style={{ fontFamily: 'var(--mono)', letterSpacing: 1 }} />
                  <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 3 }}>
                    Público en general: XAXX010101000
                  </div>
                </div>
                {/* CAMBIO: Se agrega el campo Código Postal */}
                <div className="form-group">
                  <label className="form-label">Código Postal *</label>
                  <input className="form-input" placeholder="Ej. 97000"
                    value={formFact.cp_receptor}
                    onChange={e => setFormFact(f => ({ ...f, cp_receptor: e.target.value }))}
                    style={{ fontFamily: 'var(--mono)' }} />
                </div>
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Razón social *</label>
                  <input className="form-input" placeholder="NOMBRE COMPLETO O RAZÓN SOCIAL"
                    value={formFact.razon_social}
                    onChange={e => setFormFact(f => ({ ...f, razon_social: e.target.value.toUpperCase() }))} />
                </div>
                {/* NUEVO: Campo de domicilio fiscal */}
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="form-label">Domicilio fiscal</label>
                  <input className="form-input" placeholder="Calle, Número, Colonia, Ciudad, Estado, CP"
                    value={formFact.domicilio}
                    onChange={e => setFormFact(f => ({ ...f, domicilio: e.target.value }))} />
                  <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 3 }}>
                    Opcional — se imprime en el comprobante
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Correo para envío</label>
                  <input className="form-input" type="email" placeholder="padre@mail.com"
                    value={formFact.email}
                    onChange={e => setFormFact(f => ({ ...f, email: e.target.value }))} />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Uso del CFDI</label>
                  <select className="form-select" value={formFact.uso_cfdi}
                    onChange={e => setFormFact(f => ({ ...f, uso_cfdi: e.target.value }))}>
                    {Object.entries(USO_CFDI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Régimen fiscal del receptor</label>
                  <select className="form-select" value={formFact.regimen}
                    onChange={e => setFormFact(f => ({ ...f, regimen: e.target.value }))}>
                    {Object.entries(REGIMENES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>

              {/* Preview */}
              <div style={{ marginTop: 16, padding: '14px 16px', background: 'var(--glass-light)', borderRadius: 'var(--radius)', border: '1px solid var(--border-glow)' }}>
                <div style={{ fontSize: 11, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 10 }}>
                  Vista previa del comprobante
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  {[
                    { l: 'Subtotal', v: fmt(cobroSel.total / 1.16) },
                    { l: 'IVA 16%',  v: fmt(cobroSel.total - cobroSel.total / 1.16) },
                    { l: 'Total',    v: fmt(cobroSel.total), bold: true },
                  ].map(s => (
                    <div key={s.l}>
                      <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginBottom: 2 }}>{s.l}</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: s.bold ? 700 : 400, color: s.bold ? 'var(--green)' : 'var(--ink)' }}>{s.v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--ink-3)' }}>
                  Conceptos: {cobroSel.items.map(i => i.nombre).join(', ')}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={generarCFDI}
                disabled={loading || !formFact.rfc || !formFact.razon_social || !formFact.cp_receptor}>
                {loading
                  ? <><span className="spinner" style={{ borderTopColor: '#fff', marginRight: 8 }}></span>Generando…</>
                  : '📄 Generar CFDI'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Visor CFDI ── */}
      {modal === 'visor' && cfdiVisor && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <div>
                <div className="modal-title">✅ CFDI Generado</div>
                <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 2 }}>Listo para timbrado con PAC</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {/* UUID block */}
              <div style={{
                padding: '12px 16px', marginBottom: 16,
                background: 'linear-gradient(135deg,#1e3a8a,#312e81)', borderRadius: 'var(--radius)'
              }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  Folio Fiscal (UUID)
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: '#fff', letterSpacing: .5, wordBreak: 'break-all' }}>
                  {cfdiVisor.uuid || cfdiVisor.folio_fiscal}
                </div>
                <div style={{ display: 'flex', gap: 20, marginTop: 8, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)' }}>Serie / Folio</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'rgba(255,255,255,.85)' }}>
                      {cfdiVisor.serie || 'A'}-{cfdiVisor.folio}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)' }}>Fecha timbrado</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'rgba(255,255,255,.85)' }}>
                      {cfdiVisor.fecha_timbrado}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                {[
                  { l: 'RFC Receptor', v: cfdiVisor.rfc_receptor },
                  { l: 'Código Postal', v: cfdiVisor.cp_receptor },
                  { l: 'Domicilio fiscal', v: cfdiVisor.domicilio || '—', col: '1/-1' },
                  { l: 'Uso CFDI',     v: cfdiVisor.uso_cfdi },
                  { l: 'Subtotal',     v: fmt(cfdiVisor.subtotal) },
                  { l: 'IVA 16%',      v: fmt(cfdiVisor.iva) },
                  { l: 'Total',        v: fmt(cfdiVisor.total), bold: true, color: 'var(--green)' },
                  { l: 'Correo envío', v: cfdiVisor.email || '—' },
                ].map(s => (
                  <div key={s.l} style={s.col ? {gridColumn: s.col} : {}}>
                    <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginBottom: 2 }}>{s.l}</div>
                    <div style={{ fontSize: 13, fontWeight: s.bold ? 700 : 400, color: s.color || 'var(--ink)', fontFamily: s.bold ? 'var(--mono)' : undefined }}>
                      {s.v}
                    </div>
                  </div>
                ))}
              </div>

              {cfdiVisor.qr_url && (
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                  <img src={cfdiVisor.qr_url} alt="QR SAT"
                    style={{ width: 120, height: 120, border: '1px solid var(--border-glow)', borderRadius: 'var(--radius-sm)' }}
                    onError={e => e.target.style.display = 'none'} />
                  <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 4 }}>QR verificación SAT</div>
                </div>
              )}

              <div style={{ background: 'var(--amber-glow)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: 12, color: 'var(--ink-2)' }}>
                <strong style={{ color: 'var(--amber)' }}>📝 Nota:</strong> XML con estructura CFDI 4.0 válida.
                El archivo XML no se descarga automáticamente desde Facturapi de esta forma. Descargalo desde la pestaña de "Emitidas"
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn className=btn-secondary" onClick={() => setModal(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}