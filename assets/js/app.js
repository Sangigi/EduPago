var _jsxDEV = function(type, props, key, _s, _src, _self) {

  var p = Object.assign({ key: key || undefined }, props);



  var ch = p.children;

  delete p.children;



  return ch === undefined

    ? React.createElement(type, p)

    : Array.isArray(ch)

      ? React.createElement(type, p, ...ch)

      : React.createElement(type, p, ch);

};



/* assets/js/app.jsx — App principal v3 · SVG icons · Pagalaescuela branding */



const NAV_ITEMS = [{

  id: 'dashboard',

  label: 'Dashboard',

  icon: 'dashboard',

  section: 'principal',

  roles: ['cajero', 'admin']

}, {

  id: 'caja',

  label: 'Ingresos',

  icon: 'caja',

  section: 'principal',

  roles: ['cajero', 'admin']

}, {

  id: 'corte_caja',

  label: 'Corte de caja',

  icon: 'caja',

  section: 'principal',

  roles: ['cajero', 'admin']

}, {

  id: 'cobros',

  label: 'Historial cobros',

  icon: 'cobros',

  section: 'principal',

  roles: ['cajero', 'admin']

}, {

  id: 'alumnos',

  label: 'Alumnos',

  icon: 'alumnos',

  section: 'principal',

  roles: ['cajero', 'admin']

}, {

  id: 'familias',

  label: 'Familias',

  icon: 'familias',

  section: 'principal',

  roles: ['admin']

}, {

  id: 'productos',

  label: 'Conceptos de pago',

  icon: 'productos',

  section: 'configuración',

  roles: ['admin']

}, {

  id: 'facturacion',

  label: 'Facturación',

  icon: 'facturacion2',

  section: 'configuración',

  roles: ['admin']

}, {

  id: 'recordatorios',

  label: 'Recordatorios',

  icon: 'emails',

  section: 'configuración',

  roles: ['admin']

}, {

  id: 'reportes',

  label: 'Reportes',

  icon: 'reportes',

  section: 'configuración',

  roles: ['admin']

}, {

  id: 'escuelas',

  label: 'Colegios / Inquilinos',

  icon: 'escuelas',

  section: 'superadmin',

  roles: ['superadmin']

}, {

  id: 'suscripciones',

  label: 'Suscripciones',

  icon: 'facturacion2',

  section: 'superadmin',

  roles: ['superadmin']

}, {

  id: 'busqueda_global',

  label: 'Búsqueda Global',

  icon: 'search',

  section: 'superadmin',

  roles: ['superadmin']

}, {

  id: 'logs',

  label: 'Logs del Sistema',

  icon: 'reportes',

  section: 'superadmin',

  roles: ['superadmin']

}, {

  id: 'usuarios',

  label: 'Usuarios',

  icon: 'usuarios',

  section: 'superadmin',

  roles: ['superadmin']

}, {

  id: 'comisiones',

  label: 'Distribuidores y comisiones',

  icon: 'reportes',

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

  label: 'Métricas Globales',

  icon: 'superreportes',

  section: 'superadmin',

  roles: ['superadmin']

}];



const TITLES = {

  dashboard: 'Dashboard',

  caja: 'Ingresos',

  corte_caja: 'Corte de caja',

  cobros: 'Historial de cobros',

  alumnos: 'Alumnos',

  familias: 'Familias',

  productos: 'Conceptos de pago',

  facturacion: 'Facturación',

  recordatorios: 'Recordatorios',

  reportes: 'Reportes',

  escuelas: 'Colegios / Inquilinos',

  suscripciones: 'Suscripciones',

  logs: 'Logs del Sistema',

  busqueda_global: 'Búsqueda Global',

  superreportes: 'Métricas Globales',

  usuarios: 'Gestión de Usuarios',

  miequipo: 'Mi Equipo'

};





// * Red de seguridad: * si algo inesperado revienta el render de React, * evita que toda la pantalla quede en blanco.

class AppErrorBoundary extends React.Component {



  constructor(props) {

    super(props);



    this.state = {

      error: null

    };

  }



  static getDerivedStateFromError(error) {

    return {

      error

    };

  }



  componentDidCatch(error, info) {

    console.error(

      '[EduPago] Error de render capturado por ErrorBoundary:',

      error,

      info

    );

  }



