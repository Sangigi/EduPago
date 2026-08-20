var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};
var _Fragment = React.Fragment;
/* views/Usuarios.jsx — Gestión dinámica de usuarios con jerarquía de roles e integración de Portal Familiar
   FIX: FormModal extraído del render de Usuarios para evitar desmonte/remonte en cada cambio de estado */

/* ─── Componente del modal de formulario — FUERA de Usuarios para evitar re-creación en cada render ─── */
function UsuariosFormModal({
  titulo,
  modal,
  form,
  setForm,
  setModal,
  errForm,
  rolesCreables,
  escuelasDisp,
  familiasUnicas,
  esSuper,
  user,
  ROL_INFO,
  obtenerNombreFamilia,
  nombreEscuela,
  onGuardar
}) {
  return _jsxDEV("div", {
    className: "modal-backdrop",
    onClick: e => e.target === e.currentTarget && setModal(null),
    children: _jsxDEV("div", {
      className: "modal modal-lg",
      children: [
        _jsxDEV("div", {
          className: "modal-header",
          children: [
            _jsxDEV("div", { className: "modal-title", children: titulo }, void 0, false),
            _jsxDEV("button", {
              className: "btn btn-ghost btn-sm",
              onClick: () => setModal(null),
              children: _jsxDEV(Icon, { name: "close", size: 16, color: "currentColor" }, void 0, false)
            }, void 0, false)
          ]
        }, void 0, true),

        _jsxDEV("div", {
          className: "modal-body",
          children: [
            errForm && _jsxDEV("div", {
              style: {
                display: 'flex', alignItems: 'center', gap: 7,
                marginBottom: 14, padding: '10px 14px',
                background: 'var(--red-glow)', border: '1px solid var(--red)',
                borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--red)'
              },
              children: [_jsxDEV(Icon, { name: "warning", size: 15, color: "currentColor" }, void 0, false), " ", errForm]
            }, void 0, true),

            _jsxDEV("div", {
              style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
              children: [
                /* Nombre */
                _jsxDEV("div", {
                  className: "form-group",
                  style: { gridColumn: '1/-1' },
                  children: [
                    _jsxDEV("label", { className: "form-label", children: "Nombre completo *" }, void 0, false),
                    _jsxDEV("input", {
                      className: "form-input",
                      placeholder: "Nombre del usuario o tutor del alumno",
                      value: form.nombre,
                      onChange: e => setForm(f => ({ ...f, nombre: e.target.value }))
                    }, void 0, false)
                  ]
                }, void 0, true),

                /* Email */
                _jsxDEV("div", {
                  className: "form-group",
                  children: [
                    _jsxDEV("label", { className: "form-label", children: "Correo electrónico *" }, void 0, false),
                    _jsxDEV("input", {
                      className: "form-input", type: "email",
                      placeholder: "tutor@correo.com",
                      value: form.email,
                      onChange: e => setForm(f => ({ ...f, email: e.target.value }))
                    }, void 0, false)
                  ]
                }, void 0, true),

                /* Rol */
                _jsxDEV("div", {
                  className: "form-group",
                  children: [
                    _jsxDEV("label", { className: "form-label", children: "Rol del usuario *" }, void 0, false),
                    _jsxDEV("select", {
                      className: "form-select",
                      value: form.rol,
                      onChange: e => {
                        const nuevoRol = e.target.value;
                        setForm(f => ({
                          ...f,
                          rol: nuevoRol,
                          escuela_id: nuevoRol === 'familia' ? user.escuela_id || f.escuela_id : f.escuela_id
                        }));
                      },
                      disabled: modal === 'editar',
                      children: [
                        _jsxDEV("option", { value: "", children: "Seleccionar rol…" }, void 0, false),
                        rolesCreables.map(r => _jsxDEV("option", {
                          value: r,
                          children: ROL_INFO[r]?.label
                        }, r, true))
                      ]
                    }, void 0, true)
                  ]
                }, void 0, true),

                /* Familia (condicional) */
                form.rol === 'familia' && _jsxDEV("div", {
                  className: "form-group",
                  style: { gridColumn: '1/-1' },
                  children: [
                    _jsxDEV("label", { className: "form-label", children: "Vincular con Cuenta Familiar / Alumno *" }, void 0, false),
                    _jsxDEV("select", {
                      className: "form-select",
                      value: form.familia_id,
                      onChange: e => {
                        const fid = parseInt(e.target.value);
                        const escuelaDeFamilia = familiasUnicas.find(fam => fam.id === fid)?.escuela_id || form.escuela_id;
                        setForm(f => ({ ...f, familia_id: e.target.value, escuela_id: escuelaDeFamilia }));
                      },
                      children: [
                        _jsxDEV("option", { value: "", children: "Seleccionar la familia correspondiente…" }, void 0, false),
                        familiasUnicas
                          .filter(f => esSuper || f.escuela_id === user.escuela_id)
                          .map(fam => _jsxDEV("option", {
                            value: fam.id,
                            children: [fam.nombre, " (ID Ref: ", fam.id, ")"]
                          }, fam.id, true))
                      ]
                    }, void 0, true)
                  ]
                }, void 0, true),

                /* Escuela (o Zona, si es distribuidor) */
                form.rol === 'distribuidor' ? _jsxDEV("div", {
                  className: "form-group",
                  children: [
                    _jsxDEV("label", { className: "form-label", children: "Zona asignada" }, void 0, false),
                    _jsxDEV("input", {
                      className: "form-input",
                      placeholder: "Ej. Noreste, CDMX Sur…",
                      value: form.zona,
                      onChange: e => setForm(f => ({ ...f, zona: e.target.value }))
                    }, void 0, false),
                    _jsxDEV("div", {
                      style: { fontSize: 11, color: 'var(--ink-4)', marginTop: 4 },
                      children: "Informativa — un distribuidor no pertenece a ninguna escuela"
                    }, void 0, false)
                  ]
                }, void 0, true) : _jsxDEV("div", {
                  className: "form-group",
                  children: [
                    _jsxDEV("label", {
                      className: "form-label",
                      children: ["Escuela asignada", form.rol === 'superadmin' ? ' (ninguna)' : ' *']
                    }, void 0, true),
                    _jsxDEV("select", {
                      className: "form-select",
                      value: form.escuela_id,
                      onChange: e => setForm(f => ({ ...f, escuela_id: e.target.value })),
                      disabled: user.rol === 'admin' || form.rol === 'familia',
                      children: [
                        esSuper && form.rol !== 'superadmin' && _jsxDEV("option", { value: "", children: "Sin escuela" }, void 0, false),
                        escuelasDisp.map(e => _jsxDEV("option", {
                          value: e.id,
                          children: [e.logo_emoji, " ", e.nombre, e.activa ? '' : ' (Inactiva)']
                        }, e.id, true))
                      ]
                    }, void 0, true),
                    (user.rol === 'admin' || form.rol === 'familia') && _jsxDEV("div", {
                      style: { fontSize: 11, color: 'var(--ink-4)', marginTop: 4 },
                      children: form.rol === 'familia'
                        ? 'Heredado automáticamente de la cuenta de los alumnos asignados'
                        : 'Asignado automáticamente a tu plantel operativo'
                    }, void 0, false)
                  ]
                }, void 0, true),

                /* Contraseña */
                _jsxDEV("div", {
                  className: "form-group",
                  children: [
                    _jsxDEV("label", {
                      className: "form-label",
                      children: modal === 'editar' ? 'Nueva contraseña (dejar vacío = mantener)' : 'Contraseña *'
                    }, void 0, false),
                    _jsxDEV("input", {
                      className: "form-input",
                      type: "password",
                      placeholder: modal === 'editar' ? '••••••• (opcional)' : 'Mínimo 6 caracteres',
                      value: form.password,
                      onChange: e => setForm(f => ({ ...f, password: e.target.value }))
                    }, void 0, false)
                  ]
                }, void 0, true),

                /* Confirmar contraseña */
                _jsxDEV("div", {
                  className: "form-group",
                  children: [
                    _jsxDEV("label", {
                      className: "form-label",
                      children: ["Confirmar contraseña", modal === 'editar' ? ' (si cambia)' : ' *']
                    }, void 0, true),
                    _jsxDEV("input", {
                      className: "form-input",
                      type: "password",
                      placeholder: "Repetir contraseña",
                      value: form.password2,
                      onChange: e => setForm(f => ({ ...f, password2: e.target.value }))
                    }, void 0, false)
                  ]
                }, void 0, true),

                /* Contraseña actual (solo al editar tu propio perfil, si cambias password o correo) */
                modal === 'editar' && form.id === user.id && _jsxDEV("div", {
                  className: "form-group",
                  children: [
                    _jsxDEV("label", {
                      className: "form-label",
                      children: "Tu contraseña actual (para confirmar los cambios)"
                    }, void 0, false),
                    _jsxDEV("input", {
                      className: "form-input",
                      type: "password",
                      placeholder: "Requerida si cambias tu contraseña o correo",
                      value: form.password_actual,
                      onChange: e => setForm(f => ({ ...f, password_actual: e.target.value }))
                    }, void 0, false)
                  ]
                }, void 0, true)
              ]
            }, void 0, true),

            /* Preview del usuario */
            form.nombre && _jsxDEV("div", {
              style: {
                marginTop: 16, padding: '14px 16px',
                background: 'var(--glass-light)', border: '1px solid var(--border-glow)',
                borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', gap: 14
              },
              children: [
                _jsxDEV("div", {
                  className: "avatar",
                  style: {
                    width: 42, height: 42, fontSize: 14,
                    background: ROL_INFO[form.rol]?.bg || 'var(--glass)',
                    color: ROL_INFO[form.rol]?.color || 'var(--ink)'
                  },
                  children: form.nombre.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
                }, void 0, false),
                _jsxDEV("div", {
                  children: [
                    _jsxDEV("div", {
                      style: { fontWeight: 600, fontSize: 14, color: 'var(--ink)' },
                      children: form.nombre || '—'
                    }, void 0, false),
                    _jsxDEV("div", {
                      style: { fontSize: 12, color: 'var(--ink-3)', marginTop: 2 },
                      children: [
                        form.email || 'sin correo', " ·", ' ',
                        form.rol
                          ? _jsxDEV("span", {
                              style: { color: ROL_INFO[form.rol]?.color, display: 'inline-flex', alignItems: 'center', gap: 4 },
                              children: [_jsxDEV(Icon, { name: ROL_INFO[form.rol]?.icon, size: 12, color: "currentColor" }, void 0, false), " ", ROL_INFO[form.rol]?.label]
                            }, void 0, true)
                          : 'sin rol',
                        " ·", ' ',
                        form.rol === 'familia' && form.familia_id
                          ? `Vínculo: ${obtenerNombreFamilia(parseInt(form.familia_id))}`
                          : form.rol === 'distribuidor'
                            ? `Zona: ${form.zona.trim() || 'sin asignar'}`
                            : form.escuela_id ? nombreEscuela(parseInt(form.escuela_id)) : 'Global'
                      ]
                    }, void 0, true)
                  ]
                }, void 0, true)
              ]
            }, void 0, true)
          ]
        }, void 0, true),

        _jsxDEV("div", {
          className: "modal-footer",
          children: [
            _jsxDEV("button", {
              className: "btn btn-secondary",
              onClick: () => setModal(null),
              children: "Cancelar"
            }, void 0, false),
            _jsxDEV("button", {
              className: "btn btn-primary",
              onClick: onGuardar,
              children: modal === 'crear' ? '+ Crear usuario' : 'Guardar cambios'
            }, void 0, false)
          ]
        }, void 0, true)
      ]
    }, void 0, true)
  }, void 0, false);
}

