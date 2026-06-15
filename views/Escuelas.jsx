/* views/Escuelas.jsx — Super Admin: gestión de escuelas */
function Escuelas({ data, setData, onSeleccionar }) {
  const { useState } = React;
  const EMPTY = { nombre:'', clave:'', rfc:'', telefono:'', email:'', direccion:'', logo_emoji:'', plan:'pro', clabe_fija:'', color:'#282d65', permite_planteles:false };
  const EMPTY_PLT = { nombre:'', direccion:'', responsable:'', tel:'' };
  const [modal, setModal]      = useState(null);
  const [form, setForm]        = useState(EMPTY);
  const [escuelaPltId, setEscuelaPltId] = useState(null); // escuela cuyo modal de planteles está abierto
  const [modalPlt, setModalPlt]         = useState(null); // null | 'list' | 'form'
  const [formPlt, setFormPlt]           = useState(EMPTY_PLT);

  const guardar = () => {
    if (!form.nombre || !form.clave) return;
    let newEscuelas;
    if (form.id) {
      newEscuelas = data.escuelas.map(e => e.id === form.id ? { ...e, ...form } : e);
    } else {
      const nueva = { ...form, id: AppModel.nextId(data.escuelas), activa: true, fecha_alta: new Date().toISOString().slice(0,10) };
      newEscuelas = [...data.escuelas, nueva];
    }
    const newData = { ...data, escuelas: newEscuelas };
    setData(newData);
    AppModel.save(newData);
    setModal(null);
    setForm(EMPTY);
  };

  const guardarPlantel = () => {
    if (!formPlt.nombre) return;
    const planteles = data.planteles || [];
    let newPlanteles;
    if (formPlt.id) {
      newPlanteles = planteles.map(p => p.id === formPlt.id ? { ...p, ...formPlt } : p);
    } else {
      const nuevo = { ...formPlt, id: AppModel.nextId(planteles), escuela_id: escuelaPltId, activo: true };
      newPlanteles = [...planteles, nuevo];
    }
    const newData = { ...data, planteles: newPlanteles };
    setData(newData);
    AppModel.save(newData);
    setFormPlt(EMPTY_PLT);
    setModalPlt('list');
  };

  const togglePlantel = pid => {
    const planteles = (data.planteles || []).map(p => p.id === pid ? { ...p, activo: !p.activo } : p);
    const newData = { ...data, planteles };
    setData(newData);
    AppModel.save(newData);
  };

  const toggleActiva = id => {
    const newData = { ...data, escuelas: data.escuelas.map(e => e.id === id ? { ...e, activa: !e.activa } : e) };
    setData(newData);
    AppModel.save(newData);
  };

  const metricasEscuela = id => {
    const cobros   = data.cobros.filter(c => c.escuela_id === id);
    const alumnos  = data.clientes.filter(c => c.escuela_id === id && c.activo);
    const pagados  = cobros.filter(c => c.estado === 'pagado').reduce((a,c)=>a+c.total,0);
    return { cobros: cobros.length, alumnos: alumnos.length, cobrado: pagados };
  };

  const PLANES = { free:'Gratuito', pro:'Pro', enterprise:'Enterprise' };
  const PLAN_COLORS = { free:'badge-gray', pro:'badge-blue', enterprise:'badge-purple' };

  return (
    <div>
      <div style={{marginBottom:20, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div>
          <h2 style={{fontSize:18, fontWeight:700, color:'var(--ink)'}}>Escuelas registradas</h2>
          <p style={{fontSize:13, color:'var(--ink-3)', marginTop:3}}>{data.escuelas.filter(e=>e.activa).length} activas</p>
        </div>
        <button className="btn btn-primary" onClick={()=>{setForm(EMPTY);setModal('form');}}>
          + Nueva escuela
        </button>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(340px, 1fr))', gap:18}}>
        {data.escuelas.map(esc => {
          const m = metricasEscuela(esc.id);
          return (
            <div key={esc.id} className="card" style={{
              borderLeft: `4px solid ${esc.color}`,
              opacity: esc.activa ? 1 : .55,
              transition:'all .2s'
            }}>
              <div style={{display:'flex', alignItems:'flex-start', gap:14, marginBottom:16}}>
                <div style={{
                  width:48, height:48, borderRadius:12, flexShrink:0,
                  background:`${esc.color}22`, border:`1px solid ${esc.color}44`,
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:24
                }}>{esc.logo_emoji}</div>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontWeight:700, fontSize:15, color:'var(--ink)', marginBottom:2}}>{esc.nombre}</div>
                  <div style={{display:'flex', gap:6, alignItems:'center', flexWrap:'wrap'}}>
                    <span style={{fontFamily:'var(--mono)', fontSize:11, color:'var(--ink-4)'}}>{esc.clave}</span>
                    <span className={`badge ${PLAN_COLORS[esc.plan]}`}>{PLANES[esc.plan]}</span>
                    {!esc.activa && <span className="badge badge-red">Inactiva</span>}
                  </div>
                </div>
              </div>

              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:16}}>
                {[
                  {label:'Alumnos', val:m.alumnos, icon:'alumnos'},
                  {label:'Cobros',  val:m.cobros,  icon:'cobros'},
                  {label:'Cobrado', val:fmt(m.cobrado).replace('MX$','$'), icon:'pay'},
                ].map(stat => (
                  <div key={stat.label} style={{
                    background:'var(--glass-light)', borderRadius:'var(--radius-sm)',
                    padding:'10px 10px', textAlign:'center'
                  }}>
                    <div style={{fontSize:16, marginBottom:4}}>{stat.icon}</div>
                    <div style={{fontSize:13, fontWeight:700, color:'var(--ink)', fontFamily:stat.label==='Cobrado'?'var(--mono)':undefined}}>{stat.val}</div>
                    <div style={{fontSize:10, color:'var(--ink-4)', textTransform:'uppercase', letterSpacing:'.4px'}}>{stat.label}</div>
                  </div>
                ))}
              </div>

              <div style={{fontSize:12, color:'var(--ink-3)', marginBottom:14}}>
                <div style={{display:'flex',alignItems:'center',gap:6}}><Icon name="emails" size={13} color="var(--ink-4)"/> {esc.email}</div>
                <div style={{marginTop:4,display:'flex',alignItems:'center',gap:6}}><Icon name="globe" size={13} color="var(--ink-4)"/> {esc.direccion}</div>
                {esc.clabe_fija && (
                  <div style={{marginTop:4, fontFamily:'var(--mono)', fontSize:11}}>
                    <span style={{display:'inline-flex',alignItems:'center',gap:5}}><Icon name="bank" size={13} color="var(--ink-4)"/> CLABE: {esc.clabe_fija}</span>
                  </div>
                )}
              </div>

              <div style={{display:'flex', gap:8}}>
                <button className="btn btn-primary btn-sm" style={{flex:1}} onClick={()=>onSeleccionar(esc.id)}>
                  Entrar →
                </button>
                {esc.permite_planteles && (
                  <button className="btn btn-secondary btn-sm" title="Gestionar planteles"
                    onClick={()=>{setEscuelaPltId(esc.id);setModalPlt('list');}}>
                    <Icon name="escuelas" size={14} color="currentColor"/>
                  </button>
                )}
                <button className="btn btn-secondary btn-sm" onClick={()=>{setForm({...esc});setModal('form');}} style={{display:'flex',alignItems:'center',justifyContent:'center'}}><Icon name="edit" size={14} color="currentColor"/></button>
                <button className="btn btn-secondary btn-sm" onClick={()=>toggleActiva(esc.id)}>
                  {esc.activa ? <Icon name="shield" size={14} color="currentColor"/> : <Icon name="eyeOff" size={14} color="currentColor"/>}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {modal === 'form' && (
        <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <div className="modal-title">{form.id ? 'Editar' : 'Nueva'} escuela</div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setModal(null)}><Icon name="close" size={16} color="currentColor"/></button>
            </div>
            <div className="modal-body">
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                <div className="form-group">
                  <label className="form-label">Nombre de la escuela *</label>
                  <input className="form-input" placeholder="Instituto Tecnológico Mérida" value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Clave / Abreviatura *</label>
                  <input className="form-input" placeholder="ITM" value={form.clave} onChange={e=>setForm(f=>({...f,clave:e.target.value.toUpperCase()}))} style={{fontFamily:'var(--mono)'}}/>
                </div>
                <div className="form-group">
                  <label className="form-label">RFC</label>
                  <input className="form-input" placeholder="ITM9301015XA" value={form.rfc} onChange={e=>setForm(f=>({...f,rfc:e.target.value.toUpperCase()}))} style={{fontFamily:'var(--mono)'}}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Plan</label>
                  <select className="form-select" value={form.plan} onChange={e=>setForm(f=>({...f,plan:e.target.value}))}>
                    <option value="free">Gratuito</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Email de contacto</label>
                  <input className="form-input" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono</label>
                  <input className="form-input" value={form.telefono} onChange={e=>setForm(f=>({...f,telefono:e.target.value}))} style={{fontFamily:'var(--mono)'}}/>
                </div>
                <div className="form-group" style={{gridColumn:'1/-1'}}>
                  <label className="form-label">CLABE fija SPEI (asignada por STP)</label>
                  <input className="form-input" placeholder="646180633010000055" value={form.clabe_fija} onChange={e=>setForm(f=>({...f,clabe_fija:e.target.value}))} style={{fontFamily:'var(--mono)'}}/>
                </div>
                <div className="form-group" style={{gridColumn:'1/-1'}}>
                  <label className="form-label">Dirección</label>
                  <input className="form-input" placeholder="Calle, colonia, ciudad, estado" value={form.direccion} onChange={e=>setForm(f=>({...f,direccion:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Emoji / Logo</label>
                  <input className="form-input" value={form.logo_emoji} onChange={e=>setForm(f=>({...f,logo_emoji:e.target.value}))} style={{fontSize:22}}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Color de acento</label>
                  <input type="color" value={form.color} onChange={e=>setForm(f=>({...f,color:e.target.value}))}
                    style={{width:'100%', height:42, border:'1px solid var(--border-glow)', borderRadius:'var(--radius)', cursor:'pointer', background:'transparent'}}/>
                </div>
                <div className="form-group" style={{gridColumn:'1/-1',display:'flex',alignItems:'center',gap:10}}>
                  <input type="checkbox" id="chk_planteles" checked={!!form.permite_planteles}
                    onChange={e=>setForm(f=>({...f,permite_planteles:e.target.checked}))}
                    style={{width:16,height:16,cursor:'pointer'}}/>
                  <label htmlFor="chk_planteles" className="form-label" style={{margin:0,cursor:'pointer'}}>
                    Esta escuela tiene múltiples planteles / sucursales
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={!form.nombre||!form.clave}>Guardar escuela</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Lista de planteles ══ */}
      {modalPlt === 'list' && escuelaPltId && (
        <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setModalPlt(null)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <div className="modal-title">
                <Icon name="escuelas" size={16} color="currentColor"/> Planteles — {data.escuelas.find(e=>e.id===escuelaPltId)?.nombre}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setModalPlt(null)}><Icon name="close" size={16} color="currentColor"/></button>
            </div>
            <div className="modal-body">
              {(data.planteles||[]).filter(p=>p.escuela_id===escuelaPltId).length === 0 && (
                <div className="empty-state">
                  <div className="empty-icon"><Icon name="escuelas" size={32} color="currentColor"/></div>
                  <div className="empty-text">Sin planteles registrados</div>
                </div>
              )}
              {(data.planteles||[]).filter(p=>p.escuela_id===escuelaPltId).map(plt => (
                <div key={plt.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid var(--glass-light)'}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:13,color:'var(--ink)',display:'flex',alignItems:'center',gap:8}}>
                      {plt.nombre}
                      {!plt.activo && <span className="badge badge-gray">Inactivo</span>}
                    </div>
                    <div style={{fontSize:11.5,color:'var(--ink-3)',marginTop:2}}>{plt.direccion}</div>
                    {plt.responsable && <div style={{fontSize:11,color:'var(--ink-4)',marginTop:1}}>Resp: {plt.responsable} · {plt.tel}</div>}
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={()=>{setFormPlt({...plt});setModalPlt('form');}}>
                    <Icon name="edit" size={13} color="currentColor"/>
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>togglePlantel(plt.id)}>
                    {plt.activo ? <Icon name="shield" size={13} color="currentColor"/> : <Icon name="eyeOff" size={13} color="currentColor"/>}
                  </button>
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setModalPlt(null)}>Cerrar</button>
              <button className="btn btn-primary" onClick={()=>{setFormPlt(EMPTY_PLT);setModalPlt('form');}}>
                + Nuevo plantel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: Formulario de plantel ══ */}
      {modalPlt === 'form' && (
        <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setModalPlt('list')}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{formPlt.id ? 'Editar plantel' : 'Nuevo plantel'}</div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setModalPlt('list')}><Icon name="close" size={16} color="currentColor"/></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Nombre del plantel *</label>
                <input className="form-input" placeholder="Ej: Campus Norte" value={formPlt.nombre} onChange={e=>setFormPlt(p=>({...p,nombre:e.target.value}))}/>
              </div>
              <div className="form-group">
                <label className="form-label">Dirección</label>
                <input className="form-input" placeholder="Calle, Número, Colonia, Ciudad" value={formPlt.direccion||''} onChange={e=>setFormPlt(p=>({...p,direccion:e.target.value}))}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div className="form-group">
                  <label className="form-label">Responsable</label>
                  <input className="form-input" placeholder="Nombre del director/coordinador" value={formPlt.responsable||''} onChange={e=>setFormPlt(p=>({...p,responsable:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono directo</label>
                  <input className="form-input" placeholder="9991234560" value={formPlt.tel||''} onChange={e=>setFormPlt(p=>({...p,tel:e.target.value}))} style={{fontFamily:'var(--mono)'}}/>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setModalPlt('list')}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarPlantel} disabled={!formPlt.nombre}>Guardar plantel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
