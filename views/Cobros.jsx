/* views/Cobros.jsx v2 */
function Cobros({ data, setData }) {
  const { useState } = React;
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroMetodo, setFiltroMetodo] = useState('todos');
  const [q, setQ]                       = useState('');
  const [detalle, setDetalle]           = useState(null);

  const lista = [...data.cobros]
    .reverse()
    .filter(c => {
      if (filtroEstado !== 'todos' && c.estado !== filtroEstado) return false;
      if (filtroMetodo !== 'todos' && c.metodo !== filtroMetodo) return false;
      if (q) {
        const busq = q.toLowerCase();
        return c.cliente.toLowerCase().includes(busq) ||
               c.folio.toLowerCase().includes(busq) ||
               (c.referencia && c.referencia.toLowerCase().includes(busq));
      }
      return true;
    });

  const totales = {
    todos:     data.cobros.length,
    pagado:    data.cobros.filter(c=>c.estado==='pagado').length,
    pendiente: data.cobros.filter(c=>c.estado==='pendiente').length,
    cancelado: data.cobros.filter(c=>c.estado==='cancelado').length,
  };

  const cancelar = id => {
    const newData = CobroController.cancelarCobro(data, id);
    setData(newData);
    AppModel.save(newData);
    setDetalle(null);
  };

  const confirmarManual = id => {
    const newData = CobroController.confirmarPago(data, id, { auth_code: 'MANUAL-' + Date.now() });
    setData(newData);
    AppModel.save(newData);
    setDetalle(prev => prev ? { ...prev, estado: 'pagado' } : null);
  };

  const exportarCSV = () => {
    const rows = [
      ['Folio','Fecha','Cliente','Total','Método','Estado','Referencia','Auth'],
      ...lista.map(c => [c.folio, c.fecha, `"${c.cliente}"`, c.total, c.metodo, c.estado, c.referencia||'', c.auth_code||''])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `cobros-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Historial de cobros</div>
            <div className="card-sub">{lista.length} resultados</div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={exportarCSV}>📥 Exportar CSV</button>
        </div>

        {/* Filtros rápidos */}
        <div style={{display:'flex', gap:8, marginBottom:14, flexWrap:'wrap'}}>
          {[['todos','Todos','badge-gray'],['pagado','Pagados','badge-green'],['pendiente','Pendientes','badge-amber'],['cancelado','Cancelados','badge-red']].map(([val,label,cls])=>(
            <button key={val}
              className={`badge ${filtroEstado===val?cls:'badge-gray'}`}
              style={{cursor:'pointer', padding:'5px 12px', fontSize:12, border:filtroEstado===val?'1px solid currentColor':'1px solid transparent'}}
              onClick={()=>setFiltroEstado(val)}>
              {label} ({totales[val] ?? lista.filter(c=>c.estado===val).length})
            </button>
          ))}
          <select className="form-select" style={{fontSize:12,padding:'4px 10px',width:'auto',marginLeft:'auto'}}
            value={filtroMetodo} onChange={e=>setFiltroMetodo(e.target.value)}>
            <option value="todos">Todos los métodos</option>
            <option value="TC">💳 Tarjeta</option>
            <option value="SPEI">🏦 SPEI</option>
            <option value="CoDi">📱 CoDi</option>
            <option value="Efectivo">💵 Efectivo</option>
          </select>
        </div>

        <div className="search-bar" style={{marginBottom:16}}>
          <span className="search-icon">🔍</span>
          <input placeholder="Buscar por folio, cliente, matrícula…" value={q} onChange={e=>setQ(e.target.value)}/>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Folio</th><th>Fecha</th><th>Cliente</th><th>Referencia</th>
                <th>Total</th><th>Método</th><th>Estado</th><th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 && (
                <tr><td colSpan={8}><div className="empty-state"><div className="empty-icon">🧾</div><div className="empty-text">Sin cobros en este filtro</div></div></td></tr>
              )}
              {lista.map(c => (
                <tr key={c.id} style={{cursor:'pointer'}} onClick={()=>setDetalle(c)}>
                  <td><span style={{fontFamily:'var(--mono)',fontSize:12}}>{c.folio}</span></td>
                  <td style={{color:'var(--ink-3)',fontSize:12}}>{c.fecha}</td>
                  <td style={{maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:13}}>{c.cliente}</td>
                  <td><span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--ink-4)'}}>{c.referencia || '—'}</span></td>
                  <td><span style={{fontFamily:'var(--mono)',fontWeight:600}}>{fmt(c.total)}</span></td>
                  <td><MetodoBadge metodo={c.metodo}/></td>
                  <td><EstadoBadge estado={c.estado}/></td>
                  <td onClick={e=>e.stopPropagation()}>
                    <div style={{display:'flex',gap:4}}>
                      {c.estado==='pendiente' && (
                        <>
                          <button className="btn btn-primary btn-sm" onClick={()=>confirmarManual(c.id)} title="Confirmar">✓</button>
                          <button className="btn btn-ghost btn-sm" onClick={()=>cancelar(c.id)} title="Cancelar">✕</button>
                        </>
                      )}
                      {c.estado==='pagado' && (
                        <button className="btn btn-ghost btn-sm" onClick={()=>setDetalle(c)}>🧾</button>
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
          <div className="modal">
            <div className="modal-header">
              <div>
                <div className="modal-title">{detalle.folio}</div>
                <div style={{fontSize:12,color:'var(--ink-3)',marginTop:2}}>{detalle.fecha} · <EstadoBadge estado={detalle.estado}/></div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setDetalle(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
                <div>
                  <div style={{fontSize:11,color:'var(--ink-4)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:3}}>Cliente</div>
                  <div style={{fontSize:13,fontWeight:500}}>{detalle.cliente}</div>
                </div>
                <div>
                  <div style={{fontSize:11,color:'var(--ink-4)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:3}}>Método de pago</div>
                  <MetodoBadge metodo={detalle.metodo}/>
                </div>
                <div>
                  <div style={{fontSize:11,color:'var(--ink-4)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:3}}>Referencia / Concepto SPEI</div>
                  <div style={{fontFamily:'var(--mono)',fontSize:13}}>{detalle.referencia || '—'}</div>
                </div>
                {detalle.auth_code && (
                  <div>
                    <div style={{fontSize:11,color:'var(--ink-4)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:3}}>Autorización</div>
                    <div style={{fontFamily:'var(--mono)',fontSize:13}}>{detalle.auth_code}</div>
                  </div>
                )}
              </div>
              <div style={{borderTop:'1px solid var(--border-glow)',paddingTop:12,marginBottom:12}}>
                <div style={{fontSize:11,color:'var(--ink-4)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:8}}>Conceptos</div>
                {detalle.items.map((item,i)=>(
                  <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--glass-light)',fontSize:13}}>
                    <span>{item.nombre} {item.qty>1&&<span style={{color:'var(--ink-4)'}}>×{item.qty}</span>}</span>
                    <span style={{fontFamily:'var(--mono)',fontWeight:500}}>{fmt(item.precio*item.qty)}</span>
                  </div>
                ))}
                <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0 0',fontWeight:700,fontSize:15}}>
                  <span>Total</span>
                  <span style={{fontFamily:'var(--mono)',color:'var(--green)'}}>{fmt(detalle.total)}</span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              {detalle.estado==='pendiente' && (
                <>
                  <button className="btn btn-secondary" onClick={()=>cancelar(detalle.id)}>Cancelar cobro</button>
                  <button className="btn btn-primary" onClick={()=>confirmarManual(detalle.id)}>✓ Confirmar pago</button>
                </>
              )}
              {detalle.estado!=='pendiente' && (
                <button className="btn btn-secondary" onClick={()=>setDetalle(null)}>Cerrar</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
