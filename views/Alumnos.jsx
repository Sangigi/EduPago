/* views/Alumnos.jsx — Renombrado de Clientes, con soporte de familia */
function Alumnos({ data, setData, escuela_id }) {
  const { useState } = React;
  const EMPTY = { tipo:'alumno', nombre:'', grado:'', matricula:'', curp:'', email:'', tel:'', familia_id:null };
  const [modal, setModal] = useState(null);
  const [form, setForm]   = useState(EMPTY);
  const [q, setQ]         = useState('');

  const lista = data.clientes.filter(c =>
    !q || c.nombre.toLowerCase().includes(q.toLowerCase()) ||
    (c.matricula && c.matricula.toLowerCase().includes(q.toLowerCase())) ||
    c.email.toLowerCase().includes(q.toLowerCase())
  );

  const guardar = () => {
    if (!form.nombre) return;
    let newData;
    if (form.id) {
      newData = ClienteController.editar(data, form);
    } else {
      newData = ClienteController.agregar(data, form, escuela_id);
    }
    setData(newData);
    AppModel.save(newData);
    setModal(null);
    setForm(EMPTY);
  };

  const toggle = id => {
    const newData = ClienteController.toggleActivo(data, id);
    setData(newData);
    AppModel.save(newData);
  };

  const familiaDeAlumno = fid => fid ? data.familias.find(f=>f.id===fid)?.nombre : null;

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
            <span className="search-icon">🔍</span>
            <input placeholder="Buscar por nombre, matrícula o correo…" value={q} onChange={e=>setQ(e.target.value)}/>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th><th>Matrícula</th><th>Grado</th><th>Familia</th>
                <th>Correo</th><th>Saldo pendiente</th><th>Estado</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 && (
                <tr><td colSpan={8}><div className="empty-state"><div className="empty-icon">🎒</div><div className="empty-text">Sin alumnos</div></div></td></tr>
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
                      ? <span style={{fontSize:12, color:'var(--ink-2)'}}>👨‍👩‍👧 {familiaDeAlumno(c.familia_id)?.split(' ').slice(1).join(' ') || '—'}</span>
                      : <span style={{fontSize:12, color:'var(--ink-4)'}}>—</span>
                    }
                  </td>
                  <td style={{color:'var(--ink-3)', fontSize:12}}>{c.email}</td>
                  <td>
                    {c.saldo_pendiente > 0
                      ? <span style={{color:'var(--red)', fontFamily:'var(--mono)', fontWeight:600, fontSize:13}}>{fmt(c.saldo_pendiente)}</span>
                      : <span style={{color:'var(--green)', fontSize:12}}>✓ Al corriente</span>}
                  </td>
                  <td>{c.activo ? <span className="badge badge-green">Activo</span> : <span className="badge badge-gray">Inactivo</span>}</td>
                  <td>
                    <div style={{display:'flex', gap:5}}>
                      <button className="btn btn-ghost btn-sm" onClick={()=>{setForm({...c});setModal('form');}}>✏️</button>
                      <button className="btn btn-ghost btn-sm" onClick={()=>toggle(c.id)}>{c.activo?'🔒':'🔓'}</button>
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
              <button className="btn btn-ghost btn-sm" onClick={()=>setModal(null)}>✕</button>
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
