/* views/Reportes.jsx v2 — Por escuela */
function Reportes({ data, escuela }) {
  const { useState } = React;
  const [periodo, setPeriodo] = useState('mes');

  const hoy       = new Date();
  const mesActual = hoy.getMonth();
  const anioActual = hoy.getFullYear();

  const filtrarPorPeriodo = cobros => {
    return cobros.filter(c => {
      if (c.estado !== 'pagado') return false;
      const d = new Date(c.fecha);
      if (periodo === 'hoy')    return c.fecha === hoy.toISOString().slice(0,10);
      if (periodo === 'semana') return (hoy - d) / 86400000 <= 7;
      if (periodo === 'mes')    return d.getMonth() === mesActual && d.getFullYear() === anioActual;
      if (periodo === 'anio')   return d.getFullYear() === anioActual;
      return true;
    });
  };

  const cobrosFilt = filtrarPorPeriodo(data.cobros);
  const totalFilt  = cobrosFilt.reduce((a,c)=>a+c.total,0);

  const metodos = ['TC','SPEI','CoDi','Efectivo'];
  const metodoIconos = { TC:'card', SPEI:'bank', CoDi:'phone', Efectivo:'pay' };
  const metodoColors = { TC:'var(--accent)', SPEI:'var(--purple)', CoDi:'var(--green)', Efectivo:'var(--amber)' };

  const porMetodo = metodos.map(m => ({
    metodo: m,
    total:  cobrosFilt.filter(c=>c.metodo===m).reduce((a,c)=>a+c.total,0),
    count:  cobrosFilt.filter(c=>c.metodo===m).length,
  }));
  const maxMetodo = Math.max(...porMetodo.map(m=>m.total), 1);

  // Top alumnos con más pagos
  const porAlumno = {};
  cobrosFilt.forEach(c => {
    porAlumno[c.cliente] = (porAlumno[c.cliente]||0) + c.total;
  });
  const topAlumnos = Object.entries(porAlumno)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,5);

  const exportarCSV = () => {
    const rows = [
      ['Folio','Fecha','Cliente','Total','Método','Referencia'],
      ...cobrosFilt.map(c=>[c.folio,c.fecha,`"${c.cliente}"`,c.total,c.metodo,c.referencia||''])
    ];
    const csv = rows.map(r=>r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
    a.download = `reporte-${escuela?.clave||'esc'}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  return (
    <div>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:10}}>
        <div>
          {escuela && <span style={{color:escuela.color,marginRight:8}}>{escuela.logo_emoji}</span>}
          <span style={{fontWeight:700, fontSize:16, color:'var(--ink)'}}>
            Reporte de cobros — {escuela?.nombre || 'Esta escuela'}
          </span>
        </div>
        <div style={{display:'flex', gap:8, alignItems:'center', flexWrap:'wrap'}}>
          <div style={{display:'flex', gap:4}}>
            {[['hoy','Hoy'],['semana','Semana'],['mes','Mes'],['anio','Año'],['todo','Todo']].map(([val,label])=>(
              <button key={val}
                className={periodo===val?'btn btn-primary btn-sm':'btn btn-secondary btn-sm'}
                onClick={()=>setPeriodo(val)}>{label}</button>
            ))}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={exportarCSV} style={{display:"flex",alignItems:"center",gap:6}}><Icon name="download" size={14} color="currentColor"/> CSV</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="stats-grid" style={{marginBottom:20}}>
        <div className="stat-card">
          <div className="stat-icon" style={{background:'var(--accent-glow)'}}><Icon name="pay" size={19} color="var(--lime)"/></div>
          <div className="stat-label">Total cobrado</div>
          <div className="stat-value" style={{fontSize:20}}>{fmt(totalFilt)}</div>
          <div className="stat-meta">{cobrosFilt.length} transacciones</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{background:'var(--amber-glow)'}}><Icon name="history" size={19} color="var(--amber)"/></div>
          <div className="stat-label">Pendiente total</div>
          <div className="stat-value" style={{fontSize:20,color:'var(--amber)'}}>{fmt(data.cobros.filter(c=>c.estado==='pendiente').reduce((a,c)=>a+c.total,0))}</div>
          <div className="stat-meta">{data.cobros.filter(c=>c.estado==='pendiente').length} cobros</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{background:'var(--purple-glow)'}}><Icon name="familias" size={20} color="currentColor"/></div>
          <div className="stat-label">Familias activas</div>
          <div className="stat-value" style={{fontSize:20}}>{data.familias.filter(f=>f.activa).length}</div>
          <div className="stat-meta">{data.clientes.filter(c=>c.familia_id).length} alumnos agrupados</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{background:'var(--green-glow)'}}><Icon name="alumnos" size={19} color="var(--green)"/></div>
          <div className="stat-label">Alumnos activos</div>
          <div className="stat-value" style={{fontSize:20}}>{data.clientes.filter(c=>c.activo).length}</div>
          <div className="stat-meta">{data.clientes.filter(c=>c.activo&&c.saldo_pendiente>0).length} con adeudo</div>
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:20}}>
        {/* Por método */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Por método de pago</div>
            <div className="card-sub">{cobrosFilt.length} transacciones</div>
          </div>
          {porMetodo.map(m => (
            <div key={m.metodo} style={{marginBottom:16}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
                <span style={{fontSize:13,color:'var(--ink-2)'}}>{metodoIconos[m.metodo]} {m.metodo}</span>
                <span style={{fontSize:12,color:'var(--ink-3)',fontFamily:'var(--mono)'}}>{fmt(m.total)} · {m.count} cobros</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{width:Math.round(m.total/maxMetodo*100)+'%',background:metodoColors[m.metodo]}}></div>
              </div>
            </div>
          ))}
        </div>

        {/* Top clientes */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Top por monto</div>
            <div className="card-sub">Alumnos con más cobros</div>
          </div>
          {topAlumnos.length === 0 && <div className="empty-state"><div className="empty-text">Sin datos en este período</div></div>}
          {topAlumnos.map(([nombre,total],i)=>(
            <div key={nombre} style={{display:'flex',alignItems:'center',gap:12,padding:'9px 0',borderBottom:'1px solid var(--glass-light)'}}>
              <div style={{
                width:26,height:26,borderRadius:6,background:'var(--glass-hover)',
                display:'flex',alignItems:'center',justifyContent:'center',
                fontSize:11,fontWeight:700,color:i===0?'var(--amber)':'var(--ink-3)',flexShrink:0
              }}>{i+1}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{nombre}</div>
              </div>
              <div style={{fontFamily:'var(--mono)',fontSize:13,fontWeight:600,color:'var(--green)',flexShrink:0}}>{fmt(total)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Alumnos con adeudo */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Alumnos con saldo pendiente</div>
          <div className="card-sub">{data.clientes.filter(c=>c.saldo_pendiente>0&&c.activo).length} alumnos</div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Alumno</th><th>Matrícula</th><th>Grado</th><th>Familia</th><th>Adeudo</th></tr></thead>
            <tbody>
              {data.clientes.filter(c=>c.saldo_pendiente>0&&c.activo).map(c=>(
                <tr key={c.id}>
                  <td style={{fontWeight:500,fontSize:13}}>{c.nombre}</td>
                  <td><span style={{fontFamily:'var(--mono)',fontSize:11}}>{c.matricula||'—'}</span></td>
                  <td style={{color:'var(--ink-3)',fontSize:12}}>{c.grado||'—'}</td>
                  <td style={{fontSize:12,color:'var(--ink-3)'}}>{c.familia_id ? data.familias.find(f=>f.id===c.familia_id)?.nombre : '—'}</td>
                  <td><span style={{fontFamily:'var(--mono)',fontWeight:700,color:'var(--red)'}}>{fmt(c.saldo_pendiente)}</span></td>
                </tr>
              ))}
              {data.clientes.filter(c=>c.saldo_pendiente>0&&c.activo).length===0 && (
                <tr><td colSpan={5}><div className="empty-state"><div className="empty-icon"><Icon name="check" size={36} color="currentColor"/></div><div className="empty-text">¡Todos al corriente!</div></div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
