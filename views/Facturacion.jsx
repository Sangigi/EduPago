/* views/Facturacion.jsx v2 */
function Facturacion({ data, setData }) {
  const { useState } = React;
  const cobrosPagados = data.cobros.filter(c => c.estado === 'pagado');
  const [modal, setModal] = useState(null);
  const [formFactura, setFormFactura] = useState({
    rfc:'', razon_social:'', uso_cfdi:'G01', regimen:'601', email:''
  });
  const [cobroTarget, setCobroTarget] = useState(null);
  const [q, setQ] = useState('');

  const solicitar = cobro => {
    setCobroTarget(cobro);
    const cli = data.clientes.find(c => c.id === cobro.cliente_id);
    setFormFactura(f => ({ ...f, email: cli?.email || '' }));
    setModal('solicitar');
  };

  const confirmarFactura = () => {
    const newData = {
      ...data,
      cobros: data.cobros.map(c =>
        c.id === cobroTarget.id
          ? { ...c, factura: true, factura_data: { ...formFactura, fecha_solicitud: new Date().toISOString() } }
          : c
      )
    };
    setData(newData);
    AppModel.save(newData);
    setModal(null);
  };

  const filtrados = cobrosPagados.filter(c =>
    !q || c.cliente.toLowerCase().includes(q.toLowerCase()) || c.folio.toLowerCase().includes(q.toLowerCase())
  );

  const USO_CFDI = { G01:'Adquisición de mercancias', G03:'Gastos en general', D10:'Pagos por servicios educativos', D01:'Honorarios médicos' };
  const REGIMENES = { '601':'General de Ley Personas Morales', '612':'Personas Físicas con Actividades Empresariales', '626':'Simplificado de Confianza (RESICO)' };

  return (
    <div>
      <div className="card" style={{marginBottom:16, background:'linear-gradient(135deg,#1e3a8a 0%,#312e81 100%)', border:'none'}}>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <div style={{fontSize:36}}>📄</div>
          <div>
            <div style={{fontWeight:700,fontSize:15,color:'#fff',marginBottom:3}}>Facturación CFDI 4.0</div>
            <div style={{fontSize:12,color:'rgba(255,255,255,.6)',lineHeight:1.5}}>
              Solicita facturas para cobros ya pagados. Michelle sugirió preguntar al padre si necesita factura al momento del registro.
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Cobros con factura solicitada</div>
            <div className="card-sub">{cobrosPagados.filter(c=>c.factura).length} facturas</div>
          </div>
        </div>

        <div className="search-bar" style={{marginBottom:16}}>
          <span className="search-icon">🔍</span>
          <input placeholder="Buscar cobro…" value={q} onChange={e=>setQ(e.target.value)}/>
        </div>

        <div className="table-wrap">
          <table>
            <thead><tr><th>Folio</th><th>Fecha</th><th>Cliente</th><th>Total</th><th>Factura</th><th>Acción</th></tr></thead>
            <tbody>
              {filtrados.length === 0 && (
                <tr><td colSpan={6}><div className="empty-state"><div className="empty-text">Sin cobros pagados en este filtro</div></div></td></tr>
              )}
              {filtrados.map(c => (
                <tr key={c.id}>
                  <td><span style={{fontFamily:'var(--mono)',fontSize:12}}>{c.folio}</span></td>
                  <td style={{color:'var(--ink-3)',fontSize:12}}>{c.fecha}</td>
                  <td style={{fontSize:13}}>{c.cliente}</td>
                  <td><span style={{fontFamily:'var(--mono)',fontWeight:600}}>{fmt(c.total)}</span></td>
                  <td>
                    {c.factura
                      ? <span className="badge badge-green">✓ Solicitada</span>
                      : <span className="badge badge-gray">Sin factura</span>}
                  </td>
                  <td>
                    {!c.factura && (
                      <button className="btn btn-primary btn-sm" onClick={()=>solicitar(c)}>
                        Solicitar CFDI
                      </button>
                    )}
                    {c.factura && (
                      <button className="btn btn-ghost btn-sm" title="Ver datos">📋</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal === 'solicitar' && (
        <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <div>
                <div className="modal-title">Solicitar CFDI</div>
                <div style={{fontSize:12,color:'var(--ink-3)',marginTop:2}}>Folio: {cobroTarget?.folio} · {fmt(cobroTarget?.total)}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">RFC del receptor *</label>
                <input className="form-input" placeholder="RFC" value={formFactura.rfc} onChange={e=>setFormFactura(f=>({...f,rfc:e.target.value.toUpperCase()}))} style={{fontFamily:'var(--mono)'}}/>
              </div>
              <div className="form-group">
                <label className="form-label">Razón social *</label>
                <input className="form-input" placeholder="Nombre completo o razón social" value={formFactura.razon_social} onChange={e=>setFormFactura(f=>({...f,razon_social:e.target.value.toUpperCase()}))}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div className="form-group">
                  <label className="form-label">Uso del CFDI</label>
                  <select className="form-select" value={formFactura.uso_cfdi} onChange={e=>setFormFactura(f=>({...f,uso_cfdi:e.target.value}))}>
                    {Object.entries(USO_CFDI).map(([k,v])=><option key={k} value={k}>{k} — {v}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Régimen fiscal</label>
                  <select className="form-select" value={formFactura.regimen} onChange={e=>setFormFactura(f=>({...f,regimen:e.target.value}))}>
                    {Object.entries(REGIMENES).map(([k,v])=><option key={k} value={k}>{k} — {v}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Correo para envío del CFDI</label>
                <input className="form-input" type="email" value={formFactura.email} onChange={e=>setFormFactura(f=>({...f,email:e.target.value}))}/>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmarFactura} disabled={!formFactura.rfc||!formFactura.razon_social}>Registrar solicitud</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
