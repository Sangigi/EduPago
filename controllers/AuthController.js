/**
 * CONTROLLER — AuthController
 * Maneja autenticación y sesión de usuario.
 */
const AuthController = (() => {
  const USERS = [
    { email:'admin@escuela.mx', pass:'admin123', nombre:'Dr. Ramírez', rol:'admin', avatar:'DR' },
    { email:'cajero@escuela.mx', pass:'cajero123', nombre:'María Soto', rol:'cajero', avatar:'MS' },
  ];

  const SESSION_KEY = 'edupago_session';

  function login(email, password) {
    const found = USERS.find(u => u.email === email && u.pass === password);
    if (!found) return { ok: false, error: 'Credenciales incorrectas' };
    const session = { ...found };
    delete session.pass;
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch(e) {}
    return { ok: true, user: session };
  }

  function logout() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch(e) {}
  }

  function getSession() {
    try {
      const s = sessionStorage.getItem(SESSION_KEY);
      return s ? JSON.parse(s) : null;
    } catch(e) { return null; }
  }

  function hasRole(user, role) {
    return user && (user.rol === role || user.rol === 'admin');
  }

  return { login, logout, getSession, hasRole, USERS };
})();