/**
 * CONTROLLER — AuthController v2
 * Roles: superadmin | admin | cajero
 * superadmin → ve TODAS las escuelas (panel global)
 * admin      → solo su escuela (acceso completo)
 * cajero     → solo su escuela (solo caja y cobros)
 */
const AuthController = (() => {
  const USERS = [
    // Super Admin — Paga la Escuela (ve todo)
    { email:'superadmin@pagalaescuela.mx', pass:'SuperAdmin2026!', nombre:'Jorge de Zavala', rol:'superadmin', avatar:'JZ', escuela_id: null },
    // Admin ITM
    { email:'admin@itm.edu.mx',  pass:'admin123', nombre:'Dr. Ramírez Silva', rol:'admin',   avatar:'RS', escuela_id: 1 },
    { email:'cajero@itm.edu.mx', pass:'cajero123', nombre:'María Soto',       rol:'cajero',  avatar:'MS', escuela_id: 1 },
    // Admin CEC
    { email:'admin@cec.edu.mx',  pass:'admin123', nombre:'Lic. Torres',       rol:'admin',   avatar:'LT', escuela_id: 2 },
    // Admin EME
    { email:'admin@eme.edu.mx',  pass:'admin123', nombre:'Ing. Vázquez',      rol:'admin',   avatar:'IV', escuela_id: 3 },
  ];

  const SESSION_KEY = 'edupago_session_v2';

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
    if (!user) return false;
    if (user.rol === 'superadmin') return true;
    if (role === 'admin') return user.rol === 'admin';
    if (role === 'cajero') return true; // todos pueden cobrar
    return false;
  }

  function isSuperAdmin(user) { return user && user.rol === 'superadmin'; }

  return { login, logout, getSession, hasRole, isSuperAdmin, USERS };
})();
