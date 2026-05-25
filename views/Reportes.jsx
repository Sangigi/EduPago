/* views/Reportes.jsx */
function Reportes({ data }) {
  const stats = CobroController.getEstadisticas(data.cobros);
  const porConcepto = {};
  data.cobros.filter(c=>c.estado==='pagado').forEach(c =>
    c.items.forEach(it => { porConcepto[it.nombre] = (porConcepto[it.nombre]||0) + it.precio * it.qty; })
  );
  const conceptos = Object.entries(porConcepto).sort((a,b)=>b[1]-a[1]);
  const totalConceptos = conceptos.reduce((a,[,v])=>a+v,0)||1;

  // Cobros por mes (últimos 6)
  const porMes = {};
  data.cobros.filter(c=>c.estado==='pagado').forEach(c=>{
    const mes = c.fecha.slice(0,7);
    porMes[mes] = (porMes[mes]||0) + c.total;
  });
  const meses = Object.entries(porMes).sort((a,b)=>a[0].localeCompare(b[0])).slice(-6);
  const maxMes = Math.max(...meses.map(([,v])=>v), 1);

  return (
    <div>
      <div className="stats-grid">
        {[
          {label:'Total cobrado', val:fmt(stats.totalCobrado), icon:'💰', bg:'var(--accent-glow)', meta:`${data.cobros.filter(c=>c.estado==='pagado').length} cobros`},
          {label:'Por cobrar', val:fmt(stats.totalPendiente), icon:'⏳', bg:'var(--amber-glow)', meta:`${data.cobros.filter(c=>c.estado==='pendiente').length} pendientes`},
          {label:'Total cobros', val:data.cobros.length, icon:'📋', bg:'var(--purple-glow)', meta:`${data.cobros.filter(c=>c.estado==='cancelado').length} cancelados`},
          {label:'CFDI emitidos', val:data.cobros.filter(c=>c.factura).length, icon:'📄', bg:'var(--green-glow)', meta:`de ${data.cobros.filter(c=>c.estado==='pagado').length} facturables`},
        ].map(s=>(
          <div key={s.label} className="stat-card">
            <div className="stat-icon" style={{background:s.bg}}>{s.icon}</div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.val}</div>
            <div className="stat-meta">{s.meta}</div>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
        {/* Cobrado por método */}
        <div className="card">
          <div className="card-header"><div className="card-title">Por método de pago</div></div>
          {[
            {key:'TC',label:'Tarjeta',icon:'💳',color:'var(--accent)'},
            {key:'SPEI',label:'SPEI',icon:'🏦',color:'var(--purple)'},
            {key:'CoDi',label:'CoDi',icon:'📱',color:'var(--green)'},
            {key:'Efectivo',label:'Efectivo',icon:'💵',color:'var(--amber)'},
          ].map(m=>{
            const val = stats.cobradosPorMetodo[m.key]||0;
            const total = Object.values(stats.cobradosPorMetodo).reduce((a,b)=>a+b,0)||1;
            const pct = Math.round(val/total*100);
            return (
              <div key={m.key} style={{marginBottom:14}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
                  <span style={{fontSize:13,color:'var(--ink-2)'}}>{m.icon} {m.label}</span>
                  <span style={{fontSize:12,fontFamily:'var(--mono)',color:'var(--ink-3)'}}>{fmt(val)} · {pct}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{width:pct+'%',background:m.color}}></div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Top conceptos */}
        <div className="card">
          <div className="card-header"><div className="card-title">Top conceptos cobrados</div></div>
          {conceptos.length === 0 && <div className="empty-state"><div className="empty-text">Sin datos</div></div>}
          {conceptos.map(([nombre, val])=>(
            <div key={nombre} style={{marginBottom:12}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
                <span style={{fontSize:13,color:'var(--ink-2)',maxWidth:'65%',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{nombre}</span>
                <span style={{fontSize:12,fontFamily:'var(--mono)',color:'var(--ink-3)'}}>{fmt(val)}</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{width:Math.round(val/totalConceptos*100)+'%'}}></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cobros por mes */}
      <div className="card" style={{marginTop:20}}>
        <div className="card-header"><div className="card-title">Cobros por mes</div></div>
        {meses.length === 0 && <div className="empty-state"><div className="empty-text">Sin datos</div></div>}
        <div style={{display:'flex',alignItems:'flex-end',gap:12,height:120,paddingBottom:10}}>
          {meses.map(([mes, val])=>{
            const h = Math.round((val/maxMes)*100);
            const [y,m] = mes.split('-');
            const label = new Date(parseInt(y),parseInt(m)-1,1).toLocaleDateString('es-MX',{month:'short',year:'2-digit'});
            return (
              <div key={mes} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:6}}>
                <div style={{fontSize:11,fontFamily:'var(--mono)',color:'var(--ink-3)'}}>{fmt(val).replace('MX$','$')}</div>
                <div style={{
                  width:'100%',background:'var(--accent-gradient)',borderRadius:'var(--radius-sm) var(--radius-sm) 0 0',
                  height:h+'%',minHeight:4,transition:'height .5s',position:'relative'
                }}></div>
                <div style={{fontSize:11,color:'var(--ink-3)',textTransform:'capitalize'}}>{label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabla resumen */}
      <div className="card" style={{marginTop:20}}>
        <div className="card-header">
          <div className="card-title">Todos los cobros</div>
          <button className="btn btn-secondary btn-sm" onClick={()=>{
            const csv = 'Folio,Cliente,Total,Método,Estado,Fecha\n' +
              data.cobros.map(c=>`${c.folio},"${c.cliente}",${c.total},${c.metodo},${c.estado},${c.fecha}`).join('\n');
            const a = document.createElement('a');
            a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
            a.download = 'edupago-cobros.csv';
            a.click();
          }}>📥 Exportar CSV</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Folio</th><th>Cliente</th><th>Total</th><th>Método</th><th>Estado</th><th>Factura</th><th>Fecha</th></tr></thead>
            <tbody>
              {[...data.cobros].reverse().map(c=>(
                <tr key={c.id}>
                  <td style={{fontFamily:'var(--mono)',fontSize:12}}>{c.folio}</td>
                  <td>{c.cliente}</td>
                  <td style={{fontFamily:'var(--mono)',fontWeight:600}}>{fmt(c.total)}</td>
                  <td><MetodoBadge metodo={c.metodo}/></td>
                  <td><EstadoBadge estado={c.estado}/></td>
                  <td>{c.factura?<span className="badge badge-green">✓</span>:<span className="badge badge-gray">—</span>}</td>
                  <td style={{fontSize:12,color:'var(--ink-3)'}}>{fmtDate(c.fecha)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
