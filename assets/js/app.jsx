/* assets/js/app.jsx — App principal v2 Multi-escuela */

const NAV_ITEMS = [
  { id:'dashboard', label:'Dashboard',         icon:'📊', section:'principal',     roles:['cajero','admin','superadmin'] },
  { id:'caja',      label:'Caja de cobros',    icon:'🏪', section:'principal',     roles:['cajero','admin','superadmin'] },
  { id:'cobros',    label:'Historial cobros',  icon:'🧾', section:'principal',     roles:['cajero','admin','superadmin'] },
  { id:'alumnos',   label:'Alumnos',           icon:'🎒', section:'principal',     roles:['cajero','admin','superadmin'] },
  { id:'familias',  label:'Familias',          icon:'👨‍👩‍👧‍👦', section:'principal',   roles:['cajero','admin','superadmin'] },
  { id:'productos', label:'Conceptos de pago', icon:'💡', section:'configuración', roles:['admin','superadmin'] },
  { id:'facturacion',label:'Facturación CFDI', icon:'📄', section:'configuración', roles:['admin','superadmin'] },
  { id:'emails',    label:'Correos',           icon:'✉',  section:'configuración', roles:['admin','superadmin'] },
  { id:'reportes',  label:'Reportes',          icon:'📈', section:'configuración', roles:['admin','superadmin'] },
  { id:'escuelas',  label:'Escuelas',          icon:'🏫', section:'superadmin',    roles:['superadmin'] },
  { id:'usuarios',  label:'Usuarios',          icon:'👤', section:'superadmin',    roles:['superadmin'] },
  { id:'miequipo',  label:'Mi equipo',         icon:'👥', section:'configuración', roles:['admin'] },
  { id:'superreportes', label:'Reportes globales', icon:'🌐', section:'superadmin', roles:['superadmin'] },
];

const TITLES = {
  dashboard:'Dashboard', caja:'Caja de cobros', cobros:'Historial de cobros',
  alumnos:'Alumnos', familias:'Familias', productos:'Conceptos de pago',
  facturacion:'Facturación CFDI', emails:'Correos', reportes:'Reportes',
  escuelas:'Gestión de Escuelas', superreportes:'Reportes Globales', usuarios:'Gestión de Usuarios', miequipo:'Mi Equipo',
};

