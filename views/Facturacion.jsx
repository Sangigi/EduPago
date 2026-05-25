/* views/Facturacion.jsx */
function Facturacion({ data, setData }) {
  const { useState } = React;
  const EMPTY_FORM = { cobro_id:'', rfc:'', razon_social:'', uso_cfdi:'G03', regimen:'601', cp:'' };
  const [form, setForm] = useState(EMPTY_FORM);
  const [modal, setModal] = useState(false);
  const [timbrado, setTimbrado] = useState(false);
  const [loading, setLoading] = useState(false);

  const cobrosFacturables = data.cobros.filter(c => c.estado==='pagado' && !c.factura);
  const cobrosFacturados = data.cobros.filter(c => c.factura);

  const emitir = () => {
    if (!form.cobro_id || !form.rfc || !form.razon_social) return;
    setLoading(true);
    setTimeout(() => {
      const newData = CobroController.emitirFactura(data, parseInt(form.cobro_id), {
        rfc: form.rfc,
        razon_social: form.razon_social,
        uso_cfdi: form.uso_cfdi,
        regimen: form.regimen,
        cp: form.cp,
      });
      setData(newData);
      AppModel.save(newData);
      setLoading(false);
      setTimbrado(true);
      setTimeout(()=>{ setModal(false); setForm(EMPTY_FORM); setTimbrado(false); }, 2000);
    }, 2200);
  };

  return (
    <div>
      <div className="stats-grid" style={{gridTemplateColumns:'repeat(3,1fr)'}}>
        <div className="stat-card">
          <div className="stat-icon" style={{background:'var(--amber-glow)'}}>⏳</div>
          <div className="stat-label">Por facturar</div>
          <div className="stat-value">{cobrosFacturables.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{background:'var(--green-glow)'}}>✅</div>
          <div className="stat-label">CFDI emitidos</div>
          <div className="stat-value">{cobrosFacturados.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{background:'var(--accent-glow)'}}>💰</div>
          <div className="stat-label">Monto facturado</div>
          <div className="stat-value" style={{fontSize:18}}>{fmt(cobrosFacturados.reduce((a,c)=>a+c.total,0))}</div>
        </div>
      </div>

      {/* Pendientes de facturar */}
      <div className="card" style={{marginBottom:20}}>
        <div className="card-header">
          <div>
            <div className="card-title">Cobros pendientes de factura</div>
            <div className="card-sub">Cobros pagados sin CFDI</div>
          </div>
          <button className="btn btn-primary" onClick={()=>setModal(true)}>+ Timbrar CFDI</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Folio</th><th>Cliente</th><th>Conceptos</th><th>Total</th><th>Fecha</th><th>Acción</th></tr>
            </thead>
            <tbody>
              {cobrosFacturables.length === 0 && (
                <tr><td colSpan={6}><div className="empty-state"><div className="empty-icon">✅</div><div className="empty-text">Todos los cobros están facturados</div></div></td></tr>
              )}
              {cobrosFacturables.map(c=>(
                <tr key={c.id}>
                  <td><span style={{fontFamily:'var(--mono)',fontSize:12}}>{c.folio}</span></td>
                  <td>{c.cliente}</td>
                  <td style={{fontSize:12,color:'var(--ink-3)'}}>{c.items.map(i=>i.nombre).join(', ')}</td>
                  <td><span style={{fontFamily:'var(--mono)',fontWeight:600}}>{fmt(c.total)}</span></td>
                  <td style={{fontSize:12,color:'var(--ink-3)'}}>{fmtDate(c.fecha)}</td>
                  <td>
                    <button className="btn btn-primary btn-sm" onClick={()=>{setForm(f=>({...f,cobro_id:c.id}));setModal(true);}}>
                      📄 Facturar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Facturados */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">CFDI emitidos</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Folio cobro</th><th>Cliente</th><th>RFC</th><th>Total</th><th>UUID CFDI</th></tr>
            </thead>
            <tbody>
              {cobrosFacturados.length === 0 && (
                <tr><td colSpan={5}><div className="empty-state"><div className="empty-icon">📄</div><div className="empty-text">Sin facturas emitidas</div></div></td></tr>
              )}
              {cobrosFacturados.map(c=>(
                <tr key={c.id}>
                  <td><span style={{fontFamily:'var(--mono)',fontSize:12}}>{c.folio}</span></td>
                  <td>{c.cliente}</td>
                  <td><span style={{fontFamily:'var(--mono)',fontSize:12}}>{c.datos_fiscales?.rfc||'—'}</span></td>
                  <td><span style={{fontFamily:'var(--mono)',fontWeight:600}}>{fmt(c.total)}</span></td>
                  <td><span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--green)'}}>{c.cfdi_uuid||'—'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal facturación */}
      {modal && (
        <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setModal(false)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <div className="modal-title">📄 Timbrar CFDI</div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {timbrado ? (
                <div style={{textAlign:'center',padding:'20px 0'}}>
                  <div style={{fontSize:48,marginBottom:12}}>✅</div>
                  <div style={{fontSize:18,fontWeight:700,color:'var(--ink)'}}>¡CFDI timbrado exitosamente!</div>
                  <div style={{fontSize:13,color:'var(--ink-3)',marginTop:6}}>El comprobante fiscal fue enviado al SAT</div>
                </div>
              ) : (
                <>
                  <div className="form-group">
                    <label className="form-label">Cobro a facturar *</label>
                    <select className="form-select" value={form.cobro_id} onChange={e=>setForm(f=>({...f,cobro_id:e.target.value}))}>
                      <option value="">Seleccionar cobro…</option>
                      {cobrosFacturables.map(c=>(
                        <option key={c.id} value={c.id}>{c.folio} — {c.cliente} — {fmt(c.total)}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                    <div className="form-group">
                      <label className="form-label">RFC *</label>
                      <input className="form-input" placeholder="XAXX010101000" value={form.rfc}
                        onChange={e=>setForm(f=>({...f,rfc:e.target.value.toUpperCase()}))} style={{fontFamily:'var(--mono)'}}/>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Código Postal</label>
                      <input className="form-input" placeholder="06600" value={form.cp}
                        onChange={e=>setForm(f=>({...f,cp:e.target.value}))} style={{fontFamily:'var(--mono)'}}/>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Razón social *</label>
                    <input className="form-input" placeholder="NOMBRE O RAZÓN SOCIAL" value={form.razon_social}
                      onChange={e=>setForm(f=>({...f,razon_social:e.target.value.toUpperCase()}))}/>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                    <div className="form-group">
                      <label className="form-label">Uso CFDI</label>
                      <select className="form-select" value={form.uso_cfdi} onChange={e=>setForm(f=>({...f,uso_cfdi:e.target.value}))}>
                        <option value="G03">G03 - Gastos en general</option>
                        <option value="D10">D10 - Pagos por servicios educativos</option>
                        <option value="S01">S01 - Sin efectos fiscales</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Régimen fiscal</label>
                      <select className="form-select" value={form.regimen} onChange={e=>setForm(f=>({...f,regimen:e.target.value}))}>
                        <option value="601">601 - General de Ley Personas Morales</option>
                        <option value="605">605 - Sueldos y Salarios</option>
                        <option value="612">612 - Personas Físicas con Actividades</option>
                        <option value="616">616 - Sin obligaciones fiscales</option>
                      </select>
                    </div>
                  </div>
                  {loading && (
                    <div className="verif-row">
                      <span className="spinner" style={{borderTopColor:'var(--accent)'}}></span>
                      <span style={{fontSize:12.5,color:'var(--ink-2)'}}>Timbrando CFDI con el SAT…</span>
                    </div>
                  )}
                </>
              )}
            </div>
            {!timbrado && (
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={()=>setModal(false)} disabled={loading}>Cancelar</button>
                <button className="btn btn-primary" onClick={emitir}
                  disabled={loading||!form.cobro_id||!form.rfc||!form.razon_social}>
                  {loading ? <><span className="spinner"></span> Timbrando…</> : '📄 Timbrar CFDI'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
