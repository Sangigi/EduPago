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
    { email:'super@pagalaescuela.mx', pass:'demo123', label:'Super Admin' },
    { email:'admin@itm.edu.mx',       pass:'demo123', label:'Admin ITM'   },
    { email:'cajero@itm.edu.mx',      pass:'demo123', label:'Cajero ITM'  },
    { email:'admin@cec.edu.mx',       pass:'demo123', label:'Admin CEC'   },
    { email:'familia@itm.edu.mx',     pass:'demo123', label:'Familia'     },
  ];

  return { login, logout, getSession, getToken, isSuperAdmin, isAdmin, DEMO_USERS };
})();