/* ─── Componente principal ─── */
function Usuarios({ user, data }) {
  const { useState, useEffect } = React;

  const EMPTY_FORM = {
    nombre: '', email: '', password: '', password2: '', password_actual: '',
    rol: '', escuela_id: '', familia_id: '', zona: ''
  };

  const [usuarios, setUsuarios] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errForm, setErrForm] = useState('');
  const [filtroRol, setFiltroRol] = useState('todos');
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState(null);

  const esSuper = AuthController.isSuperAdmin(user);

  const cargarUsuarios = async () => {
    try {
      const lista = await AuthController.getUsuarios(user);
      setUsuarios(lista);
    } catch(e) { setUsuarios([]); }
  };

  useEffect(() => { cargarUsuarios(); }, []);

  const rolesCreables = AuthController.rolesQuePuedeCriar(user);
  if ((user.rol === 'superadmin' || user.rol === 'admin') && !rolesCreables.includes('familia')) {
    rolesCreables.push('familia');
  }
  const escuelasDisp = AuthController.escuelasDisponibles(user, data.escuelas);

  const familiasUnicas = React.useMemo(() => {
    const lista = [];
    const idsVistos = new Set();
    (data.clientes || []).forEach(c => {
      if (c.familia_id && !idsVistos.has(c.familia_id)) {
        idsVistos.add(c.familia_id);
        const nombreFamilia = c.apellido_familia || `Familia de ${c.nombre}`;
        lista.push({ id: c.familia_id, nombre: nombreFamilia, escuela_id: c.escuela_id });
      }
    });
    return lista;
  }, [data.clientes]);

  const nombreEscuela = eid => {
    const e = (data.escuelas || []).find(e => e.id === eid);
    if (!e) return '—';
    return e.nombre + (e.activa ? '' : ' (Inactiva)');
  };
  const emojiEscuela  = eid => (data.escuelas || []).find(e => e.id === eid)?.nombre || '';
  const creadorNombre = cid => {
    const u = usuarios.find(u => u.id === cid);
    return u ? u.nombre : cid === null ? 'Sistema' : `#${cid}`;
  };
  const obtenerNombreFamilia = fid => {
    const fam = familiasUnicas.find(f => f.id === fid);
    return fam ? fam.nombre : `Familia ID #${fid}`;
  };

  const lista = usuarios.filter(u => {
    if (filtroRol !== 'todos' && u.rol !== filtroRol) return false;
    if (q) {
      const busq = q.toLowerCase();
      return u.nombre.toLowerCase().includes(busq) || u.email.toLowerCase().includes(busq);
    }
    return true;
  });

  const ROL_INFO = {
    superadmin:   { label: 'Super Admin',  icon: 'shield',  color: 'var(--amber)', bg: 'var(--amber-glow)',    badge: 'badge-amber'  },
    admin:        { label: 'Admin',        icon: 'escuelas', color: 'var(--accent)', bg: 'var(--accent-glow)', badge: 'badge-blue'   },
    cajero:       { label: 'Cajero',       icon: 'cobros',  color: 'var(--green)', bg: 'var(--green-glow)',    badge: 'badge-green'  },
    familia:      { label: 'Familia',      icon: 'home',    color: '#a855f7',      bg: 'rgba(168,85,247,.15)', badge: 'badge-purple' },
    distribuidor: { label: 'Distribuidor', icon: 'globe',   color: '#84cc16',      bg: 'rgba(132,204,22,.15)', badge: 'badge-lime'   }
  };

  /* ── Crear ── */
  const abrirCrear = () => {
    setForm({ ...EMPTY_FORM, rol: rolesCreables[0] || '', escuela_id: user.escuela_id || '' });
    setErrForm('');
    setModal('crear');
  };
  const guardarNuevo = async () => {
    setErrForm('');
    if (!form.nombre || !form.email || !form.password || !form.rol)
      return setErrForm('Completa todos los campos obligatorios.');
    if (form.rol === 'familia' && !form.familia_id)
      return setErrForm('Debes vincular este usuario a una cuenta familiar obligatoriamente.');
    if (form.password !== form.password2)
      return setErrForm('Las contraseñas no coinciden.');
    if (form.password.length < 6)
      return setErrForm('La contraseña debe tener al menos 6 caracteres.');
    const payload = {
      ...form,
      escuela_id: form.rol === 'distribuidor' ? null : (form.escuela_id ? parseInt(form.escuela_id) : null),
      familia_id: form.rol === 'familia' ? parseInt(form.familia_id) : null,
      zona: form.rol === 'distribuidor' ? form.zona.trim() : ''
    };
    try { await AuthController.crearUsuario(user, payload, data.escuelas); }
    catch(e) { setErrForm(e.message); return; }
    await cargarUsuarios();
    setModal(null);
  };

  /* ── Editar ── */
  const abrirEditar = u => {
    setForm({
      id: u.id, nombre: u.nombre, email: u.email,
      password: '', password2: '', password_actual: '',
      rol: u.rol, escuela_id: u.escuela_id || '', familia_id: u.familia_id || '', zona: u.zona || ''
    });
    setErrForm('');
    setModal('editar');
  };
  const esPropioPerfil = form.id === user.id;

  const guardarEdicion = async () => {
    setErrForm('');
    if (!form.nombre || !form.email) return setErrForm('Nombre y correo son obligatorios.');
    if (form.rol === 'familia' && !form.familia_id) return setErrForm('La vinculación familiar es requerida.');
    if (form.password && form.password !== form.password2) return setErrForm('Las contraseñas no coinciden.');
    if (form.password && form.password.length < 6) return setErrForm('Contraseña mínimo 6 caracteres.');
    if (esPropioPerfil && (form.password || form.email) && !form.password_actual)
      return setErrForm('Ingresa tu contraseña actual para guardar estos cambios.');
    const payload = {
      ...form,
      escuela_id: form.rol === 'distribuidor' ? null : (form.escuela_id ? parseInt(form.escuela_id) : null),
      familia_id: form.rol === 'familia' ? parseInt(form.familia_id) : null,
      zona: form.rol === 'distribuidor' ? form.zona.trim() : ''
    };
    try { await AuthController.editarUsuario(user, payload); }
    catch(e) { setErrForm(e.message); return; }
    await cargarUsuarios();
    setModal(null);
  };

  /* ── Toggle / Eliminar ── */
  const confirmarAccion = async () => {
    if (!confirm) return;
    try {
      if (confirm.tipo === 'toggle')   await AuthController.toggleUsuario(user, confirm.userId);
      if (confirm.tipo === 'eliminar') await AuthController.eliminarUsuario(user, confirm.userId);
    } catch(e) { alert('Error: ' + e.message); }
    await cargarUsuarios();
    setConfirm(null);
  };

  const puedeEditar = objetivo => {
    if (!objetivo) return false;
    if (esSuper) return true;
    if (user.rol === 'admin' && (objetivo.rol === 'cajero' || objetivo.rol === 'familia') && objetivo.escuela_id === user.escuela_id) return true;
    return false;
  };

  /* Props compartidos para el modal */
  const modalProps = {
    modal, form, setForm, setModal, errForm,
    rolesCreables, escuelasDisp, familiasUnicas,
    esSuper, user, ROL_INFO, obtenerNombreFamilia, nombreEscuela
  };

  /* ── Render ── */
  return _jsxDEV("div", {
    children: [
      /* Stats grid */
      _jsxDEV("div", {
        className: "stats-grid",
        style: { marginBottom: 20 },
        children: [
          { rol: 'superadmin', count: usuarios.filter(u => u.rol === 'superadmin').length },
          { rol: 'admin',      count: usuarios.filter(u => u.rol === 'admin').length },
          { rol: 'cajero',     count: usuarios.filter(u => u.cajero || u.rol === 'cajero').length },
          { rol: 'familia',    count: usuarios.filter(u => u.rol === 'familia').length },
          { rol: 'distribuidor', count: usuarios.filter(u => u.rol === 'distribuidor').length },
          { label: 'Total activos', count: usuarios.filter(u => u.activo !== false).length, icon: 'check', color: 'var(--green)', bg: 'var(--green-glow)' }
        ].map((s, i) => {
          const info = s.rol ? ROL_INFO[s.rol] : null;
          return _jsxDEV("div", {
            className: "stat-card",
            style: {
              cursor: 'pointer',
              border: filtroRol === s.rol ? `1px solid ${info?.color || 'transparent'}` : '1px solid transparent'
            },
            onClick: () => setFiltroRol(s.rol || 'todos'),
            children: [
              _jsxDEV("div", { className: "stat-icon", style: { background: info?.bg || s.bg, color: info?.color }, children: _jsxDEV(Icon, { name: info?.icon || s.icon, size: 24, color: "currentColor" }, void 0, false) }, void 0, false),
              _jsxDEV("div", { className: "stat-label", children: info?.label || s.label }, void 0, false),
              _jsxDEV("div", { className: "stat-value", style: { fontSize: 22 }, children: s.count }, void 0, false)
            ]
          }, i, true);
        })
      }, void 0, false),

      /* Tabla */
      _jsxDEV("div", {
        className: "card",
        children: [
          _jsxDEV("div", {
            className: "card-header",
            children: [
              _jsxDEV("div", {
                children: [
                  _jsxDEV("div", { className: "card-title", children: "Usuarios del sistema" }, void 0, false),
                  _jsxDEV("div", {
                    className: "card-sub",
                    children: [
                      esSuper ? 'Todas las escuelas' : `Escuela: ${nombreEscuela(user.escuela_id)}`,
                      ' · ', lista.length, " usuario", lista.length !== 1 ? 's' : ''
                    ]
                  }, void 0, true)
                ]
              }, void 0, true),
              rolesCreables.length > 0 && _jsxDEV("button", {
                className: "btn btn-primary",
                onClick: abrirCrear,
                children: "+ Nuevo usuario"
              }, void 0, false)
            ]
          }, void 0, true),

          /* Filtros */
          _jsxDEV("div", {
            style: { display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' },
            children: [
              ['todos', 'superadmin', 'admin', 'cajero', 'familia', 'distribuidor'].map(r =>
                _jsxDEV("button", {
                  className: `badge ${filtroRol === r ? ROL_INFO[r]?.badge || 'badge-blue' : 'badge-gray'}`,
                  style: {
                    cursor: 'pointer', padding: '5px 12px', fontSize: 12,
                    border: filtroRol === r ? `1px solid ${ROL_INFO[r]?.color || 'currentColor'}` : '1px solid transparent',
                    background: filtroRol === r ? ROL_INFO[r]?.bg : ''
                  },
                  onClick: () => setFiltroRol(r),
                  children: r === 'todos' ? 'Todos' : `${ROL_INFO[r]?.icon} ${ROL_INFO[r]?.label}`
                }, r, false)
              ),
              _jsxDEV("div", {
                className: "search-bar",
                style: { marginLeft: 'auto', minWidth: 220 },
                children: [
                  _jsxDEV("span", { className: "search-icon", children: _jsxDEV(Icon, { name: "search", size: 15, color: "currentColor" }, void 0, false) }, void 0, false),
                  _jsxDEV("input", { placeholder: "Buscar usuario…", value: q, onChange: e => setQ(e.target.value) }, void 0, false)
                ]
              }, void 0, true)
            ]
          }, void 0, true),

          /* Table */
          _jsxDEV("div", {
            className: "table-wrap",
            children: _jsxDEV("table", {
              children: [
                _jsxDEV("thead", {
                  children: _jsxDEV("tr", {
                    children: ["Usuario","Rol","Vínculo / Escuela","Creado por","Alta","Estado","Acciones"].map(h =>
                      _jsxDEV("th", { children: h }, h, false)
                    )
                  }, void 0, true)
                }, void 0, false),
                _jsxDEV("tbody", {
                  children: [
                    lista.length === 0 && _jsxDEV("tr", {
                      children: _jsxDEV("td", {
                        colSpan: 7,
                        children: _jsxDEV("div", {
                          className: "empty-state",
                          children: [
                            _jsxDEV("div", { className: "empty-icon", children: _jsxDEV(Icon, { name: "alumnos", size: 36, color: "currentColor" }, void 0, false) }, void 0, false),
                            _jsxDEV("div", { className: "empty-text", children: "Sin usuarios en este filtro" }, void 0, false)
                          ]
                        }, void 0, true)
                      }, void 0, false)
                    }, void 0, false),
                    lista.map(u => {
                      const info = ROL_INFO[u.rol];
                      const puedeAcc = puedeEditar(u);
                      const esUnoMismo = u.id === user.id;
                      return _jsxDEV("tr", {
                        children: [
                          _jsxDEV("td", {
                            children: _jsxDEV("div", {
                              style: { display: 'flex', alignItems: 'center', gap: 10 },
                              children: [
                                _jsxDEV("div", {
                                  className: "avatar",
                                  style: { width: 34, height: 34, fontSize: 12, flexShrink: 0, opacity: u.activo === false ? .4 : 1, background: info?.bg || 'var(--glass)', color: info?.color || 'var(--ink)' },
                                  children: u.avatar || u.nombre.charAt(0).toUpperCase()
                                }, void 0, false),
                                _jsxDEV("div", {
                                  style: { minWidth: 0 },
                                  children: [
                                    _jsxDEV("div", { style: { fontWeight: 500, fontSize: 13, color: 'var(--ink)', opacity: u.activo === false ? .5 : 1 }, children: u.nombre }, void 0, false),
                                    _jsxDEV("div", { style: { fontSize: 11, color: 'var(--ink-4)' }, children: u.email }, void 0, false)
                                  ]
                                }, void 0, true)
                              ]
                            }, void 0, true)
                          }, void 0, false),
                          _jsxDEV("td", {
                            children: _jsxDEV("span", { className: `badge ${info?.badge || 'badge-gray'}`, style: { display: 'flex', alignItems: 'center', gap: 4 }, children: [_jsxDEV(Icon, { name: info?.icon, size: 14, color: "currentColor" }, void 0, false), " ", info?.label] }, void 0, true)
                          }, void 0, false),
                          _jsxDEV("td", {
                            children: u.rol === 'familia'
                              ? _jsxDEV("div", {
                                  style: { fontSize: 12, color: 'var(--ink-2)' },
                                  children: [
                                    _jsxDEV(Icon, { name: "home", size: 13, color: "var(--purple)" }, void 0, false), " ",
                                    _jsxDEV("strong", { style: { color: 'var(--purple)' }, children: obtenerNombreFamilia(u.familia_id) }, void 0, false),
                                    _jsxDEV("div", { style: { fontSize: 10, color: 'var(--ink-4)', marginTop: 2 }, children: [emojiEscuela(u.escuela_id), " ", nombreEscuela(u.escuela_id)] }, void 0, true)
                                  ]
                                }, void 0, true)
                              : u.rol === 'distribuidor'
                                ? _jsxDEV("span", { style: { fontSize: 12, color: '#84cc16' }, children: ["🌐 Zona: ", u.zona || 'sin asignar'] }, void 0, true)
                                : u.escuela_id
                                  ? _jsxDEV("span", { style: { fontSize: 12, color: 'var(--ink-2)' }, children: [emojiEscuela(u.escuela_id), " ", nombreEscuela(u.escuela_id)] }, void 0, true)
                                  : _jsxDEV("span", { style: { fontSize: 12, color: 'var(--ink-4)' }, children: "Global" }, void 0, false)
                          }, void 0, false),
                          _jsxDEV("td", { children: _jsxDEV("span", { style: { fontSize: 12, color: 'var(--ink-3)' }, children: u.creado_por === null ? '⭐ Sistema' : creadorNombre(u.creado_por) }, void 0, false) }, void 0, false),
                          _jsxDEV("td", { style: { fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--mono)' }, children: u.fecha_alta || '—' }, void 0, false),
                          _jsxDEV("td", {
                            children: u.activo === false
                              ? _jsxDEV("span", { className: "badge badge-red", children: "Inactivo" }, void 0, false)
                              : _jsxDEV("span", { className: "badge badge-green", children: "Activo" }, void 0, false)
                          }, void 0, false),
                          _jsxDEV("td", {
                            children: _jsxDEV("div", {
                              style: { display: 'flex', gap: 5 },
                              children: [
                                (puedeAcc || esUnoMismo) && _jsxDEV(_Fragment, {
                                  children: [
                                    _jsxDEV("button", { className: "btn btn-ghost btn-sm", onClick: () => abrirEditar(u), title: esUnoMismo ? "Editar mi perfil / cambiar mi contraseña" : "Editar", children: _jsxDEV(Icon, { name: "edit", size: 14, color: "currentColor" }, void 0, false) }, void 0, false),
                                    puedeAcc && !u.es_semilla && !esUnoMismo && _jsxDEV("button", {
                                      className: "btn btn-ghost btn-sm",
                                      onClick: () => setConfirm({ tipo: 'toggle', userId: u.id }),
                                      title: u.activo === false ? 'Activar' : 'Desactivar',
                                      children: u.activo === false
                                        ? _jsxDEV(Icon, { name: "eyeOff", size: 14, color: "currentColor" }, void 0, false)
                                        : _jsxDEV(Icon, { name: "shield", size: 14, color: "currentColor" }, void 0, false)
                                    }, void 0, false),
                                    puedeAcc && !u.es_semilla && !esUnoMismo && (u.creado_por === user.id || esSuper) && _jsxDEV("button", {
                                      className: "btn btn-ghost btn-sm",
                                      onClick: () => setConfirm({ tipo: 'eliminar', userId: u.id }),
                                      title: "Eliminar",
                                      children: _jsxDEV(Icon, { name: "trash", size: 14, color: "currentColor" }, void 0, false)
                                    }, void 0, false)
                                  ]
                                }, void 0, true),
                                !puedeAcc && !esUnoMismo && _jsxDEV("span", { style: { fontSize: 11, color: 'var(--ink-4)', padding: '0 4px' }, children: "—" }, void 0, false)
                              ]
                            }, void 0, true)
                          }, void 0, false)
                        ]
                      }, u.id, true);
                    })
                  ]
                }, void 0, true)
              ]
            }, void 0, true)
          }, void 0, false),

          /* Leyenda de roles */
          _jsxDEV("div", {
            style: { marginTop: 20, padding: '14px 16px', background: 'var(--glass-light)', borderRadius: 'var(--radius-sm)', display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' },
            children: [
              _jsxDEV("div", {
                style: { fontSize: 11, color: 'var(--ink-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6, flexBasis: '100%' },
                children: "Jerarquía de permisos y roles autorizados"
              }, void 0, false),
              [
                { rol: 'superadmin', desc: 'Crea admins, cajeros y familias · Acceso global administrativo completo.' },
                { rol: 'admin',      desc: 'Gestiona cajeros y familias asignados a su mismo plantel escolar.' },
                { rol: 'cajero',     desc: 'Acceso operativo exclusivo a Caja, cobros, e impresión de tickets.' },
                { rol: 'familia',    desc: 'Portal Autogestionable. Consulta estados de cuenta dinámicos y realiza pagos en línea.' },
                { rol: 'distribuidor', desc: 'Refiere colegios nuevos y da seguimiento a su embudo y comisiones por zona asignada.' }
              ].filter(item => item.rol !== 'superadmin' || user?.rol === 'superadmin').map(item => _jsxDEV("div", {
                style: { display: 'flex', alignItems: 'flex-start', gap: 8, flex: '1 1 220px' },
                children: [
                  _jsxDEV("span", { className: `badge ${ROL_INFO[item.rol].badge}`, style: { flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }, children: [_jsxDEV(Icon, { name: ROL_INFO[item.rol].icon, size: 14, color: "currentColor" }, void 0, false), " ", ROL_INFO[item.rol].label] }, void 0, true),
                  _jsxDEV("span", { style: { fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.5 }, children: item.desc }, void 0, false)
                ]
              }, item.rol, true))
            ]
          }, void 0, true)
        ]
      }, void 0, true),

      /* Modal Crear */
      modal === 'crear' && _jsxDEV(UsuariosFormModal, {
        ...modalProps,
        titulo: "Nuevo usuario del sistema",
        onGuardar: guardarNuevo
      }, void 0, false),

      /* Modal Editar */
      modal === 'editar' && _jsxDEV(UsuariosFormModal, {
        ...modalProps,
        titulo: "Editar credenciales de usuario",
        onGuardar: guardarEdicion
      }, void 0, false),

      /* Modal Confirmar */
      confirm && _jsxDEV("div", {
        className: "modal-backdrop",
        onClick: e => e.target === e.currentTarget && setConfirm(null),
        children: _jsxDEV("div", {
          className: "modal",
          style: { maxWidth: 380 },
          children: [
            _jsxDEV("div", { className: "modal-header", children: _jsxDEV("div", { className: "modal-title", children: confirm.tipo === 'toggle' ? 'Cambiar estado' : 'Eliminar usuario' }, void 0, false) }, void 0, false),
            _jsxDEV("div", {
              className: "modal-body",
              children: _jsxDEV("p", {
                style: { fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 },
                children: confirm.tipo === 'toggle'
                  ? `¿Seguro que quieres ${usuarios.find(u => u.id === confirm.userId)?.activo === false ? 'activar' : 'desactivar'} a ${usuarios.find(u => u.id === confirm.userId)?.nombre}?`
                  : `¿Eliminar permanentemente a ${usuarios.find(u => u.id === confirm.userId)?.nombre}? Esta acción no se puede revertir del sistema.`
              }, void 0, false)
            }, void 0, false),
            _jsxDEV("div", {
              className: "modal-footer",
              children: [
                _jsxDEV("button", { className: "btn btn-secondary", onClick: () => setConfirm(null), children: "Cancelar" }, void 0, false),
                _jsxDEV("button", {
                  className: `btn ${confirm.tipo === 'eliminar' ? 'btn-danger' : 'btn-primary'}`,
                  onClick: confirmarAccion,
                  children: confirm.tipo === 'toggle' ? 'Confirmar' : 'Eliminar'
                }, void 0, false)
              ]
            }, void 0, true)
          ]
        }, void 0, true)
      }, void 0, false)
    ]
  }, void 0, true);
}
