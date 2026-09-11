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

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  }
  function getSession() {
    try {
      const s = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
      return s ? JSON.parse(s) : null;
    } catch(e) { return null; }
  }
  function getToken() { const s = getSession(); return s ? s.token : null; }
  function isSuperAdmin(user) { return user?.rol === 'superadmin'; }
  function isAdmin(user)      { return user?.rol === 'admin' || isSuperAdmin(user); }
  function isDistribuidor(user) { return user?.rol === 'distribuidor'; }

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
    if (user?.rol === 'superadmin') return ['superadmin','admin','cajero','familia','distribuidor','contador'];
    if (user?.rol === 'admin')      return ['cajero','familia'];
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

  return { login, logout, recuperarPassword, getSession, getToken, isSuperAdmin, isAdmin, isDistribuidor, DEMO_USERS, getUsuarios, rolesQuePuedeCriar, escuelasDisponibles, crearUsuario, editarUsuario, toggleUsuario, eliminarUsuario, toggleEscuela, cerrarSesionesUsuario };
})();