  render() {

    if (this.state.error) {

      return _jsxDEV("div", {

        style: {

          height: '100vh',

          display: 'flex',

          flexDirection: 'column',

          alignItems: 'center',

          justifyContent: 'center',

          gap: 14,

          background: '#0d1020',

          color: '#eef1f8',

          fontFamily: 'system-ui, sans-serif',

          padding: 24,

          textAlign: 'center'

        },



        children: [



          _jsxDEV(

            "div",

            {

              style: {

                fontSize: 18,

                fontWeight: 700

              },

              children: 'Ocurrió un problema al cargar la sesión'

            },

            void 0,

            false

          ),



          _jsxDEV(

            "div",

            {

              style: {

                fontSize: 13,

                color: '#8b93a7',

                maxWidth: 420

              },

              children:

                'Esto puede pasar justo después de iniciar sesión mientras se cargan tus datos. Intenta de nuevo.'

            },

            void 0,

            false

          ),



          _jsxDEV(

            "button",

            {

              onClick: () => window.location.reload(),



              style: {

                background: '#bdcf00',

                color: '#12152a',

                border: 'none',

                borderRadius: 8,

                padding: '10px 20px',

                fontWeight: 700,

                cursor: 'pointer'

              },



              children: 'Reintentar'

            },

            void 0,

            false

          )



        ]

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



  const [theme, setTheme] = useState('light');



  const [escuelaActiva, setEscuelaActiva] = useState(null);



  const [mobileNav, setMobileNav] = useState(false);





  // * Tema inicial.

  useEffect(() => {

    document.documentElement.setAttribute(

      'data-theme',

      theme === 'dark' ? 'dark' : ''

    );

  }, [theme]);





  // * Carga datos desde la API (MySQL) * o desde localStorage como fallback.

  const cargarDatosDesdeAPI = async (token, escuelaId) => {



    try {



      const params = new URLSearchParams({

        action: 'cargar_datos'

      });



      if (escuelaId) {

        params.set('escuela_id_ver', escuelaId);

      }



      const res = await fetch(

        'api.php?' + params.toString(),

        {

          headers: {

            'Authorization': `Bearer ${token}`,

            'Content-Type': 'application/json'

          }

        }

      );



      if (res.status === 401) {

        AuthController.logout();

        window.location.reload();

        return AppModel.load();

      }



      const json = await res.json();



      if (json.success) {

        // Antes se mezclaba con AppModel.load() (un store de localStorage de
        // antes de que existiera el backend real): si la API regresaba una
        // lista vacía de escuelas/productos/recordatorios, se rellenaba con
        // lo último guardado en localStorage en vez de reflejar el estado
        // real — y ese resultado mezclado se volvía a guardar en AppModel,
        // perpetuando datos viejos. Ahora se confía siempre en la respuesta
        // real de la API, sin mezcla con caché local.
        const datosApi = {
          escuelas: json.escuelas || [],
          resumen_escuelas: json.resumen_escuelas || {},
          clientes: json.clientes || [],
          clientes_total: json.clientes_total,
          clientes_pagina: json.clientes_pagina,
          clientes_por_pagina: json.clientes_por_pagina,
          planteles: json.planteles || [],
          resumen_planteles: json.resumen_planteles || {},
          familias: json.familias || [],
          productos: json.productos || [],
          cobros: json.cobros || [],
          recordatorios: json.recordatorios || [],
        };

        return datosApi;

      }




    } catch (e) {

      // * Sin API: * usar localStorage.

    }



    return AppModel.load();

  };





  // * Restaurar sesión existente.

  useEffect(() => {



    const session = AuthController.getSession();



    if (session) {



      setUser(session);



      if (session.escuela_id) {

        setEscuelaActiva(session.escuela_id);

      }



      cargarDatosDesdeAPI(

        session.token,

        session.escuela_id

      ).then(loaded => {



        setData(loaded);



        dataRef.current = loaded;



      });



    } else {



      const loaded = AppModel.load();



      setData(loaded);



      dataRef.current = loaded;

    }



  }, []);





  // * Mantener referencia actualizada de los datos.

  useEffect(() => {

    dataRef.current = data;

  }, [data]);





  // * Superadmin: * al elegir una escuela se vuelve a consultar cargar_datos * usando escuela_id_ver.

  const esSuperParaFetch =

    user && AuthController.isSuperAdmin(user);



  useEffect(() => {



    if (

      !user ||

      !esSuperParaFetch ||

      !escuelaActiva

    ) {

      return;

    }



    cargarDatosDesdeAPI(

      user.token,

      escuelaActiva

    ).then(loaded => {



      setData(loaded);



      dataRef.current = loaded;



    });



    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [escuelaActiva]);





  // * LOGIN * * Ya no existe LoginTransition. * El login entra directamente al dashboard.

  const handleLogin = u => {



    if (u.escuela_id) {

      setEscuelaActiva(u.escuela_id);

    } else {

      setEscuelaActiva(null);

    }



    // * Cargar datos frescos de la DB.

    cargarDatosDesdeAPI(

      u.token,

      u.escuela_id

    ).then(loaded => {



      setData(loaded);



      dataRef.current = loaded;



    });



    setView('dashboard');





    // * Iniciar polling SPEI.

    SpeiPoller.iniciar({



      getData: () => dataRef.current,



      setData: setData,



      onConfirm: (cobro, json) => {



        console.log(

          '[SpeiPoller] Pago confirmado silenciosamente:',

          cobro.cliente

        );



      }



    });





    // * Entrar directamente.

    setUser(u);

  };





  // * LOGOUT

  const handleLogout = () => {



    AuthController.logout();



    SpeiPoller.detener();



    setUser(null);



    setEscuelaActiva(null);



    setView('dashboard');

  };





  // * CAMBIO DE TEMA

  const toggleTheme = () => {

    // Solo cambia el estado: el useEffect aplica data-theme y lo persiste. Antes esta función invertía el valor.

    setTheme(theme === 'dark' ? 'light' : 'dark');

  };





  // * LOGIN

  if (!user) {



    return _jsxDEV(

      Login,

      {

        onLogin: handleLogin

      },

      void 0,

      false

    );

  }





  // * PORTAL FAMILIA

  if (user.rol === 'familia') {



    const escuela = data

      ? (

          data.escuelas || []

        ).find(

          e => e.id === user.escuela_id

        ) || null

      : null;





    return data



      ? _jsxDEV(

          PortalFamilia,

          {

            data: data,



            setData: setData,



            user: user,



            escuela: escuela,



            onLogout: handleLogout

          },

          void 0,

          false

        )



      : _jsxDEV(

          "div",

          {

            style: {

              height: '100vh',

              display: 'flex',

              alignItems: 'center',

              justifyContent: 'center',

              color: 'var(--ink-3)'

            },



            children: "Cargando…"

          },

          void 0,

          false

        );

  }





  // * PORTAL DISTRIBUIDOR * No depende de cargar_datos (asume escuela_id fija en sesion); * Distribuidor.js trae su propia data via action=distribuidor_datos.

  if (user.rol === 'distribuidor') {

    return _jsxDEV(

      Distribuidor,

      {

        user: user,



        onLogout: handleLogout

      },

      void 0,

      false

    );

  }





  // * Mientras llegan los datos.

  if (!data) {



    return _jsxDEV(

      "div",

      {

        style: {

          height: '100vh',

          display: 'flex',

          alignItems: 'center',

          justifyContent: 'center',

          color: 'var(--ink-3)'

        },



        children: "Cargando…"

      },

      void 0,

      false

    );

  }





  // * Blindaje: * si la API devuelve una estructura incompleta, * nunca dejamos que falte un array.

  const dataSegura = {



    escuelas:

      data.escuelas || [],



    clientes:

      data.clientes || [],



    planteles:

      data.planteles || [],



    familias:

      data.familias || [],



    productos:

      data.productos || [],



    cobros:

      data.cobros || [],



    recordatorios:

      data.recordatorios || [],



    resumen_planteles:

      data.resumen_planteles || {},



    resumen_escuelas:

      data.resumen_escuelas || {}

  };





  const esSuper =

    AuthController.isSuperAdmin(user);





  const escuela =

    dataSegura.escuelas.find(

      e => e.id === escuelaActiva

    ) || null;





  const dataScopeed =

    esSuper && !escuelaActiva



      ? dataSegura



      : {



          ...dataSegura,



          clientes:

            dataSegura.clientes.filter(

              c => c.escuela_id === escuelaActiva

            ),



          familias:

            dataSegura.familias.filter(

              f => f.escuela_id === escuelaActiva

            ),



          productos:

            dataSegura.productos.filter(

              p => p.escuela_id === escuelaActiva

            ),



          cobros:

            dataSegura.cobros.filter(

              c => c.escuela_id === escuelaActiva

            ),



          recordatorios:

            dataSegura.recordatorios.filter(

              r => r.escuela_id === escuelaActiva

            )

        };





  // * Cobros pendientes.

  const pendientes =

    (dataScopeed.cobros || [])

      .filter(

        c => c.estado === 'pendiente'

      )

      .length;





  // * Colegios que superaron el límite de su plan.

  const LIMITES_NAV = {

    basico: 400,

    avanzado: 800,

    pro: null

  };





  const colegiosExcedidos =

    user.rol === 'superadmin'



      ? (dataSegura.escuelas || [])

          .filter(

            e => !e.es_plantel

          )

          .filter(esc => {



            const max =

              LIMITES_NAV[

                (esc.plan || '').toLowerCase()

              ] ??

              LIMITES_NAV.basico;





            if (max === null) {

              return false;

            }





            const hijos =

              (dataSegura.escuelas || [])

                .filter(

                  e =>

                    e.es_plantel &&

                    e.escuela_padre_id === esc.id

                )

                .map(

                  e => e.id

                );





            const total =

              [esc.id, ...hijos].reduce(

                (a, id) =>

                  a +

                  (

                    (

                      dataSegura.resumen_escuelas ||

                      {}

                    )[id]?.total_alumnos || 0

                  ),

                0

              );





            return total > max;

          })

          .length



      : 0;





  // * Navegación.

  const secciones = [

    ...new Set(

      NAV_ITEMS

        .filter(

          n => n.roles.includes(user.rol)

        )

        .map(

          n => n.section

        )

    )

  ];





  const navItems =

    NAV_ITEMS.filter(

      n => n.roles.includes(user.rol)

    );





  // * Render de las vistas.

  const renderView = () => {



    switch (view) {



      case 'dashboard':



        return _jsxDEV(

          Dashboard,

          {

            data: dataScopeed,



            user: user,



            escuela: escuela,



            allData: data

          },

          void 0,

          false

        );





      case 'caja':



        return _jsxDEV(

          Caja,

          {

            data: dataScopeed,



            setData:

              d =>

                setData(

                  mergeScoped(

                    data,

                    typeof d === 'function' ? d(dataScopeed) : d,

                    escuelaActiva

                  )

                ),



            user: user,



            escuela: escuela

          },

          void 0,

          false

        );





      case 'corte_caja':



        return _jsxDEV(

          CorteCaja,

          {

            user: user,



            escuela: escuela

          },

          void 0,

          false

        );





      case 'cobros':



        return _jsxDEV(

          Cobros,

          {

            data: dataScopeed,



            setData:

              d =>

                setData(

                  mergeScoped(

                    data,

                    typeof d === 'function' ? d(dataScopeed) : d,

                    escuelaActiva

                  )

                ),



            escuela_id:

              escuelaActiva,



            rol:

              user?.rol

          },

          void 0,

          false

        );





      case 'alumnos':



        return _jsxDEV(

          Alumnos,

          {

            data: dataScopeed,



            setData:

              d =>

                setData(

                  mergeScoped(

                    data,

                    typeof d === 'function' ? d(dataScopeed) : d,

                    escuelaActiva

                  )

                ),



            escuela_id:

              escuelaActiva,



            rol:

              user?.rol

          },

          void 0,

          false

        );





      case 'familias':



        return _jsxDEV(

          Familias,

          {

            data: dataScopeed,



            setData:

              d =>

                setData(

                  mergeScoped(

                    data,

                    typeof d === 'function' ? d(dataScopeed) : d,

                    escuelaActiva

                  )

                ),



            escuela_id:

              escuelaActiva

          },

          void 0,

          false

        );





      case 'productos':



        return _jsxDEV(

          Productos,

          {

            data: dataScopeed,



            setData:

              d =>

                setData(

                  mergeScoped(

                    data,

                    typeof d === 'function' ? d(dataScopeed) : d,

                    escuelaActiva

                  )

                ),



            escuela_id:

              escuelaActiva

          },

          void 0,

          false

        );





      case 'facturacion':



        return _jsxDEV(

          Facturacion,

          {

            data: dataScopeed,



            setData:

              d =>

                setData(

                  mergeScoped(

                    data,

                    typeof d === 'function' ? d(dataScopeed) : d,

                    escuelaActiva

                  )

                ),



            escuela: escuela

          },

          void 0,

          false

        );





      case 'recordatorios':



        return _jsxDEV(

          Recordatorios,

          {

            data: dataScopeed,



            setData:

              d =>

                setData(

                  mergeScoped(

                    data,

                    typeof d === 'function' ? d(dataScopeed) : d,

                    escuelaActiva

                  )

                ),



            escuela: escuela

          },

          void 0,

          false

        );





      case 'reportes':



        return _jsxDEV(

          Reportes,

          {

            data: dataScopeed,



            escuela: escuela

          },

          void 0,

          false

        );





      case 'escuelas':



        return _jsxDEV(

          Escuelas,

          {

            data: dataSegura,



            setData: setData,



            onSeleccionar: id => {



              setEscuelaActiva(id);



              setView('dashboard');



            }

          },

          void 0,

          false

        );





      case 'superreportes':



        return _jsxDEV(

          SuperReportes,

          {

            data: dataSegura

          },

          void 0,

          false

        );





      case 'suscripciones':



        return _jsxDEV(

          Suscripciones,

          {

            data: dataSegura,



            setData: setData

          },

          void 0,

          false

        );





      case 'busqueda_global':



        return _jsxDEV(

          BusquedaGlobal,

          {

            onIrAEscuela: id => {

              setEscuelaActiva(id);

              setView('dashboard');

            }

          },

          void 0,

          false

        );



      case 'logs':



        return _jsxDEV(

          Logs,

          {

            data: dataSegura

          },

          void 0,

          false

        );





      case 'usuarios':



        return _jsxDEV(

          Usuarios,

          {

            user: user,



            data: dataSegura

          },

          void 0,

          false

        );





      case 'comisiones':



        return _jsxDEV(

          Comisiones,

          {

            user: user,



            data: dataSegura

          },

          void 0,

          false

        );





      case 'miequipo':



        return _jsxDEV(

          Usuarios,

          {

            user: user,



            data: dataSegura

          },

          void 0,

          false

        );





      default:



        return _jsxDEV(

          Dashboard,

          {

            data: dataScopeed,



            user: user,



            escuela: escuela,



            allData: data

          },

          void 0,

          false

        );

    }

  };





  // * Mezcla datos modificados de una escuela * con el dataset global.

  function mergeScoped(

    globalData,

    newScoped,

    eid

  ) {



    if (!eid) {

      return {

        ...globalData,

        ...newScoped

      };

    }





    const gd =

      globalData || {};



    const ns =

      newScoped || {};





    return {



      ...gd,



      clientes: [

        ...(gd.clientes || [])

          .filter(

            c => c.escuela_id !== eid

          ),



        ...(ns.clientes || [])

      ],



      familias: [

        ...(gd.familias || [])

          .filter(

            f => f.escuela_id !== eid

          ),



        ...(ns.familias || [])

      ],



      productos: [

        ...(gd.productos || [])

          .filter(

            p => p.escuela_id !== eid

          ),



        ...(ns.productos || [])

      ],



      cobros: [

        ...(gd.cobros || [])

          .filter(

            c => c.escuela_id !== eid

          ),



        ...(ns.cobros || [])

      ],



      recordatorios: [

        ...(gd.recordatorios || [])

          .filter(

            r => r.escuela_id !== eid

          ),



        ...(ns.recordatorios || [])

      ],



      escuelas:

        ns.escuelas ||

        gd.escuelas ||

        []

    };

  }





  // * Iniciales del usuario para avatar.

  const initials =

    user.avatar ||

    user.nombre

      .split(' ')

      .map(

        w => w[0]

      )

      .join('')

      .slice(0, 2)

      .toUpperCase();





  const avatarCls =

    user.rol === 'superadmin'

      ? 'avatar-super'

      : user.rol === 'admin'

        ? 'avatar-admin'

        : 'avatar-cajero';





  const roleLabel = {



    superadmin:

      'Super Admin',



    admin:

      'Admin',



    cajero:

      'Cajero'

  };





  // * APP PRINCIPAL * * IMPORTANTE: * aquí ya NO existe withLT().

  return _jsxDEV(

    "div",

    {



      className:

        `app${mobileNav ? ' nav-open' : ''}`,



      children: [



        // * BACKDROP MOBILE

        _jsxDEV(

          "div",

          {

            className:

              "nav-backdrop",



            onClick:

              () =>

                setMobileNav(false)

          },

          void 0,

          false

        ),





        // * SIDEBAR

        _jsxDEV(

          "aside",

          {

            className:

              "sidebar",



            children: [



              // * BRAND

              _jsxDEV(

                "div",

                {



                  className:

                    "sidebar-brand",



                  children: [



                    _jsxDEV(

                      "img",

                      {



                        src:

                          "assets/logo.jpeg",



                        alt:

                          "paga la escuela",



                        style: {



                          height: 44,



                          width: 'auto',

                          maxWidth: '100%',

                          borderRadius: 12,

                          display: 'block',



                          objectFit:

                            'contain',



                          objectPosition:

                            'left center',



                          display:

                            'block'

                        },



                        onError:

                          e => {



                            e.target.style.display =

                              'none';



                            e.target.nextSibling.style.display =

                              'flex';

                          }

                      },

                      void 0,

                      false

                    ),





                    // * Fallback de marca

                    _jsxDEV(

                      "div",

                      {



                        style: {



                          display: 'none',



                          alignItems:

                            'center',



                          gap: 10

                        },



                        children: [



                          _jsxDEV(

                            "div",

                            {



                              className:

                                "brand-icon",



                              children:

                                _jsxDEV(

                                  Icon,

                                  {



                                    name:

                                      "escuelas",



                                    size:

                                      18,



                                    color:

                                      "var(--navy)"

                                  },

                                  void 0,

                                  false

                                )

                            },

                            void 0,

                            false

                          ),



                          _jsxDEV(

                            "div",

                            {



                              children: [



                                _jsxDEV(

                                  "div",

                                  {



                                    className:

                                      "brand-name",



                                    children:

                                      "EduPago"

                                  },

                                  void 0,

                                  false

                                ),



                                _jsxDEV(

                                  "div",

                                  {



                                    className:

                                      "brand-sub",



                                    children:

                                      "Pagalaescuela.com"

                                  },

                                  void 0,

                                  false

                                )



                              ]

                            },

                            void 0,

                            true

                          )



                        ]

                      },

                      void 0,

                      true

                    )



                  ]

                },

                void 0,

                true

              ),





              // * ESCUELA ACTIVA

              escuela &&

                _jsxDEV(

                  "div",

                  {



                    style: {



                      padding:

                        '8px 16px 10px',



                      borderBottom:

                        '1px solid var(--border-glow)'

                    },



                    children: [



                      _jsxDEV(

                        "div",

                        {



                          style: {



                            fontSize: 11,



                            color:

                              'var(--ink-4)',



                            textTransform:

                              'uppercase',



                            letterSpacing:

                              '.5px',



                            marginBottom:

                              2

                          },



                          children:

                            "Escuela activa"

                        },

                        void 0,

                        false

                      ),



                      _jsxDEV(

                        "div",

                        {



                          style: {



                            fontSize: 13,



                            fontWeight:

                              600,



                            color:

                              'var(--violet-dark)'

                          },



                          children:

                            escuela.nombre

                        },

                        void 0,

                        false

                      )



                    ]

                  },

                  void 0,

                  true

                ),





              // * SELECTOR SUPERADMIN

              esSuper &&

                _jsxDEV(

                  "div",

                  {



                    style: {



                      padding:

                        '10px 12px',



                      borderBottom:

                        '1px solid var(--border-glow)'

                    },



                    children:

                      _jsxDEV(

                        "div",

                        {



                          style: {

                            position:

                              'relative'

                          },



                          children: [



                            _jsxDEV(

                              Icon,

                              {



                                name:

                                  "globe",



                                size:

                                  14,



                                color:

                                  "var(--ink-4)",



                                style: {



                                  position:

                                    'absolute',



                                  left:

                                    9,



                                  top:

                                    '50%',



                                  transform:

                                    'translateY(-50%)',



                                  pointerEvents:

                                    'none'

                                }

                              },

                              void 0,

                              false

                            ),





                            _jsxDEV(

                              "select",

                              {



                                style: {



                                  width:

                                    '100%',



                                  background:

                                    'var(--bg-surface-2)',



                                  border:

                                    '1px solid var(--border-glow)',



                                  borderRadius:

                                    'var(--radius-sm)',



                                  color:

                                    'var(--ink)',



                                  padding:

                                    '7px 10px 7px 28px',



                                  fontSize:

                                    12,



                                  fontFamily:

                                    'var(--font)',



                                  outline:

                                    'none',



                                  appearance:

                                    'none'

                                },



                                value:

                                  escuelaActiva ||

                                  '',



                                onChange:

                                  e => {



                                    setEscuelaActiva(

                                      e.target.value

                                        ? parseInt(

                                            e.target.value

                                          )

                                        : null

                                    );



                                    setView(

                                      'dashboard'

                                    );

                                  },



                                children: [



                                  _jsxDEV(

                                    "option",

                                    {



                                      value:

                                        "",



                                      children:

                                        "Vista global"

                                    },

                                    void 0,

                                    false

                                  ),



                                  (data.escuelas || [])

                                    .map(

                                      e =>

                                        _jsxDEV(

                                          "option",

                                          {



                                            value:

                                              e.id,



                                            children:

                                              e.nombre +

                                              (

                                                e.activa

                                                  ? ''

                                                  : ' (Inactiva)'

                                              )

                                          },

                                          e.id,

                                          false

                                        )

                                    )



                                ]

                              },

                              void 0,

                              true

                            )



                          ]

                        },

                        void 0,

                        true

                      )



                  },

                  void 0,

                  false

                ),





              // * NAV

              _jsxDEV(

                "nav",

                {



                  className:

                    "sidebar-nav",



                  children:

                    secciones.map(

                      sec =>

                        _jsxDEV(

                          "div",

                          {



                            children: [



                              _jsxDEV(

                                "div",

                                {



                                  className:

                                    "nav-section",



                                  children:

                                    sec

                                },

                                void 0,

                                false

                              ),





                              navItems

                                .filter(

                                  n =>

                                    n.section === sec

                                )

                                .map(

                                  n =>

                                    _jsxDEV(

                                      "div",

                                      {



                                        className:

                                          `nav-item ${

                                            view === n.id

                                              ? 'active'

                                              : ''

                                          }`,



                                        onClick:

                                          () => {



                                            setView(

                                              n.id

                                            );



                                            setMobileNav(

                                              false

                                            );

                                          },



                                        children: [



                                          _jsxDEV(

                                            Icon,

                                            {



                                              name:

                                                n.icon,



                                              size:

                                                17,



                                              color:

                                                "currentColor"

                                            },

                                            void 0,

                                            false

                                          ),



                                          n.label,





                                          // * Badge de cobros.

                                          n.id ===

                                            'cobros' &&

                                            pendientes >

                                              0 &&

                                            _jsxDEV(

                                              "span",

                                              {



                                                className:

                                                  "nav-badge",



                                                children:

                                                  pendientes

                                              },

                                              void 0,

                                              false

                                            ),





                                          // * Badge de suscripciones.

                                          n.id ===

                                            'suscripciones' &&

                                            colegiosExcedidos >

                                              0 &&

                                            _jsxDEV(

                                              "span",

                                              {



                                                className:

                                                  "nav-badge",



                                                style: {

                                                  background:

                                                    'var(--red)'

                                                },



                                                title:

                                                  `${colegiosExcedidos} colegio(s) superaron su límite de plan`,



                                                children:

                                                  colegiosExcedidos

                                              },

                                              void 0,

                                              false

                                            )



                                        ]

                                      },

                                      n.id,

                                      true

                                    )

                                )



                            ]

                          },

                          sec,

                          true

                        )

                    )

                },

                void 0,

                false

              ),





              // * FOOTER SIDEBAR

              _jsxDEV(
                "div",
                {
                  className: "sidebar-footer",
                  children: _jsxDEV(
                    MenuPerfil,
                    {
                      user: user,
                      escuela: escuelaActiva,
                      onLogout: handleLogout,
                      // Helper mínimo: manda la acción al API con el token de sesión
                      apiPost: async (accion, cuerpo) => {
                        const res = await fetch('api.php?action=' + accion, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + AuthController.getToken()
                          },
                          body: JSON.stringify(cuerpo)
                        });
                        return res.json();
                      },
                      // Refleja el cambio en pantalla sin recargar
                      onActualizado: (tipo, cambios) => {
                        if (tipo === 'cuenta') {
                          setUser(prev => prev ? { ...prev, ...cambios } : prev);
                        } else if (tipo === 'logo' && escuelaActiva) {
                          setEscuelaActiva(prev => prev ? { ...prev, ...cambios } : prev);
                          setData(prev => prev ? {
                            ...prev,
                            escuelas: (prev.escuelas || []).map(e =>
                              e.id === escuelaActiva.id ? { ...e, ...cambios } : e)
                          } : prev);
                        }
                      }
                    },
                    void 0,
                    false
                  )
                },
                void 0,
                false
              )



            ]

          },

          void 0,

          true

        ),





        // * MAIN

        _jsxDEV(

          "main",

          {



            className:

              "main",



            children: [



              // * TOPBAR

              _jsxDEV(

                "header",

                {



                  className:

                    "topbar",



                  children: [



                    // * MOBILE MENU

                    _jsxDEV(

                      "button",

                      {



                        className:

                          "mobile-menu-btn",



                        onClick:

                          () =>

                            setMobileNav(

                              v => !v

                            ),



                        "aria-label":

                          "Abrir menú",



                        children:

                          _jsxDEV(

                            Icon,

                            {



                              name:

                                "menu",



                              size:

                                20,



                              color:

                                "currentColor"

                            },

                            void 0,

                            false

                          )

                      },

                      void 0,

                      false

                    ),





                    // * TITULO

                    _jsxDEV(

                      "div",

                      {



                        className:

                          "topbar-title",



                        children: [



                          escuela &&

                            _jsxDEV(

                              "span",

                              {



                                style: {



                                  marginRight:

                                    8,



                                  opacity:

                                    .6

                                },



                                children:

                                  _jsxDEV(

                                    Icon,

                                    {



                                      name:

                                        "escuelas",



                                      size:

                                        16,



                                      color:

                                        "var(--violet)"

                                    },

                                    void 0,

                                    false

                                  )

                              },

                              void 0,

                              false

                            ),



                          TITLES[view] ||

                            'EduPago'



                        ]

                      },

                      void 0,

                      true

                    ),





                    // * ACCIONES

                    _jsxDEV(

                      "div",

                      {



                        className:

                          "topbar-actions",



                        children: [



                          // * Pendientes

                          pendientes > 0 &&

                            _jsxDEV(

                              "div",

                              {



                                onClick:

                                  () =>

                                    setView(

                                      'cobros'

                                    ),



                                style: {



                                  display:

                                    'flex',



                                  alignItems:

                                    'center',



                                  gap:

                                    6,



                                  padding:

                                    '6px 12px',



                                  background:

                                    'var(--amber-glow)',



                                  border:

                                    '1px solid rgba(245,158,11,.2)',



                                  borderRadius:

                                    'var(--radius-sm)',



                                  cursor:

                                    'pointer'

                                },



                                children: [



                                  _jsxDEV(

                                    Icon,

                                    {



                                      name:

                                        "bell",



                                      size:

                                        14,



                                      color:

                                        "#fbbf24"

                                    },

                                    void 0,

                                    false

                                  ),



                                  _jsxDEV(

                                    "span",

                                    {



                                      style: {



                                        fontSize:

                                          12,



                                        fontWeight:

                                          600,



                                        color:

                                          '#fbbf24'

                                      },



                                      children: [



                                        pendientes,



                                        " pendiente",



                                        pendientes >

                                          1

                                          ? 's'

                                          : ''



                                      ]

                                    },

                                    void 0,

                                    true

                                  )



                                ]

                              },

                              void 0,

                              true

                            ),





                          // * Nuevo cobro

                          _jsxDEV(

                            "button",

                            {



                              className:

                                "btn btn-primary btn-sm",



                              onClick:

                                () =>

                                  setView(

                                    'caja'

                                  ),



                              style: {



                                display:

                                  'flex',



                                alignItems:

                                  'center',



                                gap:

                                  6

                              },



                              children: [



                                _jsxDEV(

                                  Icon,

                                  {



                                    name:

                                      "plus",



                                    size:

                                      14,



                                    color:

                                      "currentColor"

                                  },

                                  void 0,

                                  false

                                ),



                                "Nuevo cobro"



                              ]

                            },

                            void 0,

                            true

                          ),





                          // * Tema

                          _jsxDEV(

                            "button",

                            {



                              className:

                                "theme-toggle",



                              onClick:

                                toggleTheme,



                              title:

                                "Cambiar tema",



                              children:

                                _jsxDEV(

                                  Icon,

                                  {



                                    name:

                                      theme ===

                                      'dark'

                                        ? 'sun'

                                        : 'moon',



                                    size:

                                      16,



                                    color:

                                      "currentColor"

                                  },

                                  void 0,

                                  false

                                )

                            },

                            void 0,

                            false

                          )



                        ]

                      },

                      void 0,

                      true

                    )



                  ]

                },

                void 0,

                true

              ),





              // * CONTENT

              _jsxDEV(

                "div",

                {



                  className:

                    "content",



                  children:

                    renderView()

                },

                void 0,

                false

              )



            ]

          },

          void 0,

          true

        )



      ]

    },

    void 0,

    true

  );

}





const root =

  ReactDOM.createRoot(

    document.getElementById('root')

  );





root.render(

  _jsxDEV(

    AppErrorBoundary,

    {



      children:

        _jsxDEV(

          App,

          {},

          void 0,

          false

        )



    },

    void 0,

    false

  )

);
