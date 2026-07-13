var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};
/* assets/js/app.jsx — App principal v3 · SVG icons · Pagalaescuela branding */

const NAV_ITEMS = [{
  id: 'dashboard',
  label: 'Dashboard',
  icon: 'dashboard',
  section: 'principal',
  roles: ['cajero', 'admin', 'superadmin']
}, {
  id: 'caja',
  label: 'Caja de cobros',
  icon: 'caja',
  section: 'principal',
  roles: ['cajero', 'admin', 'superadmin']
}, {
  id: 'cobros',
  label: 'Historial cobros',
  icon: 'cobros',
  section: 'principal',
  roles: ['cajero', 'admin', 'superadmin']
}, {
  id: 'alumnos',
  label: 'Alumnos',
  icon: 'alumnos',
  section: 'principal',
  roles: ['cajero', 'admin', 'superadmin']
}, {
  id: 'familias',
  label: 'Familias',
  icon: 'familias',
  section: 'principal',
  roles: ['cajero', 'admin', 'superadmin']
}, {
  id: 'productos',
  label: 'Conceptos de pago',
  icon: 'productos',
  section: 'configuración',
  roles: ['admin', 'superadmin']
}, {
  id: 'facturacion',
  label: 'Facturación',
  icon: 'facturacion2',
  section: 'configuración',
  roles: ['admin', 'superadmin']
}, {
  id: 'recordatorios',
  label: 'Recordatorios',
  icon: 'emails',
  section: 'configuración',
  roles: ['admin', 'superadmin']
}, {
  id: 'reportes',
  label: 'Reportes',
  icon: 'reportes',
  section: 'configuración',
  roles: ['admin', 'superadmin']
}, {
  id: 'escuelas',
  label: 'Escuelas',
  icon: 'escuelas',
  section: 'superadmin',
  roles: ['superadmin']
}, {
  id: 'usuarios',
  label: 'Usuarios',
  icon: 'usuarios',
  section: 'superadmin',
  roles: ['superadmin']
}, {
  id: 'miequipo',
  label: 'Mi equipo',
  icon: 'miequipo',
  section: 'configuración',
  roles: ['admin']
}, {
  id: 'superreportes',
  label: 'Reportes globales',
  icon: 'superreportes',
  section: 'superadmin',
  roles: ['superadmin']
}];
const TITLES = {
  dashboard: 'Dashboard',
  caja: 'Caja de cobros',
  cobros: 'Historial de cobros',
  alumnos: 'Alumnos',
  familias: 'Familias',
  productos: 'Conceptos de pago',
  facturacion: 'Facturación',
  recordatorios: 'Recordatorios',
  reportes: 'Reportes',
  escuelas: 'Gestión de Escuelas',
  superreportes: 'Reportes Globales',
  usuarios: 'Gestión de Usuarios',
  miequipo: 'Mi Equipo'
};
// Red de seguridad: si algo inesperado revienta el render de <App/>, React
// desmonta todo el árbol y deja la pantalla en blanco. Este ErrorBoundary
// evita eso mostrando un mensaje con botón de reintento, y deja el error
// visible en consola para poder diagnosticarlo.
class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('[EduPago] Error de render capturado por ErrorBoundary:', error, info);
  }
  render() {
    if (this.state.error) {
      return _jsxDEV("div", {
        style: {
          height: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          background: '#0d1020', color: '#eef1f8', fontFamily: 'system-ui, sans-serif',
          padding: 24, textAlign: 'center',
        },
        children: [
          _jsxDEV("div", { style: { fontSize: 18, fontWeight: 700 }, children: 'Ocurrió un problema al cargar la sesión' }, void 0, false),
          _jsxDEV("div", { style: { fontSize: 13, color: '#8b93a7', maxWidth: 420 }, children: 'Esto puede pasar justo después de iniciar sesión mientras se cargan tus datos. Intenta de nuevo.' }, void 0, false),
          _jsxDEV("button", {
            onClick: () => window.location.reload(),
            style: {
              background: '#bdcf00', color: '#12152a', border: 'none',
              borderRadius: 8, padding: '10px 20px', fontWeight: 700, cursor: 'pointer',
            },
            children: 'Reintentar',
          }, void 0, false),
        ],
      }, void 0, true);
    }
    return this.props.children;
  }
}

