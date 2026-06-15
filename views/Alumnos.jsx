/* views/Alumnos.jsx — Alumnos con CLABE SPEI individual por alumno */
function Alumnos({ data, setData, escuela_id }) {
  const { useState } = React;
  const EMPTY = { tipo:'alumno', nombre:'', grado:'', matricula:'', curp:'', email:'', tel:'', familia_id:null };
  const [modal, setModal]       = useState(null);
  const [form, setForm]         = useState(EMPTY);
  const [q, setQ]               = useState('');
  const [clabeLoadingId, setClabeLoadingId] = useState(null); // id del alumno cuya CLABE se está generando/regenerando

  const escuela = data.escuelas.find(e => e.id === escuela_id);

  const lista = data.clientes.filter(c =>
    !q || c.nombre.toLowerCase().includes(q.toLowerCase()) ||
    (c.matricula && c.matricula.toLowerCase().includes(q.toLowerCase())) ||
    c.email.toLowerCase().includes(q.toLowerCase())
  );

  // ── Genera (o regenera) la CLABE individual de un alumno vía Pagadetodo/STP ──
  // Se ejecuta justo después del alta y queda asignada hasta que el alumno
  // se da de baja (sale de la escuela).
  const generarClabe = async (alumnoActual, dataBase) => {
    setClabeLoadingId(alumnoActual.id);
    try {
      const res = await CobroController.generarClabeIndividual({
        alumno_id: alumnoActual.id,
        matricula: alumnoActual.matricula,
        nombre:    alumnoActual.nombre,
        email:     alumnoActual.email,
        escuela:   escuela?.nombre || '',
      });
      const conClabe = ClienteController.asignarClabe(dataBase, alumnoActual.id, res.clabe);
      setData(conClabe);
      AppModel.save(conClabe);
    } catch (e) {
      const conError = ClienteController.marcarClabeError(dataBase, alumnoActual.id);
      setData(conError);
      AppModel.save(conError);
    } finally {
      setClabeLoadingId(null);
    }
  };

  const guardar = async () => {
    if (!form.nombre) return;

    if (form.id) {
      // Edición: no se toca la CLABE individual ya asignada
      const newData = ClienteController.editar(data, form);
      setData(newData);
      AppModel.save(newData);
      setModal(null);
      setForm(EMPTY);
      return;
    }

    // Alta nueva: registrar alumno y, de inmediato, asignarle su CLABE SPEI individual
    const newData = ClienteController.agregar(data, form, escuela_id);
    const alumnoNuevo = newData.clientes[newData.clientes.length - 1];
    setData(newData);
    AppModel.save(newData);
    setModal(null);
    setForm(EMPTY);

    await generarClabe(alumnoNuevo, newData);
  };

  // ── Activar/Desactivar alumno ──────────────────────────────────────────────
  // Al desactivar (alumno que sale de la escuela), se libera su CLABE individual
  // en Pagadetodo/STP. Al reactivar (reingreso), queda pendiente de generar una
  // CLABE nueva, que se solicita de inmediato.
  const toggle = async (cliente) => {
    const eraActivo = cliente.activo;
    const newData = ClienteController.toggleActivo(data, cliente.id);
    setData(newData);
    AppModel.save(newData);

    if (eraActivo) {
      // Se dio de baja: liberar la CLABE que tenía asignada
      if (cliente.clabe_individual) {
        try {
          await CobroController.liberarClabeIndividual({ alumno_id: cliente.id, clabe: cliente.clabe_individual });
        } catch (e) { /* no bloquear el flujo de baja */ }
      }
    } else {
      // Reingreso: generar una CLABE nueva para el alumno
      const alumnoActualizado = newData.clientes.find(c => c.id === cliente.id);
      await generarClabe(alumnoActualizado, newData);
    }
  };

  // ── Regenerar CLABE manualmente (ej. tras un error en el alta) ──────────────
  const regenerarClabe = async (cliente) => {
    await generarClabe(cliente, data);
  };

  const familiaDeAlumno = fid => fid ? data.familias.find(f=>f.id===fid)?.nombre : null;

  const fmtCLABE = clabe => clabe ? clabe.match(/.{1,4}/g).join(' ') : '—';

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Alumnos</div>
            <div className="card-sub">{data.clientes.filter(c=>c.activo).length} activos de {data.clientes.length}</div>
          </div>
          <button className="btn btn-primary" onClick={()=>{setForm(EMPTY);setModal('form');}}>
            + Nuevo alumno
          </button>
        </div>

        <div style={{marginBottom:16}}>
          <div className="search-bar">
            <span className="search-icon"><Icon name="search" size={15} color="currentColor"/></span>
            <input placeholder="Buscar por nombre, matrícula o correo…" value={q} onChange={e=>setQ(e.target.value)}/>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th><th>Matrícula</th><th>Grado</th><th>Familia</th>
                <th>CLABE SPEI individual</th>
                <th>Saldo pendiente</th><th>Estado</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 && (
                <tr><td colSpan={8}><div className="empty-state"><div className="empty-icon"><Icon name="alumnos" size={36} color="currentColor"/></div><div className="empty-text">Sin alumnos</div></div></td></tr>
              )}
              {lista.map(c => (
                <tr key={c.id} style={{opacity:c.activo?1:.5}}>
                  <td>
                    <div style={{display:'flex', alignItems:'center', gap:10}}>
                      <div className="avatar avatar-admin" style={{width:30, height:30, fontSize:11}}>
                        {c.nombre.charAt(0)}
                      </div>
                      <span style={{fontWeight:500}}>{c.nombre}</span>
                    </div>
                  </td>
                  <td><span style={{fontFamily:'var(--mono)', fontSize:12}}>{c.matricula || '—'}</span></td>
                  <td style={{color:'var(--ink-3)', fontSize:12}}>{c.grado || '—'}</td>
                  <td>
                    {c.familia_id
                      ? <span style={{fontSize:12, color:'var(--ink-2)'}}><Icon name="familias" size={14} color="currentColor"/> {familiaDeAlumno(c.familia_id)?.split(' ').slice(1).join(' ') || '—'}</span>
                      : <span style={{fontSize:12, color:'var(--ink-4)'}}>—</span>
                    }
                  </td>
                  <td>
                    {clabeLoadingId === c.id ? (
                      <span style={{display:'flex',alignItems:'center',gap:6,fontSize:11.5,color:'var(--ink-3)'}}>
                        <span className="spinner" style={{width:12,height:12}}></span> Generando…
                      </span>
                    ) : c.clabe_individual_estado === 'activa' && c.clabe_individual ? (
                      <span style={{fontFamily:'var(--mono)', fontSize:11.5, color:'var(--ink-2)', letterSpacing:.5}} title={`Asignada: ${c.clabe_individual_fecha||''}`}>
                        {fmtCLABE(c.clabe_individual)}
                      </span>
                    ) : c.clabe_individual_estado === 'liberada' ? (
                      <span style={{fontSize:11.5, color:'var(--ink-4)'}}>Liberada</span>
                    ) : c.clabe_individual_estado === 'error' ? (
                      <span style={{display:'flex',alignItems:'center',gap:6}}>
                        <span style={{fontSize:11.5, color:'var(--red)'}}><Icon name="warning" size={12} color="currentColor"/> Error</span>
                        <button className="btn btn-ghost btn-sm" style={{padding:'2px 6px', fontSize:11}} onClick={()=>regenerarClabe(c)}>Reintentar</button>
                      </span>
                    ) : c.activo ? (
                      <span style={{fontSize:11.5, color:'var(--ink-4)'}}>
                        Pendiente
                        <button className="btn btn-ghost btn-sm" style={{padding:'2px 6px', fontSize:11, marginLeft:6}} onClick={()=>regenerarClabe(c)}>Generar</button>
                      </span>
                    ) : (
                      <span style={{fontSize:11.5, color:'var(--ink-4)'}}>—</span>
                    )}
                  </td>
                  <td>
                    {c.saldo_pendiente > 0
                      ? <span style={{color:'var(--red)', fontFamily:'var(--mono)', fontWeight:600, fontSize:13}}>{fmt(c.saldo_pendiente)}</span>
                      : <span style={{color:'var(--green)', fontSize:12}}><Icon name="check" size={11} color="currentColor"/> Al corriente</span>}
                  </td>
                  <td>{c.activo ? <span className="badge badge-green">Activo</span> : <span className="badge badge-gray">Inactivo</span>}</td>
                  <td>
                    <div style={{display:'flex', gap:5}}>
                      <button className="btn btn-ghost btn-sm" onClick={()=>{setForm({...c});setModal('form');}} style={{display:'flex',alignItems:'center',justifyContent:'center'}}><Icon name="edit" size={14} color="currentColor"/></button>
                      <button className="btn btn-ghost btn-sm" onClick={()=>toggle(c)} title={c.activo ? 'Dar de baja (libera su CLABE)' : 'Reactivar (genera nueva CLABE)'}>{c.activo ? <Icon name="shield" size={14} color="currentColor"/> : <Icon name="eyeOff" size={14} color="currentColor"/>}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal === 'form' && (
        <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{form.id ? 'Editar' : 'Nuevo'} alumno</div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setModal(null)}><Icon name="close" size={16} color="currentColor"/></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Familia (opcional)</label>
                <select className="form-select" value={form.familia_id||''} onChange={e=>setForm(f=>({...f,familia_id:e.target.value?parseInt(e.target.value):null}))}>
                  <option value="">Sin familia asignada</option>
                  {data.familias.map(fam=>(
                    <option key={fam.id} value={fam.id}>{fam.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Nombre completo *</label>
                <input className="form-input" placeholder="Nombre completo" value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))}/>
              </div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                <div className="form-group">
                  <label className="form-label">Grado / Grupo</label>
                  <input className="form-input" placeholder="3° Primaria" value={form.grado} onChange={e=>setForm(f=>({...f,grado:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Matrícula</label>
                  <input className="form-input" placeholder="ITM-2024-001" value={form.matricula} onChange={e=>setForm(f=>({...f,matricula:e.target.value.toUpperCase()}))} style={{fontFamily:'var(--mono)'}}/>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">CURP</label>
                <input className="form-input" placeholder="CURP" value={form.curp} onChange={e=>setForm(f=>({...f,curp:e.target.value.toUpperCase()}))} style={{fontFamily:'var(--mono)'}}/>
              </div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                <div className="form-group">
                  <label className="form-label">Correo electrónico</label>
                  <input className="form-input" type="email" placeholder="correo@mail.com" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono</label>
                  <input className="form-input" placeholder="9991234567" value={form.tel} onChange={e=>setForm(f=>({...f,tel:e.target.value}))} style={{fontFamily:'var(--mono)'}}/>
                </div>
              </div>
              {!form.id && (
                <div style={{marginTop:6, padding:'8px 12px', background:'var(--accent-glow)', borderRadius:'var(--radius-sm)', fontSize:11.5, color:'var(--ink-2)', lineHeight:1.6}}>
                  <Icon name="bank" size={13} color="currentColor"/> Al guardar, se generará automáticamente una CLABE SPEI individual para este alumno.
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={!form.nombre}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
