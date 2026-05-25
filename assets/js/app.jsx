/* assets/js/app.jsx — App principal MVC */

const NAV_ITEMS = [
  { id:'dashboard', label:'Dashboard', icon:'📊', section:'principal', admin:false },
  { id:'caja', label:'Caja de cobros', icon:'🏪', section:'principal', admin:false },
  { id:'cobros', label:'Historial de cobros', icon:'🧾', section:'principal', admin:false },
  { id:'clientes', label:'Alumnos y familias', icon:'👥', section:'principal', admin:false },
  { id:'productos', label:'Conceptos de pago', icon:'💡', section:'configuracion', admin:true },
  { id:'facturacion', label:'Facturación CFDI', icon:'📄', section:'configuracion', admin:false },
  { id:'emails', label:'Correos', icon:'✉', section:'configuracion', admin:false },
  { id:'reportes', label:'Reportes', icon:'📈', section:'configuracion', admin:true },
];

const TITLES = {
  dashboard:'Dashboard', caja:'Caja de cobros', cobros:'Historial de cobros',
  clientes:'Alumnos y familias', productos:'Conceptos de pago',
  facturacion:'Facturación CFDI', emails:'Correos', reportes:'Reportes y estadísticas',
};

function App() {
  const { useState, useEffect } = React;
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [view, setView] = useState('dashboard');
  const [theme, setTheme] = useState('dark');

  // Cargar datos y sesión
  useEffect(() => {
    const session = AuthController.getSession();
    if (session) setUser(session);
    setData(AppModel.load());
  }, []);

  const handleLogin = u => {
    setUser(u);
    setData(AppModel.load());
  };

  const handleLogout = () => {
    AuthController.logout();
    setUser(null);
    setView('dashboard');
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next === 'light' ? 'light' : '');
  };

  if (!user) return <Login onLogin={handleLogin}/>;
  if (!data) return <div style={{height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--ink-3)'}}>Cargando…</div>;

  const pendientes = data.cobros.filter(c => c.estado==='pendiente').length;
  const visibleNav = NAV_ITEMS.filter(n => !n.admin || AuthController.hasRole(user, 'admin'));

  const renderView = () => {
    switch(view) {
      case 'dashboard': return <Dashboard data={data} user={user}/>;
      case 'caja': return <Caja data={data} setData={setData} user={user}/>;
      case 'cobros': return <Cobros data={data} setData={setData}/>;
      case 'clientes': return <Clientes data={data} setData={setData}/>;
      case 'productos': return <Productos data={data} setData={setData}/>;
      case 'facturacion': return <Facturacion data={data} setData={setData}/>;
      case 'emails': return <Emails data={data} setData={setData}/>;
      case 'reportes': return <Reportes data={data}/>;
      default: return <Dashboard data={data} user={user}/>;
    }
  };

  // Agrupar nav por sección
  const secciones = [...new Set(visibleNav.map(n=>n.section))];

  return (
    <div className="app">
      {/* ── SIDEBAR ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo">
            <div className="brand-icon">🎓</div>
            <div>
              <div className="brand-name">EduPago</div>
              <div className="brand-sub">Cobros Escolar</div>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {secciones.map(sec => (
            <div key={sec}>
              <div className="nav-section">{sec}</div>
              {visibleNav.filter(n=>n.section===sec).map(n => (
                <div key={n.id}
                  className={`nav-item ${view===n.id?'active':''}`}
                  onClick={()=>setView(n.id)}>
                  <span className="nav-icon">{n.icon}</span>
                  {n.label}
                  {n.id==='cobros' && pendientes>0 && (
                    <span className="nav-badge">{pendientes}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className={`avatar ${user.rol==='admin'?'avatar-admin':'avatar-cajero'}`}>
              {user.avatar || user.nombre.split(' ').map(w=>w[0]).join('').slice(0,2)}
            </div>
            <div className="user-info">
              <div className="user-name">{user.nombre}</div>
              <div className="user-role">{user.rol === 'admin' ? '👑 Administrador' : '🧾 Cajero'}</div>
            </div>
            <button className="logout-btn" onClick={handleLogout} title="Cerrar sesión">⏻</button>
          </div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="main">
        <header className="topbar">
          <div className="topbar-title">{TITLES[view]||'EduPago'}</div>
          <div className="topbar-actions">
            {/* Indicador de cobros pendientes */}
            {pendientes > 0 && (
              <div onClick={()=>setView('cobros')} style={{
                display:'flex',alignItems:'center',gap:6,padding:'6px 12px',
                background:'var(--amber-glow)',border:'1px solid rgba(245,158,11,.2)',
                borderRadius:'var(--radius-sm)',cursor:'pointer',transition:'all .2s'
              }}>
                <span style={{fontSize:14}}>⏳</span>
                <span style={{fontSize:12,fontWeight:600,color:'#fbbf24'}}>{pendientes} pendiente{pendientes>1?'s':''}</span>
              </div>
            )}

            {/* Quick cobro */}
            <button className="btn btn-primary btn-sm" onClick={()=>setView('caja')}>
              + Nuevo cobro
            </button>

            {/* Theme toggle */}
            <button className="theme-toggle" onClick={toggleTheme} title="Cambiar tema">
              {theme==='dark' ? '☀️' : '🌙'}
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

// ── MOUNT ──
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