function App() {
  const { useState, useEffect } = React;
  const [user, setUser]         = useState(null);
  const [data, setData]         = useState(null);
  const [view, setView]         = useState('dashboard');
  const [theme, setTheme]       = useState('dark');
  const [escuelaActiva, setEscuelaActiva] = useState(null); // ID escuela activa

  useEffect(() => {
    const session = AuthController.getSession();
    if (session) {
      setUser(session);
      // superadmin arranca en vista global; otros, en su escuela
      if (session.escuela_id) setEscuelaActiva(session.escuela_id);
    }
    setData(AppModel.load());
  }, []);

  const handleLogin = u => {
    setUser(u);
    if (u.escuela_id) setEscuelaActiva(u.escuela_id);
    else setEscuelaActiva(null); // superadmin: sin escuela seleccionada por defecto
    setData(AppModel.load());
    setView('dashboard');
  };

  const handleLogout = () => {
    AuthController.logout();
    setUser(null);
    setEscuelaActiva(null);
    setView('dashboard');
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next === 'light' ? 'light' : '');
  };

  if (!user) return <Login onLogin={handleLogin}/>;
  if (!data) return (
    <div style={{height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--ink-3)'}}>
      Cargando…
    </div>
  );

  // Filtrar datos por escuela activa (excepto superadmin que puede ver todo)
  const esSuper = AuthController.isSuperAdmin(user);
  const escuela = data.escuelas.find(e => e.id === escuelaActiva) || null;

  const dataScopeed = esSuper && !escuelaActiva ? data : {
    ...data,
    clientes:  data.clientes.filter(c => c.escuela_id === escuelaActiva),
    familias:  data.familias.filter(f => f.escuela_id === escuelaActiva),
    productos: data.productos.filter(p => p.escuela_id === escuelaActiva),
    cobros:    data.cobros.filter(c => c.escuela_id === escuelaActiva),
    emails:    data.emails.filter(e => e.escuela_id === escuelaActiva),
  };

  const pendientes = dataScopeed.cobros.filter(c => c.estado === 'pendiente').length;

  // Nav filtrado por rol
  const secciones = [...new Set(NAV_ITEMS
    .filter(n => n.roles.includes(user.rol))
    .map(n => n.section))];
  const navItems = NAV_ITEMS.filter(n => n.roles.includes(user.rol));

  const renderView = () => {
    switch(view) {
      case 'dashboard':     return <Dashboard data={dataScopeed} user={user} escuela={escuela} allData={data}/>;
      case 'caja':          return <Caja data={dataScopeed} setData={d=>setData(mergeScoped(data,d,escuelaActiva))} user={user} escuela={escuela}/>;
      case 'cobros':        return <Cobros data={dataScopeed} setData={d=>setData(mergeScoped(data,d,escuelaActiva))}/>;
      case 'alumnos':       return <Alumnos data={dataScopeed} setData={d=>setData(mergeScoped(data,d,escuelaActiva))} escuela_id={escuelaActiva}/>;
      case 'familias':      return <Familias data={dataScopeed} setData={d=>setData(mergeScoped(data,d,escuelaActiva))} escuela_id={escuelaActiva}/>;
      case 'productos':     return <Productos data={dataScopeed} setData={d=>setData(mergeScoped(data,d,escuelaActiva))} escuela_id={escuelaActiva}/>;
      case 'facturacion':   return <Facturacion data={dataScopeed} setData={d=>setData(mergeScoped(data,d,escuelaActiva))} escuela={escuela}/>;
      case 'emails':        return <Emails data={dataScopeed} setData={d=>setData(mergeScoped(data,d,escuelaActiva))}/>;
      case 'reportes':      return <Reportes data={dataScopeed} escuela={escuela}/>;
      case 'escuelas':      return <Escuelas data={data} setData={setData} onSeleccionar={id=>{setEscuelaActiva(id);setView('dashboard');}}/>;
      case 'superreportes': return <SuperReportes data={data}/>;
      case 'usuarios':      return <Usuarios user={user} data={data}/>;
      case 'miequipo':      return <Usuarios user={user} data={data}/>;
      default:              return <Dashboard data={dataScopeed} user={user} escuela={escuela} allData={data}/>;
    }
  };

  // Fusionar datos scopeados de vuelta al estado global
  function mergeScoped(globalData, newScoped, eid) {
    if (!eid) return newScoped;
    return {
      ...globalData,
      clientes:  [...globalData.clientes.filter(c=>c.escuela_id!==eid), ...newScoped.clientes],
      familias:  [...globalData.familias.filter(f=>f.escuela_id!==eid), ...newScoped.familias],
      productos: [...globalData.productos.filter(p=>p.escuela_id!==eid), ...newScoped.productos],
      cobros:    [...globalData.cobros.filter(c=>c.escuela_id!==eid), ...newScoped.cobros],
      emails:    [...globalData.emails.filter(e=>e.escuela_id!==eid), ...newScoped.emails],
      escuelas:  newScoped.escuelas || globalData.escuelas,
    };
  }

  return (
    <div className="app">
      {/* ── SIDEBAR ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo">
            <div className="brand-icon">{escuela?.logo_emoji || '🎓'}</div>
            <div>
              <div className="brand-name">EduPago</div>
              <div className="brand-sub" style={{color: escuela?.color || 'var(--ink-3)', opacity:.9}}>
                {escuela ? escuela.clave : (esSuper ? 'Super Admin' : 'Cobros Escolar')}
              </div>
            </div>
          </div>
        </div>

        {/* Selector de escuela para superadmin */}
        {esSuper && (
          <div style={{padding:'10px 14px', borderBottom:'1px solid var(--border-glow)'}}>
            <select
              style={{width:'100%', background:'var(--bg-surface-2)', border:'1px solid var(--border-glow)', borderRadius:'var(--radius-sm)', color:'var(--ink)', padding:'7px 10px', fontSize:12, fontFamily:'var(--font)', outline:'none'}}
              value={escuelaActiva || ''}
              onChange={e => { setEscuelaActiva(e.target.value ? parseInt(e.target.value) : null); setView('dashboard'); }}
            >
              <option value="">🌐 Vista global</option>
              {data.escuelas.map(e => (
                <option key={e.id} value={e.id}>{e.logo_emoji} {e.nombre}</option>
              ))}
            </select>
          </div>
        )}

        <nav className="sidebar-nav">
          {secciones.map(sec => (
            <div key={sec}>
              <div className="nav-section">{sec}</div>
              {navItems.filter(n => n.section === sec).map(n => (
                <div key={n.id}
                  className={`nav-item ${view === n.id ? 'active' : ''}`}
                  onClick={() => setView(n.id)}
                >
                  <span className="nav-icon">{n.icon}</span>
                  {n.label}
                  {n.id === 'cobros' && pendientes > 0 && (
                    <span className="nav-badge">{pendientes}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className={`avatar ${user.rol==='superadmin'?'avatar-super':user.rol==='admin'?'avatar-admin':'avatar-cajero'}`}>
              {user.avatar || user.nombre.split(' ').map(w=>w[0]).join('').slice(0,2)}
            </div>
            <div className="user-info">
              <div className="user-name">{user.nombre}</div>
              <div className="user-role">
                {user.rol==='superadmin'?'👑 Super Admin':user.rol==='admin'?'🏫 Admin':'🧾 Cajero'}
              </div>
            </div>
            <button className="logout-btn" onClick={handleLogout} title="Cerrar sesión">⏻</button>
          </div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            {escuela && <span style={{color:escuela.color, marginRight:8}}>{escuela.logo_emoji}</span>}
            {TITLES[view] || 'EduPago'}
          </div>
          <div className="topbar-actions">
            {pendientes > 0 && (
              <div onClick={() => setView('cobros')} style={{
                display:'flex', alignItems:'center', gap:6, padding:'6px 12px',
                background:'var(--amber-glow)', border:'1px solid rgba(245,158,11,.2)',
                borderRadius:'var(--radius-sm)', cursor:'pointer'
              }}>
                <span style={{fontSize:14}}>⏳</span>
                <span style={{fontSize:12, fontWeight:600, color:'#fbbf24'}}>{pendientes} pendiente{pendientes>1?'s':''}</span>
              </div>
            )}
            <button className="btn btn-primary btn-sm" onClick={() => setView('caja')}>
              + Nuevo cobro
            </button>
            <button className="theme-toggle" onClick={toggleTheme}>
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </header>

        <div className="content">
          {renderView()}
        </div>
      </main>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
