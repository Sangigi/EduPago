/* views/SuperReportes.jsx — Reportes globales para super admin */
function SuperReportes({ data }) {
  const { useState } = React;
  const [filtroEsc, setFiltroEsc] = useState('todas');

  const stats = AppModel.getEstadisticasGlobales(data);
  const filtradas = filtroEsc === 'todas' ? stats : stats.filter(s => s.escuela_id === parseInt(filtroEsc));

  const totalGlobal   = stats.reduce((a, s) => a + s.totalCobrado, 0);
  const pendGlobal    = stats.reduce((a, s) => a + s.totalPendiente, 0);
  const alumnosGlobal = stats.reduce((a, s) => a + s.numAlumnos, 0);
  const cobrosGlobal  = stats.reduce((a, s) => a + s.numCobros, 0);

  // Totales por método (todas las escuelas)
  const metodos = ['TC', 'SPEI', 'CoDi', 'Efectivo'];
  const metodoGlobal = {};
  metodos.forEach(m => {
    metodoGlobal[m] = stats.reduce((a, s) => a + (s.porMetodo[m] || 0), 0);
  });
  const totalMetodos = Object.values(metodoGlobal).reduce((a, b) => a + b, 0) || 1;

  const METODO_ICONS   = { TC:'💳', SPEI:'🏦', CoDi:'📱', Efectivo:'💵' };
  const METODO_COLORS  = { TC:'var(--accent)', SPEI:'var(--purple)', CoDi:'var(--green)', Efectivo:'var(--amber)' };
  const PLAN_BADGE     = { free:'badge-gray', pro:'badge-blue', enterprise:'badge-purple' };

  const exportarCSV = () => {
    const rows = [
      ['Escuela','Plan','Alumnos','Cobros','Total cobrado','Pendiente','TC','SPEI','CoDi','Efectivo'],
      ...stats.map(s => [
        s.nombre, s.plan, s.numAlumnos, s.numCobros,
        s.totalCobrado, s.totalPendiente,
        s.porMetodo.TC, s.porMetodo.SPEI, s.porMetodo.CoDi, s.porMetodo.Efectivo
      ])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `edupago-global-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  return (
    <div>
      {/* KPIs globales */}
      <div className="stats-grid" style={{marginBottom:24}}>
        {[
          { label:'Total cobrado',   val:fmt(totalGlobal),  icon:'💰', bg:'var(--accent-glow)',  meta:`${data.escuelas.length} escuelas` },
          { label:'Por cobrar',      val:fmt(pendGlobal),   icon:'⏳', bg:'var(--amber-glow)',   meta:'Pendiente en sistema' },
          { label:'Total alumnos',   val:alumnosGlobal,     icon:'🎒', bg:'var(--purple-glow)',  meta:'Activos en el sistema' },
          { label:'Total cobros',    val:cobrosGlobal,      icon:'🧾', bg:'var(--green-glow)',   meta:'Transacciones' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-icon" style={{background:s.bg}}>{s.icon}</div>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{fontSize:20}}>{s.val}</div>
            <div className="stat-meta">{s.meta}</div>
          </div>
        ))}
      </div>

      {/* Métodos de pago globales */}
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:20}}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Métodos de pago (todas las escuelas)</div>
          </div>
          {metodos.map(m => {
            const val = metodoGlobal[m] || 0;
            const pct = Math.round(val / totalMetodos * 100);
            return (
              <div key={m} style={{marginBottom:14}}>
                <div style={{display:'flex', justifyContent:'space-between', marginBottom:4}}>
                  <span style={{fontSize:13, color:'var(--ink-2)'}}>{METODO_ICONS[m]} {m}</span>
                  <span style={{fontSize:12, fontFamily:'var(--mono)', color:'var(--ink-3)'}}>{fmt(val)} · {pct}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{width:pct+'%', background:METODO_COLORS[m]}}></div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Cobrado por escuela (barras) */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Cobrado por escuela</div>
          </div>
          {stats.length === 0 && <div className="empty-state"><div className="empty-text">Sin datos</div></div>}
          {stats.map(s => {
            const pct = Math.round((s.totalCobrado / (totalGlobal || 1)) * 100);
            return (
              <div key={s.escuela_id} style={{marginBottom:14}}>
                <div style={{display:'flex', justifyContent:'space-between', marginBottom:4}}>
                  <span style={{fontSize:13, color:'var(--ink-2)'}}>{s.emoji} {s.nombre.split(' ').slice(0,2).join(' ')}</span>
                  <span style={{fontSize:12, fontFamily:'var(--mono)', color:'var(--ink-3)'}}>{fmt(s.totalCobrado)}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{width:pct+'%', background:s.color}}></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabla detalle por escuela */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Desglose por escuela</div>
            <div className="card-sub">Todas las instituciones registradas</div>
          </div>
          <div style={{display:'flex', gap:8}}>
            <select className="form-select" style={{fontSize:12, padding:'6px 10px', width:'auto'}}
              value={filtroEsc} onChange={e=>setFiltroEsc(e.target.value)}>
              <option value="todas">Todas</option>
              {data.escuelas.map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
            <button className="btn btn-secondary btn-sm" onClick={exportarCSV}>📥 Exportar CSV</button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Escuela</th><th>Plan</th><th>Alumnos</th><th>Cobros</th>
                <th>Total cobrado</th><th>Pendiente</th><th>SPEI</th><th>Tarjeta</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map(s => (
                <tr key={s.escuela_id}>
                  <td>
                    <div style={{display:'flex', alignItems:'center', gap:10}}>
                      <span style={{fontSize:18}}>{s.emoji}</span>
                      <div>
                        <div style={{fontWeight:500, fontSize:13}}>{s.nombre}</div>
                        <div style={{fontSize:11, color:'var(--ink-4)', fontFamily:'var(--mono)'}}>{s.clave}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className={`badge ${PLAN_BADGE[s.plan]}`}>{s.plan}</span></td>
                  <td style={{fontFamily:'var(--mono)', fontSize:13}}>{s.numAlumnos}</td>
                  <td style={{fontFamily:'var(--mono)', fontSize:13}}>{s.numCobros}</td>
                  <td style={{fontFamily:'var(--mono)', fontWeight:600, color:'var(--green)'}}>{fmt(s.totalCobrado)}</td>
                  <td style={{fontFamily:'var(--mono)', color: s.totalPendiente>0 ? 'var(--amber)' : 'var(--ink-4)'}}>{fmt(s.totalPendiente)}</td>
                  <td style={{fontFamily:'var(--mono)', fontSize:12, color:'var(--purple)'}}>{fmt(s.porMetodo.SPEI)}</td>
                  <td style={{fontFamily:'var(--mono)', fontSize:12, color:'var(--accent)'}}>{fmt(s.porMetodo.TC)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
