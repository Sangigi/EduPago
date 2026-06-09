/* views/Clientes.jsx — con datos fiscales para pre-llenar facturación */
function Clientes({ data, setData }) {
  const { useState } = React;
  const EMPTY = {
    tipo:'alumno', nombre:'', grado:'', curp:'', email:'', tel:'',
    // Datos fiscales (para pre-llenar CFDI)
    rfc_factura:'', razon_social_factura:'', cp_factura:'',
    domicilio_factura:'', regimen_factura:'616', uso_cfdi_defecto:'D10'
  };
  const [modal, setModal] = useState(null); // null | 'form' | 'fiscal'
  const [form, setForm] = useState(EMPTY);
  const [formFiscal, setFormFiscal] = useState(null); // cliente al editar datos fiscales
  const [q, setQ] = useState('');

  const lista = data.clientes.filter(c =>
    !q || c.nombre.toLowerCase().includes(q.toLowerCase()) || c.email.toLowerCase().includes(q.toLowerCase())
  );

  const guardar = () => {
    if (!form.nombre || !form.email) return;
    let newData;
    if (form.id) {
      newData = ClienteController.editar(data, form);
    } else {
      newData = ClienteController.agregar(data, form);
    }
    setData(newData);
    AppModel.save(newData);
    setModal(null);
    setForm(EMPTY);
  };

  const guardarFiscal = () => {
    const newClientes = data.clientes.map(c =>
      c.id === formFiscal.id ? { ...c, ...formFiscal } : c
    );
    const newData = { ...data, clientes: newClientes };
    setData(newData);
    AppModel.save(newData);
    setModal(null);
    setFormFiscal(null);
  };

  const toggle = id => {
    const newData = ClienteController.toggleActivo(data, id);
    setData(newData);
    AppModel.save(newData);
  };

  const tieneDatosFiscales = c => !!(c.rfc_factura && c.razon_social_factura && c.cp_factura);

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Alumnos y familias</div>
            <div className="card-sub">{data.clientes.filter(c=>c.activo).length} activos de {data.clientes.length}</div>
          </div>
          <button className="btn btn-primary" onClick={()=>{setForm(EMPTY);setModal('form');}}>
            + Nuevo alumno
          </button>
        </div>

        <div style={{marginBottom:16}}>
          <div className="search-bar">
            <span className="search-icon"><Icon name="search" size={15} color="currentColor"/></span>
            <input placeholder="Buscar por nombre o correo…" value={q} onChange={e=>setQ(e.target.value)}/>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Nombre</th><th>Tipo</th><th>Grado</th><th>Correo</th><th>Teléfono</th><th>Datos fiscales</th><th>Saldo pendiente</th><th>Estado</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {lista.length === 0 && (
                <tr><td colSpan={9}><div className="empty-state"><div className="empty-icon"><Icon name="familias" size={36} color="currentColor"/></div><div className="empty-text">Sin clientes</div></div></td></tr>
              )}
              {lista.map(c=>(
                <tr key={c.id} style={{opacity:c.activo?1:.5}}>
                  <td>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <div className={`avatar ${c.tipo==='alumno'?'avatar-admin':'avatar-cajero'}`} style={{width:30,height:30,fontSize:11}}>
                        {c.nombre.charAt(0)}
                      </div>
                      <span style={{fontWeight:500}}>{c.nombre}</span>
                    </div>
                  </td>
                  <td><span className={`badge ${c.tipo==='alumno'?'badge-blue':'badge-purple'}`}>{c.tipo}</span></td>
                  <td style={{color:'var(--ink-3)',fontSize:12}}>{c.grado||'—'}</td>
                  <td style={{color:'var(--ink-3)',fontSize:12}}>{c.email}</td>
                  <td style={{fontFamily:'var(--mono)',fontSize:12}}>{c.tel||'—'}</td>
                  <td>
                    {tieneDatosFiscales(c)
                      ? <div>
                          <span className="badge badge-green" style={{fontSize:10}}><Icon name="check" size={11} color="currentColor"/> RFC registrado</span>
                          <div style={{fontSize:10,color:'var(--ink-4)',fontFamily:'var(--mono)',marginTop:2}}>{c.rfc_factura}</div>
                        </div>
                      : <span className="badge badge-gray" style={{fontSize:10}}>Sin datos</span>
                    }
                  </td>
                  <td>
                    {c.saldo_pendiente > 0
                      ? <span style={{color:'var(--red)',fontFamily:'var(--mono)',fontWeight:600,fontSize:13}}>{fmt(c.saldo_pendiente)}</span>
                      : <span style={{color:'var(--green)',fontSize:12}}><Icon name="check" size={11} color="currentColor"/> Al corriente</span>}
                  </td>
                  <td>{c.activo ? <span className="badge badge-green">Activo</span> : <span className="badge badge-gray">Inactivo</span>}</td>
                  <td>
                    <div style={{display:'flex',gap:5}}>
                      <button className="btn btn-ghost btn-sm" title="Editar datos generales" onClick={()=>{setForm({...c});setModal('form');}} style={{display:'flex',alignItems:'center',justifyContent:'center'}}><Icon name="edit" size={14} color="currentColor"/></button>
                      <button className="btn btn-ghost btn-sm" title="Datos fiscales para CFDI"
                        style={{color: tieneDatosFiscales(c) ? 'var(--green)' : 'var(--amber)'}}
                        onClick={()=>{
                          setFormFiscal({
                            id: c.id,
                            rfc_factura: c.rfc_factura||'',
                            razon_social_factura: c.razon_social_factura||'',
                            cp_factura: c.cp_factura||'',
                            domicilio_factura: c.domicilio_factura||'',
                            regimen_factura: c.regimen_factura||'616',
                            uso_cfdi_defecto: c.uso_cfdi_defecto||'D10',
                            email: c.email,
                            nombre: c.nombre,
                          });
                          setModal('fiscal');
                        }}><Icon name="cobros" size={14} color="currentColor"/></button>
                      <button className="btn btn-ghost btn-sm" onClick={()=>toggle(c.id)}>{c.activo ? <Icon name="shield" size={14} color="currentColor"/> : <Icon name="eyeOff" size={14} color="currentColor"/>}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal: Datos generales ── */}
      {modal==='form' && (
        <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{form.id ? 'Editar' : 'Nuevo'} alumno/familia</div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setModal(null)}><Icon name="close" size={16} color="currentColor"/></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Tipo</label>
                <select className="form-select" value={form.tipo} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))}>
                  <option value="alumno">Alumno</option>
                  <option value="familia">Familia</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Nombre completo *</label>
                <input className="form-input" placeholder="Nombre completo" value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div className="form-group">
                  <label className="form-label">Grado</label>
                  <input className="form-input" placeholder="3° Primaria" value={form.grado} onChange={e=>setForm(f=>({...f,grado:e.target.value}))}/>
                </div>
                <div className="form-group">
                  <label className="form-label">CURP</label>
                  <input className="form-input" placeholder="CURP" value={form.curp} onChange={e=>setForm(f=>({...f,curp:e.target.value.toUpperCase()}))} style={{fontFamily:'var(--mono)'}}/>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Correo electrónico *</label>
                <input className="form-input" type="email" placeholder="correo@mail.com" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/>
              </div>
              <div className="form-group">
                <label className="form-label">Teléfono</label>
                <input className="form-input" placeholder="5512345678" value={form.tel} onChange={e=>setForm(f=>({...f,tel:e.target.value}))} style={{fontFamily:'var(--mono)'}}/>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={!form.nombre||!form.email}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Datos Fiscales ── */}
      {modal==='fiscal' && formFiscal && (
        <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <div>
                <div className="modal-title" style={{display:'flex',alignItems:'center',gap:8}}><Icon name="facturacion2" size={17} color="currentColor"/> Datos fiscales para CFDI</div>
                <div style={{fontSize:12, color:'var(--ink-3)', marginTop:2}}>
                  {formFiscal.nombre} — Se pre-llenarán automáticamente al generar facturas
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={()=>setModal(null)}><Icon name="close" size={16} color="currentColor"/></button>
            </div>
            <div className="modal-body">
              {/* Aviso informativo */}
              <div style={{
                marginBottom:16, padding:'10px 14px',
                background:'var(--accent-glow)', border:'1px solid var(--border-active)',
                borderRadius:'var(--radius-sm)', fontSize:12, color:'var(--ink-2)', lineHeight:1.6
              }}>
                Al guardar estos datos, el formulario de facturación los pre-llenará automáticamente
                cuando generes un CFDI para este cliente. El cajero solo tendrá que confirmar o corregir.
              </div>

              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
                <div className="form-group">
                  <label className="form-label">RFC del receptor *</label>
                  <input className="form-input" placeholder="XAXX010101000"
                    value={formFiscal.rfc_factura}
                    onChange={e=>setFormFiscal(f=>({...f, rfc_factura: e.target.value.toUpperCase().replace(/\s/g,'')}))}
                    style={{fontFamily:'var(--mono)', letterSpacing:1}}/>
                  <div style={{fontSize:10.5, color:'var(--ink-4)', marginTop:3}}>
                    Público en general: XAXX010101000
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Código Postal fiscal *</label>
                  <input className="form-input" placeholder="Ej. 97000"
                    value={formFiscal.cp_factura}
                    onChange={e=>setFormFiscal(f=>({...f, cp_factura: e.target.value}))}
                    style={{fontFamily:'var(--mono)'}}/>
                </div>
                <div className="form-group" style={{gridColumn:'1/-1'}}>
                  <label className="form-label">Razón social *</label>
                  <input className="form-input" placeholder="NOMBRE COMPLETO O RAZÓN SOCIAL EN MAYÚSCULAS"
                    value={formFiscal.razon_social_factura}
                    onChange={e=>setFormFiscal(f=>({...f, razon_social_factura: e.target.value.toUpperCase()}))}/>
                </div>
                <div className="form-group" style={{gridColumn:'1/-1'}}>
                  <label className="form-label">Domicilio fiscal completo</label>
                  <input className="form-input" placeholder="Calle, Número, Colonia, Ciudad, Estado, CP"
                    value={formFiscal.domicilio_factura}
                    onChange={e=>setFormFiscal(f=>({...f, domicilio_factura: e.target.value}))}/>
                  <div style={{fontSize:10.5, color:'var(--ink-4)', marginTop:3}}>
                    Opcional — para impresión en comprobante. Ej: Av. Reforma #100, Col. Centro, CDMX, 06600
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Régimen fiscal</label>
                  <select className="form-select" value={formFiscal.regimen_factura}
                    onChange={e=>setFormFiscal(f=>({...f, regimen_factura: e.target.value}))}>
                    <option value="616">616 — Sin obligaciones fiscales (personas físicas)</option>
                    <option value="601">601 — General Personas Morales</option>
                    <option value="612">612 — Personas Físicas con Actividades Empresariales</option>
                    <option value="626">626 — RESICO</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Uso del CFDI por defecto</label>
                  <select className="form-select" value={formFiscal.uso_cfdi_defecto}
                    onChange={e=>setFormFiscal(f=>({...f, uso_cfdi_defecto: e.target.value}))}>
                    <option value="D10">D10 — Servicios educativos (recomendado)</option>
                    <option value="G01">G01 — Adquisición de mercancias</option>
                    <option value="G03">G03 — Gastos en general</option>
                    <option value="D01">D01 — Honorarios médicos</option>
                    <option value="S01">S01 — Sin efectos fiscales</option>
                  </select>
                </div>
                <div className="form-group" style={{gridColumn:'1/-1'}}>
                  <label className="form-label">Correo para envío de CFDI</label>
                  <input className="form-input" type="email" placeholder="padre@mail.com"
                    value={formFiscal.email}
                    onChange={e=>setFormFiscal(f=>({...f, email: e.target.value}))}/>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarFiscal}
                disabled={!formFiscal.rfc_factura || !formFiscal.razon_social_factura || !formFiscal.cp_factura}>
                Guardar datos fiscales
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}