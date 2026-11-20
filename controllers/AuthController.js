/**
 * CONTROLLER — AuthController v4 (API a Base de Datos)
 */
const AuthController = (() => {
  const SESSION_KEY = 'edupago_session_v4';

  // "Recordar sesión": por defecto se guarda en sessionStorage (se pierde al
  // cerrar la pestaña/navegador). Si el usuario marca la casilla, se guarda
  // en localStorage en su lugar, para que siga con la sesión abierta la
  // próxima vez que entre — hasta que el token expire (APP_TOKEN_TTL, 12h
  // en config.php) o cierre sesión manualmente.
  async function login(email, password, recordar = false) {
    try {
      const response = await fetch('api.php?action=login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const result = await response.json();

      if (!result.success) return { ok: false, error: result.error };

      (recordar ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(result.user));
      return { ok: true, user: result.user };
    } catch (e) {
      return { ok: false, error: 'Error de conexión con el servidor' };
    }
  }

  // "Olvidé mi contraseña": público, sin sesión. La respuesta es siempre la
  // misma exista o no la cuenta (ver recuperar_password_solicitar.php), así
  // que aquí solo se propaga el mensaje del servidor, nunca se distingue.
  async function recuperarPassword(email) {
    try {
      const response = await fetch('api.php?action=recuperar_password_solicitar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const result = await response.json();
      return { ok: !!result.success, mensaje: result.mensaje, error: result.error };
    } catch (e) {
      return { ok: false, error: 'Error de conexión con el servidor' };
    }
  }

  // ── [OF-7c] "VER COMO": sesión de suplantación ──────────────────────────
  // El que entra como otro usuario NO pierde su sesión: la de suplantación vive aparte, en
  // sessionStorage (solo ESTA pestaña; no se hereda a otras ni sobrevive al cierre) bajo
  // SUP_KEY, con su propio token de 30 minutos como máximo. Mientras exista y no haya vencido,
  // getSession() devuelve al usuario OBJETIVO con ese token, así que todas las pantallas y
  // todos los fetch (que leen getSession/getToken) trabajan como el objetivo sin saberlo.
  // Volver = borrar SUP_KEY y recargar: la sesión propia sigue ahí, intacta.
  const SUP_KEY = 'edupago_suplanta_v1';

  // { user (con token), modo: 'normal'|'lectura', emitido, vence (segundos unix), real: {id, nombre, rol} } o null.
  function getSuplantacion() {
    try {
      const s = sessionStorage.getItem(SUP_KEY);
      if (!s) return null;
      const o = JSON.parse(s);
      if (!o || !o.user || !o.user.token || !o.vence || o.vence * 1000 <= Date.now()) {
        sessionStorage.removeItem(SUP_KEY);
        return null;
      }
      return o;
    } catch(e) { return null; }
  }

  // Espejo EXACTO de suplantacion_decision() en lib/helpers_suplantacion.php. Solo decide si se
  // ofrece el botón; el servidor valida SIEMPRE (un botón de más no abre nada).
  const ROLES_PLATAFORMA = ['superadmin', 'distribuidor', 'contador', 'soporte', 'provision', 'tesoreria', 'promotor'];
  function puedeVerComo(user, o) {
    // activo llega como 1/0 (o booleano) segun la accion que listo al usuario.
    if (!user || !o || o.activo === false || o.activo === 0 || o.activo === '0' || Number(o.id) === Number(user.id)) return false;
    if (getSuplantacion()) return false;                  // no se encadenan suplantaciones
    if (o.rol === 'superadmin') return false;
    if (user.rol === 'superadmin') return true;
    if (user.rol === 'soporte') return !ROLES_PLATAFORMA.includes(o.rol) && !!o.escuela_id;
    if (user.rol === 'admin') {
      return !!user.escuela_id && Number(o.escuela_id) === Number(user.escuela_id) &&
        ['cajero', 'control_escolar', 'direccion', 'docente', 'tienda', 'familia', 'alumno'].includes(o.rol);
    }
    return false;
  }
  // El modo que le tocará (para avisarlo antes de entrar). Soporte y familia/alumno: siempre lectura.
  function modoVerComo(user, o) {
    return (user?.rol === 'soporte' || o?.rol === 'familia' || o?.rol === 'alumno') ? 'lectura' : 'normal';
  }

  // Entra como otro usuario con LA CONTRASEÑA PROPIA. Lanza Error con un mensaje para mostrar.
  async function iniciarSuplantacion(usuarioId, password, soloLectura) {
    const res = await ApiClient.post('suplantar_iniciar', {
      usuario_id: usuarioId, password: password, modo: soloLectura ? 'lectura' : 'normal'
    });
    if (!res || !res.success) throw new Error((res && res.error) || 'No se pudo entrar como ese usuario.');
    sessionStorage.setItem(SUP_KEY, JSON.stringify({
      user: res.user, modo: res.suplantacion.modo, emitido: res.suplantacion.emitido,
      vence: res.suplantacion.vence, real: res.suplantacion.real
    }));
    return res;
  }

  // Vuelve a la cuenta propia. Avisa al servidor (queda anotado el fin) pero NUNCA depende de él:
  // si falla, igual se suelta el token de suplantación y se vuelve a la sesión propia.
  async function terminarSuplantacion() {
    const sup = getSuplantacion();
    if (sup) {
      try {
        await fetch('api.php?action=suplantar_terminar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + sup.user.token },
          body: '{}'
        });
      } catch (e) { /* sin conexión o ya vencido: igual se vuelve */ }
    }
    sessionStorage.removeItem(SUP_KEY);
  }

  function logout() {
    // [OF-7c] "Cerrar sesión" (o un 401 por vencimiento) estando en "Ver como" NO cierra la sesión
    // propia: solo suelta la de suplantación y recarga, y se regresa a la cuenta de siempre.
    if (sessionStorage.getItem(SUP_KEY)) {
      sessionStorage.removeItem(SUP_KEY);
      try { window.location.reload(); } catch (e) { /* sin ventana (pruebas) */ }
      return;
    }
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  }
  function getSession() {
    try {
      const sup = getSuplantacion(); // [OF-7c]
      if (sup) return sup.user;
      const s = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
      return s ? JSON.parse(s) : null;
    } catch(e) { return null; }
  }
  function getToken() { const s = getSession(); return s ? s.token : null; }
  function isSuperAdmin(user) { return user?.rol === 'superadmin'; }
  function isAdmin(user)      { return user?.rol === 'admin' || isSuperAdmin(user); }
  function isDistribuidor(user) { return user?.rol === 'distribuidor'; }
  // Espejo EXACTO de rol_alcance_global() en api.php: que roles ven los datos de
  // CUALQUIER escuela en vez de los de la suya. Es distinto de isSuperAdmin, que
  // ademas concede permisos de ESCRITURA — soporte es de lectura estricta.
  //
  // Existe porque el backend ya resolvio esto y el frontend se quedo atras: el
  // comentario de api.php sobre rol_alcance_global advierte que agregar un rol de
  // plataforma "obligara a cazar cada comparacion suelta, y olvidar una dejaba al
  // rol nuevo viendo una lista vacia sin ningun error visible". Eso es justo lo
  // que le pasaba a soporte del lado del cliente: cargar_datos le devolvia lo de
  // todas las escuelas, pero app.js decidia el alcance con isSuperAdmin(), asi
  // que nunca pedia los datos de la escuela elegida y pintaba todo en ceros.
  // Al agregar un rol de plataforma nuevo, actualiza ESTA funcion y la de api.php.
  function alcanceGlobal(user) { return user?.rol === 'superadmin' || user?.rol === 'soporte'; }

  const DEMO_USERS = [
    { email:'super@pagalaescuela.mx', pass:'Admin2026!', label:'Super Admin' },
    { email:'admin@itm.edu.mx',       pass:'Admin2026!', label:'Admin ITM'   },
    { email:'cajero@itm.edu.mx',      pass:'Admin2026!', label:'Cajero ITM'  },
    { email:'admin@cec.edu.mx',       pass:'Admin2026!', label:'Admin CEC'   },
    { email:'familia@itm.edu.mx',     pass:'Admin2026!', label:'Familia'     },
  ];


  // ── Gestión de usuarios (llaman a api.php) ──────────────────────────────
  const apiPost = ApiClient.post;

  // Carga usuarios desde la API (o devuelve [] si falla)
  async function getUsuarios(user) {
    try {
      const res = await apiPost('listar_usuarios');
      return res.success ? res.usuarios : [];
    } catch(e) { return []; }
  }

  // Roles que puede crear según jerarquía
  function rolesQuePuedeCriar(user) {
    // 'soporte' y 'provision' (22-sep-2026). Esta lista tiene que ir a la par
    // de $roles_validos en acciones/crear_usuario.php: el backend es quien
    // manda, así que un rol que falte aquí simplemente no se puede dar de alta
    // desde la interfaz aunque el backend lo acepte.
    // [F4] control_escolar, direccion y alumno. El backend (crear_usuario.php)
    // acepta 'alumno', pero NO se ofrece aquí: esa cuenta exige elegir al alumno
    // (cliente_id) y se crea desde Alumnos > "Acceso del alumno".
    if (user?.rol === 'superadmin') return ['superadmin','admin','cajero','docente','familia','control_escolar','direccion','tienda' /* [F6] */,'distribuidor','contador','soporte','provision','tesoreria','promotor'];
    if (user?.rol === 'admin')      return ['cajero','docente','familia','control_escolar','direccion','tienda' /* [F6] */];
    // [F4] La coordinación solo da de alta docentes (y alumnos, desde Alumnos).
    if (user?.rol === 'control_escolar') return ['docente'];
    return [];
  }

  // Escuelas disponibles para asignar al nuevo usuario
  function escuelasDisponibles(user, escuelas) {
    if (user?.rol === 'superadmin') return escuelas || [];
    return (escuelas || []).filter(e => e.id === user?.escuela_id);
  }

  async function crearUsuario(user, payload, escuelas) {
    const res = await apiPost('crear_usuario', payload);
    if (!res.success) throw new Error(res.error);
    // Devuelve la respuesta completa (no solo res.usuario): crear_usuario ya
    // no manda contraseña, manda un enlace de activación por correo, y el
    // llamador necesita saber si de verdad se envió o si hay que mostrarlo a
    // mano (correo_enviado/activacion_liga — mismo criterio que el resto de
    // los flujos de alta de cuentas en el sistema).
    return res;
  }

  async function editarUsuario(user, payload) {
    const res = await apiPost('editar_usuario', payload);
    if (!res.success) throw new Error(res.error);
    return res.usuario;
  }

  async function toggleUsuario(user, userId) {
    const res = await apiPost('toggle_usuario', { id: userId });
    if (!res.success) throw new Error(res.error);
  }

  async function eliminarUsuario(user, userId) {
    const res = await apiPost('eliminar_usuario', { id: userId });
    if (!res.success) throw new Error(res.error);
  }

  async function cerrarSesionesUsuario(userId) {
    const res = await apiPost('cerrar_sesiones_usuario', { id: userId });
    if (!res.success) throw new Error(res.error);
  }

  async function toggleEscuela(escuelaId) {
    const res = await apiPost('toggle_escuela', { id: escuelaId });
    if (!res.success) throw new Error(res.error);
    return res.activa;
  }

  return { login, logout, recuperarPassword, getSession, getToken, getSuplantacion, puedeVerComo, modoVerComo, iniciarSuplantacion, terminarSuplantacion, isSuperAdmin, isAdmin, isDistribuidor, alcanceGlobal, DEMO_USERS, getUsuarios, rolesQuePuedeCriar, escuelasDisponibles, crearUsuario, editarUsuario, toggleUsuario, eliminarUsuario, toggleEscuela, cerrarSesionesUsuario };
})();