function App() {
  const {
    useState,
    useEffect,
    useRef
  } = React;
  const dataRef = useRef(null);
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [view, setView] = useState('dashboard');
  const [theme, setTheme] = useState('dark');
  const [escuelaActiva, setEscuelaActiva] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);

  // El estado 'theme' inicia en 'dark', pero antes solo se aplicaba el atributo
  // data-theme al hacer toggle manual — en la carga inicial el <html> se quedaba
  // sin el atributo y la UI se mostraba con las variables de tema claro por
  // defecto del CSS, dando una sensación de pantalla "en blanco/clara" al entrar.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : '');
  }, [theme]);

  // Carga datos desde la API (MySQL) o desde localStorage como fallback (modo demo/offline)
  const cargarDatosDesdeAPI = async token => {
    try {
      const res = await fetch('api.php?action=cargar_datos', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      if (res.status === 401) { AuthController.logout(); window.location.reload(); return AppModel.load(); }
      const json = await res.json();
      if (json.success) {
        // Mezcla los datos de la DB con la estructura base de AppModel
        const base = AppModel.load();
        const merged = {
          ...base,
          escuelas:  (json.escuelas  || []).length ? json.escuelas  : (base.escuelas  || []),
          clientes:  json.clientes  || [],
          familias:  json.familias  || [],
          productos: (json.productos || []).length ? json.productos : (base.productos || []),
          cobros:    json.cobros    || [],
          recordatorios: base.recordatorios || [],
        };
        AppModel.save(merged);
        return merged;
      }
    } catch (e) {/* sin API: usar localStorage */}
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
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  const handleLogin = u => {
    setUser(u);
    if (u.escuela_id) setEscuelaActiva(u.escuela_id);else setEscuelaActiva(null);
    // Cargar datos frescos de la DB después del login
    cargarDatosDesdeAPI(u.token).then(loaded => {
      setData(loaded);
      dataRef.current = loaded;
    });
    setView('dashboard');
    SpeiPoller.iniciar({
      getData: () => dataRef.current,
      setData: setData,
      onConfirm: (cobro, json) => {
        // Alerta visual removida: causaba pantalla en blanco al aparecer.
        // El cobro se sigue confirmando en segundo plano (ver CobroController.confirmarPago).
        console.log('[SpeiPoller] Pago confirmado silenciosamente:', cobro.cliente);
      }
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
  if (!user) return /*#__PURE__*/_jsxDEV(Login, {
    onLogin: handleLogin
  }, void 0, false);
  if (user.rol === 'familia') {
    const escuela = data ? (data.escuelas || []).find(e => e.id === user.escuela_id) || null : null;
    return data ? /*#__PURE__*/_jsxDEV(PortalFamilia, {
      data: data,
      setData: setData,
      user: user,
      escuela: escuela,
      onLogout: handleLogout
    }, void 0, false) : /*#__PURE__*/_jsxDEV("div", {
      style: {
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--ink-3)'
      },
      children: "Cargando…"
    }, void 0, false);
  }
  if (!data) return /*#__PURE__*/_jsxDEV("div", {
    style: {
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--ink-3)'
    },
    children: "Cargando…"
  }, void 0, false);
  // Blindaje: si la API devolvió una forma incompleta (o llegó un objeto parcial
  // justo después del login), nunca dejamos que falte un array y rompa el render
  // (eso era lo que causaba la pantalla en blanco la primera vez).
  const dataSegura = {
    escuelas: data.escuelas || [],
    clientes: data.clientes || [],
    familias: data.familias || [],
    productos: data.productos || [],
    cobros: data.cobros || [],
    recordatorios: data.recordatorios || [],
  };
  const esSuper = AuthController.isSuperAdmin(user);
  const escuela = dataSegura.escuelas.find(e => e.id === escuelaActiva) || null;
  const dataScopeed = esSuper && !escuelaActiva ? dataSegura : {
    ...dataSegura,
    clientes:  dataSegura.clientes.filter(c => c.escuela_id === escuelaActiva),
    familias:  dataSegura.familias.filter(f => f.escuela_id === escuelaActiva),
    productos: dataSegura.productos.filter(p => p.escuela_id === escuelaActiva),
    cobros:    dataSegura.cobros.filter(c => c.escuela_id === escuelaActiva),
    recordatorios: dataSegura.recordatorios.filter(r => r.escuela_id === escuelaActiva),
  };
  const pendientes = (dataScopeed.cobros || []).filter(c => c.estado === 'pendiente').length;
  const secciones = [...new Set(NAV_ITEMS.filter(n => n.roles.includes(user.rol)).map(n => n.section))];
  const navItems = NAV_ITEMS.filter(n => n.roles.includes(user.rol));
  const renderView = () => {
    switch (view) {
      case 'dashboard':
        return /*#__PURE__*/_jsxDEV(Dashboard, {
          data: dataScopeed,
          user: user,
          escuela: escuela,
          allData: data
        }, void 0, false);
      case 'caja':
        return /*#__PURE__*/_jsxDEV(Caja, {
          data: dataScopeed,
          setData: d => setData(mergeScoped(data, d, escuelaActiva)),
          user: user,
          escuela: escuela
        }, void 0, false);
      case 'cobros':
        return /*#__PURE__*/_jsxDEV(Cobros, {
          data: dataScopeed,
          setData: d => setData(mergeScoped(data, d, escuelaActiva))
        }, void 0, false);
      case 'alumnos':
        return /*#__PURE__*/_jsxDEV(Alumnos, {
          data: dataScopeed,
          setData: d => setData(mergeScoped(data, d, escuelaActiva)),
          escuela_id: escuelaActiva
        }, void 0, false);
      case 'familias':
        return /*#__PURE__*/_jsxDEV(Familias, {
          data: dataScopeed,
          setData: d => setData(mergeScoped(data, d, escuelaActiva)),
          escuela_id: escuelaActiva
        }, void 0, false);
      case 'productos':
        return /*#__PURE__*/_jsxDEV(Productos, {
          data: dataScopeed,
          setData: d => setData(mergeScoped(data, d, escuelaActiva)),
          escuela_id: escuelaActiva
        }, void 0, false);
      case 'facturacion':
        return /*#__PURE__*/_jsxDEV(Facturacion, {
          data: dataScopeed,
          setData: d => setData(mergeScoped(data, d, escuelaActiva)),
          escuela: escuela
        }, void 0, false);
      case 'recordatorios':
        return /*#__PURE__*/_jsxDEV(Recordatorios, {
          data: dataScopeed,
          setData: d => setData(mergeScoped(data, d, escuelaActiva)),
          escuela: escuela
        }, void 0, false);
      case 'reportes':
        return /*#__PURE__*/_jsxDEV(Reportes, {
          data: dataScopeed,
          escuela: escuela
        }, void 0, false);
      case 'escuelas':
        return /*#__PURE__*/_jsxDEV(Escuelas, {
          data: dataSegura,
          setData: setData,
          onSeleccionar: id => {
            setEscuelaActiva(id);
            setView('dashboard');
          }
        }, void 0, false);
      case 'superreportes':
        return /*#__PURE__*/_jsxDEV(SuperReportes, {
          data: dataSegura
        }, void 0, false);
      case 'usuarios':
        return /*#__PURE__*/_jsxDEV(Usuarios, {
          user: user,
          data: dataSegura
        }, void 0, false);
      case 'miequipo':
        return /*#__PURE__*/_jsxDEV(Usuarios, {
          user: user,
          data: dataSegura
        }, void 0, false);
      default:
        return /*#__PURE__*/_jsxDEV(Dashboard, {
          data: dataScopeed,
          user: user,
          escuela: escuela,
          allData: data
        }, void 0, false);
    }
  };
  function mergeScoped(globalData, newScoped, eid) {
    if (!eid) return { ...globalData, ...newScoped };
    const gd = globalData || {};
    const ns = newScoped   || {};
    return {
      ...gd,
      clientes:  [...(gd.clientes  || []).filter(c => c.escuela_id !== eid), ...(ns.clientes  || [])],
      familias:  [...(gd.familias  || []).filter(f => f.escuela_id !== eid), ...(ns.familias  || [])],
      productos: [...(gd.productos || []).filter(p => p.escuela_id !== eid), ...(ns.productos || [])],
      cobros:    [...(gd.cobros    || []).filter(c => c.escuela_id !== eid), ...(ns.cobros    || [])],
      recordatorios: [...(gd.recordatorios || []).filter(r => r.escuela_id !== eid), ...(ns.recordatorios || [])],
      escuelas:  ns.escuelas || gd.escuelas || [],
    };
  }

  /* ── Iniciales del usuario para avatar ── */
  const initials = user.avatar || user.nombre.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const avatarCls = user.rol === 'superadmin' ? 'avatar-super' : user.rol === 'admin' ? 'avatar-admin' : 'avatar-cajero';
  const roleLabel = {
    superadmin: 'Super Admin',
    admin: 'Admin',
    cajero: 'Cajero'
  };
  return /*#__PURE__*/_jsxDEV("div", {
    className: `app${mobileNav ? ' nav-open' : ''}`,
    children: [/*#__PURE__*/_jsxDEV("div", {
      className: "nav-backdrop",
      onClick: () => setMobileNav(false)
    }, void 0, false), /*#__PURE__*/_jsxDEV("aside", {
      className: "sidebar",
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "sidebar-brand",
        children: [/*#__PURE__*/_jsxDEV("img", {
          src: "assets/logo.jpeg",
          alt: "paga la escuela",
          style: {
            height: 44,
            width: '100%',
            objectFit: 'contain',
            objectPosition: 'left center',
            display: 'block'
          },
          onError: e => {
            e.target.style.display = 'none';
            e.target.nextSibling.style.display = 'flex';
          }
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          style: {
            display: 'none',
            alignItems: 'center',
            gap: 10
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "brand-icon",
            children: /*#__PURE__*/_jsxDEV(Icon, {
              name: "escuelas",
              size: 18,
              color: "var(--navy)"
            }, void 0, false)
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "brand-name",
              children: "EduPago"
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              className: "brand-sub",
              children: "Pagalaescuela.com"
            }, void 0, false)]
          }, void 0, true)]
        }, void 0, true)]
      }, void 0, true), escuela && /*#__PURE__*/_jsxDEV("div", {
        style: {
          padding: '8px 16px 10px',
          borderBottom: '1px solid var(--border-glow)'
        },
        children: [/*#__PURE__*/_jsxDEV("div", {
          style: {
            fontSize: 11,
            color: 'var(--ink-4)',
            textTransform: 'uppercase',
            letterSpacing: '.5px',
            marginBottom: 2
          },
          children: "Escuela activa"
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          style: {
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--lime)'
          },
          children: escuela.nombre
        }, void 0, false)]
      }, void 0, true), esSuper && /*#__PURE__*/_jsxDEV("div", {
        style: {
          padding: '10px 12px',
          borderBottom: '1px solid var(--border-glow)'
        },
        children: /*#__PURE__*/_jsxDEV("div", {
          style: {
            position: 'relative'
          },
          children: [/*#__PURE__*/_jsxDEV(Icon, {
            name: "globe",
            size: 14,
            color: "var(--ink-4)",
            style: {
              position: 'absolute',
              left: 9,
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none'
            }
          }, void 0, false), /*#__PURE__*/_jsxDEV("select", {
            style: {
              width: '100%',
              background: 'var(--bg-surface-2)',
              border: '1px solid var(--border-glow)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--ink)',
              padding: '7px 10px 7px 28px',
              fontSize: 12,
              fontFamily: 'var(--font)',
              outline: 'none',
              appearance: 'none'
            },
            value: escuelaActiva || '',
            onChange: e => {
              setEscuelaActiva(e.target.value ? parseInt(e.target.value) : null);
              setView('dashboard');
            },
            children: [/*#__PURE__*/_jsxDEV("option", {
              value: "",
              children: "Vista global"
            }, void 0, false), (data.escuelas || []).map(e => /*#__PURE__*/_jsxDEV("option", {
              value: e.id,
              children: e.nombre + (e.activa ? '' : ' (Inactiva)')
            }, e.id, false))]
          }, void 0, true)]
        }, void 0, true)
      }, void 0, false), /*#__PURE__*/_jsxDEV("nav", {
        className: "sidebar-nav",
        children: secciones.map(sec => /*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "nav-section",
            children: sec
          }, void 0, false), navItems.filter(n => n.section === sec).map(n => /*#__PURE__*/_jsxDEV("div", {
            className: `nav-item ${view === n.id ? 'active' : ''}`,
            onClick: () => {
              setView(n.id);
              setMobileNav(false);
            },
            children: [/*#__PURE__*/_jsxDEV(Icon, {
              name: n.icon,
              size: 17,
              color: "currentColor"
            }, void 0, false), n.label, n.id === 'cobros' && pendientes > 0 && /*#__PURE__*/_jsxDEV("span", {
              className: "nav-badge",
              children: pendientes
            }, void 0, false)]
          }, n.id, true))]
        }, sec, true))
      }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
        className: "sidebar-footer",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "user-card",
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: `avatar ${avatarCls}`,
            children: initials
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "user-info",
            children: [/*#__PURE__*/_jsxDEV("div", {
              className: "user-name",
              children: user.nombre
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              className: "user-role",
              children: roleLabel[user.rol] || user.rol
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
            className: "logout-btn",
            onClick: handleLogout,
            title: "Cerrar sesión",
            children: /*#__PURE__*/_jsxDEV(Icon, {
              name: "logout",
              size: 17,
              color: "currentColor"
            }, void 0, false)
          }, void 0, false)]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          style: {
            marginTop: 10,
            paddingTop: 10,
            borderTop: '1px solid var(--glass-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
            style: {
              fontSize: 10,
              color: 'var(--ink-4)',
              lineHeight: 1.4
            },
            children: [/*#__PURE__*/_jsxDEV("span", {
              style: {
                fontWeight: 600,
                color: 'var(--ink-3)'
              },
              children: "Pagalaescuela.com®"
            }, void 0, false), /*#__PURE__*/_jsxDEV("br", {}, void 0, false), /*#__PURE__*/_jsxDEV("span", {
              children: "by Libertyfin · © 2026"
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("a", {
            href: "https://www.linkedin.com/company/libertyfin",
            target: "_blank",
            rel: "noopener noreferrer",
            title: "Libertyfin en LinkedIn",
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 6,
              flexShrink: 0,
              background: 'var(--glass-light)',
              border: '1px solid var(--border-glow)',
              color: 'var(--ink-3)',
              transition: 'all .15s',
              textDecoration: 'none'
            },
            onMouseEnter: e => {
              e.currentTarget.style.background = '#0a66c2';
              e.currentTarget.style.color = '#fff';
            },
            onMouseLeave: e => {
              e.currentTarget.style.background = 'var(--glass-light)';
              e.currentTarget.style.color = 'var(--ink-3)';
            },
            children: /*#__PURE__*/_jsxDEV("svg", {
              width: "14",
              height: "14",
              viewBox: "0 0 24 24",
              fill: "currentColor",
              xmlns: "http://www.w3.org/2000/svg",
              children: /*#__PURE__*/_jsxDEV("path", {
                d: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
              }, void 0, false)
            }, void 0, false)
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true)]
    }, void 0, true), /*#__PURE__*/_jsxDEV("main", {
      className: "main",
      children: [/*#__PURE__*/_jsxDEV("header", {
        className: "topbar",
        children: [/*#__PURE__*/_jsxDEV("button", {
          className: "mobile-menu-btn",
          onClick: () => setMobileNav(v => !v),
          "aria-label": "Abrir menú",
          children: /*#__PURE__*/_jsxDEV(Icon, {
            name: "menu",
            size: 20,
            color: "currentColor"
          }, void 0, false)
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          className: "topbar-title",
          children: [escuela && /*#__PURE__*/_jsxDEV("span", {
            style: {
              marginRight: 8,
              opacity: .6
            },
            children: /*#__PURE__*/_jsxDEV(Icon, {
              name: "escuelas",
              size: 16,
              color: "var(--lime)"
            }, void 0, false)
          }, void 0, false), TITLES[view] || 'EduPago']
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          className: "topbar-actions",
          children: [pendientes > 0 && /*#__PURE__*/_jsxDEV("div", {
            onClick: () => setView('cobros'),
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              background: 'var(--amber-glow)',
              border: '1px solid rgba(245,158,11,.2)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer'
            },
            children: [/*#__PURE__*/_jsxDEV(Icon, {
              name: "bell",
              size: 14,
              color: "#fbbf24"
            }, void 0, false), /*#__PURE__*/_jsxDEV("span", {
              style: {
                fontSize: 12,
                fontWeight: 600,
                color: '#fbbf24'
              },
              children: [pendientes, " pendiente", pendientes > 1 ? 's' : '']
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-primary btn-sm",
            onClick: () => setView('caja'),
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 6
            },
            children: [/*#__PURE__*/_jsxDEV(Icon, {
              name: "plus",
              size: 14,
              color: "currentColor"
            }, void 0, false), "Nuevo cobro"]
          }, void 0, true), /*#__PURE__*/_jsxDEV("button", {
            className: "theme-toggle",
            onClick: toggleTheme,
            title: "Cambiar tema",
            children: /*#__PURE__*/_jsxDEV(Icon, {
              name: theme === 'dark' ? 'sun' : 'moon',
              size: 16,
              color: "currentColor"
            }, void 0, false)
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        className: "content",
        children: renderView()
      }, void 0, false)]
    }, void 0, true)]
  }, void 0, true);
}
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(/*#__PURE__*/_jsxDEV(AppErrorBoundary, {
  children: /*#__PURE__*/_jsxDEV(App, {}, void 0, false)
}, void 0, false));
