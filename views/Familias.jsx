/* views/Familias.jsx — Gestión de familias con hijos agrupados y CLABE SPEI individual */
function Familias({ data, setData, escuela_id }) {
  const { useState } = React;
  const EMPTY_FAM = {
    nombre:'', contacto:'', tel:'', email:'',
    // Datos fiscales de la familia (pre-llenan CFDI de todos sus hijos)
    rfc_factura:'', razon_social_factura:'', cp_factura:'',
    domicilio_factura:'', regimen_factura:'616', uso_cfdi_defecto:'D10'
  };
  const EMPTY_ALU = { tipo:'alumno', nombre:'', grado:'', matricula:'', curp:'', email:'', tel:'', familia_id:null };

  const [modal, setModal]         = useState(null); // null | 'familia' | 'alumno'
  const [formFam, setFormFam]     = useState(EMPTY_FAM);
  const [formAlu, setFormAlu]     = useState(EMPTY_ALU);
  const [expanded, setExpanded]   = useState({});
  const [q, setQ]                 = useState('');
  const [targetFamId, setTargetFamId] = useState(null);
  const [clabeLoadingId, setClabeLoadingId] = useState(null); // id del alumno cuya CLABE se está generando

  const escuela = data.escuelas.find(e => e.id === escuela_id);

  const familias = data.familias.filter(f =>
    !q || f.nombre.toLowerCase().includes(q.toLowerCase()) || f.contacto.toLowerCase().includes(q.toLowerCase())
  );

  const hijosDeFamily = fid => data.clientes.filter(c => c.familia_id === fid);
  const saldoFamily   = fid => hijosDeFamily(fid).reduce((a,c) => a + (c.saldo_pendiente||0), 0);

  const toggleExp = id => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const fmtCLABE = clabe => clabe ? clabe.match(/.{1,4}/g).join(' ') : '—';

  // ── Genera (o regenera) la CLABE individual de un alumno vía Pagadetodo/STP ──
  // Queda asignada al alumno hasta que se dé de baja (salga de la escuela).
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

  const regenerarClabe = async (cliente) => {
    await generarClabe(cliente, data);
  };

  // ── Activar/Desactivar hijo ────────────────────────────────────────────────
  // Al dar de baja (sale de la escuela) se libera su CLABE individual; al
  // reactivar (reingreso) se solicita una CLABE nueva de inmediato.
  const toggleHijo = async (hijo) => {
    const eraActivo = hijo.activo;
    const newData = ClienteController.toggleActivo(data, hijo.id);
    setData(newData);
    AppModel.save(newData);

    if (eraActivo) {
      if (hijo.clabe_individual) {
        try {
          await CobroController.liberarClabeIndividual({ alumno_id: hijo.id, clabe: hijo.clabe_individual });
        } catch (e) { /* no bloquear el flujo de baja */ }
      }
    } else {
      const alumnoActualizado = newData.clientes.find(c => c.id === hijo.id);
      await generarClabe(alumnoActualizado, newData);
    }
  };

  const guardarFam = () => {
    if (!formFam.nombre) return;
    let newData;
    if (formFam.id) {
      newData = ClienteController.editarFamilia(data, formFam);
    } else {
      newData = ClienteController.agregarFamilia(data, formFam, escuela_id);
    }
    setData(newData);
    AppModel.save(newData);
    setModal(null);
    setFormFam(EMPTY_FAM);
  };

  const guardarAlu = async () => {
    if (!formAlu.nombre) return;
    const aluConFam = { ...formAlu, familia_id: targetFamId };

    if (formAlu.id) {
      // Edición: no se toca la CLABE individual ya asignada
      const newData = ClienteController.editar(data, aluConFam);
      setData(newData);
      AppModel.save(newData);
      setModal(null);
      setFormAlu(EMPTY_ALU);
      setTargetFamId(null);
      return;
    }

    // Alta nueva (+ Añadir estudiante): registrar y asignar de inmediato su CLABE SPEI individual
    const newData = ClienteController.agregar(data, aluConFam, escuela_id);
    const alumnoNuevo = newData.clientes[newData.clientes.length - 1];
    setData(newData);
    AppModel.save(newData);
    setModal(null);
    setFormAlu(EMPTY_ALU);
    setTargetFamId(null);

    await generarClabe(alumnoNuevo, newData);
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Familias</div>
            <div className="card-sub">{data.familias.length} familias · {data.clientes.filter(c=>c.familia_id).length} alumnos agrupados</div>
          </div>
          <button className="btn btn-primary" onClick={()=>{setFormFam(EMPTY_FAM);setModal('familia');}}>
            + Nueva familia
          </button>
        </div>

        <div style={{marginBottom:16}}>
          <div className="search-bar">
            <span className="search-icon"><Icon name="search" size={15} color="currentColor"/></span>
            <input placeholder="Buscar familia…" value={q} onChange={e=>setQ(e.target.value)}/>
          </div>
        </div>

        {familias.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon"><Icon name="familias" size={36} color="currentColor"/></div>
            <div className="empty-text">Sin familias registradas</div>
            <div className="empty-sub">Las familias agrupan alumnos del mismo hogar</div>
          </div>
        )}

        {familias.map(fam => {
          const hijos  = hijosDeFamily(fam.id);
          const saldo  = saldoFamily(fam.id);
          const isOpen = expanded[fam.id];

          return (
            <div key={fam.id} style={{
              border:'1px solid var(--border-glow)', borderRadius:'var(--radius)',
              marginBottom:10, overflow:'hidden', transition:'all .2s'
            }}>
              {/* Header de la familia */}
              <div style={{
                display:'flex', alignItems:'center', gap:12,
                padding:'13px 16px', cursor:'pointer',
                background: isOpen ? 'var(--accent-glow)' : 'var(--glass-light)',
                borderBottom: isOpen ? '1px solid var(--border-glow)' : 'none',
                transition:'background .2s'
              }} onClick={()=>toggleExp(fam.id)}>
                <div style={{
                  width:40, height:40, borderRadius:10,
                  background:'var(--accent-glow)', border:'1px solid var(--border-active)',
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0
                }}><Icon name="familias" size={20} color="currentColor"/></div>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontWeight:600, fontSize:14, color:'var(--ink)'}}>{fam.nombre}</div>
                  <div style={{fontSize:12, color:'var(--ink-3)', marginTop:2}}>
                    {fam.contacto} · {fam.email}
                    {hijos.length > 0 && <span style={{marginLeft:8}}>· {hijos.length} alumno{hijos.length!==1?'s':''}</span>}
                  </div>
                </div>
                {saldo > 0 && (
                  <span style={{fontFamily:'var(--mono)', fontSize:13, fontWeight:700, color:'var(--amber)', flexShrink:0}}>
                    {fmt(saldo)} pendiente
                  </span>
                )}
                {saldo === 0 && hijos.length > 0 && (
                  <span className="badge badge-green" style={{flexShrink:0}}><Icon name="check" size={11} color="currentColor"/> Al corriente</span>
                )}
                <div style={{display:'flex', gap:6, flexShrink:0}}>
                  <button className="btn btn-ghost btn-sm" onClick={e=>{e.stopPropagation();setFormFam({...fam});setModal('familia');}} style={{display:'flex',alignItems:'center',justifyContent:'center'}}><Icon name="edit" size={14} color="currentColor"/></button>
                  <button className="btn btn-secondary btn-sm" onClick={e=>{e.stopPropagation();setTargetFamId(fam.id);setFormAlu({...EMPTY_ALU,familia_id:fam.id});setModal('alumno');}}>
                    + Añadir estudiante
                  </button>
                </div>
                <span style={{color:'var(--ink-4)', fontSize:18, flexShrink:0}}>{isOpen ? <Icon name="chevronDown" size={18} color="currentColor"/> : <Icon name="arrowRight" size={16} color="currentColor"/>}</span>
              </div>

              {/* Hijos de la familia */}
              {isOpen && (
                <div style={{padding:'0 16px'}}>
                  {hijos.length === 0 && (
                    <div style={{padding:'16px 0', textAlign:'center', color:'var(--ink-4)', fontSize:13}}>
                      Sin estudiantes agregados — haz clic en "+ Añadir estudiante"
                    </div>
                  )}
                  {hijos.map((hijo, i) => (
                    <div key={hijo.id} style={{
                      display:'flex', alignItems:'center', gap:12,
                      padding:'11px 0',
                      borderBottom: i < hijos.length - 1 ? '1px solid var(--glass-light)' : 'none'
                    }}>
                      <div style={{
                        width:32, height:32, borderRadius:8,
                        background:'var(--glass-light)', border:'1px solid var(--border-glow)',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:12, fontWeight:700, color:'var(--ink-3)', flexShrink:0
                      }}>{hijo.nombre.charAt(0)}</div>
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{fontSize:13, fontWeight:500, color:'var(--ink)', display:'flex', alignItems:'center', gap:8}}>
                          {hijo.nombre}
                          {!hijo.activo && <span className="badge badge-gray">Inactivo</span>}
                        </div>
                        <div style={{fontSize:11.5, color:'var(--ink-3)', marginTop:2}}>
                          {hijo.grado} · Mat: <span style={{fontFamily:'var(--mono)'}}>{hijo.matricula || '—'}</span>
                        </div>
                        <div style={{fontSize:11, color:'var(--ink-4)', marginTop:2, display:'flex', alignItems:'center', gap:6}}>
                          <Icon name="bank" size={11} color="currentColor"/>
                          {clabeLoadingId === hijo.id ? (
                            <span style={{display:'inline-flex',alignItems:'center',gap:5}}>
                              <span className="spinner" style={{width:10,height:10}}></span> Generando CLABE…
                            </span>
                          ) : hijo.clabe_individual_estado === 'activa' && hijo.clabe_individual ? (
                            <span style={{fontFamily:'var(--mono)', letterSpacing:.4}}>{fmtCLABE(hijo.clabe_individual)}</span>
                          ) : hijo.clabe_individual_estado === 'liberada' ? (
                            <span>CLABE liberada</span>
                          ) : hijo.clabe_individual_estado === 'error' ? (
                            <span style={{display:'inline-flex',alignItems:'center',gap:5,color:'var(--red)'}}>
                              Error al generar CLABE
                              <button className="btn btn-ghost btn-sm" style={{padding:'1px 6px', fontSize:10.5}} onClick={()=>regenerarClabe(hijo)}>Reintentar</button>
                            </span>
                          ) : hijo.activo ? (
                            <span style={{display:'inline-flex',alignItems:'center',gap:5}}>
                              CLABE pendiente
                              <button className="btn btn-ghost btn-sm" style={{padding:'1px 6px', fontSize:10.5}} onClick={()=>regenerarClabe(hijo)}>Generar</button>
                            </span>
                          ) : (
                            <span>Sin CLABE</span>
                          )}
                        </div>
                      </div>
                      {hijo.saldo_pendiente > 0
                        ? <span style={{fontFamily:'var(--mono)', fontSize:12, color:'var(--red)', fontWeight:600}}>{fmt(hijo.saldo_pendiente)}</span>
                        : <span style={{fontSize:12, color:'var(--green)', display:'inline-flex', alignItems:'center', gap:4}}><Icon name="check" size={11} color="currentColor"/> Al corriente</span>
                      }
                      <button className="btn btn-ghost btn-sm" onClick={()=>{
                        setFormAlu({...hijo}); setTargetFamId(hijo.familia_id); setModal('alumno');
                      }} style={{display:'flex',alignItems:'center',justifyContent:'center'}}><Icon name="edit" size={14} color="currentColor"/></button>
                      <button className="btn btn-ghost btn-sm" onClick={()=>toggleHijo(hijo)} title={hijo.activo ? 'Dar de baja (libera su CLABE)' : 'Reactivar (genera nueva CLABE)'} style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
                        {hijo.activo ? <Icon name="shield" size={14} color="currentColor"/> : <Icon name="eyeOff" size={14} color="currentColor"/>}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Alumnos sin familia */}
        {(() => {
          const sinFamilia = data.clientes.filter(c => !c.familia_id && c.activo);
          if (!sinFamilia.length) return null;
          return (
            <div style={{marginTop:24}}>
              <div style={{fontSize:11, color:'var(--ink-4)', fontWeight:600, textTransform:'uppercase', letterSpacing:'.5px', marginBottom:10}}>
                Alumnos sin familia asignada ({sinFamilia.length})
              </div>
              {sinFamilia.map(alu => (
                <div key={alu.id} style={{
                  display:'flex', alignItems:'center', gap:10, padding:'9px 12px',
                  background:'var(--glass-light)', borderRadius:'var(--radius-sm)',
                  marginBottom:6
                }}>
                  <div style={{width:30, height:30, borderRadius:7, background:'var(--glass-hover)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'var(--ink-3)', flexShrink:0}}>{alu.nombre.charAt(0)}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13, fontWeight:500}}>{alu.nombre}</div>
                    <div style={{fontSize:11.5, color:'var(--ink-3)'}}>{alu.grado} · {alu.matricula}</div>
                  </div>
                  {alu.saldo_pendiente > 0
                    ? <span style={{fontFamily:'var(--mono)', fontSize:12, color:'var(--red)'}}>{fmt(alu.saldo_pendiente)}</span>
                    : <span style={{fontSize:12, color:'var(--green)'}}><Icon name="check" size={11} color="currentColor"/></span>
                  }
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Modal: Nueva/editar familia */}
      {modal === 'familia' && (
        <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{formFam.id ? 'Editar' : 'Nueva'} familia</div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setModal(null)}><Icon name="close" size={16} color="currentColor"/></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Nombre de la familia *</label>
                <input className="form-input" placeholder="Ej: Familia García López" value={formFam.nombre} onChange={e=>setFormFam(f=>({...f,nombre:e.target.value}))}/>
              </div>
              <div className="form-group">
                <label className="form-label">Contacto principal</label>
                <input className="form-input" placeholder="Nombre del papá/mamá/tutor" value={formFam.contacto} onChange={e=>setFormFam(f=>({...f,contacto:e.target.value}))}/>
              </div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                <div className="form-group">
                  <label className="form-label">Teléfono</label>
                  <input className="form-input" placeholder="9991234567" value={formFam.tel} onChange={e=>setFormFam(f=>({...f,tel:e.target.value}))} style={{fontFamily:'var(--mono)'}}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Correo electrónico</label>
                  <input className="form-input" type="email" placeholder="familia@mail.com" value={formFam.email} onChange={e=>setFormFam(f=>({...f,email:e.target.value}))}/>
                </div>
              </div>

              {/* ── Datos fiscales de la familia ── */}
              <div style={{marginTop:18, paddingTop:16, borderTop:'1px solid var(--border-glow)'}}>
                <div style={{fontSize:11, color:'var(--ink-4)', fontWeight:600, textTransform:'uppercase', letterSpacing:'.4px', marginBottom:12}}>
                  Datos fiscales (para facturación CFDI)
                </div>
                <div style={{marginBottom:10, padding:'8px 12px', background:'var(--accent-glow)', borderRadius:'var(--radius-sm)', fontSize:11.5, color:'var(--ink-2)', lineHeight:1.6}}>
                  Al registrar estos datos, el formulario de CFDI se pre-llenará automáticamente para todos los hijos de esta familia.
                </div>
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                  <div className="form-group">
                    <label className="form-label">RFC del receptor</label>
                    <input className="form-input" placeholder="XAXX010101000"
                      value={formFam.rfc_factura||''}
                      onChange={e=>setFormFam(f=>({...f,rfc_factura:e.target.value.toUpperCase().replace(/\s/g,'')}))}
                      style={{fontFamily:'var(--mono)',letterSpacing:1}}/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Código Postal fiscal</label>
                    <input className="form-input" placeholder="Ej. 97000"
                      value={formFam.cp_factura||''}
                      onChange={e=>setFormFam(f=>({...f,cp_factura:e.target.value}))}
                      style={{fontFamily:'var(--mono)'}}/>
                  </div>
                  <div className="form-group" style={{gridColumn:'1/-1'}}>
                    <label className="form-label">Razón social</label>
                    <input className="form-input" placeholder="NOMBRE COMPLETO EN MAYÚSCULAS"
                      value={formFam.razon_social_factura||''}
                      onChange={e=>setFormFam(f=>({...f,razon_social_factura:e.target.value.toUpperCase()}))}/>
                  </div>
                  <div className="form-group" style={{gridColumn:'1/-1'}}>
                    <label className="form-label">Domicilio fiscal</label>
                    <input className="form-input" placeholder="Calle, Número, Colonia, Ciudad, Estado, CP"
                      value={formFam.domicilio_factura||''}
                      onChange={e=>setFormFam(f=>({...f,domicilio_factura:e.target.value}))}/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Régimen fiscal</label>
                    <select className="form-select" value={formFam.regimen_factura||'616'}
                      onChange={e=>setFormFam(f=>({...f,regimen_factura:e.target.value}))}>
                      <option value="616">616 — Sin obligaciones fiscales</option>
                      <option value="601">601 — General Personas Morales</option>
                      <option value="612">612 — Personas Físicas con Actividades Empresariales</option>
                      <option value="626">626 — RESICO</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Uso del CFDI por defecto</label>
                    <select className="form-select" value={formFam.uso_cfdi_defecto||'D10'}
                      onChange={e=>setFormFam(f=>({...f,uso_cfdi_defecto:e.target.value}))}>
                      <option value="D10">D10 — Servicios educativos</option>
                      <option value="G03">G03 — Gastos en general</option>
                      <option value="S01">S01 — Sin efectos fiscales</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarFam} disabled={!formFam.nombre}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Nuevo/editar alumno (dentro de familia) */}
      {modal === 'alumno' && (
        <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{formAlu.id ? 'Editar' : 'Agregar'} alumno</div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setModal(null)}><Icon name="close" size={16} color="currentColor"/></button>
            </div>
            <div className="modal-body">
              {targetFamId && (
                <div style={{marginBottom:14, padding:'8px 12px', background:'var(--accent-glow)', borderRadius:'var(--radius-sm)', fontSize:12, color:'var(--ink-2)'}}>
                  <span style={{display:"inline-flex",alignItems:"center",gap:6}}><Icon name="familias" size={14} color="currentColor"/> Familia:</span> <strong>{data.familias.find(f=>f.id===targetFamId)?.nombre}</strong>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Nombre completo *</label>
                <input className="form-input" placeholder="Nombre del alumno" value={formAlu.nombre} onChange={e=>setFormAlu(f=>({...f,nombre:e.target.value}))}/>
              </div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                <div className="form-group">
                  <label className="form-label">Grado / Grupo</label>
                  <input className="form-input" placeholder="3° Primaria" value={formAlu.grado} onChange={e=>setFormAlu(f=>({...f,grado:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Matrícula</label>
                  <input className="form-input" placeholder="ITM-2024-001" value={formAlu.matricula} onChange={e=>setFormAlu(f=>({...f,matricula:e.target.value.toUpperCase()}))} style={{fontFamily:'var(--mono)'}}/>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">CURP</label>
                <input className="form-input" placeholder="CURP" value={formAlu.curp} onChange={e=>setFormAlu(f=>({...f,curp:e.target.value.toUpperCase()}))} style={{fontFamily:'var(--mono)'}}/>
              </div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                <div className="form-group">
                  <label className="form-label">Correo</label>
                  <input className="form-input" type="email" value={formAlu.email} onChange={e=>setFormAlu(f=>({...f,email:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono</label>
                  <input className="form-input" value={formAlu.tel} onChange={e=>setFormAlu(f=>({...f,tel:e.target.value}))} style={{fontFamily:'var(--mono)'}}/>
                </div>
              </div>
              {!formAlu.id && (
                <div style={{marginTop:6, padding:'8px 12px', background:'var(--accent-glow)', borderRadius:'var(--radius-sm)', fontSize:11.5, color:'var(--ink-2)', lineHeight:1.6}}>
                  <Icon name="bank" size={13} color="currentColor"/> Al guardar, se generará automáticamente una CLABE SPEI individual para este alumno.
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarAlu} disabled={!formAlu.nombre}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}