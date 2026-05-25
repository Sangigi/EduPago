/* views/Dashboard.jsx */
function Dashboard({ data, user }) {
  const stats = CobroController.getEstadisticas(data.cobros);
  const pendientes = data.cobros.filter(c => c.estado === 'pendiente');
  const recientes = [...data.cobros].reverse().slice(0, 6);
  const totalMetodos = Object.values(stats.cobradosPorMetodo).reduce((a,b)=>a+b,0)||1;

  return (
    <div>
      {/* Bienvenida */}
      <div style={{marginBottom:24}}>
        <h2 style={{fontSize:20,fontWeight:700,color:'var(--ink)',letterSpacing:'-.3px'}}>
          Buenos días, {user.nombre.split(' ')[0]} 👋
        </h2>
        <p style={{fontSize:13,color:'var(--ink-3)',marginTop:3}}>
          {new Date().toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
        </p>
      </div>

      {/* KPIs */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{background:'var(--accent-glow)'}}>💰</div>
          <div className="stat-label">Total cobrado</div>
          <div className="stat-value" style={{fontSize:20}}>{fmt(stats.totalCobrado)}</div>
          <div className="stat-meta up">↑ {data.cobros.filter(c=>c.estado==='pagado').length} cobros</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{background:'var(--amber-glow)'}}>⏳</div>
          <div className="stat-label">Por cobrar</div>
          <div className="stat-value" style={{fontSize:20}}>{fmt(stats.totalPendiente)}</div>
          <div className="stat-meta down">{pendientes.length} cobros pendientes</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{background:'var(--green-glow)'}}>📅</div>
          <div className="stat-label">Cobrado hoy</div>
          <div className="stat-value" style={{fontSize:20}}>{fmt(stats.cobrosHoy)}</div>
          <div className="stat-meta" style={{color:'var(--ink-3)'}}>
            {data.cobros.filter(c=>c.fecha===new Date().toISOString().slice(0,10)&&c.estado==='pagado').length} transacciones
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{background:'var(--purple-glow)'}}>👥</div>
          <div className="stat-label">Alumnos activos</div>
          <div className="stat-value" style={{fontSize:20}}>{data.clientes.filter(c=>c.activo).length}</div>
          <div className="stat-meta" style={{color:'var(--ink-3)'}}>
            {data.clientes.filter(c=>c.activo&&c.saldo_pendiente>0).length} con saldo pendiente
          </div>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:20}}>
        {/* Cobros recientes */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Cobros recientes</div>
              <div className="card-sub">Últimas transacciones</div>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Folio</th><th>Cliente</th><th>Total</th><th>Método</th><th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {recientes.map(c=>(
                  <tr key={c.id}>
                    <td><span style={{fontFamily:'var(--mono)',fontSize:12}}>{c.folio}</span></td>
                    <td style={{maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.cliente}</td>
                    <td><span style={{fontFamily:'var(--mono)',fontWeight:600}}>{fmt(c.total)}</span></td>
                    <td><MetodoBadge metodo={c.metodo}/></td>
                    <td><EstadoBadge estado={c.estado}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Métodos de pago */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Por método de pago</div>
              <div className="card-sub">Distribución del mes</div>
            </div>
          </div>
          {[
            {key:'TC', label:'Tarjeta crédito/débito', icon:'💳', color:'var(--accent)'},
            {key:'SPEI', label:'Transferencia SPEI', icon:'🏦', color:'var(--purple)'},
            {key:'CoDi', label:'CoDi / QR', icon:'📱', color:'var(--green)'},
            {key:'Efectivo', label:'Efectivo', icon:'💵', color:'var(--amber)'},
          ].map(m=>{
            const val = stats.cobradosPorMetodo[m.key]||0;
            const pct = Math.round((val/totalMetodos)*100);
            return (
              <div key={m.key} style={{marginBottom:14}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                  <span style={{fontSize:12.5,color:'var(--ink-2)',display:'flex',alignItems:'center',gap:6}}>
                    {m.icon} {m.label}
                  </span>
                  <span style={{fontSize:12,fontFamily:'var(--mono)',color:'var(--ink-3)'}}>{pct}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{width:pct+'%',background:m.color}}></div>
                </div>
                <div style={{fontSize:11,color:'var(--ink-4)',marginTop:2,fontFamily:'var(--mono)'}}>{fmt(val)}</div>
              </div>
            );
          })}

          {/* Alertas pendientes */}
          {pendientes.length > 0 && (
            <div style={{marginTop:16,padding:'10px 12px',background:'var(--amber-glow)',border:'1px solid rgba(245,158,11,.2)',borderRadius:'var(--radius-sm)'}}>
              <div style={{fontSize:12,fontWeight:600,color:'#fbbf24',marginBottom:4}}>⚠ Cobros pendientes</div>
              {pendientes.slice(0,3).map(c=>(
                <div key={c.id} style={{fontSize:11.5,color:'var(--ink-3)',marginBottom:2}}>
                  {c.folio} · {c.cliente.split(' ')[0]} · {fmt(c.total)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
