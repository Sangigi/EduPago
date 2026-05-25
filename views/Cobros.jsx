/* views/Cobros.jsx */
function Cobros({ data, setData }) {
  const { useState } = React;
  const [q, setQ] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroMetodo, setFiltroMetodo] = useState('');
  const [detalle, setDetalle] = useState(null);

  const list = data.cobros.filter(c => {
    const matchQ = !q || c.folio.includes(q.toUpperCase()) || c.cliente.toLowerCase().includes(q.toLowerCase());
    const matchE = !filtroEstado || c.estado === filtroEstado;
    const matchM = !filtroMetodo || c.metodo === filtroMetodo;
    return matchQ && matchE && matchM;
  }).sort((a,b) => b.id - a.id);

  const totalFiltrado = list.filter(c=>c.estado==='pagado').reduce((a,c)=>a+c.total,0);

  const confirmar = id => {
    const newData = CobroController.confirmarPago(data, id);
    setData(newData);
    AppModel.save(newData);
    if (detalle?.id === id) setDetalle(newData.cobros.find(c=>c.id===id));
  };

  const cancelar = id => {
    const newData = CobroController.cancelarCobro(data, id);
    setData(newData);
    AppModel.save(newData);
    if (detalle?.id === id) setDetalle(newData.cobros.find(c=>c.id===id));
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Historial de cobros</div>
            <div className="card-sub">{list.length} cobros · cobrado <strong style={{color:'var(--ink)'}}>{fmt(totalFiltrado)}</strong></div>
          </div>
        </div>

        {/* Filtros */}
        <div style={{display:'flex',gap:10,marginBottom:18,flexWrap:'wrap'}}>
          <div className="search-bar" style={{flex:1,minWidth:200}}>
            <span className="search-icon">🔍</span>
            <input placeholder="Buscar folio o cliente…" value={q} onChange={e=>setQ(e.target.value)}/>
          </div>
          <select className="form-select" style={{width:'auto',minWidth:140}} value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="pagado">Pagado</option>
            <option value="pendiente">Pendiente</option>
            <option value="cancelado">Cancelado</option>
          </select>
          <select className="form-select" style={{width:'auto',minWidth:140}} value={filtroMetodo} onChange={e=>setFiltroMetodo(e.target.value)}>
            <option value="">Todos los métodos</option>
            <option value="TC">Tarjeta</option>
            <option value="SPEI">SPEI</option>
            <option value="CoDi">CoDi</option>
            <option value="Efectivo">Efectivo</option>
          </select>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Folio</th><th>Cliente</th><th>Conceptos</th><th>Total</th>
                <th>Método</th><th>Fecha</th><th>Estado</th><th>Factura</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan={9}>
                  <div className="empty-state"><div className="empty-icon">🧾</div><div className="empty-text">Sin cobros</div></div>
                </td></tr>
              )}
              {list.map(c=>(
                <tr key={c.id}>
                  <td>
                    <span style={{fontFamily:'var(--mono)',fontSize:12,cursor:'pointer',color:'var(--accent)'}}
                      onClick={()=>setDetalle(c)}>{c.folio}</span>
                  </td>
                  <td style={{maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.cliente}</td>
                  <td style={{fontSize:12,color:'var(--ink-3)'}}>
                    {c.items.map(i=>`${i.nombre} x${i.qty}`).join(', ')}
                  </td>
                  <td><span style={{fontFamily:'var(--mono)',fontWeight:600}}>{fmt(c.total)}</span></td>
                  <td><MetodoBadge metodo={c.metodo}/></td>
                  <td style={{fontSize:12,color:'var(--ink-3)',fontFamily:'var(--mono)'}}>{fmtDate(c.fecha)}</td>
                  <td><EstadoBadge estado={c.estado}/></td>
                  <td>
                    {c.factura
                      ? <span className="badge badge-green">✓ CFDI</span>
                      : <span className="badge badge-gray">Pendiente</span>}
                  </td>
                  <td>
                    <div style={{display:'flex',gap:5}}>
                      <button className="btn btn-ghost btn-sm" onClick={()=>setDetalle(c)} title="Ver detalle">👁</button>
                      {c.estado==='pendiente' && (
                        <>
                          <button className="btn btn-success btn-sm" onClick={()=>confirmar(c.id)} title="Confirmar pago">✓</button>
                          <button className="btn btn-danger btn-sm" onClick={()=>cancelar(c.id)} title="Cancelar">✕</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal detalle */}
      {detalle && (
        <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setDetalle(null)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <div>
                <div className="modal-title">{detalle.folio}</div>
                <div style={{fontSize:12,color:'var(--ink-3)',marginTop:2}}>
                  {fmtDate(detalle.fecha)} · {detalle.cliente}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setDetalle(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                <div><div style={{fontSize:11,color:'var(--ink-3)',marginBottom:3}}>Estado</div><EstadoBadge estado={detalle.estado}/></div>
                <div><div style={{fontSize:11,color:'var(--ink-3)',marginBottom:3}}>Método</div><MetodoBadge metodo={detalle.metodo}/></div>
                <div><div style={{fontSize:11,color:'var(--ink-3)',marginBottom:3}}>Total</div><span style={{fontFamily:'var(--mono)',fontWeight:700,fontSize:18}}>{fmt(detalle.total)}</span></div>
                <div><div style={{fontSize:11,color:'var(--ink-3)',marginBottom:3}}>Factura</div>
                  {detalle.factura
                    ? <span className="badge badge-green">CFDI emitido</span>
                    : <span className="badge badge-gray">Sin factura</span>}
                </div>
                {detalle.auth_code && (
                  <div style={{gridColumn:'1/-1'}}>
                    <div style={{fontSize:11,color:'var(--ink-3)',marginBottom:3}}>Código de autorización</div>
                    <span style={{fontFamily:'var(--mono)',fontSize:13,color:'var(--green)'}}>{detalle.auth_code}</span>
                  </div>
                )}
                {detalle.clabe && (
                  <div style={{gridColumn:'1/-1'}}>
                    <div style={{fontSize:11,color:'var(--ink-3)',marginBottom:3}}>CLABE SPEI</div>
                    <span style={{fontFamily:'var(--mono)',fontSize:13,letterSpacing:2}}>{detalle.clabe.match(/.{1,4}/g).join(' ')}</span>
                  </div>
                )}
              </div>

              <div style={{borderTop:'1px solid var(--border-glow)',paddingTop:14}}>
                <div style={{fontSize:12,fontWeight:700,color:'var(--ink-3)',marginBottom:10,textTransform:'uppercase',letterSpacing:.5}}>Conceptos</div>
                {detalle.items.map((it,i)=>(
                  <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--glass-light)',fontSize:13}}>
                    <span>{it.nombre} <span style={{color:'var(--ink-3)'}}>× {it.qty}</span></span>
                    <span style={{fontFamily:'var(--mono)',fontWeight:600}}>{fmt(it.precio*it.qty)}</span>
                  </div>
                ))}
                <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',fontWeight:700,fontSize:15}}>
                  <span>Total</span>
                  <span style={{fontFamily:'var(--mono)',color:'var(--accent)'}}>{fmt(detalle.total)}</span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              {detalle.estado==='pendiente' && (
                <>
                  <button className="btn btn-danger" onClick={()=>cancelar(detalle.id)}>Cancelar cobro</button>
                  <button className="btn btn-success" onClick={()=>confirmar(detalle.id)}>✓ Confirmar pago</button>
                </>
              )}
              <button className="btn btn-secondary" onClick={()=>setDetalle(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
