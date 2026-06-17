var _jsxDEV = function(type,props,key,_s,_src,_self){
  var p = Object.assign({key:key||undefined},props);
  var ch = p.children; delete p.children;
  return ch===undefined ? React.createElement(type,p)
       : Array.isArray(ch) ? React.createElement(type,p,...ch)
       : React.createElement(type,p,ch);
};
var _Fragment = React.Fragment;
/* views/Usuarios.jsx — Gestión dinámica de usuarios con jerarquía de roles e integración de Portal Familiar */
function Usuarios({
  user,
  data
}) {
  const {
    useState,
    useEffect
  } = React;
  const EMPTY_FORM = {
    nombre: '',
    email: '',
    password: '',
    password2: '',
    rol: '',
    escuela_id: '',
    familia_id: '' // <-- Se añade familia_id a la arquitectura del formulario
  };
  const [usuarios, setUsuarios] = useState([]);
  const [modal, setModal] = useState(null); // null | 'crear' | 'editar' | 'detalle'
  const [form, setForm] = useState(EMPTY_FORM);
  const [errForm, setErrForm] = useState('');
  const [filtroRol, setFiltroRol] = useState('todos');
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState(null); // { tipo, userId }

  const esSuper = AuthController.isSuperAdmin(user);
  const cargarUsuarios = async () => {
    try {
      const lista = await AuthController.getUsuarios(user);
      setUsuarios(lista);
    } catch(e) { setUsuarios([]); }
  };
  useEffect(() => {
    cargarUsuarios();
  }, []);

  // Extendemos la lectura de roles del controlador para incluir familias si aplica
  const rolesCreables = AuthController.rolesQuePuedeCriar(user);
  // Nota: Asegúrate de que tu AuthController.rolesQuePuedeCriar(user) devuelva 'familia' para superadmin/admin
  if ((user.rol === 'superadmin' || user.rol === 'admin') && !rolesCreables.includes('familia')) {
    rolesCreables.push('familia');
  }
  const escuelasDisp = AuthController.escuelasDisponibles(user, data.escuelas);

  // Mapear y agrupar familias únicas desde data.clientes para el selector dinámico
  const familiasUnicas = React.useMemo(() => {
    const lista = [];
    const idsVistos = new Set();
    (data.clientes || []).forEach(c => {
      if (c.familia_id && !idsVistos.has(c.familia_id)) {
        idsVistos.add(c.familia_id);
        // Intentamos usar el apellido familiar si existe, o el nombre del alumno como referencia
        const nombreFamilia = c.apellido_familia || `Familia de ${c.nombre}`;
        lista.push({
          id: c.familia_id,
          nombre: nombreFamilia,
          escuela_id: c.escuela_id
        });
      }
    });
    return lista;
  }, [data.clientes]);

  // Auxiliares de renderizado
  const nombreEscuela = eid => data.escuelas.find(e => e.id === eid)?.nombre || '—';
  const emojiEscuela = eid => data.escuelas.find(e => e.id === eid)?.nombre || '';
  const creadorNombre = cid => {
    const u = usuarios.find(u => u.id === cid);
    return u ? u.nombre : cid === null ? 'Sistema' : `#${cid}`;
  };
  const obtenerNombreFamilia = fid => {
    const fam = familiasUnicas.find(f => f.id === fid);
    return fam ? fam.nombre : `Familia ID #${fid}`;
  };

  // Filtrado de la tabla principal
  const lista = usuarios.filter(u => {
    if (filtroRol !== 'todos' && u.rol !== filtroRol) return false;
    if (q) {
      const busq = q.toLowerCase();
      return u.nombre.toLowerCase().includes(busq) || u.email.toLowerCase().includes(busq);
    }
    return true;
  });

  // Configuración extendida de Roles con el nuevo Portal de Familias
  const ROL_INFO = {
    superadmin: {
      label: 'Super Admin',
      icon: 'shield',
      color: 'var(--amber)',
      bg: 'var(--amber-glow)',
      badge: 'badge-amber'
    },
    admin: {
      label: 'Admin',
      icon: 'escuelas',
      color: 'var(--accent)',
      bg: 'var(--accent-glow)',
      badge: 'badge-blue'
    },
    cajero: {
      label: 'Cajero',
      icon: 'cobros',
      color: 'var(--green)',
      bg: 'var(--green-glow)',
      badge: 'badge-green'
    },
    familia: {
      label: 'Familia',
      icon: 'home',
      color: '#a855f7',
      bg: 'rgba(168, 85, 247, 0.15)',
      badge: 'badge-purple'
    }
  };

  // ── Crear usuario ──────────────────────────────────────────────────────────
  const abrirCrear = () => {
    setForm({
      ...EMPTY_FORM,
      rol: rolesCreables[0] || '',
      escuela_id: user.escuela_id || ''
    });
    setErrForm('');
    setModal('crear');
  };
  const guardarNuevo = () => {
    setErrForm('');
    if (!form.nombre || !form.email || !form.password || !form.rol) {
      return setErrForm('Completa todos los campos obligatorios.');
    }
    if (form.rol === 'familia' && !form.familia_id) {
      return setErrForm('Debes vincular este usuario a una cuenta familiar obligatoriamente.');
    }
    if (form.password !== form.password2) {
      return setErrForm('Las contraseñas no coinciden.');
    }
    if (form.password.length < 6) {
      return setErrForm('La contraseña debe tener al menos 6 caracteres.');
    }
    const payload = {
      ...form,
      escuela_id: form.escuela_id ? parseInt(form.escuela_id) : null,
      familia_id: form.rol === 'familia' ? parseInt(form.familia_id) : null
    };
    let result;
    try { result = await AuthController.crearUsuario(user, payload, data.escuelas); }
    catch(e) { setErrForm(e.message); return; }
    await cargarUsuarios();
    setModal(null);
  };

  // ── Editar usuario ─────────────────────────────────────────────────────────
  const abrirEditar = u => {
    setForm({
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      password: '',
      password2: '',
      rol: u.rol,
      escuela_id: u.escuela_id || '',
      familia_id: u.familia_id || ''
    });
    setErrForm('');
    setModal('editar');
  };
  const guardarEdicion = () => {
    setErrForm('');
    if (!form.nombre || !form.email) return setErrForm('Nombre y correo son obligatorios.');
    if (form.rol === 'familia' && !form.familia_id) return setErrForm('La vinculación familiar es requerida.');
    if (form.password && form.password !== form.password2) return setErrForm('Las contraseñas no coinciden.');
    if (form.password && form.password.length < 6) return setErrForm('Contraseña mínimo 6 caracteres.');
    const payload = {
      ...form,
      escuela_id: form.escuela_id ? parseInt(form.escuela_id) : null,
      familia_id: form.rol === 'familia' ? parseInt(form.familia_id) : null
    };
    let result;
    try { result = await AuthController.editarUsuario(user, payload); }
    catch(e) { setErrForm(e.message); return; }
    await cargarUsuarios();
    setModal(null);
  };

  // ── Toggle / eliminar ──────────────────────────────────────────────────────
  const confirmarAccion = () => {
    if (!confirm) return;
    try {
      if (confirm.tipo === 'toggle') await AuthController.toggleUsuario(user, confirm.userId);
      if (confirm.tipo === 'eliminar') await AuthController.eliminarUsuario(user, confirm.userId);
    } catch(e) { alert('Error: ' + e.message); }
    await cargarUsuarios();
    setConfirm(null);
  };
  const puedeEditar = objetivo => {
    if (!objetivo) return false;
    if (esSuper) return true;
    // Un administrador de plantel puede gestionar cajeros y cuentas familiares de su misma escuela
    if (user.rol === 'admin' && (objetivo.rol === 'cajero' || objetivo.rol === 'familia') && objetivo.escuela_id === user.escuela_id) return true;
    return false;
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const FormModal = ({
    titulo,
    onGuardar
  }) => /*#__PURE__*/_jsxDEV("div", {
    className: "modal-backdrop",
    onClick: e => e.target === e.currentTarget && setModal(null),
    children: /*#__PURE__*/_jsxDEV("div", {
      className: "modal modal-lg",
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "modal-header",
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "modal-title",
          children: titulo
        }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
          className: "btn btn-ghost btn-sm",
          onClick: () => setModal(null),
          children: /*#__PURE__*/_jsxDEV(Icon, {
            name: "close",
            size: 16,
            color: "currentColor"
          }, void 0, false)
        }, void 0, false)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        className: "modal-body",
        children: [errForm && /*#__PURE__*/_jsxDEV("div", {
          style: {
            marginBottom: 14,
            padding: '10px 14px',
            background: 'var(--red-glow)',
            border: '1px solid var(--red)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 13,
            color: 'var(--red)'
          },
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 7
          },
          children: [/*#__PURE__*/_jsxDEV(Icon, {
            name: "warning",
            size: 15,
            color: "currentColor"
          }, void 0, false), " ", errForm]
        }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
          style: {
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "form-group",
            style: {
              gridColumn: '1/-1'
            },
            children: [/*#__PURE__*/_jsxDEV("label", {
              className: "form-label",
              children: "Nombre completo *"
            }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
              className: "form-input",
              placeholder: "Nombre del usuario o tutor del alumno",
              value: form.nombre,
              onChange: e => setForm(f => ({
                ...f,
                nombre: e.target.value
              }))
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            className: "form-group",
            children: [/*#__PURE__*/_jsxDEV("label", {
              className: "form-label",
              children: "Correo electrónico *"
            }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
              className: "form-input",
              type: "email",
              placeholder: "tutor@correo.com",
              value: form.email,
              onChange: e => setForm(f => ({
                ...f,
                email: e.target.value
              }))
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            className: "form-group",
            children: [/*#__PURE__*/_jsxDEV("label", {
              className: "form-label",
              children: "Rol del usuario *"
            }, void 0, false), /*#__PURE__*/_jsxDEV("select", {
              className: "form-select",
              value: form.rol,
              onChange: e => {
                const nuevoRol = e.target.value;
                setForm(f => ({
                  ...f,
                  rol: nuevoRol,
                  // Si se cambia a familia, intentamos pre-asignar la escuela del primer hijo
                  escuela_id: nuevoRol === 'familia' ? user.escuela_id || f.escuela_id : f.escuela_id
                }));
              },
              disabled: modal === 'editar',
              children: [/*#__PURE__*/_jsxDEV("option", {
                value: "",
                children: "Seleccionar rol…"
              }, void 0, false), rolesCreables.map(r => /*#__PURE__*/_jsxDEV("option", {
                value: r,
                children: [ROL_INFO[r]?.icon, " ", ROL_INFO[r]?.label]
              }, r, true))]
            }, void 0, true)]
          }, void 0, true), form.rol === 'familia' && /*#__PURE__*/_jsxDEV("div", {
            className: "form-group",
            style: {
              gridColumn: '1/-1'
            },
            children: [/*#__PURE__*/_jsxDEV("label", {
              className: "form-label",
              children: "Vincular con Cuenta Familiar / Alumno *"
            }, void 0, false), /*#__PURE__*/_jsxDEV("select", {
              className: "form-select",
              value: form.familia_id,
              onChange: e => {
                const fid = parseInt(e.target.value);
                const escuelaDeFamilia = familiasUnicas.find(fam => fam.id === fid)?.escuela_id || form.escuela_id;
                setForm(f => ({
                  ...f,
                  familia_id: e.target.value,
                  escuela_id: escuelaDeFamilia
                }));
              },
              children: [/*#__PURE__*/_jsxDEV("option", {
                value: "",
                children: "Seleccionar la familia correspondiente…"
              }, void 0, false), familiasUnicas.filter(f => esSuper || f.escuela_id === user.escuela_id).map(fam => /*#__PURE__*/_jsxDEV("option", {
                value: fam.id,
                children: [fam.nombre, " (ID Ref: ", fam.id, ")"]
              }, fam.id, true))]
            }, void 0, true)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            className: "form-group",
            children: [/*#__PURE__*/_jsxDEV("label", {
              className: "form-label",
              children: ["Escuela asignada", form.rol === 'superadmin' ? ' (ninguna)' : ' *']
            }, void 0, true), /*#__PURE__*/_jsxDEV("select", {
              className: "form-select",
              value: form.escuela_id,
              onChange: e => setForm(f => ({
                ...f,
                escuela_id: e.target.value
              })),
              disabled: user.rol === 'admin' || form.rol === 'familia',
              children: [esSuper && form.rol !== 'superadmin' && /*#__PURE__*/_jsxDEV("option", {
                value: "",
                children: "Sin escuela"
              }, void 0, false), escuelasDisp.map(e => /*#__PURE__*/_jsxDEV("option", {
                value: e.id,
                children: [e.logo_emoji, " ", e.nombre]
              }, e.id, true))]
            }, void 0, true), (user.rol === 'admin' || form.rol === 'familia') && /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 11,
                color: 'var(--ink-4)',
                marginTop: 4
              },
              children: form.rol === 'familia' ? 'Heredado automáticamente de la cuenta de los alumnos asignados' : 'Asignado automáticamente a tu plantel operativo'
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            className: "form-group",
            children: [/*#__PURE__*/_jsxDEV("label", {
              className: "form-label",
              children: modal === 'editar' ? 'Nueva contraseña (dejar vacío = mantener)' : 'Contraseña *'
            }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
              className: "form-input",
              type: "password",
              placeholder: modal === 'editar' ? '••••••• (opcional)' : 'Mínimo 6 caracteres',
              value: form.password,
              onChange: e => setForm(f => ({
                ...f,
                password: e.target.value
              }))
            }, void 0, false)]
          }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
            className: "form-group",
            children: [/*#__PURE__*/_jsxDEV("label", {
              className: "form-label",
              children: ["Confirmar contraseña", modal === 'editar' ? ' (si cambia)' : ' *']
            }, void 0, true), /*#__PURE__*/_jsxDEV("input", {
              className: "form-input",
              type: "password",
              placeholder: "Repetir contraseña",
              value: form.password2,
              onChange: e => setForm(f => ({
                ...f,
                password2: e.target.value
              }))
            }, void 0, false)]
          }, void 0, true)]
        }, void 0, true), form.nombre && /*#__PURE__*/_jsxDEV("div", {
          style: {
            marginTop: 16,
            padding: '14px 16px',
            background: 'var(--glass-light)',
            border: '1px solid var(--border-glow)',
            borderRadius: 'var(--radius)',
            display: 'flex',
            alignItems: 'center',
            gap: 14
          },
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: `avatar`,
            style: {
              width: 42,
              height: 42,
              fontSize: 14,
              background: ROL_INFO[form.rol]?.bg || 'var(--glass)',
              color: ROL_INFO[form.rol]?.color || 'var(--ink)'
            },
            children: form.nombre.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            children: [/*#__PURE__*/_jsxDEV("div", {
              style: {
                fontWeight: 600,
                fontSize: 14,
                color: 'var(--ink)'
              },
              children: form.nombre || '—'
            }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
              style: {
                fontSize: 12,
                color: 'var(--ink-3)',
                marginTop: 2
              },
              children: [form.email || 'sin correo', " ·", ' ', form.rol ? /*#__PURE__*/_jsxDEV("span", {
                style: {
                  color: ROL_INFO[form.rol]?.color
                },
                children: [ROL_INFO[form.rol]?.icon, " ", ROL_INFO[form.rol]?.label]
              }, void 0, true) : 'sin rol', " ·", ' ', form.rol === 'familia' && form.familia_id ? `Vínculo: ${obtenerNombreFamilia(parseInt(form.familia_id))}` : form.escuela_id ? nombreEscuela(parseInt(form.escuela_id)) : 'Global']
            }, void 0, true)]
          }, void 0, true)]
        }, void 0, true)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        className: "modal-footer",
        children: [/*#__PURE__*/_jsxDEV("button", {
          className: "btn btn-secondary",
          onClick: () => setModal(null),
          children: "Cancelar"
        }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
          className: "btn btn-primary",
          onClick: onGuardar,
          children: modal === 'crear' ? '+ Crear usuario' : 'Guardar cambios'
        }, void 0, false)]
      }, void 0, true)]
    }, void 0, true)
  }, void 0, false);
  return /*#__PURE__*/_jsxDEV("div", {
    children: [/*#__PURE__*/_jsxDEV("div", {
      className: "stats-grid",
      style: {
        marginBottom: 20
      },
      children: [{
        rol: 'superadmin',
        count: usuarios.filter(u => u.rol === 'superadmin').length
      }, {
        rol: 'admin',
        count: usuarios.filter(u => u.rol === 'admin').length
      }, {
        rol: 'cajero',
        count: usuarios.filter(u => u.cajero || u.rol === 'cajero').length
      }, {
        rol: 'familia',
        count: usuarios.filter(u => u.rol === 'familia').length
      }, {
        label: 'Total activos',
        count: usuarios.filter(u => u.activo !== false).length,
        icon: 'check',
        color: 'var(--green)',
        bg: 'var(--green-glow)'
      }].map((s, i) => {
        const info = s.rol ? ROL_INFO[s.rol] : null;
        return /*#__PURE__*/_jsxDEV("div", {
          className: "stat-card",
          style: {
            cursor: 'pointer',
            border: filtroRol === s.rol ? `1px solid ${info?.color || 'transparent'}` : '1px solid transparent'
          },
          onClick: () => setFiltroRol(s.rol || 'todos'),
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "stat-icon",
            style: {
              background: info?.bg || s.bg,
              color: info?.color
            },
            children: info?.icon || s.icon
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "stat-label",
            children: info?.label || s.label
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "stat-value",
            style: {
              fontSize: 22
            },
            children: s.count
          }, void 0, false)]
        }, i, true);
      })
    }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
      className: "card",
      children: [/*#__PURE__*/_jsxDEV("div", {
        className: "card-header",
        children: [/*#__PURE__*/_jsxDEV("div", {
          children: [/*#__PURE__*/_jsxDEV("div", {
            className: "card-title",
            children: "Usuarios del sistema"
          }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
            className: "card-sub",
            children: [esSuper ? 'Todas las escuelas' : `Escuela: ${nombreEscuela(user.escuela_id)}`, ' · ', lista.length, " usuario", lista.length !== 1 ? 's' : '']
          }, void 0, true)]
        }, void 0, true), rolesCreables.length > 0 && /*#__PURE__*/_jsxDEV("button", {
          className: "btn btn-primary",
          onClick: abrirCrear,
          children: "+ Nuevo usuario"
        }, void 0, false)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        style: {
          display: 'flex',
          gap: 8,
          marginBottom: 14,
          flexWrap: 'wrap',
          alignItems: 'center'
        },
        children: [['todos', 'superadmin', 'admin', 'cajero', 'familia'].map(r => /*#__PURE__*/_jsxDEV("button", {
          className: `badge ${filtroRol === r ? ROL_INFO[r]?.badge || 'badge-blue' : 'badge-gray'}`,
          style: {
            cursor: 'pointer',
            padding: '5px 12px',
            fontSize: 12,
            border: filtroRol === r ? `1px solid ${ROL_INFO[r]?.color || 'currentColor'}` : '1px solid transparent',
            background: filtroRol === r ? ROL_INFO[r]?.bg : ''
          },
          onClick: () => setFiltroRol(r),
          children: r === 'todos' ? 'Todos' : `${ROL_INFO[r]?.icon} ${ROL_INFO[r]?.label}`
        }, r, false)), /*#__PURE__*/_jsxDEV("div", {
          className: "search-bar",
          style: {
            marginLeft: 'auto',
            minWidth: 220
          },
          children: [/*#__PURE__*/_jsxDEV("span", {
            className: "search-icon",
            children: /*#__PURE__*/_jsxDEV(Icon, {
              name: "search",
              size: 15,
              color: "currentColor"
            }, void 0, false)
          }, void 0, false), /*#__PURE__*/_jsxDEV("input", {
            placeholder: "Buscar usuario…",
            value: q,
            onChange: e => setQ(e.target.value)
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true), /*#__PURE__*/_jsxDEV("div", {
        className: "table-wrap",
        children: /*#__PURE__*/_jsxDEV("table", {
          children: [/*#__PURE__*/_jsxDEV("thead", {
            children: /*#__PURE__*/_jsxDEV("tr", {
              children: [/*#__PURE__*/_jsxDEV("th", {
                children: "Usuario"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Rol"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Vínculo / Escuela"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Creado por"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Alta"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Estado"
              }, void 0, false), /*#__PURE__*/_jsxDEV("th", {
                children: "Acciones"
              }, void 0, false)]
            }, void 0, true)
          }, void 0, false), /*#__PURE__*/_jsxDEV("tbody", {
            children: [lista.length === 0 && /*#__PURE__*/_jsxDEV("tr", {
              children: /*#__PURE__*/_jsxDEV("td", {
                colSpan: 7,
                children: /*#__PURE__*/_jsxDEV("div", {
                  className: "empty-state",
                  children: [/*#__PURE__*/_jsxDEV("div", {
                    className: "empty-icon",
                    children: /*#__PURE__*/_jsxDEV(Icon, {
                      name: "alumnos",
                      size: 36,
                      color: "currentColor"
                    }, void 0, false)
                  }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                    className: "empty-text",
                    children: "Sin usuarios en este filtro"
                  }, void 0, false)]
                }, void 0, true)
              }, void 0, false)
            }, void 0, false), lista.map(u => {
              const info = ROL_INFO[u.rol];
              const puedeAcc = puedeEditar(u);
              return /*#__PURE__*/_jsxDEV("tr", {
                children: [/*#__PURE__*/_jsxDEV("td", {
                  children: /*#__PURE__*/_jsxDEV("div", {
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10
                    },
                    children: [/*#__PURE__*/_jsxDEV("div", {
                      className: "avatar",
                      style: {
                        width: 34,
                        height: 34,
                        fontSize: 12,
                        flexShrink: 0,
                        opacity: u.activo === false ? .4 : 1,
                        background: info?.bg || 'var(--glass)',
                        color: info?.color || 'var(--ink)'
                      },
                      children: u.avatar || u.nombre.charAt(0).toUpperCase()
                    }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                      style: {
                        minWidth: 0
                      },
                      children: [/*#__PURE__*/_jsxDEV("div", {
                        style: {
                          fontWeight: 500,
                          fontSize: 13,
                          color: 'var(--ink)',
                          opacity: u.activo === false ? .5 : 1
                        },
                        children: u.nombre
                      }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                        style: {
                          fontSize: 11,
                          color: 'var(--ink-4)'
                        },
                        children: u.email
                      }, void 0, false)]
                    }, void 0, true)]
                  }, void 0, true)
                }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                  children: /*#__PURE__*/_jsxDEV("span", {
                    className: `badge ${info?.badge || 'badge-gray'}`,
                    children: [info?.icon, " ", info?.label]
                  }, void 0, true)
                }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                  children: u.rol === 'familia' ? /*#__PURE__*/_jsxDEV("div", {
                    style: {
                      fontSize: 12,
                      color: 'var(--ink-2)'
                    },
                    children: [/*#__PURE__*/_jsxDEV(Icon, {
                      name: "home",
                      size: 13,
                      color: "var(--purple)"
                    }, void 0, false), " ", /*#__PURE__*/_jsxDEV("strong", {
                      style: {
                        color: 'var(--purple)'
                      },
                      children: obtenerNombreFamilia(u.familia_id)
                    }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
                      style: {
                        fontSize: 10,
                        color: 'var(--ink-4)',
                        marginTop: 2
                      },
                      children: [emojiEscuela(u.escuela_id), " ", nombreEscuela(u.escuela_id)]
                    }, void 0, true)]
                  }, void 0, true) : u.escuela_id ? /*#__PURE__*/_jsxDEV("span", {
                    style: {
                      fontSize: 12,
                      color: 'var(--ink-2)'
                    },
                    children: [emojiEscuela(u.escuela_id), " ", nombreEscuela(u.escuela_id)]
                  }, void 0, true) : /*#__PURE__*/_jsxDEV("span", {
                    style: {
                      fontSize: 12,
                      color: 'var(--ink-4)'
                    },
                    children: "Global"
                  }, void 0, false)
                }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                  children: /*#__PURE__*/_jsxDEV("span", {
                    style: {
                      fontSize: 12,
                      color: 'var(--ink-3)'
                    },
                    children: u.creado_por === null ? '⭐ Sistema' : creadorNombre(u.creado_por)
                  }, void 0, false)
                }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                  style: {
                    fontSize: 12,
                    color: 'var(--ink-3)',
                    fontFamily: 'var(--mono)'
                  },
                  children: u.fecha_alta || '—'
                }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                  children: u.activo === false ? /*#__PURE__*/_jsxDEV("span", {
                    className: "badge badge-red",
                    children: "Inactivo"
                  }, void 0, false) : /*#__PURE__*/_jsxDEV("span", {
                    className: "badge badge-green",
                    children: "Activo"
                  }, void 0, false)
                }, void 0, false), /*#__PURE__*/_jsxDEV("td", {
                  children: /*#__PURE__*/_jsxDEV("div", {
                    style: {
                      display: 'flex',
                      gap: 5
                    },
                    children: [puedeAcc && /*#__PURE__*/_jsxDEV(_Fragment, {
                      children: [/*#__PURE__*/_jsxDEV("button", {
                        className: "btn btn-ghost btn-sm",
                        onClick: () => abrirEditar(u),
                        title: "Editar",
                        children: /*#__PURE__*/_jsxDEV(Icon, {
                          name: "edit",
                          size: 14,
                          color: "currentColor"
                        }, void 0, false)
                      }, void 0, false), !u.es_semilla && /*#__PURE__*/_jsxDEV("button", {
                        className: "btn btn-ghost btn-sm",
                        onClick: () => setConfirm({
                          tipo: 'toggle',
                          userId: u.id
                        }),
                        title: u.activo === false ? 'Activar' : 'Desactivar',
                        children: u.activo === false ? /*#__PURE__*/_jsxDEV(Icon, {
                          name: "eyeOff",
                          size: 14,
                          color: "currentColor"
                        }, void 0, false) : /*#__PURE__*/_jsxDEV(Icon, {
                          name: "shield",
                          size: 14,
                          color: "currentColor"
                        }, void 0, false)
                      }, void 0, false), !u.es_semilla && (u.creado_por === user.id || esSuper) && /*#__PURE__*/_jsxDEV("button", {
                        className: "btn btn-ghost btn-sm",
                        onClick: () => setConfirm({
                          tipo: 'eliminar',
                          userId: u.id
                        }),
                        title: "Eliminar",
                        children: /*#__PURE__*/_jsxDEV(Icon, {
                          name: "trash",
                          size: 14,
                          color: "currentColor"
                        }, void 0, false)
                      }, void 0, false)]
                    }, void 0, true), !puedeAcc && /*#__PURE__*/_jsxDEV("span", {
                      style: {
                        fontSize: 11,
                        color: 'var(--ink-4)',
                        padding: '0 4px'
                      },
                      children: "—"
                    }, void 0, false)]
                  }, void 0, true)
                }, void 0, false)]
              }, u.id, true);
            })]
          }, void 0, true)]
        }, void 0, true)
      }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
        style: {
          marginTop: 20,
          padding: '14px 16px',
          background: 'var(--glass-light)',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          gap: 24,
          flexWrap: 'wrap',
          alignItems: 'flex-start'
        },
        children: [/*#__PURE__*/_jsxDEV("div", {
          style: {
            fontSize: 11,
            color: 'var(--ink-4)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '.4px',
            marginBottom: 6,
            flexBasis: '100%'
          },
          children: "Jerarquía de permisos y roles autorizados"
        }, void 0, false), [{
          rol: 'superadmin',
          desc: 'Crea admins, cajeros y familias · Acceso global administrativo completo.'
        }, {
          rol: 'admin',
          desc: 'Gestiona cajeros y familias asignados a su mismo plantel escolar.'
        }, {
          rol: 'cajero',
          desc: 'Acceso operativo exclusivo a Caja, cobros, e impresión de tickets.'
        }, {
          rol: 'familia',
          desc: 'Portal Autogestionable. Consulta estados de cuenta dinámicos y realiza pagos en línea.'
        }].map(item => /*#__PURE__*/_jsxDEV("div", {
          style: {
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            flex: '1 1 220px'
          },
          children: [/*#__PURE__*/_jsxDEV("span", {
            className: `badge ${ROL_INFO[item.rol].badge}`,
            style: {
              flexShrink: 0
            },
            children: [ROL_INFO[item.rol].icon, " ", ROL_INFO[item.rol].label]
          }, void 0, true), /*#__PURE__*/_jsxDEV("span", {
            style: {
              fontSize: 11.5,
              color: 'var(--ink-3)',
              lineHeight: 1.5
            },
            children: item.desc
          }, void 0, false)]
        }, item.rol, true))]
      }, void 0, true)]
    }, void 0, true), modal === 'crear' && /*#__PURE__*/_jsxDEV(FormModal, {
      titulo: "Nuevo usuario del sistema",
      onGuardar: guardarNuevo
    }, void 0, false), modal === 'editar' && /*#__PURE__*/_jsxDEV(FormModal, {
      titulo: "Editar credenciales de usuario",
      onGuardar: guardarEdicion
    }, void 0, false), confirm && /*#__PURE__*/_jsxDEV("div", {
      className: "modal-backdrop",
      onClick: e => e.target === e.currentTarget && setConfirm(null),
      children: /*#__PURE__*/_jsxDEV("div", {
        className: "modal",
        style: {
          maxWidth: 380
        },
        children: [/*#__PURE__*/_jsxDEV("div", {
          className: "modal-header",
          children: /*#__PURE__*/_jsxDEV("div", {
            className: "modal-title",
            children: confirm.tipo === 'toggle' ? 'Cambiar estado' : 'Eliminar usuario'
          }, void 0, false)
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-body",
          children: /*#__PURE__*/_jsxDEV("p", {
            style: {
              fontSize: 13,
              color: 'var(--ink-2)',
              lineHeight: 1.6
            },
            children: confirm.tipo === 'toggle' ? `¿Seguro que quieres ${usuarios.find(u => u.id === confirm.userId)?.activo === false ? 'activar' : 'desactivar'} a ${usuarios.find(u => u.id === confirm.userId)?.nombre}?` : `¿Eliminar permanentemente a ${usuarios.find(u => u.id === confirm.userId)?.nombre}? Esta acción no se puede revertir del sistema.`
          }, void 0, false)
        }, void 0, false), /*#__PURE__*/_jsxDEV("div", {
          className: "modal-footer",
          children: [/*#__PURE__*/_jsxDEV("button", {
            className: "btn btn-secondary",
            onClick: () => setConfirm(null),
            children: "Cancelar"
          }, void 0, false), /*#__PURE__*/_jsxDEV("button", {
            className: `btn ${confirm.tipo === 'eliminar' ? 'btn-danger' : 'btn-primary'}`,
            onClick: confirmarAccion,
            children: confirm.tipo === 'toggle' ? 'Confirmar' : 'Eliminar'
          }, void 0, false)]
        }, void 0, true)]
      }, void 0, true)
    }, void 0, false)]
  }, void 0, true);
}