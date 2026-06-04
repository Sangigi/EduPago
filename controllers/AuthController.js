/**
 * CONTROLLER — AuthController v3
 * Usuarios dinámicos guardados en localStorage.
 * Jerarquía:
 *   superadmin → crea admins (cualquier escuela)
 *   admin      → crea cajeros (solo su escuela)
 *   cajero     → sin permisos de creación
 *
 * Cada usuario tiene:
 *   id, email, pass (hash simple), nombre, rol,
 *   escuela_id, avatar, activo, fecha_alta, creado_por (id del creador)
 */
const AuthController = (() => {
  const SESSION_KEY = 'edupago_session_v3';
  const USERS_KEY   = 'edupago_users_v3';

  // ── Usuarios semilla (siempre presentes, no se pueden borrar) ──────────────
  const SEED_USERS = [
    {
      id: 1, email: 'superadmin@pagalaescuela.mx',
      pass: hashPass('SuperAdmin2026!'),
      nombre: 'Jorge de Zavala', rol: 'superadmin',
      avatar: 'JZ', escuela_id: null, activo: true,
      fecha_alta: '2026-01-01', creado_por: null, es_semilla: true,
    },
    {
      id: 2, email: 'admin@itm.edu.mx',
      pass: hashPass('admin123'),
      nombre: 'Dr. Ramírez Silva', rol: 'admin',
      avatar: 'RS', escuela_id: 1, activo: true,
      fecha_alta: '2026-01-15', creado_por: 1, es_semilla: true,
    },
    {
      id: 3, email: 'cajero@itm.edu.mx',
      pass: hashPass('cajero123'),
      nombre: 'María Soto', rol: 'cajero',
      avatar: 'MS', escuela_id: 1, activo: true,
      fecha_alta: '2026-01-15', creado_por: 2, es_semilla: true,
    },
    {
      id: 4, email: 'admin@cec.edu.mx',
      pass: hashPass('admin123'),
      nombre: 'Lic. Torres Ruiz', rol: 'admin',
      avatar: 'LT', escuela_id: 2, activo: true,
      fecha_alta: '2026-02-01', creado_por: 1, es_semilla: true,
    },
    {
      id: 5, email: 'admin@eme.edu.mx',
      pass: hashPass('admin123'),
      nombre: 'Ing. Vázquez Cruz', rol: 'admin',
      avatar: 'IV', escuela_id: 3, activo: true,
      fecha_alta: '2026-03-11', creado_por: 1, es_semilla: true,
    },
  ];

  // Hash simple (no criptográfico — en producción usar bcrypt en PHP)
  function hashPass(p) {
    let h = 0;
    for (let i = 0; i < p.length; i++) {
      h = ((h << 5) - h) + p.charCodeAt(i);
      h |= 0;
    }
    return 'h_' + Math.abs(h).toString(36) + '_' + p.length;
  }

  function initUsers() {
    try {
      const saved = localStorage.getItem(USERS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Asegurar que las semillas siempre estén (por si se reseteó)
        const emails = parsed.map(u => u.email);
        const missing = SEED_USERS.filter(s => !emails.includes(s.email));
        if (missing.length) {
          const merged = [...parsed, ...missing];
          localStorage.setItem(USERS_KEY, JSON.stringify(merged));
          return merged;
        }
        return parsed;
      }
    } catch(e) {}
    localStorage.setItem(USERS_KEY, JSON.stringify(SEED_USERS));
    return [...SEED_USERS];
  }

  function loadUsers() {
    try {
      const s = localStorage.getItem(USERS_KEY);
      return s ? JSON.parse(s) : initUsers();
    } catch(e) { return initUsers(); }
  }

  function saveUsers(users) {
    try { localStorage.setItem(USERS_KEY, JSON.stringify(users)); } catch(e) {}
  }

  function nextId(users) {
    return users.length === 0 ? 10 : Math.max(...users.map(u => u.id)) + 1;
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  function login(email, password) {
    initUsers();
    const users = loadUsers();
    const found = users.find(u =>
      u.email.toLowerCase() === email.toLowerCase() &&
      u.pass === hashPass(password) &&
      u.activo !== false
    );
    if (!found) return { ok: false, error: 'Credenciales incorrectas o cuenta inactiva' };
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

  // ── Permisos ──────────────────────────────────────────────────────────────
  function isSuperAdmin(user) { return user?.rol === 'superadmin'; }
  function isAdmin(user)      { return user?.rol === 'admin' || isSuperAdmin(user); }

  // Qué roles puede crear cada rol
  function rolesQueПuedeCriar(user) {
    if (!user) return [];
    if (user.rol === 'superadmin') return ['admin', 'cajero'];
    if (user.rol === 'admin')      return ['cajero'];
    return [];
  }

  // Qué escuelas puede asignar
  function escuelasDisponibles(user, todasEscuelas) {
    if (user.rol === 'superadmin') return todasEscuelas;
    if (user.rol === 'admin')      return todasEscuelas.filter(e => e.id === user.escuela_id);
    return [];
  }

  // ── CRUD de usuarios ──────────────────────────────────────────────────────
  function crearUsuario(creador, form, todasEscuelas) {
    const rolesPermitidos = rolesQueПuedeCriar(creador);
    if (!rolesPermitidos.includes(form.rol)) {
      return { ok: false, error: `No tienes permiso para crear rol "${form.rol}"` };
    }
    // Admin solo puede crear usuarios para su propia escuela
    if (creador.rol === 'admin' && form.escuela_id !== creador.escuela_id) {
      return { ok: false, error: 'Solo puedes crear usuarios para tu escuela' };
    }
    const users = loadUsers();
    if (users.find(u => u.email.toLowerCase() === form.email.toLowerCase())) {
      return { ok: false, error: 'Ya existe un usuario con ese correo' };
    }
    if (!form.password || form.password.length < 6) {
      return { ok: false, error: 'La contraseña debe tener al menos 6 caracteres' };
    }
    const initials = form.nombre.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    const nuevo = {
      id:          nextId(users),
      email:       form.email.toLowerCase().trim(),
      pass:        hashPass(form.password),
      nombre:      form.nombre.trim(),
      rol:         form.rol,
      escuela_id:  form.escuela_id || null,
      avatar:      initials,
      activo:      true,
      fecha_alta:  new Date().toISOString().slice(0,10),
      creado_por:  creador.id,
      es_semilla:  false,
    };
    saveUsers([...users, nuevo]);
    return { ok: true, usuario: { ...nuevo, pass: undefined } };
  }

  function editarUsuario(editor, form) {
    const users = loadUsers();
    const target = users.find(u => u.id === form.id);
    if (!target) return { ok: false, error: 'Usuario no encontrado' };

    // Solo superadmin puede editar admins; admin solo puede editar cajeros de su escuela
    if (editor.rol === 'admin') {
      if (target.rol !== 'cajero') return { ok: false, error: 'No puedes editar este usuario' };
      if (target.escuela_id !== editor.escuela_id) return { ok: false, error: 'Usuario de otra escuela' };
    }

    const initials = form.nombre.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
    const updated = users.map(u => {
      if (u.id !== form.id) return u;
      return {
        ...u,
        nombre:     form.nombre.trim(),
        email:      form.email.toLowerCase().trim(),
        avatar:     initials,
        escuela_id: form.escuela_id || u.escuela_id,
        ...(form.password && form.password.length >= 6 ? { pass: hashPass(form.password) } : {}),
      };
    });
    saveUsers(updated);
    return { ok: true };
  }

  function toggleUsuario(editor, userId) {
    const users = loadUsers();
    const target = users.find(u => u.id === userId);
    if (!target) return { ok: false, error: 'No encontrado' };
    if (target.es_semilla) return { ok: false, error: 'No puedes desactivar un usuario semilla' };
    if (editor.rol === 'admin' && (target.rol !== 'cajero' || target.escuela_id !== editor.escuela_id)) {
      return { ok: false, error: 'Sin permiso' };
    }
    const updated = users.map(u => u.id === userId ? { ...u, activo: !u.activo } : u);
    saveUsers(updated);
    return { ok: true };
  }

  function eliminarUsuario(editor, userId) {
    const users = loadUsers();
    const target = users.find(u => u.id === userId);
    if (!target) return { ok: false, error: 'No encontrado' };
    if (target.es_semilla) return { ok: false, error: 'No puedes eliminar un usuario semilla' };
    if (editor.rol !== 'superadmin' && target.creado_por !== editor.id) {
      return { ok: false, error: 'Solo puedes eliminar usuarios que tú creaste' };
    }
    saveUsers(users.filter(u => u.id !== userId));
    return { ok: true };
  }

  function getUsuarios(viewer) {
    const users = loadUsers();
    // Superadmin ve todos; admin solo ve los de su escuela
    const visible = viewer.rol === 'superadmin'
      ? users
      : users.filter(u => u.escuela_id === viewer.escuela_id);
    return visible.map(u => ({ ...u, pass: undefined }));
  }

  // Accesos rápidos demo para pantalla de login
  const DEMO_USERS = [
    { label:'👑 Super Admin', email:'superadmin@pagalaescuela.mx', pass:'SuperAdmin2026!' },
    { label:'🏛️ Admin ITM',   email:'admin@itm.edu.mx',            pass:'admin123' },
    { label:'🧾 Cajero ITM',  email:'cajero@itm.edu.mx',           pass:'cajero123' },
    { label:'🏫 Admin CEC',   email:'admin@cec.edu.mx',            pass:'admin123' },
    { label:'⚡ Admin EME',   email:'admin@eme.edu.mx',            pass:'admin123' },
  ];

  return {
    login, logout, getSession,
    isSuperAdmin, isAdmin,
    rolesQueПuedeCriar, escuelasDisponibles,
    crearUsuario, editarUsuario, toggleUsuario, eliminarUsuario,
    getUsuarios,
    DEMO_USERS,
    hashPass,
  };
})();
