/* assets/js/app.jsx — App principal v3 · SVG icons · Pagalaescuela branding */

const NAV_ITEMS = [
  { id:'dashboard',     label:'Dashboard',         icon:'dashboard',     section:'principal',     roles:['cajero','admin','superadmin'] },
  { id:'caja',          label:'Caja de cobros',    icon:'caja',          section:'principal',     roles:['cajero','admin','superadmin'] },
  { id:'cobros',        label:'Historial cobros',  icon:'cobros',        section:'principal',     roles:['cajero','admin','superadmin'] },
  { id:'alumnos',       label:'Alumnos',           icon:'alumnos',       section:'principal',     roles:['cajero','admin','superadmin'] },
  { id:'familias',      label:'Familias',          icon:'familias',      section:'principal',     roles:['cajero','admin','superadmin'] },
  { id:'productos',     label:'Conceptos de pago', icon:'productos',     section:'configuración', roles:['admin','superadmin'] },
  { id:'facturacion',   label:'Facturación CFDI',  icon:'facturacion2',  section:'configuración', roles:['admin','superadmin'] },
  { id:'emails',        label:'Correos',           icon:'emails',        section:'configuración', roles:['admin','superadmin'] },
  { id:'reportes',      label:'Reportes',          icon:'reportes',      section:'configuración', roles:['admin','superadmin'] },
  { id:'escuelas',      label:'Escuelas',          icon:'escuelas',      section:'superadmin',    roles:['superadmin'] },
  { id:'usuarios',      label:'Usuarios',          icon:'usuarios',      section:'superadmin',    roles:['superadmin'] },
  { id:'miequipo',      label:'Mi equipo',         icon:'miequipo',      section:'configuración', roles:['admin'] },
  { id:'superreportes', label:'Reportes globales', icon:'superreportes', section:'superadmin',    roles:['superadmin'] },
];

const TITLES = {
  dashboard:'Dashboard', caja:'Caja de cobros', cobros:'Historial de cobros',
  alumnos:'Alumnos', familias:'Familias', productos:'Conceptos de pago',
  facturacion:'Facturación CFDI', emails:'Correos', reportes:'Reportes',
  escuelas:'Gestión de Escuelas', superreportes:'Reportes Globales',
  usuarios:'Gestión de Usuarios', miequipo:'Mi Equipo',
};

