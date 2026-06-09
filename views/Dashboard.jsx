/* views/Dashboard.jsx v2 — Multi-escuela */
function Dashboard({ data, user, escuela, allData }) {
  const esSuper = AuthController.isSuperAdmin(user);
  const stats   = CobroController.getEstadisticas(data.cobros);
  const pendientes = data.cobros.filter(c => c.estado === 'pendiente');
  const recientes  = [...data.cobros].reverse().slice(0, 6);
  const totalMetodos = Object.values(stats.cobradosPorMetodo).reduce((a,b)=>a+b,0) || 1;

  // Si superadmin sin escuela seleccionada → mostrar overview global
  if (esSuper && !escuela) {
    const globalStats = AppModel.getEstadisticasGlobales(allData);
    const totalCobrado  = globalStats.reduce((a,s)=>a+s.totalCobrado, 0);
    const totalPend     = globalStats.reduce((a,s)=>a+s.totalPendiente, 0);
    const totalAlumnos  = globalStats.reduce((a,s)=>a+s.numAlumnos, 0);

    return (
      <div>
        <div style={{marginBottom:24}}>
          <h2 style={{fontSize:20, fontWeight:700, color:'var(--ink)', letterSpacing:'-.3px'}}>
            Panel Global — Paga la Escuela
          </h2>
          <p style={{fontSize:13, color:'var(--ink-3)', marginTop:3}}>
            {new Date().toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
          </p>
        </div>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon" style={{background:'var(--accent-glow)'}}><Icon name="escuelas" size={19} color="var(--lime)"/></div>
            <div className="stat-label">Escuelas activas</div>
            <div className="stat-value" style={{fontSize:20}}>{allData.escuelas.filter(e=>e.activa).length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{background:'var(--green-glow)'}}><Icon name="pay" size={19} color="currentColor"/></div>
            <div className="stat-label">Total cobrado</div>
            <div className="stat-value" style={{fontSize:20}}>{fmt(totalCobrado)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{background:'var(--amber-glow)'}}><Icon name="history" size={19} color="currentColor"/></div>
            <div className="stat-label">Por cobrar</div>
            <div className="stat-value" style={{fontSize:20}}>{fmt(totalPend)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{background:'var(--purple-glow)'}}><Icon name="alumnos" size={19} color="currentColor"/></div>
            <div className="stat-label">Alumnos totales</div>
            <div className="stat-value" style={{fontSize:20}}>{totalAlumnos}</div>
          </div>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16}}>
          {globalStats.map(s => (
            <div key={s.escuela_id} className="card" style={{borderLeft:`3px solid ${s.color}`}}>
              <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:14}}>
                <div style={{fontSize:28}}>{s.emoji}</div>
                <div>
                  <div style={{fontWeight:600, fontSize:14, color:'var(--ink)'}}>{s.nombre}</div>
                  <div style={{fontSize:12, color:'var(--ink-3)'}}>{s.numAlumnos} alumnos · {s.numCobros} cobros</div>
                </div>
              </div>
              <div style={{display:'flex', justifyContent:'space-between'}}>
                <div>
                  <div style={{fontSize:11, color:'var(--ink-4)', textTransform:'uppercase', letterSpacing:'.4px'}}>Cobrado</div>
                  <div style={{fontFamily:'var(--mono)', fontWeight:700, color:'var(--green)', fontSize:15}}>{fmt(s.totalCobrado)}</div>
                </div>
                {s.totalPendiente > 0 && (
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:11, color:'var(--ink-4)', textTransform:'uppercase', letterSpacing:'.4px'}}>Pendiente</div>
                    <div style={{fontFamily:'var(--mono)', fontWeight:700, color:'var(--amber)', fontSize:15}}>{fmt(s.totalPendiente)}</div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{marginBottom:24}}>
        <h2 style={{fontSize:20, fontWeight:700, color:'var(--ink)', letterSpacing:'-.3px'}}>
          Buenos días, {user.nombre.split(' ')[0]}
        </h2>
        <p style={{fontSize:13, color:'var(--ink-3)', marginTop:3}}>
          {escuela && <span style={{color:escuela.color, marginRight:6}}>{escuela.logo_emoji} {escuela.nombre} ·</span>}
          {new Date().toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
        </p>
      </div>

      {/* CLABE fija destacada */}
      {escuela?.clabe_fija && (
        <div style={{
          marginBottom:20, padding:'14px 18px',
          background:'linear-gradient(135deg, #1e3a8a 0%, #312e81 100%)',
          borderRadius:'var(--radius-lg)', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12
        }}>
          <div>
            <div style={{fontSize:11, color:'rgba(255,255,255,.6)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:4}}>
              <span style={{display:'inline-flex',alignItems:'center',gap:7}}><Icon name="bank" size={16} color="currentColor"/> CLABE SPEI fija de esta escuela</span>
            </div>
            <div style={{fontFamily:'var(--mono)', fontSize:18, fontWeight:700, color:'#fff', letterSpacing:3}}>
              {escuela.clabe_fija}
            </div>
            <div style={{fontSize:11, color:'rgba(255,255,255,.55)', marginTop:3}}>STP — Sistema de Transferencias y Pagos</div>
          </div>
          <button
            className="copy-btn"
            style={{width:'auto', padding:'7px 16px'}}
            onClick={()=>navigator.clipboard.writeText(escuela.clabe_fija)}
           style={{display:'flex',alignItems:'center',gap:6}}><Icon name="copy" size={13} color="currentColor"/> Copiar CLABE</button>
        </div>
      )}

      <div className="stats-grid">
        {[
          {label:'Total cobrado',   val:fmt(stats.totalCobrado),   icon:'pay', bg:'var(--accent-glow)',  meta:`${data.cobros.filter(c=>c.estado==='pagado').length} cobros pagados`, color:''},
          {label:'Por cobrar',      val:fmt(stats.totalPendiente), icon:'history', bg:'var(--amber-glow)',   meta:`${pendientes.length} cobros pendientes`, color:'var(--amber)'},
          {label:'Cobrado hoy',     val:fmt(stats.cobrosHoy),      icon:'cobros', bg:'var(--green-glow)',   meta:`${data.cobros.filter(c=>c.fecha===new Date().toISOString().slice(0,10)&&c.estado==='pagado').length} transacciones hoy`, color:''},
          {label:'Alumnos activos', val:data.clientes.filter(c=>c.activo).length, icon:'alumnos', bg:'var(--purple-glow)', meta:`${data.clientes.filter(c=>c.activo&&c.saldo_pendiente>0).length} con saldo pendiente`, color:''},
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-icon" style={{background:s.bg}}>{s.icon}</div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{fontSize:20, color:s.color||undefined}}>{s.val}</div>
            <div className="stat-meta">{s.meta}</div>
          </div>
        ))}
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 320px', gap:20}}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Cobros recientes</div>
              <div className="card-sub">Últimas transacciones</div>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Folio</th><th>Cliente</th><th>Total</th><th>Método</th><th>Estado</th></tr></thead>
              <tbody>
                {recientes.length === 0 && (
                  <tr><td colSpan={5}><div className="empty-state" style={{padding:'20px 0'}}><div className="empty-text">Sin cobros aún</div></div></td></tr>
                )}
                {recientes.map(c => (
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

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Por método de pago</div>
              <div className="card-sub">Distribución del mes</div>
            </div>
          </div>
          {[
            {key:'TC',       label:'Tarjeta',   icon:'card', color:'var(--accent)'},
            {key:'SPEI',     label:'SPEI',      icon:'bank', color:'var(--purple)'},
            {key:'CoDi',     label:'CoDi / QR', icon:'phone', color:'var(--green)'},
            {key:'Efectivo', label:'Efectivo',  icon:'pay', color:'var(--amber)'},
          ].map(m => {
            const val = stats.cobradosPorMetodo[m.key] || 0;
            const pct = Math.round((val / totalMetodos) * 100);
            return (
              <div key={m.key} style={{marginBottom:14}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <span style={{fontSize:12.5,color:'var(--ink-2)',display:'flex',alignItems:'center',gap:6}}>{m.icon} {m.label}</span>
                  <span style={{fontSize:12,fontFamily:'var(--mono)',color:'var(--ink-3)'}}>{pct}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{width:pct+'%',background:m.color}}></div>
                </div>
                <div style={{fontSize:11,color:'var(--ink-4)',marginTop:2,fontFamily:'var(--mono)'}}>{fmt(val)}</div>
              </div>
            );
          })}
          {pendientes.length > 0 && (
            <div style={{marginTop:16,padding:'10px 12px',background:'var(--amber-glow)',border:'1px solid rgba(245,158,11,.2)',borderRadius:'var(--radius-sm)'}}>
              <div style={{fontSize:12,fontWeight:600,color:'#fbbf24',marginBottom:4}} style={{display:"flex",alignItems:"center",gap:6}}><Icon name="warning" size={13} color="#fbbf24"/> Cobros pendientes</div>
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
