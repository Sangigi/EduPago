/**
 * CONTROLLER — AuthController v4 (API a Base de Datos)
 */
const AuthController = (() => {
  const SESSION_KEY = 'edupago_session_v4';

  async function login(email, password) {
    try {
      const response = await fetch('api.php?action=login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const result = await response.json();
      
      if (!result.success) return { ok: false, error: result.error };

      sessionStorage.setItem(SESSION_KEY, JSON.stringify(result.user));
      return { ok: true, user: result.user };
    } catch (e) {
      return { ok: false, error: 'Error de conexión con el servidor' };
    }
  }

  function logout() { sessionStorage.removeItem(SESSION_KEY); }
  function getSession() {
    try { const s = sessionStorage.getItem(SESSION_KEY); return s ? JSON.parse(s) : null; } catch(e) { return null; }
  }
  function getToken() { const s = getSession(); return s ? s.token : null; }
  function isSuperAdmin(user) { return user?.rol === 'superadmin'; }
  function isAdmin(user)      { return user?.rol === 'admin' || isSuperAdmin(user); }

  const DEMO_USERS = [
    { email:'super@pagalaescuela.mx', pass:'Admin2026!', label:'Super Admin' },
    { email:'admin@itm.edu.mx',       pass:'Admin2026!', label:'Admin ITM'   },
    { email:'cajero@itm.edu.mx',      pass:'Admin2026!', label:'Cajero ITM'  },
    { email:'admin@cec.edu.mx',       pass:'Admin2026!', label:'Admin CEC'   },
    { email:'familia@itm.edu.mx',     pass:'Admin2026!', label:'Familia'     },
  ];


  // ── Gestión de usuarios (llaman a api.php) ──────────────────────────────
  async function apiPost(action, body = {}) {
    const token = getToken();
    const res = await fetch('api.php?action=' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': token ? 'Bearer ' + token : '' },
      body: JSON.stringify(body),
    });
    if (res.status === 401) { logout(); window.location.reload(); throw new Error('Sesión expirada. Inicia sesión de nuevo.'); }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  // Carga usuarios desde la API (o devuelve [] si falla)
  async function getUsuarios(user) {
    try {
      const res = await apiPost('listar_usuarios');
      return res.success ? res.usuarios : [];
    } catch(e) { return []; }
  }

  // Roles que puede crear según jerarquía
  function rolesQuePuedeCriar(user) {
    if (user?.rol === 'superadmin') return ['superadmin','admin','cajero','familia'];
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
    return res.usuario;
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

  async function toggleEscuela(escuelaId) {
    const res = await apiPost('toggle_escuela', { id: escuelaId });
    if (!res.success) throw new Error(res.error);
    return res.activa;
  }

  return { login, logout, getSession, getToken, isSuperAdmin, isAdmin, DEMO_USERS, getUsuarios, rolesQuePuedeCriar, escuelasDisponibles, crearUsuario, editarUsuario, toggleUsuario, eliminarUsuario, toggleEscuela };
})();