function App() {
  const { useState, useEffect, useRef } = React;
  const dataRef = useRef(null);
  const [user, setUser]                 = useState(null);
  const [data, setData]                 = useState(null);
  const [view, setView]                 = useState('dashboard');
  const [theme, setTheme]               = useState('dark');
  const [escuelaActiva, setEscuelaActiva] = useState(null);

  // Carga datos desde la API (MySQL) o desde localStorage como fallback (modo demo/offline)
  const cargarDatosDesdeAPI = async (token) => {
    try {
      const res = await fetch('api.php?action=cargar_datos', {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (json.success) {
        // Mezcla los datos de la DB con la estructura base de AppModel
        const base = AppModel.load();
        const merged = {
          ...base,
          escuelas:  json.escuelas.length  ? json.escuelas  : base.escuelas,
          clientes:  json.clientes,
          familias:  json.familias,
          productos: json.productos.length ? json.productos : base.productos,
          cobros:    json.cobros,
        };
        AppModel.save(merged);
        return merged;
      }
    } catch(e) { /* sin API: usar localStorage */ }
    return AppModel.load();
  };

  useEffect(() => {
    const session = AuthController.getSession();
    if (session) {
      setUser(session);
      if (session.escuela_id) setEscuelaActiva(session.escuela_id);
      // Intentar cargar desde DB
      cargarDatosDesdeAPI(session.token).then(loaded => {
        setData(loaded);
        dataRef.current = loaded;
      });
    } else {
      const loaded = AppModel.load();
      setData(loaded);
      dataRef.current = loaded;
    }
  }, []);

  useEffect(() => { dataRef.current = data; }, [data]);

  const handleLogin = u => {
    setUser(u);
    if (u.escuela_id) setEscuelaActiva(u.escuela_id);
    else setEscuelaActiva(null);
    // Cargar datos frescos de la DB después del login
    cargarDatosDesdeAPI(u.token).then(loaded => {
      setData(loaded);
      dataRef.current = loaded;
    });
    setView('dashboard');
    SpeiPoller.iniciar({
      getData:   () => dataRef.current,
      setData:   setData,
      onConfirm: (cobro, json) => {
        const div = document.createElement('div');
        div.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;background:#1c2050;border:1px solid #bdcf00;border-radius:12px;padding:14px 18px;color:#fff;font-family:inherit;font-size:13px;max-width:300px;box-shadow:0 4px 24px rgba(0,0,0,.4);animation:slideIn .3s ease';
        div.innerHTML = '<div style="font-weight:700;margin-bottom:4px;color:#bdcf00">Pago SPEI confirmado</div><div style="opacity:.85">' + cobro.cliente + '</div><div style="font-family:monospace;font-size:15px;margin-top:4px;color:#49af54">' + (json.monto_pesos ? '$' + parseFloat(json.monto_pesos).toLocaleString('es-MX') : '') + '</div>';
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 5000);
      },
    });
  };

  const handleLogout = () => {
    AuthController.logout();
    SpeiPoller.detener();
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

  if (user.rol === 'familia') {
    const escuela = data ? data.escuelas.find(e => e.id === user.escuela_id) || null : null;
    return data
      ? <PortalFamilia data={data} setData={setData} user={user} escuela={escuela} onLogout={handleLogout}/>
      : <div style={{height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--ink-3)'}}>Cargando…</div>;
  }

  if (!data) return (
    <div style={{height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--ink-3)'}}>
      Cargando…
    </div>
  );

  const esSuper      = AuthController.isSuperAdmin(user);
  const escuela      = data.escuelas.find(e => e.id === escuelaActiva) || null;

  const dataScopeed = esSuper && !escuelaActiva ? data : {
    ...data,
    clientes:  data.clientes.filter(c => c.escuela_id === escuelaActiva),
    familias:  data.familias.filter(f => f.escuela_id === escuelaActiva),
    productos: data.productos.filter(p => p.escuela_id === escuelaActiva),
    cobros:    data.cobros.filter(c => c.escuela_id === escuelaActiva),
    emails:    data.emails.filter(e => e.escuela_id === escuelaActiva),
  };

  const pendientes = dataScopeed.cobros.filter(c => c.estado === 'pendiente').length;

  const secciones = [...new Set(NAV_ITEMS.filter(n => n.roles.includes(user.rol)).map(n => n.section))];
  const navItems  = NAV_ITEMS.filter(n => n.roles.includes(user.rol));

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

  /* ── Iniciales del usuario para avatar ── */
  const initials = user.avatar || user.nombre.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const avatarCls = user.rol==='superadmin' ? 'avatar-super' : user.rol==='admin' ? 'avatar-admin' : 'avatar-cajero';

  const roleLabel = { superadmin: 'Super Admin', admin: 'Admin', cajero: 'Cajero' };

  return (
    <div className="app">
      {/* ══ SIDEBAR ══ */}
      <aside className="sidebar">

        {/* Logo Pagalaescuela */}
        <div className="sidebar-brand">
          <img
            src="assets/logo.jpeg"
            alt="paga la escuela"
            style={{height:44, width:'100%', objectFit:'contain', objectPosition:'left center', display:'block'}}
            onError={e => {
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
          {/* Fallback si falla la imagen */}
          <div style={{display:'none', alignItems:'center', gap:10}}>
            <div className="brand-icon">
              <Icon name="escuelas" size={18} color="var(--navy)"/>
            </div>
            <div>
              <div className="brand-name">EduPago</div>
              <div className="brand-sub">Pagalaescuela.com</div>
            </div>
          </div>
        </div>

        {/* Escuela activa label */}
        {escuela && (
          <div style={{padding:'8px 16px 10px', borderBottom:'1px solid var(--border-glow)'}}>
            <div style={{fontSize:11, color:'var(--ink-4)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:2}}>Escuela activa</div>
            <div style={{fontSize:13, fontWeight:600, color:'var(--lime)'}}>{escuela.nombre}</div>
          </div>
        )}

        {/* Selector de escuela para superadmin */}
        {esSuper && (
          <div style={{padding:'10px 12px', borderBottom:'1px solid var(--border-glow)'}}>
            <div style={{position:'relative'}}>
              <Icon name="globe" size={14} color="var(--ink-4)" style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}}/>
              <select
                style={{width:'100%', background:'var(--bg-surface-2)', border:'1px solid var(--border-glow)', borderRadius:'var(--radius-sm)', color:'var(--ink)', padding:'7px 10px 7px 28px', fontSize:12, fontFamily:'var(--font)', outline:'none', appearance:'none'}}
                value={escuelaActiva || ''}
                onChange={e => { setEscuelaActiva(e.target.value ? parseInt(e.target.value) : null); setView('dashboard'); }}
              >
                <option value="">Vista global</option>
                {data.escuelas.map(e => (
                  <option key={e.id} value={e.id}>{e.nombre}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="sidebar-nav">
          {secciones.map(sec => (
            <div key={sec}>
              <div className="nav-section">{sec}</div>
              {navItems.filter(n => n.section === sec).map(n => (
                <div key={n.id}
                  className={`nav-item ${view === n.id ? 'active' : ''}`}
                  onClick={() => setView(n.id)}
                >
                  <Icon name={n.icon} size={17} color="currentColor"/>
                  {n.label}
                  {n.id === 'cobros' && pendientes > 0 && (
                    <span className="nav-badge">{pendientes}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer: user info + branding */}
        <div className="sidebar-footer">
          <div className="user-card">
            <div className={`avatar ${avatarCls}`}>{initials}</div>
            <div className="user-info">
              <div className="user-name">{user.nombre}</div>
              <div className="user-role">{roleLabel[user.rol] || user.rol}</div>
            </div>
            <button className="logout-btn" onClick={handleLogout} title="Cerrar sesión">
              <Icon name="logout" size={17} color="currentColor"/>
            </button>
          </div>
          {/* Branding + LinkedIn */}
          <div style={{marginTop:10, paddingTop:10, borderTop:'1px solid var(--glass-light)', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
            <div style={{fontSize:10, color:'var(--ink-4)', lineHeight:1.4}}>
              <span style={{fontWeight:600, color:'var(--ink-3)'}}>Pagalaescuela.com®</span><br/>
              <span>by Libertyfin · © 2026</span>
            </div>
            <a href="https://www.linkedin.com/company/libertyfin" target="_blank" rel="noopener noreferrer"
              title="Libertyfin en LinkedIn"
              style={{display:'flex',alignItems:'center',justifyContent:'center',
                width:28,height:28,borderRadius:6,flexShrink:0,
                background:'var(--glass-light)',border:'1px solid var(--border-glow)',
                color:'var(--ink-3)',transition:'all .15s',textDecoration:'none'}}
              onMouseEnter={e=>{e.currentTarget.style.background='#0a66c2';e.currentTarget.style.color='#fff';}}
              onMouseLeave={e=>{e.currentTarget.style.background='var(--glass-light)';e.currentTarget.style.color='var(--ink-3)';}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            </a>
          </div>
        </div>
      </aside>

      {/* ══ MAIN ══ */}
      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            {escuela && (
              <span style={{marginRight:8, opacity:.6}}>
                <Icon name="escuelas" size={16} color="var(--lime)"/>
              </span>
            )}
            {TITLES[view] || 'EduPago'}
          </div>
          <div className="topbar-actions">
            {pendientes > 0 && (
              <div onClick={() => setView('cobros')} style={{
                display:'flex', alignItems:'center', gap:6, padding:'6px 12px',
                background:'var(--amber-glow)', border:'1px solid rgba(245,158,11,.2)',
                borderRadius:'var(--radius-sm)', cursor:'pointer'
              }}>
                <Icon name="bell" size={14} color="#fbbf24"/>
                <span style={{fontSize:12, fontWeight:600, color:'#fbbf24'}}>{pendientes} pendiente{pendientes>1?'s':''}</span>
              </div>
            )}
            <button className="btn btn-primary btn-sm" onClick={() => setView('caja')}
              style={{display:'flex',alignItems:'center',gap:6}}>
              <Icon name="plus" size={14} color="var(--navy)"/>
              Nuevo cobro
            </button>
            <button className="theme-toggle" onClick={toggleTheme} title="Cambiar tema">
              <Icon name={theme==='dark'?'sun':'moon'} size={16} color="currentColor"/>
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