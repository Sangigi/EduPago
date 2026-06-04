/* views/Usuarios.jsx — Gestión dinámica de usuarios con jerarquía de roles */
function Usuarios({ user, data }) {
  const { useState, useEffect } = React;

  const EMPTY_FORM = {
    nombre: '', email: '', password: '', password2: '',
    rol: '', escuela_id: '', 
  };

  const [usuarios, setUsuarios]   = useState([]);
  const [modal, setModal]         = useState(null); // null | 'crear' | 'editar' | 'detalle'
  const [form, setForm]           = useState(EMPTY_FORM);
  const [errForm, setErrForm]     = useState('');
  const [filtroRol, setFiltroRol] = useState('todos');
  const [q, setQ]                 = useState('');
  const [confirm, setConfirm]     = useState(null); // { tipo, userId }

  const esSuper = AuthController.isSuperAdmin(user);

  const cargarUsuarios = () => setUsuarios(AuthController.getUsuarios(user));
  useEffect(() => { cargarUsuarios(); }, []);

  const rolesCreables = AuthController.rolesQueПuedeCriar(user);
  const escuelasDisp  = AuthController.escuelasDisponibles(user, data.escuelas);

  // Escuela de un usuario
  const nombreEscuela = eid => data.escuelas.find(e => e.id === eid)?.nombre || '—';
  const emojiEscuela  = eid => data.escuelas.find(e => e.id === eid)?.logo_emoji || '🏫';
  const creadorNombre = cid => {
    const u = usuarios.find(u => u.id === cid);
    return u ? u.nombre : cid === null ? 'Sistema' : `#${cid}`;
  };

  // Filtrado
  const lista = usuarios.filter(u => {
    if (filtroRol !== 'todos' && u.rol !== filtroRol) return false;
    if (q) {
      const busq = q.toLowerCase();
      return u.nombre.toLowerCase().includes(busq) ||
             u.email.toLowerCase().includes(busq);
    }
    return true;
  });

  const ROL_INFO = {
    superadmin: { label: 'Super Admin', icon: '👑', color: 'var(--amber)',  bg: 'var(--amber-glow)',  badge: 'badge-amber' },
    admin:      { label: 'Admin',       icon: '🏫', color: 'var(--accent)', bg: 'var(--accent-glow)', badge: 'badge-blue'  },
    cajero:     { label: 'Cajero',      icon: '🧾', color: 'var(--green)',  bg: 'var(--green-glow)',  badge: 'badge-green' },
  };

  // ── Crear usuario ──────────────────────────────────────────────────────────
  const abrirCrear = () => {
    setForm({
      ...EMPTY_FORM,
      rol:        rolesCreables[0] || '',
      escuela_id: user.escuela_id || '',
    });
    setErrForm('');
    setModal('crear');
  };

  const guardarNuevo = () => {
    setErrForm('');
    if (!form.nombre || !form.email || !form.password || !form.rol) {
      return setErrForm('Completa todos los campos obligatorios.');
    }
    if (form.password !== form.password2) {
      return setErrForm('Las contraseñas no coinciden.');
    }
    if (form.password.length < 6) {
      return setErrForm('La contraseña debe tener al menos 6 caracteres.');
    }
    const result = AuthController.crearUsuario(user, {
      ...form,
      escuela_id: form.escuela_id ? parseInt(form.escuela_id) : null,
    }, data.escuelas);
    if (!result.ok) return setErrForm(result.error);
    cargarUsuarios();
    setModal(null);
  };

  // ── Editar usuario ─────────────────────────────────────────────────────────
  const abrirEditar = u => {
    setForm({
      id:         u.id,
      nombre:     u.nombre,
      email:      u.email,
      password:   '',
      password2:  '',
      rol:        u.rol,
      escuela_id: u.escuela_id || '',
    });
    setErrForm('');
    setModal('editar');
  };

  const guardarEdicion = () => {
    setErrForm('');
    if (!form.nombre || !form.email) return setErrForm('Nombre y correo son obligatorios.');
    if (form.password && form.password !== form.password2) return setErrForm('Las contraseñas no coinciden.');
    if (form.password && form.password.length < 6) return setErrForm('Contraseña mínimo 6 caracteres.');
    const result = AuthController.editarUsuario(user, {
      ...form,
      escuela_id: form.escuela_id ? parseInt(form.escuela_id) : null,
    });
    if (!result.ok) return setErrForm(result.error);
    cargarUsuarios();
    setModal(null);
  };

  // ── Toggle / eliminar ──────────────────────────────────────────────────────
  const confirmarAccion = () => {
    if (!confirm) return;
    if (confirm.tipo === 'toggle') AuthController.toggleUsuario(user, confirm.userId);
    if (confirm.tipo === 'eliminar') AuthController.eliminarUsuario(user, confirm.userId);
    cargarUsuarios();
    setConfirm(null);
  };

  // Puede este usuario editar al objetivo?
  const puedeEditar = objetivo => {
    if (!objetivo) return false;
    if (esSuper) return true;
    if (user.rol === 'admin' && objetivo.rol === 'cajero' && objetivo.escuela_id === user.escuela_id) return true;
    return false;
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const FormModal = ({ titulo, onGuardar }) => (
    <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setModal(null)}>
      <div className="modal modal-lg">
        <div className="modal-header">
          <div className="modal-title">{titulo}</div>
          <button className="btn btn-ghost btn-sm" onClick={()=>setModal(null)}>✕</button>
        </div>
        <div className="modal-body">
          {errForm && (
            <div style={{
              marginBottom:14, padding:'10px 14px',
              background:'var(--red-glow)', border:'1px solid var(--red)',
              borderRadius:'var(--radius-sm)', fontSize:13, color:'var(--red)'
            }}>⚠ {errForm}</div>
          )}

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
            <div className="form-group" style={{gridColumn:'1/-1'}}>
              <label className="form-label">Nombre completo *</label>
              <input className="form-input" placeholder="Nombre del usuario"
                value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))}/>
            </div>

            <div className="form-group">
              <label className="form-label">Correo electrónico *</label>
              <input className="form-input" type="email" placeholder="usuario@escuela.mx"
                value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/>
            </div>

            <div className="form-group">
              <label className="form-label">Rol *</label>
              <select className="form-select" value={form.rol}
                onChange={e=>setForm(f=>({...f,rol:e.target.value}))}
                disabled={modal==='editar'}>
                <option value="">Seleccionar rol…</option>
                {rolesCreables.map(r=>(
                  <option key={r} value={r}>{ROL_INFO[r]?.icon} {ROL_INFO[r]?.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Escuela asignada{form.rol==='superadmin'?' (ninguna)':' *'}</label>
              <select className="form-select" value={form.escuela_id}
                onChange={e=>setForm(f=>({...f,escuela_id:e.target.value}))}
                disabled={user.rol==='admin'}>
                {esSuper && form.rol !== 'superadmin' && <option value="">Sin escuela</option>}
                {escuelasDisp.map(e=>(
                  <option key={e.id} value={e.id}>{e.logo_emoji} {e.nombre}</option>
                ))}
              </select>
              {user.rol==='admin' && (
                <div style={{fontSize:11,color:'var(--ink-4)',marginTop:4}}>
                  Los cajeros se asignan automáticamente a tu escuela
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">{modal==='editar'?'Nueva contraseña (dejar vacío = no cambiar)':'Contraseña *'}</label>
              <input className="form-input" type="password"
                placeholder={modal==='editar'?'••••••• (opcional)':'Mínimo 6 caracteres'}
                value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))}/>
            </div>

            <div className="form-group">
              <label className="form-label">Confirmar contraseña{modal==='editar'?' (si cambia)':' *'}</label>
              <input className="form-input" type="password"
                placeholder="Repetir contraseña"
                value={form.password2} onChange={e=>setForm(f=>({...f,password2:e.target.value}))}/>
            </div>
          </div>

          {/* Vista previa de la tarjeta */}
          {form.nombre && (
            <div style={{
              marginTop:16, padding:'14px 16px',
              background:'var(--glass-light)', border:'1px solid var(--border-glow)',
              borderRadius:'var(--radius)', display:'flex', alignItems:'center', gap:14
            }}>
              <div className={`avatar ${form.rol==='superadmin'?'avatar-super':form.rol==='admin'?'avatar-admin':'avatar-cajero'}`}
                style={{width:42,height:42,fontSize:14}}>
                {form.nombre.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)}
              </div>
              <div>
                <div style={{fontWeight:600,fontSize:14,color:'var(--ink)'}}>{form.nombre || '—'}</div>
                <div style={{fontSize:12,color:'var(--ink-3)',marginTop:2}}>
                  {form.email || 'sin correo'} ·{' '}
                  {form.rol ? <span style={{color:ROL_INFO[form.rol]?.color}}>{ROL_INFO[form.rol]?.icon} {ROL_INFO[form.rol]?.label}</span> : 'sin rol'} ·{' '}
                  {form.escuela_id ? nombreEscuela(parseInt(form.escuela_id)) : 'sin escuela'}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
          <button className="btn btn-primary" onClick={onGuardar}>
            {modal==='crear' ? '+ Crear usuario' : '💾 Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {/* Header con stats */}
      <div className="stats-grid" style={{marginBottom:20}}>
        {[
          { rol:'superadmin', count: usuarios.filter(u=>u.rol==='superadmin').length },
          { rol:'admin',      count: usuarios.filter(u=>u.rol==='admin').length },
          { rol:'cajero',     count: usuarios.filter(u=>u.rol==='cajero').length },
          { label:'Total activos', count: usuarios.filter(u=>u.activo!==false).length, icon:'✅', color:'var(--green)', bg:'var(--green-glow)' },
        ].map((s,i) => {
          const info = s.rol ? ROL_INFO[s.rol] : null;
          return (
            <div key={i} className="stat-card" style={{cursor:'pointer'}}
              onClick={()=>setFiltroRol(s.rol||'todos')}>
              <div className="stat-icon" style={{background: info?.bg || s.bg}}>
                {info?.icon || s.icon}
              </div>
              <div className="stat-label">{info?.label || s.label}</div>
              <div className="stat-value" style={{fontSize:22}}>{s.count}</div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Usuarios del sistema</div>
            <div className="card-sub">
              {esSuper ? 'Todas las escuelas' : `Escuela: ${nombreEscuela(user.escuela_id)}`}
              {' · '}{lista.length} usuario{lista.length!==1?'s':''}
            </div>
          </div>
          {rolesCreables.length > 0 && (
            <button className="btn btn-primary" onClick={abrirCrear}>
              + Nuevo usuario
            </button>
          )}
        </div>

        {/* Filtros */}
        <div style={{display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center'}}>
          {['todos','superadmin','admin','cajero'].map(r => (
            <button key={r}
              className={`badge ${filtroRol===r?(ROL_INFO[r]?.badge||'badge-blue'):'badge-gray'}`}
              style={{cursor:'pointer',padding:'5px 12px',fontSize:12,
                border: filtroRol===r?'1px solid currentColor':'1px solid transparent'}}
              onClick={()=>setFiltroRol(r)}>
              {r==='todos' ? 'Todos' : `${ROL_INFO[r]?.icon} ${ROL_INFO[r]?.label}`}
            </button>
          ))}
          <div className="search-bar" style={{marginLeft:'auto', minWidth:220}}>
            <span className="search-icon">🔍</span>
            <input placeholder="Buscar usuario…" value={q} onChange={e=>setQ(e.target.value)}/>
          </div>
        </div>

        {/* Tabla */}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Escuela</th>
                <th>Creado por</th>
                <th>Alta</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 && (
                <tr><td colSpan={7}>
                  <div className="empty-state">
                    <div className="empty-icon">👤</div>
                    <div className="empty-text">Sin usuarios en este filtro</div>
                  </div>
                </td></tr>
              )}
              {lista.map(u => {
                const info = ROL_INFO[u.rol];
                const puedeAcc = puedeEditar(u);
                return (
                  <tr key={u.id}>
                    <td>
                      <div style={{display:'flex', alignItems:'center', gap:10}}>
                        <div className={`avatar ${u.rol==='superadmin'?'avatar-super':u.rol==='admin'?'avatar-admin':'avatar-cajero'}`}
                          style={{width:34, height:34, fontSize:12, flexShrink:0,
                            opacity: u.activo===false ? .4 : 1}}>
                          {u.avatar}
                        </div>
                        <div style={{minWidth:0}}>
                          <div style={{fontWeight:500, fontSize:13, color:'var(--ink)',
                            opacity: u.activo===false ? .5 : 1}}>
                            {u.nombre}
                          </div>
                          <div style={{fontSize:11, color:'var(--ink-4)'}}>{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${info?.badge||'badge-gray'}`}>
                        {info?.icon} {info?.label}
                      </span>
                    </td>
                    <td>
                      {u.escuela_id
                        ? <span style={{fontSize:12, color:'var(--ink-2)'}}>
                            {emojiEscuela(u.escuela_id)} {nombreEscuela(u.escuela_id)}
                          </span>
                        : <span style={{fontSize:12, color:'var(--ink-4)'}}>Global</span>
                      }
                    </td>
                    <td>
                      <span style={{fontSize:12, color:'var(--ink-3)'}}>
                        {u.creado_por === null ? '⭐ Sistema' : creadorNombre(u.creado_por)}
                      </span>
                    </td>
                    <td style={{fontSize:12, color:'var(--ink-3)', fontFamily:'var(--mono)'}}>{u.fecha_alta}</td>
                    <td>
                      {u.activo === false
                        ? <span className="badge badge-red">Inactivo</span>
                        : <span className="badge badge-green">Activo</span>
                      }
                    </td>
                    <td>
                      <div style={{display:'flex', gap:5}}>
                        {puedeAcc && (
                          <>
                            <button className="btn btn-ghost btn-sm"
                              onClick={()=>abrirEditar(u)} title="Editar">✏️</button>
                            {!u.es_semilla && (
                              <button className="btn btn-ghost btn-sm"
                                onClick={()=>setConfirm({tipo:'toggle',userId:u.id})}
                                title={u.activo===false?'Activar':'Desactivar'}>
                                {u.activo===false?'🔓':'🔒'}
                              </button>
                            )}
                            {!u.es_semilla && u.creado_por===user.id && (
                              <button className="btn btn-ghost btn-sm"
                                onClick={()=>setConfirm({tipo:'eliminar',userId:u.id})}
                                title="Eliminar">🗑</button>
                            )}
                          </>
                        )}
                        {!puedeAcc && (
                          <span style={{fontSize:11, color:'var(--ink-4)', padding:'0 4px'}}>—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Leyenda de jerarquía */}
        <div style={{
          marginTop:20, padding:'14px 16px',
          background:'var(--glass-light)', borderRadius:'var(--radius-sm)',
          display:'flex', gap:24, flexWrap:'wrap', alignItems:'flex-start'
        }}>
          <div style={{fontSize:11, color:'var(--ink-4)', fontWeight:600, textTransform:'uppercase', letterSpacing:'.4px', marginBottom:6, flexBasis:'100%'}}>
            Jerarquía de permisos
          </div>
          {[
            { rol:'superadmin', desc:'Crea admins y cajeros · Ve todas las escuelas · Gestiona escuelas' },
            { rol:'admin',      desc:'Crea cajeros de su escuela · Ve su escuela completa' },
            { rol:'cajero',     desc:'Solo caja y cobros de su escuela' },
          ].map(item => (
            <div key={item.rol} style={{display:'flex', alignItems:'flex-start', gap:8, flex:'1 1 200px'}}>
              <span className={`badge ${ROL_INFO[item.rol].badge}`} style={{flexShrink:0}}>
                {ROL_INFO[item.rol].icon} {ROL_INFO[item.rol].label}
              </span>
              <span style={{fontSize:11.5, color:'var(--ink-3)', lineHeight:1.5}}>{item.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Modales */}
      {modal === 'crear' && <FormModal titulo="Nuevo usuario" onGuardar={guardarNuevo}/>}
      {modal === 'editar' && <FormModal titulo="Editar usuario" onGuardar={guardarEdicion}/>}

      {/* Confirmación */}
      {confirm && (
        <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setConfirm(null)}>
          <div className="modal" style={{maxWidth:380}}>
            <div className="modal-header">
              <div className="modal-title">
                {confirm.tipo==='toggle' ? 'Cambiar estado' : '⚠ Eliminar usuario'}
              </div>
            </div>
            <div className="modal-body">
              <p style={{fontSize:13, color:'var(--ink-2)', lineHeight:1.6}}>
                {confirm.tipo==='toggle'
                  ? `¿Seguro que quieres ${usuarios.find(u=>u.id===confirm.userId)?.activo===false?'activar':'desactivar'} a ${usuarios.find(u=>u.id===confirm.userId)?.nombre}?`
                  : `¿Eliminar permanentemente a ${usuarios.find(u=>u.id===confirm.userId)?.nombre}? Esta acción no se puede deshacer.`
                }
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setConfirm(null)}>Cancelar</button>
              <button
                className={`btn ${confirm.tipo==='eliminar'?'btn-danger':'btn-primary'}`}
                onClick={confirmarAccion}>
                {confirm.tipo==='toggle' ? 'Confirmar' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
